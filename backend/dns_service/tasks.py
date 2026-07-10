import subprocess
import re
import requests
from shared.database import get_db
from shared.sse_utlits import publish_scan_update
from shared.orchestrator_client import record_service_result
import datetime
import shutil

# Fallback DNS resolvers
DNS_RESOLVERS = [
    None,  # System default
    '8.8.8.8',  # Google DNS
    '1.1.1.1',  # Cloudflare DNS
]

def run_dig(domain, record_type, resolver=None, timeout=3):
    """Run dig command with fallback resolver support"""
    if not shutil.which("dig"):
        return {"error": "dig command not found"}
        
    try:
        cmd = ["dig", "+short", "+time=2", "+tries=1"]
        if resolver:
            cmd.extend([f"@{resolver}"])
        cmd.extend([domain, record_type])
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        if result.returncode == 0 and result.stdout.strip():
            return {"success": True, "data": result.stdout.strip().split('\n'), "resolver": resolver or "system"}
        else:
            return {"success": False, "error": result.stderr or "No records found"}
            
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Timeout using resolver {resolver or 'system'}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def run_dig_with_fallback(domain, record_type, max_timeout=10):
    """Try multiple DNS resolvers until one succeeds (with overall timeout)"""
    import time
    start_time = time.time()
    
    for resolver in DNS_RESOLVERS:
        if time.time() - start_time > max_timeout:
            return None
            
        result = run_dig(domain, record_type, resolver, timeout=3)
        if result.get("success"):
            return result["data"]
    
    return []

def parse_txt_records(txt_records):
    """Parse and categorize TXT records into SPF, verification tokens, and other"""
    categorized = {
        "spf": [],
        "verification": {"google": [], "microsoft": [], "other": []},
        "dmarc": [],
        "other": []
    }
    
    for record in txt_records:
        record = record.strip('"')
        
        if record.startswith('v=spf1'):
            categorized["spf"].append(parse_spf_record(record))
        elif record.startswith('v=DMARC1'):
            categorized["dmarc"].append(record)
        elif 'google-site-verification' in record.lower():
            categorized["verification"]["google"].append(record)
        elif 'MS=' in record or 'ms-domain-verification' in record.lower():
            categorized["verification"]["microsoft"].append(record)
        elif any(x in record.lower() for x in ['verification', 'verify', 'domain-verify']):
            categorized["verification"]["other"].append(record)
        else:
            categorized["other"].append(record)
    
    return categorized

def parse_spf_record(spf_string):
    """Parse SPF record into readable components"""
    parts = spf_string.split()
    parsed = {
        "version": parts[0] if parts else "v=spf1",
        "ip4": [],
        "ip6": [],
        "include": [],
        "a": [],
        "mx": [],
        "all": ""
    }
    
    for part in parts[1:]:
        if part.startswith('ip4:'):
            parsed["ip4"].append(part.split(':', 1)[1])
        elif part.startswith('ip6:'):
            parsed["ip6"].append(part.split(':', 1)[1])
        elif part.startswith('include:'):
            parsed["include"].append(part.split(':', 1)[1])
        elif part.startswith('a:') or part == 'a':
            parsed["a"].append(part)
        elif part.startswith('mx:') or part == 'mx':
            parsed["mx"].append(part)
        elif part in ['-all', '~all', '?all', '+all']:
            parsed["all"] = part
    
    return parsed

def process_dns_scan(domain, scan_id):
    """
    Background task to perform DNS enumeration with fallback resolvers
    """
    db = get_db()
    publish_scan_update(domain, "dns", "processing")
    
    results = {}
    record_types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'SOA']
    errors = []
    
    try:
        import time
        overall_start = time.time()
        max_total_time = 60
        
        for r_type in record_types:
            if time.time() - overall_start > max_total_time:
                errors.append(f"DNS scan timeout exceeded, skipping remaining record types")
                break
                
            output = run_dig_with_fallback(domain, r_type, max_timeout=8)
            
            if output is None:
                errors.append(f"{r_type} records: Resolver timeout")
                results[r_type] = []
                continue
                
            filtered = [line for line in output if line]
            
            if r_type == 'TXT' and filtered:
                results['TXT'] = filtered
                results['TXT_parsed'] = parse_txt_records(filtered)
            else:
                results[r_type] = filtered
            
            if not filtered:
                errors.append(f"{r_type} records: Not found or resolver timeout")
        
        if errors:
            results['_warnings'] = errors
            
        record_service_result(scan_id, domain, "dns", status="completed", results=results)
        publish_scan_update(domain, "dns", "completed", results=results)
        return results
        
    except Exception as e:
        record_service_result(scan_id, domain, "dns", status="failed", error=str(e))
        publish_scan_update(domain, "dns", "failed", error=str(e))
        raise e