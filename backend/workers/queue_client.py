from shared.redis import get_queue
from dns_service.tasks import process_dns_scan
from ip_service.tasks import process_ip_scan
from ssl_service.tasks import process_ssl_scan
from webtech_service.tasks import process_webtech_scan
from cve_service.tasks import process_cve_scan
from subdirectory_service.tasks import process_subdirectory_scan
from http_security_service.tasks import process_http_security_scan


# Matches queue names listened to in fast_worker.py / slow_worker.py exactly
SERVICE_TASK_MAP = {
    "dns_queue": (process_dns_scan, "3m"),
    "ip_queue": (process_ip_scan, "3m"),
    "ssl_queue": (process_ssl_scan, "5m"),
    "webtech_queue": (process_webtech_scan, "5m"),
    "cve_queue": (process_cve_scan, "30m"),
    "subdirectory_queue": (process_subdirectory_scan, "30m"),
    "httpsec_queue": (process_http_security_scan, "30m"),  # matches slow_worker.py spelling
}


def enqueue_to_all_services(domain, scan_id):
    """
    Enqueue one job per downstream service (the 7 scanners, NOT subdomain —
    subdomain is handled separately via queue+poll in orchestrator/tasks.py
    before this function is called).
    Returns {queue_name: job_id} for tracking.
    """
    job_ids = {}
    for queue_name, (task_func, timeout) in SERVICE_TASK_MAP.items():
        q = get_queue(queue_name)
        job = q.enqueue(task_func, args=(domain, scan_id), job_timeout=timeout)
        job_ids[queue_name] = job.id
    return job_ids