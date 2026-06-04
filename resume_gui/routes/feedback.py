"""Bug report / user feedback route."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403


async def api_bug_report(request: Request):
    """POST /api/bug-report — save a bug report to Supabase."""
    user_id, user_email = _authenticated_supabase_user(request)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    title = (body.get("title") or "").strip()
    description = (body.get("description") or "").strip()
    category = (body.get("category") or "general").strip()
    page_url = (body.get("page_url") or "").strip() or None

    if not title:
        return JSONResponse({"error": "title is required"}, status_code=400)
    if not description:
        return JSONResponse({"error": "description is required"}, status_code=400)

    table = _supabase_table("bug_reports")
    if table is None:
        logger.warning("bug_reports table unavailable — report dropped")
        return JSONResponse({"error": "storage unavailable"}, status_code=503)

    try:
        row = {
            "title": title[:300],
            "description": description[:4000],
            "category": category[:80],
            "page_url": page_url,
            "user_id": user_id,
            "user_email": user_email,
        }
        resp = table.insert(row).execute()
        inserted = (resp.data or [{}])[0]
        return JSONResponse({"id": inserted.get("id"), "ok": True})
    except Exception as exc:
        logger.exception("bug_report insert failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
