"""
Resume Generator GUI — Starlette backend
Run:
  cd C:/Users/parth/job-search
  .venv/Scripts/python.exe resume_gui/app.py
"""

import asyncio
import json
import logging
import os
import sys
import threading
from pathlib import Path

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
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, FileResponse
from starlette.routing import Route
from sse_starlette.sse import EventSourceResponse

import uvicorn

from resume_library import list_resumes, stream_latex_resume

LIBRARY_ROOT = "C:/Users/parth/OneDrive/Documents/resume"
HTML_FILE = Path(__file__).parent / "index.html"


async def homepage(request: Request):
    return HTMLResponse(HTML_FILE.read_text(encoding="utf-8"))


async def api_resumes(request: Request):
    resumes = list_resumes()
    logger.info(f"GET /api/resumes  |  {len(resumes)} entries")
    return JSONResponse(resumes)


async def api_generate_stream(request: Request):
    """SSE endpoint — streams events as the resume is generated."""
    body        = await request.json()
    company     = (body.get("company") or "").strip()
    role        = (body.get("role") or "").strip()
    jd          = (body.get("job_description") or "").strip()
    model       = (body.get("model") or "gemini-2.5-flash").strip()
    base_folder = (body.get("base_folder") or "").strip() or None

    logger.info(f"STREAM  |  {role} @ {company}  |  model={model}  |  base={base_folder}")

    if not company or not role or not jd:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "company, role, and job_description required"})}
        return EventSourceResponse(err_gen())

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def run_sync():
        for event in stream_latex_resume(company, role, jd, model=model, base_folder=base_folder):
            asyncio.run_coroutine_threadsafe(queue.put(event), loop).result()
        asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()  # sentinel

    threading.Thread(target=run_sync, daemon=True).start()

    async def event_gen():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield {"data": json.dumps(item)}

    return EventSourceResponse(event_gen())


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
    Route("/", homepage),
    Route("/api/resumes", api_resumes),
    Route("/api/generate-stream", api_generate_stream, methods=["POST"]),
    Route("/pdf/{folder}/{filename}", serve_pdf),
]

app = Starlette(routes=routes)

if __name__ == "__main__":
    port = 8765
    logger.info(f"Resume Generator starting on http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
