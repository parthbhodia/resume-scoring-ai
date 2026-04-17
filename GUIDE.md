# LinkedIn Job Search Agent — Complete Guide

An agentic AI system built with **LangGraph + Claude** that searches LinkedIn, scores job fits, generates tailored LaTeX resumes, writes cover letters, and submits Easy Apply applications automatically.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Setup](#2-setup)
3. [Running the Agent](#3-running-the-agent)
4. [All 13 Tools — What They Do](#4-all-13-tools)
5. [Workflows — Step-by-Step Examples](#5-workflows)
6. [Resume Library](#6-resume-library)
7. [Easy Apply Automation](#7-easy-apply-automation)
8. [Application Tracker](#8-application-tracker)
9. [Troubleshooting](#9-troubleshooting)
10. [File Reference](#10-file-reference)

---

## 1. Architecture Overview

```
User message
     │
     ▼
┌──────────────────────────────────────────────────────┐
│                   LangGraph Graph                    │
│                                                      │
│   START ──► [ agent_node ]  ◄──────────────────┐    │
│                   │                             │    │
│          has tool calls?                        │    │
│         YES ▼       NO ▼                        │    │
│       [ ToolNode ]   END                        │    │
│           └────────────────────────────────────►┘    │
└──────────────────────────────────────────────────────┘
```

**agent_node** — calls Claude (`claude-sonnet-4-6`) with all 13 tools bound. Claude decides which tool(s) to call based on your message.

**ToolNode** — executes the tool calls Claude requested, returns results back to Claude for the next reasoning step.

This loop repeats until Claude produces a final text response with no more tool calls.

### State

```python
class AgentState(MessagesState):
    job_search_params: dict   # last search criteria used
    found_jobs: list          # jobs returned by most recent search
    applied_jobs: list        # jobs applied to this session
    next_action: str          # internal routing hint
```

### Key files

```
job-search/
├── linkedin_agent/
│   ├── agent.py                  ← graph + all tool definitions
│   ├── parth_profile.py          ← verified static profile (fallback)
│   ├── profile_fetcher.py        ← live LinkedIn profile scraper
│   ├── real_linkedin_scraper.py  ← LinkedIn job search scraper
│   ├── resume_library.py         ← reads/writes .tex resume library
│   ├── resume_cover_generator.py ← plain-text resume + cover letter via LLM
│   ├── easy_apply.py             ← Playwright Easy Apply automation
│   ├── application_tracker.py    ← JSON-based application persistence
│   └── tools.py                  ← extended stub tools (optional)
├── applications.json             ← auto-created application log
├── linkedin_cookies.json         ← auto-created session cookies
├── debug_screenshots/            ← auto-created if Easy Apply hits an unknown form state
├── langgraph.json                ← LangGraph server config
├── .env                          ← your secrets (never commit)
└── requirements.txt
```

---

## 2. Setup

### Prerequisites

- Python 3.10+
- An Anthropic API key → [console.anthropic.com](https://console.anthropic.com)

### Install

```bash
# Clone and enter the repo
git clone https://github.com/froghramar/job-search.git
cd job-search

# Create virtual environment
python -m venv .venv
source .venv/Scripts/activate   # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Install Playwright browser (for Easy Apply)
playwright install chromium
```

### Configure `.env`

Copy `.env.example` → `.env` and fill in your values:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Required for Easy Apply automation
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=yourpassword
PHONE_NUMBER=4439294371

# Optional — LangSmith tracing
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_key
LANGCHAIN_PROJECT=linkedin-job-agent

# Optional — live LinkedIn profile scraping
LINKEDIN_USER_HANDLE=parthbhodia
```

> **Profile fallback:** Even without `LINKEDIN_USER_HANDLE`, the agent uses Parth's complete verified static profile from `parth_profile.py`. All resume generation and cover letters work out of the box.

---

## 3. Running the Agent

### Option A — LangGraph Studio (recommended)

```bash
langgraph dev
```

Opens [LangGraph Studio](https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024) in your browser.

- Click the **Chat** tab for a clean conversational interface
- Click the **Graph** tab to see the visual execution graph and debug node-by-node

### Option B — Python directly

```bash
python linkedin_agent/agent.py
```

Runs a single test query (`"Show my profile and list my existing resumes."`) and prints the result.

### Option C — Python SDK (programmatic)

```python
from langgraph_sdk import get_sync_client

client = get_sync_client(url="http://localhost:2024")

for chunk in client.runs.stream(
    None,
    "linkedin_job_agent",
    input={"messages": [{"role": "human", "content": "Find senior engineer jobs in NYC"}]},
    stream_mode="values",
):
    print(chunk)
```

---

## 4. All 13 Tools

### Job Search

| Tool | Description |
|---|---|
| `search_linkedin_jobs` | Searches LinkedIn's public jobs page. Params: `keywords`, `location`, `experience_level` (entry/mid/senior), `job_type` (full-time/contract/etc.), `remote`, `limit`. |
| `get_job_details` | Fetches the full job description and criteria for a specific job by LinkedIn job ID. |

### Profile

| Tool | Description |
|---|---|
| `get_my_profile` | Shows the candidate profile (name, headline, skills, experience count). Tries live LinkedIn scrape first; falls back to verified static data automatically. |
| `analyze_job_match` | Uses Claude to score how well the profile matches a job. Returns: `match_score` (0–1), `matching_skills`, `missing_skills`, `strengths`, `gaps`, `recommendation` (APPLY / STRETCH / SKIP), and `tailoring_tips`. |

### Resume & Cover Letter

| Tool | Description |
|---|---|
| `generate_resume` | Generates a tailored plain-text resume (professional / ats / technical format) using the candidate's profile and the job description. |
| `generate_cover_letter` | Generates a personalized cover letter (professional tone) based on profile + job. |
| `generate_application_package` | Generates both resume + cover letter and optionally saves them to `application_materials/`. |
| `list_resume_library` | Lists all existing `.tex` / `.pdf` resumes in `C:/Users/parth/OneDrive/Documents/resume/`. |
| `generate_latex_resume_tool` | **Main resume tool.** Generates a fully tailored `.tex` resume in Parth's Rezume template style, saved to the resume library. Optionally compiles to PDF with pdflatex. Takes: `company`, `role`, `job_description`, `reference_folder`, `compile_pdf`. |

### Application Tracking

| Tool | Description |
|---|---|
| `track_application` | Logs an application to `applications.json`. Fields: `job_id`, `title`, `company`, `url`, `status`, `notes`, `resume_path`. |
| `get_tracked_applications` | Lists all tracked applications with an optional `status_filter`. Includes a summary by status. |
| `update_application_status` | Updates the status of a tracked application (e.g., `applied` → `interviewing`). |

### Applying

| Tool | Description |
|---|---|
| `apply_to_job` | Launches Playwright, logs into LinkedIn (reusing saved cookies), navigates to the job, clicks Easy Apply, fills the multi-step form, and submits. Requires `LINKEDIN_EMAIL` + `LINKEDIN_PASSWORD` in `.env`. |

---

## 5. Workflows

### Find and score jobs

```
You: Find senior full-stack engineer jobs in NYC, remote ok

Agent: [calls search_linkedin_jobs]
→ Returns 10 live listings

You: Score the top 3 for my profile

Agent: [calls analyze_job_match × 3]
→ Returns match scores, gaps, and APPLY/STRETCH/SKIP for each
```

### Generate a tailored LaTeX resume

```
You: Generate a LaTeX resume for Stripe Senior Engineer, here's the JD: [paste JD]

Agent: [calls generate_latex_resume_tool]
→ Saves Parth_Bhodia_Stripe_SeniorEngineer_Resume.tex + .pdf
   to C:/Users/parth/OneDrive/Documents/resume/Stripe_SeniorEngineer/
```

### Full application pipeline

```
You: Apply to job 3891234567. Generate a cover letter first and show me.

Agent: [calls get_job_details → generate_cover_letter]
→ Shows you the cover letter

You: Looks good. Apply.

Agent: [calls apply_to_job]
→ Chromium opens, logs in, fills Easy Apply form, submits
→ Logs to applications.json with status "applied"
```

### Review your pipeline

```
You: Show me all my applications and their status

Agent: [calls get_tracked_applications]
→ Lists all jobs with applied_date, status, company, URL

You: Mark job 3891234567 as interviewing

Agent: [calls update_application_status]
→ Updates applications.json
```

### Browse existing resumes

```
You: What resumes do I already have?

Agent: [calls list_resume_library]
→ Lists Adobe_FullStack, Meta_SWE, Google_GPS_FullStack, DoorDash_Frontend, etc.
   with .tex and .pdf file status for each
```

---

## 6. Resume Library

### Location

```
C:/Users/parth/OneDrive/Documents/resume/
├── Adobe_FullStack/
│   ├── Parth_Bhodia_Adobe_FullStack_Resume.tex
│   └── Parth_Bhodia_Adobe_FullStack_Resume.pdf
├── Meta_SWE/
├── Google_GPS_FullStack/
├── Databricks_SeniorFullStack/
└── ... (one folder per role)
```

### How `generate_latex_resume_tool` works

1. Reads a reference `.tex` (default: `Adobe_FullStack`) for the template macros and style
2. Calls Claude with your full verified profile + the job description
3. Claude generates the LaTeX body — tailoring bullet emphasis and keyword density to the JD
4. The preamble (all `\usepackage`, `\newcommand` macros) is always the same Rezume template
5. Saves `Parth_Bhodia_{Company}_{Role}_Resume.tex` to a new library folder
6. Calls `pdflatex` (MiKTeX) to compile the `.pdf`

### Compile manually

If PDF compilation fails or pdflatex is not in PATH:

```bash
cd "C:/Users/parth/OneDrive/Documents/resume/Stripe_SeniorEngineer"
"C:/Users/parth/AppData/Local/Programs/MiKTeX/miktex/bin/x64/pdflatex.exe" \
  Parth_Bhodia_Stripe_SeniorEngineer_Resume.tex
```

---

## 7. Easy Apply Automation

### How it works (`easy_apply.py`)

```
LinkedInEasyApply.apply(job_id, cover_letter, resume_path)
        │
        ├─ Load cookies (linkedin_cookies.json) — skips login if still valid
        │
        ├─ Login if needed
        │   ├─ go to linkedin.com/login
        │   ├─ fill #username, #password
        │   └─ detect CAPTCHA / checkpoint → returns login_failed
        │
        ├─ Navigate to linkedin.com/jobs/view/{job_id}
        │
        ├─ Find and click "Easy Apply" button
        │   └─ if not found → returns no_easy_apply
        │
        └─ Multi-step form loop (up to 10 steps)
            ├─ Upload resume PDF (if resume_path provided)
            ├─ Fill cover letter textarea
            ├─ Fill contact fields (phone, city, zip, LinkedIn, website)
            ├─ Handle dropdowns (pick first option)
            ├─ Handle radio fieldsets (work auth → click "Yes")
            ├─ Determine next button: Next / Review / Submit
            └─ On unknown state: save screenshot → debug_screenshots/
```

### Headed browser (anti-detection)

The browser runs **visible** (`headless=False`). This:
- Avoids most LinkedIn bot detection
- Lets you see what's happening and intervene if a CAPTCHA appears
- Reuses a saved cookie session so you rarely have to log in twice

### Cookie persistence

After each successful login, cookies are saved to `linkedin_cookies.json`. On the next run, the agent checks if you're still logged in to `linkedin.com/feed` — if yes, skips login entirely.

### Required `.env` values

```env
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=yourpassword
PHONE_NUMBER=4439294371   # used to fill phone fields in the form
```

### Providing a resume PDF

Pass the absolute path to a PDF in the `resume_path` argument. The agent will upload it to the resume section of the form:

```
"Apply to job 3891234567 using resume C:/Users/parth/OneDrive/Documents/resume/Stripe_SeniorEngineer/Parth_Bhodia_Stripe_SeniorEngineer_Resume.pdf"
```

If `resume_path` is empty, LinkedIn uses the resume already on your profile.

### What happens on unknown form states

If the form has an unusual field the automation doesn't recognize, it takes a screenshot and returns `form_error`. Check `debug_screenshots/` — the screenshot shows exactly what the browser saw.

---

## 8. Application Tracker

All applications are persisted to `job-search/applications.json`.

### Status lifecycle

```
pending_apply  →  applied  →  interviewing  →  offer
                                            →  rejected
                                            →  withdrawn
```

### Stored fields

```json
{
  "job_id": "3891234567",
  "title": "Senior Full-Stack Engineer",
  "company": "Stripe",
  "url": "https://www.linkedin.com/jobs/view/3891234567",
  "status": "applied",
  "applied_date": "2026-03-27",
  "last_updated": "2026-03-27T14:30:00",
  "notes": "Easy Apply submitted successfully",
  "resume_path": "C:/Users/.../Stripe_SeniorEngineer/resume.pdf",
  "cover_letter_path": ""
}
```

### Example queries

```
"Show all my applications"
"Show only my interviewing applications"
"Mark job 3891234567 as interviewing — had a recruiter screen today"
"How many jobs have I applied to?"
```

---

## 9. Troubleshooting

### `ANTHROPIC_API_KEY` error

Ensure `.env` is at `job-search/linkedin_agent/.env` and contains no spaces:
```
ANTHROPIC_API_KEY=sk-ant-api03-...   ✓
ANTHROPIC_API_KEY = sk-ant-api03-... ✗ (spaces break it)
```

### LinkedIn scraping returns no jobs

LinkedIn rate-limits scrapers. If `search_linkedin_jobs` returns empty:
- Try broader keywords
- Try without a location filter
- Wait a few minutes and retry
- The agent falls back gracefully — all resume/cover letter tools still work

### Easy Apply — `login_failed`

- Check `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD` in `.env`
- A CAPTCHA may have appeared in the browser window — solve it manually; cookies will be saved after
- Delete `linkedin_cookies.json` and try again if cookies are stale

### Easy Apply — `no_easy_apply`

The job uses external application, not LinkedIn Easy Apply. The tool returns the direct job URL — apply manually.

### Easy Apply — `form_error`

Check `debug_screenshots/easy_apply_step{N}_{job_id}.png`. The screenshot shows the form step that wasn't recognized. Common causes:
- A custom screening question with an unusual input type
- A consent checkbox that needs to be ticked

### pdflatex not found

The `.tex` file is always saved. Compile manually:
```bash
"C:/Users/parth/AppData/Local/Programs/MiKTeX/miktex/bin/x64/pdflatex.exe" your_resume.tex
```

Or install MiKTeX: [miktex.org](https://miktex.org/download)

### Playwright not installed

```bash
pip install playwright
playwright install chromium
```

---

## 10. File Reference

| File | Purpose |
|---|---|
| `linkedin_agent/agent.py` | LangGraph graph, all 13 tool definitions, `AgentState` |
| `linkedin_agent/parth_profile.py` | Verified static profile — always-available fallback |
| `linkedin_agent/profile_fetcher.py` | Live LinkedIn profile scraping (public + API methods) |
| `linkedin_agent/real_linkedin_scraper.py` | LinkedIn job search scraper (3 methods: public/library/API) |
| `linkedin_agent/resume_library.py` | List, read, and generate `.tex` resumes in the library |
| `linkedin_agent/resume_cover_generator.py` | Plain-text resume + cover letter generation via LLM |
| `linkedin_agent/easy_apply.py` | Playwright Easy Apply browser automation |
| `linkedin_agent/application_tracker.py` | JSON-based application persistence (add/list/update) |
| `linkedin_agent/tools.py` | Extended stub tools (job match, salary research, networking) |
| `linkedin_agent/advanced_agent.py` | Multi-agent architecture (experimental) |
| `applications.json` | Auto-created — your application log |
| `linkedin_cookies.json` | Auto-created — LinkedIn session cookies |
| `debug_screenshots/` | Auto-created — Easy Apply failure screenshots |
| `langgraph.json` | LangGraph server config (graph name → entry point) |
| `.env` | Your secrets — never commit this file |
