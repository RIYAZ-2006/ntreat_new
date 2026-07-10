import sys
import os
import datetime
import json

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request, Response, stream_with_context
from shared.config import Config
from shared.database import get_db
from shared.redis import get_redis_connection
from scoring_service.logic import calculate_domain_score

app = Flask(__name__)
redis_conn = get_redis_connection()
# app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY

# Per-domain scanner services now tracked in domain_progress (see
# shared/orchestrator_client.py + orchestrator_service). "subdomain" is
# intentionally NOT in this list -- it's a scan-level (not per-domain) step
# still tracked on the root `scans` document by subdomain_service, since it
# runs once per scan_id before the fan-out, not once per domain.
FAST_SERVICES = ['dns', 'ip', 'ssl', 'webtech']
SLOW_SERVICES = ['subdirectory', 'cve', 'http_security']
ALL_SERVICES = FAST_SERVICES + SLOW_SERVICES


def _get_latest_domain_progress(db, domain):
    """Latest domain_progress doc for this domain, across any scan_id."""
    return db['domain_progress'].find_one(
        {"domain": domain},
        sort=[("created_at", -1)]
    )


@app.route('/health')
def health():
    return jsonify({"status": "healthy", "service": "scoring"})

@app.route('/domain-name', methods=['POST'])
def set_domain_name():
    """Store a friendly display name on all scan documents for this domain"""
    data = request.get_json()
    domain = data.get('domain')
    domain_name = data.get('domain_name', '').strip()

    if not domain:
        return jsonify({"error": "Domain is required"}), 400

    db = get_db()
    db['scans'].update_many(
        {"domain": domain},
        {"$set": {"domain_name": domain_name if domain_name else None}}
    )

    return jsonify({"domain": domain, "domain_name": domain_name}), 200

@app.route('/calculate', methods=['POST'])
def calculate():
    """
    On-demand score recalculation for a domain. Looks up the latest
    domain_progress doc (across any scan_id) rather than querying the old
    per-service `scans` documents, since scanners no longer write there.
    """
    data = request.get_json()
    domain = data.get('domain')

    if not domain:
        return jsonify({"error": "Domain is required"}), 400

    db = get_db()
    progress_doc = _get_latest_domain_progress(db, domain)

    if not progress_doc:
        return jsonify({"error": f"No scan data found for domain {domain}"}), 404

    failed_services = [
        s for s, v in progress_doc.get('services', {}).items()
        if v.get('status') == 'failed'
    ]

    result = calculate_domain_score(
        progress_doc.get('results', {}),
        failed_services=failed_services
    )
    result['domain'] = domain

    scores_collection = db['scores']
    scores_collection.update_one(
        {"domain": domain},
        {"$set": {
            **result,
            "scan_id": progress_doc.get('scan_id'),
            "calculated_at": datetime.datetime.utcnow()
        }},
        upsert=True
    )

    return jsonify(result), 200

@app.route('/domain/<domain>', methods=['GET'])
def get_score(domain):
    db = get_db()
    scores_collection = db['scores']
    score = scores_collection.find_one({"domain": domain}, {"_id": 0})

    if not score:
        return jsonify({"error": "Score not found"}), 404

    return jsonify(score), 200

@app.route('/scans', methods=['GET'])
def get_scans():
    db = get_db()
    scans_collection = db['scans']

    domain = request.args.get('domain')
    include_results = request.args.get('include_results', 'false').lower() == 'true'
    limit = int(request.args.get('limit', 100))

    query = {}
    if domain:
        query['domain'] = domain

    projection = {
        "_id": 0,
        "scan_id": 1,
        "domain": 1,
        "service": 1,
        "status": 1,
        "created_at": 1,
        "completed_at": 1
    }

    if include_results:
        projection["results"] = 1
        projection["error"] = 1

    scans = list(scans_collection.find(query, projection).sort("created_at", -1).limit(limit))

    return jsonify({"scans": scans}), 200

@app.route('/scans/recent', methods=['GET'])
def get_recent_scans():
    # Deprecated, keeping for backward compatibility but redirecting logic
    # or just simple wrapper
    db = get_db()
    scans = list(db['scans'].find(
        {},
        {"_id": 0, "scan_id": 1, "domain": 1, "service": 1, "status": 1, "created_at": 1, "completed_at": 1}
    ).sort("created_at", -1).limit(100))
    return jsonify({"scans": scans}), 200

@app.route('/scans/grouped', methods=['GET'])
def get_grouped_scans():
    """Aggregated endpoint: returns recent scans grouped by domain"""
    db = get_db()

    # MongoDB aggregation pipeline
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$domain",
            "domain": {"$first": "$domain"},
            "domain_name": {"$first": "$domain_name"},
            "latest_date": {"$first": "$created_at"},
            "scans": {"$push": {
                "scan_id": "$scan_id",
                "service": "$service",
                "status": "$status",
                "created_at": "$created_at",
                "completed_at": "$completed_at"
            }}
        }},
        {"$sort": {"latest_date": -1}},
        {"$limit": 50},
        {"$project": {
            "_id": 0,
            "domain": 1,
            "domain_name": 1,
            "latest_date": 1,
            "scans": 1
        }}
    ]

    grouped = list(db['scans'].aggregate(pipeline))
    return jsonify({"groups": grouped}), 200

@app.route('/scan/summary/<domain>', methods=['GET'])
def get_scan_summary(domain):
    """
    Consolidated endpoint: returns complete scan data in one call.

    Reads per-service status/results from the latest domain_progress doc
    for this domain (across any scan_id) rather than the old per-service
    `scans` documents, since scanners now write there via
    record_service_result() instead.
    """
    cache_key = f"scan_summary:{domain}"
    cached = redis_conn.get(cache_key)
    if cached:
        return Response(cached, mimetype='application/json')

    db = get_db()
    progress_doc = _get_latest_domain_progress(db, domain)

    scans = {}
    fast_completed = 0
    slow_completed = 0
    all_completed = True
    any_started = False

    if progress_doc:
        services_status = progress_doc.get('services', {})
        results_map = progress_doc.get('results', {})

        for service in ALL_SERVICES:
            svc_status = services_status.get(service)
            if svc_status:
                any_started = True
                status = svc_status.get('status', 'pending')
                scans[service] = {
                    "status": status,
                    "error": svc_status.get('error'),
                    "results": results_map.get(service),
                }
                if status in ('completed', 'failed'):
                    if service in FAST_SERVICES:
                        fast_completed += 1
                    else:
                        slow_completed += 1
                else:
                    all_completed = False
            else:
                all_completed = False
    else:
        all_completed = False

    # Determine overall status. Prefer domain_progress's own rollup status
    # (set once completed_jobs >= total_jobs in /job-done) since it already
    # accounts for "partial" -- falls back to the per-service tally above
    # for a domain still mid-scan.
    if not any_started:
        overall_status = "not_started"
    elif progress_doc and progress_doc.get('status') in ('completed', 'partial'):
        overall_status = "completed"
    elif all_completed:
        overall_status = "completed"
    else:
        overall_status = "in_progress"

    # Fetch score if all completed
    score = None
    if overall_status == "completed":
        score_doc = db['scores'].find_one({"domain": domain}, {"_id": 0})
        if not score_doc:
            try:
                failed_services = [
                    s for s, v in (progress_doc or {}).get('services', {}).items()
                    if v.get('status') == 'failed'
                ]
                score_result = calculate_domain_score(
                    (progress_doc or {}).get('results', {}),
                    failed_services=failed_services
                )
                score_result['domain'] = domain
                db['scores'].update_one(
                    {"domain": domain},
                    {"$set": {
                        **score_result,
                        "scan_id": (progress_doc or {}).get('scan_id'),
                        "calculated_at": datetime.datetime.utcnow()
                    }},
                    upsert=True
                )
                score = score_result
            except Exception:
                pass
        else:
            score = score_doc

    # Fetch friendly domain name from any scan doc for this domain
    name_doc = db['scans'].find_one(
        {"domain": domain, "domain_name": {"$exists": True, "$ne": None}},
        {"_id": 0, "domain_name": 1}
    )
    domain_name = name_doc['domain_name'] if name_doc else None

    response_data = {
        "domain": domain,
        "domain_name": domain_name,
        "status": overall_status,
        "scans": scans,
        "score": score,
        "fast_services": {
            "total": len(FAST_SERVICES),
            "completed": fast_completed
        },
        "slow_services": {
            "total": len(SLOW_SERVICES),
            "completed": slow_completed
        }
    }

    response_json = json.dumps(response_data, default=str)

    # Cache completed scans for 1 hour
    if overall_status == "completed":
        redis_conn.setex(cache_key, 3600, response_json)

    return Response(response_json, mimetype='application/json')

@app.route('/scan/stream/<domain>')
def stream_scan_updates(domain):
    """SSE endpoint for real-time scan updates.

    IMPORTANT: every event we push to the client must be a FULL scan summary
    (the same shape as /scan/summary/<domain>), not the raw per-service pubsub
    payload. The frontend's onmessage handler only calls setSummary() when
    data.scans exists, and only closes the stream when the *overall* status
    is 'completed' — so relaying raw pubsub messages breaks both of those.
    """
    def generate():
        pubsub = redis_conn.pubsub()
        channel = f"scan_updates:{domain}"
        pubsub.subscribe(channel)

        def _get_summary():
            summary_response = get_scan_summary(domain)
            return json.loads(summary_response.get_data(as_text=True))

        # Send initial full summary
        try:
            summary_data = _get_summary()
            yield f"data: {json.dumps(summary_data, default=str)}\n\n"
            if summary_data.get('status') == 'completed':
                pubsub.close()
                return
        except Exception:
            pass

        # Listen for updates — on every pubsub ping, recompute the FULL
        # summary and send that, rather than relaying the raw message.
        try:
            for message in pubsub.listen():
                if message['type'] != 'message':
                    continue
                try:
                    summary_data = _get_summary()
                    yield f"data: {json.dumps(summary_data, default=str)}\n\n"

                    if summary_data.get('status') == 'completed':
                        break
                except Exception:
                    continue
        finally:
            pubsub.close()

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/scans/<domain>', methods=['DELETE'])
def delete_scans(domain):
    """Delete all scans for a given domain"""
    try:
        db = get_db()
        result = db['scans'].delete_many({"domain": domain})
        db['domain_progress'].delete_many({"domain": domain})

        # Also clear Redis cache
        cache_key = f"scan_summary:{domain}"
        redis_conn.delete(cache_key)

        return jsonify({
            "message": f"Deleted {result.deleted_count} scans for {domain}",
            "deleted_count": result.deleted_count
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/debug/summary/<domain>', methods=['GET'])
def debug_scan_summary(domain):
    """Debug route to inspect raw scan data from domain_progress"""
    report = {
        "domain": domain,
        "redis": None,
        "services": {},
        "summary": {}
    }

    # Check Redis
    try:
        cache_key = f"scan_summary:{domain}"
        cached = redis_conn.get(cache_key)
        report["redis"] = {
            "status": "connected",
            "cache_hit": cached is not None
        }
    except Exception as e:
        report["redis"] = {
            "status": "error",
            "error": str(e)
        }

    db = get_db()
    progress_doc = _get_latest_domain_progress(db, domain)

    fast_completed = 0
    slow_completed = 0

    if progress_doc:
        services_status = progress_doc.get('services', {})
        results_map = progress_doc.get('results', {})

        for service in ALL_SERVICES:
            svc_status = services_status.get(service)
            if svc_status:
                svc_results = results_map.get(service)
                report["services"][service] = {
                    "found": True,
                    "status": svc_status.get("status"),
                    "has_results": svc_results is not None,
                    "results_keys": list(svc_results.keys()) if isinstance(svc_results, dict) else [],
                    "error": svc_status.get("error"),
                }
                if svc_status.get("status") in ["completed", "failed"]:
                    if service in FAST_SERVICES:
                        fast_completed += 1
                    else:
                        slow_completed += 1
            else:
                report["services"][service] = {"found": False}
    else:
        for service in ALL_SERVICES:
            report["services"][service] = {"found": False}
        report["note"] = f"No domain_progress document found for domain={domain!r}"

    report["summary"] = {
        "fast_completed": f"{fast_completed}/{len(FAST_SERVICES)}",
        "slow_completed": f"{slow_completed}/{len(SLOW_SERVICES)}",
    }

    return jsonify(report), 200

@app.route('/debug/db-check')
def debug_db_check():
    db = get_db()
    server_info = db.client.server_info()  # forces actual connection + confirms it's live
    return jsonify({
        "db_name": db.name,
        "client_address": str(db.client.address),
        "server_version": server_info.get("version"),
        "connection_id": server_info.get("connectionId"),
        "domain_progress_count": db['domain_progress'].count_documents({}),
        "all_db_names": db.client.list_database_names(),
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=Config.PORT_SCORING, threaded=True)