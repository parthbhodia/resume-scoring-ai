# resume_gui — backend layout

Starlette app entry point: **`app.py`** (routes + orchestration). Domain logic lives in subpackages.

## Packages

| Path | Responsibility |
|------|----------------|
| `analysis/` | Analyze pipeline honesty layer: rewrite filters, evidence validator, score calibration |
| `extract/` | PDF/text extraction: vision parse, synthesizer, bullet stitching, education split |
| `extract/doc_normalize.py` | Fix swapped degree/dates, experience table artifacts, skills noise |
| `extract/education_parse.py` | Flat education lines → `EducationItem` entries |
| `extract/structured_doc.py` | Build `ResumeDocModel` from parsed JSON / LLM raw dict |
| `doc_utils.py` | Shared `_clean_model_text` used across structured-doc normalization |
| `experience_tenure.py` | Tenure summary for analyze-upload |
| `renderers/` | LaTeX renderer (legacy tailor path) |
| `storage.py` | Supabase / filesystem resume storage |

## Analyze flow (where to look)

```
POST /api/analyze-upload
  → extract/vision.py       _llm_extract_pdf_vision (PDF)
  → extract/synthesize.py   _synthesize_text_from_resume_doc
  → app.py                  _analyze_resume_comprehensive (LLM prompt)
  → analysis/evidence_validator.py   _validate_analysis_against_resume
  → analysis/normalize.py            _normalize_analysis
       └── analysis/rewrite_validators.py   _filter_bullet_rewrites
```

## Tests

Pure-Python regression tests (no LLM):

```bash
.venv/bin/python -m pytest resume_gui/tests/test_analyze_dimensions.py -v
```

Import helpers from `resume_gui.analysis` or `resume_gui.extract` — `app.py` re-exports the same names for backward compatibility.
