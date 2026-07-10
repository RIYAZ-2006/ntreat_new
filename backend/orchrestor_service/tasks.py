import time
import datetime
from shared.database import get_db
from shared.redis import get_queue
from subdomain_service.tasks import process_subdomain_scan
from workers.queue_client import enqueue_to_all_services

SUBDOMAIN_POLL_INTERVAL = 2
SUBDOMAIN_MAX_WAIT = 600


def process_orchestration(domain, scan_id):
    db = get_db()
    scans_collection = db['scans']
    domain_progress_collection = db['domain_progress']

    try:
        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {"status": "scanning_subdomains", "started_at": datetime.datetime.utcnow()}}
        )

        subdomain_queue = get_queue('subdomain_queue')
        subdomain_queue.enqueue(process_subdomain_scan, args=(domain, scan_id), job_timeout='10m')

        subdomains = []
        waited = 0
        subdomain_status = None

        while waited < SUBDOMAIN_MAX_WAIT:
            subdomain_doc = scans_collection.find_one({"scan_id": scan_id, "service": "subdomain"})
            if subdomain_doc:
                subdomain_status = subdomain_doc.get("status")
                if subdomain_status in ("completed", "failed"):
                    if subdomain_status == "completed":
                        subdomains = subdomain_doc.get("results", {}).get("subdomains", [])
                    break
            time.sleep(SUBDOMAIN_POLL_INTERVAL)
            waited += SUBDOMAIN_POLL_INTERVAL

        if subdomain_status not in ("completed", "failed"):
            scans_collection.update_one(
                {"scan_id": scan_id},
                {"$set": {"subdomain_warning": "Subdomain scan timed out, proceeding with root domain only"}}
            )

        all_domains = list(set([domain] + subdomains))
        total_jobs = len(all_domains) * 7

        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {
                "status": "in_progress",
                "domains": all_domains,
                "total_jobs": total_jobs,
                "completed_jobs": 0,
                "fanout_started_at": datetime.datetime.utcnow()
            }}
        )

        # Create a per-domain progress doc, then fan out that domain's 7 jobs
        all_job_ids = {}
        for d in all_domains:
            domain_progress_collection.insert_one({
                "scan_id": scan_id,
                "domain": d,
                "completed_jobs": 0,
                "total_jobs": 7,
                "status": "in_progress"
            })
            job_ids = enqueue_to_all_services(d, scan_id)
            all_job_ids[d] = job_ids

        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {"job_ids": all_job_ids}}
        )

        return {"domains": all_domains, "total_jobs": total_jobs}

    except Exception as e:
        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {"status": "failed", "error": str(e), "completed_at": datetime.datetime.utcnow()}}
        )
        raise e