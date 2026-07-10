import sys
import os
import uuid
import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request
from shared.config import Config
from shared.database import get_db
from shared.redis import get_queue
from subdomain_service.tasks import process_subdomain_scan

app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY

db = get_db()
scans_collection = db['scans']
queue = get_queue('subdomain_queue')

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "service": "subdomain"})

@app.route('/scan', methods=['POST'])
def start_scan():
    data = request.get_json()
    domain = data.get('domain')
    
    if not domain:
        return jsonify({"error": "Domain is required"}), 400
        
    scan_id = str(uuid.uuid4())
    scans_collection.insert_one({
        "scan_id": scan_id,
        "domain": domain,
        "service": "subdomain",
        "status": "queued",
        "created_at": datetime.datetime.utcnow()
    })
    
    job = queue.enqueue(process_subdomain_scan, args=(domain, scan_id), job_timeout='10m')
    
    return jsonify({"message": "Scan started", "scan_id": scan_id, "job_id": job.id}), 202

@app.route('/scan/<scan_id>', methods=['GET'])
def get_scan_result(scan_id):
    scan = scans_collection.find_one({"scan_id": scan_id}, {"_id": 0})
    if not scan:
        return jsonify({"error": "Scan not found"}), 404
    return jsonify(scan), 200

@app.route('/subdomain/ingest', methods=['POST'])
def subdomain_ingest():
    data = request.get_json()
    get_db()["gateway_subdomain_results"].update_one(
        {"scan_id": data["scan_id"]},
        {"$set": {**data, "received_at": datetime.datetime.utcnow()}},
        upsert=True
    )
    return jsonify({"status": "received", "scan_id": data["scan_id"]}), 200
    
if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=Config.PORT_SUBDOMAIN)
