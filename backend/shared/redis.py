import redis
from rq import Queue
from .config import Config

def get_redis_connection():
    return redis.from_url(Config.REDIS_URL)

def get_queue(name='default'):
    conn = get_redis_connection()
    return Queue(name, connection=conn)
