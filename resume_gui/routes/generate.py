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

async def api_generate_stream(request: Request):
    """SSE endpoint — streams events as the resume is generated."""
    try:
        body = await request.json()
    except json.JSONDecodeError:
        async def err_gen():
            yield {
                "data": json.dumps({
                    "event": "error",
                    "msg": "Invalid JSON body. Send strict JSON with double-quoted property names.",
                })
            }
        return EventSourceResponse(err_gen())

    if not isinstance(body, dict):
        async def err_gen():
            yield {
                "data": json.dumps({
                    "event": "error",
                    "msg": "Invalid request body. Expected a JSON object.",
                })
            }
        return EventSourceResponse(err_gen())

    company           = (body.get("company") or "").strip()
    role              = (body.get("role") or "").strip()
    jd                = (body.get("job_description") or "").strip()
    model = primary_llm_model_for_resume_workloads((body.get("model") or "").strip() or None)
    base_folder       = (body.get("base_folder") or "").strip() or None
    reference_folder  = (body.get("reference_folder") or "").strip() or None
    candidate_profile = (body.get("candidate_profile") or "").strip() or None
    user_id           = (body.get("user_id") or "").strip() or "local"
    layout_compile    = bool(body.get("layout_compile"))
    accepted_suggestions = body.get("accepted_suggestions")
    suggest_research_digest = (body.get("suggest_research_digest") or "").strip() or None
    post_suggestion_coach_run = bool(body.get("post_suggestion_coach_run"))
    _tb = body.get("tailor_body_with_ai")
    tailor_body_with_ai = True if _tb is None else bool(_tb)
    use_jinja_renderer = USE_JINJA_LATEX_RENDERER
    if body.get("use_jinja_renderer") is not None:
        use_jinja_renderer = bool(body.get("use_jinja_renderer"))
    _sr = body.get("structured_resume")
    pre_parsed_upload: Optional[dict] = _sr if isinstance(_sr, dict) else None

    logger.info(
        f"STREAM  |  {role} @ {company}  |  model={model}  |  base={base_folder}  "
        f"|  reference_folder={reference_folder}  "
        f"|  custom_profile={bool(candidate_profile)}  |  layout_compile={layout_compile}  "
        f"|  user={user_id or 'anon'}  |  accepted_suggestions={len(accepted_suggestions) if isinstance(accepted_suggestions, list) else 0}"
        f"  |  reuse_suggest_digest={bool(suggest_research_digest)}"
        f"  |  post_suggestion_coach_run={post_suggestion_coach_run}"
        f"  |  tailor_body_with_ai={tailor_body_with_ai}"
        f"  |  use_jinja_renderer={use_jinja_renderer}"
        f"  |  has_pre_parsed_upload={bool(pre_parsed_upload)}"
    )

    if not company or not role or not jd:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "company, role, and job_description required"})}
        return EventSourceResponse(err_gen())

    loop  = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def run_sync():
        # Track local file paths from the "saved" event so we can upload to
        # Supabase Storage when the matching "pdf" event fires.
        saved_folder: Optional[str] = None
        saved_tex_path: Optional[str] = None
        # "local" = anonymous / no Supabase user — do not write under that prefix in Storage.
        storage_user = user_id if user_id and user_id != "local" else ""

        if use_jinja_renderer:
            try:
                source_folder = (reference_folder or "").strip() or (base_folder or "").strip() or "structured"
                base_tex: Optional[str] = None
                if USE_SUPABASE_TEMPLATE_BODY:
                    try:
                        _sf, _tex = _resolve_structured_source_folder(base_folder, reference_folder, user_id)
                        source_folder, base_tex = _sf, _tex
                    except Exception:
                        base_tex = None
                else:
                    base_tex = _load_tex_from_candidate(source_folder, user_id)

                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "status",
                    "msg": f"Structured renderer: loading source ({source_folder})…",
                }), loop).result()

                # Content pipeline: LLM extraction+tailoring → regex fallback → base .tex fallback.
                # The selected template controls layout; the content pipeline controls substance.
                n_approved = _count_approved_suggestions(
                    accepted_suggestions if isinstance(accepted_suggestions, list) else None
                )
                use_conservative_tailor = (
                    post_suggestion_coach_run
                    and not tailor_body_with_ai
                    and n_approved == 0
                )
                if use_conservative_tailor:
                    logger.info(
                        "Structured renderer: conservative content — skipping full LLM JD rewrite "
                        "(post_suggestion_coach_run, no approved edits)"
                    )

                if candidate_profile and jd and not use_conservative_tailor:
                    asyncio.run_coroutine_threadsafe(queue.put({
                        "event": "status",
                        "msg": "Extracting résumé sections faithfully…",
                    }), loop).result()
                doc = _structured_doc_for_generate(
                    candidate_profile,
                    jd,
                    role,
                    company,
                    use_conservative_tailor=use_conservative_tailor,
                    base_tex=base_tex,
                    pre_parsed=pre_parsed_upload,
                )
                logger.info(
                    "Structured generate | extract_path logged above | counts=%s",
                    _doc_extraction_counts(doc),
                )
                if candidate_profile and jd and not use_conservative_tailor:
                    asyncio.run_coroutine_threadsafe(queue.put({
                        "event": "status",
                        "msg": "Tailoring summary, experience, and project bullets to the job…",
                    }), loop).result()
                _apply_accepted_edits_to_doc(doc, accepted_suggestions if isinstance(accepted_suggestions, list) else None)

                # Emit the tailored structured doc so the frontend can render
                # it via ResumeDocumentView and export via HTML→Chromium.
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "structured_doc",
                    "data": _resume_doc_to_dict(doc),
                }), loop).result()

                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "status",
                    "msg": "Structured renderer: generating deterministic LaTeX…",
                }), loop).result()

                renderer = JinjaLatexRenderer()
                template_name = _template_name_for_reference(source_folder or reference_folder)
                new_tex = renderer.render(doc, template_name=template_name)
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "status",
                    "msg": f"Structured renderer: using file template ({template_name})…",
                }), loop).result()

                out_folder, _ = _create_structured_output_folder(base_folder, reference_folder, role, company)
                compiled = recompile_resume_from_tex(out_folder, new_tex)
                tex_path = compiled.get("tex_path")
                pdf_path = compiled.get("pdf_path")
                filename = Path(tex_path).name if tex_path else "resume.tex"

                saved_event = {
                    "event": "saved",
                    "folder": out_folder,
                    "tex_path": tex_path,
                }

                # mirror storage upload handling for .tex
                saved_folder = saved_event.get("folder")
                saved_tex_path = saved_event.get("tex_path")
                if storage_user and saved_folder and saved_tex_path:
                    try:
                        tex_url = upload_tex(storage_user, saved_folder, saved_tex_path)
                        if tex_url:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": True,
                                "url": tex_url,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_tex failed: {exc}")

                asyncio.run_coroutine_threadsafe(queue.put(saved_event), loop).result()

                if not compiled.get("compiled"):
                    raise RuntimeError(compiled.get("compile_error") or "Structured renderer compile failed")

                rel_pdf = f"/pdf/{out_folder}/{Path(pdf_path).name}" if pdf_path else None
                pdf_event = {"event": "pdf", "url": rel_pdf}

                if storage_user and saved_folder and pdf_path:
                    try:
                        public = upload_pdf(storage_user, saved_folder, pdf_path)
                        if public and public.startswith(("http://", "https://")):
                            pdf_event = {"event": "pdf", "url": public}
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": True,
                                "url": public,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_pdf failed: {exc}")

                # Frontend/library contract + LLM-based ratings.
                gemini_client = _optional_gemini_client()
                try:
                    llm_ratings = _rate_resume(gemini_client, model, new_tex, jd[:1500])
                except Exception:
                    llm_ratings = None
                if llm_ratings and isinstance(llm_ratings, dict):
                    if "qualifications" in llm_ratings or "responsibilities" in llm_ratings:
                        # New detailed schema
                        kw = llm_ratings.get("keywords") or {}
                        overall = int(llm_ratings.get("overall_score") or llm_ratings.get("match_score") or 0)
                        # Support both new categorized schema and legacy flat arrays
                        if isinstance(kw, dict) and ("direct_skills" in kw or "contextual" in kw):
                            # New categorized keyword schema
                            ds = kw.get("direct_skills") or {}
                            ctx = kw.get("contextual") or {}
                            ds_found = ds.get("found") or [] if isinstance(ds, dict) else []
                            ds_missing = ds.get("missing") or [] if isinstance(ds, dict) else []
                            ctx_found = ctx.get("found") or [] if isinstance(ctx, dict) else []
                            ctx_missing = ctx.get("missing") or [] if isinstance(ctx, dict) else []
                            # Normalise ctx_found to list of {keyword, count} dicts
                            ctx_found_norm = []
                            for item in ctx_found:
                                if isinstance(item, dict):
                                    ctx_found_norm.append({"keyword": str(item.get("keyword", "")), "count": int(item.get("count", 1))})
                                else:
                                    ctx_found_norm.append({"keyword": str(item), "count": 1})
                            kw_payload = {
                                "direct_skills": {"found": ds_found, "missing": ds_missing},
                                "contextual": {"found": ctx_found_norm, "missing": ctx_missing},
                                "found_count": len(ds_found) + len(ctx_found_norm),
                                "total_count": len(ds_found) + len(ds_missing) + len(ctx_found_norm) + len(ctx_missing),
                            }
                        else:
                            # Legacy flat arrays — wrap into new shape
                            found_kw = kw.get("found") or [] if isinstance(kw, dict) else []
                            missing_kw = kw.get("missing") or [] if isinstance(kw, dict) else []
                            kw_payload = {
                                "direct_skills": {"found": found_kw, "missing": missing_kw},
                                "contextual": {"found": [], "missing": []},
                                "found_count": len(found_kw),
                                "total_count": len(found_kw) + len(missing_kw),
                            }
                        ratings_payload = {
                            # New schema fields
                            "overall_score": overall,
                            "job_title": llm_ratings.get("job_title") or {},
                            "qualifications": llm_ratings.get("qualifications") or {"score": 0, "covered": [], "missing": []},
                            "responsibilities": llm_ratings.get("responsibilities") or {"score": 0, "covered": [], "missing": []},
                            "keywords": kw_payload,
                            "whats_working": llm_ratings.get("whats_working") or [],
                            "gaps": llm_ratings.get("gaps") or [],
                            "verdict": llm_ratings.get("verdict", ""),
                            # Backwards compat: keep match_score and criteria so old consumers don't break
                            "match_score": overall,
                            "criteria": [],
                        }
                    else:
                        # Old schema (fallback if model returns old format)
                        ratings_payload = {
                            "match_score": llm_ratings.get("match_score", 0),
                            "criteria": (llm_ratings.get("criteria") or [])[:12],
                            "whats_working": llm_ratings.get("whats_working") or [],
                            "gaps": llm_ratings.get("gaps") or [],
                            "verdict": llm_ratings.get("verdict", ""),
                        }
                else:
                    # Fallback to ATS-based scoring.
                    ats = ats_check(
                        out_folder, jd, storage_user or user_id,
                        target_role=role, parsed=parse_resume_tex(new_tex),
                    )
                    ratings_payload = structured_ratings_from_ats(ats)

                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "base",
                    "folder": source_folder,
                    "loaded": True,
                }), loop).result()

                diff_data, diff_adds, diff_removes, rationales_data = _structured_tailor_diff_and_rationales(
                    baseline_tex=base_tex,
                    new_tex=new_tex,
                    jd=jd,
                    model=model,
                    gemini_client=gemini_client,
                    accepted_suggestions=accepted_suggestions if isinstance(accepted_suggestions, list) else None,
                )
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "diff",
                    "data": diff_data,
                    "adds": diff_adds,
                    "removes": diff_removes,
                }), loop).result()
                if rationales_data:
                    asyncio.run_coroutine_threadsafe(queue.put({
                        "event": "rationales",
                        "data": rationales_data,
                    }), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "ratings",
                    "data": ratings_payload,
                }), loop).result()

                asyncio.run_coroutine_threadsafe(queue.put(pdf_event), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put({"event": "done"}), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()
                return
            except Exception as exc:
                logger.exception("structured renderer failed")
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "error",
                    "msg": f"Structured renderer failed: {exc}",
                }), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()
                return

        for event in stream_latex_resume(
            company, role, jd,
            reference_folder=reference_folder,
            model=model, base_folder=base_folder, candidate_profile=candidate_profile, user_id=user_id,
            layout_compile=layout_compile,
            accepted_suggestions=accepted_suggestions if isinstance(accepted_suggestions, list) else None,
            pre_research_digest=suggest_research_digest,
            post_suggestion_coach_run=post_suggestion_coach_run,
            tailor_body_with_ai=tailor_body_with_ai,
        ):
            ev_name = event.get("event")

            if ev_name == "saved":
                saved_folder   = event.get("folder")
                saved_tex_path = event.get("tex_path")
                # Upload the .tex source straight away — even if pdflatex fails
                # later, we still want the source preserved for diff/use-as-base.
                if storage_user and saved_folder and saved_tex_path:
                    try:
                        tex_url = upload_tex(storage_user, saved_folder, saved_tex_path)
                        if tex_url:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": True,
                                "url": tex_url,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_tex failed: {exc}")
                        asyncio.run_coroutine_threadsafe(queue.put({
                            "event": "storage",
                            "artifact": "tex",
                            "stored": False,
                            "reason": str(exc),
                        }), loop).result()

            elif ev_name == "pdf" and storage_user and saved_folder:
                # The library emits a relative URL like "/pdf/<folder>/<file>.pdf".
                # Resolve the local file path, push to Supabase Storage, and
                # rewrite the event so the frontend gets a durable absolute URL.
                rel_url  = event.get("url") or ""
                filename = rel_url.rsplit("/", 1)[-1] if rel_url else None
                if filename:
                    pdf_path = os.path.join(LIBRARY_ROOT, saved_folder, filename)
                    try:
                        public = upload_pdf(storage_user, saved_folder, pdf_path)
                        if public and public.startswith(("http://", "https://")):
                            event = {**event, "url": public}
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": True,
                                "url": public,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_pdf failed: {exc}")
                        asyncio.run_coroutine_threadsafe(queue.put({
                            "event": "storage",
                            "artifact": "pdf",
                            "stored": False,
                            "reason": str(exc),
                        }), loop).result()

            asyncio.run_coroutine_threadsafe(queue.put(event), loop).result()
        asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

    threading.Thread(target=run_sync, daemon=True).start()

    async def event_gen():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield {"data": json.dumps(item)}

    return EventSourceResponse(event_gen())
