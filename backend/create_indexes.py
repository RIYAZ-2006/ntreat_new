from shared.database import get_db
import pymongo

def create_indexes():
    db = get_db()
    print("Creating indexes for specific collections...")
    
    # Scans collection
    print("Indexing 'scans' collection...")
    # Index for fast retrieval by domain + sorting by date (for ScanDetails)
    db.scans.create_index([("domain", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
    # Index for sorting all scans (for Home 'recent scans')
    db.scans.create_index([("created_at", pymongo.DESCENDING)])
    
    # Scores collection
    print("Indexing 'scores' collection...")
    db.scores.create_index([("domain", pymongo.ASCENDING)], unique=True)
    db.scores.create_index([("calculated_at", pymongo.DESCENDING)])

    print("Indexes created successfully.")

if __name__ == "__main__":
    create_indexes()
