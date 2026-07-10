import sys
import os
import uuid
import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request
from shared.config import Config
from shared.database import get_db
from shared.redis import get_queue
from orchrestor_service.tasks import process_orchestration

app = Flask(__name__)

db = get_db()
scans_collection = db['scans']
domain_progress_collection = db['domain_progress']
queue = get_queue('orchrestator_queue')


@app.route('/health')
def health():
    return jsonify({"status": "healthy", "service": "orchestrator"})


@app.route('/scan', methods=['POST'])
def start_scan():
    data = request.get_json()
    domain = data.get('domain')
    org_name = data.get('org_name')

    if not domain:
        return jsonify({"error": "Domain is required"}), 400

    scan_id = str(uuid.uuid4())
    scan_record = {
        "scan_id": scan_id,
        "root_domain": domain,
        "org_name": org_name,
        "service": "orchestrator",
        "status": "pending",
        "created_at": datetime.datetime.utcnow()
    }
    scans_collection.insert_one(scan_record)

    job = queue.enqueue(process_orchestration, args=(domain, scan_id), job_timeout='30m')

    return jsonify({
        "message": "Scan started",
        "scan_id": scan_id,
        "org_name": org_name,
        "job_id": job.id
    }), 202


@app.route('/scan/<scan_id>', methods=['GET'])
def get_scan_status(scan_id):
    scan = scans_collection.find_one({"scan_id": scan_id}, {"_id": 0})
    if not scan:
        return jsonify({"error": "Scan not found"}), 404
    return jsonify(scan), 200


@app.route('/job-done', methods=['POST'])
def job_done():
    """
    Called by each of the 7 downstream services when they finish a single
    domain's scan. Tracks per-domain completion, scores that domain once its
    7 services are done, then finalizes the whole scan once every domain
    (root + subdomains) is scored.
    """
    data = request.get_json()
    scan_id = data.get('scan_id')
    domain = data.get('domain')

    if not scan_id or not domain:
        return jsonify({"error": "scan_id and domain are required"}), 400

    updated = domain_progress_collection.find_one_and_update(
        {"scan_id": scan_id, "domain": domain},
        {"$inc": {"completed_jobs": 1}},
        return_document=True
    )

    if not updated:
        # domain_progress doc wasn't created for this scan_id/domain — log and bail
        return jsonify({"error": "No matching domain_progress record"}), 404

    if updated['completed_jobs'] >= updated['total_jobs']:
        _score_single_domain(scan_id, domain)

        remaining = domain_progress_collection.count_documents({
            "scan_id": scan_id,
            "status": {"$ne": "completed"}
        })
        if remaining == 0:
            _finalize_scan_score(scan_id)

    return jsonify({"status": "ok"}), 200


def _score_single_domain(scan_id, domain):
    from scoring_service.logic import calculate_domain_score

    db = get_db()
    score_result = calculate_domain_score(domain)

    db['scores'].update_one(
        {"domain": domain},
        {"$set": {**score_result, "scan_id": scan_id, "calculated_at": datetime.datetime.utcnow()}},
        upsert=True
    )
    domain_progress_collection.update_one(
        {"scan_id": scan_id, "domain": domain},
        {"$set": {"status": "completed"}}
    )


def _finalize_scan_score(scan_id):
    """
    Called once every domain (root + subdomains) has an individual score.
    Overall scan score = 50% root domain's score + 50% average of subdomain scores.
    If there are no subdomains, overall score is just the root domain's score.
    """
    db = get_db()

    scan_doc = scans_collection.find_one({"scan_id": scan_id})
    if not scan_doc:
        return

    root_domain = scan_doc.get('root_domain')
    domain_docs = list(domain_progress_collection.find({"scan_id": scan_id}))
    all_domains = [d['domain'] for d in domain_docs]

    domain_scores = list(db['scores'].find({"domain": {"$in": all_domains}}, {"_id": 0}))
    if not domain_scores:
        return

    score_by_domain = {s['domain']: s['score'] for s in domain_scores}
    root_score = score_by_domain.get(root_domain)
    subdomain_scores = [
        score for d, score in score_by_domain.items() if d != root_domain
    ]

    if root_score is None:
        # Root domain scan missing/failed — fall back to flat average
        overall_score = round(sum(score_by_domain.values()) / len(score_by_domain))
    elif not subdomain_scores:
        # No subdomains — overall score is just the root domain's score
        overall_score = root_score
    else:
        subdomain_avg = sum(subdomain_scores) / len(subdomain_scores)
        overall_score = round((root_score * 0.5) + (subdomain_avg * 0.5))

    from scoring_service.logic import _grade

    scans_collection.update_one(
        {"scan_id": scan_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.datetime.utcnow(),
            "overall_score": overall_score,
            "overall_grade": _grade(overall_score),
            "root_domain_score": root_score,
            "domain_scores": domain_scores
        }}
    )


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=Config.PORT_ORCHRESTATOR)