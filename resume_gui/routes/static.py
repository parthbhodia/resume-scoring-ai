"""Health check, homepage, and static PDF serve."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

async def homepage(request: Request):
    return HTMLResponse(HTML_FILE.read_text(encoding="utf-8"))

async def api_health(_request: Request):
    """GET /api/health — liveness probe for Railway / uptime checks."""
    return JSONResponse({"ok": True, "service": "resume_gui"})

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
