"""Fire-and-forget token usage logging."""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("resume_gui")


def log_usage_event(
    *,
    user_id: Optional[str],
    user_email: Optional[str],
    tool_name: str,
    model_used: Optional[str],
    prompt_tokens: Optional[int],
    completion_tokens: Optional[int],
    status: str = "ok",
    metadata: Optional[dict] = None,
) -> None:
    """Write a single row to usage_events. Silent on failure — never raises."""
    if not tool_name:
        return
    from resume_gui.auth.supabase import _supabase_table
    table = _supabase_table("usage_events")
    if table is None:
        return
    total = None
    if prompt_tokens is not None and completion_tokens is not None:
        total = prompt_tokens + completion_tokens
    row: dict = {
        "user_id": user_id or "anonymous",
        "user_email": user_email or None,
        "tool_name": tool_name,
        "model_used": model_used or None,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total,
        "token_source": "provider",
        "status": status,
    }
    if metadata:
        row["metadata"] = metadata
    try:
        table.insert(row).execute()
    except Exception as exc:
        logger.debug("usage_event insert failed (non-critical): %s", exc)
