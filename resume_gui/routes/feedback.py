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


async def api_admin_bug_reports(request: Request):
    """GET /api/admin/bug-reports — list bug reports (platform admins only)."""
    scope, scope_error = _advisor_scope_for_request(request)
    if scope_error is not None:
        return scope_error
    if not (scope or {}).get("global_admin"):
        return JSONResponse({"error": "forbidden"}, status_code=403)

    table = _supabase_table("bug_reports")
    if table is None:
        return JSONResponse({"error": "storage unavailable"}, status_code=503)

    try:
        limit_raw = (request.query_params.get("limit") or "50").strip()
        limit = max(1, min(100, int(limit_raw)))
    except ValueError:
        limit = 50

    try:
        resp = (
            table
            .select("id,user_id,user_email,category,title,description,page_url,created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = resp.data or []
        reports = [
            {
                "id": r.get("id"),
                "user_id": r.get("user_id"),
                "user_email": r.get("user_email"),
                "category": r.get("category"),
                "title": r.get("title"),
                "description": r.get("description"),
                "page_url": r.get("page_url"),
                "created_at": r.get("created_at"),
            }
            for r in rows
        ]
        return JSONResponse({"reports": reports, "count": len(reports)})
    except Exception as exc:
        logger.exception("admin bug_reports list failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
