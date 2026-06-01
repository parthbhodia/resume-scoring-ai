# Resunova — résumé scoring & tailoring

**Resunova** ([resunova.io](https://resunova.io)) is a web app for AI-powered résumé analysis, job-specific tailoring, and WYSIWYG PDF export.

| Layer | Path | Docs |
|-------|------|------|
| **Frontend** | `web/` | [`web/AGENTS.md`](web/AGENTS.md) |
| **Backend** | `resume_gui/` | [`resume_gui/README.md`](resume_gui/README.md) |
| **Architecture** | repo root | [`CLAUDE.md`](CLAUDE.md) |

## Local dev

```bash
# 1. Python backend (:8765)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn resume_gui.app:app --host 0.0.0.0 --port 8765 --reload \
  --reload-dir resume_gui --reload-dir linkedin_agent

# 2. Next.js frontend (:3000)
cd web && npm install && npm run dev
```

Set `XAI_API_KEY` (and optionally `GOOGLE_API_KEY`) in `linkedin_agent/.env`.  
For local Analyze without auth, add to `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8765
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

## Tests

```bash
.venv/bin/python -m pytest resume_gui/tests/ -v
```

## Repo layout

```
resume-scoring-ai/
├── web/                 # Next.js app (Analyze, Tailor, Template Builder, Advisor)
├── resume_gui/          # Starlette API (see resume_gui/README.md)
├── linkedin_agent/      # Shared LLM helpers, resume_library, env
├── docs/                # Algorithm notes (e.g. ANALYSIS_ALGORITHM.md)
└── CLAUDE.md            # Single source of truth for architecture + changelog
```

---

<details>
<summary>Legacy: LinkedIn Job Search Agent (LangGraph)</summary>

The repo also contains an earlier **LinkedIn job search agent** built with LangGraph. That code lives under `linkedin_agent/` and is not the primary product surface today.

```bash
pip install langgraph-cli
langgraph dev   # → LangGraph Studio on :2024
```

See the original agent docs in git history if you need LangGraph-specific setup.

</details>
