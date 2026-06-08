# Changelog

## [Unreleased]

### Changed
- **Hybrid analysis prompt: json_schema mode + ~8,308 token savings**
  - `resume_gui/analysis/comprehensive.py`: stripped the 8,590-token verbose JSON
    block from `_ANALYSIS_PROMPT`; schema is now enforced at the API level via
    `json_schema` response format, not by describing every field in the prompt.
  - Added `_ANALYSIS_SCHEMA` dict (inline, co-located with the prompt) that defines
    the full output shape passed to xAI.
  - Added explicit bullet-count instruction to the prompt to prevent json_schema
    array conservatism from under-reporting weak bullets (was returning 2-3; now
    consistently returns up to the 15-bullet limit).
  - Added `atsCompatibility` hard scoring anchors to SCORING GUIDANCE: missing
    email OR phone → score ≤ 55; missing both → score ≤ 40; over-length > 900
    words → score ≤ 65.
  - Added `languageQuality` hard scoring anchors: first-person pronouns or "I was
    responsible for" patterns → score ≤ 50; majority duty-verb bullets → score ≤ 45.
  - Net savings: 33,234 chars / ~8,308 tokens per analysis call.
  - `resume_gui/llm/client.py`: added optional `schema` parameter to
    `_llm_json_call`; when provided, Grok call uses `json_schema` response format
    instead of `json_object`. Gemini fallback path unchanged.
  - All 79 dimension tests pass.
