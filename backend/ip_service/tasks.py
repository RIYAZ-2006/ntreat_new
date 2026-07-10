import requests
import socket
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.config import Config
import datetime

# Ports score_ip() in scoring_service/logic.py checks for — kept in sync
# with that scorer's risky-ports list
RISKY_PORTS = [21, 23, 3389, 5900, 1433, 3306, 27017, 6379, 9200, 11211]

PORT_CONNECT_TIMEOUT = 1.5  # seconds per port, kept short since we check ~10 ports


def check_open_ports(ip_address, ports=RISKY_PORTS):
    """Lightweight TCP connect check on a small set of commonly-risky ports.
    Not a full nmap scan — just enough signal for score_ip() to work with,
    without duplicating what cve_service's nmap scan already does more thoroughly."""
    open_ports = []
    for port in ports:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(PORT_CONNECT_TIMEOUT)
                result = sock.connect_ex((ip_address, port))
                if result == 0:
                    open_ports.append(port)
        except Exception:
            continue
    return open_ports


def get_reverse_dns(ip_address):
    """Reverse DNS lookup — cheap, no external API needed"""
    try:
        hostname, _, _ = socket.gethostbyaddr(ip_address)
        return {"hostname": hostname, "resolved": True}
    except (socket.herror, socket.gaierror):
        return {"hostname": None, "resolved": False}


def _notify_orchestrator(scan_id, domain, service):
    try:
        requests.post(f"{Config.ORCHRESTATOR_SERVICE_URL}/job-done", json={
            "scan_id": scan_id,
            "domain": domain,
            "service": service
        }, timeout=5)
    except requests.exceptions.RequestException:
        pass


def process_ip_scan(domain, scan_id):
    """
    Background task to perform IP Geolocation + lightweight risk signals
    (open risky ports, reverse DNS) so score_ip() has real data to work with.
    """
    db = get_db()
    scans_collection = db['scans']

    scans_collection.update_one(
        {"scan_id": scan_id},
        {"$set": {"status": "processing", "started_at": datetime.datetime.utcnow()}}
    )
    publish_scan_update(domain, "ip", "processing")

    try:
        try:
            ip_address = socket.gethostbyname(domain)
        except socket.gaierror:
            raise Exception(f"Could not resolve domain {domain} to IP address")

        resp = requests.get(f"http://ip-api.com/json/{ip_address}", timeout=10)
        geo_data = resp.json()

        if geo_data.get('status') == 'fail':
            raise Exception(geo_data.get('message', 'Unknown error'))

        open_ports = check_open_ports(ip_address)
        reverse_dns = get_reverse_dns(ip_address)

        # Simple heuristic: geo location country differs sharply from ISP/org
        # country hints — score_ip() reads this as `geo_anomaly`
        geo_anomaly = None
        isp = (geo_data.get('isp') or '').lower()
        org = (geo_data.get('org') or '').lower()
        country = geo_data.get('country', '')
        if ('unknown' in isp and 'unknown' in org) or not country:
            geo_anomaly = "Unable to determine ISP/organization for resolved IP"

        results = {
            **geo_data,
            "resolved_ip": ip_address,
            "open_ports": open_ports,
            "reverse_dns": reverse_dns,
            "geo_anomaly": geo_anomaly,
        }

        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {
                "status": "completed",
                "completed_at": datetime.datetime.utcnow(),
                "results": results,
                "service": "ip"
            }}
        )
        publish_scan_update(domain, "ip", "completed", results=results)
        _notify_orchestrator(scan_id, domain, "ip")
        return results

    except Exception as e:
        scans_collection.update_one(
            {"scan_id": scan_id},
            {"$set": {
                "status": "failed",
                "error": str(e),
                "completed_at": datetime.datetime.utcnow()
            }}
        )
        publish_scan_update(domain, "ip", "failed", error=str(e))
        _notify_orchestrator(scan_id, domain, "ip")
        raise e