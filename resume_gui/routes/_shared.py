"""Shared imports for HTTP route handler modules.

Single source of truth for the dependency surface that lived at the top of
the monolithic app.py. Route modules import from here so new symbols are
added once instead of copied across ten files.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
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
from resume_gui.analysis.rewrite_validators import _validate_rewrite_against_original
from resume_gui.auth.supabase import (
    _advisor_scope_for_request,
    _authenticated_supabase_user,
    _email_by_user_id,
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
from resume_gui.extract.structured_doc import (
    _doc_extraction_counts,
    _resume_doc_from_parsed,
    _resume_doc_to_dict,
)
from resume_gui.extract.synthesize import _synthesize_text_from_resume_doc
from resume_gui.extract.text_utils import _stitch_wrapped_bullets
from resume_gui.llm.client import _analysis_model, _llm_json_call
from resume_gui.services.persistence import _persist_analysis
from resume_gui.services.scan_limits import _scan_limit_status_for_user
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
    upload_analyze_source_pdf,
    upload_pdf,
    upload_tex,
)
from resume_gui.resume_extraction import inject_section_line_breaks, log_extraction_debug
from ats_service import ats_check, structured_ratings_from_ats

logger = logging.getLogger("resume_gui")

# Alias used by some handlers
_supabase_client = _supabase_client_for_service_role

__all__ = [
    "Any",
    "Dict",
    "ENABLE_JD_URL_EXTRACT",
    "EventSourceResponse",
    "FileResponse",
    "HTMLResponse",
    "HTML_FILE",
    "JinjaLatexRenderer",
    "JSONResponse",
    "LIBRARY_ROOT",
    "List",
    "Optional",
    "Path",
    "Request",
    "Response",
    "ResumeDocModel",
    "ThreadPoolExecutor",
    "Tuple",
    "USE_JINJA_LATEX_RENDERER",
    "USE_SUPABASE_TEMPLATE_BODY",
    "_CATEGORY_SCORE_KEYS",
    "_advisor_scope_for_request",
    "_analysis_model",
    "_analysis_section_scores",
    "_analysis_tips",
    "_analyze_resume_comprehensive",
    "_apply_accepted_edits_to_doc",
    "_authenticated_supabase_user",
    "_email_by_user_id",
    "_build_docx_bytes_from_structured",
    "_build_ratings_payload",
    "_clean_model_text",
    "_count_approved_suggestions",
    "_create_structured_output_folder",
    "_doc_extraction_counts",
    "_doc_from_structured_dict",
    "_docx_attachment_filename",
    "_extract_pdf_text",
    "_extract_resume_header",
    "_finalize_structured_doc",
    "_gen_shortid",
    "_get_resume_tex_for_user",
    "_latex_to_plain",
    "_llm_extract",
    "_llm_extract_with_manifest",
    "_llm_json_call",
    "_llm_tailor_to_jd",
    "_load_template_tex_from_supabase",
    "_load_tex_from_candidate",
    "_log_structured_doc",
    "_normalize_analysis",
    "_optional_gemini_client",
    "_parse_focus_gaps",
    "_persist_analysis",
    "_scan_limit_status_for_user",
    "_post_clean_resume_text",
    "_rate_resume",
    "_rationales_from_accepted_suggestions",
    "_resolve_structured_source_folder",
    "_resume_coach_prompt",
    "_resume_doc_from_parsed",
    "_resume_doc_from_profile_text",
    "_resume_doc_to_dict",
    "_sanitize_interview_questions",
    "_sanitize_reuse_research_sources",
    "_sanitize_strategic_tips",
    "_sanitize_suggestions",
    "_share_table",
    "_share_token_slug_shape",
    "_sse_friendly_error",
    "_stitch_wrapped_bullets",
    "_structured_doc_for_generate",
    "_structured_tailor_diff_and_rationales",
    "_supabase_client",
    "_supabase_client_for_service_role",
    "_supabase_table",
    "_supabase_template_is_jinja",
    "_synthesize_text_from_resume_doc",
    "_template_name_for_reference",
    "_try_suggest_reuse_research",
    "_validate_rewrite_against_original",
    "ai_generate_skills",
    "ai_rewrite_bullet",
    "asyncio",
    "ats_check",
    "coach_suggestions_llm",
    "coach_suggestions_llm_stream",
    "compute_experience_summary",
    "doctor_check_resume",
    "download_json",
    "download_pdf",
    "download_tex",
    "extract_jd_from_url",
    "get_resume_tex",
    "grok_preferred_for_throughput",
    "inject_section_line_breaks",
    "log_extraction_debug",
    "json",
    "list_resumes",
    "list_versions",
    "load_version",
    "logger",
    "logging",
    "os",
    "parse_resume_tex",
    "partial",
    "pdfplumber",
    "primary_gemini_flash_model",
    "primary_llm_model_for_resume_workloads",
    "re",
    "recompile_resume_from_tex",
    "run_tailor_research_job_context",
    "save_version",
    "splice_bullets_into_tex",
    "storage_status",
    "stream_latex_resume",
    "structured_ratings_from_ats",
    "threading",
    "upload_analyze_source_pdf",
    "upload_pdf",
    "upload_tex",
    "uuid4",
]
