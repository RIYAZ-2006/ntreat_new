import sys
import os
from redis import Redis
from rq import Worker, Queue
from shared.config import Config
from cve_service.tasks import process_cve_scan
from subdirectory_service.tasks import process_subdirectory_scan
from http_security_service.tasks import process_http_security_scan

# Ensure backend is in path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

# Slow worker handles: Subdomain, Subdirectory, CVE (can take 5-20 minutes)
listen = ['slow', 'subdomain_queue','subdirectory_queue','httpsec_queue','cve_queue']

def start_worker():
    conn = Redis.from_url(Config.REDIS_URL)
    queues = [Queue(name, connection=conn) for name in listen]
    worker = Worker(queues, connection=conn, name='slow-worker')
    print(f"🐢 Slow Worker started, listening on: {listen}")
    worker.work()

if __name__ == '__main__':
    start_worker()
