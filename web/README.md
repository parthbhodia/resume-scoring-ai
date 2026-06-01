# Resunova frontend (`web/`)

Next.js app for [Resunova](https://resunova.io): Analyze, Tailor, Template Builder, Resume Hub, Advisor dashboard.

| Doc | Purpose |
|-----|---------|
| [`AGENTS.md`](AGENTS.md) | Frontend conventions — read before editing |
| [`../CLAUDE.md`](../CLAUDE.md) | Full architecture + changelog |
| [`../resume_gui/README.md`](../resume_gui/README.md) | Backend API layout |

## Local dev

```bash
# Terminal 1 — backend on :8765 (from repo root)
.venv/bin/uvicorn resume_gui.app:app --host 0.0.0.0 --port 8765 --reload \
  --reload-dir resume_gui --reload-dir linkedin_agent

# Terminal 2 — frontend on :3000
npm install
npm run dev
```

Create `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8765
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

Open [http://localhost:3000](http://localhost:3000).

## Key paths

- `app/` — Next.js App Router pages
- `components/` — UI (`AnalyzeResume`, `AppShell`, `ResumeBuilder`, …)
- `hooks/` — `useHtmlPdfExport`, analyze export, etc.
- `lib/` — API helpers, `analysisCategoryMatch.ts`, Supabase client
- `store/` — Zustand state

## Typecheck

```bash
npx tsc --noEmit
```
