"""Analyze upload and scoring routes."""
from __future__ import annotations

import io

from resume_gui.routes._shared import *  # noqa: F403
from resume_gui.analysis.constants import _CATEGORY_DISPLAY_NAMES
from resume_gui.analysis.structural_flags import compute_structural_flags
from resume_gui.services.scan_limits import _scan_limit_status_for_user

# Lazy imports for requirement matching — only used when a JD is present.
# Wrapped in a try/except so a missing dep never breaks the import chain.
try:
    from resume_gui.tailor.requirement_match.jd_extractor import extract_requirements_from_jd
    from resume_gui.tailor.requirement_match.matcher import score_resume_against_requirements
    from resume_gui.tailor.requirement_match.weighted_scorer import calculate_jd_match_score
    _REQUIREMENT_MATCH_AVAILABLE = True
except Exception:  # pragma: no cover
    _REQUIREMENT_MATCH_AVAILABLE = False


_SCORING_META = {
    "scoring_model": "deterministic_weighted_v1",
    "scoring_version": "2026-06-03-v1",
    "prompt_version": "jd-extract-v1",
    "scoring_algorithm": "weighted-v1",
}


def _run_jd_match_pipeline(resume_text: str, jd: str) -> dict:
    """Extract JD requirements, match against resume, return scoring payload.

    Returns a dict with keys: requirementConcepts, jdMatchBreakdown,
    jdMatchScore, scoringMeta.  Returns empty/None values on any failure so
    the caller can safely merge without checking.
    """
    if not _REQUIREMENT_MATCH_AVAILABLE or not jd.strip():
        return {
            "requirementConcepts": [],
            "jdMatchBreakdown": None,
            "jdMatchScore": None,
            "scoringMeta": _SCORING_META,
        }
    try:
        concepts = extract_requirements_from_jd(jd)
        if not concepts:
            return {
                "requirementConcepts": [],
                "jdMatchBreakdown": None,
                "jdMatchScore": None,
                "scoringMeta": _SCORING_META,
            }
        matches = score_resume_against_requirements(resume_text[:12000], concepts)
        scoring = calculate_jd_match_score(matches, concepts)
        # Override scoringMeta with the canonical version string from this route.
        scoring["scoringMeta"] = _SCORING_META
        return scoring
    except Exception as exc:
        logger.warning("jd_match_pipeline failed (non-fatal): %s", exc)
        return {
            "requirementConcepts": [],
            "jdMatchBreakdown": None,
            "jdMatchScore": None,
            "scoringMeta": _SCORING_META,
        }


def _resume_json_for_rating(d: dict) -> str:
    """Compact, content-only JSON of the structured résumé for the rating LLM.

    The scorer reads this instead of the raw candidate_profile text. We keep the
    substance a recruiter judges on (summary, experience bullets, education,
    projects, skills) and drop contact/formatting noise (email/phone/links,
    section_order) that only dilutes the prompt.
    """
    def _trim_rows(rows, fields):
        out = []
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            row = {k: r.get(k) for k in fields if r.get(k)}
            if row:
                out.append(row)
        return out

    keep = {
        "name": (d.get("full_name") or "").strip(),
        "headline": (d.get("headline") or "").strip(),
        "summary": (d.get("summary") or "").strip(),
        "experience": _trim_rows(d.get("experience"), ("company", "role", "dates", "location", "bullets")),
        "education": _trim_rows(d.get("education"), ("institution", "degree", "dates", "bullets")),
        "projects": _trim_rows(d.get("projects"), ("name", "tech", "bullets")),
        "skills": d.get("skills") or [],
        "additional": d.get("extra_sections") or [],
    }
    keep = {k: v for k, v in keep.items() if v}
    return json.dumps(keep, ensure_ascii=False)


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
        auth_user_id, auth_user_email = _authenticated_supabase_user(request)
        scan_limit = _scan_limit_status_for_user(auth_user_id, auth_user_email)
        if scan_limit.get("enforced") and not scan_limit.get("allowed"):
            return JSONResponse(
                {
                    "error": "Daily scan limit reached. Upgrade for unlimited scans or try again tomorrow.",
                    "code": "daily_scan_limit_reached",
                    "limit": scan_limit.get("limit"),
                    "used": scan_limit.get("used"),
                    "resetAt": scan_limit.get("resetAt"),
                },
                status_code=429,
            )
        # Compute post-scan remaining to return with the success response.
        scan_limit_meta: dict | None = None
        if scan_limit.get("reason") == "daily_free_tier_limit":
            _limit = scan_limit.get("limit", 5)
            _used = scan_limit.get("used", 0)
            scan_limit_meta = {
                "limit": _limit,
                "used": _used + 1,
                "remaining": max(0, _limit - _used - 1),
                "resetAt": scan_limit.get("resetAt"),
            }

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
                # For PDFs, allow the request to continue so the vision extract
                # path can still recover scanned/image-only resumes.
                if filename.lower().endswith(".pdf"):
                    return ""
                raise ValueError(message_for_empty_resume_extract(outcome.empty_reason))
            return ""

        try:
            text = await loop.run_in_executor(None, _extract_text)
        except ValueError as ve:
            return JSONResponse({"error": str(ve)}, status_code=422)

        if not text.strip() and not filename.lower().endswith(".pdf"):
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
            if not analysis_input_text.strip():
                return JSONResponse(
                    {"error": "No text could be extracted from this PDF. It is often a scanned (image-only) résumé. Upload a PDF with selectable text, or use a .docx export, or run OCR first."},
                    status_code=422,
                )
            result = await loop.run_in_executor(
                None,
                partial(_analyze_resume_comprehensive, analysis_input_text, jd,
                        structured_resume=structured,
                        _log_user_id=auth_user_id, _log_email=auth_user_email),
            )
        else:
            analysis_future = loop.run_in_executor(
                None,
                partial(_analyze_resume_comprehensive, text, jd,
                        _log_user_id=auth_user_id, _log_email=auth_user_email),
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
            # Document-level ATS / structural flags (LinkedIn, open dates,
            # misclassified sections, separators) from the ORIGINAL text + the
            # structured doc — shown as a dedicated panel, not bullet topIssues.
            result["structuralFlags"] = compute_structural_flags(text, structured_dict)
            try:
                from resume_gui.experience_tenure import compute_experience_summary_from_structured
                result["experienceSummary"] = compute_experience_summary_from_structured(structured_dict)
            except Exception as exc:
                logger.warning("experience_summary failed: %s", exc)
            _log_structured_doc("analyze_upload_structured_resume", structured)

        # ── JD requirement match (deterministic layer) ───────────────────────
        # Only runs when a JD was supplied. Adds requirementConcepts,
        # jdMatchBreakdown, jdMatchScore, scoringMeta to the response dict.
        # Never raises — failure leaves those keys with empty/None values.
        if jd and isinstance(result, dict):
            jd_scoring = await loop.run_in_executor(
                None,
                _run_jd_match_pipeline,
                (analysis_input_text or preview_text or ""),
                jd,
            )
            result.update(jd_scoring)
        elif isinstance(result, dict):
            result.update({
                "requirementConcepts": [],
                "jdMatchBreakdown": None,
                "jdMatchScore": None,
                "scoringMeta": _SCORING_META,
            })

        # Persist analysis result for student history + cohort analytics (best-effort).
        # Prefer the verified Supabase session over form fields; advisor institution
        # membership is derived from this email, so client-supplied email is not enough.
        user_id = auth_user_id or (form.get("user_id") or "").strip()
        user_email = auth_user_email or ""
        analysis_id = str(uuid4())
        source_pdf_url = None
        if user_id and filename.lower().endswith(".pdf"):
            try:
                source_pdf_url = await loop.run_in_executor(
                    None, upload_analyze_source_pdf, user_id, analysis_id, data,
                )
            except Exception as exc:
                logger.warning("analyze_upload source PDF upload failed: %s", exc)

        if user_id and isinstance(result, dict):
            persisted_id = None
            try:
                def _persist_sync():
                    return _persist_analysis(
                        result,
                        user_id,
                        user_email or auth_user_email or "",
                        bool(jd),
                        analysis_id=analysis_id,
                        source_pdf_url=source_pdf_url,
                        source_filename=filename,
                    )

                persisted_id = await loop.run_in_executor(None, _persist_sync)
            except Exception as exc:
                logger.warning("analyze_upload persist failed user_id=%s: %s", user_id, exc)
            if persisted_id:
                result["analysisId"] = persisted_id
                result["analysisPersisted"] = True
                if source_pdf_url:
                    result["sourcePdfUrl"] = source_pdf_url
                if filename:
                    result["sourceFilename"] = filename
            else:
                result["analysisPersisted"] = False
                # Do not set analysisId when DB write failed — frontend must fall back to insertAnalysis.

        if scan_limit_meta is not None and isinstance(result, dict):
            result["scanLimitStatus"] = scan_limit_meta

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

    Body:  {
      candidate_profile: str,
      job_description: str,
      model?: str,
      include_bullet_analysis?: bool,
      addressed_gaps?: [{ id?, label, type?, appliedText? }],
      include_structured_resume?: bool,  # text-path extract when upload had no vision doc
    }
    Returns: { ratings, optional structuredResume, optional bulletAnalysis, ... }
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
    auth_user_id, auth_user_email = _authenticated_supabase_user(request)
    scan_limit = _scan_limit_status_for_user(auth_user_id, auth_user_email)
    if scan_limit.get("enforced") and not scan_limit.get("allowed"):
        return JSONResponse(
            {
                "error": "Daily scan limit reached. Upgrade for unlimited scans or try again tomorrow.",
                "code": "daily_scan_limit_reached",
                "limit": scan_limit.get("limit"),
                "used": scan_limit.get("used"),
                "resetAt": scan_limit.get("resetAt"),
            },
            status_code=429,
        )
    analyze_scan_limit_meta: dict | None = None
    if scan_limit.get("reason") == "daily_free_tier_limit":
        _limit = scan_limit.get("limit", 5)
        _used = scan_limit.get("used", 0)
        analyze_scan_limit_meta = {
            "limit": _limit,
            "used": _used + 1,
            "remaining": max(0, _limit - _used - 1),
            "resetAt": scan_limit.get("resetAt"),
        }

    model = str(body.get("model") or "").strip() or primary_llm_model_for_resume_workloads()
    include_bullets = bool(body.get("include_bullet_analysis"))
    include_structured = bool(body.get("include_structured_resume"))

    loop = asyncio.get_event_loop()
    gemini_client = _optional_gemini_client()

    # ── Resolve the structured résumé we SCORE against ──────────────────────
    # We score the clean, typed structured doc — NOT the raw candidate_profile
    # text (which carries column-extraction artifacts). The client sends
    # `structured_resume` on the tailor flow (no extra LLM call); otherwise we
    # extract it once here. candidate_profile is consumed only as the source
    # for that extraction, never fed to the scorer directly.
    client_structured = body.get("structured_resume")
    structured_dict = (
        client_structured if isinstance(client_structured, dict) and client_structured else None
    )
    if structured_dict is None:
        try:
            doc = await loop.run_in_executor(None, partial(_llm_extract, candidate_profile, None))
            if doc is not None:
                structured_dict = _resume_doc_to_dict(doc)
        except Exception as exc:
            logger.warning("api_analyze: structured extract for rating failed: %s", exc)

    resume_for_rating = (
        _resume_json_for_rating(structured_dict) if structured_dict else candidate_profile
    )
    # Deterministic verification/match layers should read the same structured source
    # of truth when available (not potentially stale flat text).
    resume_for_match = candidate_profile
    if structured_dict:
        try:
            structured_doc = _resume_doc_from_parsed(structured_dict)
            synthesized = _synthesize_text_from_resume_doc(structured_doc).strip()
            if synthesized:
                resume_for_match = synthesized
        except Exception as exc:
            logger.warning("api_analyze: structured synthesize for match failed: %s", exc)

    try:
        ratings_future = loop.run_in_executor(
            None,
            partial(_rate_resume, gemini_client, model, resume_for_rating, job_description),
        )
        tasks: list = [ratings_future]
        if include_bullets:
            tasks.append(
                loop.run_in_executor(
                    None,
                    partial(_analyze_resume_comprehensive, candidate_profile, job_description,
                            structured_resume=structured_dict,
                            _log_user_id=auth_user_id, _log_email=auth_user_email),
                ),
            )
        results = await asyncio.gather(*tasks)
        llm_ratings = results[0]
        analysis_raw = results[1] if include_bullets else None
    except Exception as exc:
        logger.exception("api_analyze: _rate_resume failed")
        return JSONResponse({"error": f"analysis failed: {exc}"}, status_code=500)

    ratings = _build_ratings_payload(llm_ratings)
    if ratings is None:
        return JSONResponse({"error": "model returned no usable ratings"}, status_code=502)

    from resume_gui.tailor.gap_workflow import apply_gap_workflow, parse_addressed_gaps

    addressed_gaps = parse_addressed_gaps(body.get("addressed_gaps"))
    if addressed_gaps:
        ratings = apply_gap_workflow(
            ratings,
            resume_for_match,
            addressed_gaps,
            job_description=job_description,
        )

    payload: dict = {"ratings": ratings}
    if include_structured and structured_dict is not None:
        payload["structuredResume"] = structured_dict
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

    # ── JD requirement match (deterministic layer) ───────────────────────────
    # job_description is always non-empty here (required field checked above).
    # Use structured-synthesized text when available to keep deterministic matching
    # aligned with the same source-of-truth used for scoring.
    jd_scoring = await loop.run_in_executor(
        None,
        _run_jd_match_pipeline,
        resume_for_match,
        job_description,
    )
    payload.update(jd_scoring)

    if analyze_scan_limit_meta is not None:
        payload["scanLimitStatus"] = analyze_scan_limit_meta

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
        f"\nJOB DESCRIPTION:\n{jd[:4000]}"
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
