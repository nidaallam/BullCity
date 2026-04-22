#!/usr/bin/env python3
"""
check_resources.py — Durham Civic Hub
Checks all URLs in data/resources.json for broken links (4xx/5xx or timeouts).
Writes a broken-links report to data/resource-health.json.
Runs daily via GitHub Actions; only writes output when something changes.
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).parent.parent
RESOURCES_PATH = ROOT / "data" / "resources.json"
REPORT_PATH    = ROOT / "data" / "resource-health.json"

HEADERS = {
    "User-Agent": (
        "DurhamCivicHub/1.0 (https://civichub.nidaallam.com; "
        "nonprofit/government link checker)"
    ),
}
TIMEOUT    = 12
SLEEP_SEC  = 0.4   # polite delay between requests


def check_url(url: str) -> dict:
    try:
        r = requests.head(url, headers=HEADERS, timeout=TIMEOUT,
                          allow_redirects=True)
        if r.status_code == 405:
            # Some servers don't allow HEAD — retry with GET, read 1 byte
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT,
                             stream=True, allow_redirects=True)
            r.raw.read(1)
        status = r.status_code
        ok = 200 <= status < 400
        return {"url": url, "status": status, "ok": ok}
    except requests.exceptions.SSLError:
        return {"url": url, "status": 0, "ok": False, "error": "SSL error"}
    except requests.exceptions.ConnectionError:
        return {"url": url, "status": 0, "ok": False, "error": "Connection error"}
    except requests.exceptions.Timeout:
        return {"url": url, "status": 0, "ok": False, "error": "Timeout"}
    except Exception as e:
        return {"url": url, "status": 0, "ok": False, "error": str(e)[:80]}


def collect_urls(resources: dict) -> list[tuple[str, str, str]]:
    """Return list of (category_id, resource_name, url)."""
    pairs = []
    for cat in resources.get("categories", []):
        cat_id = cat.get("id", "")
        for card in cat.get("cards", []):
            url = card.get("url", "").strip()
            name = card.get("name", url)
            if url and url.startswith("http"):
                pairs.append((cat_id, name, url))
    return pairs


def load_existing_report() -> dict:
    if REPORT_PATH.exists():
        try:
            return json.loads(REPORT_PATH.read_text())
        except Exception:
            pass
    return {"checked": "", "broken": [], "total": 0}


def main():
    print("Checking resource links…")
    resources = json.loads(RESOURCES_PATH.read_text())
    pairs = collect_urls(resources)
    print(f"  {len(pairs)} URLs to check")

    broken = []
    for cat_id, name, url in pairs:
        result = check_url(url)
        if not result["ok"]:
            entry = {
                "category": cat_id,
                "name":     name,
                "url":      url,
                "status":   result["status"],
            }
            if "error" in result:
                entry["error"] = result["error"]
            broken.append(entry)
            flag = result.get("error") or str(result["status"])
            print(f"  ✗ [{flag}] {name} — {url}")
        time.sleep(SLEEP_SEC)

    today = date.today().isoformat()
    report = {
        "checked": today,
        "total":   len(pairs),
        "broken":  broken,
    }

    existing = load_existing_report()
    if (existing.get("broken") == broken and
            existing.get("total") == len(pairs)):
        print(f"  No change in link health ({len(pairs)} checked, "
              f"{len(broken)} broken). Skipping write.")
        return

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    if broken:
        print(f"\n  ⚠ {len(broken)} broken link(s) found — see data/resource-health.json")
    else:
        print(f"  ✓ All {len(pairs)} links OK")


if __name__ == "__main__":
    main()
