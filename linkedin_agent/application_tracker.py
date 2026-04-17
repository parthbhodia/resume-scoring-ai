"""
Application Tracker — persists job applications to a local JSON file.

Tracks: job_id, title, company, url, status, applied_date, notes, resume_path.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional

# Store next to this repo
_TRACKER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "applications.json"
)


def _load() -> List[Dict]:
    if not os.path.exists(_TRACKER_PATH):
        return []
    with open(_TRACKER_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(apps: List[Dict]) -> None:
    with open(_TRACKER_PATH, "w", encoding="utf-8") as f:
        json.dump(apps, f, indent=2)


def add_application(
    job_id: str,
    title: str,
    company: str,
    url: str = "",
    status: str = "applied",
    notes: str = "",
    resume_path: str = "",
    cover_letter_path: str = "",
) -> Dict:
    """Add or update a tracked application. Returns the saved record."""
    apps = _load()

    # Update if already tracked
    for app in apps:
        if app["job_id"] == job_id:
            app.update(
                {
                    "status": status,
                    "notes": notes or app.get("notes", ""),
                    "last_updated": datetime.now().isoformat(),
                    "resume_path": resume_path or app.get("resume_path", ""),
                    "cover_letter_path": cover_letter_path
                    or app.get("cover_letter_path", ""),
                }
            )
            _save(apps)
            return app

    # New application
    record = {
        "job_id": job_id,
        "title": title,
        "company": company,
        "url": url,
        "status": status,
        "applied_date": datetime.now().strftime("%Y-%m-%d"),
        "last_updated": datetime.now().isoformat(),
        "notes": notes,
        "resume_path": resume_path,
        "cover_letter_path": cover_letter_path,
    }
    apps.append(record)
    _save(apps)
    return record


def get_applications(status_filter: Optional[str] = None) -> List[Dict]:
    """Return all tracked applications, optionally filtered by status."""
    apps = _load()
    if status_filter:
        apps = [a for a in apps if a.get("status") == status_filter]
    return sorted(apps, key=lambda a: a.get("applied_date", ""), reverse=True)


def update_status(job_id: str, new_status: str, notes: str = "") -> Optional[Dict]:
    """Update status of an existing application. Returns updated record or None."""
    apps = _load()
    for app in apps:
        if app["job_id"] == job_id:
            app["status"] = new_status
            app["last_updated"] = datetime.now().isoformat()
            if notes:
                app["notes"] = notes
            _save(apps)
            return app
    return None


def get_summary() -> Dict:
    """Return a status-count summary of all applications."""
    apps = _load()
    summary: Dict[str, int] = {}
    for app in apps:
        s = app.get("status", "unknown")
        summary[s] = summary.get(s, 0) + 1
    return {
        "total": len(apps),
        "by_status": summary,
        "tracker_file": _TRACKER_PATH,
    }
