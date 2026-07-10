# app.py
import os
import sys
import uuid
import datetime

_HERE   = os.path.abspath(os.path.dirname(__file__))
_PARENT = os.path.abspath(os.path.join(_HERE, ".."))

if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

os.environ.setdefault("WAPPALYZER_EXT_DIR", os.path.join(_HERE, "6.12.2_0"))

from flask import Flask, jsonify, request
from shared.config import Config
from shared.database import get_db
from shared.redis import get_queue
from tasks import process_webtech_scan, run_driver_js, detect_technologies

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = Config.JWT_SECRET_KEY

db               = get_db()
scans_collection = db["scans"]
queue            = get_queue("webtech_queue")


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return jsonify({
        "service": "webtech",
        "status":  "running",
        "routes": {
            "POST /scan":           "Start a scan — body: { domain }",
            "GET  /scan/<scan_id>": "Poll result",
            "GET  /health":         "Health check",
        },
    })


@app.route("/health")
def health():
    return jsonify({"status": "healthy", "service": "webtech"})


# ── Scan ──────────────────────────────────────────────────────────────────────

@app.route("/scan", methods=["POST"])
def start_scan():
    data   = request.get_json(silent=True) or {}
    domain = data.get("domain", "").strip().lower()

    for prefix in ("https://", "http://"):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]

    if not domain:
        return jsonify({"error": "domain is required"}), 400

    scan_id = str(uuid.uuid4())
    scans_collection.insert_one({
        "scan_id":    scan_id,
        "domain":     domain,
        "service":    "webtech",
        "status":     "queued",
        "created_at": datetime.datetime.utcnow(),
    })

    job = queue.enqueue(
        process_webtech_scan,
        args=(domain, scan_id),
        job_timeout="5m",
    )

    return jsonify({"message": "Scan started", "scan_id": scan_id, "job_id": job.id}), 202 


@app.route("/scan/<scan_id>", methods=["GET"])
def get_scan_result(scan_id):
    scan = scans_collection.find_one({"scan_id": scan_id}, {"_id": 0})
    if not scan:
        return jsonify({"error": "Scan not found"}), 404

    for key in ("created_at", "started_at", "completed_at"):
        if isinstance(scan.get(key), datetime.datetime):
            scan[key] = scan[key].isoformat()

    return jsonify(scan), 200


# ── Debug ─────────────────────────────────────────────────────────────────────

@app.route("/debug/driver")
def debug_driver():
    """Return raw driver.js output for a domain (truncates HTML)."""
    domain  = request.args.get("domain", "github.com")
    payload = run_driver_js(f"https://{domain}")

    return jsonify({
        "domain":             domain,
        "navigation_success": payload.get("navigationSuccess"),
        "final_url":          payload.get("finalUrl"),
        "detections_count":   len(payload.get("detections", [])),
        "detections":         payload.get("detections", []),
        "error":              payload.get("error"),
    })


@app.route("/debug/detect")
def debug_detect():
    """Run full detection and return structured result."""
    domain = request.args.get("domain", "github.com")
    result = detect_technologies(domain)
    return jsonify(result) 


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=Config.PORT_WEBTECH)