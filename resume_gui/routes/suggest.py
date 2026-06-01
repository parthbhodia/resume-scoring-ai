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
from resume_gui.analysis.rewrite_validators import _validate_rewrite_against_original
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

async def api_suggest_changes(request: Request):
    """POST /api/suggest-changes — analyze resume vs JD and return per-bullet suggestions.

    Body: { "candidate_profile": str, "job_description": str,
            optional reuse_research_digest, reuse_research_queries, reuse_research_sources }
    Returns: { "summary", "suggestions", optional "research_queries", "research_sources", "research_digest" }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    candidate_profile = (body.get("candidate_profile") or "").strip()
    job_description   = (body.get("job_description") or "").strip()

    if not candidate_profile:
        return JSONResponse({"error": "candidate_profile required"}, status_code=400)
    if not job_description:
        return JSONResponse({"error": "job_description required"}, status_code=400)

    loop = asyncio.get_event_loop()
    digest = ""
    research_queries: List[str] = []
    research_sources: List[dict] = []
    reuse = _try_suggest_reuse_research(body)
    if reuse:
        digest, research_queries, research_sources = reuse
        logger.info("suggest-changes: reusing client-provided research digest (%s chars)", len(digest))
    else:
        try:
            digest, research_queries, research_sources = await loop.run_in_executor(
                None, run_tailor_research_job_context, job_description
            )
        except Exception as exc:
            logger.warning("pre-suggestion web research failed (suggestions will use resume+JD only): %s", exc)

    focus_gaps = _parse_focus_gaps(body.get("focus_gaps"))
    prompt = _resume_coach_prompt(candidate_profile, job_description, digest, focus_gaps=focus_gaps)

    def _call():
        return coach_suggestions_llm(prompt)

    try:
        text = await loop.run_in_executor(None, _call)
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        data = json.loads(text)
        if isinstance(data, dict):
            data["strategic_tips"] = _sanitize_strategic_tips(data.get("strategic_tips"))
            data["interview_questions"] = _sanitize_interview_questions(data.get("interview_questions"))
            data["research_queries"] = research_queries
            data["research_sources"] = research_sources
            if digest.strip():
                data["research_digest"] = digest.strip()[:2500]
        return JSONResponse(data)
    except json.JSONDecodeError as exc:
        logger.error(f"suggest-changes JSON parse error: {exc}  raw={text[:200]}")
        return JSONResponse({"error": "AI response could not be parsed."}, status_code=500)
    except Exception as exc:
        logger.exception("suggest-changes failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_suggest_gap_fix(request: Request):
    """POST /api/suggest-gap-fix — return 2-3 targeted bullet rewrites for a single gap criterion.

    Much faster than the full suggest-changes call: only looks at one gap and finds the
    best matching bullets to rewrite, without web research or strategic tips.

    Body: {
        "gap_name": str,          # e.g. "Zendesk Administration"
        "gap_notes": str,         # the gap explanation text shown in the UI
        "candidate_profile": str, # plain-text resume
        "job_description": str,
    }
    Returns: {
        "suggestions": [{"id", "original", "suggested", "reason", "section", "priority"}]
    }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    gap_name          = (body.get("gap_name") or "").strip()
    gap_notes         = (body.get("gap_notes") or "").strip()
    candidate_profile = (body.get("candidate_profile") or "").strip()
    job_description   = (body.get("job_description") or "").strip()

    if not gap_name:
        return JSONResponse({"error": "gap_name required"}, status_code=400)
    if not candidate_profile:
        return JSONResponse({"error": "candidate_profile required"}, status_code=400)
    if not job_description:
        return JSONResponse({"error": "job_description required"}, status_code=400)

    notes_line = f"\nGap detail: {gap_notes}" if gap_notes else ""
    prompt = (
        "You are an expert resume coach. A candidate's résumé was scored and one specific criterion scored low.\n\n"
        f"LOW-SCORING CRITERION: {gap_name}{notes_line}\n\n"
        f"RÉSUMÉ:\n{candidate_profile[:5000]}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:2000]}\n\n"
        "Task: Find the 2-3 bullets in the résumé that are most relevant to this gap and suggest improved "
        "rewrites that better surface the skill or experience. If no bullet directly addresses the gap, "
        "find the closest transferable experience and reframe it.\n\n"
        "Rules:\n"
        "- Only rewrite bullets that EXIST verbatim in the résumé — quote each original exactly.\n"
        "- Do NOT invent metrics, employers, dates, or facts not already in the résumé.\n"
        # A5 — length is flexible upward, never downward
        "- Length: rewrites should be the same length or longer than the original. They may grow\n"
        "  to fit new keywords, but they may NOT shrink by dropping content. One bullet → one\n"
        "  bullet (no splitting), but use as many words as you need to preserve everything.\n"
        "- Focus on vocabulary and framing that matches the job description keywords.\n"
        "- KEYWORD PRESERVATION (CRITICAL): the suggested rewrite MUST preserve every concrete\n"
        "  technical term from the original bullet. Specifically:\n"
        "    * AWS service names (Lambda, Cognito, API Gateway, Bedrock, S3, SQS, DynamoDB, etc.)\n"
        "    * Cloud / DevOps tools (Docker, Kubernetes, Terraform, Jenkins, GitHub Actions, etc.)\n"
        "    * Programming languages and frameworks (Python, Java, Spring Boot, FastAPI, React, etc.)\n"
        "    * Protocols and standards (gRPC, REST, GraphQL, OAuth, SAML, WCAG, etc.)\n"
        "    * Database / data engine names (PostgreSQL, Redis, Kafka, RabbitMQ, etc.)\n"
        "    * Specific product / project nouns (e.g. 'live audio and text', 'CI/CD pipelines',\n"
        "      'infrastructure as code') — do NOT generalize them to vague phrases like 'live data'.\n"
        "  You may ADD new keywords from the JD. You may REPHRASE. You may NOT delete any of the\n"
        "  named technologies, services, protocols, or domain-specific nouns above.\n"
        # A2 — anti-abstraction rule with concrete examples
        "- NO ABSTRACTING (CRITICAL): do not replace a specific term with a generic one. Examples\n"
        "  of changes you must NEVER make:\n"
        "    * 'live audio and text'  →  'live data'                       ❌ (lost the product)\n"
        "    * 'PostgreSQL'            →  'database' or 'a relational store' ❌ (lost the engine)\n"
        "    * 'AWS Lambda'            →  'serverless functions'           ❌ (lost the service)\n"
        "    * 'Kubernetes'            →  'container orchestration'         ❌ (lost the tool)\n"
        "    * 'gRPC streaming'        →  'real-time streaming'             ❌ (lost the protocol)\n"
        "    * 'CI/CD pipelines'       →  'automated deployment'            ❌ (lost the keyword)\n"
        "  The right move is to ADD JD vocabulary alongside the original specifics, not replace.\n"
        "- HONESTY: if the bullet's actual content has no genuine connection to the gap, do NOT\n"
        "  shoehorn the gap's vocabulary in. Skip that bullet and pick a different one, or return\n"
        "  fewer than 3 suggestions. A weak forced bridge is worse than a missing one.\n\n"
        # A3 — few-shot examples (good, bad, skip)
        "Examples of good / bad / skip — STUDY THESE before responding.\n\n"
        "ORIGINAL bullet: 'Built FastAPI service on AWS Lambda that ingests Kafka events into\n"
        "                  PostgreSQL with sub-second latency.'\n"
        "GAP: 'real-time data pipelines'\n"
        "✅ GOOD rewrite: 'Built FastAPI service on AWS Lambda that powers a real-time data\n"
        "                  pipeline, ingesting Kafka events into PostgreSQL with sub-second\n"
        "                  latency.'\n"
        "   Why: every original keyword (FastAPI, AWS Lambda, Kafka, PostgreSQL) is preserved.\n"
        "   'real-time data pipeline' is ADDED. Length grew by one phrase.\n"
        "❌ BAD rewrite:  'Built a real-time data pipeline with sub-second latency on AWS.'\n"
        "   Why: dropped FastAPI, Lambda (now just 'AWS'), Kafka, PostgreSQL — four keywords\n"
        "   gone in exchange for one. Bullet is shorter and weaker. NEVER do this.\n\n"
        "ORIGINAL bullet: 'Designed onboarding flow with progress bars and tooltips for new users.'\n"
        "GAP: 'experience with retail labor systems'\n"
        "⊘ SKIP this bullet. There is no honest bridge from onboarding UI work to retail labor\n"
        "   systems. Forcing a connection ('Designed retail labor onboarding flow…') would be a\n"
        "   lie. Pick a different bullet, or return fewer suggestions.\n\n"
        # A4 — self-critique / verification step
        "Self-check before responding: for EACH suggestion you produce, do these steps mentally:\n"
        "  1. List every capitalized noun, acronym, and CamelCase term in the ORIGINAL bullet.\n"
        "  2. Confirm each of those terms appears verbatim in your SUGGESTED rewrite.\n"
        "  3. If any term from step 1 is missing in step 2, DO NOT emit that suggestion — revise\n"
        "     it until every term is preserved, or drop the suggestion entirely.\n"
        "  4. Confirm your rewrite is at least as long as the original (in words).\n"
        "  5. Confirm at least one phrase from the JOB DESCRIPTION appears in the rewrite (added,\n"
        "     not substituted).\n"
        "Only return a suggestion that passes all five checks.\n\n"
        # Force the category to match what the rewrite actually does — the
        # server-side validator will reject 'quantification' suggestions that
        # add no numerals, and reject any rewrite that drops a numeral or
        # proper noun from the original.
        "CATEGORY TRUTH: pick the category that matches what your rewrite actually does.\n"
        "  - 'quantification' is only valid if your rewrite adds a numeral (digits, %, scale, or\n"
        "    a [X]/[$Y]/[~N] placeholder) that was NOT in the original.\n"
        "  - 'add_keywords' / 'relevance' are valid when you add JD vocabulary alongside the\n"
        "    original specifics.\n"
        "  - 'remove_filler' is the ONLY category that may shrink the bullet, and even then it\n"
        "    must preserve every numeral and named technology from the original.\n"
        "  - 'readability' / 'languageQuality' / 'action_verbs' must NOT delete numerals or\n"
        "    named technologies — they apply to wording and verb choice, not content removal.\n"
        "  The server will reject any suggestion whose rewrite drops a numeral or proper noun\n"
        "  from the original, and any 'quantification' suggestion that adds no new numerals.\n\n"
        "Return ONLY a JSON object:\n"
        '{\n'
        '  "suggestions": [\n'
        '    {\n'
        '      "id": "gf1",\n'
        '      "section": "Work Experience",\n'
        '      "original": "The exact bullet text from the résumé (verbatim)",\n'
        '      "suggested": "The improved bullet text",\n'
        '      "reason": "One sentence explaining how this rewrite addresses the gap.",\n'
        '      "category": "add_keywords",\n'
        '      "priority": "high"\n'
        '    }\n'
        '  ]\n'
        '}\n'
        "Return 2-3 suggestions maximum. Return ONLY the JSON, no markdown fences."
    )

    loop = asyncio.get_event_loop()

    def _call():
        return coach_suggestions_llm(prompt)

    try:
        logger.info("suggest-gap-fix  |  gap=%s  profile_chars=%s", gap_name, len(candidate_profile))
        text = await loop.run_in_executor(None, _call)
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        data = json.loads(text)
        suggestions = data.get("suggestions") if isinstance(data, dict) else []
        if not isinstance(suggestions, list):
            suggestions = []
        # Drop any rewrite that silently deletes numerals or proper nouns
        # from the original bullet — those are the "lossy rewrite tagged
        # readability" failure mode we saw repeatedly. Better to return
        # fewer suggestions than a lying one.
        validated: List[dict] = []
        for s in suggestions:
            if not isinstance(s, dict):
                continue
            original = str(s.get("original") or "").strip()
            suggested = str(s.get("suggested") or "").strip()
            if not original or not suggested:
                continue
            cat = str(s.get("category") or "").strip().lower() or None
            ok, why = _validate_rewrite_against_original(original, suggested, category=cat)
            if not ok:
                logger.info(
                    "suggest-gap-fix dropped suggestion (%s): orig=%r  rewrite=%r",
                    why, original[:80], suggested[:80],
                )
                continue
            validated.append(s)
        return JSONResponse({"suggestions": validated})
    except json.JSONDecodeError as exc:
        logger.error("suggest-gap-fix JSON parse error: %s  raw=%s", exc, text[:200])
        return JSONResponse({"error": "AI response could not be parsed."}, status_code=500)
    except Exception as exc:
        logger.exception("suggest-gap-fix failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

async def api_suggest_changes_stream(request: Request):
    """POST /api/suggest-changes-stream — same inputs as suggest-changes; SSE with live coach tokens.

    Body may include reuse_research_digest (+ optional reuse_research_queries / reuse_research_sources)
    to skip a second live JD web search when the job description is unchanged since the last pass.

    Events (JSON per line after ``data: ``):
      ``status`` {msg}
      ``research`` {research_queries, research_sources, research_digest}
      ``coach_delta`` {text} — fragment of the JSON response from the model
      ``coach_done`` {summary, suggestions, research_*} — final structured payload
      ``error`` {msg}
    """
    try:
        body = await request.json()
    except Exception:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "invalid json"})}
        return EventSourceResponse(err_gen())

    if not isinstance(body, dict):
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "Expected a JSON object."})}
        return EventSourceResponse(err_gen())

    candidate_profile = (body.get("candidate_profile") or "").strip()
    job_description = (body.get("job_description") or "").strip()
    if not candidate_profile:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "candidate_profile required"})}
        return EventSourceResponse(err_gen())
    if not job_description:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "job_description required"})}
        return EventSourceResponse(err_gen())

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()
    reuse_pack = _try_suggest_reuse_research(body)
    focus_gaps = _parse_focus_gaps(body.get("focus_gaps"))

    def producer():
        try:
            def qput(item: Dict[str, Any]) -> None:
                asyncio.run_coroutine_threadsafe(queue.put(item), loop).result()

            digest = ""
            research_queries: List[str] = []
            research_sources: List[dict] = []
            if reuse_pack:
                digest, research_queries, research_sources = reuse_pack
                logger.info("suggest-changes-stream: reusing client research digest (%s chars)", len(digest))
                qput({"event": "status", "msg": "Reusing web research from your last pass for this job…"})
            else:
                qput({"event": "status", "msg": "Gathering live context from the web…"})
                try:
                    digest, research_queries, research_sources = run_tailor_research_job_context(job_description)
                except Exception as exc:
                    logger.warning("pre-suggestion web research failed (suggestions stream): %s", exc)
            rd = digest.strip()[:2500] if digest.strip() else ""
            qput({
                "event": "research",
                "research_queries": research_queries,
                "research_sources": research_sources,
                "research_digest": rd,
            })
            qput({"event": "status", "msg": "Drafting tailored suggestions…"})
            prompt = _resume_coach_prompt(candidate_profile, job_description, digest, focus_gaps=focus_gaps)

            def on_delta(fragment: str) -> None:
                qput({"event": "coach_delta", "text": fragment})

            text = coach_suggestions_llm_stream(prompt, on_delta=on_delta)
            if text.startswith("```"):
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
            data = json.loads(text)
            if not isinstance(data, dict):
                raise RuntimeError("Coach returned non-object JSON")
            strategic_tips = _sanitize_strategic_tips(data.get("strategic_tips"))
            interview_questions = _sanitize_interview_questions(data.get("interview_questions"))
            suggestions = _sanitize_suggestions(data.get("suggestions"))
            data["strategic_tips"] = strategic_tips
            data["interview_questions"] = interview_questions
            data["suggestions"] = suggestions
            data["research_queries"] = research_queries
            data["research_sources"] = research_sources
            if digest.strip():
                data["research_digest"] = digest.strip()[:2500]
            qput({
                "event": "coach_done",
                "summary": data.get("summary"),
                "strategic_tips": strategic_tips,
                "interview_questions": interview_questions,
                "suggestions": suggestions,
                "research_queries": data.get("research_queries"),
                "research_sources": data.get("research_sources"),
                "research_digest": data.get("research_digest"),
            })
        except json.JSONDecodeError as exc:
            logger.error("suggest-changes-stream JSON parse error: %s", exc)
            asyncio.run_coroutine_threadsafe(
                queue.put({"event": "error", "msg": "AI response could not be parsed."}),
                loop,
            ).result()
        except Exception as exc:
            logger.exception("suggest-changes-stream failed")
            asyncio.run_coroutine_threadsafe(
                queue.put({"event": "error", "msg": _sse_friendly_error(exc)}),
                loop,
            ).result()
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

    threading.Thread(target=producer, daemon=True).start()

    async def event_gen():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield {"data": json.dumps(item)}

    return EventSourceResponse(event_gen())

async def api_apply_suggestions(request: Request):
    """POST /api/apply-suggestions

    Apply accepted suggestion rewrites to a resume folder WITHOUT an LLM rewrite pass.

    Flow:
      1. Load ResumeDocModel from Supabase resumes table (by folder).
      2. Patch each accepted suggestion via _apply_accepted_edits_to_doc (string replacement).
      3. Re-render via JinjaLatexRenderer → deterministic .tex (no LLM).
      4. Compile with pdflatex.
      5. Upload new PDF to storage.
      6. UPDATE Supabase resumes row: resume_doc + pdf_url + applied_suggestions log.
      7. Return {pdf_url, patches_applied, patches_failed, folder}.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    folder   = str(body.get("folder") or "").strip()
    accepted = body.get("accepted_suggestions") or []
    user_id  = str(body.get("user_id") or "local").strip()
    # Optional: caller can pass resume_doc directly (avoids a Supabase round-trip)
    resume_doc_override = body.get("resume_doc")

    if not folder:
        return JSONResponse({"error": "folder is required"}, status_code=400)
    if not accepted:
        return JSONResponse({"error": "accepted_suggestions is required"}, status_code=400)

    # ── 1. Load ResumeDocModel ────────────────────────────────────────────────
    doc: Optional["ResumeDocModel"] = None
    raw_doc_dict: Optional[dict] = None

    # Try caller-supplied doc first (fastest, no DB round-trip)
    if isinstance(resume_doc_override, dict) and resume_doc_override:
        try:
            raw_doc_dict = resume_doc_override
            doc = _resume_doc_from_parsed(raw_doc_dict)
        except Exception as exc:
            logger.warning(f"apply-suggestions: could not parse caller resume_doc: {exc}")
            doc = None

    # Fall back to Supabase
    if doc is None:
        try:
            supabase = _supabase_table("resumes")
            res = (
                supabase
                .select("resume_doc, reference_folder")
                .eq("folder", folder)
                .limit(1)
                .execute()
            )
            row = (res.data or [None])[0]
            if row and row.get("resume_doc"):
                raw_doc_dict = row["resume_doc"]
                doc = _resume_doc_from_parsed(raw_doc_dict)
        except Exception as exc:
            logger.warning(f"apply-suggestions: Supabase load failed: {exc}")

    if doc is None:
        return JSONResponse(
            {"error": "Could not load resume data for this folder. Re-generate the resume first."},
            status_code=404,
        )

    # ── 2. Patch the doc (pure string replacement, no LLM) ──────────────────
    _apply_accepted_edits_to_doc(doc, accepted)
    raw_doc_dict = _resume_doc_to_dict(doc)

    # Count how many bullets actually matched
    patches_applied = 0
    patches_failed  = 0
    for item in accepted:
        original  = str(item.get("original") or "").strip()
        suggested = str(item.get("suggested") or "").strip()
        if not original or not suggested:
            continue
        # Check if the suggested text appears anywhere in the serialised doc
        doc_text = str(raw_doc_dict)
        if suggested in doc_text or original not in doc_text:
            patches_applied += 1
        else:
            patches_failed += 1

    # ── 3. Re-render via Jinja (deterministic, no LLM) ───────────────────────
    try:
        renderer = JinjaLatexRenderer()
        ref_folder = (row or {}).get("reference_folder") or ""
        template_name = _template_name_for_reference(ref_folder)
        new_tex = renderer.render(doc, template_name=template_name)
    except Exception as exc:
        logger.exception("apply-suggestions: Jinja render failed")
        return JSONResponse({"error": f"LaTeX render failed: {exc}"}, status_code=500)

    # ── 4. Compile ───────────────────────────────────────────────────────────
    try:
        compiled = recompile_resume_from_tex(folder, new_tex)
    except Exception as exc:
        logger.exception("apply-suggestions: pdflatex failed")
        return JSONResponse({"error": f"PDF compilation failed: {exc}"}, status_code=500)

    if not compiled.get("compiled"):
        return JSONResponse(
            {"error": "PDF compilation failed", "details": compiled.get("compile_error", "")},
            status_code=500,
        )

    # ── 5. Upload PDF ────────────────────────────────────────────────────────
    pdf_url: Optional[str] = None
    try:
        pdf_url = upload_pdf(user_id, folder, compiled["pdf_path"])
    except Exception as exc:
        logger.warning(f"apply-suggestions: upload_pdf failed: {exc}")
        # Non-fatal — local PDF still available

    # Fall back to the locally-served PDF route if Supabase upload failed
    # so the frontend always gets a usable URL it can reload the viewer with.
    if not pdf_url and compiled.get("pdf_path") and os.path.isfile(compiled["pdf_path"]):
        pdf_url = f"/pdf/{folder}/{Path(compiled['pdf_path']).name}"

    # Upload updated .tex too
    try:
        upload_tex(user_id, folder, compiled["tex_path"])
    except Exception as exc:
        logger.warning(f"apply-suggestions: upload_tex failed: {exc}")

    # ── 6. Update Supabase ───────────────────────────────────────────────────
    try:
        update_payload: dict = {
            "resume_doc": raw_doc_dict,
            "applied_patch": {
                "suggestions": [
                    {"original": s.get("original"), "suggested": s.get("suggested"), "category": s.get("category")}
                    for s in accepted if s.get("original")
                ],
                "applied_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            },
        }
        if pdf_url:
            update_payload["pdf_url"] = pdf_url
        _supabase_table("resumes").update(update_payload).eq("folder", folder).execute()
    except Exception as exc:
        logger.warning(f"apply-suggestions: Supabase update failed: {exc}")

    return JSONResponse({
        "pdf_url":        pdf_url,
        "patches_applied": patches_applied,
        "patches_failed":  patches_failed,
        "folder":         folder,
    })
