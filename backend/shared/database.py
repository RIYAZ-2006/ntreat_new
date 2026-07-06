from pymongo import MongoClient
from .config import Config

def get_db_client():
    client = MongoClient(Config.MONGO_URI)
    return client

def get_db(db_name='ntreat'):
    client = get_db_client()
    return client[db_name]
