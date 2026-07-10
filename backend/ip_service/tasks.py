import requests
import socket
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.orchestrator_client import record_service_result
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


def process_ip_scan(domain, scan_id):
    """
    Background task to perform IP Geolocation + lightweight risk signals
    (open risky ports, reverse DNS) so score_ip() has real data to work with.
    """
    db = get_db()
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

        record_service_result(scan_id, domain, "ip", status="completed", results=results)
        publish_scan_update(domain, "ip", "completed", results=results)
        return results

    except Exception as e:
        record_service_result(scan_id, domain, "ip", status="failed", error=str(e))
        publish_scan_update(domain, "ip", "failed", error=str(e))
        raise e