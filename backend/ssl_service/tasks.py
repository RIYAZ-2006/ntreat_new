import subprocess
import shutil
import xml.etree.ElementTree as ET
import tempfile
import os
import socket
import ssl
from datetime import datetime as dt_class
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.orchestrator_client import record_service_result
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.x509.oid import ExtensionOID, AuthorityInformationAccessOID
from cryptography.x509 import ocsp
from cryptography.hazmat.primitives import hashes, serialization
import requests
from urllib.parse import urlparse

WEAK_CIPHERS = [
    'RC4', 'MD5', 'DES', '3DES', 'NULL', 'EXPORT', 'anon',
    'ADH', 'AECDH', 'aNULL', 'eNULL'
]


def _extract_cert_fields(ssock, verified):
    cert_der = ssock.getpeercert(binary_form=True)
    cert_dict = ssock.getpeercert() if verified else {}
    cert = x509.load_der_x509_certificate(cert_der, default_backend())

    expiry = cert.not_valid_after
    now = dt_class.utcnow()
    days_remaining = (expiry - now).days

    return {
        "subject": cert.subject.rfc4514_string(),
        "issuer": cert.issuer.rfc4514_string(),
        "valid_from": cert.not_valid_before.isoformat(),
        "valid_until": cert.not_valid_after.isoformat(),
        "days_remaining": days_remaining,
        "expired": days_remaining < 0,
        "expiring_soon": 0 <= days_remaining <= 30,
        "serial_number": str(cert.serial_number),
        "version": cert.version.name,
        "subject_alt_names": cert_dict.get('subjectAltName', []),
        "verified": verified,
    }


def get_certificate_info(domain, port=443):
    """
    Get detailed certificate information including expiry and issuer.
    If the cert fails verification (expired, self-signed, hostname mismatch),
    retry without verification so we can still extract days_remaining etc. —
    otherwise the worst-case certs (the ones that fail verification) would
    silently score as if nothing was wrong.
    """
    try:
        context = ssl.create_default_context()
        with socket.create_connection((domain, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                return _extract_cert_fields(ssock, verified=True)

    except ssl.SSLCertVerificationError as e:
        try:
            insecure_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            insecure_context.check_hostname = False
            insecure_context.verify_mode = ssl.CERT_NONE
            with socket.create_connection((domain, port), timeout=10) as sock:
                with insecure_context.wrap_socket(sock, server_hostname=domain) as ssock:
                    info = _extract_cert_fields(ssock, verified=False)
                    info["verification_error"] = str(e)
                    return info
        except Exception as inner_e:
            return {"error": str(inner_e)}

    except Exception as e:
        return {"error": str(e)}


def check_hsts(domain):
    """Check if HSTS (HTTP Strict Transport Security) header is present"""
    try:
        response = requests.get(f"https://{domain}", timeout=10, allow_redirects=True)
        hsts_header = response.headers.get('Strict-Transport-Security')

        if hsts_header:
            return {
                "enabled": True,
                "header": hsts_header,
                "max_age": None,
                "include_subdomains": 'includeSubDomains' in hsts_header,
                "preload": 'preload' in hsts_header
            }
        else:
            return {"enabled": False, "warning": "HSTS header not found"}
    except Exception as e:
        return {"enabled": False, "error": str(e)}


def analyze_ciphers(ssl_scan_results):
    """Analyze cipher suites for weak ciphers and TLS versions"""
    if not ssl_scan_results or isinstance(ssl_scan_results, str):
        return {}

    analysis = {
        "total_ciphers": len(ssl_scan_results),
        "weak_ciphers": [],
        "tls_versions": set(),
        "strong_ciphers": 0,
        "warnings": []
    }

    for cipher in ssl_scan_results:
        cipher_name = cipher.get('cipher', '')
        tls_version = cipher.get('sslversion', '')
        bits = cipher.get('bits', '')

        if tls_version:
            analysis['tls_versions'].add(tls_version)

        is_weak = any(weak in cipher_name.upper() for weak in WEAK_CIPHERS)
        if is_weak:
            analysis['weak_ciphers'].append({
                "cipher": cipher_name,
                "version": tls_version,
                "bits": bits
            })
        else:
            analysis['strong_ciphers'] += 1

    analysis['tls_versions'] = list(analysis['tls_versions'])

    if 'TLSv1.3' in analysis['tls_versions']:
        analysis['tls13_supported'] = True
    else:
        analysis['tls13_supported'] = False
        analysis['warnings'].append("TLSv1.3 not supported")

    if any(v in analysis['tls_versions'] for v in ['SSLv2', 'SSLv3', 'TLSv1.0', 'TLSv1.1']):
        analysis['warnings'].append("Old/insecure TLS versions enabled")

    if analysis['weak_ciphers']:
        analysis['warnings'].append(f"{len(analysis['weak_ciphers'])} weak ciphers detected")

    return analysis


def check_ocsp_status(domain, port=443):
    """Check OCSP status for a domain's SSL certificate"""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((domain, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                cert_der = ssock.getpeercert(binary_form=True)
                cert = x509.load_der_x509_certificate(cert_der, default_backend())

                try:
                    aia = cert.extensions.get_extension_for_oid(
                        x509.oid.ExtensionOID.AUTHORITY_INFORMATION_ACCESS
                    ).value

                    ocsp_url = None
                    ca_issuer_url = None

                    for desc in aia:
                        if desc.access_method == x509.oid.AuthorityInformationAccessOID.OCSP:
                            ocsp_url = desc.access_location.value
                        elif desc.access_method == x509.oid.AuthorityInformationAccessOID.CA_ISSUERS:
                            ca_issuer_url = desc.access_location.value

                    if not ocsp_url:
                        return {"status": "no_ocsp_url", "message": "No OCSP URL found in certificate"}

                    if not ca_issuer_url:
                        return {"status": "no_issuer_url", "message": "No issuer URL found"}

                    issuer_response = requests.get(ca_issuer_url, timeout=10)
                    issuer_cert = x509.load_der_x509_certificate(issuer_response.content, default_backend())

                    builder = ocsp.OCSPRequestBuilder()
                    builder = builder.add_certificate(cert, issuer_cert, hashes.SHA256())
                    ocsp_request = builder.build()

                    ocsp_response = requests.post(
                        ocsp_url,
                        data=ocsp_request.public_bytes(serialization.Encoding.DER),
                        headers={'Content-Type': 'application/ocsp-request'},
                        timeout=10
                    )

                    ocsp_resp = ocsp.load_der_ocsp_response(ocsp_response.content)

                    if ocsp_resp.response_status == ocsp.OCSPResponseStatus.SUCCESSFUL:
                        cert_status = ocsp_resp.certificate_status

                        if cert_status == ocsp.OCSPCertStatus.GOOD:
                            return {
                                "status": "good",
                                "message": "Certificate is valid and not revoked",
                                "ocsp_url": ocsp_url
                            }
                        elif cert_status == ocsp.OCSPCertStatus.REVOKED:
                            return {
                                "status": "revoked",
                                "message": "Certificate has been revoked!",
                                "ocsp_url": ocsp_url,
                                "revocation_time": str(ocsp_resp.revocation_time) if hasattr(ocsp_resp, 'revocation_time') else None
                            }
                        else:
                            return {
                                "status": "unknown",
                                "message": "Certificate status is unknown",
                                "ocsp_url": ocsp_url
                            }
                    else:
                        return {
                            "status": "error",
                            "message": f"OCSP response status: {ocsp_resp.response_status}",
                            "ocsp_url": ocsp_url
                        }

                except x509.ExtensionNotFound:
                    return {"status": "no_aia", "message": "No AIA extension found in certificate"}

    except socket.timeout:
        return {"status": "timeout", "message": "Connection timeout"}
    except socket.gaierror as e:
        return {"status": "dns_error", "message": "Unable to resolve OCSP server (DNS issue)", "skip": True}
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if "Temporary failure in name resolution" in error_msg or "Name or service not known" in error_msg:
            return {"status": "dns_error", "message": "Unable to resolve OCSP server (DNS issue)", "skip": True}
        return {"status": "network_error", "message": f"Network error: {error_msg}", "skip": True}
    except Exception as e:
        error_msg = str(e)
        if "Temporary failure in name resolution" in error_msg or "Name or service not known" in error_msg:
            return {"status": "dns_error", "message": "Unable to resolve OCSP server (DNS issue)", "skip": True}
        return {"status": "error", "message": f"OCSP check failed: {error_msg}", "skip": True}


def process_ssl_scan(domain, scan_id):
    db = get_db()
    publish_scan_update(domain, "ssl", "processing")

    if not shutil.which("sslscan"):
        error_msg = "sslscan not found. Install with: apt-get install sslscan"
        record_service_result(scan_id, domain, "ssl", status="failed", error=error_msg)
        publish_scan_update(domain, "ssl", "failed", error="sslscan not found")
        return

    try:
        results = {}

        results['certificate'] = get_certificate_info(domain)
        results['hsts'] = check_hsts(domain)

        with tempfile.NamedTemporaryFile(suffix='.xml', delete=False) as tmp_file:
            xml_path = tmp_file.name

        try:
            subprocess.run(
                ["sslscan", "--no-failed", f"--xml={xml_path}", domain],
                capture_output=True,
                timeout=300
            )
        except subprocess.TimeoutExpired:
            results['ssl_scan'] = "sslscan timed out after 5 minutes"
            results['cipher_analysis'] = {}

        if os.path.exists(xml_path):
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()
                ssl_data = []
                for ssl_test in root.findall('ssltest'):
                    for cipher in ssl_test.findall('cipher'):
                        ssl_data.append({
                            "status": cipher.get('status'),
                            "sslversion": cipher.get('sslversion'),
                            "bits": cipher.get('bits'),
                            "cipher": cipher.get('cipher')
                        })
                results['ssl_scan'] = ssl_data
                results['cipher_analysis'] = analyze_ciphers(ssl_data)

            except ET.ParseError:
                results['ssl_scan'] = "Error parsing XML"
                results['_error'] = "Failed to parse sslscan output"
            finally:
                os.remove(xml_path)

        results['ocsp'] = check_ocsp_status(domain)

        record_service_result(scan_id, domain, "ssl", status="completed", results=results)
        publish_scan_update(domain, "ssl", "completed", results=results)
        return results

    except Exception as e:
        record_service_result(scan_id, domain, "ssl", status="failed", error=str(e))
        publish_scan_update(domain, "ssl", "failed", error=str(e))
        raise e