import subprocess
import shutil
import xml.etree.ElementTree as ET
import tempfile
import os
import re
import requests
import json
import threading
import time
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.orchestrator_client import record_service_result
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Global lock so concurrent fingerprint lookups don't blow past NVD's
# ~5-requests-per-30-seconds limit — without this, ThreadPoolExecutor's
# 5 workers could each fire an NVD request near-simultaneously before
# any of them hit their own sleep().
_nvd_lock = threading.Lock()


def detect_cdn_or_proxy(domain, scan_id, db):
    """Check if domain is behind CDN/proxy by checking DNS and SSL data.
    Reads from domain_progress (this scan's own results.dns / results.ssl)
    rather than the old shared `scans` collection, since dns_service and
    ssl_service now write their results there via record_service_result()."""
    domain_doc = db['domain_progress'].find_one({"scan_id": scan_id, "domain": domain})
    dns_results = (domain_doc or {}).get('results', {}).get('dns')
    ssl_results = (domain_doc or {}).get('results', {}).get('ssl')

    cdn_indicators = {
        'cloudflare': False,
        'cloudfront': False,
        'fastly': False,
        'akamai': False,
        'cdn': False
    }

    if dns_results:
        cname_records = dns_results.get('CNAME', [])
        for cname in cname_records:
            cname_lower = cname.lower()
            if 'cloudflare' in cname_lower:
                cdn_indicators['cloudflare'] = True
            elif 'cloudfront' in cname_lower:
                cdn_indicators['cloudfront'] = True
            elif 'fastly' in cname_lower:
                cdn_indicators['fastly'] = True
            elif 'akamai' in cname_lower:
                cdn_indicators['akamai'] = True
            elif 'cdn' in cname_lower:
                cdn_indicators['cdn'] = True

    if ssl_results:
        cert = ssl_results.get('certificate', {})
        issuer = cert.get('issuer', '').lower()
        if 'cloudflare' in issuer:
            cdn_indicators['cloudflare'] = True

    behind_cdn = any(cdn_indicators.values())
    cdn_name = None
    if cdn_indicators['cloudflare']:
        cdn_name = 'Cloudflare'
    elif cdn_indicators['cloudfront']:
        cdn_name = 'AWS CloudFront'
    elif cdn_indicators['fastly']:
        cdn_name = 'Fastly'
    elif cdn_indicators['akamai']:
        cdn_name = 'Akamai'
    elif cdn_indicators['cdn']:
        cdn_name = 'CDN'

    return behind_cdn, cdn_name


def extract_version_info(ports_data):
    """Extract product and version information from port scan"""
    version_fingerprints = []

    for port in ports_data:
        product = port.get('product', 'unknown')
        version = port.get('version', '')
        service_name = port.get('service', 'unknown')

        if product != 'unknown' and version and version != 'unknown':
            version_fingerprints.append({
                'port': port.get('port'),
                'product': product,
                'service': service_name if service_name != 'unknown' else product,
                'version': version,
                'confidence': 'high'
            })
        elif product != 'unknown' and (not version or version == 'unknown'):
            version_fingerprints.append({
                'port': port.get('port'),
                'product': product,
                'service': service_name if service_name != 'unknown' else product,
                'version': None,
                'confidence': 'low'
            })

    return version_fingerprints


def query_nvd_cve(product, version=None):
    """Query National Vulnerability Database for CVEs"""
    cves = []

    try:
        if version and version != 'unknown':
            query = f"{product} {version}"
        else:
            query = product

        encoded_query = requests.utils.quote(query)
        url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch={encoded_query}&resultsPerPage=20"

        # Serialize NVD calls across threads to actually respect its rate limit
        with _nvd_lock:
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                vulnerabilities = data.get('vulnerabilities', [])

                for vuln in vulnerabilities:
                    cve_data = vuln.get('cve', {})
                    cve_id = cve_data.get('id')
                    descriptions = cve_data.get('descriptions', [])
                    description = next((d['value'] for d in descriptions if d['lang'] == 'en'), 'No description available')

                    metrics = cve_data.get('metrics', {})
                    cvss_score = None
                    cvss_severity = None

                    if 'cvssMetricV31' in metrics and metrics['cvssMetricV31']:
                        cvss_score = metrics['cvssMetricV31'][0].get('cvssData', {}).get('baseScore')
                        cvss_severity = metrics['cvssMetricV31'][0].get('cvssData', {}).get('baseSeverity')
                    elif 'cvssMetricV30' in metrics and metrics['cvssMetricV30']:
                        cvss_score = metrics['cvssMetricV30'][0].get('cvssData', {}).get('baseScore')
                        cvss_severity = metrics['cvssMetricV30'][0].get('cvssData', {}).get('baseSeverity')
                    elif 'cvssMetricV2' in metrics and metrics['cvssMetricV2']:
                        cvss_score = metrics['cvssMetricV2'][0].get('cvssData', {}).get('baseScore')
                        cvss_severity = metrics['cvssMetricV2'][0].get('severity')

                    published_date = cve_data.get('published', '')
                    references = cve_data.get('references', [])
                    reference_urls = [ref.get('url') for ref in references[:3]]

                    cves.append({
                        'id': cve_id,
                        'description': description,
                        'cvss_score': cvss_score,
                        'severity': cvss_severity or ('CRITICAL' if cvss_score and cvss_score >= 9.0 else 'HIGH' if cvss_score and cvss_score >= 7.0 else 'MEDIUM' if cvss_score and cvss_score >= 4.0 else 'LOW'),
                        'published_date': published_date,
                        'references': reference_urls,
                        'matched_product': product,
                        'matched_version': version
                    })

            # Rate limiting - NVD allows ~5 requests per 30 seconds without API key.
            # Held inside the lock so the next thread waiting on _nvd_lock
            # actually respects this spacing instead of racing ahead.
            time.sleep(6)

    except Exception as e:
        print(f"Error querying NVD for {product}: {e}")

    return cves


def query_osv_cve(product, version=None):
    """Query OSV (Open Source Vulnerabilities) database for CVEs"""
    cves = []

    try:
        ecosystem_map = {
            'nginx': 'Debian',
            'apache': 'Debian',
            'openssl': 'Debian',
            'python': 'PyPI',
            'node': 'npm',
            'nodejs': 'npm',
            'go': 'Go',
            'golang': 'Go',
            'ruby': 'RubyGems',
            'php': 'Packagist',
            'mysql': 'Debian',
            'postgresql': 'Debian',
            'mongodb': 'Debian',
            'redis': 'Debian',
            'docker': 'Go',
            'kubernetes': 'Go',
            'jenkins': 'Maven'
        }

        ecosystem = ecosystem_map.get(product.lower(), 'Debian')
        package_name = product.lower()

        url = "https://api.osv.dev/v1/query"

        if version and version != 'unknown':
            payload = {
                "package": {"name": package_name, "ecosystem": ecosystem},
                "version": version
            }
        else:
            payload = {"package": {"name": package_name, "ecosystem": ecosystem}}

        response = requests.post(url, json=payload, timeout=10)

        if response.status_code == 200:
            data = response.json()
            vulns = data.get('vulns', [])

            for vuln in vulns:
                cve_id = vuln.get('id')
                summary = vuln.get('summary', 'No description available')
                details = vuln.get('details', '')
                published_date = vuln.get('published', '')

                severity = None
                severity_score = None
                if 'severity' in vuln:
                    for sev in vuln.get('severity', []):
                        if sev.get('type') == 'CVSS_V3':
                            severity_score = sev.get('score')
                            severity = 'CRITICAL' if severity_score >= 9.0 else 'HIGH' if severity_score >= 7.0 else 'MEDIUM' if severity_score >= 4.0 else 'LOW'
                            break

                affected_versions = []
                for affected in vuln.get('affected', []):
                    versions = affected.get('versions', [])
                    affected_versions.extend(versions)

                cves.append({
                    'id': cve_id,
                    'description': summary or details[:500],
                    'cvss_score': severity_score,
                    'severity': severity or 'UNKNOWN',
                    'published_date': published_date,
                    'references': [f"https://osv.dev/{cve_id}"],
                    'matched_product': product,
                    'matched_version': version,
                    'affected_versions': affected_versions[:5]
                })

    except Exception as e:
        print(f"Error querying OSV for {product}: {e}")

    return cves


def query_github_advisory(product, version=None):
    """
    Query GitHub Advisory Database for CVEs affecting a specific product.
    Uses the `affects` query param so results are actually filtered by
    product name server-side, instead of pulling a generic recent-advisories
    list and hoping the product happens to appear in it.
    """
    cves = []

    try:
        headers = {'Accept': 'application/vnd.github.v3+json'}
        params = {
            'per_page': 10,
            'affects': product,
        }
        url = "https://api.github.com/advisories"

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if response.status_code == 200:
            advisories = response.json()

            for advisory in advisories:
                summary = advisory.get('summary', '')
                description = advisory.get('description', '')
                cve_id = advisory.get('cve_id')
                ghsa_id = advisory.get('ghsa_id')
                severity = advisory.get('severity')
                published_date = advisory.get('published_at', '')

                if cve_id:
                    cves.append({
                        'id': cve_id,
                        'ghsa_id': ghsa_id,
                        'description': summary or description[:500],
                        'cvss_score': None,
                        'severity': severity.upper() if severity else 'UNKNOWN',
                        'published_date': published_date,
                        'references': [f"https://github.com/advisories/{ghsa_id}"],
                        'matched_product': product,
                        'matched_version': version
                    })

    except Exception as e:
        print(f"Error querying GitHub Advisory for {product}: {e}")

    return cves


def perform_cve_lookup(version_fingerprint):
    """Perform CVE lookup for a single fingerprint using multiple sources"""
    product = version_fingerprint['product']
    version = version_fingerprint.get('version')
    port = version_fingerprint.get('port')

    all_cves = []

    try:
        nvd_cves = query_nvd_cve(product, version)
        all_cves.extend(nvd_cves)

        osv_cves = query_osv_cve(product, version)
        all_cves.extend(osv_cves)

        gh_cves = query_github_advisory(product, version)
        all_cves.extend(gh_cves)

    except Exception as e:
        print(f"Error in CVE lookup for {product}: {e}")

    unique_cves = {}
    for cve in all_cves:
        cve_id = cve['id']
        if cve_id not in unique_cves:
            unique_cves[cve_id] = cve
        else:
            existing = unique_cves[cve_id]
            if not existing.get('cvss_score') and cve.get('cvss_score'):
                existing['cvss_score'] = cve['cvss_score']
            if not existing.get('severity') and cve.get('severity'):
                existing['severity'] = cve['severity']

    return {
        'port': port,
        'product': product,
        'version': version,
        'cves': list(unique_cves.values())
    }


def process_cve_scan(domain, scan_id):
    db = get_db()
    publish_scan_update(domain, "cve", "processing")

    if not shutil.which("nmap"):
        record_service_result(scan_id, domain, "cve", status="failed", error="nmap not found")
        publish_scan_update(domain, "cve", "failed", error="nmap not found")
        return

    try:
        results = {
            'scan_applicable': True,
            'skip_reason': None,
            'cdn_detected': False,
            'cdn_name': None,
            'version_fingerprints': [],
            'cve_scan': [],
            'total_vulnerabilities': 0,
            'vulnerability_summary': {
                'CRITICAL': 0,
                'HIGH': 0,
                'MEDIUM': 0,
                'LOW': 0
            }
        }

        behind_cdn, cdn_name = detect_cdn_or_proxy(domain, scan_id, db)
        if behind_cdn:
            results['cdn_detected'] = True
            results['cdn_name'] = cdn_name
            results['skip_reason'] = f'WARNING: Target appears behind {cdn_name} proxy. Results may be incomplete.'

        with tempfile.NamedTemporaryFile(suffix='.xml', delete=False) as tmp_file:
            xml_path = tmp_file.name

        command = [
            "nmap", "-Pn", "-sV", "--version-intensity", "7",
            "-p", "21,22,23,25,53,80,110,111,135,139,143,443,445,993,995,1723,3306,3389,5432,5900,6379,8080,8443,27017",
            "-oX", xml_path, domain
        ]

        subprocess.run(
            command,
            capture_output=True,
            timeout=600
        )

        ports_scanned = []
        if os.path.exists(xml_path):
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()

                for host in root.findall('host'):
                    for ports in host.findall('ports'):
                        for port in ports.findall('port'):
                            port_id = port.get('portid')
                            port_state = port.find('state')
                            state = port_state.get('state') if port_state is not None else "unknown"
                            service = port.find('service')
                            product = service.get('product') if service is not None else "unknown"
                            version = service.get('version') if service is not None else ""
                            service_name = service.get('name') if service is not None else "unknown"

                            if state == 'open':
                                ports_scanned.append({
                                    "port": port_id,
                                    "state": state,
                                    "service": service_name,
                                    "product": product,
                                    "version": version
                                })

            except ET.ParseError as e:
                print(f"Error parsing XML: {e}")
            finally:
                if os.path.exists(xml_path):
                    os.remove(xml_path)

        version_fingerprints = extract_version_info(ports_scanned)
        results['version_fingerprints'] = version_fingerprints
        results['ports_scanned'] = ports_scanned

        if version_fingerprints:
            cve_results = []
            with ThreadPoolExecutor(max_workers=5) as executor:
                future_to_fingerprint = {
                    executor.submit(perform_cve_lookup, fingerprint): fingerprint
                    for fingerprint in version_fingerprints
                }

                for future in as_completed(future_to_fingerprint):
                    try:
                        result = future.result()
                        if result['cves']:
                            cve_results.append(result)
                    except Exception as e:
                        print(f"Error processing fingerprint: {e}")

            all_cves = []
            total_critical = 0
            total_high = 0
            total_medium = 0
            total_low = 0

            for cve_result in cve_results:
                for cve in cve_result['cves']:
                    all_cves.append(cve)
                    severity = cve.get('severity', 'UNKNOWN')
                    if severity == 'CRITICAL':
                        total_critical += 1
                    elif severity == 'HIGH':
                        total_high += 1
                    elif severity == 'MEDIUM':
                        total_medium += 1
                    elif severity == 'LOW':
                        total_low += 1

            results['cve_scan'] = all_cves
            results['total_vulnerabilities'] = len(all_cves)
            results['vulnerability_summary'] = {
                'CRITICAL': total_critical,
                'HIGH': total_high,
                'MEDIUM': total_medium,
                'LOW': total_low
            }

            results['scan_applicable'] = True
            if behind_cdn:
                results['skip_reason'] = f'Scan completed but target is behind {cdn_name} proxy. Results may not show the origin server completely.'
        else:
            results['scan_applicable'] = False
            if behind_cdn:
                results['skip_reason'] = f'Target is behind {cdn_name} proxy. No version fingerprints detected. Unable to perform CVE correlation.'
            else:
                results['skip_reason'] = 'No service version fingerprints detected. Ensure target has open ports with identifiable services.'

            results['cve_scan'] = []
            results['total_vulnerabilities'] = 0  # was "Not Detected" string — now always an int

        record_service_result(scan_id, domain, "cve", status="completed", results=results)
        publish_scan_update(domain, "cve", "completed", results=results)
        return results

    except subprocess.TimeoutExpired:
        error_msg = "Nmap scan timed out after 10 minutes"
        record_service_result(scan_id, domain, "cve", status="failed", error=error_msg)
        publish_scan_update(domain, "cve", "failed", error=error_msg)

    except Exception as e:
        record_service_result(scan_id, domain, "cve", status="failed", error=str(e))
        publish_scan_update(domain, "cve", "failed", error=str(e))
        raise e