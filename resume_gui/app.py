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

from resume_library import list_resumes, stream_latex_resume, extract_jd_from_url

# ── Config (env-var driven for Railway) ──────────────────────────────────────
LIBRARY_ROOT    = os.environ.get("LIBRARY_ROOT", "C:/Users/parth/OneDrive/Documents/resume")
HTML_FILE       = Path(__file__).parent / "index.html"
PORT            = int(os.environ.get("PORT", 8765))

# CORS: allow localhost dev + deployed frontend
_raw_origins    = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:8765",
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
    base_folder       = (body.get("base_folder") or "").strip() or None
    candidate_profile = (body.get("candidate_profile") or "").strip() or None

    logger.info(f"STREAM  |  {role} @ {company}  |  model={model}  |  base={base_folder}  |  custom_profile={bool(candidate_profile)}")

    if not company or not role or not jd:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "company, role, and job_description required"})}
        return EventSourceResponse(err_gen())

    loop  = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def run_sync():
        for event in stream_latex_resume(company, role, jd, model=model, base_folder=base_folder, candidate_profile=candidate_profile):
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
    Route("/pdf/{folder}/{filename}",       serve_pdf),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=r"https://.*\.github\.io",   # allow any GitHub Pages domain
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
