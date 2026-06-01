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

async def api_rewrite_role(request: Request):
    """POST /api/rewrite-role — rewrite a weak role using AI.
    Body: { "header": "Job Title | Company • Dates", "bullets": ["• bullet1", ...] }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    header  = (body.get("header") or "").strip()
    bullets = body.get("bullets") or []
    if not header:
        return JSONResponse({"error": "header required"}, status_code=400)

    bullets_text = "\n".join(bullets) if bullets else "(no bullets provided)"
    prompt = (
        f"You are a professional resume writer. Rewrite the following work experience role "
        f"to be much stronger and more impactful for a tech recruiter.\n\n"
        f"Role: {header}\n"
        f"Current bullets:\n{bullets_text}\n\n"
        f"Instructions:\n"
        f"- Write exactly 3-4 strong bullet points\n"
        f"- Each bullet MUST start with a powerful past-tense action verb "
        f"(e.g., administered, coordinated, authored, negotiated, investigated, engineered, "
        f"programmed, coached, trained, initiated, implemented, monitored, achieved, reduced, spearheaded)\n"
        f"- Each bullet MUST include a quantified result (%, $, time saved, team size, etc.) "
        f"— if the original has no numbers, invent plausible but conservative estimates\n"
        f"- Remove weak verbs (helped, assisted, worked on, was responsible for)\n"
        f"- Remove pronouns (I, my, we)\n"
        f"- Format: return ONLY the bullet points, one per line, each starting with •\n"
        f"- Do not include the role header, just the bullets"
    )

    loop = asyncio.get_event_loop()

    def _call_llm():
        try:
            # Reuse the same LLM routing (Gemini → Grok fallback) as the bullet rewriter
            text = ai_rewrite_bullet("", prompt, "")
            return text.strip() if text else None
        except Exception as exc:
            logger.warning(f"rewrite_role LLM call failed: {exc}")
            return None

    text = await loop.run_in_executor(None, _call_llm)
    if not text:
        return JSONResponse({"error": "LLM unavailable"}, status_code=503)

    # Parse out bullet lines
    rewritten = [l.strip() for l in text.splitlines() if l.strip() and re.match(r"^[•\-–*]", l.strip())]
    if not rewritten:
        rewritten = [l.strip() for l in text.splitlines() if l.strip()]

    return JSONResponse({"bullets": rewritten})

async def api_rewrite_bullet(request: Request):
    """POST /api/rewrite-bullet — score and optionally rewrite a single bullet.

    Reusable endpoint: works standalone from Analyze inline editing, Resume Builder
    suggestions, or any other UI that needs per-bullet AI feedback.

    Request body (JSON):
      bullet      string  — the bullet text to evaluate (required)
      jd          string  — job description for keyword alignment (optional)
      role        string  — target role title for context (optional)
      company     string  — target company name (optional)
      rewrite     bool    — if true, return an improved version; default true

    Response (JSON):
      {
        "original":    string,
        "score":       int (0–100),
        "issues":      string[],
        "improved":    string | null,   // null when rewrite=false
        "explanation": string
      }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    bullet  = (body.get("bullet") or "").strip()
    jd      = (body.get("jd") or "").strip()
    role    = (body.get("role") or "").strip()
    company = (body.get("company") or "").strip()
    want_rewrite = body.get("rewrite", True)

    if not bullet:
        return JSONResponse({"error": "bullet required"}, status_code=400)

    context_parts: list[str] = []
    if role or company:
        context_parts.append(f"Target role: {role} at {company}".strip(" at"))
    if jd:
        context_parts.append(f"Job description (first 1500 chars):\n{jd[:1500]}")
    context_block = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""

    rewrite_instruction = (
        '"improved": "A stronger rewrite using an action verb, quantified where possible, '
        'aligned with JD keywords. Do NOT invent metrics not in the original.",'
        if want_rewrite else
        '"improved": null,'
    )

    prompt = f"""You are an expert resume coach. Evaluate the following resume bullet and return ONLY a JSON object — no markdown, no prose.

BULLET:
{bullet}{context_block}

Return this exact JSON schema:
{{
  "score": <integer 0-100 — overall bullet quality>,
  "issues": ["short issue label", ...],
  "explanation": "One sentence: the single most important weakness.",
  {rewrite_instruction}
}}

Scoring rubric:
- 80-100: Strong action verb, specific outcome/metric, relevant to JD
- 60-79: Good verb, decent specificity, minor improvements possible
- 40-59: Weak verb or vague, duty-focused, no metric
- 0-39: Passive voice, responsibilities-only, no impact shown

Issues labels (use only these): "No metric", "Weak verb", "Passive voice", "Too vague",
"Duty-focused", "Too long", "Missing JD keyword", "Starts with date"

Return ONLY the JSON object."""

    raw = _llm_json_call(prompt)
    if not raw or not isinstance(raw, dict):
        return JSONResponse({"error": "LLM unavailable"}, status_code=503)

    score = max(0, min(100, int(raw.get("score") or 50)))
    issues = [str(i) for i in (raw.get("issues") or []) if str(i).strip()][:6]
    improved = str(raw.get("improved") or "").strip() or None if want_rewrite else None
    explanation = str(raw.get("explanation") or "").strip()

    return JSONResponse({
        "original":    bullet,
        "score":       score,
        "issues":      issues,
        "improved":    improved,
        "explanation": explanation,
    })
