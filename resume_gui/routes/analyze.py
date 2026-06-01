"""Analyze upload and scoring routes."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

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
