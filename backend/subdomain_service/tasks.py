import subprocess
import shutil
import uuid
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Providers commonly associated with dangling-CNAME subdomain takeover risk
TAKEOVER_FINGERPRINTS = [
    "github.io", "herokuapp.com", "s3.amazonaws.com", "s3-website",
    "azurewebsites.net", "cloudfront.net", "myshopify.com",
    "wordpress.com", "ghost.io", "surge.sh", "netlify.app",
    "fastly.net", "pantheonsite.io", "cargocollective.com",
    "zendesk.com", "helpjuice.com", "readme.io",
]

MAX_CNAME_CHECKS = 50  # cap per-subdomain DNS lookups to bound scan time


def _dig(record_type, hostname, timeout=3):
    """Minimal dig wrapper — returns first line of output, or None"""
    try:
        result = subprocess.run(
            ["dig", "+short", record_type, hostname],
            capture_output=True, text=True, timeout=timeout
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().split('\n')[0].rstrip('.')
    except Exception:
        pass
    return None


def check_wildcard_dns(domain):
    """
    Query a random, almost-certainly-nonexistent subdomain. If it still
    resolves, the domain has wildcard DNS enabled (catch-all A record).
    """
    probe = f"nonexistent-{uuid.uuid4().hex[:12]}.{domain}"
    return _dig("A", probe) is not None


def check_dangling_cnames(subdomains):
    """
    For a capped subset of discovered subdomains, resolve their CNAME.
    If it points to a known third-party provider AND that target itself
    doesn't resolve, flag it as a likely subdomain-takeover risk.
    """
    dangling = []
    subset = subdomains[:MAX_CNAME_CHECKS]

    def _check_one(sub):
        cname = _dig("CNAME", sub)
        if not cname:
            return None

        if any(fp in cname.lower() for fp in TAKEOVER_FINGERPRINTS):
            target_resolves = _dig("A", cname) is not None
            if not target_resolves:
                return {"subdomain": sub, "cname": cname}
        return None

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(_check_one, sub) for sub in subset]
        for future in as_completed(futures):
            result = future.result()
            if result:
                dangling.append(result)

    return dangling


def process_subdomain_scan(domain, scan_id):
    db = get_db()
    scans_collection = db['scans']
    scans_collection.update_one(
        {"scan_id": scan_id},
        {"$set": {"status": "processing", "started_at": datetime.datetime.utcnow()}}
    )
    publish_scan_update(domain, "subdomain", "processing")

    if not shutil.which("subfinder"):
        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {"status": "failed", "error": "subfinder not installed", "completed_at": datetime.datetime.utcnow()}}
        )
        publish_scan_update(domain, "subdomain", "failed", error="subfinder not installed")
        return

    try:
        result = subprocess.run(
            ["subfinder", "-d", domain, "-silent", "-all", "-max-time", "8"],
            capture_output=True,
            text=True,
            timeout=540  # 9 mins — requires job_timeout >= 10m at enqueue time
        )

        subdomains = list(set([line.strip() for line in result.stdout.split('\n') if line.strip()]))
        subdomains.sort()

        wildcard_dns = check_wildcard_dns(domain)
        dangling_cnames = check_dangling_cnames(subdomains) if subdomains else []

        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {
                "status": "completed",
                "completed_at": datetime.datetime.utcnow(),
                "results": {
                    "subdomains": subdomains,
                    "count": len(subdomains),
                    "wildcard_dns": wildcard_dns,
                    "dangling_cnames": dangling_cnames,
                    "note": "Scan limited to 8 minutes for performance; CNAME takeover check capped at first 50 subdomains"
                },
                "service": "subdomain"
            }}
        )
        publish_scan_update(domain, "subdomain", "completed", results={"count": len(subdomains)})
        return subdomains
    except Exception as e:
        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {"status": "failed", "error": str(e), "completed_at": datetime.datetime.utcnow()}}
        )
        publish_scan_update(domain, "subdomain", "failed", error=str(e))
        raise e