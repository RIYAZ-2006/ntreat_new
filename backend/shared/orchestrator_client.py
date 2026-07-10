"""
shared/orchestrator_client.py

Single source of truth for reporting a scan job's outcome. Every scan
service (dns, ip, ssl, webtech, cve, subdirectory, http_security) MUST
call record_service_result() here -- never keep a local copy -- so the
Mongo write pattern, retry behavior, and status/error reporting can
never silently drift between services.

Results are written directly to MongoDB by the caller (never sent over
HTTP), keeping the /job-done callback to the orchestrator small and
fixed-size regardless of how large an individual service's results are.
"""

import datetime
import requests
from shared.config import Config
from shared.database import get_db

RETRY_ATTEMPTS = 3
NOTIFY_TIMEOUT = 5  # seconds per attempt


def record_service_result(scan_id, domain, service, status, results=None, error=None):
    """
    The single call every scanner service should make on both its success
    and failure paths. Does two things, in order:

    1. Writes this service's own result/status/error directly into Mongo,
       scoped to domain_progress.services.<service> / results.<service> --
       a dotted-path $set, so concurrent scanners for the same domain can
       never overwrite each other's writes (the bug that was happening
       when every scanner wrote to the shared `scans` document instead).
       This same write ALSO atomically increments completed_jobs, guarded
       by an idempotency check -- completed_jobs must live here, next to
       the data that proves the job is actually done, not solely behind a
       separate HTTP hop that can fail independently of this write.
    2. Calls notify_orchestrator() -- a small, fixed-size HTTP ping, no
       results payload -- so /job-done can check whether this domain's
       scan is finished and kick off scoring. Results never travel over
       HTTP; only the coordination signal does. If this ping fails after
       all retries, completed_jobs is still correct in Mongo -- a sweep
       job (see workers/sweep_stalled_domains.py) catches anything that
       never got its /job-done ping through.

    Args:
        scan_id: The scan's UUID.
        domain: The domain this job scanned (root or subdomain).
        service: One of "dns", "ip", "ssl", "webtech", "cve",
                 "subdirectory", "http_security".
        status: "completed" or "failed".
        results: The scan results dict (only meaningful when status ==
                 "completed"; ignored/omitted otherwise).
        error: Error message if status == "failed", else None.
    """
    db = get_db()
    domain_progress_collection = db['domain_progress']

    # Idempotency guard: if this service already reported a terminal
    # status for this domain/scan, don't increment completed_jobs again.
    # Covers retried calls -- e.g. a worker crashing/retrying after the
    # Mongo write already succeeded but before it got a response back.
    existing = domain_progress_collection.find_one(
        {"scan_id": scan_id, "domain": domain},
        {f"services.{service}.status": 1}
    )
    already_terminal = (
        existing is not None
        and existing.get("services", {}).get(service, {}).get("status") in ("completed", "failed")
    )

    update_fields = {
        f"services.{service}.status": status,
        f"services.{service}.error": str(error) if error else None,
        "last_updated": datetime.datetime.utcnow(),
    }
    if status == "completed":
        update_fields[f"results.{service}"] = results

    update_op = {"$set": update_fields}
    if not already_terminal:
        update_op["$inc"] = {"completed_jobs": 1}

    domain_progress_collection.update_one(
        {"scan_id": scan_id, "domain": domain},
        update_op
    )

    notify_orchestrator(scan_id, domain, service, status=status)


def notify_orchestrator(scan_id, domain, service, status="completed"):
    """
    Ping the orchestrator that this (scan_id, domain, service) job is done.
    Deliberately carries NO results payload -- just enough to let /job-done
    increment its counter and check for scan completion. Called by
    record_service_result() above; scanners shouldn't need to call this
    directly.
    """
    payload = {
        "scan_id": scan_id,
        "domain": domain,
        "service": service,
        "status": status,
    }

    url = f"{Config.ORCHRESTATOR_SERVICE_URL}/job-done"

    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            resp = requests.post(url, json=payload, timeout=NOTIFY_TIMEOUT)
            resp.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            print(
                f"[notify_orchestrator] attempt {attempt}/{RETRY_ATTEMPTS} "
                f"failed for {domain}/{service} (scan_id={scan_id}): {e}"
            )

    print(f"[notify_orchestrator] GIVING UP on {domain}/{service} scan_id={scan_id}")
    return False