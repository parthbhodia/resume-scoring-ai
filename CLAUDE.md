# Resunova — context for Claude sessions

You're working on **Resunova** (resunova.io), a résumé scoring + tailoring web app. This file is the single source of truth for project state. **Read it at the start of every session, and update it after every commit you land.** The "Recent changes" log at the bottom is how future sessions inherit the architectural decisions you made.

## How to use this file

1. **At the start of a session** — read this top-to-bottom. The "Honesty pipeline" and "Current download path" sections in particular have shifted twice in the last week.
2. **After every commit you land** — append a one-paragraph entry to the "Recent changes" log at the bottom with the commit hash, what changed, and *why*. Don't recap every detail of the commit message — that's already in `git log`. Capture the *architectural decision* or *invariant* that future sessions need to know.
3. **When you change architecture** — also update the relevant section above (component map, pipelines, etc.) so the top of the file stays current.
4. **When you add a new safety net (validator, regex, test class)** — add it to the "Validators + invariants" section.

The point of this file is to keep `git log`-able history out of your context window. Future you should be able to read this once and skip the last 50 commits.

---

## Quick orientation

- **Frontend**: Next.js 16-ish (see `web/AGENTS.md` — heads-up that the framework version has breaking changes vs training data). React, TypeScript, Zustand for state. Lives in `web/`.
- **Backend**: Starlette + uvicorn, Python 3.11+. Lives in `resume_gui/` + shared modules in `linkedin_agent/`. Main routes file: `resume_gui/app.py` (~7600 lines — yes it's a monolith, the size is mostly prompts and Jinja templates inline as strings).
- **LLMs**: Grok-4 (xAI) is the default for everything heavy. Gemini 2.5 Flash/Pro as fallback. No Anthropic API path in production.
- **PDF generation**: TWO active pipelines — see "Current download path" below.
- **Tests**: pytest for backend (`resume_gui/tests/` + `linkedin_agent/tests/`). Frontend has no unit tests yet — the dimension tests at `resume_gui/tests/test_analyze_dimensions.py` are the closest thing to integration tests. Run with `.venv/bin/python -m pytest`.

## Local dev

```bash
# Backend (auto-reload)
./scripts/dev-backend.sh    # → uvicorn on :8765

# Frontend (Next dev server)
cd web && npm run dev       # → :3000

# Auth bypass for local Analyze testing
# Set in web/.env.local:
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
NEXT_PUBLIC_API_URL=http://localhost:8765
```

## The two main user flows

1. **Analyze** (the priority flow as of late May 2026) — upload PDF → backend extracts structured data via Grok-4 vision → runs comprehensive analysis prompt → returns scores + bulletAnalysis + topIssues + a synthesized clean text. Frontend renders the preview from the synthesized text. User can download the preview as a WYSIWYG PDF via Chromium.

2. **Tailor** (older flow, ResumeBuilder.tsx) — paste a JD → backend extracts structured data → LLM tailors bullets to match JD → renders to LaTeX via Jinja → pdflatex → PDF. This is the path that still uses the Harshibar template.

---

## Architecture: the analyze pipeline

```
POST /api/analyze-upload  (PDF binary)
  │
  ├── extract_upload_markdown        # MarkItDown → text
  ├── _stitch_wrapped_bullets        # rejoin display-line wrapped bullets
  │
  └── _llm_extract(text, pdf_bytes):
        ├── _llm_extract_pdf_vision(pdf_bytes)
        │     ├── _render_pdf_pages_to_b64_pngs  # PyMuPDF → PNG
        │     ├── Grok-4 vision call             # PNG → structured JSON
        │     └── _vision_raw_to_resume_doc      # JSON → ResumeDocModel
        │
        ├── (fallback) _llm_extract_with_manifest(text)  # reasoning model on text
        │
        ├── _normalize_structured_experience / _education / _skills / _contact
        ├── (text path only) _split_collapsed_education_entries
        └── doc.section_order = infer_section_order_from_profile(...)

  └── _synthesize_text_from_resume_doc(doc)    # doc → clean text for preview
  └── _analyze_resume_comprehensive(clean_text, jd)  # → bulletAnalysis, topIssues, scores
        ├── _llm_json_call(prompt, model_override=_analysis_model())  # grok-4 by default
        ├── _validate_analysis_against_resume(raw, text)              # evidence validator
        ├── _strip_non_issue_ats_warnings(raw)                        # always-on
        └── _normalize_analysis(raw)                                  # calibration v2 + rewrite filter

return {
  overallScore, categoryScores, summary, topStrengths, topIssues,
  atsWarnings, keywordAnalysis, bulletAnalysis, finalRecommendations,
  extractedText (= synthesized clean text),
  resumeHeader, structuredResume, bulletMap,
}
```

The **vision path is primary for PDF uploads.** The text-based reasoning extract is a fallback for Word docs, vision API failures, or when `DISABLE_VISION_EXTRACT=1`.

### Honesty pipeline (the safety net I built layer-by-layer over the last week)

The LLM is regularly dishonest. It tags bullets as needing quantification when the bullet has plenty of numbers, emits "improved" rewrites identical to the original, lists "No tables detected" as a *warning* even though that's a good fact, fabricates topIssues that contradict what's in the résumé. The honesty layer catches all of this:

| Stage | What it does | Where |
|---|---|---|
| `_filter_bullet_rewrites` | Drops `improvedBullet` if (a) drops numerals/proper nouns from original, (b) shrinks >20% in words, (c) claims `quantification` but adds no new numerals, (d) byte-equal to original after normalize. Also strips lying `quantification` tag from `issues[]`. | `resume_gui/app.py` |
| `_validate_analysis_against_resume` | Counts numerals + strong-verb-led bullets in actual résumé text. Drops topIssues / atsWarnings / bullet issue tags / finalRecommendations whose claim contradicts evidence. Floors quantification/achievementQuality/languageQuality scores to 55 when evidence supports it. | `resume_gui/app.py` |
| `_strip_non_issue_ats_warnings` | Always-on. Drops atsWarnings phrased as non-issues ("No tables detected", "Standard headings", "ATS-friendly layout"). | `resume_gui/app.py` |
| `_normalize_analysis` calibration v2 | Replaces old `weak_penalty + issue_penalty + floor_penalty` stack with `mean(categoryScores) − soft_penalty`. Blends LLM overall with calibrated mean. Rejects LLM overall when divergence > 20. Floors at 20. When validator flagged ≥2 adjustments, ignores LLM overall entirely (it's been proven untrustworthy). | `resume_gui/app.py` |

Tests at `resume_gui/tests/test_analyze_dimensions.py` defend all of these — 58 cases, runs in <1s, **must stay green**.

---

## Current download path

**For the Analyze flow** (after `af79efc`): the "Download PDF" button captures `paperRef.current.outerHTML`, POSTs to `/api/export-pdf-html`, which runs Playwright + headless Chromium and streams a PDF back. Preview === download, byte-for-byte. No LaTeX in this path.

Hook: `web/hooks/useHtmlPdfExport.ts`. Wired in `web/components/AnnotatedResumePanel.tsx`.

**For the Tailor flow** (ResumeBuilder.tsx, unchanged): still uses `/api/analyze-export-pdf` → Jinja LaTeX template (`resume_gui/templates/latex/harshibar_resume.tex.j2`) → pdflatex. Has its own "Download PDF from HTML" button alongside the LaTeX one.

**LaTeX is on borrowed time.** It stays because:
- ResumeBuilder still uses it for the Harshibar tailored output
- Removing it requires migrating the tailor flow to a Chromium-rendered HTML template

Cleanup candidates if/when LaTeX gets fully retired:
- `/api/analyze-export-pdf` endpoint
- `_doc_from_structured_dict`, `_latex_escape`, `recompile_resume_from_tex`
- `resume_gui/renderers/latex_renderer.py`
- `resume_gui/templates/latex/`
- pdflatex / TeX Live from Docker image

---

## Component map

### Backend (`resume_gui/app.py`)

- **Endpoints** — search for `Route(` at the bottom of the file.
  - `/api/analyze-upload` — main entry for Analyze flow
  - `/api/analyze` — pre-compile analysis (no file upload, takes profile text)
  - `/api/analyze-export-pdf` — legacy LaTeX export (used by tailor flow only now)
  - `/api/export-pdf-html` — Chromium HTML → PDF (used by everything WYSIWYG)
  - `/api/suggest-gap-fix` — per-parameter "Fix-with-AI"
  - `/api/generate-stream` — tailor flow streaming endpoint

- **Validators / honesty** — `_filter_bullet_rewrites`, `_validate_analysis_against_resume`, `_strip_non_issue_ats_warnings`, `_normalize_analysis`. All in app.py. Search for `_NUMERAL_RE`, `_STRONG_OWNERSHIP_VERBS`, `_NON_ISSUE_ATS_WARNING_RE` to find the regex inventory.

- **Vision extract** — `_llm_extract_pdf_vision`, `_vision_raw_to_resume_doc`, `_render_pdf_pages_to_b64_pngs`. Uses PyMuPDF (`fitz`) for rendering. Default model: `grok-4` (vision tier).

- **Synthesizer** — `_synthesize_text_from_resume_doc`. Produces the clean text the preview renders from. Handles `(Ongoing)/(YYYY)` lift to entry-header date slot. Don't add display logic here that the preview already does — the synthesizer is just text generation.

### Frontend (`web/components/`)

- `AnalyzeResume.tsx` — top-level Analyze view. Owns the sidebar (TOP FIXES + COMPLETED categorization with actionability gate from `d4f2641`).
- `AnalyzePreviewPane.tsx` — wraps the rendered preview on the right.
- `AnnotatedResumePanel.tsx` — actually contains the Download PDF button. Uses `useHtmlPdfExport` since `af79efc`.
- `AnalyzeLiveResumeBody.tsx` — renders the extractedText into HTML blocks. Section heading detection lives in `looksLikeSectionHeading` (tightened in `b807bfb` to reject lines with digits / `%` / parens).
- `ResumeBuilder.tsx` — the tailor flow. Big file (~3800 lines). Has its own LaTeX-render + HTML-render buttons.

### Hooks (`web/hooks/`)

- `useHtmlPdfExport.ts` — DOM → HTML → POST `/api/export-pdf-html` → download. The path forward.
- `useAnalyzeExport.ts` — legacy LaTeX export. Still imported but the Analyze button no longer calls it.

### Lib (`web/lib/`)

- `analysisCategoryMatch.ts` — frontend mirror of the category bucketing logic. `guessIssueCategory` is the regex pile that maps an issue's text to one of the 8 categoryScores keys. Must stay in sync with backend prompts.
- `resumeFileName.ts` — `ownerSlugFromProfile` derives filename stem from the candidate name.
- `keywordDelta.ts` — `extractKeywords` + `computeKeywordDelta` for the inline +chips/–chips diff UI on each fix card.

---

## LLM model selection

Three model "tiers" controlled by env vars:

| Tier | Default | Use case | Env override |
|---|---|---|---|
| Vision extract | `grok-4` | Reading PDF pages as images | `VISION_EXTRACT_MODEL` |
| Text reasoning extract | `grok-4-fast-reasoning` | Fallback when vision unavailable | `GROK_REASONING_MODEL` |
| Analysis prompt | `grok-4` | Main `_analyze_resume_comprehensive` LLM call | `ANALYSIS_MODEL` |
| Everything else | `grok-4-fast-non-reasoning` | Gap-fix suggestions, JD extract, etc. | `GROK_MODEL` |

`DISABLE_VISION_EXTRACT=1` forces the text path.

Gemini fallback chain kicks in when Grok hits quota or errors. Slugs: `GEMINI_REASONING_MODEL` (default `gemini-2.5-pro`), `GEMINI_FLASH_MODEL` (default `gemini-2.5-flash-lite`).

---

## Validators + invariants (don't break these)

1. **No-op rewrites must not be surfaced.** `_filter_bullet_rewrites` drops `improvedBullet` byte-equal to original.
2. **`quantification` tag implies the rewrite adds a numeral.** Tag is stripped if no rewrite anywhere adds new digits.
3. **Rewrites must preserve numerals and proper-nouns from original.** Validator rejects on drop.
4. **Issues that contradict the résumé must be dropped.** "Missing metrics" on a résumé with ≥6 numerals → dropped. "Duty-only" on a résumé with ≥60% strong-verb-led bullets → dropped.
5. **ATS warnings phrased as good facts ("No tables detected", "Standard headings") are not warnings.** Always stripped.
6. **A category in TOP FIXES must have actionable content** (≥1 flagged bullet OR ≥1 related topIssue). Otherwise it moves to COMPLETED.
7. **Score has a floor of 20.** Anything that parsed and produced category scores deserves at least 20.
8. **The Analyze "Download PDF" matches the preview.** Goes through Chromium, not LaTeX.

The 58 dimension tests in `resume_gui/tests/test_analyze_dimensions.py` defend invariants 1-7. **Run them after any change to validators / calibration / synthesizer**:

```bash
.venv/bin/python -m pytest resume_gui/tests/test_analyze_dimensions.py -v
```

---

## Known gaps (intentionally not yet fixed)

- **No frontend unit tests.** When validators ship false negatives that only surface as UI bugs (the "empty AI Suggestion popup" and "TOP FIXES with no fixes" of recent memory), there's no test that catches it. Would need Vitest + React Testing Library setup. Tracked in conversation as Tier 2.
- **Backend contract tests** that assert the *shape* the frontend depends on (e.g. "if `improvedBullet === ''` and `categoryRewrites === {}`, this bullet should be considered non-actionable"). Cheaper than frontend tests, would have caught both UI bugs above. Tracked as Tier 1.
- **The synthesizer and the LaTeX template duplicate display logic.** Section ordering, year-extraction, tech-stack rendering — they're implemented twice. As long as Tailor uses LaTeX, this stays. Migration plan: move Tailor's output to HTML → Chromium too, then delete the LaTeX subsystem.
- **`web/.env.local` overrides** are project-developer only; `NEXT_PUBLIC_DEV_BYPASS_AUTH` ships in source but is gated.

---

## Recent changes (running log — newest first; **append after every commit**)

- **`f2f7108`** — This file. Root `CLAUDE.md` added with architecture map, honesty-pipeline reference, component map, LLM tier matrix, 8 named invariants, and this running log. `web/AGENTS.md` updated to point at it. The maintenance rule (read at session start, update after every commit) lives at the top of CLAUDE.md.
- **`af79efc`** — Analyze "Download PDF" no longer goes through LaTeX. Captures `paperRef.current.outerHTML` and routes through `/api/export-pdf-html` (Chromium). Now byte-for-byte WYSIWYG with the preview. LaTeX path stays for tailor flow. Drive-by improvements to LaTeX path (section order pass-through, tech-stack `ProjectItem.tech` field, arrow encoding fix in `_latex_escape`) so the tailor flow's LaTeX output stops drifting from preview too.
- **`da08374`** — Added amber count badge to COMPLETED sidebar entries. A category like Achievement 82 with 1 weak bullet now shows `Achievement [1] 82` instead of looking identical to fully-clean categories. TOP FIXES badge stays red (existing). No badge = fully clean.
- **`d4f2641`** — Honest categorization in the sidebar. A category < 70 with no flagged bullets and no related topIssues now moves to COMPLETED instead of sitting in TOP FIXES as a dead-end. Both buckets now check `categoryHasActionableContent(key)`.
- **`004424b`** — Stopped opening the "AI Suggestion" popup when `improvedBullet === ""`. After the no-op-rewrite filter (`dc41ee5`) landed, the empty popup was firing on every honest no-op. Now those clicks route to the matching flagged-bullet card on the left via `onBulletLinkedSelect` instead.
- **`40d383d`** — Added 58 pure-Python dimension tests at `resume_gui/tests/test_analyze_dimensions.py`. Drive-by fix on `_NON_ISSUE_ATS_WARNING_RE` (trailing `\b` was blocking plurals — same bug as the earlier metric regex).
- **`c32f17e`** — Main analysis prompt now runs through `grok-4` reasoning tier by default (`ANALYSIS_MODEL` env). Score honesty jumped (74 → 84 on Krish's PDF). The validator stripping of `quantification` tags / no-op rewrites mostly doesn't have to fire anymore because grok-4 emits cleaner output at the source.
- **`dc41ee5`** — Drop no-op rewrites, strip lying `quantification` tags, drop non-issue atsWarnings. The three biggest "honesty drift" categories I'd been seeing.
- **`9556370`** — Cleanup of vision-doc artifacts that surfaced in the synthesized preview: doubled CGPA strings, `(Ongoing)` rendering as a literal bullet, `"Co · Tardeo, Mumbai | Tardeo, Mumbai"` duplication.
- **`cb2c4c5`** — Synthesizer + pipeline change: when vision extract succeeds, synthesize a clean text view from the structured doc and use it for BOTH the analysis prompt and the preview's `extractedText`. Score moved 62 → 72 because analysis stopped grading column-extraction artifacts.
- **`6a06619`** — **Vision-PDF is now the primary structured-extract path.** PyMuPDF renders PDF → PNG → Grok-4 vision call → structured JSON → `_vision_raw_to_resume_doc`. Faster (~11s vs ~25s) AND more accurate than the text-based path. Text path is now the fallback.
- **`8c4724d`** — Bullet-stitching post-processor (`_stitch_wrapped_bullets`) for the text-extract path. Multi-display-line wrapped bullets get joined back. Lives in both `resume_gui/app.py` and `linkedin_agent/resume_upload_parse.py` (the latter is the one MarkItDown's text actually flows through).
- **`b807bfb`** — Frontend `looksLikeSectionHeading` tightened. Rejects lines containing `[0-9%()/–—]` so `"ICSE — 97.16% (2021)"` stops being styled as a blue section heading.
- **`491a9db`** — Routed the structured-extract reasoning step to `grok-4-fast-reasoning` for cleaner JSON output. Added `model_override` parameter to `_llm_json_call`.
- **`d5273b1`** — The validator + calibration foundation (originally `44226d5` then lost during a Cursor force-push, recovered via reflog). The whole honesty pipeline starts here.

---

*Last updated: 2026-05-29 by Claude session ending around commit `af79efc`. Next session: read this file first, update it last.*
