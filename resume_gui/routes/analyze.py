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

async def api_analyze_upload(request: Request):
    """POST /api/analyze-upload — upload a PDF or Word (.doc / .docx) and run comprehensive AI analysis.

    Form fields:
      file  — PDF or Word binary
      jd    — optional job description text
    """
    try:
        form   = await request.form()
        upload = form.get("file")
        jd     = (form.get("jd") or "").strip()
        if not upload:
            return JSONResponse({"error": "No file provided"}, status_code=400)
        data     = await upload.read()
        if not data:
            return JSONResponse({"error": "Empty file"}, status_code=400)
        filename = getattr(upload, "filename", None) or "resume.pdf"
        content_type = getattr(upload, "content_type", None)

        from resume_upload_parse import (  # type: ignore
            extract_upload_markdown,
            message_for_empty_resume_extract,
            validate_resume_upload_file,
        )

        try:
            validate_resume_upload_file(content_type, filename)
        except ValueError as ve:
            return JSONResponse({"error": str(ve)}, status_code=400)

        loop = asyncio.get_event_loop()

        def _extract_text() -> str:
            outcome = extract_upload_markdown(data, filename, pdf_plain_fallback=None)
            text = (outcome.markdown or "").strip()
            if text:
                return text
            # pdfplumber fallback — PDF only (never treat Word as PDF)
            if filename.lower().endswith(".pdf"):
                try:
                    with pdfplumber.open(io.BytesIO(data)) as pdf:
                        return _extract_pdf_text(pdf)
                except Exception as exc:
                    logger.warning("pdfplumber fallback failed: %s", exc)
            if outcome.empty_reason:
                raise ValueError(message_for_empty_resume_extract(outcome.empty_reason))
            return ""

        try:
            text = await loop.run_in_executor(None, _extract_text)
        except ValueError as ve:
            return JSONResponse({"error": str(ve)}, status_code=422)

        if not text.strip():
            return JSONResponse(
                {"error": "Could not extract text from the uploaded file"},
                status_code=422,
            )

        # When vision-PDF extraction is available, run it FIRST and synthesize
        # a clean text representation from the structured doc. Then use that
        # clean text for both the analysis prompt AND the right-panel preview
        # so the LLM grades what the user actually wrote (not column-extraction
        # artifacts) and the preview matches the structured understanding.
        # When vision is unavailable / fails, fall back to the legacy
        # concurrent path (analysis on raw text, structured extract via the
        # reasoning text path).
        pdf_bytes_for_vision = data if filename.lower().endswith(".pdf") else None
        structured: Optional[ResumeDocModel] = None
        analysis_input_text = text
        preview_text = text

        if pdf_bytes_for_vision:
            structured = await loop.run_in_executor(
                None, _llm_extract, text, pdf_bytes_for_vision,
            )
            if structured is not None:
                synthesized = _synthesize_text_from_resume_doc(structured)
                if synthesized.strip():
                    analysis_input_text = synthesized
                    preview_text = synthesized
                    logger.info(
                        "analyze_upload: using vision-synthesized text "
                        "(%d → %d chars) for analysis + preview",
                        len(text), len(synthesized),
                    )
            result = await loop.run_in_executor(
                None, _analyze_resume_comprehensive, analysis_input_text, jd,
            )
        else:
            analysis_future = loop.run_in_executor(
                None, _analyze_resume_comprehensive, text, jd,
            )
            extract_future = loop.run_in_executor(
                None, _llm_extract, text, None,
            )
            result, structured = await asyncio.gather(analysis_future, extract_future)

        if isinstance(result, dict):
            result["extractedText"] = preview_text[:25000]
            result["resumeHeader"]  = _extract_resume_header(preview_text)

        if structured is not None:
            # Build flat bulletMap: index in bulletAnalysis → {experienceIdx, bulletIdx}
            bullet_map: list[dict] = []
            for ei, exp in enumerate(structured.experience):
                for bi in range(len(exp.bullets)):
                    bullet_map.append({"experienceIdx": ei, "bulletIdx": bi})
            structured_dict = _resume_doc_to_dict(structured)
            result["structuredResume"] = structured_dict
            result["bulletMap"]        = bullet_map
            try:
                from resume_gui.experience_tenure import compute_experience_summary_from_structured
                result["experienceSummary"] = compute_experience_summary_from_structured(structured_dict)
            except Exception as exc:
                logger.warning("experience_summary failed: %s", exc)
            _log_structured_doc("analyze_upload_structured_resume", structured)

        # Persist analysis result for student history + cohort analytics (best-effort).
        # Prefer the verified Supabase session over form fields; advisor institution
        # membership is derived from this email, so client-supplied email is not enough.
        auth_user_id, auth_user_email = _authenticated_supabase_user(request)
        user_id = auth_user_id or (form.get("user_id") or "").strip()
        user_email = auth_user_email or ""
        if user_id and isinstance(result, dict):
            try:
                await loop.run_in_executor(None, _persist_analysis, result, user_id, user_email, bool(jd))
            except Exception:
                pass  # never block the response for analytics writes

        return JSONResponse(result)
    except Exception as exc:
        logger.exception("analyze_upload failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_my_analyses(request: Request):
    """GET /api/my-analyses — return current user's analysis history (latest 50)."""
    user_id = (request.query_params.get("user_id") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    table = _supabase_table("resume_analyses")
    if table is None:
        return JSONResponse({"analyses": [], "note": "storage unavailable"})
    try:
        resp = (
            table
            .select("id,label,score,created_at,result->overallScore,result->categoryScores,result->topIssues,result->topStrengths,result->keywordAnalysis")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        rows = []
        for r in (resp.data or []):
            rows.append({
                "id":             r.get("id"),
                "label":          r.get("label"),
                "score":          r.get("score"),
                "created_at":     r.get("created_at"),
                "categoryScores": (r.get("result") or {}).get("categoryScores"),
                "topIssues":      (r.get("result") or {}).get("topIssues"),
                "topStrengths":   (r.get("result") or {}).get("topStrengths"),
                "keywordScore":   ((r.get("result") or {}).get("keywordAnalysis") or {}).get("keywordScore"),
            })
        return JSONResponse({"analyses": rows})
    except Exception as exc:
        logger.warning("my_analyses query failed: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_analyze_folder(request: Request):
    """POST /api/analyze-folder/{folder} — run comprehensive analysis on a stored resume."""
    folder = request.path_params.get("folder", "").strip()
    if not folder or ".." in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass
    user_id = body.get("user_id", "")
    jd      = (body.get("jd") or "").strip()

    loop = asyncio.get_event_loop()

    def _run():
        # 1. Local filesystem (fresh Railway deploy or local dev)
        tex_path = os.path.join(LIBRARY_ROOT, folder, "resume.tex")
        if os.path.isfile(tex_path):
            with open(tex_path, encoding="utf-8", errors="ignore") as f:
                return _latex_to_plain(f.read())

        # 2. Supabase Storage via the shared download_tex helper
        if user_id:
            try:
                tex = download_tex(user_id, folder)
                if tex:
                    return _latex_to_plain(tex)
            except Exception as e:
                logger.warning(f"analyze_folder: download_tex failed: {e}")
        return None

    plain = await loop.run_in_executor(None, _run)
    if not plain:
        return JSONResponse({"error": "Could not load resume text"}, status_code=404)

    result = await loop.run_in_executor(None, _analyze_resume_comprehensive, plain, jd)
    if isinstance(result, dict):
        result["extractedText"] = (plain or "")[:25000]
        result["resumeHeader"] = _extract_resume_header(plain or "")
    return JSONResponse(result)

async def api_analyze(request: Request):
    """POST /api/analyze — score resume vs JD and return detailed ratings without compiling a PDF.

    Used by the analyze-first tailor flow: user sees match score, gaps, and
    keywords BEFORE committing to a PDF compile.

    Body:  { candidate_profile: str, job_description: str, model?: str }
    Returns: { ratings: <_build_ratings_payload output> }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON body"}, status_code=400)

    candidate_profile = str(body.get("candidate_profile") or "").strip()
    job_description   = str(body.get("job_description") or "").strip()
    if not candidate_profile:
        return JSONResponse({"error": "candidate_profile is required"}, status_code=400)
    if not job_description:
        return JSONResponse({"error": "job_description is required"}, status_code=400)

    model = str(body.get("model") or "").strip() or primary_llm_model_for_resume_workloads()
    include_bullets = bool(body.get("include_bullet_analysis"))

    loop = asyncio.get_event_loop()
    try:
        gemini_client = _optional_gemini_client()
        ratings_future = loop.run_in_executor(
            None,
            partial(_rate_resume, gemini_client, model, candidate_profile, job_description[:1500]),
        )
        if include_bullets:
            analysis_future = loop.run_in_executor(
                None,
                partial(_analyze_resume_comprehensive, candidate_profile, job_description),
            )
            llm_ratings, analysis_raw = await asyncio.gather(ratings_future, analysis_future)
        else:
            llm_ratings = await ratings_future
            analysis_raw = None
    except Exception as exc:
        logger.exception("api_analyze: _rate_resume failed")
        return JSONResponse({"error": f"analysis failed: {exc}"}, status_code=500)

    ratings = _build_ratings_payload(llm_ratings)
    if ratings is None:
        return JSONResponse({"error": "model returned no usable ratings"}, status_code=502)

    payload: dict = {"ratings": ratings}
    if include_bullets and isinstance(analysis_raw, dict):
        for key in (
            "bulletAnalysis",
            "sectionFeedback",
            "categoryScores",
            "overallScore",
            "summary",
            "topStrengths",
            "topIssues",
            "categoryRationales",
        ):
            if key in analysis_raw:
                payload[key] = analysis_raw[key]

    return JSONResponse(payload)

async def api_explain_category_score(request: Request):
    """POST /api/explain-category-score — short AI rationale for a category score.

    Used when a category scored below "excellent" but no bullets were flagged
    in that bucket — explains the holistic score with résumé-specific evidence.

    Body: {
        "category": str,           # categoryScores key
        "category_score": int,
        "resume_text": str,
        "jd": str (optional),
    }
    Returns: { "rationale": str }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    category = (body.get("category") or "").strip()
    resume_text = (body.get("resume_text") or "").strip()
    jd = (body.get("jd") or "").strip()
    try:
        category_score = int(body.get("category_score"))
    except (TypeError, ValueError):
        return JSONResponse({"error": "category_score required"}, status_code=400)

    if category not in _CATEGORY_SCORE_KEYS:
        return JSONResponse({"error": "invalid category"}, status_code=400)
    if not resume_text:
        return JSONResponse({"error": "resume_text required"}, status_code=400)

    label = _CATEGORY_DISPLAY_NAMES.get(category, category)
    jd_section = (
        f"\nJOB DESCRIPTION:\n{jd[:2000]}"
        if jd.strip()
        else "\n(No job description was provided.)"
    )
    prompt = (
        f"You are an expert resume coach. A résumé received {category_score}/100 on "
        f'"{label}" ({category}) but no individual bullets were flagged in that category.\n\n'
        "Explain in 2-4 sentences WHY this holistic score makes sense for THIS résumé — "
        "cite specific evidence (counts, sections, missing patterns). Be honest and concrete. "
        "Do not invent employers, metrics, or sections that are not in the text.\n\n"
        f'Return ONLY JSON: {{"rationale": "<explanation>"}}\n\n'
        f"RESUME:\n{resume_text[:6000]}{jd_section}"
    )

    loop = asyncio.get_event_loop()

    def _call():
        return _llm_json_call(prompt)

    try:
        data = await loop.run_in_executor(None, _call)
        rationale = ""
        if isinstance(data, dict):
            rationale = str(data.get("rationale") or "").strip()
        if not rationale:
            return JSONResponse({"error": "Could not generate an explanation."}, status_code=500)
        return JSONResponse({"rationale": rationale[:600]})
    except Exception as exc:
        logger.exception("explain-category-score failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
