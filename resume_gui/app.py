"""
Resume Generator GUI — Starlette backend
Run locally:
  cd C:/Users/parth/job-search
  .venv/Scripts/python.exe resume_gui/app.py

Deploy on Railway:
  Set env vars: GOOGLE_API_KEY, LIBRARY_ROOT, ALLOWED_ORIGINS
  Railway auto-detects the Procfile and runs: uvicorn resume_gui.app:app --host 0.0.0.0 --port $PORT
"""

import asyncio
import io
import json
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Optional

import pdfplumber

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("resume_gui")

sys.path.insert(0, str(Path(__file__).parent.parent / "linkedin_agent"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "linkedin_agent" / ".env")

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, FileResponse
from starlette.routing import Route
from sse_starlette.sse import EventSourceResponse

import uvicorn

from resume_library import (
    list_resumes,
    stream_latex_resume,
    extract_jd_from_url,
    get_resume_tex,
    parse_resume_tex,
    splice_bullets_into_tex,
    recompile_resume_from_tex,
    ai_rewrite_bullet,
)

# Storage helper — works whether run as `uvicorn resume_gui.app:app` (Railway) or
# `python resume_gui/app.py` (local dev).
try:
    from resume_gui.storage import upload_pdf, upload_tex, download_tex
except ImportError:
    from storage import upload_pdf, upload_tex, download_tex  # type: ignore

# ── Config (env-var driven for Railway) ──────────────────────────────────────
LIBRARY_ROOT    = os.environ.get("LIBRARY_ROOT", str(Path(__file__).parent.parent / "resumes"))
HTML_FILE       = Path(__file__).parent / "index.html"
PORT            = int(os.environ.get("PORT", 8765))

# CORS: allow localhost dev + deployed frontend
_raw_origins    = os.environ.get(
    "ALLOWED_ORIGINS",
    ",".join([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:8765",
        "https://www.resunova.io",
        "https://resunova.io",
    ]),
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


async def homepage(request: Request):
    return HTMLResponse(HTML_FILE.read_text(encoding="utf-8"))


async def api_resumes(request: Request):
    resumes = list_resumes()
    logger.info(f"GET /api/resumes  |  {len(resumes)} entries")
    return JSONResponse(resumes)


async def api_generate_stream(request: Request):
    """SSE endpoint — streams events as the resume is generated."""
    body        = await request.json()
    company           = (body.get("company") or "").strip()
    role              = (body.get("role") or "").strip()
    jd                = (body.get("job_description") or "").strip()
    model             = (body.get("model") or "gemini-2.5-flash").strip()
    # LLM_PROVIDER=grok in .env flips the default primary model to Grok without
    # redeploying. Useful when Gemini free-tier is rate-limited and an xAI
    # balance is available. Explicit model param in the body still wins.
    if model.startswith("gemini") and os.environ.get("LLM_PROVIDER", "").lower() == "grok":
        model = "grok-4-fast-non-reasoning"
    base_folder       = (body.get("base_folder") or "").strip() or None
    candidate_profile = (body.get("candidate_profile") or "").strip() or None
    user_id           = (body.get("user_id") or "").strip() or "local"

    logger.info(
        f"STREAM  |  {role} @ {company}  |  model={model}  |  base={base_folder}  "
        f"|  custom_profile={bool(candidate_profile)}  |  user={user_id or 'anon'}"
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

        for event in stream_latex_resume(
            company, role, jd,
            model=model, base_folder=base_folder, candidate_profile=candidate_profile,
        ):
            ev_name = event.get("event")

            if ev_name == "saved":
                saved_folder   = event.get("folder")
                saved_tex_path = event.get("tex_path")
                # Upload the .tex source straight away — even if pdflatex fails
                # later, we still want the source preserved for diff/use-as-base.
                if user_id and saved_folder and saved_tex_path:
                    try:
                        upload_tex(user_id, saved_folder, saved_tex_path)
                    except Exception as exc:
                        logger.warning(f"upload_tex failed: {exc}")

            elif ev_name == "pdf" and user_id and saved_folder:
                # The library emits a relative URL like "/pdf/<folder>/<file>.pdf".
                # Resolve the local file path, push to Supabase Storage, and
                # rewrite the event so the frontend gets a durable absolute URL.
                rel_url  = event.get("url") or ""
                filename = rel_url.rsplit("/", 1)[-1] if rel_url else None
                if filename:
                    pdf_path = os.path.join(LIBRARY_ROOT, saved_folder, filename)
                    try:
                        public = upload_pdf(user_id, saved_folder, pdf_path)
                        if public:
                            event = {**event, "url": public}
                    except Exception as exc:
                        logger.warning(f"upload_pdf failed: {exc}")

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


async def api_upload_resume(request: Request):
    """Extract plain text from an uploaded PDF resume."""
    try:
        form    = await request.form()
        file    = form.get("file")
        if file is None:
            return JSONResponse({"error": "No file uploaded"}, status_code=400)
        content = await file.read()
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
        text = "\n".join(pages_text).strip()
        if not text:
            return JSONResponse({"error": "Could not extract text from PDF"}, status_code=422)
        logger.info(f"PDF upload  |  {len(text)} chars extracted from {getattr(file, 'filename', 'upload.pdf')}")
        return JSONResponse({"text": text})
    except Exception as exc:
        logger.exception("PDF upload failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_extract_jd(request: Request):
    """Fetch a job posting URL and extract structured {company, role, location, job_description}."""
    try:
        body = await request.json()
        url  = (body.get("url") or "").strip()
        if not url:
            return JSONResponse({"error": "url required"}, status_code=400)
        logger.info(f"EXTRACT-JD  |  {url}")
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, extract_jd_from_url, url)
        return JSONResponse(data)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except Exception as exc:
        logger.exception("extract-jd failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_resume_parsed(request: Request):
    """GET /api/resume/{folder} — return parsed bullet tree for the editor.

    Source-of-truth resolution:
      1. Local filesystem (Railway has the freshly-generated copy in /tmp).
      2. Supabase Storage (covers re-deploys / cross-machine reads).
    """
    folder  = request.path_params["folder"]
    user_id = (request.query_params.get("user_id") or "").strip()
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
    parsed  = body.get("parsed") or {}
    if not isinstance(parsed, dict) or "sections" not in parsed:
        return JSONResponse({"error": "missing parsed.sections"}, status_code=400)

    # Source .tex — same fallback chain as the GET endpoint.
    raw_tex = parsed.get("rawTex") or get_resume_tex(folder)
    if not raw_tex and user_id:
        raw_tex = download_tex(user_id, folder)
    if not raw_tex:
        return JSONResponse({"error": "source .tex not found"}, status_code=404)

    new_tex = splice_bullets_into_tex(raw_tex, parsed)

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, recompile_resume_from_tex, folder, new_tex)

    if not result.get("compiled"):
        return JSONResponse({
            "error":          "recompile failed",
            "compile_error":  result.get("compile_error"),
        }, status_code=500)

    # Refresh both artifacts in Supabase so the Download button picks up the
    # new PDF and future GET /api/resume/{folder} reads see the new bullets.
    pdf_url: Optional[str] = None
    try:
        if result.get("pdf_path"):
            pdf_url = upload_pdf(user_id, folder, result["pdf_path"])
    except Exception as exc:
        logger.warning(f"upload_pdf (post-edit) failed: {exc}")
    try:
        if result.get("tex_path"):
            upload_tex(user_id, folder, result["tex_path"])
    except Exception as exc:
        logger.warning(f"upload_tex (post-edit) failed: {exc}")

    return JSONResponse({
        "folder":   folder,
        "pdf_url":  pdf_url,
        "tex_path": result.get("tex_path"),
    })


async def api_ai_edit_bullet(request: Request):
    """POST /api/ai-edit-bullet — single bullet AI rewrite for the editor."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    bullet_text = (body.get("bullet_text") or "").strip()
    instruction = (body.get("instruction") or "").strip()
    jd_snippet  = (body.get("jd") or "").strip()
    if not bullet_text:
        return JSONResponse({"error": "bullet_text required"}, status_code=400)

    loop = asyncio.get_event_loop()
    try:
        new_text = await loop.run_in_executor(
            None, ai_rewrite_bullet, bullet_text, instruction, jd_snippet,
        )
    except Exception as exc:
        logger.exception("ai_rewrite_bullet failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"text": new_text})


async def serve_pdf(request: Request):
    folder   = request.path_params["folder"]
    filename = request.path_params["filename"]

    if not filename.endswith(".pdf") or ".." in folder or ".." in filename:
        return JSONResponse({"error": "not found"}, status_code=404)

    pdf_path = os.path.join(LIBRARY_ROOT, folder, filename)
    if not os.path.isfile(pdf_path):
        return JSONResponse({"error": "not found"}, status_code=404)

    logger.info(f"Serving PDF  |  {pdf_path}")
    return FileResponse(pdf_path, media_type="application/pdf")


routes = [
    Route("/",                              homepage),
    Route("/api/resumes",                   api_resumes),
    Route("/api/generate-stream",           api_generate_stream, methods=["POST"]),
    Route("/api/upload-resume",             api_upload_resume,   methods=["POST"]),
    Route("/api/extract-jd",                api_extract_jd,      methods=["POST"]),
    Route("/api/resume/{folder}",           api_resume_parsed,   methods=["GET"]),
    Route("/api/resume/{folder}",           api_resume_save,     methods=["POST"]),
    Route("/api/ai-edit-bullet",            api_ai_edit_bullet,  methods=["POST"]),
    Route("/pdf/{folder}/{filename}",       serve_pdf),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        # Allow any GitHub Pages domain + any resunova.io subdomain
        allow_origin_regex=r"https://(.*\.github\.io|(.*\.)?resunova\.io)",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        allow_credentials=False,
    ),
]

app = Starlette(routes=routes, middleware=middleware)

if __name__ == "__main__":
    host = "0.0.0.0" if os.environ.get("RAILWAY_ENVIRONMENT") else "127.0.0.1"
    logger.info(f"Resume Generator starting on http://{host}:{PORT}")
    uvicorn.run(app, host=host, port=PORT, log_level="info")
