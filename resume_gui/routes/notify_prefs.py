"""
Notification preferences CRUD + Brevo sync.

GET  /api/profile/notify-prefs  → { accountChanges, scanLimit, features }
POST /api/profile/notify-prefs  → save prefs, sync features flag to Brevo
"""
from __future__ import annotations

import json
import logging

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from resume_gui.auth.supabase import get_current_user, get_supabase_client
from resume_gui.services import brevo

logger = logging.getLogger(__name__)

_DEFAULTS = {"accountChanges": True, "scanLimit": False, "features": False}


def _merge_prefs(stored: dict) -> dict:
    return {**_DEFAULTS, **stored}


async def api_get_notify_prefs(request: Request) -> JSONResponse:
    user = await get_current_user(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        supabase = get_supabase_client()
        row = (
            supabase.table("user_profiles")
            .select("notify_prefs")
            .eq("user_id", user["id"])
            .maybe_single()
            .execute()
        )
        stored = (row.data or {}).get("notify_prefs") or {}
        return JSONResponse(_merge_prefs(stored))
    except Exception as exc:
        logger.warning("get_notify_prefs failed: %s", exc)
        return JSONResponse(_DEFAULTS)


async def api_post_notify_prefs(request: Request) -> JSONResponse:
    user = await get_current_user(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    prefs = {
        "accountChanges": bool(body.get("accountChanges", _DEFAULTS["accountChanges"])),
        "scanLimit": bool(body.get("scanLimit", _DEFAULTS["scanLimit"])),
        "features": bool(body.get("features", _DEFAULTS["features"])),
    }

    try:
        supabase = get_supabase_client()
        supabase.table("user_profiles").upsert(
            {"user_id": user["id"], "notify_prefs": prefs},
            on_conflict="user_id",
        ).execute()
    except Exception as exc:
        logger.warning("save notify_prefs failed for %s: %s", user.get("id"), exc)
        return JSONResponse({"error": "Failed to save"}, status_code=500)

    # Sync features flag to Brevo (fire-and-forget — never blocks the response)
    email = user.get("email")
    if email:
        try:
            brevo.sync(email, features=prefs["features"])
        except Exception as exc:
            logger.warning("Brevo sync failed for %s: %s", email, exc)

    return JSONResponse({"ok": True, "prefs": prefs})


# Route definitions
route_get = Route("/api/profile/notify-prefs", api_get_notify_prefs, methods=["GET"])
route_post = Route("/api/profile/notify-prefs", api_post_notify_prefs, methods=["POST"])
