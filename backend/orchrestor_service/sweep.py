"""
orchrestor_service/sweep.py

Safety net for when notify_orchestrator() exhausts all its retries and
gives up (e.g. the orchestrator was unreachable/down for that whole
window). In that case, completed_jobs is already correct in Mongo
(written atomically in orchestrator_client.record_service_result), but
nothing ever told the orchestrator to check this domain.

This sweep finds any domain_progress doc that's finished (by its own
counters) but still marked "in_progress", and runs it through the exact
same completion path /job-done uses -- so scoring/finalization logic
lives in one place.

Run this on a schedule (e.g. RQ scheduled job or cron, every 1-2 minutes):

    from orchrestor_service.sweep import sweep_stalled_domains
    sweep_stalled_domains()
"""

import datetime
from shared.database import get_db
from orchrestor_service.app import check_domain_completion

# Only sweep domains that have been sitting untouched for a bit, so we
# don't race with a scan that's still actively in flight and about to
# get its own /job-done ping any second now.
STALE_AFTER_SECONDS = 60


def sweep_stalled_domains():
    db = get_db()
    domain_progress_collection = db['domain_progress']

    cutoff = datetime.datetime.utcnow() - datetime.timedelta(seconds=STALE_AFTER_SECONDS)

    stalled = domain_progress_collection.find({
        "status": "in_progress",
        "last_updated": {"$lt": cutoff},
        "$expr": {"$gte": ["$completed_jobs", "$total_jobs"]},
    })

    count = 0
    for doc in stalled:
        print(
            f"[sweep_stalled_domains] recovering scan_id={doc['scan_id']!r} "
            f"domain={doc['domain']!r} (completed_jobs={doc['completed_jobs']}, "
            f"total_jobs={doc['total_jobs']})"
        )
        check_domain_completion(doc['scan_id'], doc['domain'])
        count += 1

    if count:
        print(f"[sweep_stalled_domains] recovered {count} stalled domain(s)")
    return count