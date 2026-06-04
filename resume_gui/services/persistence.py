"""Persist analyze results to Supabase."""
from __future__ import annotations

import logging

from resume_gui.auth.supabase import _supabase_table

logger = logging.getLogger("resume_gui")

def _persist_analysis(
    result: dict,
    user_id: str,
    user_email: str,
    has_jd: bool,
    *,
    analysis_id: str | None = None,
    source_pdf_url: str | None = None,
    source_filename: str | None = None,
) -> str | None:
    """Write analysis result to Supabase `resume_analyses` table for history + cohort stats."""
    table = _supabase_table("resume_analyses")
    if table is None:
        return None
    header = (result.get("resumeHeader") or "").strip()
    label  = header[:80] if header else ("With JD" if has_jd else "General")
    row = {
        "user_id":    user_id,
        "user_email": user_email or None,
        "label":      label,
        "score":      result.get("overallScore"),
        "result":     result,
    }
    if analysis_id:
        row["id"] = analysis_id
    if source_pdf_url:
        row["source_pdf_url"] = source_pdf_url
    if source_filename:
        row["source_filename"] = source_filename
    try:
        resp = table.insert(row).execute()
        rows = resp.data or []
        if rows and isinstance(rows[0], dict) and rows[0].get("id"):
            return str(rows[0]["id"])
        return analysis_id
    except Exception as exc:
        logger.warning("resume_analyses insert failed: %s", exc)
        return None

