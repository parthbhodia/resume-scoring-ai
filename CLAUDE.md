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
- **Backend**: Starlette + uvicorn, Python 3.11+. Lives in `resume_gui/` (modular packages + thin `app.py`) + shared modules in `linkedin_agent/`. Onboarding map: [`resume_gui/README.md`](resume_gui/README.md).
- **LLMs**: Grok-4 (xAI) is the default for everything heavy. Gemini 2.5 Flash/Pro as fallback. No Anthropic API path in production.
- **PDF generation**: TWO active pipelines — see "Current download path" below.
- **Tests**: pytest for backend (`resume_gui/tests/` + `linkedin_agent/tests/`). Frontend has no unit tests yet — the dimension tests at `resume_gui/tests/test_analyze_dimensions.py` are the closest thing to integration tests. Run with `.venv/bin/python -m pytest`.

## Local dev

```bash
# Backend (auto-reload)
.venv/bin/uvicorn resume_gui.app:app --host 0.0.0.0 --port 8765 --reload \
  --reload-dir resume_gui --reload-dir linkedin_agent

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
        # struct → prompt hints only; no inject_deterministic_insights on LLM path

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

**Single WYSIWYG pipeline** for Analyze, Tailor-to-job, and Template Builder: preview HTML → `useHtmlPdfExport` → POST `/api/export-pdf-html` → Playwright Chromium → PDF. Preview === download.

Hook: `web/hooks/useHtmlPdfExport.ts`. Wired in `AnnotatedResumePanel`, `TailorPreviewPane`, and `TemplateBuilderClient`.

**Preview styling** (font preset + accent swatch) lives in `AnnotatedResumePanel` — client-side CSS vars only; no LaTeX template picker.

**Tailor gap fixes** patch synthesized plain text in the browser and rescore via `/api/analyze` — no `/api/apply-suggestions` / pdflatex on the JD tailor path.

**Template Builder** is `/template-builder/` (replaces legacy `ResumeTemplateStudio` / `?flow=template`).

**LaTeX cleanup candidates** (backend still has dead paths used only if something calls `generate-stream` / `apply-suggestions`):
- `/api/generate-stream`, `/api/apply-suggestions`, `/api/analyze-export-pdf`
- `resume_gui/renderers/latex_renderer.py`, `resume_gui/templates/latex/`, pdflatex in Docker

---

## Component map

### Backend (`resume_gui/`)

- **Entry** — `app.py` (~80 lines): Starlette factory, CORS, test re-exports. Route table from `routes/__init__.py`.
- **Analyze pipeline** — `analysis/comprehensive.py` (LLM prompt + `_analyze_resume_comprehensive`), `analysis/rewrite_validators.py`, `analysis/evidence_validator.py`, `analysis/normalize.py`.
- **Extract pipeline** — `extract/vision.py`, `extract/pipeline.py` (`_llm_extract`, `_finalize_structured_doc`), `extract/synthesize.py`, `extract/structured_doc.py`.
- **Routes** — `routes/analyze.py`, `routes/suggest.py`, `routes/generate.py`, `routes/export.py`, etc. See `resume_gui/README.md`.
- **LLM** — `llm/client.py` (`_llm_json_call`, model tiers via env vars).
- **Validators / honesty** — under `analysis/` (same invariants as before).

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

- `resumeLayout.ts` — canonical preview/PDF spacing: presets, CSS vars, TB inline styles, Analyze `paragraphBlockStyle` / bullet stylesheet. Template Builder + Analyze + Tailor should import here (not duplicate in components).
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
9. **The backend owns bullet category bucketing.** Each `bulletAnalysis` item carries `primaryCategory` + `issueCategories` (validated by `_normalize_bullet_categories` against `_CATEGORY_SCORE_KEYS`). The frontend trusts them verbatim; it does NOT re-derive categories with regex when they're present. A bullet's `primaryCategory` must be a category it can offer a rewrite for, and "quantification" never appears in either field without a numeral-adding rewrite. The `guessIssueCategory`/`inferBaseCategory` heuristics survive only as a fallback for legacy restored-history payloads.
10. **Display uses `issueCategories`; rewrites use `primaryCategory` only.** `bulletBelongsToCategory()` (frontend) checks `issueCategories` for filtering, preview highlights, sidebar badge counts, and `categoryHasActionableContent`. `getRewriteForCategory()` still keys off `primaryCategory` so the UI never surfaces a rewrite for the wrong fix target. Preview banner is red only when `flaggedCount > 0` for the active category.
11. **Strong-verb detection distinguishes verb+object from participle+duty-noun.** `_bullet_leads_with_strong_ownership_verb()` in `analysis/constants.py` rejects leads like `Automated testing…` (participle + activity noun) while keeping `Automated CI/CD pipelines…`. Used for résumé-wide share, evidence validator per-bullet checks, and achievement rewrite filtering.
12. **`achievementQuality` rewrites must change the opening and fix the lead.** `_validate_achievement_rewrite` in `rewrite_validators.py` drops `improvedBullet` / `categoryRewrites.achievementQuality` when the first token is unchanged or the rewrite still opens with a participial duty-style phrase.
13. **Pronoun advice must match the text.** `_sanitize_pronoun_claims_in_text_fields` strips unsupported "remove personal pronoun" clauses from `sectionFeedback` (per-section scope) and from `topIssues` / `categoryRationales` / `finalRecommendations` when the full résumé has no pronouns. Always-on (not gated on numerals/strong-verb thresholds).
14. **Buzzword detection is universal-filler only.** `_BUZZWORDS` in `comprehensive.py` flags clichés with zero concrete meaning in any field (`team player`, `results-driven`, …). Domain-ambiguous terms (`framework`, `scalable`, `efficient`, `reliable`, `leverage`, `proven`, …) must never be flagged — they are legitimate vocabulary in some disciplines.
15. **Deterministic topIssues are regex-fallback only.** `inject_deterministic_insights` runs when the comprehensive LLM call fails — not on normal analyze. `_recruiter_checks` still feeds `structural_signals` into the LLM prompt. Frontend hides `source: "deterministic"` topIssues so saved runs stay clean.
16. **No "written by AI" tells in anything the candidate copies, applies, or reads as advice.** Two tells, two layers. (a) **Bracket placeholders** (`[X%]`, `[~12]`): allowed ONLY in `bulletAnalysis.improvedBullet` / `categoryRewrites`, where the frontend `materializePlaceholders` (in `cleanAiArtifacts`, `web/lib/analysisCategoryMatch.ts`) turns them into concrete *example* figures shown highlighted with a "swap in your real numbers" note. They must NEVER appear in advice prose — `_strip_bracket_placeholders_from_prose` (always-on in `_validate_analysis_against_resume`) replaces them with plain words in `summary` / `topIssues` / `atsWarnings` / `finalRecommendations` / `sectionFeedback` / `categoryRationales`, and the analysis prompt says "brackets are for rewrites only." (b) **Em-dashes**: `scrubEmDashes` (in `cleanAiArtifacts`) swaps `—`→`,` in every suggestion the tool surfaces/applies; tool UI copy avoids em-dashes too. The candidate's *own* résumé text is left alone — a gentle "reads AI-written" nudge in the Analyze overview flags it instead (≥4 em-dashes).

The dimension tests in `resume_gui/tests/test_analyze_dimensions.py` plus `test_experience_tenure.py` defend invariants 1–13; `test_deterministic_insights.py` defends 14–15 (buzzword list + inject helper for fallback); `TestBracketPlaceholderProseScrub` defends 16 (prose-bracket scrub; rewrites kept). Full algorithm notes: [`docs/ANALYSIS_ALGORITHM.md`](docs/ANALYSIS_ALGORITHM.md).

```bash
.venv/bin/python -m pytest resume_gui/tests/test_analyze_dimensions.py resume_gui/tests/test_experience_tenure.py -v
# (no .venv in this container — `python3 -m pytest …` after the dep-install noted in the changelog)
```

---

## Known gaps (intentionally not yet fixed)

- **No frontend unit tests.** When validators ship false negatives that only surface as UI bugs (the "empty AI Suggestion popup" and "TOP FIXES with no fixes" of recent memory), there's no test that catches it. Would need Vitest + React Testing Library setup. Tracked in conversation as Tier 2.
- **Backend contract tests** that assert the *shape* the frontend depends on (e.g. "if `improvedBullet === ''` and `categoryRewrites === {}`, this bullet should be considered non-actionable"). Cheaper than frontend tests, would have caught both UI bugs above. Tracked as Tier 1.
- **The synthesizer and the LaTeX template duplicate display logic.** Section ordering, year-extraction, tech-stack rendering — they're implemented twice. As long as Tailor uses LaTeX, this stays. Migration plan: move Tailor's output to HTML → Chromium too, then delete the LaTeX subsystem.
- **`web/.env.local` overrides** are project-developer only; `NEXT_PUBLIC_DEV_BYPASS_AUTH` ships in source but is gated.

---

## Recent changes (running log — newest first; **append after every commit**)

- **Multi-page extract + mobile Analyze UX (`c11bceb`, `3721fd5`)** — Backend (`c11bceb`): `_render_pdf_pages_to_b64_pngs` reads up to **4 PDF pages** (was 2). A 2-page cap silently dropped page-3+ content — Ria's Education block lived on page 3, so it never extracted and then surfaced as a hallucinated "missing Education section." Short PDFs still render only their real pages (free for the 1–2 page case). Verified live: education 0→2 entries, false flag gone. Frontend (`3721fd5`): (1) mobile category-score rows are now `<button>`s that open the category detail via the same `setActiveCategory` toggle as desktop and scroll it under the sticky head (were a static readout); (2) the mobile score card shows the number once — inside `ScoreRing` — with the verdict beside it, not a duplicate `69/100`; (3) on ≤1024px the résumé paper drops its scroll gutter (`.az-resume-scroll` padding → 0) to fill the screen (was ~¾ width); (4) metric numbers render as plain text — `.az-metric` clears the browser-default yellow `<mark>` so "Highlights" flags issues-to-fix, not numbers the candidate already has. **Note:** this dev server's `globals.css` HMR is flaky — a `preview_start` restart forces a fresh compile.

- **iPad/mobile Analyze gives the résumé more room (`analyze-honest-coaching`)** — On ≤1024px the `.az-split-resume-slot` grows to **54–72vh** (was 42–60vh) so the document being analyzed is the headline, and the overview summary banner (`.az-overview-summary`) + its stack (`.az-overview-stack`) are compacted (13px font, 13×15 padding, 11px chips, 18px gap) so the AI summary reads as supporting context *below* the résumé instead of dominating the fold. Desktop (≥1025px) unchanged. **Invariant:** on small screens the résumé preview is the focus; analysis prose stays compact and secondary.

- **Analyze fix cards coach honestly + no AI tells (`632f348`, `88f4c97`)** — Frontend (`632f348`): flagged-bullet cards now teach instead of dead-ending. A plain-language `CATEGORY_COACH` panel (Why scored low / How to make it stronger / Example) renders for bullets with no trusted rewrite; rewrite cards get a one-line "Why" deduped to the first card per category. The two biggest "written by AI" tells are stripped from anything the tool surfaces or applies via a single chokepoint (`getRewriteForCategory` → `cleanAiArtifacts`): bracket placeholders `[X%]`/`[~12]` are **materialized into concrete example figures** (highlighted amber, with a "swap in your real numbers" note — `BulletImprovedEditor` `highlightTerms`/`suggestionNote`), and em-dashes become commas. Tool UI copy de-em-dashed; gentle "reads AI-written" nudge in the overview when the résumé itself has ≥4 em-dashes. Backend (`88f4c97`): `_strip_bracket_placeholders_from_prose` (always-on in `_validate_analysis_against_resume`) scrubs `[X stakeholders]`-style placeholders out of `summary`/`topIssues`/`atsWarnings`/`finalRecommendations`/`sectionFeedback`/`categoryRationales` (they read as AI and tell the candidate to paste brackets); brackets stay only in `bulletAnalysis` rewrites for the frontend to materialize. Prompt now says "brackets are for rewrites only." New **invariant #16**; `TestBracketPlaceholderProseScrub` (+5, suite 112 green). Verified live on a real résumé (prose 0 brackets, rewrites keep them). **Note:** committed on branch `analyze-honest-coaching`, not `main`.

- **Analyze + Tailor sidebar/nav UX (`632e0fc`)** — Recent Analyses / Recent jobs columns stay open by default (including during scans); app shell nav collapses on scan/analyze start via `useAppShellSidebar` so the workspace gets width without hiding history. Tailor pre-result flow mirrors Analyze’s left column (`rb-tailor-shell`); `TailorRecentJobs` gains empty/loading sidebar modes. Removed tablet-only forced app-nav collapse on first visit. **Invariant:** contextual history sidebar vs app nav are independent — collapse outer nav on scan, never auto-hide the analysis/match column mid-run.

- **Shared font-size presets + project bullet editor (`f7a7dc9`)** — `RESUME_FONT_SIZE_OPTIONS` + `fontSize` on `resumeLayoutCssVarsForPreviewStyle` / `resolveResumeLayout` (0.92× / 1.0× / 1.10×). Template Builder Style tab and Analyze/Tailor `AnnotatedResumePanel` toolbar both use it; Analyze choice persists in `localStorage` (`rn_preview_font_size`). Projects section uses `BulletListEditor` with `minRows={2}` (experience stays 1). **Invariant:** preview font scale is owned by `resumeLayout.ts` so HTML→Chromium export matches the on-screen paper.

- **Analyze flagged-bullet compact UX (`bd4fda6`)** — Category sidebar “Flagged Bullets” cards use `BulletImprovedEditor` `variant="compact"`: collapsed header adds a fix-type chip (e.g. Proofreading / Achievement); expanded body drops per-bullet issue tags + `CATEGORY_REWRITE_HINTS` blockquote, shows readable “Suggested” text with **Apply to preview** / **Copy** / **Edit** (textarea only when Edit). Preview-panel / Tailor paths keep default editor layout. **Invariant:** bullet card teaches fix via suggestion + apply, not triple category copy.

- **Quant 75% target + required placeholder rewrites (`668de41`)** — Analysis prompt requires `categoryRewrites.quantification` / `improvedBullet` with `[X%]`/`[$Y]` when flagging quant bullets; recruiter bar ~75% metric coverage. `normalize` treats bracket placeholders as quant support and backfills `improvedBullet` from `categoryRewrites.quantification`. UI copy + `TARGET_QUANTIFIED_BULLET_SHARE=0.75`.

- **Advisor bug reports (admin-only, `uncommitted`)** — `GET /api/admin/bug-reports` lists `bug_reports` only when `institution_advisors.role = 'admin'` (`global_admin`). `cohort-stats` + `advisor-access` expose `global_admin`; `AdvisorDashboard` shows a Bug reports panel for admins only — UMBC advisors never see it.

- **Deterministic topIssues gated to LLM-fallback only (`668de41`)** — Normal analyze skips `inject_deterministic_insights`; frontend hides `source: "deterministic"` topIssues. Quantification UX = LLM rationales + flagged bullet rewrites only.

- **Deterministic recruiter insights + universal-filler buzzwords (`0f1e0df`)** — `deterministic_insights.py` + narrowed `_BUZZWORDS`; inject originally ran post-LLM (reverted for UX). `test_deterministic_insights.py`. Optional `pyspellchecker` dep.

- **Template Builder cloud save to Resume Hub (`uncommitted`)** — `template_builder_resumes` table (migration `011_template_builder_resumes.sql`) stores named `TBResumeData` drafts per user (RLS). Resume Hub lists them as **Builder drafts**; **Save to Hub** / **Update in Hub** in Template Builder; reload via `/template-builder/?builder=<id>`. Separate from `resume_analyses` and tailored `resumes` rows; localStorage remains offline fallback.

- **Template Builder custom sections (`uncommitted`)** — `TBResumeData.customSections` + `sectionOrder` slots (`custom:<uuid>`) support certifications, awards, volunteering, and arbitrary extra sections. Sections tab: preset chips, drag reorder, hide, inline editor, remove. Prefill maps `structuredResume.extra_sections` (skips per-company Technologies extras). Analyze preview toolbar already has **Edit in Builder** (`501b50e`). **Invariant:** WYSIWYG export still uses `ResumePreview` + `renderSectionSlot`; header/contact fixed at top.

- **Section-feedback pronoun claim sanitizer (`uncommitted`)** — `evidence_validator._sanitize_pronoun_claims_in_text_fields` always runs after ATS non-issue strip: strips "remove personal pronoun" clauses from `sectionFeedback` when that section has no pronouns (Nutri AI / PROJECTS case), and from `topIssues` / `categoryRationales` / `finalRecommendations` when the whole résumé has none. +2 tests (78 in `test_analyze_dimensions.py`). Invariant #13.

- **Participial duty-lead detection + achievement rewrite validator (`uncommitted`)** — `analysis/constants.py` adds `_bullet_leads_with_strong_ownership_verb()` so `Automated testing…` no longer counts as a strong lead while `Automated CI/CD pipelines…` still does; résumé share + evidence validator per-bullet weak-verb drops use it. `rewrite_validators._validate_achievement_rewrite` rejects `achievementQuality` `improvedBullet` / `categoryRewrites.achievementQuality` when the opening word is unchanged or the rewrite still opens with a participial duty phrase (fixes the "same Automated…" false improvement). `normalize._filter_bullet_rewrites` passes `primaryCategory`. +5 tests (76 in `test_analyze_dimensions.py`). Invariants #11–12.

- **App sidebar Contact nav (`71467c4`)** — `/contact` (mailto + Gmail compose to `contact@resunova.io`) was public and in the landing footer but missing from `AppShell`. Added footer menu item + footer text link in `AppSidebar`. **Invariant:** support/legal routes discoverable from signed-in shell, not only marketing footer.

- **Analyze source PDF storage (`a6c641b`)** — Analyze-only students had no PDF in advisor/library because `resume_analyses` stored only the `result` JSON snapshot. `/api/analyze-upload` now uploads the original PDF to the same `resume-pdfs` bucket as Tailor (`upload_analyze_source_pdf` → `{user_id}/analyze-{analysis_id}.pdf`), persists `source_pdf_url` + `source_filename` on `resume_analyses` (migration `008_resume_analyses_source_pdf.sql`), and returns `analysisId` / `sourcePdfUrl` so the frontend skips duplicate `insertAnalysis`. Advisor `student-detail` exposes `latest_source_pdf_url`; Resume Hub analyzed detail embeds the PDF when present. **Invariant:** analyzed library items remain JSON snapshots; the source file is an optional column on the analysis row, not a second `resumes` row. Historical runs lack URLs until re-upload.

- **Advisor roster email resolution (`67f47a6`)** — UMBC scope correctly keyed off `user_id`, but roster labels came from `resume_analyses.user_email`, which was often NULL (frontend `insertAnalysis` omitted it). Added `_email_by_user_id()` in `resume_gui/auth/supabase.py` (institution_students + auth.admin list_users fallback); `/api/cohort-stats` and `/api/student-detail` now hydrate `user_email` before returning roster rows. Frontend `insertAnalysis` persists `session.user.email`. Prod backfill: `UPDATE resume_analyses … FROM auth.users` cleared all blank emails. **Invariant:** advisor display name should never depend solely on analysis-row email when auth email exists.

- **Advisor auth resiliency guardrail (`uncommitted`)** — `web/components/AdvisorDashboard.tsx` now treats `supabase.auth.getUser()` as fallible and still marks auth as checked on failure, preventing the view from stalling in an indeterminate state. Also replaced the silent `if (!data) return null` branch with a user-visible fallback card + retry action so transient cohort-fetch/auth timing issues surface as recoverable UI instead of a blank pane.

- **Free-scan onboarding banner + scan-limit import hardening (`1f48b7b`)** — Added a top-of-shell `FreeScanWelcomeBanner` for signed-in non-UMBC users to clearly communicate the 5 free resume scans/day policy and persist dismissal per user in localStorage. Also made `resume_gui/routes/analyze.py` import `_scan_limit_status_for_user` directly from `services.scan_limits` instead of relying on `_shared` wildcard exports, preventing runtime `NameError` drift in scan-limit enforcement paths.

- **Analyze-upload scanned PDF recovery + scan limits (`b7fcd78`)** — `resume_gui/routes/analyze.py` now avoids early 422 for PDFs with empty markdown extraction: textless PDFs continue into vision extraction, and only return the scanned-PDF error when both text extraction and vision-synthesized text are unavailable. This fixes `/api/analyze-upload` false negatives where scanned/image-only resumes previously failed before vision could recover them. The same commit also enforces daily scan limits in `/api/analyze-upload` and `/api/analyze` with `429` + `{code:"daily_scan_limit_reached", limit, used, resetAt}` metadata.

- **Scanned PDF upload vision fallback (`uncommitted`)** — `resume_gui/routes/library.py` no longer returns `no_extractable_text` (422) immediately when MarkItDown markdown is empty. `/api/upload-resume` now attempts PDF vision extraction first; only hard-fails when both markdown text and vision extraction are unavailable. For image-only PDFs with successful vision extraction, the route skips text parsing, synthesizes preview text from the vision doc, and returns `structuredResume` normally. This prevents false negatives on scanned résumés that previously failed before vision fallback.

- **Analyze → Template Builder structured prefill + entry reordering (`uncommitted`)** — Added a bridge from analyzed library items into `/template-builder/`: `stashTemplateBuilderStructuredPrefillFromAnalysisResult()` maps saved `structuredResume` into `TBResumeData`, stores a one-shot prefill payload, and `TemplateBuilderClient` consumes it on load to hydrate the builder form. This turns Analyze snapshots into editable Template Builder sessions without re-upload/parsing. Builder state now includes `replaceData` plus `moveWork` / `moveEducation` / `moveProject`; the UI exposes up/down ordering controls per entry so users can quickly reorder sections before export. **Invariant:** Template Builder remains the same WYSIWYG HTML→Chromium export path; this change only affects prefill/edit workflow and entry ordering, not PDF rendering semantics.

- **Structured source-of-truth in `/api/analyze` deterministic layers (`0649557`)** — `resume_gui/routes/analyze.py` now synthesizes `resume_for_match` from `structured_resume` when available (`_resume_doc_from_parsed` → `_synthesize_text_from_resume_doc`) and uses that text for both `apply_gap_workflow(...)` and `_run_jd_match_pipeline(...)`. Fallback remains `candidate_profile` when structured data is absent. **Invariant:** scoring + deterministic gap verification/JD matching should read from the same structured-backed résumé view whenever possible, so Tailor re-checks do not drift from the stored structured document.

- **Advisor action-first dashboard + shadcn table/input (`uncommitted`)** — Reframed `AdvisorDashboard` from passive analytics to advisor workflow: KPI strip (students, analyses, average score, needs-attention, tailored resumes), readiness distribution, ranked improvement areas, prioritized "Students needing review" queue, and richer roster statuses/actions (`Needs Work` / `Improving` / `Ready` / `No Analysis Yet`). Added reusable `web/components/ui/table.tsx` and migrated roster/detail tables + search input to shadcn primitives (`Table*`, `Input`) instead of ad-hoc styling. Backend `/api/cohort-stats` now returns `tailored_resume_count` and computes `top_issues` by unique students affected (not raw repeated mentions), making advisor trends action-oriented.

- **Tailor structured preview + gap-fix UX (`9acd185`)** — `/api/analyze` accepts `include_structured_resume` and returns `structuredResume` for text-path extract when Tailor has no PDF vision doc; `saveTailorMatchToLibrary` persists `resume_doc.structured`; Recent Jobs + `intent=job` prefill restore profile + structured before redirect. **`/api/suggest-gap-fix`:** if `structured_resume` is empty but legacy clients send `candidate_profile`, server runs `_llm_extract` once then builds eligible bullets (prod-safe until frontend deploy). **Frontend:** gap-fix cards only in sidebar tab `gapfix` (`GapFixTabPanel`); inline panels removed from qual/resp/keywords/`MatchBreakdownCards`. Preview purple-highlights **original** lines via `tailorGapFixHighlights` — no synthetic `improvedBullet` on panel open. Request sends both `structured_resume` and `candidate_profile` when available. Relaxed `isStructuredUsable` (header OR first employer + body).

- **Structured schema gap-fix (`c2800bd`)** — `/api/suggest-gap-fix` no longer sends plain `candidate_profile`; it requires `structured_resume` and builds an **ELIGIBLE BULLETS** JSON list (`resume_gui/tailor/structured_gap_fix.py`) so project headers (`Name | tech`) are never rewrite targets. LLM output is schema-enforced via `SUGGEST_GAP_FIX_SCHEMA` + `llm/gap_fix_call.py` (Grok `json_schema` strict → Gemini `response_schema` → `json_object` fallback). Prompt is role-neutral (`gap_fix_prompt.py` + `classify_role_family` examples); server truth layer in `gap_fix_validate.py` + `gap_fix_terms.py` (≥1 JD product term per rewrite when honest). Frontend: Fixes tab suggestions always editable (`CategoryFixPanel` + `updateSuggested` in store), responsibility gaps pass `type: "responsibility"`, Recent Jobs refresh via `tailorAnalyzeLibrary.ts` + `RESUME_LIBRARY_CHANGED_EVENT`. **Invariant:** gap-fix LLM proposes patches; validators + structured `original` whitelist decide what ships; user edit/apply is final intent.

- **JD-driven gap verification (`requirement_match`)** — Replaced global `_SKILL_ALIASES` with `resume_gui/tailor/requirement_match/`: Layer 1 JD phrase extraction, Layer 2 dynamic abbreviations + core-phrase aliases, Layer 3 optional `domain_dictionaries/{role_family}.json`, disambiguation safety (`java`≠`javascript`). `POST /api/analyze` passes `job_description` into `apply_gap_workflow` → `verify_gap_in_resume` returns `RequirementMatch` (method: exact/alias/abbreviation/not_found). Frontend types in `web/lib/requirementMatch.ts`. Tests: `test_requirement_match.py` + `test_gap_workflow.py`. **Next:** LLM `extract_requirements_from_jd()` to populate `RequirementConcept[]` at analyze time (not only on gap apply).

- **Shared résumé layout module (`5edc891`)** — `web/lib/resumeLayout.ts` is the single source for style presets, page padding, CSS vars (`resumeLayoutCssVars` / `resumeLayoutCssVarsForPreviewStyle`), TB inline styles (`resumePageRootStyle`, `resumeSectionTitleStyle`, …), and Analyze block spacing (`paragraphBlockStyle`, `bulletsBlockStyle`, `RESUME_BULLET_STYLESHEET`). `ResumePreview`, `AnalyzeLiveResumeBody`, `AnnotatedResumePanel`, and `ResumePDFTemplate` import from here; `templateStyles.ts` is a thin deprecated re-export. **Invariant:** changing spacing/fonts for preview or Chromium export should touch only `resumeLayout.ts` (plus accent chips in `AnnotatedResumePanel`).

- **Per-company Technologies under jobs (`87be5a4`)** — Follow-up to structured section-order fix (`0c9aa38`): résumés that put each employer's stack in `extra_sections` as `Technologies (Company)` / `TECHNOLOGIES - Company` (also `:` separator) no longer render as a trailing orphan section. `buildBlocksFromStructured` and `_synthesize_text_from_resume_doc` partition those extras, fuzzy-match company keys, emit `Technologies: …` under the matching experience entry (after bullets), and only append unmatched extras last. Bare `Technologies` (no company) stays global. Keeps structured preview and `extractedText` in sync. +2 tests in `test_resume_extraction.py`.

- **Structured preview render + Template Builder look (`7eca9ee`, `70e9cec`)** — The Analyze/Tailor preview (`AnalyzeLiveResumeBody`) now renders from the typed `structuredResume` object instead of re-parsing synthesized flat text. New `buildBlocksFromStructured()` emits the same `Block[]` shape from typed fields (header/section/paragraph/bullets), killing the whole class of text-parse bugs (double bullets, project tech-stack-as-bullet, stray markers) at the source. **Critical invariant:** `bulletAnalysis` is a SPARSE weakest-only subset (~15) and `bulletMap` is NOT index-aligned with it — so bullet→analysis identity still uses the fuzzy `findBulletIndexForLine`; most bullets resolve to `-1` and render via a NEW neutral branch (no badge/popup/highlight) instead of being dropped by the old `if (!bullet) return null` guard. `collapseAdjacentSameBulletRows` guarded so `-1` rows never merge. `isStructuredUsable` gate selects the structured builder, falling back to text `buildBlocks` for legacy/restored-history/Word-doc payloads. Analyze reads `structuredResume` from the Zustand store (now typed with `education`/`projects`/`section_order` + defensive `normalizeStructuredResume`); Tailor threads it as an **authoritative** prop through `TailorPreviewPane` → `AnnotatedResumePanel` (`structuredResumeAuthoritative`) so a stale Analyze-store value can't leak in. Phase B restyled the render branches + `PREVIEW_STYLE_OPTIONS` to the Template Builder look: left-aligned name header with ` | `-separated contact, accent-underlined section titles, three TB presets (Classic Times / Modern + Executive Helvetica). All interactivity + WYSIWYG Chromium PDF export preserved (export verified 200 OK). Project tech-stack promotion (`_looksLikeTechStackLine`) ported from `synthesize.py`. **The structured render and Template Builder's `ResumePreview` now produce the same clean layout from the same typed shape — but `AnalyzeLiveResumeBody` keeps its interactivity; do NOT swap in `ResumePreview` (it's static).**

- **Project tech-stack + bullet-marker synthesizer fixes (`fcece15`)** — `resume_gui/extract/synthesize.py`: `_looks_like_tech_stack_line` now detects comma-separated stacks (was `·`-only) and promotes a project's tech-stack first bullet onto the `name | tech` header; `_strip_leading_markers` runs on every experience/project/education bullet so a vision-kept `*`/`•` never doubles with the frontend CSS marker. +2 tests in `test_resume_extraction.py`.

- **`724d8f7`** — Fixed `/api/upload-resume` 500 ("Something went wrong while processing your résumé"): `library.py` used `log_extraction_debug` via the `_shared` wildcard import but it was missing from `_shared.py`'s `__all__`. Added the import + `__all__` entry.

- **Tailor gap-fix apply/rescore (this session)** — Fixed the class of bugs where applied gap fixes didn't update preview/score, only one bullet got a green highlight, and gaps reappeared after rescore. `synthesizeProfileWithBulletOverrides` now fuzzy-matches originals + appends unmatched bullets; `applyGapFixes()` batches Apply All in one rescore; rescore sends `include_bullet_analysis: true` and remaps `tailorLineOverrides`; `mergeRescorePreservingAddressedGaps` keeps addressed gaps in covered after LLM rescore. Green flash uses `tailorAppliedBulletIndices` (Set) not a single index. Helpers in `web/lib/tailorGapFix.ts`.

- **`b034ae8`** — App shell nav polish: custom SVG icons in `nav-icons.tsx` replace Lucide for primary nav items; collapsed sidebar shows icons-only with tooltips while expanded state shows labels/badges. Shared `NAV_MENU_BTN_CLASS` + `globals.css` nav icon sizing. `AppSidebarUser` and bottom nav aligned to the same pattern.

- **`e1c8772`** — Onboarding docs: root `README.md` is now Resunova-focused (local dev, repo layout, link to backend README). `resume_gui/README.md` expanded with directory map, env var table, pipeline diagrams, common tasks, and deploy notes. `web/AGENTS.md` links to backend README for API work.

- **`c91c325`** — Backend refactor phase 2: extracted structured-doc parsing (`doc_normalize.py`, `education_parse.py`, `structured_doc.py`) from `app.py`. Builders (`_resume_doc_from_parsed`, `_build_resume_doc_from_llm_raw`), normalization pass, and JSON serialization now live under `extract/`. `app.py` down to ~6,100 lines; still owns routes, LLM orchestration, and suggestion application.

- **`0d90f5b`** — Backend refactor phase 3: completed monolith split. `app.py` is ~80 lines (Starlette factory + test re-exports). Route handlers in `resume_gui/routes/` by domain; LLM in `llm/`, comprehensive analysis in `analysis/comprehensive.py`, extract orchestration in `extract/pipeline.py`, suggestions in `suggestions.py`, auth in `auth/supabase.py`. Onboarding map in `resume_gui/README.md`.

- **`9e719f9`** — Backend refactor phase 1: extracted analyze honesty pipeline (`resume_gui/analysis/`) and PDF extract helpers (`resume_gui/extract/` vision, synthesize, text_utils, education) from the `app.py` monolith. `app.py` re-exports the same `_`-prefixed names for tests and scripts. Added `resume_gui/README.md` as the onboarding map. Invariant: no behavior change — 87 pytest cases stay green.

- **Chromium-only PDF + Template Builder replaces studio (this session)** — JD Tailor no longer calls LaTeX (`apply-suggestions` / `generate-stream`) for gap fixes or download; preview + export use `useHtmlPdfExport` like Analyze. Legacy `?flow=template` / `ResumeTemplateStudio` redirect to `/template-builder/`. Removed LaTeX template picker from tailor upload form and "LaTeX layout" chips from `AnnotatedResumePanel`; Style + accent swatches on the preview panel are the single styling surface.

- **Landing previews + shadcn padding + auth sign-out (`78a0bdd`)** — Homepage embeds `LandingFeatureShowcase` variants (hero A, animated B/E/D sections with compact headings); card grids + how-it-works hidden via flags; footer simplified; India stat removed from ticker. `signOutAndReturnHome()` + `AuthGate` force-landing fixes sign-out under `NEXT_PUBLIC_DEV_BYPASS_AUTH`. Sidebar footer overflow visible so Account menu isn't clipped. Tailwind `@source` scan paths + removed universal `padding:0` reset restore shadcn Button/Badge padding; component slot fallbacks in `globals.css`. `/landing-preview` shows all variants; Tailor builder embeds variant C.

- **Category score explanations below 95 (this session)** — Any category scored under 95 must show *why*: analysis prompt emits `categoryRationales`; `/api/explain-category-score` backfills saved runs; `AnalyzeResume` auto-fetches on category open when missing. Removed misleading "looks strong" empty state for 70–94 scores and dropped the "no trusted AI rewrite / quality filter" copy on bullet cards. `/api/upload-resume` now vision-synthesizes `extractedText` for PDFs (analyze parity). Tailor results header drops LaTeX "Generate tailored PDF" — download is HTML/Chromium only.

- **Tailor WYSIWYG preview + match sidebar (this session)** — Tailor results use `TailorPreviewPane` → shared `AnnotatedResumePanel` + `useHtmlPdfExport` (same WYSIWYG stack as Analyze). `DetailedRatingsView` split into `TailorMatchSidebar` + `TailorMatchDetail`. `/api/upload-resume` returns vision-synthesized `extractedText` + `resumeHeader` + `structuredResume` for PDF uploads (same text as analyze-upload). LaTeX "Generate tailored PDF" CTA removed from results header — download is HTML/Chromium only.

- **Language micro-edits under Language Quality (this session)** — Trivial rewrites (tense, `;`→`and`, spelling) no longer vanish: backend salvages them into `categoryRewrites.languageQuality`; frontend shows them only under the Language category with a "Proofreading" label. Primary achievement/quant rewrites still require substantive changes. `_BULLET_ANALYSIS_MAX` raised from 8 → 15 weakest bullets in the analysis prompt.

- **Analyze score/UX alignment (this session)** — Fixed the category-score vs bullet-layer mismatch that made Readability look empty while the preview still warned about highlights. Frontend now uses `bulletBelongsToCategory()` (checks `issueCategories` for display, `primaryCategory` for rewrites only). Preview banner/badge gated on actual matches; low-score categories without bullets get explanatory empty state; stripped-rewrite bullets explain the quality filter. Added `resume_gui/experience_tenure.py` + `experienceSummary` on analyze-upload (merged tenure from structured experience dates; chip in sidebar + overview). Docs: [`docs/ANALYSIS_ALGORITHM.md`](docs/ANALYSIS_ALGORITHM.md). Invariant #10. Tests: +6 tenure cases (74 total with dimensions).

- **Template Builder in app nav (this session)** — `/template-builder/` is now wrapped in the shared `AppShell`, so the standalone builder gets the same left navigation shell as the rest of the app. `AppShell` detects the pathname and treats the Resume Builder drawer as active on that route, with a new `Template Builder` sub-item linking directly to `/template-builder/`; `Tailor to a job` remains the normal `/?view=builder&flow=tailor` path. This keeps the public no-signup tool accessible while making it discoverable from the in-app Resume Builder nav.

- **Template Builder WYSIWYG PDF export (this session)** — The Template Builder download now uses the shared HTML → Chromium export path (`useHtmlPdfExport`) against the actual `ResumePreview` DOM node instead of maintaining a separate `@react-pdf/renderer` layout. This keeps preview spacing, page margins, font sizing, and header/contact spacing aligned with the downloaded PDF, matching the Analyze flow's WYSIWYG invariant. `ResumePreview` now forwards a ref to its page root so the export captures the unscaled 8.5in paper element rather than the UI preview wrapper. Verification: `npx tsc --noEmit` passed.

- **Advisor access UX cleanup (this session)** — Added a lightweight `/api/advisor-access` endpoint that reuses `_advisor_scope_for_request` and returns `{ allowed: boolean }` without loading cohort data. `AppShell` now checks this endpoint after Supabase session load/auth changes and only renders the Advisor nav item when the current user is actually an advisor; direct `?view=advisor` visits still render the Advisor page but get a clearer roster-based restricted message with sign-out/check-again actions. Operational note: adding an advisor to the SQL migration does not update live Supabase until the migration is applied; `pbhodia1@umbc.edu` was inserted into `institution_advisors` directly via MCP as an active UMBC test advisor.

- **Advisor dashboard shadcn + UMBC test advisor (this session)** — Refactored `AdvisorDashboard.tsx` toward the repo's shadcn/base-nova primitives (`Button`, `Badge`, `Card`, `Progress`, `Separator`, `Skeleton`) while preserving the existing cohort/student data flow. KPI cards, score badges, loading/auth/error states, cohort overview sections, and student detail panels now use the shared UI layer instead of mostly bespoke `div`/`button` markup. The institution advisor migration now seeds `pbhodia1@umbc.edu` as an active UMBC test advisor and keeps the row idempotent with `on conflict`. Verification: `npx tsc --noEmit` passed; local `npm run lint` still requires Node >=20.9.0 because the current shell is Node 16.

- **Resume Hub + analyzed resumes (this session)** — Library is now a unified **Resume Hub** instead of a generated-resume-only list. The frontend keeps `resumes` and `resume_analyses` as separate persistence tables for v1, then normalizes them through `fetchLibraryItems()` into a `LibraryItem` union (`tailored` vs `analyzed`). `ResumeLibrary` renders both card types with filters (`All`, `Analyzed`, `Tailored`, `Default`); analyzed cards surface score, date, top issues, and actions to open/continue the saved analysis, tailor from extracted text, or export via the Analyze preview. `LibraryResumeDetailPanel` now branches by item kind: tailored keeps the PDF/share/template panel, analyzed shows category scores, issues, strengths, and a live extracted-text preview. `AnalyzeResume` accepts `?analysis=<id>` and restores that saved history row after Supabase history loads. UX invariant: analyzed library entries are saved analysis snapshots, not original uploaded file storage; PDF export still goes through the Analyze preview after opening the saved run.

- **structured bullet categories (this session)** — Root-cause fix for the recurring "misleading hint / wrong rewrite" class of bug. The frontend used to *re-derive* each bullet's category with a ~150-line regex pile (`guessIssueCategory`, `buildBulletPrimaryCategories`, `inferBaseCategory`) and could disagree with what the backend intended — that disagreement is what surfaced quantification hints on `sectionStructure` bullets, dead-end TOP FIXES, etc. **Now the backend is authoritative.** The analysis prompt emits `primaryCategory` (the single categoryScores key `improvedBullet` fixes) and `issueCategories` (every key the bullet is weak in) per bullet. `_normalize_bullet_categories` in `app.py` validates/backfills them and guarantees three invariants: (1) both fields ⊆ `_CATEGORY_SCORE_KEYS`; (2) `issueCategories` always contains `primaryCategory`; (3) **"quantification" appears in neither field unless a surviving rewrite actually adds a numeral** — same evidence test as the issues[] strip, so the category bucket and the tag can never disagree. Frontend `analysisCategoryMatch.ts`: `buildBulletPrimaryCategories` now trusts `primaryCategory` verbatim when every bullet has a valid one (fast path), falling back to the regex heuristics only for legacy restored-history payloads that predate the fields. `getRewriteForCategory` / `bulletMatchesAnalysisCategory` / `inferPrimaryCategoryFromBullet` prefer the explicit field. New invariant #9 (see Validators). 8 new tests in `test_analyze_dimensions.py` (`TestBulletCategoryNormalization`) — suite now 66, all green. **NOTE:** the container's `cryptography` rust binding panics on import of `resume_gui.app`; fixed this session with `pip install --upgrade cryptography` + installing `sse_starlette`, `beautifulsoup4`, `google-genai`. Future sessions running pytest may need the same.

- **`2912c26`** — Fixed misleading quantification hint showing on all flagged bullets. `getRewriteForCategory` in `web/lib/analysisCategoryMatch.ts` had a fallback that returned `bullet.improvedBullet` as the "quantification rewrite" whenever `bulletSignalsQuantificationWeakness` was true — even for bullets whose primary category was `sectionStructure` or `readability`. This made `categoryRewriteBase` non-empty for those bullets, triggering the "Add a number where it helps…" hint alongside an irrelevant rewrite. Fix: removed both `quantification` and `achievementQuality` category-specific fallbacks. A rewrite is now returned only if (a) user has a draft, (b) `categoryRewrites[category]` exists, or (c) primary category matches. All other bullets fall through to the "No auto-rewrite for this one" message. Also removed the now-dead `bulletSignalsQuantificationWeakness` helper.

- **`50de1d9`** — Gated the `CATEGORY_REWRITE_HINTS` render on an actual rewrite being present (`draft.trim() || categoryRewriteBase.trim()`). Added a "No auto-rewrite for this one" fallback message when neither draft nor base rewrite exists. These two commits together (50de1d9 + 2912c26) close the "hint on every bullet" bug.

- **`5284b9e`** + **`9075a03`** + **`f714cf4`** + **`967dfc9`** — Preview→card linking + auto-open first bullet. Clicking a bullet in the résumé preview now opens its suggestion card on the left. Uses `handleBulletSelectFromPreview` which checks `bulletPrimaryCategories[index]` to switch category if needed. `pendingExpandIdxRef` pattern bridges the async React state-change cycle: when a category switch is triggered by a bullet click, the ref stores the target bullet index and the `[activeCategory]` effect reads + clears it. Also: first flagged bullet in a category auto-expands when category is selected. Near-no-op filter in backend: `_word_jaccard(original, rewrite) >= 0.88` → rewrite dropped (catches ";" → "and" style non-changes). PDF clean export: `cleanForExport()` in `useHtmlPdfExport.ts` strips score badges, chevron SVGs, colored `[data-bullet-idx]` backgrounds before sending HTML to Chromium.

- **`5f9678d`** — Template Builder: full UI redesign + mobile Analyze fix. (1) `/template-builder` added to `AuthGate PUBLIC_ROUTES` — it was showing the landing page for signed-out users even though the builder is intentionally sign-up-free. (2) Accordion-based left panel replaced with a 6-tab icon grid (Profile/Experience/Education/Projects/Skills/Style) matching open-resume's two-column aesthetic. Top header bar with Reset + Download PDF. Style tab has font-picker cards and 8 color swatches with live preview. New fields: Website in Profile, Coursework in Education, Tech Stack + Link in Projects — in both HTML preview and PDF template. (3) Mobile Analyze fix: `height: 100%` on both workspace-split flex children was compressing the work slot to ~230px, making analysis unreachable; fixed with `height: auto !important` + `-webkit-overflow-scrolling: touch`. Key invariant: `TemplateBuilderStore` interface is now exported so section sub-components can type-check props without relying on `ReturnType<typeof hook>`.

- **`7d79ddd`** — **Restored analyze-first flow in the tailor builder; removed Accept/Skip + live streaming.** `handleAnalyze` POSTs to `/api/analyze` (fast, ~20s, no PDF compile), gets `RatingsData` back, and sets `result` with `ratings` but `folder/pdfUrl = null`. The `DetailedRatingsView` then renders immediately — user sees match score, gaps, keywords. "Generate tailored PDF →" button in the result header commits to a LaTeX compile. `suggestionsReviewMode` is now hardcoded `false` (panel removed). `showSuggestResearchPanel` hardcoded `false` (live streaming removed). `showBuilderInputs` now gates on `analyzing` too so the form hides while analysis runs. The tailor PDF path is still LaTeX (via `/api/generate-stream`) — HTML→Chromium is Analyze-flow only. **shadcn/ui is installed** (button, card, badge, dialog, progress, separator, skeleton, tooltip in `web/components/ui/`) but ResumeBuilder and the tailor flow still use inline styles — migration is pending.

- **`3d89f8c`** — **Template Builder skills section restructured to match open-resume.** `skills: string` replaced with `TBSkills { featuredSkills: TBFeaturedSkill[]; descriptions: string }`. 6 named skill inputs each with 5-circle proficiency rating UI (filled = accent color). PDF and HTML preview render featured skills in a 3-column grid with filled/unfilled circles, category description lines below. Old string-format localStorage data auto-migrated on load. Store actions changed from `setSkills(string)` to `setFeaturedSkill(idx, skill, rating)` + `setSkillDescriptions(string)`.

- **`4efc528`** — **UMBC branding variant system.** AppShell now detects @umbc.edu users via email domain check in the auth useEffect. Logo components (LogoMark, LogoFull) accept optional `variant` prop ("resunova" | "umbc"); UMBC variant swaps mark color from amber (#c4793a) to UMBC gold (#b8860b) and wordmark from "Resunova" to "UMBC". Created UmbcProvider context to propagate isUmbc state across app. Added UmbcWelcomeBanner component (dismissible, session-local) that shows gradient banner + education messaging for UMBC users. Added `isUmbcUser()` utility in new `web/lib/userDomainDetection.ts`. Updated `web/lib/brand.ts` with `BrandVariant` type and `getBrandVariant()`. Added typography CSS variables in `web/app/globals.css` (--font-size-xs through --font-size-4xl, --font-weight-normal through --font-weight-extrabold, --line-height-tight through --line-height-relaxed) as foundation for future type-scale unification; variables are defined but not yet applied to all components (avoiding sed batch-replacement issues). Architectural decision: variant state lives in AppShell context + UmbcProvider, not URL/query params, so UI state persists per session without storage.

- **`69e26b2`** — Per-bullet Option A. After `_filter_bullet_rewrites` runs in `_normalize_analysis`, sweep `bulletAnalysis` and drop any bullet where (a) `improvedBullet` is empty, (b) `categoryRewrites` is empty, AND (c) `score >= 70`. A 75-score bullet with no AI help is dead-end UX — same pattern as the category-level fix in `d4f2641`. A genuinely weak bullet (<70) without a rewrite stays so the user at least sees the low score and the tags. Live test went from 2 → 1 entries on KrishResume-Analytics.pdf, with the silent 75-score "Reduced manual data-entry toil…" being the one dropped.
- **`93bf5e3`** — Added per-theme `--green-ink` / `--amber-ink` / `--red-ink` CSS variables for text-on-tint cases. Light mode green-ink is `#047857`; dark mode keeps `#34d399`. Strength chips at top of Analyze view + "✓ Fixed" badges on MatchBreakdownCards swapped to `--green-ink`. Light-mode contrast goes from ~2:1 → ~7:1 (WCAG AAA). Pattern documented inline so the next chip uses the right variable.
- **`91b08cc`** — Prod `/api/export-pdf-html` was 500-ing because the Railway Dockerfile only installed the `playwright` PyPI wrapper, not the Chromium browser binary nor its system deps. The handler also had no try/except, so the launch-failure exception escaped the CORS middleware and surfaced in the browser as a misleading CORS block. Fix: `RUN playwright install --with-deps chromium` in the Dockerfile (~300MB image bloat, acceptable), and a try/except around the executor that returns JSONResponse with three distinct error paths (ImportError → 503, "Executable doesn't exist" → 503 with install instruction, other → 500). All three go through CORS middleware so the browser sees real errors. Live verification: prod returned 200 + a real PDF on the 6th poll attempt (~2:35 after push) once Railway finished rebuilding.

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

*Last updated: 2026-05-31 — backend modular refactor + README onboarding (`e1c8772`). Next session: read this file first, update it last.*
