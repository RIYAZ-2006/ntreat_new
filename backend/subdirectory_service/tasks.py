import subprocess
import shutil
import os
import re
import requests
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.orchestrator_client import record_service_result

DIR_LISTING_SIGNATURES = [
    r"index of /",
    r"<title>index of",
    r"directory listing for",
    r"\[to parent directory\]",
]


def run_gobuster_scan(base_url, wordlist_path, timeout=300):
    """
    Run gobuster with a specific wordlist
    Returns: (found_paths, status_counts)
    """
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

    cmd = [
        "gobuster", "dir",
        "-u", base_url,
        "-w", wordlist_path,
        "-q",
        "-t", "20",
        "--no-progress"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

    if result.returncode == 1 and "To continue please exclude the status code or the length" in result.stderr:
        match = re.search(r'\(Length: (\d+)\)', result.stderr)
        if match:
            exclude_length = match.group(1)
            cmd.extend(["--exclude-length", exclude_length])
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

    elif result.returncode == 0:
        size_count = {}
        total_200 = 0
        for line in result.stdout.split('\n'):
            line = ansi_escape.sub('', line.strip())
            if '(Status: 200)' in line and '[Size:' in line:
                total_200 += 1
                size_match = re.search(r'\[Size: (\d+)\]', line)
                if size_match:
                    size = size_match.group(1)
                    size_count[size] = size_count.get(size, 0) + 1

        if total_200 > 10:
            for size, count in size_count.items():
                if count / total_200 > 0.8:
                    cmd.extend(["--exclude-length", size])
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
                    break

    found_paths = []
    status_counts = {'200': 0, '301': 0, '302': 0, '403': 0, '404': 0, 'other': 0}

    for line in result.stdout.split('\n'):
        line = ansi_escape.sub('', line.strip())
        if not line or line.startswith('=') or line.startswith('['):
            continue

        if '(Status:' in line:
            parts = line.split('(Status:')
            if len(parts) >= 2:
                path = parts[0].strip()
                status_part = parts[1].split(')')[0].strip()

                size = None
                if '[Size:' in line:
                    size_part = line.split('[Size:')[1].split(']')[0].strip()
                    size = size_part

                if status_part in status_counts:
                    status_counts[status_part] += 1
                else:
                    status_counts['other'] += 1

                found_paths.append({
                    "path": path,
                    "url": f"{base_url}{path}",
                    "status_code": status_part,
                    "size": size
                })

    return found_paths, status_counts


def count_wordlist_entries(wordlist_path):
    try:
        with open(wordlist_path, 'r') as f:
            return sum(1 for line in f if line.strip() and not line.startswith('#'))
    except:
        return 0


def check_directory_listing(paths):
    """
    For any 200-status path that looks like a directory (ends in '/'),
    fetch it and check the body for classic 'Index of /' style markers.
    Capped at 15 checks to avoid excessive requests on large result sets.
    """
    listing_found = []
    candidates = [p for p in paths if p['status_code'] == '200' and p['path'].endswith('/')][:15]

    for p in candidates:
        try:
            resp = requests.get(p['url'], timeout=5)
            body_lower = resp.text.lower()
            if any(re.search(sig, body_lower) for sig in DIR_LISTING_SIGNATURES):
                listing_found.append(p['path'])
        except Exception:
            continue

    return listing_found


def process_subdirectory_scan(domain, scan_id, aggressive=False):
    db = get_db()
    publish_scan_update(domain, "subdirectory", "processing")

    if not shutil.which("gobuster"):
        record_service_result(scan_id, domain, "subdirectory", status="failed", error="gobuster not installed")
        publish_scan_update(domain, "subdirectory", "failed", error="gobuster not installed")
        return

    try:
        base_url = None
        for protocol in ["https://", "http://"]:
            test_url = f"{protocol}{domain}"
            try:
                result = subprocess.run(
                    ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", test_url],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.stdout and int(result.stdout) < 500:
                    base_url = test_url
                    break
            except:
                continue

        if not base_url:
            raise Exception("Could not connect to domain via HTTP or HTTPS")

        service_dir = os.path.dirname(__file__)
        wordlists = {
            'common': os.path.join(service_dir, 'pathlist', 'common.txt'),
            'small': os.path.join(service_dir, 'pathlist', 'raft-small-directories.txt'),
            'medium': os.path.join(service_dir, 'pathlist', 'raft-medium-directories.txt')
        }

        if not os.path.exists(wordlists['common']):
            raise Exception(f"Required wordlist not found: {wordlists['common']}")

        all_paths = []
        all_status_counts = {'200': 0, '301': 0, '302': 0, '403': 0, '404': 0, 'other': 0}
        total_tested = 0
        wordlists_used = []
        phase_reached = 1

        publish_scan_update(domain, "subdirectory", "processing")

        phase1_paths, phase1_status = run_gobuster_scan(base_url, wordlists['common'], timeout=180)
        phase1_tested = count_wordlist_entries(wordlists['common'])

        all_paths.extend(phase1_paths)
        for key in all_status_counts:
            all_status_counts[key] += phase1_status.get(key, 0)
        total_tested += phase1_tested
        wordlists_used.append({"name": "common.txt", "entries": phase1_tested, "phase": 1})

        valid_dirs_found = phase1_status.get('200', 0) + phase1_status.get('301', 0) + \
                          phase1_status.get('302', 0) + phase1_status.get('403', 0)

        if valid_dirs_found > 0 and os.path.exists(wordlists['small']):
            phase_reached = 2
            publish_scan_update(domain, "subdirectory", "processing")

            phase2_paths, phase2_status = run_gobuster_scan(base_url, wordlists['small'], timeout=300)
            phase2_tested = count_wordlist_entries(wordlists['small'])

            all_paths.extend(phase2_paths)
            for key in all_status_counts:
                all_status_counts[key] += phase2_status.get(key, 0)
            total_tested += phase2_tested
            wordlists_used.append({"name": "raft-small-directories.txt", "entries": phase2_tested, "phase": 2})

        if aggressive and valid_dirs_found > 0 and os.path.exists(wordlists['medium']):
            phase_reached = 3
            publish_scan_update(domain, "subdirectory", "processing")

            phase3_paths, phase3_status = run_gobuster_scan(base_url, wordlists['medium'], timeout=540)
            phase3_tested = count_wordlist_entries(wordlists['medium'])

            all_paths.extend(phase3_paths)
            for key in all_status_counts:
                all_status_counts[key] += phase3_status.get(key, 0)
            total_tested += phase3_tested
            wordlists_used.append({"name": "raft-medium-directories.txt", "entries": phase3_tested, "phase": 3})

        found_count = sum(all_status_counts[k] for k in ['200', '301', '302', '403', 'other'])
        all_status_counts['404'] = max(0, total_tested - found_count)

        unique_paths = {}
        for path in all_paths:
            unique_paths[path['path']] = path
        all_paths = list(unique_paths.values())

        directory_listings = check_directory_listing(all_paths)

        results = {
            "found_paths": all_paths,
            "exposed_paths": [p['path'] for p in all_paths if p['status_code'] in ('200', '301', '302', '403')],
            "directory_listings": directory_listings,
            "count": len(all_paths),
            "base_url": base_url,
            "phase_reached": phase_reached,
            "wordlists_used": wordlists_used,
            "total_tested": total_tested,
            "status_counts": all_status_counts,
            "aggressive_mode": aggressive
        }

        record_service_result(scan_id, domain, "subdirectory", status="completed", results=results)
        publish_scan_update(domain, "subdirectory", "completed",
                          results={"count": len(all_paths), "phase_reached": phase_reached})
        return all_paths

    except subprocess.TimeoutExpired:
        record_service_result(scan_id, domain, "subdirectory", status="failed", error="Scan timeout")
        publish_scan_update(domain, "subdirectory", "failed", error="Scan timeout")
        raise
    except Exception as e:
        record_service_result(scan_id, domain, "subdirectory", status="failed", error=str(e))
        publish_scan_update(domain, "subdirectory", "failed", error=str(e))
        raise e