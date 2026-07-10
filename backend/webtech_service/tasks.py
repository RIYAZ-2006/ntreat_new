# tasks.py
from __future__ import annotations

import os
import sys

_HERE   = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.abspath(os.path.join(_HERE, ".."))

if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

import datetime
import json
import subprocess
import requests
from typing import Optional

from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.config import Config

_DRIVER  = os.path.join(_HERE, "driver.js")
_EXT_DIR = os.environ.get("WAPPALYZER_EXT_DIR", os.path.join(_HERE, "6.12.2_0"))

_CDN_NAMES = {
    "cloudflare", "akamai", "fastly", "amazon cloudfront", "cloudfront",
    "amazon s3", "azure cdn", "google cloud cdn", "sucuri", "incapsula",
    "stackpath", "keycdn", "bunny cdn", "limelight", "edgecast",
}


# ── Step 1: Run driver.js ─────────────────────────────────────────────────────

def run_driver_js(target_url: str) -> dict:
    try:
        proc = subprocess.run(
            ["node", _DRIVER, target_url, _EXT_DIR],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if proc.returncode != 0:
            return {"error": proc.stderr.strip() or "driver.js exited with non-zero status"}

        output = proc.stdout.strip()
        if not output:
            return {"error": "driver.js produced no output"}

        return json.loads(output)

    except subprocess.TimeoutExpired:
        return {"error": "driver.js timed out after 60s"}
    except json.JSONDecodeError as e:
        return {"error": f"driver.js returned invalid JSON: {e}"}
    except FileNotFoundError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}


# ── Step 2: Normalise evidence ────────────────────────────────────────────────

def _parse_evidence(raw_evidence: list) -> list[dict]:
    parsed = []
    for ev in raw_evidence:
        if isinstance(ev, dict):
            parsed.append(ev)
        elif isinstance(ev, str) and ev.strip():
            parts = ev.split(":", 1)
            parsed.append({
                "type":  parts[0].strip(),
                "value": parts[1].strip() if len(parts) > 1 else ev.strip(),
            })
    return parsed


# ── Step 3: Parse detections into schema shape ────────────────────────────────

def parse_detections(detections: list[dict]) -> list[dict]:
    technologies = []

    for d in detections:
        name = d.get("name", "").strip()
        if not name:
            continue

        categories = d.get("categories", [])
        category   = categories[0] if categories else "Other"

        evidence = _parse_evidence(d.get("evidence", []))

        technologies.append({
            "name":       name,
            "category":   category,
            "confidence": int(d.get("confidence", 0)),
            "version":    d.get("version") or "",
            "evidence":   evidence,
        })

    technologies.sort(key=lambda t: (-t["confidence"], t["name"].lower()))
    return technologies


# ── Step 4: Detect CDN from technology list ───────────────────────────────────

def _detect_cdn(technologies: list[dict]) -> tuple[bool, Optional[str]]:
    for tech in technologies:
        if tech["name"].lower() in _CDN_NAMES:
            return True, tech["name"]
        if "cdn" in tech["category"].lower():
            return True, tech["name"]
    return False, None


# ── Step 5: Assess coverage ───────────────────────────────────────────────────

def assess_coverage(
    technologies: list[dict],
    navigation_ok: bool,
    cdn_detected: bool,
    cdn_name: Optional[str],
) -> tuple[str, Optional[str]]:
    if not navigation_ok:
        return "partial", "Page did not fully load; results may be incomplete."
    if cdn_detected:
        return "partial", f"Target is behind {cdn_name}. Origin stack may be obscured."
    if not technologies:
        return "minimal", (
            "No technologies detected. "
            "Possible causes: CDN, aggressive header suppression, or heavy CSP."
        )
    if all(t["confidence"] < 50 for t in technologies):
        return "low-confidence", "All detections are weak signals. Treat with caution."
    return "full", None


# ── Step 6: Core detection orchestrator ──────────────────────────────────────

def detect_technologies(domain: str) -> dict:
    url = f"https://{domain}"

    payload = run_driver_js(url)

    if "error" in payload and "detections" not in payload:
        return {
            "url":          url,
            "technologies": [],
            "count":        0,
            "coverage":     "error",
            "cdn_detected": False,
            "cdn_name":     None,
            "note":         f"Scan failed: {payload['error']}",
            "error":        payload["error"],
        }

    technologies = parse_detections(payload.get("detections", []))
    cdn_detected, cdn_name = _detect_cdn(technologies)

    navigation_ok  = payload.get("navigationSuccess", True)
    coverage, note = assess_coverage(technologies, navigation_ok, cdn_detected, cdn_name)

    return {
        "url":          payload.get("finalUrl", url),
        "technologies": technologies,
        "count":        len(technologies),
        "coverage":     coverage,
        "cdn_detected": cdn_detected,
        "cdn_name":     cdn_name,
        "note":         note,
    }


# ── Orchestrator callback ─────────────────────────────────────────────────────

def _notify_orchestrator(scan_id, domain, service):
    try:
        requests.post(f"{Config.ORCHRESTATOR_SERVICE_URL}/job-done", json={
            "scan_id": scan_id,
            "domain": domain,
            "service": service
        }, timeout=5)
    except requests.exceptions.RequestException:
        print(f"[_notify_orchestrator] FAILED to reach {Config.ORCHRESTATOR_SERVICE_URL}/job-done for {domain}/{service}: {e}")


# ── RQ worker entry point ─────────────────────────────────────────────────────

def process_webtech_scan(domain: str, scan_id: str) -> None:
    """RQ task — detect, persist to MongoDB, emit SSE."""
    db    = get_db()
    scans = db["scans"]

    scans.update_one(
        {"scan_id": scan_id},
        {"$set": {
            "status":     "processing",
            "started_at": datetime.datetime.utcnow(),
        }},
    )
    publish_scan_update(domain, "webtech", "processing")

    try:
        result = detect_technologies(domain)

        scans.update_one(
            {"scan_id": scan_id},
            {"$set": {
                "status":       "completed",
                "results":      result,
                "service":      "webtech",
                "completed_at": datetime.datetime.utcnow(),
            }},
        )
        publish_scan_update(domain, "webtech", "completed")
        _notify_orchestrator(scan_id, domain, "webtech")

    except Exception as exc:
        scans.update_one(
            {"scan_id": scan_id},
            {"$set": {
                "status":       "failed",
                "error":        str(exc),
                "completed_at": datetime.datetime.utcnow(),
            }},
        )
        publish_scan_update(domain, "webtech", "failed")
        _notify_orchestrator(scan_id, domain, "webtech")
        raise