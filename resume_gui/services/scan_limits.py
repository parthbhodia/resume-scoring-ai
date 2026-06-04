"""Daily scan-limit policy enforcement."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from resume_gui.auth.supabase import _supabase_table


def _csv_set(raw: str) -> set[str]:
    return {part.strip().lower() for part in (raw or "").split(",") if part.strip()}


def _daily_scan_limit() -> int:
    raw = (os.environ.get("FREE_SCAN_DAILY_LIMIT") or "5").strip()
    try:
        value = int(raw)
    except ValueError:
        value = 5
    return max(1, value)


def _unlimited_domains() -> set[str]:
    return _csv_set(os.environ.get("UNLIMITED_SCAN_EMAIL_DOMAINS", "umbc.edu"))


def _unlimited_institution_slugs() -> set[str]:
    return _csv_set(os.environ.get("UNLIMITED_SCAN_INSTITUTION_SLUGS", "umbc"))


def _email_domain(email: Optional[str]) -> str:
    value = (email or "").strip().lower()
    if "@" not in value:
        return ""
    return value.rsplit("@", 1)[1]


def _utc_day_window(now: Optional[datetime] = None) -> tuple[str, str]:
    current = now or datetime.now(timezone.utc)
    start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return (
        start.isoformat().replace("+00:00", "Z"),
        end.isoformat().replace("+00:00", "Z"),
    )


def _user_in_unlimited_institution(user_id: str, user_email: Optional[str]) -> bool:
    domain = _email_domain(user_email)
    if domain and domain in _unlimited_domains():
        return True

    students_table = _supabase_table("institution_students")
    institutions_table = _supabase_table("institutions")
    if students_table is None or institutions_table is None:
        return False

    institution_ids: set[str] = set()
    try:
        by_user = (
            students_table
            .select("institution_id")
            .eq("student_user_id", user_id)
            .execute()
        )
        for row in (by_user.data or []):
            iid = row.get("institution_id")
            if iid:
                institution_ids.add(str(iid))
    except Exception:
        pass

    normalized_email = (user_email or "").strip().lower()
    if normalized_email:
        try:
            by_email = (
                students_table
                .select("institution_id")
                .eq("student_email", normalized_email)
                .execute()
            )
            for row in (by_email.data or []):
                iid = row.get("institution_id")
                if iid:
                    institution_ids.add(str(iid))
        except Exception:
            pass

    if not institution_ids:
        return False

    try:
        institution_rows = (
            institutions_table
            .select("slug,email_domain")
            .in_("id", sorted(institution_ids))
            .execute()
        )
        allowed_slugs = _unlimited_institution_slugs()
        allowed_domains = _unlimited_domains()
        for row in (institution_rows.data or []):
            slug = str(row.get("slug") or "").strip().lower()
            email_domain = str(row.get("email_domain") or "").strip().lower()
            if slug and slug in allowed_slugs:
                return True
            if email_domain and email_domain in allowed_domains:
                return True
    except Exception:
        return False
    return False


def _daily_scan_count(user_id: str) -> tuple[int, str]:
    analyses_table = _supabase_table("resume_analyses")
    _, day_end = _utc_day_window()
    if analyses_table is None:
        return 0, day_end
    day_start, day_end = _utc_day_window()
    try:
        rows = (
            analyses_table
            .select("id")
            .eq("user_id", user_id)
            .gte("created_at", day_start)
            .lt("created_at", day_end)
            .limit(max(_daily_scan_limit(), 1) + 1)
            .execute()
        )
        return len(rows.data or []), day_end
    except Exception:
        return 0, day_end


def _scan_limit_status_for_user(user_id: Optional[str], user_email: Optional[str]) -> dict:
    if not user_id:
        return {
            "enforced": False,
            "allowed": True,
            "reason": "anonymous_or_unverified",
            "limit": None,
            "used": None,
            "resetAt": None,
        }

    if _user_in_unlimited_institution(user_id, user_email):
        return {
            "enforced": True,
            "allowed": True,
            "reason": "unlimited_institution",
            "limit": None,
            "used": None,
            "resetAt": None,
        }

    daily_limit = _daily_scan_limit()
    used, reset_at = _daily_scan_count(user_id)
    return {
        "enforced": True,
        "allowed": used < daily_limit,
        "reason": "daily_free_tier_limit",
        "limit": daily_limit,
        "used": used,
        "resetAt": reset_at,
    }
