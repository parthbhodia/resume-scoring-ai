# resume_gui — backend layout

Starlette entry point: **`app.py`** (~80 lines) — logging, CORS, route table, test re-exports.

## Packages

| Path | Responsibility |
|------|----------------|
| `config.py` | `LIBRARY_ROOT`, `PORT`, feature flags, `ALLOWED_ORIGINS` |
| `doc_utils.py` | Shared `_clean_model_text` |
| `analysis/` | Analyze honesty pipeline + comprehensive LLM analysis |
| `extract/` | PDF vision, synthesizer, structured doc builders, extract pipeline |
| `llm/` | `_llm_json_call` and model tier selection |
| `text/` | PDF/header extraction, LaTeX→plain |
| `suggestions.py` | Apply accepted coach/tailor edits to `ResumeDocModel` |
| `services/` | Template resolution, Supabase persistence |
| `tailor/` | Coach prompts, ratings payload builders |
| `export/` | DOCX + legacy structured PDF helpers |
| `auth/` | Supabase JWT, advisor scope, share links |
| `routes/` | HTTP handlers grouped by domain |
| `experience_tenure.py` | Tenure summary for analyze-upload |
| `renderers/` | LaTeX renderer (legacy tailor path) |
| `storage.py` | Supabase / filesystem resume storage |

## Route modules

| File | Endpoints |
|------|-----------|
| `routes/analyze.py` | analyze-upload, analyze, explain-category-score, my-analyses, analyze-folder |
| `routes/suggest.py` | suggest-changes, gap-fix, apply-suggestions |
| `routes/generate.py` | generate-stream (SSE tailor compile) |
| `routes/library.py` | resumes, upload, versions, storage, backfill |
| `routes/export.py` | export-pdf-html, docx, tb-enhance, analyze-export-pdf |
| `routes/advisor.py` | advisor-access, cohort-stats, student-detail |
| `routes/share.py` | share create/resolve/revoke |
| `routes/misc.py` | ATS, doctor, ai-edit, JD extract, legacy resume-analysis |

Route table: `routes/__init__.py` → `all_routes()`.

## Analyze flow

```
POST /api/analyze-upload  (routes/analyze.py)
  → extract/pipeline.py     _llm_extract
  → extract/synthesize.py   _synthesize_text_from_resume_doc
  → analysis/comprehensive  _analyze_resume_comprehensive
  → analysis/evidence_validator   _validate_analysis_against_resume
  → analysis/normalize            _normalize_analysis
```

## Tests

```bash
.venv/bin/python -m pytest resume_gui/tests/ -v
```

Import helpers from subpackages directly, or from `resume_gui.app` (re-exports for backward compatibility).
