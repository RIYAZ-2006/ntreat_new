from shared.database import get_db


# ---------------------------------------------------------------------------
# Per-service scorers
# ---------------------------------------------------------------------------

def score_ssl(ssl_res: dict) -> dict:
    score = 100
    details = []
    penalties = {}

    cert = ssl_res.get('certificate', {})

    # NEW: total failure to retrieve a cert at all (connection/handshake failed
    # even with verification disabled) — treat as the worst-case SSL finding
    if cert.get('error'):
        score -= 40
        penalties['cert_unreachable'] = 40
        details.append(f"Could not retrieve certificate: {cert['error']}. (-40)")

    # NEW: cert retrieved but failed verification (expired/self-signed/mismatch)
    elif cert.get('verification_error'):
        score -= 25
        penalties['cert_verification_failed'] = 25
        details.append(f"Certificate failed verification: {cert['verification_error']}. (-25)")

    cipher_analysis = ssl_res.get('cipher_analysis', {})

    weak_ciphers = cipher_analysis.get('weak_ciphers', [])
    if weak_ciphers:
        p = min(20, len(weak_ciphers) * 4)
        score -= p
        penalties['weak_ciphers'] = p
        details.append(f"{len(weak_ciphers)} weak cipher(s) detected. (-{p})")

    tls_versions = cipher_analysis.get('tls_versions', [])
    if 'TLSv1.0' in tls_versions or 'TLSv1.1' in tls_versions:
        score -= 15
        penalties['legacy_tls'] = 15
        details.append("Legacy TLS 1.0/1.1 supported. (-15)")

    if tls_versions and 'TLSv1.3' not in tls_versions:
        score -= 10
        penalties['no_tls13'] = 10
        details.append("TLS 1.3 not supported. (-10)")

    hsts = ssl_res.get('hsts', {})
    if not hsts.get('enabled'):
        score -= 15
        penalties['no_hsts'] = 15
        details.append("HSTS not enabled. (-15)")

    days_remaining = cert.get('days_remaining', 999)
    if days_remaining < 0:
        score -= 30
        penalties['cert_expired'] = 30
        details.append(f"Certificate expired. (-30)")
    elif days_remaining < 7:
        score -= 25
        penalties['cert_expiring_critical'] = 25
        details.append(f"Certificate expiring in {days_remaining} day(s)! (-25)")
    elif days_remaining < 30:
        score -= 15
        penalties['cert_expiring'] = 15
        details.append(f"Certificate expiring in {days_remaining} days. (-15)")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }

def score_dns(dns_res: dict) -> dict:
    """
    Max 100 pts. Deductions:
      - No SPF record   : -20
      - No DMARC record : -20
      - No DNSSEC       : -15
      - No CAA record   : -10
      - No MX records   : -10 (email sending risk indicator)
      - No DKIM hint    : -10 (if TXT contains no dkim)
    NOTE: IP reputation is NOT included per requirement.
    """
    score = 100
    details = []
    penalties = {}

    txt_parsed = dns_res.get('TXT_parsed', {})

    if not txt_parsed.get('spf'):
        score -= 20
        penalties['no_spf'] = 20
        details.append("No SPF record found. (-20)")

    if not txt_parsed.get('dmarc'):
        score -= 20
        penalties['no_dmarc'] = 20
        details.append("No DMARC record found. (-20)")

    dkim_records = txt_parsed.get('dkim', [])
    if not dkim_records:
        score -= 10
        penalties['no_dkim'] = 10
        details.append("No DKIM selector found in TXT records. (-10)")

    if not dns_res.get('dnssec', {}).get('enabled'):
        score -= 15
        penalties['no_dnssec'] = 15
        details.append("DNSSEC not enabled. (-15)")

    if not dns_res.get('CAA'):
        score -= 10
        penalties['no_caa'] = 10
        details.append("No CAA record found. (-10)")

    if not dns_res.get('MX'):
        score -= 10
        penalties['no_mx'] = 10
        details.append("No MX records found. (-10)")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }


def score_ip(ip_res: dict) -> dict:
    """
    Max 100 pts. NO reputation scoring per requirement.
    Scores based on:
      - Open risky ports  : -10 per port, max -40
      - Missing reverse DNS: -10
      - Multiple PTR mismatches: -10
      - Geolocation anomaly (if flagged): -10
    """
    score = 100
    details = []
    penalties = {}

    RISKY_PORTS = {21: 'FTP', 23: 'Telnet', 3389: 'RDP', 5900: 'VNC',
                   1433: 'MSSQL', 3306: 'MySQL', 27017: 'MongoDB'}

    open_ports = ip_res.get('open_ports', [])
    risky_found = []
    for port_entry in open_ports:
        port = port_entry if isinstance(port_entry, int) else port_entry.get('port')
        if port in RISKY_PORTS:
            risky_found.append(f"{port}/{RISKY_PORTS[port]}")

    if risky_found:
        p = min(40, len(risky_found) * 10)
        score -= p
        penalties['risky_ports'] = p
        details.append(f"Risky ports exposed: {', '.join(risky_found)}. (-{p})")

    rdns = ip_res.get('reverse_dns', {})
    if not rdns.get('ptr') and not rdns.get('hostname'):
        score -= 10
        penalties['no_rdns'] = 10
        details.append("No reverse DNS (PTR) record. (-10)")

    if ip_res.get('geo_anomaly'):
        score -= 10
        penalties['geo_anomaly'] = 10
        details.append("Geolocation anomaly flagged. (-10)")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }


def score_cve(cve_res: dict) -> dict:
    """
    Max 100 pts.
    Handles the case where version fingerprinting was not possible.
    
    Deductions by CVSS severity:
      - Critical (CVSS >= 9.0) : -20 each, max -60
      - High     (7.0-8.9)     : -10 each, max -40
      - Medium   (4.0-6.9)     :  -5 each, max -20
      - Low      (< 4.0)       :  -2 each, max  -5
    Unknown severity counts as Medium.
    """
    score = 100
    details = []
    penalties = {}

    scan_applicable = cve_res.get('scan_applicable', True)
    cve_list = cve_res.get('cve_scan', [])

    if not scan_applicable or not cve_list:
        # No version info detected — don't penalise, but flag it
        no_version = cve_res.get('no_version_detected', False)
        if no_version or not scan_applicable:
            details.append("Version fingerprinting not possible; CVE scan skipped.")
        else:
            details.append("No CVEs found.")
        return {
            "score": score,
            "details": details,
            "penalties": penalties,
            "grade": _grade(score),
            "skipped": not scan_applicable or no_version
        }

    critical_pen = high_pen = med_pen = low_pen = 0

    for vuln in cve_list:
        cvss = vuln.get('cvss', vuln.get('cvss_score', 0)) or 0
        cve_id = vuln.get('cve_id', vuln.get('id', 'UNKNOWN'))

        if cvss >= 9.0:
            critical_pen = min(60, critical_pen + 20)
        elif cvss >= 7.0:
            high_pen = min(40, high_pen + 10)
        elif cvss >= 4.0:
            med_pen = min(20, med_pen + 5)
        else:
            low_pen = min(5, low_pen + 2)

    total_pen = critical_pen + high_pen + med_pen + low_pen
    score -= total_pen

    if critical_pen:
        penalties['critical_cves'] = critical_pen
        details.append(f"Critical CVEs found. (-{critical_pen})")
    if high_pen:
        penalties['high_cves'] = high_pen
        details.append(f"High-severity CVEs found. (-{high_pen})")
    if med_pen:
        penalties['medium_cves'] = med_pen
        details.append(f"Medium-severity CVEs found. (-{med_pen})")
    if low_pen:
        penalties['low_cves'] = low_pen
        details.append(f"Low-severity CVEs found. (-{low_pen})")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }


def score_webtech(webtech_res: dict) -> dict:
    """
    Max 100 pts. Scored purely from what webtech_service actually detects
    (technology fingerprints + header evidence) — no EOL/version-currency
    checking, since that's intentionally out of scope for this service.

    Deductions:
      - Server header exposes version info   : -10
      - X-Powered-By header exposes stack    : -10
    Informational only (no score impact):
      - coverage == "minimal"/"low-confidence"/"error" noted in details,
        since incomplete detection reflects scan visibility, not a vulnerability.
    """
    score = 100
    details = []
    penalties = {}

    technologies = webtech_res.get('technologies', [])

    def _header_exposes_version(header_name: str) -> bool:
        for tech in technologies:
            for ev in tech.get('evidence', []):
                if ev.get('type') == 'header' and header_name in ev.get('value', '').lower():
                    # crude check: a digit anywhere in the value suggests a version number present
                    if any(ch.isdigit() for ch in ev.get('value', '')):
                        return True
        return False

    if _header_exposes_version('server'):
        score -= 10
        penalties['server_version_exposed'] = 10
        details.append("Server header exposes version information. (-10)")

    if _header_exposes_version('x-powered-by'):
        score -= 10
        penalties['x_powered_by'] = 10
        details.append("X-Powered-By header exposes stack information. (-10)")

    coverage = webtech_res.get('coverage')
    if coverage in ('minimal', 'low-confidence', 'error'):
        details.append(f"Technology detection coverage was '{coverage}' — {webtech_res.get('note', 'results may be incomplete')}.")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }

def score_subdomain(sub_res: dict) -> dict:
    """
    Max 100 pts.
    Deductions:
      - >50 subdomains  : -10
      - >100 subdomains : -20 (overrides >50)
      - Dangling CNAME  : -15 each, max -30
      - Wildcard DNS    : -10
    """
    score = 100
    details = []
    penalties = {}

    count = sub_res.get('count', 0)
    if count > 100:
        score -= 20
        penalties['high_subdomain_count'] = 20
        details.append(f"Very high subdomain exposure ({count}). (-20)")
    elif count > 50:
        score -= 10
        penalties['high_subdomain_count'] = 10
        details.append(f"High subdomain exposure ({count}). (-10)")

    dangling = sub_res.get('dangling_cnames', [])
    if dangling:
        p = min(30, len(dangling) * 15)
        score -= p
        penalties['dangling_cnames'] = p
        details.append(f"Dangling CNAME(s) found ({len(dangling)}). (-{p})")

    if sub_res.get('wildcard_dns'):
        score -= 10
        penalties['wildcard_dns'] = 10
        details.append("Wildcard DNS detected. (-10)")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }


def score_subdirectory(subdir_res: dict) -> dict:
    """
    Max 100 pts. Deductions:
      - Sensitive paths exposed (e.g. /.git, /.env, /backup): -20 each, max -40
      - Admin panel path found (matched by keyword): -20
      - Directory listing enabled: -15
      - Login page path found (matched by keyword): -5
    Derives admin/login classification from exposed path names directly,
    since subdirectory_service only brute-forces paths — it doesn't classify
    them (that finer classification lives in http_security_service instead).
    """
    score = 100
    details = []
    penalties = {}

    SENSITIVE = ['.git', '.env', '.svn', 'backup', 'wp-config', 'phpinfo',
                 '.htaccess', 'database', 'config', 'secret']
    ADMIN_KEYWORDS = ['admin', 'wp-admin', 'administrator', 'cpanel',
                       'phpmyadmin', 'pma', 'manager', 'console']
    LOGIN_KEYWORDS = ['login', 'signin', 'sign-in', 'auth']

    exposed = subdir_res.get('exposed_paths', [])

    sensitive_found = []
    admin_found = []
    login_found = []

    for path in exposed:
        path_lower = path.lower() if isinstance(path, str) else str(path).lower()

        if any(s in path_lower for s in SENSITIVE):
            sensitive_found.append(path)
        if any(a in path_lower for a in ADMIN_KEYWORDS):
            admin_found.append(path)
        if any(l in path_lower for l in LOGIN_KEYWORDS):
            login_found.append(path)

    if sensitive_found:
        p = min(40, len(sensitive_found) * 20)
        score -= p
        penalties['sensitive_paths'] = p
        details.append(f"Sensitive paths exposed: {', '.join(sensitive_found[:2])}. (-{p})")

    if admin_found:
        score -= 20
        penalties['admin_panel'] = 20
        details.append(f"Admin panel path found: {admin_found[0]}. (-20)")

    if subdir_res.get('directory_listings'):
        score -= 15
        penalties['directory_listing'] = 15
        listings = subdir_res['directory_listings']
        details.append(f"Directory listing enabled at: {listings[0]}. (-15)")

    if login_found:
        score -= 5
        penalties['login_pages'] = 5
        details.append(f"Login page path found: {login_found[0]}. (-5)")

    return {
        "score": max(0, min(100, score)),
        "details": details,
        "penalties": penalties,
        "grade": _grade(max(0, min(100, score)))
    }


def score_http_security(http_res: dict) -> dict:
    """
    Trusts http_security_service's own compute_score()/grade output directly,
    since that service already does richer analysis (cookies, CORS, login-wall
    classification, dangerous files) than a flat-header re-derivation could.
    Falls back to a neutral score if the service's own score is missing
    (e.g. older scan docs from before this field existed).
    """
    score = http_res.get('score')
    grade = http_res.get('grade')

    details = []
    penalties = {}

    if score is None:
        # Fallback for legacy scans without a precomputed score
        return {
            "score": 0,
            "details": ["http_security scan result missing precomputed score"],
            "penalties": {"missing_score_data": 100},
            "grade": "F"
        }

    # Surface the service's own findings as readable details
    for h, v in http_res.get('security_headers', {}).items():
        if not v.get('present'):
            details.append(f"{h} header missing.")

    for page in http_res.get('login_pages', []):
        if page.get('classification') == 'exposed_panel':
            details.append(f"Exposed admin panel detected at {page.get('path')}.")
            penalties['exposed_admin_panel'] = 25

    for f in http_res.get('dangerous_files', []):
        if f.get('accessible'):
            details.append(f"Dangerous file exposed: {f.get('path')}.")
            penalties[f"exposed_{f.get('label', 'file')}"] = 15

    return {
        "score": score,
        "details": details,
        "penalties": penalties,
        "grade": grade if grade else _grade(score)
    }

# ---------------------------------------------------------------------------
# Grade helper
# ---------------------------------------------------------------------------

def _grade(score: int) -> str:
    if score >= 95: return 'A+'
    if score >= 90: return 'A'
    if score >= 85: return 'A-'
    if score >= 80: return 'B+'
    if score >= 75: return 'B'
    if score >= 70: return 'B-'
    if score >= 65: return 'C+'
    if score >= 60: return 'C'
    if score >= 55: return 'C-'
    return 'F'


# ---------------------------------------------------------------------------
# Service weights for overall score
# ---------------------------------------------------------------------------

SERVICE_WEIGHTS = {
    'ssl':           0.20,
    'http_security': 0.20,
    'cve':           0.25,
    'dns':           0.15,
    'ip':            0.05,
    'webtech':       0.05,
    'subdomain':     0.05,
    'subdirectory':  0.05,
}

SERVICE_SCORERS = {
    'ssl':           score_ssl,
    'dns':           score_dns,
    'ip':            score_ip,
    'cve':           score_cve,
    'webtech':       score_webtech,
    'subdomain':     score_subdomain,
    'subdirectory':  score_subdirectory,
    'http_security': score_http_security,
}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def calculate_domain_score(domain: str) -> dict:
    db = get_db()
    scans_collection = db['scans']

    services = list(SERVICE_SCORERS.keys())
    data = {}

    for service in services:
        scan = scans_collection.find_one(
            {"domain": domain, "service": service, "status": "completed"},
            sort=[("completed_at", -1)]
        )
        if scan:
            data[service] = scan.get('results', {})

    # Per-service scores
    service_scores = {}
    for service, results in data.items():
        scorer = SERVICE_SCORERS.get(service)
        if scorer:
            service_scores[service] = scorer(results)

    # Weighted overall score
    total_weight = 0.0
    weighted_sum = 0.0
    for service, weight in SERVICE_WEIGHTS.items():
        if service in service_scores:
            weighted_sum += service_scores[service]['score'] * weight
            total_weight += weight

    if total_weight > 0:
        overall_score = int(round(weighted_sum / total_weight))
    else:
        overall_score = 0

    overall_grade = _grade(overall_score)

    # Flat summary details + penalties for backward-compat
    all_details = []
    all_penalties = {}
    for service, svc_data in service_scores.items():
        for d in svc_data.get('details', []):
            all_details.append(f"[{service.upper()}] {d}")
        for k, v in svc_data.get('penalties', {}).items():
            all_penalties[f"{service}_{k}"] = v

    return {
        "domain": domain,
        "score": overall_score,
        "grade": overall_grade,
        "details": all_details,
        "penalties": all_penalties,
        "components_analyzed": list(data.keys()),
        "service_scores": service_scores,    # NEW: per-service breakdown
        "service_weights": SERVICE_WEIGHTS,  # NEW: for frontend display
    }