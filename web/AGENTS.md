# Resunova — web/ context

**Before editing anything in this directory, read `../CLAUDE.md` first** — project-wide architecture, honesty pipeline, PDF paths, changelog. Backend API layout: [`../resume_gui/README.md`](../resume_gui/README.md). This file covers the Next.js frontend only.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Frontend-specific tips

- **Backend routes / analyze pipeline**: see [`../resume_gui/README.md`](../resume_gui/README.md) — handlers live in `resume_gui/routes/`, validators in `resume_gui/analysis/`.
- **State**: Zustand stores live in `store/` (`resumeAnalyzeStore`, `suggestionsStore`). Hooks in `hooks/`. UI components in `components/`.
- **API base URL** comes from `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8765`). `apiUrl()` from `lib/utils.ts` is the helper.
- **Auth bypass** for local Analyze testing: set `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` in `.env.local`. Mock user gets injected by `lib/supabase.ts`.
- **Downloads**: prefer `hooks/useHtmlPdfExport.ts` (DOM → Chromium → PDF). Only use `useAnalyzeExport`/`useResumeExport` (the LaTeX path) for the tailor flow.
- **Categorization mirror**: `lib/analysisCategoryMatch.ts` (`guessIssueCategory`, `buildBulletPrimaryCategories`) MUST stay in sync with backend prompt expectations. If you change category names or add a new one, update both sides.

## After committing frontend changes

Update `../CLAUDE.md`'s "Recent changes" log (newest entry at the top). Capture the architectural decision or invariant, not the diff itself.
