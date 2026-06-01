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

async def api_extract_jd(request: Request):
    """Fetch a job posting URL and extract structured {company, role, location, job_description}."""
    if not ENABLE_JD_URL_EXTRACT:
        return JSONResponse(
            {
                "error": "JD URL extraction is temporarily disabled.",
                "code": "feature_disabled",
            },
            status_code=503,
        )
    try:
        body = await request.json()
        url  = (body.get("url") or "").strip()
        if not url:
            return JSONResponse({"error": "url required"}, status_code=400)
        logger.info(f"EXTRACT-JD  |  {url}")
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, extract_jd_from_url, url)
        return JSONResponse(data)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except Exception as exc:
        logger.exception("extract-jd failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_ai_edit_bullet(request: Request):
    """POST /api/ai-edit-bullet — single bullet AI rewrite for the editor."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    bullet_text = (body.get("bullet_text") or "").strip()
    instruction = (body.get("instruction") or "").strip()
    jd_snippet  = (body.get("jd") or "").strip()
    if not bullet_text:
        return JSONResponse({"error": "bullet_text required"}, status_code=400)

    loop = asyncio.get_event_loop()
    try:
        new_text = await loop.run_in_executor(
            None, ai_rewrite_bullet, bullet_text, instruction, jd_snippet,
        )
    except Exception as exc:
        logger.exception("ai_rewrite_bullet failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"text": new_text})

async def api_generate_skills(request: Request):
    """POST /api/generate-skills — generate a list of skills for a job role.

    Body: {"role": "Software Engineer", "existing_skills": ["Python", ...]}
    Returns: {"skills": ["Skill 1", "Skill 2", ...]}
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    role = (body.get("role") or "").strip()
    if not role:
        return JSONResponse({"error": "role required"}, status_code=400)
    existing = body.get("existing_skills") or []
    if not isinstance(existing, list):
        existing = []

    loop = asyncio.get_event_loop()
    try:
        skills = await loop.run_in_executor(None, ai_generate_skills, role, existing)
    except Exception as exc:
        logger.exception("ai_generate_skills failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"skills": skills})

async def api_ats_check(request: Request):
    """POST /api/ats-check/{folder} — ATS + JD alignment on the compiled PDF.

    Body JSON: ``jd`` (optional), ``user_id`` (**required** — authenticated Supabase user; rejects ``local`` or empty),
      ``target_role`` / ``role``, optional ``parsed`` sections for bullet metrics.

    Runs pdfplumber extraction and rule-based alignment in a thread-pool executor.
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}
    jd      = (body.get("jd") or "").strip()
    user_id = (body.get("user_id") or "").strip()
    if not user_id or user_id == "local":
        return JSONResponse({"error": "authentication required"}, status_code=401)
    target_role = (body.get("target_role") or body.get("role") or "").strip()
    parsed = body.get("parsed") if isinstance(body.get("parsed"), dict) else None

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(ats_check, folder, jd, user_id, None, target_role=target_role, parsed=parsed),
        )
    except FileNotFoundError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        logger.exception("ats_check failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse(result)

async def api_doctor_check(request: Request):
    """POST /api/doctor-check — analyze a parsed resume tree for writing-quality
    issues (passive voice, weak verbs, missing metrics, ...). Pure regex-based,
    runs synchronously, no LLM cost.

    Body: {"parsed": ParsedResume}
    Returns: {"issues": {bullet_id: [issue, ...]}, "total": int}
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)
    parsed = body.get("parsed")
    if not isinstance(parsed, dict):
        return JSONResponse({"error": "parsed required"}, status_code=400)

    try:
        issues = doctor_check_resume(parsed)
    except Exception as exc:
        logger.exception("doctor_check_resume failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    total = sum(len(v) for v in issues.values())
    return JSONResponse({"issues": issues, "total": total})

async def api_resume_analysis(request: Request):
    """POST /api/resume-analysis/{folder} — combined ATS + writing analysis.

    Body: {"user_id": "...", "jd": "...", "parsed": ParsedResume?}
    Returns section scores + prioritized fixes for UX-friendly report views.
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}

    jd = (body.get("jd") or "").strip()
    user_id = (body.get("user_id") or "").strip()
    if not user_id or user_id == "local":
        return JSONResponse({"error": "authentication required"}, status_code=401)
    target_role = (body.get("target_role") or body.get("role") or "").strip()
    parsed = body.get("parsed") if isinstance(body.get("parsed"), dict) else None

    if parsed is None:
        tex = get_resume_tex(folder)
        if tex is None and user_id:
            tex = download_tex(user_id, folder)
        if tex is None:
            return JSONResponse({"error": "resume not found"}, status_code=404)
        parsed = parse_resume_tex(tex)

    loop = asyncio.get_event_loop()
    try:
        ats = await loop.run_in_executor(
            None,
            partial(ats_check, folder, jd, user_id, None, target_role=target_role, parsed=parsed),
        )
        issues = doctor_check_resume(parsed)
    except FileNotFoundError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        logger.exception("resume analysis failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

    sections = _analysis_section_scores(parsed, issues)
    tips, counts = _analysis_tips(ats, sections, issues)
    overall = round(((ats.get("score") or 0) / 10 + (sum(s["score"] for s in sections) / max(1, len(sections)))) / 2)
    summary = (
        "Overall structure is strong and ATS-friendly, with a few high-impact fixes needed before submitting."
        if overall >= 7 else
        "Resume is promising but needs structural and wording improvements before applying broadly."
    )

    return JSONResponse({
        "overall": {"score": overall, "summary": summary},
        "sections": [{"name": s["name"], "score": s["score"], "summary": s["summary"]} for s in sections],
        "tips": tips,
        "counts": counts,
        "ats": ats,
    })
