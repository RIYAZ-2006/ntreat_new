import requests
import re
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.orchestrator_client import record_service_result

# ── constants ─────────────────────────────────────────────────────────────────

SECURITY_HEADERS = [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Resource-Policy",
    "Cross-Origin-Embedder-Policy",
    "Cross-Origin-Opener-Policy",
]

INFO_HEADERS = [
    "Server", "X-Powered-By", "X-AspNet-Version",
    "X-Generator", "X-Drupal-Cache", "X-Varnish", "Via",
]

DANGEROUS_PATHS = [
    "/.git/HEAD", "/.git/config", "/.env", "/config.php",
    "/backup.zip", "/database.sql", "/dump.sql", "/db.sql",
    "/swagger.json", "/api-docs", "/api-docs/swagger.json",
    "/openapi.json", "/.DS_Store", "/phpinfo.php", "/info.php",
    "/server-status", "/robots.txt", "/sitemap.xml",
    "/.htaccess", "/web.config", "/.travis.yml",
]

LOGIN_PATHS = [
    "/admin", "/admin/", "/administrator", "/login", "/signin",
    "/wp-admin", "/wp-login.php", "/user/login", "/auth/login",
    "/panel", "/cpanel", "/phpmyadmin", "/pma",
    "/dashboard", "/console", "/manager",
    "/api/v1/auth/login", "/api/auth/login",
]

ADMIN_PANEL_SIGNATURES = [
    r"dashboard", r"admin\s+panel", r"control\s+panel", r"management\s+console",
    r"site\s+administration", r"admin\s+home", r"admin\s+overview",
    r"adminlte", r"gentelella", r"tabler", r"forest-admin",
    r"wp-admin/admin-ajax\.php",
    r"drupal\.settings",
    r"joomla!.*administration",
    r"logout", r"log\s+out", r"sign\s+out",
    r"welcome.*admin", r"hello.*admin",
    r"manage\s+users", r"user\s+management",
    r"system\s+settings", r"site\s+settings",
    r"add\s+new\s+post", r"new\s+article",
    r"phpmyadmin", r"pma_navigation",
    r"swagger-ui", r"redoc", r"openapi",
]

LOGIN_WALL_SIGNATURES = [
    r"<input[^>]+type=['\"]password['\"]",
    r"sign\s+in\s+to\s+continue",
    r"please\s+log\s+in",
    r"authentication\s+required",
    r"you\s+must\s+be\s+logged\s+in",
    r"session\s+expired",
]

ADMIN_PANEL_MIN_BODY_SIZE = 800
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0 SecurityScanner/1.0"}

# ── http helpers ──────────────────────────────────────────────────────────────

def _get(url: str, timeout: int = 10):
    try:
        return requests.get(url, timeout=timeout, allow_redirects=True,
                            headers=REQUEST_HEADERS)
    except Exception:
        return None

def _head(url: str, timeout: int = 6):
    try:
        return requests.head(url, timeout=timeout, allow_redirects=True,
                             headers=REQUEST_HEADERS)
    except Exception:
        return None

# ── checkers ──────────────────────────────────────────────────────────────────

def check_security_headers(headers: dict) -> dict:
    results = {}
    for h in SECURITY_HEADERS:
        value = headers.get(h) or headers.get(h.lower())
        results[h] = {
            "present": bool(value),
            "value": value or None,
            "severity": "pass" if value else "high",
        }
    return results


def check_cookies(response) -> list:
    raw_cookies = []
    for k, v in response.raw.headers.items():
        if k.lower() == "set-cookie":
            raw_cookies.append(v)

    results = []
    for raw in raw_cookies:
        name = raw.split("=")[0].strip()
        flags = raw.lower()
        issues = []

        if "httponly" not in flags:
            issues.append({"flag": "HttpOnly missing", "severity": "high"})
        if "secure" not in flags:
            issues.append({"flag": "Secure missing", "severity": "high"})

        samesite = None
        m = re.search(r"samesite=(\w+)", flags)
        if m:
            samesite = m.group(1)
            if samesite == "none" and "secure" not in flags:
                issues.append({"flag": "SameSite=None without Secure", "severity": "high"})
        else:
            issues.append({"flag": "SameSite missing", "severity": "medium"})

        expires = None
        m2 = re.search(r"max-age=(\d+)", flags)
        if m2:
            expires = f"max-age={m2.group(1)}"
        else:
            m3 = re.search(r"expires=([^;]+)", raw, re.IGNORECASE)
            if m3:
                expires = m3.group(1).strip()

        severity = ("high" if any(i["severity"] == "high" for i in issues)
                    else "medium" if issues else "pass")

        results.append({
            "name": name,
            "httponly": "httponly" in flags,
            "secure": "secure" in flags,
            "samesite": samesite,
            "expires": expires,
            "issues": issues,
            "severity": severity,
        })
    return results


def check_cors(headers: dict, url: str) -> dict:
    acao = headers.get("Access-Control-Allow-Origin") or headers.get("access-control-allow-origin")
    acac = (headers.get("Access-Control-Allow-Credentials") or
            headers.get("access-control-allow-credentials", "")).lower()
    issues = []

    if acao == "*":
        issues.append({"issue": "Wildcard Access-Control-Allow-Origin", "severity": "medium"})
    if acao == "*" and acac == "true":
        issues.append({"issue": "Wildcard ACAO with credentials=true (critical misconfiguration)", "severity": "critical"})
    if acao and acao not in ("*", "null"):
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if acao != origin:
            issues.append({"issue": f"ACAO reflects cross-origin value: {acao}", "severity": "high"})

    sev_rank = ["pass", "low", "medium", "high", "critical"]
    severity = max((i["severity"] for i in issues),
                   key=lambda s: sev_rank.index(s),
                   default="pass")

    return {
        "access_control_allow_origin": acao,
        "credentials_allowed": acac or None,
        "issues": issues,
        "severity": severity,
    }


def check_info_disclosure(headers: dict) -> dict:
    results = {}
    for h in INFO_HEADERS:
        val = headers.get(h) or headers.get(h.lower())
        if val:
            has_version = bool(re.search(r"\d+\.\d+", val))
            results[h] = {
                "value": val,
                "version_exposed": has_version,
                "severity": "high" if has_version else "medium",
            }
    return results


def _probe_path(args):
    base_url, path, label = args
    url = base_url.rstrip("/") + path
    r = _head(url)
    if r and r.status_code in (200, 301, 302, 403):
        return {
            "path": path,
            "label": label,
            "status": r.status_code,
            "accessible": r.status_code == 200,
            "severity": (
                "critical" if r.status_code == 200 and path not in ("/robots.txt", "/sitemap.xml")
                else "medium" if r.status_code in (301, 302)
                else "low"
            ),
        }
    return None


def check_dangerous_files(base_url: str) -> list:
    args = [(base_url, p, p.split("/")[-1]) for p in DANGEROUS_PATHS]
    found = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        for result in as_completed([ex.submit(_probe_path, a) for a in args]):
            r = result.result()
            if r:
                found.append(r)
    return found


def _classify_admin_response(path: str, response) -> dict:
    body_size = len(response.content)
    body_text  = response.text.lower() if response.text else ""

    if body_size < ADMIN_PANEL_MIN_BODY_SIZE:
        return {
            "classification": "ambiguous",
            "reason": f"Response body too small ({body_size} bytes) to determine content",
            "body_size": body_size,
            "matched_signatures": [],
        }

    wall_hits = [sig for sig in LOGIN_WALL_SIGNATURES
                 if re.search(sig, body_text, re.IGNORECASE)]

    panel_hits = [sig for sig in ADMIN_PANEL_SIGNATURES
                  if re.search(sig, body_text, re.IGNORECASE)]

    if panel_hits and len(panel_hits) >= len(wall_hits):
        return {
            "classification": "exposed_panel",
            "reason": "Admin/dashboard UI rendered without authentication",
            "body_size": body_size,
            "matched_signatures": panel_hits,
        }

    if wall_hits:
        return {
            "classification": "login_wall",
            "reason": "Login form detected — access properly gated",
            "body_size": body_size,
            "matched_signatures": wall_hits,
        }

    return {
        "classification": "ambiguous",
        "reason": "200 response with substantial body but no clear admin or login markers",
        "body_size": body_size,
        "matched_signatures": [],
    }


def _probe_login_path(args) -> dict | None:
    base_url, path = args
    url = base_url.rstrip("/") + path

    head_r = _head(url)
    if not head_r or head_r.status_code not in (200, 301, 302, 403):
        return None

    status = head_r.status_code
    base_result = {
        "path": path,
        "url": url,
        "status": status,
    }

    if status in (301, 302):
        return {**base_result,
                "accessible": False,
                "classification": "redirect",
                "reason": f"Redirects to {head_r.headers.get('Location', 'unknown')}",
                "matched_signatures": [],
                "severity": "low"}

    if status == 403:
        return {**base_result,
                "accessible": False,
                "classification": "forbidden",
                "reason": "Server returned 403 — access blocked",
                "matched_signatures": [],
                "severity": "info"}

    get_r = _get(url)
    if not get_r:
        return {**base_result,
                "accessible": True,
                "classification": "ambiguous",
                "reason": "HEAD returned 200 but GET failed",
                "matched_signatures": [],
                "severity": "medium"}

    classification = _classify_admin_response(path, get_r)

    severity_map = {
        "exposed_panel": "critical",
        "login_wall":    "low",
        "ambiguous":     "medium",
    }

    return {
        **base_result,
        "accessible": True,
        "classification": classification["classification"],
        "reason": classification["reason"],
        "body_size": classification["body_size"],
        "matched_signatures": classification["matched_signatures"],
        "severity": severity_map[classification["classification"]],
    }


def check_login_pages(base_url: str) -> list:
    args = [(base_url, p) for p in LOGIN_PATHS]
    found = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(_probe_login_path, a) for a in args]
        for future in as_completed(futures):
            r = future.result()
            if r:
                found.append(r)
    return found

# ── scoring ───────────────────────────────────────────────────────────────────

def compute_score(results: dict) -> tuple[int, str]:
    deductions = 0

    for v in results["security_headers"].values():
        if not v["present"]:
            deductions += 5

    for c in results["cookies"]:
        if c["severity"] == "high":     deductions += 8
        elif c["severity"] == "medium": deductions += 4

    sev_map = {"pass": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    deductions += sev_map.get(results["cors"].get("severity", "pass"), 0) * 6

    for v in results["info_disclosure"].values():
        deductions += 5 if v["version_exposed"] else 2

    for f in results["dangerous_files"]:
        if f["accessible"]:               deductions += 15
        elif f["status"] in (301, 302):   deductions += 3

    for page in results["login_pages"]:
        cls = page.get("classification")
        if cls == "exposed_panel":
            deductions += 25
        elif cls == "ambiguous" and page.get("accessible"):
            deductions += 8

    score = max(0, 100 - deductions)
    grade = ("A" if score >= 90 else "B" if score >= 75 else
             "C" if score >= 60 else "D" if score >= 40 else "F")
    return score, grade

# ── master task ───────────────────────────────────────────────────────────────

def process_http_security_scan(domain: str, scan_id: str):
    db = get_db()
    publish_scan_update(domain, "http_security", "processing")

    try:
        url = f"https://{domain}"
        response = _get(url)

        if response is None:
            url = f"http://{domain}"
            response = _get(url)

        if response is None:
            raise ConnectionError(f"Unable to reach {domain} over HTTP or HTTPS")

        headers = dict(response.headers)

        results = {
            "url": response.url,
            "status_code": response.status_code,
            "security_headers": check_security_headers(headers),
            "cookies":          check_cookies(response),
            "cors":             check_cors(headers, url),
            "info_disclosure":  check_info_disclosure(headers),
            "dangerous_files":  check_dangerous_files(url),
            "login_pages":      check_login_pages(url),
        }

        results["score"], results["grade"] = compute_score(results)

        record_service_result(scan_id, domain, "http_security", status="completed", results=results)
        publish_scan_update(domain, "http_security", "completed", results=results)
        return results

    except Exception as e:
        record_service_result(scan_id, domain, "http_security", status="failed", error=str(e))
        publish_scan_update(domain, "http_security", "failed", error=str(e))
        raise