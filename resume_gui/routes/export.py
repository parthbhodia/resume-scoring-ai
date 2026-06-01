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
from resume_gui.extract.structured_doc import _resume_doc_from_parsed, _resume_doc_to_dict
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

async def api_tb_enhance(request: Request):
    """POST /api/tb-enhance — ATS-optimize a block of text from the Template Builder.

    Body: {
        "text":    str,   -- the raw text (bullets newline-separated, or a summary paragraph)
        "type":    str,   -- "bullets" | "summary"
        "context": {      -- optional context for better rewrites
            "role":    str,
            "company": str,
        }
    }
    Returns: { "enhanced": str }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    text    = (body.get("text") or "").strip()
    kind    = (body.get("type") or "bullets").strip()
    context = body.get("context") or {}
    role    = (context.get("role") or "").strip()
    company = (context.get("company") or "").strip()

    if not text:
        return JSONResponse({"error": "text required"}, status_code=400)

    ctx_line = ""
    if role or company:
        ctx_line = f"Role: {role}{' at ' + company if company else ''}\n"

    if kind == "summary":
        prompt = (
            "You are an expert resume coach. Rewrite this professional summary to be more compelling "
            "and ATS-friendly.\n\n"
            "Rules:\n"
            "- 2-3 sentences total, concise\n"
            "- Start with a strong professional identity statement\n"
            "- Mention key technologies or specializations naturally\n"
            "- Avoid weak phrases (responsible for, helped with, worked on, assisted)\n"
            "- Do NOT add made-up metrics or claim experience not in the original\n"
            f"{ctx_line}\n"
            f"Original summary:\n{text}\n\n"
            'Return JSON: { "enhanced": "<improved summary text>" }'
        )
    else:
        # Bullets: each line is one bullet
        raw_bullets = [b.lstrip("-•* ").strip() for b in text.split("\n") if b.strip()]
        bullets_block = "\n".join(f"- {b}" for b in raw_bullets)
        prompt = (
            "You are an expert resume coach specializing in ATS optimization. "
            "Rewrite these resume bullet points to be stronger and more ATS-friendly.\n\n"
            "Rules per bullet:\n"
            "- Start with a strong past-tense action verb (Led, Built, Designed, Reduced, etc.)\n"
            "- Include or preserve quantifiable metrics (%, $, numbers, scale) where present in original\n"
            "- Be specific about technologies and impact\n"
            "- Keep each bullet under 25 words\n"
            "- Do NOT invent metrics or experience not mentioned in the original\n"
            "- Preserve the number of bullets exactly\n\n"
            f"{ctx_line}"
            f"Bullets to improve:\n{bullets_block}\n\n"
            'Return JSON: { "bullets": ["<bullet 1>", "<bullet 2>", ...] }'
        )

    try:
        raw = _llm_json_call(prompt)
        if not raw:
            return JSONResponse({"error": "AI unavailable"}, status_code=503)

        if kind == "summary":
            enhanced = (raw.get("enhanced") or "").strip()
        else:
            bullets_out = raw.get("bullets") or []
            enhanced = "\n".join(str(b).lstrip("-•* ").strip() for b in bullets_out if str(b).strip())

        if not enhanced:
            return JSONResponse({"error": "empty response from AI"}, status_code=500)

        return JSONResponse({"enhanced": enhanced})
    except Exception as exc:
        logger.exception("tb-enhance failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_export_docx(request: Request):
    """POST /api/export-docx — generate a DOCX from a ResumeDocModel JSON payload.

    Body (JSON):
      structuredResume — dict matching _resume_doc_to_dict() output
      acceptedEdits    — optional {experienceIdx: {bulletIdx: newText}} patch map
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    structured = body.get("structuredResume")
    if not structured or not isinstance(structured, dict):
        return JSONResponse({"error": "structuredResume required"}, status_code=400)

    accepted_edits: dict = body.get("acceptedEdits") or {}

    try:
        docx_bytes = await asyncio.get_event_loop().run_in_executor(
            None,
            partial(_build_docx_bytes_from_structured, structured, accepted_edits),
        )
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=501)
    except Exception as exc:
        logger.exception("export_docx failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

    filename = f"resume-{(structured.get('full_name') or 'export').replace(' ', '_')}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

async def api_builder_export_docx(request: Request):
    """POST /api/builder-export-docx — DOCX for a tailored résumé folder (Builder flow).

    Loads the generated .tex, applies accepted coach suggestions, and returns Word.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    folder = (body.get("folder") or "").strip()
    if not folder or ".." in folder or "/" in folder:
        return JSONResponse({"error": "folder required"}, status_code=400)

    user_id = (body.get("user_id") or "").strip()
    if user_id == "local":
        user_id = ""
    accepted = body.get("accepted_suggestions")
    download_stem = (body.get("download_name") or "").strip()

    tex = get_resume_tex(folder)
    if tex is None and user_id:
        tex = download_tex(user_id, folder)
    if not tex:
        return JSONResponse({"error": "resume not found"}, status_code=404)

    def _build() -> bytes:
        parsed = parse_resume_tex(tex)
        doc = _resume_doc_from_parsed(parsed)
        _apply_accepted_edits_to_doc(doc, accepted if isinstance(accepted, list) else None)
        structured = _resume_doc_to_dict(doc)
        return _build_docx_bytes_from_structured(structured, {})

    try:
        docx_bytes = await asyncio.get_event_loop().run_in_executor(None, _build)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=501)
    except Exception as exc:
        logger.exception("builder_export_docx failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

    filename = _docx_attachment_filename(
        download_stem or folder,
        fallback=(folder.split("_")[0] if "_" in folder else folder) or "resume",
    )
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

async def api_analyze_export_pdf(request: Request):
    """POST /api/analyze-export-pdf — render accepted Analyze edits to a PDF.

    Body (JSON):
      structuredResume  — dict from /api/analyze-upload (required)
      acceptedEdits     — { "<ei>": { "<bi>": "new text" } } (optional)
      referenceFolder   — LaTeX template key, e.g. "Harshibar_Template1" (optional)
      jd                — job description text; if present, runs _llm_tailor_to_jd first (optional)
      role              — job title (optional, used for tailoring + folder naming)
      company           — company name (optional, used for tailoring + folder naming)
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    structured = body.get("structuredResume")
    if not structured or not isinstance(structured, dict):
        return JSONResponse({"error": "structuredResume required"}, status_code=400)

    accepted_edits: dict  = body.get("acceptedEdits") or {}
    reference_folder: str = (body.get("referenceFolder") or "Harshibar_Template1").strip()
    jd: str               = (body.get("jd") or "").strip()
    role: str             = (body.get("role") or structured.get("headline") or "Candidate").strip()
    company: str          = (body.get("company") or "").strip()

    loop = asyncio.get_event_loop()

    def _build_pdf() -> tuple[bytes, str]:
        # 1. Rebuild ResumeDocModel from structured dict + accepted edits
        doc = _doc_from_structured_dict(structured, accepted_edits)

        # 2. Optionally tailor to JD
        if jd:
            doc = _llm_tailor_to_jd(doc, jd, role, company)

        # 3. Render LaTeX
        renderer = JinjaLatexRenderer()
        template_name = _template_name_for_reference(reference_folder)
        new_tex = renderer.render(doc, template_name=template_name)

        # 4. Compile to PDF
        out_folder, _ = _create_structured_output_folder(None, reference_folder, role, company or "export")
        compiled = recompile_resume_from_tex(out_folder, new_tex)

        pdf_path = compiled.get("pdf_path")
        if not pdf_path or not os.path.isfile(pdf_path):
            raise RuntimeError("PDF compilation failed — check pdflatex is installed.")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        safe_name = (doc.full_name or "resume").replace(" ", "_")
        filename  = f"{safe_name}_tailored.pdf"
        return pdf_bytes, filename

    try:
        pdf_bytes, filename = await loop.run_in_executor(None, _build_pdf)
    except Exception as exc:
        logger.exception("analyze_export_pdf failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

async def api_export_pdf_html(request: Request) -> Response:
    """Render arbitrary HTML to PDF via Playwright/Chromium.

    Body: { html: string, filename?: string }
    Returns: PDF bytes (application/pdf)

    Any exception from the Playwright pipeline (Chromium binary missing,
    out-of-memory, page-load timeout) is caught and returned as a JSON 500.
    If we let the exception escape, Starlette's default error handler runs
    BEFORE the CORS middleware, the browser sees a bare 500 with no
    Access-Control-Allow-Origin header, and the surface error is a
    confusing CORS block instead of the real "Chromium not installed" /
    similar root cause.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    html_content = body.get("html", "")
    filename = body.get("filename", "resume.pdf")

    if not html_content:
        return JSONResponse({"error": "html field is required"}, status_code=400)

    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    def render_pdf():
        # Lazy import so the module load doesn't blow up the whole app when
        # Playwright isn't installed (e.g. in a stripped-down dev image).
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            page = browser.new_page()
            page.set_content(html_content, wait_until="networkidle")
            pdf_bytes = page.pdf(
                format="Letter",
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                print_background=True,
            )
            browser.close()
            return pdf_bytes

    loop = asyncio.get_event_loop()
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            pdf_bytes = await loop.run_in_executor(executor, render_pdf)
    except ImportError as exc:
        logger.exception("export-pdf-html: Playwright not installed")
        return JSONResponse(
            {"error": "PDF export unavailable: Playwright/Chromium not installed on this server.",
             "detail": str(exc)},
            status_code=503,
        )
    except Exception as exc:
        logger.exception("export-pdf-html: render failed")
        # Detect the "Executable doesn't exist" message Playwright emits when
        # the browser binary isn't present — distinct from generic crashes.
        msg = str(exc)
        if "Executable doesn't exist" in msg or "playwright install" in msg.lower():
            return JSONResponse(
                {"error": "PDF export unavailable: Chromium binary missing. Run `playwright install chromium` on the server.",
                 "detail": msg[:500]},
                status_code=503,
            )
        return JSONResponse(
            {"error": "PDF export failed.", "detail": msg[:500]},
            status_code=500,
        )

    safe_filename = filename.replace('"', '').replace('\\', '') or "resume.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )
