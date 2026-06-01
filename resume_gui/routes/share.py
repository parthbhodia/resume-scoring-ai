"""HTTP route handlers."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import pdfplumber
from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, JSONResponse, Response
from sse_starlette.sse import EventSourceResponse

from resume_gui.analysis.comprehensive import (
    _analysis_section_scores,
    _analysis_tips,
    _analyze_resume_comprehensive,
)
from resume_gui.analysis.constants import _CATEGORY_SCORE_KEYS
from resume_gui.analysis.normalize import _normalize_analysis
from resume_gui.auth.supabase import (
    _advisor_scope_for_request,
    _authenticated_supabase_user,
    _gen_shortid,
    _load_template_tex_from_supabase,
    _share_table,
    _share_token_slug_shape,
    _supabase_client_for_service_role,
    _supabase_table,
)
from resume_gui.config import (
    ENABLE_JD_URL_EXTRACT,
    HTML_FILE,
    LIBRARY_ROOT,
    USE_JINJA_LATEX_RENDERER,
    USE_SUPABASE_TEMPLATE_BODY,
)
from resume_gui.doc_utils import _clean_model_text
from resume_gui.experience_tenure import compute_experience_summary
from resume_gui.export.docx import _build_docx_bytes_from_structured, _docx_attachment_filename
from resume_gui.export.structured_pdf import _doc_from_structured_dict, _llm_tailor_to_jd
from resume_gui.extract.pipeline import (
    _finalize_structured_doc,
    _llm_extract,
    _llm_extract_with_manifest,
    _log_structured_doc,
    _structured_doc_for_generate,
)
from resume_gui.extract.profile import _resume_doc_from_profile_text
from resume_gui.extract.structured_doc import _resume_doc_to_dict
from resume_gui.extract.synthesize import _synthesize_text_from_resume_doc
from resume_gui.extract.text_utils import _stitch_wrapped_bullets
from resume_gui.llm.client import _analysis_model, _llm_json_call
from resume_gui.services.persistence import _persist_analysis
from resume_gui.services.template import (
    _count_approved_suggestions,
    _create_structured_output_folder,
    _load_tex_from_candidate,
    _rationales_from_accepted_suggestions,
    _resolve_structured_source_folder,
    _structured_tailor_diff_and_rationales,
    _supabase_template_is_jinja,
    _template_name_for_reference,
)
from resume_gui.suggestions import _apply_accepted_edits_to_doc
from resume_gui.tailor.coach import (
    _build_ratings_payload,
    _parse_focus_gaps,
    _resume_coach_prompt,
    _sanitize_interview_questions,
    _sanitize_reuse_research_sources,
    _sanitize_strategic_tips,
    _sanitize_suggestions,
    _try_suggest_reuse_research,
)
from resume_gui.text.latex_plain import _latex_to_plain
from resume_gui.text.resume_text import (
    _extract_pdf_text,
    _extract_resume_header,
    _post_clean_resume_text,
)
from resume_library import (
    ai_generate_skills,
    ai_rewrite_bullet,
    coach_suggestions_llm,
    coach_suggestions_llm_stream,
    doctor_check_resume,
    extract_jd_from_url,
    get_resume_tex,
    grok_preferred_for_throughput,
    list_resumes,
    parse_resume_tex,
    primary_gemini_flash_model,
    primary_llm_model_for_resume_workloads,
    recompile_resume_from_tex,
    run_tailor_research_job_context,
    splice_bullets_into_tex,
    stream_latex_resume,
    _get_resume_tex_for_user,
    _optional_gemini_client,
    _rate_resume,
    _sse_friendly_error,
)
from resume_gui.renderers.latex_renderer import JinjaLatexRenderer, ResumeDocModel
from resume_gui.storage import (
    download_json,
    download_pdf,
    download_tex,
    list_versions,
    load_version,
    save_version,
    storage_status,
    upload_pdf,
    upload_tex,
)
from resume_gui.resume_extraction import inject_section_line_breaks
from ats_service import ats_check, structured_ratings_from_ats

logger = logging.getLogger("resume_gui")

# Alias used by some handlers
_supabase_client = _supabase_client_for_service_role

async def api_share_create(request: Request):
    """POST /api/share/{folder} — mint a shortid for `folder`. Idempotent if
    the same user already created one — returns the existing one.

    Body: {"user_id": "...", "pdf_url": "..."}
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    pdf_url = (body.get("pdf_url") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)

    # Ensure the resume exists and belongs to the caller before minting a public link.
    # Also lets us fall back to the stored PDF URL if the client did not send one.
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "share storage not configured"}, status_code=503)
        resume_res = (
            client.table("resumes")
                  .select("id, pdf_url")
                  .eq("user_id", user_id)
                  .eq("folder", folder)
                  .limit(1)
                  .execute()
        )
        if not resume_res.data:
            return JSONResponse(
                {
                    "error": "Résumé not in your library yet — wait a moment and tap Share again, "
                    "or sign in and generate so we can save the row Supabase needs for links.",
                },
                status_code=404,
            )
        pdf_url = pdf_url or (resume_res.data[0].get("pdf_url") or "")
    except Exception as exc:
        logger.exception("share resume ownership lookup failed")
        return JSONResponse({"error": f"share lookup failed: {exc}"}, status_code=500)

    # Reuse existing shortid if one already exists for this user+folder.
    try:
        existing = (
            table.select("shortid, pdf_url, views, revoked")
                 .eq("user_id", user_id).eq("folder", folder)
                 .eq("revoked", False)
                 .limit(1).execute()
        )
        if existing.data:
            row = existing.data[0]
            return JSONResponse({
                "shortid": row["shortid"], "pdf_url": row.get("pdf_url"),
                "views":   row.get("views", 0), "reused": True,
            })
    except Exception as exc:
        logger.warning(f"share lookup failed: {exc}")

    # Mint a new one — retry on the (vanishingly unlikely) collision.
    for _ in range(5):
        shortid = _gen_shortid()
        try:
            table.insert({
                "shortid": shortid, "user_id": user_id,
                "folder":  folder,  "pdf_url": pdf_url or None,
            }).execute()
            return JSONResponse({"shortid": shortid, "pdf_url": pdf_url, "reused": False})
        except Exception as exc:
            msg = str(exc)
            logger.warning(f"share insert failed: {msg}")
            # Only retry actual shortid collisions; other DB errors need to be
            # surfaced so the UI/operator sees the real Supabase problem.
            if "duplicate key" in msg.lower() or "unique" in msg.lower():
                continue
            return JSONResponse({"error": f"share insert failed: {msg}"}, status_code=500)
    return JSONResponse({"error": "could not mint unique shortid after retries"}, status_code=500)

async def api_share_resolve(request: Request):
    """GET /api/share/{shortid} — resolve a share shortid or a resume `public_slug` to folder + pdf_url.
    Share rows increment the view counter; slug-based resolves do not.

    Public endpoint — used by the recipient page (no auth).
    """
    raw = (request.path_params.get("shortid") or "").strip().lower()
    if not raw:
        return JSONResponse({"error": "invalid id"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)

    # ── 1) Legacy minted shortids (6–16 lowercase alnum) in share_links ─────
    if re.match(r"^[a-z0-9]{6,16}$", raw):
        try:
            rows = table.select("shortid, folder, pdf_url, views, revoked, created_at") \
                        .eq("shortid", raw).limit(1).execute()
        except Exception as exc:
            logger.exception("share resolve query failed")
            return JSONResponse({"error": str(exc)}, status_code=500)
        if rows.data:
            row = rows.data[0]
            if row.get("revoked"):
                return JSONResponse({"error": "link revoked"}, status_code=410)
            try:
                table.update({"views": (row.get("views") or 0) + 1}).eq("shortid", raw).execute()
            except Exception as exc:
                logger.warning(f"share view-counter update failed: {exc}")
            return JSONResponse({
                "shortid":    row["shortid"],
                "folder":     row["folder"],
                "pdf_url":    row.get("pdf_url"),
                "views":      (row.get("views") or 0) + 1,
                "created_at": row.get("created_at"),
            })

    # ── 2) Custom per-resume slug (resumes.public_slug, service-role read) ───
    if not _share_token_slug_shape(raw):
        return JSONResponse({"error": "invalid id"}, status_code=400)

    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "share storage not configured"}, status_code=503)
        resume_res = (
            client.table("resumes")
                  .select("folder, pdf_url, public_slug")
                  .eq("public_slug", raw)
                  .limit(1)
                  .execute()
        )
        if not resume_res.data:
            return JSONResponse({"error": "not found"}, status_code=404)
        r0 = resume_res.data[0]
        pdf_url = (r0.get("pdf_url") or "").strip()
        if not pdf_url:
            return JSONResponse({"error": "not found"}, status_code=404)
        return JSONResponse({
            "shortid":    raw,
            "folder":     r0.get("folder"),
            "pdf_url":    pdf_url,
            "views":      0,
            "created_at": None,
        })
    except Exception as exc:
        logger.exception("resume slug resolve failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_share_revoke(request: Request):
    """DELETE /api/share/{shortid} — owner-only revoke. Body: {"user_id": "..."}.
    We require user_id match because this is what the frontend has after login.
    Service-role on the backend would let us bypass RLS, but we still scope by
    user_id to prevent cross-user revocation by a logged-in attacker."""
    shortid = request.path_params["shortid"]
    if not re.match(r"^[a-z0-9]{6,16}$", shortid or ""):
        return JSONResponse({"error": "invalid shortid"}, status_code=400)
    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)
    try:
        table.update({"revoked": True}).eq("shortid", shortid).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.exception("share revoke failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"ok": True})


