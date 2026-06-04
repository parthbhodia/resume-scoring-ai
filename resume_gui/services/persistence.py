"""Persist analyze results to Supabase."""
from __future__ import annotations

import logging

from resume_gui.auth.supabase import _supabase_table

logger = logging.getLogger("resume_gui")


def _analysis_label(result: dict, has_jd: bool, *, fallback: str = "General") -> str:
    """Build a short DB label from resumeHeader (list or str) or filename fallback."""
    header = result.get("resumeHeader")
    text = ""
    if isinstance(header, list):
        text = " | ".join(str(x).strip() for x in header if str(x).strip())
    elif isinstance(header, str):
        text = header.strip()
    elif header is not None:
        text = str(header).strip()
    if text:
        return text[:80]
    return "With JD" if has_jd else fallback


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
    label = _analysis_label(result, has_jd)
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

