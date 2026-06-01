# Resunova backend (`resume_gui/`)

Starlette + uvicorn API for **Resunova** (resunova.io): résumé analyze, tailor, library, PDF export, advisor dashboard.

**Entry point:** `app.py` (~80 lines) — logging, CORS, route table, test re-exports. All domain logic lives in subpackages below.

For project-wide context (honesty pipeline, PDF paths, frontend map), read [`../CLAUDE.md`](../CLAUDE.md) first.  
Signed-in UI shell (shadcn Sidebar, mobile tabs): [`../web/README.md`](../web/README.md#app-shell-signed-in-layout).

---

## Quick start

```bash
# From repo root — create venv once
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# Backend (auto-reload on resume_gui/ + linkedin_agent/)
.venv/bin/uvicorn resume_gui.app:app --host 0.0.0.0 --port 8765 --reload \
  --reload-dir resume_gui --reload-dir linkedin_agent

# Or: python resume_gui/app.py

# Frontend (separate terminal)
cd web && npm run dev   # → :3000
```

**Local env** (`.env` in `linkedin_agent/` or exported):

| Variable | Purpose |
|----------|---------|
| `XAI_API_KEY` | Grok (primary LLM + vision extract) |
| `GOOGLE_API_KEY` | Gemini fallback |
| `LLM_PROVIDER` | `grok` or `gemini` |
| `ANALYSIS_MODEL` | Main analyze prompt (default `grok-4`) |
| `VISION_EXTRACT_MODEL` | PDF vision extract (default `grok-4`) |
| `DISABLE_VISION_EXTRACT=1` | Force text-only extract |
| `LIBRARY_ROOT` | Local resume folder (default `./resumes`) |
| `ALLOWED_ORIGINS` | Extra CORS origins (comma-separated) |

**Frontend local testing** — in `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8765
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

**Health check:** `curl http://localhost:8765/api/health`

---

## Directory map

```
resume_gui/
├── app.py                  # Starlette factory + backward-compat re-exports
├── config.py               # PORT, LIBRARY_ROOT, feature flags, CORS
├── doc_utils.py            # _clean_model_text (shared)
├── suggestions.py          # Apply accepted coach/tailor edits to ResumeDocModel
├── storage.py              # Supabase + filesystem I/O
├── experience_tenure.py    # Tenure chip for analyze-upload
├── profile_parser.py       # Regex profile → structured sections
├── resume_extraction.py    # Inventory, manifests, extract prompts
│
├── analysis/               # Analyze scoring + honesty layer
│   ├── constants.py        # Category keys, regex inventory
│   ├── rewrite_validators.py
│   ├── evidence_validator.py
│   ├── normalize.py        # Calibration v2, bullet categories
│   └── comprehensive.py      # _ANALYSIS_PROMPT, _analyze_resume_comprehensive
│
├── extract/                # PDF → structured doc → preview text
│   ├── vision.py           # Grok vision PDF extract
│   ├── pipeline.py         # _llm_extract, _finalize_structured_doc
│   ├── synthesize.py       # _synthesize_text_from_resume_doc
│   ├── structured_doc.py   # Build ResumeDocModel from JSON
│   ├── doc_normalize.py    # Fix swapped dates/degrees, skills noise
│   ├── education_parse.py  # Flat education lines → EducationItem
│   ├── education.py        # Collapsed education entry split
│   ├── profile.py          # Regex profile → ResumeDocModel
│   └── text_utils.py       # Bullet line stitching
│
├── llm/
│   └── client.py           # _llm_json_call, model tier selection
│
├── routes/                 # HTTP handlers (one file ≈ one domain)
│   ├── __init__.py         # all_routes() — full Route table
│   ├── analyze.py
│   ├── suggest.py
│   ├── generate.py
│   ├── library.py
│   ├── export.py
│   ├── advisor.py
│   ├── share.py
│   ├── misc.py
│   ├── rewrite.py
│   └── static.py
│
├── auth/supabase.py        # JWT verify, advisor scope, share links
├── services/               # Template resolution, analysis persistence
├── tailor/coach.py         # Coach prompts, ratings payloads
├── text/                   # PDF/header extract, LaTeX→plain
├── export/                 # DOCX + legacy structured PDF
├── renderers/              # LaTeX/Jinja (legacy tailor path)
└── tests/                  # pytest — run before merging analyze changes
```

---

## Route modules

| File | Key endpoints |
|------|----------------|
| `routes/analyze.py` | `/api/analyze-upload`, `/api/analyze`, `/api/explain-category-score`, `/api/my-analyses`, `/api/analyze-folder` |
| `routes/suggest.py` | `/api/suggest-changes`, `/api/suggest-gap-fix`, `/api/apply-suggestions` |
| `routes/generate.py` | `/api/generate-stream` (SSE tailor compile) |
| `routes/library.py` | `/api/resumes`, `/api/upload-resume`, versions, storage, backfill |
| `routes/export.py` | `/api/export-pdf-html`, docx, tb-enhance, analyze-export-pdf |
| `routes/advisor.py` | `/api/advisor-access`, cohort-stats, student-detail |
| `routes/share.py` | `/api/share/*` |
| `routes/misc.py` | ATS, doctor, ai-edit, JD extract, legacy resume-analysis |

Add a new endpoint: handler in the matching `routes/*.py` file, then register it in `routes/__init__.py` → `all_routes()`.

---

## Pipelines

### Analyze (priority flow)

```
POST /api/analyze-upload          routes/analyze.py
  → extract/pipeline.py           _llm_extract (vision-first for PDFs)
  → extract/synthesize.py         _synthesize_text_from_resume_doc
  → analysis/comprehensive.py     _analyze_resume_comprehensive
  → analysis/evidence_validator   _validate_analysis_against_resume
  → analysis/normalize.py         _normalize_analysis
  → experience_tenure.py          experienceSummary (sidebar chip)
```

Preview + download PDF both go through Chromium (`/api/export-pdf-html`) — preview === download.

### Tailor (legacy LaTeX path)

```
POST /api/generate-stream         routes/generate.py
  → extract/pipeline.py           _structured_doc_for_generate
  → renderers/latex_renderer.py   Jinja → pdflatex
```

Gap fixes on the JD tailor path patch text in the browser and rescore via `/api/analyze` — not LaTeX.

---

## Common tasks

| I want to… | Start here |
|------------|------------|
| Change analyze scoring / bullet rewrites | `analysis/comprehensive.py` + `analysis/normalize.py` |
| Fix dishonest quantification tags | `analysis/rewrite_validators.py`, `analysis/evidence_validator.py` |
| Change PDF extract quality | `extract/vision.py`, `extract/pipeline.py` |
| Change preview text layout | `extract/synthesize.py` |
| Add/modify an API route | `routes/*.py` + `routes/__init__.py` |
| Change LLM model defaults | `llm/client.py` + env vars (see table above) |
| Apply user-approved bullet edits | `suggestions.py` |

**Do not break:** validators in `analysis/` have 87+ pytest cases. Run tests after any analyze change.

---

## Tests

```bash
# Full backend suite
.venv/bin/python -m pytest resume_gui/tests/ -v

# Analyze honesty layer only (fast, no LLM)
.venv/bin/python -m pytest resume_gui/tests/test_analyze_dimensions.py -v
```

Tests import helpers from `resume_gui.app` (re-exports) or directly from subpackages.

---

## Deploy

Railway runs: `uvicorn resume_gui.app:app --host 0.0.0.0 --port $PORT`

Production PDF export requires Playwright Chromium in the Docker image (`playwright install --with-deps chromium`). See `CLAUDE.md` → Recent changes for the prod fix history.
