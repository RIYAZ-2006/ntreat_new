from shared.database import get_db
from shared.config import Config
import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

try:
    db = get_db()
    scans = list(db.scans.find().sort("created_at", -1).limit(5))
    print(f"Found {len(scans)} recent scans:")
    for scan in scans:
        print(f"ID: {scan.get('scan_id')}, Service: {scan.get('service')}, Status: {scan.get('status')}")
        if scan.get('status') == 'failed':
             print(f"  Error: {scan.get('error')}")

    print("\n--- Recent Scores ---")
    scores = list(db.scores.find().sort("calculated_at", -1).limit(5))
    for s in scores:
        print(f"Domain: {s.get('domain')}, Grade: {s.get('grade')}, Analyzed: {s.get('components_analyzed')}")
except Exception as e:
    print(f"Error: {e}")
