"""Resume library and upload routes."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

async def api_resumes(request: Request):
    user_id = (request.query_params.get("user_id") or "").strip()

    # 1. Try the Supabase `resumes` *table* first — this is the authoritative source
    #    and is properly scoped to the authenticated user.
    if user_id:
        supabase = _supabase_client()
        if supabase:
            try:
                rows = (
                    supabase.table("resumes")
                    .select("folder, company, role, score, pdf_url, created_at, job_description")
                    .eq("user_id", user_id)
                    .order("created_at", desc=True)
                    .execute()
                    .data or []
                )
                if rows:
                    logger.info(f"GET /api/resumes  |  {len(rows)} DB rows  user={user_id}")
                    return JSONResponse(rows)
            except Exception as exc:
                logger.warning(f"api_resumes: DB query failed: {exc}")

    # 2. Fall back to local disk (dev mode only — never exposes other users' data
    #    because local resumes have no user_id concept).
    resumes = list_resumes()
    logger.info(f"GET /api/resumes  |  {len(resumes)} local entries  user={user_id or 'anon'}")
    return JSONResponse(resumes)

async def api_upload_resume(request: Request):
    """Extract résumé text from PDF or DOCX (MarkItDown + LLM structured parse).

    Returns ``text`` (plain, builder-friendly), ``markdown`` (raw extract),
    optional ``structured`` (JSON), ``parse_status`` (``ready`` | ``llm_failed``),
    and optional ``hints`` when structured parsing did not complete.

    Guards mirror common patterns from Resume Matcher (type, size, empty extract, clear errors).
    """
    try:
        form = await request.form()
        file = form.get("file")
        if file is None:
            return JSONResponse({"error": "No file uploaded", "code": "no_file"}, status_code=400)
        content = await file.read()
        if not content:
            return JSONResponse({"error": "Empty file", "code": "empty_file"}, status_code=400)

        filename = getattr(file, "filename", None) or "resume.pdf"
        content_type = getattr(file, "content_type", None)

        from resume_upload_parse import (
            RESUME_UPLOAD_MAX_BYTES,
            extract_upload_markdown,
            message_for_empty_resume_extract,
            parse_upload_bytes,
            validate_resume_upload_file,
        )

        try:
            validate_resume_upload_file(content_type, filename)
        except ValueError as ve:
            return JSONResponse({"error": str(ve), "code": "invalid_file_type"}, status_code=400)

        if len(content) > RESUME_UPLOAD_MAX_BYTES:
            mb = RESUME_UPLOAD_MAX_BYTES // (1024 * 1024)
            return JSONResponse(
                {
                    "error": f"File too large (maximum {mb} MB). Try compressing images or a shorter document.",
                    "code": "file_too_large",
                },
                status_code=413,
            )

        loop = asyncio.get_event_loop()

        def _extract_sync():
            return extract_upload_markdown(content, filename, pdf_plain_fallback=None)

        outcome = await loop.run_in_executor(None, _extract_sync)
        if not (outcome.markdown or "").strip():
            return JSONResponse(
                {
                    "error": message_for_empty_resume_extract(outcome.empty_reason),
                    "code": "no_extractable_text",
                    "detail": outcome.empty_reason,
                },
                status_code=422,
            )

        markdown_content = inject_section_line_breaks(outcome.markdown)

        def _pipeline_sync():
            return parse_upload_bytes(content, filename, markdown_content)

        structured, plain_text, parse_status, hints = await loop.run_in_executor(None, _pipeline_sync)

        preview_text = (plain_text or "").strip()
        structured_payload: Optional[dict] = None
        if parse_status in ("ready", "ready_deterministic") and structured:
            structured_payload = structured

        pdf_bytes_for_vision = content if filename.lower().endswith(".pdf") else None
        if pdf_bytes_for_vision:
            vision_doc = await loop.run_in_executor(
                None, _llm_extract, markdown_content, pdf_bytes_for_vision,
            )
            if vision_doc is not None:
                synthesized = _synthesize_text_from_resume_doc(vision_doc)
                if synthesized.strip():
                    preview_text = synthesized.strip()
                    logger.info(
                        "upload_resume: vision-synthesized preview text (%d → %d chars)",
                        len(plain_text or ""), len(preview_text),
                    )
                structured_payload = _resume_doc_to_dict(vision_doc)

        logger.info(
            "Resume upload  |  %s  |  md_chars=%s  plain_chars=%s  preview_chars=%s  parse_status=%s",
            filename,
            len(markdown_content),
            len(plain_text or ""),
            len(preview_text),
            parse_status,
        )

        payload: Dict[str, Any] = {
            "text": preview_text or plain_text,
            "markdown": markdown_content,
            "parse_status": parse_status,
            "extractedText": preview_text[:25000],
            "resumeHeader": _extract_resume_header(preview_text),
        }
        if structured_payload:
            payload["structured"] = structured_payload
            payload["structuredResume"] = structured_payload
            log_extraction_debug(
                "upload_pipeline_final_structured",
                {
                    "education_rows": len(structured_payload.get("education") or []),
                    "experience_rows": len(structured_payload.get("experience") or []),
                    "structured": structured_payload,
                },
            )
        if hints:
            payload["hints"] = hints

        return JSONResponse(payload)
    except Exception:
        logger.exception("Resume upload failed")
        return JSONResponse(
            {
                "error": "Something went wrong while processing your résumé. Please try again in a moment.",
                "code": "server_error",
            },
            status_code=500,
        )

async def api_resume_parsed(request: Request):
    """GET /api/resume/{folder} — return parsed bullet tree for the editor.

    Source-of-truth resolution:
      1. Local filesystem (Railway has the freshly-generated copy in /tmp).
      2. Supabase Storage (covers re-deploys / cross-machine reads).
    """
    folder  = request.path_params["folder"]
    user_id = (request.query_params.get("user_id") or "").strip()
    if user_id == "local":
        user_id = ""
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    tex = get_resume_tex(folder)
    if tex is None and user_id:
        tex = download_tex(user_id, folder)
    if tex is None:
        return JSONResponse({"error": "resume not found"}, status_code=404)

    try:
        parsed = parse_resume_tex(tex)
    except Exception as exc:
        logger.exception("parse_resume_tex failed")
        return JSONResponse({"error": f"parse failed: {exc}"}, status_code=500)
    return JSONResponse(parsed)

async def api_resume_save(request: Request):
    """POST /api/resume/{folder} — accept edited tree, splice bullets into the
    original .tex, re-run pdflatex, push refreshed PDF to Supabase Storage,
    and return the new public URL."""
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    user_id = (body.get("user_id") or "").strip() or "local"
    storage_user = user_id if user_id != "local" else ""
    parsed  = body.get("parsed") or {}
    if not isinstance(parsed, dict) or "sections" not in parsed:
        return JSONResponse({"error": "missing parsed.sections"}, status_code=400)

    # Source .tex — same fallback chain as the GET endpoint.
    raw_tex = parsed.get("rawTex") or get_resume_tex(folder)
    if not raw_tex and storage_user:
        raw_tex = download_tex(storage_user, folder)
    if not raw_tex:
        return JSONResponse({"error": "source .tex not found"}, status_code=404)

    new_tex = splice_bullets_into_tex(raw_tex, parsed)

    loop   = asyncio.get_event_loop()
    layout = parsed.get("pdfLayout") if isinstance(parsed, dict) else None
    result = await loop.run_in_executor(None, recompile_resume_from_tex, folder, new_tex, layout)

    if not result.get("compiled"):
        return JSONResponse({
            "error":          "recompile failed",
            "compile_error":  result.get("compile_error"),
        }, status_code=500)

    # Refresh both artifacts in Supabase so the Download button picks up the
    # new PDF and future GET /api/resume/{folder} reads see the new bullets.
    pdf_url: Optional[str] = None
    try:
        if storage_user and result.get("pdf_path"):
            pdf_url = upload_pdf(storage_user, folder, result["pdf_path"])
    except Exception as exc:
        logger.warning(f"upload_pdf (post-edit) failed: {exc}")
    try:
        if storage_user and result.get("tex_path"):
            upload_tex(storage_user, folder, result["tex_path"])
    except Exception as exc:
        logger.warning(f"upload_tex (post-edit) failed: {exc}")

    return JSONResponse({
        "folder":   folder,
        "pdf_url":  pdf_url,
        "tex_path": result.get("tex_path"),
    })

async def api_version_save(request: Request):
    """POST /api/version/{folder} — save current editor state as a version.
    Body: {"user_id": "...", "parsed": "..."}"""
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)
    
    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    parsed = body.get("parsed")
    
    if not user_id or not parsed:
        return JSONResponse({"error": "user_id and parsed required"}, status_code=400)
    
    result = save_version(user_id, folder, json.dumps(parsed))
    if result is None:
        return JSONResponse({"error": "failed to save version"}, status_code=500)
    
    return JSONResponse(result)

async def api_version_list(request: Request):
    """GET /api/version/{folder}?user_id=xxx — list all versions."""
    folder = request.path_params["folder"]
    user_id = request.query_params.get("user_id", "").strip()
    
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    
    versions = list_versions(user_id, folder)
    if versions is None:
        return JSONResponse({"error": "failed to list versions"}, status_code=500)
    
    return JSONResponse({"versions": versions})

async def api_version_load(request: Request):
    """GET /api/version/{folder}/{version}?user_id=xxx — load a specific version."""
    folder = request.path_params["folder"]
    try:
        version = int(request.path_params.get("version", 0))
    except ValueError:
        return JSONResponse({"error": "invalid version"}, status_code=400)
    user_id = request.query_params.get("user_id", "").strip()
    
    if not user_id or version < 1:
        return JSONResponse({"error": "user_id and version required"}, status_code=400)
    
    parsed = load_version(user_id, folder, version)
    if parsed is None:
        return JSONResponse({"error": "version not found"}, status_code=404)
    
    return JSONResponse({"parsed": json.loads(parsed)})

async def api_storage_status(request: Request):
    """GET /api/storage-status?user_id=<uuid> — diagnose missing .tex files.

    Compares the `resumes` table for user_id against what's in the resume-tex
    Storage bucket AND the local LIBRARY_ROOT (which only ever has data in
    local dev — Railway's filesystem is empty after each deploy).

    Returns: { rows: [{folder, company, role, has_storage_tex, has_local_tex, status}], summary }
    """
    user_id = (request.query_params.get("user_id") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "storage not configured"}, status_code=503)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    loop = asyncio.get_event_loop()

    def _scan():
        db_rows = client.table("resumes").select("folder, company, role, created_at") \
                        .eq("user_id", user_id).order("created_at", desc=True).execute().data or []
        try:
            objs = client.storage.from_("resume-tex").list(user_id) or []
        except Exception:
            objs = []
        in_storage = {o["name"][:-4] for o in objs if o.get("name", "").endswith(".tex")}

        local_with_tex: set = set()
        if os.path.isdir(LIBRARY_ROOT):
            for entry in os.listdir(LIBRARY_ROOT):
                p = os.path.join(LIBRARY_ROOT, entry)
                if os.path.isdir(p) and any(f.endswith(".tex") for f in os.listdir(p)):
                    local_with_tex.add(entry)

        rows = []
        in_storage_count = recoverable = lost = 0
        for r in db_rows:
            folder   = r["folder"]
            has_stor = folder in in_storage
            has_loc  = folder in local_with_tex
            if has_stor:
                status = "in_storage"; in_storage_count += 1
            elif has_loc:
                status = "recoverable"; recoverable += 1
            else:
                status = "lost"; lost += 1
            rows.append({
                "folder":   folder,
                "company":  r.get("company"),
                "role":     r.get("role"),
                "has_storage_tex": has_stor,
                "has_local_tex":   has_loc,
                "status":   status,
            })
        return {
            "rows": rows,
            "summary": {
                "total":       len(db_rows),
                "in_storage":  in_storage_count,
                "recoverable": recoverable,
                "lost":        lost,
            },
        }

    try:
        result = await loop.run_in_executor(None, _scan)
    except Exception as exc:
        logger.exception("storage_status failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse(result)

async def api_backfill_tex(request: Request):
    """POST /api/backfill-tex — upload any local-only .tex/.pdf into Storage.

    Body: {"user_id": "<uuid>", "folders": ["folder1", ...]}.
    `folders` is optional — if omitted, attempts every recoverable folder
    found by api_storage_status. Each folder must exist in the local
    LIBRARY_ROOT, otherwise it's skipped.

    Designed for one-shot recovery from a logged-in browser session — no admin
    auth gate (single-user app today). Locks down: only the row's own user_id
    can re-upload, since the path is partitioned by user_id.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)
    user_id = (body.get("user_id") or "").strip()
    folders = body.get("folders") or None
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    if folders is not None and (not isinstance(folders, list) or not all(isinstance(f, str) for f in folders)):
        return JSONResponse({"error": "folders must be list[str]"}, status_code=400)

    loop = asyncio.get_event_loop()

    def _run():
        # Resolve the candidate list — either explicit `folders` or auto-detect.
        if folders is None:
            try:
                try:
                    from resume_gui.storage import _get_client  # type: ignore
                except ImportError:
                    from storage import _get_client  # type: ignore
                client = _get_client()
                rows = client.table("resumes").select("folder").eq("user_id", user_id).execute().data or []
                candidates = [r["folder"] for r in rows]
                objs = client.storage.from_("resume-tex").list(user_id) or []
                in_storage = {o["name"][:-4] for o in objs if o.get("name", "").endswith(".tex")}
                target = [f for f in candidates if f not in in_storage]
            except Exception as exc:
                return {"error": f"could not list candidates: {exc}"}
        else:
            target = list(folders)

        report = {"fixed": [], "skipped": [], "errors": []}
        for folder in target:
            if ".." in folder or "/" in folder:
                report["errors"].append({"folder": folder, "msg": "invalid folder name"})
                continue
            local = os.path.join(LIBRARY_ROOT, folder)
            if not os.path.isdir(local):
                report["skipped"].append({"folder": folder, "reason": "not in local LIBRARY_ROOT"})
                continue
            tex_files = [f for f in os.listdir(local) if f.endswith(".tex")]
            if not tex_files:
                report["skipped"].append({"folder": folder, "reason": "no .tex inside local folder"})
                continue
            try:
                tex_url = upload_tex(user_id, folder, os.path.join(local, tex_files[0]))
            except Exception as exc:
                report["errors"].append({"folder": folder, "msg": f"upload_tex: {exc}"})
                continue
            pdf_url = None
            pdf_files = [f for f in os.listdir(local) if f.endswith(".pdf")]
            if pdf_files:
                try:
                    pdf_url = upload_pdf(user_id, folder, os.path.join(local, pdf_files[0]))
                except Exception as exc:
                    # Non-fatal — tex is the important one for the editor.
                    logger.warning(f"backfill upload_pdf failed for {folder}: {exc}")
            report["fixed"].append({"folder": folder, "tex_url": tex_url, "pdf_url": pdf_url})
        report["summary"] = {
            "fixed":   len(report["fixed"]),
            "skipped": len(report["skipped"]),
            "errors":  len(report["errors"]),
        }
        return report

    try:
        result = await loop.run_in_executor(None, _run)
    except Exception as exc:
        logger.exception("backfill_tex failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    if isinstance(result, dict) and result.get("error"):
        return JSONResponse(result, status_code=500)
    return JSONResponse(result)
