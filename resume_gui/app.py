"""
Resume Generator GUI — Starlette backend
Run locally:
  .venv/Scripts/python.exe resume_gui/app.py   (Windows)
  python resume_gui/app.py                      (macOS/Linux)

Deploy on Railway — see resume_gui/README.md and resume_gui/config.py.
"""

import logging
import os
import sys
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("resume_gui")

sys.path.insert(0, str(Path(__file__).parent.parent / "linkedin_agent"))
load_dotenv(Path(__file__).parent.parent / "linkedin_agent" / ".env")

from resume_gui.config import ALLOWED_ORIGINS, PORT  # noqa: E402
from resume_gui.routes import all_routes  # noqa: E402

# ── Re-exports for tests and scripts (backward compatibility) ───────────────
from resume_gui.analysis import (  # noqa: E402
    _CATEGORY_SCORE_KEYS,
    _filter_bullet_rewrites,
    _normalize_analysis,
    _normalize_bullet_categories,
    _resume_numeral_count,
    _resume_strong_verb_share,
    _strip_non_issue_ats_warnings,
    _validate_analysis_against_resume,
    _validate_rewrite_against_original,
)
from resume_gui.analysis.comprehensive import _analyze_resume_comprehensive  # noqa: E402
from resume_gui.extract import (  # noqa: E402
    _llm_extract_pdf_vision,
    _split_collapsed_education_entries,
    _stitch_wrapped_bullets,
    _synthesize_text_from_resume_doc,
    _vision_raw_to_resume_doc,
)
from resume_gui.extract.education_parse import _education_item_from_combined_line  # noqa: E402
from resume_gui.extract.pipeline import (  # noqa: E402
    _finalize_structured_doc,
    _llm_extract,
)
from resume_gui.extract.profile import _resume_doc_from_profile_text  # noqa: E402
from resume_gui.suggestions import _apply_accepted_edits_to_doc  # noqa: E402

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=r"https://(.*\.github\.io|(.*\.)?resunova\.io)",
        allow_methods=["GET", "POST", "OPTIONS", "DELETE"],
        allow_headers=["*"],
        allow_credentials=False,
    ),
]

app = Starlette(routes=all_routes(), middleware=middleware)

if __name__ == "__main__":
    host = "0.0.0.0" if os.environ.get("RAILWAY_ENVIRONMENT") else "127.0.0.1"
    logger.info("Resume Generator starting on http://%s:%s", host, PORT)
    uvicorn.run(app, host=host, port=PORT, log_level="info")
