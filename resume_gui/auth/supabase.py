"""Supabase client, bearer auth, and advisor scope checks."""
from __future__ import annotations

import logging
import os
import random
import secrets
import string
from typing import Any, Optional, Tuple

from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("resume_gui")

_SHORTID_ALPHABET = string.ascii_lowercase + string.digits


def _gen_shortid(n: int = 8) -> str:
    return "".join(secrets.choice(_SHORTID_ALPHABET) for _ in range(n))


def _share_table():
    """Return the supabase share_links table or None if storage isn't configured."""
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return None
        return client.table("share_links")
    except Exception as exc:
        logger.warning(f"share_table unavailable: {exc}")
        return None


def _supabase_table(table_name: str):
    """Return a Supabase table handle via service-role client, else None."""
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return None
        return client.table(table_name)
    except Exception as exc:
        logger.warning(f"supabase table unavailable [{table_name}]: {exc}")
        return None


def _supabase_client_for_service_role():
    """Return the shared Supabase service-role client, else None."""
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        return _get_client()
    except Exception as exc:
        logger.warning("supabase client unavailable: %s", exc)
        return None


def _bearer_token_from_request(request: Request) -> str:
    raw = (request.headers.get("authorization") or "").strip()
    if not raw.lower().startswith("bearer "):
        return ""
    return raw.split(" ", 1)[1].strip()


def _value_from_obj(obj: Any, key: str) -> Optional[str]:
    if obj is None:
        return None
    if isinstance(obj, dict):
        value = obj.get(key)
    else:
        value = getattr(obj, key, None)
    return str(value).strip() if value is not None and str(value).strip() else None


def _authenticated_supabase_user(request: Request) -> Tuple[Optional[str], Optional[str]]:
    """Verify the browser's Supabase JWT and return (user_id, email)."""
    token = _bearer_token_from_request(request)
    if not token:
        return None, None
    client = _supabase_client_for_service_role()
    if client is None:
        return None, None
    try:
        resp = client.auth.get_user(token)
        user_obj = getattr(resp, "user", None)
        if user_obj is None and isinstance(resp, dict):
            user_obj = resp.get("user")
        user_id = _value_from_obj(user_obj, "id")
        email = _value_from_obj(user_obj, "email")
        return user_id, (email.lower() if email else None)
    except Exception as exc:
        logger.warning("supabase auth token verification failed: %s", exc)
        return None, None


def _advisor_scope_for_request(request: Request) -> Tuple[Optional[dict], Optional[JSONResponse]]:
    """Return institution/student scope for an authenticated advisor."""
    advisor_user_id, advisor_email = _authenticated_supabase_user(request)
    if not advisor_user_id or not advisor_email:
        return None, JSONResponse({"error": "authentication required"}, status_code=401)

    advisor_table = _supabase_table("institution_advisors")
    institution_table = _supabase_table("institutions")
    student_table = _supabase_table("institution_students")
    if advisor_table is None or institution_table is None or student_table is None:
        return None, JSONResponse({"error": "advisor access schema unavailable"}, status_code=503)

    try:
        memberships: list[dict] = []
        by_email = (
            advisor_table
            .select("institution_id,advisor_email,advisor_user_id,role")
            .eq("active", True)
            .eq("advisor_email", advisor_email)
            .execute()
        )
        memberships.extend(by_email.data or [])

        by_user = (
            advisor_table
            .select("institution_id,advisor_email,advisor_user_id,role")
            .eq("active", True)
            .eq("advisor_user_id", advisor_user_id)
            .execute()
        )
        memberships.extend(by_user.data or [])

        institution_ids = sorted({
            str(row.get("institution_id"))
            for row in memberships
            if row.get("institution_id")
        })
        if not institution_ids:
            return None, JSONResponse({"error": "unauthorized"}, status_code=403)

        institutions_resp = (
            institution_table
            .select("id,slug,name,email_domain")
            .in_("id", institution_ids)
            .execute()
        )
        institutions = institutions_resp.data or []

        students_resp = (
            student_table
            .select("institution_id,student_user_id,student_email")
            .in_("institution_id", institution_ids)
            .execute()
        )
        student_rows = students_resp.data or []
        student_ids = sorted({
            str(row.get("student_user_id"))
            for row in student_rows
            if row.get("student_user_id")
        })

        return {
            "advisor_user_id": advisor_user_id,
            "advisor_email": advisor_email,
            "institution_ids": institution_ids,
            "institutions": institutions,
            "student_ids": student_ids,
            "student_rows": student_rows,
        }, None
    except Exception as exc:
        logger.warning("advisor scope lookup failed: %s", exc)
        return None, JSONResponse({"error": "advisor scope lookup failed"}, status_code=500)


async def api_advisor_access(request: Request):
    """GET /api/advisor-access — lightweight yes/no check for Advisor nav visibility."""
    scope, scope_error = _advisor_scope_for_request(request)
    if scope_error is not None:
        status = getattr(scope_error, "status_code", 500)
        if status == 401:
            return JSONResponse({"allowed": False, "reason": "sign_in_required"})
        if status == 403:
            return JSONResponse({"allowed": False, "reason": "not_authorized"})
        return scope_error

    return JSONResponse({
        "allowed": True,
        "institutions": (scope or {}).get("institutions") or [],
    })


def _load_template_tex_from_supabase(reference_folder: str) -> Optional[str]:
    """Load canonical template tex from `resume_templates` table when available.

    Expected columns: reference_folder text, tex_body text, active bool.
    """
    rf = (reference_folder or "").strip()
    if not rf:
        return None
    table = _supabase_table("resume_templates")
    if table is None:
        return None
    try:
        res = (
            table.select("tex_body")
            .eq("reference_folder", rf)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows and isinstance(rows[0], dict):
            tex = str(rows[0].get("tex_body") or "").strip()
            if tex:
                logger.info(f"Loaded template tex from Supabase  |  reference_folder={rf}")
                return tex
    except Exception as exc:
        logger.warning(f"template lookup failed  |  reference_folder={rf}  |  {exc}")
    return None


def _share_token_slug_shape(token: str) -> bool:
    """Lowercase resume `public_slug`: 3–50 chars, letters/digits, single hyphens between segments."""
    if len(token) < 3 or len(token) > 50:
        return False
    return re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", token) is not None
