"""PDF/DOCX/HTML export routes."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

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

    from resume_gui.export.filename import name_role_export_filename

    role_override = (body.get("role") or body.get("exportRole") or "").strip() or None
    filename = name_role_export_filename(structured, "docx", role_override=role_override)
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
