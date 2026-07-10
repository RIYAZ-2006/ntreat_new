import json
from shared.redis import get_redis_connection

def publish_scan_update(domain, service, status, results=None, error=None):
    """
    Publish SSE update to Redis pub/sub channel
    Args:
        domain: Domain being scanned
        service: Service name (dns, ip, ssl, etc.)
        status: Scan status (queued, processing, completed, failed)
        results: Scan results (optional)
        error: Error message if failed (optional)
    """
    try:
        redis_conn = get_redis_connection()
        channel = f"scan_updates:{domain}"
        
        message = {
            "service": service,
            "status": status,
            "timestamp": str(__import__('datetime').datetime.utcnow())
        }
        
        if results:
            message["results"] = results
        if error:
            message["error"] = error
            
        redis_conn.publish(channel, json.dumps(message))
    except Exception as e:
        # Don't fail the scan if SSE publish fails
        print(f"Failed to publish SSE update: {e}")
