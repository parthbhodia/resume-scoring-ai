# Resume Scoring AI - Next Agent Handoff

## Project Snapshot

- Repo: `resume-scoring-ai`
- Branch: `main`
- Latest pushed commit: `f054d2e`
- Stack:
  - Frontend: Next.js + React (`web/`)
  - Backend API: Starlette/FastAPI-style routes (`resume_gui/app.py`)
  - Resume processing and LaTeX/PDF logic: `linkedin_agent/resume_library.py`

## What Was Just Added

### 1) Analyze Resume flow (new user-facing feature)

- New button in Resume View: **Analyze resume**
- New tab in Resume View: **Analysis**
- New backend endpoint: `POST /api/resume-analysis/{folder}`
  - Combines ATS + doctor-style bullet analysis
  - Returns:
    - overall score/summary
    - section-level scores/summaries
    - prioritized tips (`urgent`, `critical`, `optional`)

### 2) PDF editing improvements

- Added PDF preview controls in editor and cache-busting behavior for iframe refresh after save.
- Added PDF layout options in parsed model and UI:
  - `pageSize`: `a4 | letter`
  - `density`: `compact | standard | spacious`
  - `fontScale`: `-1 | 0 | 1`

### 3) Contact header flexibility

- Contact header now supports:
  - editable field labels (location/email/phone labels)
  - custom contact fields (add/remove rows)

## Key Files to Read First

1. `web/components/ResumeView.tsx`
   - Entry point for resume detail page
   - Analyze button + Analysis tab rendering live here

2. `resume_gui/app.py`
   - New route: `/api/resume-analysis/{folder}`
   - Helper methods for scoring sections and generating tips

3. `web/components/ResumeEditor.tsx`
   - PDF preview mode controls
   - Contact header editing fields
   - PDF layout controls in editor UI

4. `web/lib/types.ts`
   - Extended `ParsedResume` + `ParsedContact` types for new layout/contact fields

5. `linkedin_agent/resume_library.py`
   - Contact parse/render logic
   - PDF compile and layout injection behavior

## Current Working Tree Notes (Important)

There are local modified/untracked files in this workspace that were intentionally not included in the last feature commit. Before making new commits, run:

```bash
git status --short --branch
```

Pay attention to existing local changes in:

- `web/package-lock.json`
- `web/package.json`
- `web/tsconfig.json`
- various local tooling folders/files (untracked)

Do not blindly stage all files.

## Where the Next Agent Should Start

1. Pull latest from remote and verify branch state.
2. Run frontend tests quickly:
   - `cd web`
   - `npm run test:run -- ResumeEditor.test.tsx`
3. Manually test Resume View flow in browser:
   - open a saved resume
   - click **Analyze resume**
   - verify Analysis tab populates
   - verify ATS tab still works
   - verify Edit + Save updates PDF preview
4. Validate contact header editing round-trip:
   - edit labels and custom fields
   - save/recompile
   - confirm in generated PDF

## Design Review Checklist (For Next Agent)

Use this checklist before further UX work:

### Information Architecture

- Is Analysis tab discoverable and clearly distinct from ATS tab?
- Are score labels consistent (`/10` vs `%`) and explained?
- Are fix severities visually differentiated and scannable?

### Content Quality

- Are section summaries specific and actionable (not generic)?
- Do top fixes avoid duplication and contradictions?
- Is language concise enough for a recruiter-style read?

### Interaction Design

- Analyze button states: idle, loading, error, success all clear?
- Is last-analyzed timestamp visible and understandable?
- Does switching tabs preserve context and avoid jank?

### Visual Consistency

- Cards, spacing, and typography match existing app patterns
- No overflow/wrapping issues on narrower desktop widths
- Severity badges/colors are accessible and not color-only cues

### Reliability

- No crashes when JD is empty
- No crashes when PDF is missing or malformed
- Analysis endpoint returns useful errors for UI display

## Known Follow-Ups (Recommended)

1. Add unit tests for Analysis tab UI states in `ResumeView`.
2. Add backend tests for `/api/resume-analysis/{folder}` response shape.
3. Consider reusing `AtsPanel` data inside Analysis tab to avoid duplicated computation.
4. Add a small explainer tooltip for how overall analysis score is computed.

## Commands Reference

```bash
# backend syntax check
python -m py_compile "resume_gui/app.py" "linkedin_agent/resume_library.py"

# frontend targeted test
cd web
npm run test:run -- ResumeEditor.test.tsx
```
