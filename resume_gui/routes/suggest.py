"""Coach suggestions and gap-fix routes."""
from __future__ import annotations

from resume_gui.llm.gap_fix_call import call_suggest_gap_fix_llm
from resume_gui.tailor.gap_fix_prompt import build_suggest_gap_fix_prompt
from resume_gui.tailor.gap_fix_terms import extract_gap_target_terms
from resume_gui.tailor.requirement_match.role_family import classify_role_family
from resume_gui.tailor.gap_fix_validate import validate_gap_fix_suggestions
from resume_gui.tailor.structured_gap_fix import (
    eligible_gap_fix_targets,
    eligible_originals_set,
    structured_targets_json_for_prompt,
)
from resume_gui.routes._shared import *  # noqa: F403

async def api_suggest_gap_fix(request: Request):
    """POST /api/suggest-gap-fix — return 2-3 targeted bullet rewrites for a single gap criterion.

    Much faster than the full suggest-changes call: only looks at one gap and finds the
    best matching bullets to rewrite, without web research or strategic tips.

    Body: {
        "gap_name": str,
        "gap_notes": str,
        "job_description": str,
        "structured_resume": dict,  # required — vision extract; bullets only
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
    job_description   = (body.get("job_description") or "").strip()
    structured_resume = body.get("structured_resume") or body.get("structuredResume")
    candidate_profile = (body.get("candidate_profile") or "").strip()

    if not gap_name:
        return JSONResponse({"error": "gap_name required"}, status_code=400)
    if not job_description:
        return JSONResponse({"error": "job_description required"}, status_code=400)

    loop = asyncio.get_event_loop()
    structured_targets = eligible_gap_fix_targets(structured_resume)
    structured_json = structured_targets_json_for_prompt(structured_resume)

    if not structured_json and candidate_profile:
        try:
            structured_doc = await loop.run_in_executor(
                None, _llm_extract, candidate_profile, None,
            )
            if structured_doc is not None:
                structured_resume = _resume_doc_to_dict(structured_doc)
                structured_targets = eligible_gap_fix_targets(structured_resume)
                structured_json = structured_targets_json_for_prompt(structured_resume)
                logger.info(
                    "suggest-gap-fix: text-path structured extract for legacy client (%s bullets)",
                    len(structured_targets),
                )
        except Exception as exc:
            logger.warning("suggest-gap-fix structured extract from profile failed: %s", exc)

    eligible_originals = eligible_originals_set(structured_targets)

    if not structured_json:
        return JSONResponse(
            {
                "error": "structured_resume required with at least one experience, project, or education bullet (re-upload PDF or run Match score)",
            },
            status_code=400,
        )

    gap_target_terms = extract_gap_target_terms(gap_name, gap_notes)
    prompt = build_suggest_gap_fix_prompt(
        gap_name=gap_name,
        gap_notes=gap_notes,
        gap_target_terms=gap_target_terms,
        eligible_bullets_json=structured_json,
        job_description=job_description,
    )

    try:
        logger.info(
            "suggest-gap-fix  |  gap=%s  eligible_bullets=%s  role=%s",
            gap_name,
            len(structured_targets),
            classify_role_family(job_description),
        )
        data = await loop.run_in_executor(None, lambda: call_suggest_gap_fix_llm(prompt))
        if not isinstance(data, dict):
            return JSONResponse({"error": "AI response could not be parsed."}, status_code=500)
        suggestions = data.get("suggestions")
        if not isinstance(suggestions, list):
            suggestions = []
        validated = validate_gap_fix_suggestions(
            suggestions,
            eligible_originals=eligible_originals,
            gap_name=gap_name,
            gap_notes=gap_notes,
            validate_rewrite_fn=_validate_rewrite_against_original,
        )
        return JSONResponse({"suggestions": validated})
    except json.JSONDecodeError as exc:
        logger.error("suggest-gap-fix JSON parse error: %s", exc)
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
