import sys
import os
from redis import Redis
from rq import Worker, Queue
from shared.config import Config
from dns_service.tasks import process_dns_scan
from ip_service.tasks import process_ip_scan
from ssl_service.tasks import process_ssl_scan
from webtech_service.tasks import process_webtech_scan

# Ensure backend is in path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

# Fast worker handles: DNS, IP, SSL, WebTech (typically complete in < 30 seconds)
listen = ['fast', 'dns_queue', 'ip_queue', 'ssl_queue', 'webtech_queue']

def start_worker():
    conn = Redis.from_url(Config.REDIS_URL)
    queues = [Queue(name, connection=conn) for name in listen]
    worker = Worker(queues, connection=conn, name='fast-worker')
    print(f"🚀 Fast Worker started, listening on: {listen}")
    worker.work()

if __name__ == '__main__':
    start_worker()
