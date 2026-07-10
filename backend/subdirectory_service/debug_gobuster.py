#!/usr/bin/env python3
"""Debug script to test gobuster execution and parsing"""

import subprocess
import sys

def test_gobuster(domain, wordlist_path):
    """Test gobuster command execution and output parsing"""
    
    import re
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
    
    base_url = f"https://{domain}"
    
    print(f"[1] Testing gobuster command...")
    print(f"    URL: {base_url}")
    print(f"    Wordlist: {wordlist_path}")
    print()
    
    # Run gobuster
    cmd = [
        "gobuster", "dir",
        "-u", base_url,
        "-w", wordlist_path,
        "-q",
        "-t", "20",
        "--no-progress"
    ]
    
    print(f"[2] Executing command:")
    print(f"    {' '.join(cmd)}")
    print()
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    
    print(f"[3] Return code: {result.returncode}")
    print()
    
    # Check if we need to exclude length (custom error page detection)
    if result.returncode == 1 and "To continue please exclude the status code or the length" in result.stderr:
        print(f"[3.1] Method 1: Detected custom error page from stderr!")
        match = re.search(r'\(Length: (\d+)\)', result.stderr)
        if match:
            exclude_length = match.group(1)
            print(f"      Found length: {exclude_length}")
            cmd.extend(["--exclude-length", exclude_length])
            print(f"[3.2] Retrying with: {' '.join(cmd)}")
            print()
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            print(f"[3.3] Retry return code: {result.returncode}")
            print()
    
    # Method 2: Detect uniform response sizes
    elif result.returncode == 0:
        print(f"[3.1] Method 2: Checking for uniform response sizes...")
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
        
        print(f"      Total 200 responses: {total_200}")
        print(f"      Size distribution: {size_count}")
        
        if total_200 > 10:
            for size, count in size_count.items():
                percentage = (count / total_200) * 100
                print(f"        Size {size}: {count} ({percentage:.1f}%)")
                if count / total_200 > 0.8:
                    print(f"      Detected {percentage:.1f}% same size - custom error page!")
                    cmd.extend(["--exclude-length", size])
                    print(f"[3.2] Retrying with: {' '.join(cmd)}")
                    print()
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                    print(f"[3.3] Retry return code: {result.returncode}")
                    print()
                    break
    
    print(f"[4] STDOUT length: {len(result.stdout)} bytes")
    print(f"[5] STDERR length: {len(result.stderr)} bytes")
    print()
    
    if result.stderr:
        print(f"[6] STDERR content:")
        print(result.stderr)
        print()
    
    print(f"[7] STDOUT content (first 2000 chars):")
    print(result.stdout[:2000])
    print()
    
    # Parse output
    print(f"[8] Parsing output...")
    found_paths = []
    status_counts = {'200': 0, '301': 0, '302': 0, '403': 0, '404': 0, 'other': 0}
    
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
    lines = result.stdout.split('\n')
    print(f"    Total lines: {len(lines)}")
    
    for idx, line in enumerate(lines):
        # Strip ANSI codes first
        original_line = line
        line = ansi_escape.sub('', line.strip())
        if not line or line.startswith('=') or line.startswith('['):
            continue
        
        # Try to extract path and status
        if '(Status:' in line:
            parts = line.split('(Status:')
            if len(parts) >= 2:
                path = parts[0].strip()
                status_part = parts[1].split(')')[0].strip()
                
                # Extract size if present
                size = None
                if '[Size:' in line:
                    size_part = line.split('[Size:')[1].split(']')[0].strip()
                    size = size_part
                
                # Track status code counts
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
                
                if len(found_paths) <= 5:  # Show first 5
                    print(f"    Line {idx}: {line[:100]}")
                    print(f"      -> Path: {path}, Status: {status_part}, Size: {size}")
    
    print()
    print(f"[9] Results:")
    print(f"    Total paths found: {len(found_paths)}")
    print(f"    Status counts: {status_counts}")
    print()
    
    if found_paths:
        print(f"[10] Sample results (first 3):")
        for p in found_paths[:3]:
            print(f"    {p}")
    
    return found_paths, status_counts


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_gobuster.py <domain> [wordlist_path]")
        print("Example: python debug_gobuster.py www.cdac.in")
        sys.exit(1)
    
    domain = sys.argv[1]
    wordlist = sys.argv[2] if len(sys.argv) > 2 else "/home/pallavi/Desktop/ntreat/backend/subdirectory_service/pathlist/common.txt"
    
    test_gobuster(domain, wordlist)
