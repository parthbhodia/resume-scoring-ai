"""Persist analyze results to Supabase."""
from __future__ import annotations

import logging

from resume_gui.auth.supabase import _supabase_table

logger = logging.getLogger("resume_gui")

def _persist_analysis(result: dict, user_id: str, user_email: str, has_jd: bool) -> None:
    """Write analysis result to Supabase `resume_analyses` table for history + cohort stats."""
    table = _supabase_table("resume_analyses")
    if table is None:
        return
    header = (result.get("resumeHeader") or "").strip()
    label  = header[:80] if header else ("With JD" if has_jd else "General")
    row = {
        "user_id":    user_id,
        "user_email": user_email or None,
        "label":      label,
        "score":      result.get("overallScore"),
        "result":     result,
    }
    try:
        table.insert(row).execute()
    except Exception as exc:
        logger.warning("resume_analyses insert failed: %s", exc)

