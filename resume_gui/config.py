"""Environment-driven configuration and CORS defaults."""
from __future__ import annotations

import os
from pathlib import Path

# ── Config (env-var driven for Railway) ──────────────────────────────────────
LIBRARY_ROOT    = os.environ.get("LIBRARY_ROOT", str(Path(__file__).parent.parent / "resumes"))
HTML_FILE       = Path(__file__).parent / "index.html"
PORT            = int(os.environ.get("PORT", 8765))
USE_JINJA_LATEX_RENDERER = os.environ.get("USE_JINJA_LATEX_RENDERER", "true").strip().lower() in {"1", "true", "yes", "on"}
ENABLE_JD_URL_EXTRACT = os.environ.get("ENABLE_JD_URL_EXTRACT", "false").strip().lower() in {"1", "true", "yes", "on"}
USE_SUPABASE_TEMPLATE_BODY = os.environ.get("USE_SUPABASE_TEMPLATE_BODY", "false").strip().lower() in {"1", "true", "yes", "on"}

# CORS: localhost dev + production site (merge env extras; never drop defaults)
_CORS_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:8765",
    "https://www.resunova.io",
    "https://resunova.io",
]
_extra = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
ALLOWED_ORIGINS = list(dict.fromkeys(_CORS_DEFAULT_ORIGINS + _extra))
