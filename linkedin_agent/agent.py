"""
LinkedIn Job Search and Application Agent
Built with LangGraph for agentic AI workflows
"""

from pathlib import Path

from dotenv import load_dotenv

# override=True: .env wins over stale shell/env values
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

import os
from typing import Literal
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_xai import ChatXAI
from langchain_core.tools import tool

from linkedin_agent.real_linkedin_scraper import LinkedInJobScraper
from linkedin_agent.profile_fetcher import get_user_profile
from linkedin_agent.parth_profile import get_parth_profile
from linkedin_agent.resume_cover_generator import (
    generate_resume_for_job,
    generate_cover_letter_for_job,
    generate_full_application,
)
from linkedin_agent.resume_library import (
    list_resumes,
    get_resume_tex,
    generate_latex_resume,
)
from linkedin_agent import application_tracker


def _xai_api_key() -> str:
    return (os.getenv("XAI_API_KEY") or "").strip()


def _grok_model() -> str:
    # Default: fast + non-reasoning — good for tool-calling; override via GROK_MODEL (see xAI pricing page)
    return (os.getenv("GROK_MODEL") or "grok-4-1-fast-non-reasoning").strip() or "grok-4-1-fast-non-reasoning"


def _gemini_api_key() -> str:
    return (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()


def _gemini_model() -> str:
    # Default Flash-Lite: higher free-tier RPD in AI Studio; override with GEMINI_MODEL (e.g. gemini-2.5-pro)
    return (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash-lite").strip() or "gemini-2.5-flash-lite"


def _llm_backend() -> Literal["grok", "gemini"]:
    """
    LLM_PROVIDER=grok|gemini forces the provider.
    If unset: prefer Gemini when GOOGLE_API_KEY or GEMINI_API_KEY is set; else Grok if XAI_API_KEY; else Gemini.
    """
    p = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if p == "grok":
        return "grok"
    if p == "gemini":
        return "gemini"
    if _gemini_api_key():
        return "gemini"
    if _xai_api_key():
        return "grok"
    return "gemini"


def _make_grok_llm(*, max_tokens: int) -> ChatXAI:
    key = _xai_api_key()
    if not key:
        raise ValueError(
            "XAI_API_KEY is missing. Create a key at https://console.x.ai/ and add it to linkedin_agent/.env"
        )
    return ChatXAI(
        model=_grok_model(),
        temperature=0,
        max_tokens=max_tokens,
        xai_api_key=key,
    )


def _make_gemini_llm(*, max_output_tokens: int) -> ChatGoogleGenerativeAI:
    key = _gemini_api_key()
    if not key:
        raise ValueError(
            "GOOGLE_API_KEY (or GEMINI_API_KEY) is missing. "
            "https://aistudio.google.com/apikey — or use Grok: XAI_API_KEY + LLM_PROVIDER=grok"
        )
    return ChatGoogleGenerativeAI(
        model=_gemini_model(),
        temperature=0,
        max_output_tokens=max_output_tokens,
        google_api_key=key,
    )


def _make_llm(*, max_tokens: int):
    """Grok (xAI) or Gemini — see _llm_backend()."""
    if _llm_backend() == "grok":
        return _make_grok_llm(max_tokens=max_tokens)
    return _make_gemini_llm(max_output_tokens=max_tokens)


# ============================================================================
# STATE
# ============================================================================

class AgentState(MessagesState):
    job_search_params: dict
    found_jobs: list
    applied_jobs: list
    next_action: str


# ============================================================================
# PROFILE — with static fallback
# ============================================================================

_scraper = None
_user_profile = None


def get_scraper():
    global _scraper
    if _scraper is None:
        _scraper = LinkedInJobScraper()
    return _scraper


def get_cached_user_profile():
    """
    Load user profile. Priority:
    1. Cached in memory
    2. Live LinkedIn scrape (if LINKEDIN_USER_HANDLE is set)
    3. Parth's verified static profile
    """
    global _user_profile
    if _user_profile is not None:
        return _user_profile

    # Try live scrape
    live = get_user_profile()
    if live and live.get("name") and live["name"] != "Not found":
        _user_profile = live
        print(f"✅ Loaded live LinkedIn profile: {live.get('name')}")
        return _user_profile

    # Fallback to verified static profile
    _user_profile = get_parth_profile()
    print("ℹ️  Using verified static profile (LinkedIn scraping unavailable).")
    return _user_profile


# ============================================================================
# TOOLS
# ============================================================================

@tool
def search_linkedin_jobs(
    keywords: str,
    location: str = "",
    experience_level: str = "mid",
    job_type: str = "full-time",
    remote: bool = False,
    limit: int = 10,
) -> dict:
    """
    Search for real jobs on LinkedIn.

    Args:
        keywords: Job title or keywords
        location: City, state, or "remote"
        experience_level: entry | mid | senior | director | executive
        job_type: full-time | part-time | contract | temporary | internship
        remote: Filter remote-only jobs
        limit: Max results to return (default 10)
    """
    try:
        scraper = get_scraper()
        jobs = scraper.search_jobs(
            keywords=keywords,
            location=location,
            experience_level=experience_level,
            job_type=job_type,
            remote=remote,
            limit=limit,
        )
        return {
            "success": True,
            "jobs": jobs,
            "count": len(jobs),
            "search_params": {
                "keywords": keywords,
                "location": location,
                "experience_level": experience_level,
                "job_type": job_type,
                "remote": remote,
            },
            "source": "LinkedIn (live scraping)",
        }
    except Exception as e:
        return {"success": False, "error": str(e), "jobs": [], "count": 0}


@tool
def get_job_details(job_id: str) -> dict:
    """
    Get full details for a specific LinkedIn job posting.

    Args:
        job_id: LinkedIn job ID (numeric string)
    """
    try:
        scraper = get_scraper()
        details = scraper.get_job_details(job_id)
        if details:
            return {
                "success": True,
                "job_id": job_id,
                "full_description": details.get("full_description", ""),
                "criteria": details.get("criteria", {}),
                "url": details.get("url", f"https://www.linkedin.com/jobs/view/{job_id}"),
            }
        return {"success": False, "error": "Could not fetch job details", "job_id": job_id}
    except Exception as e:
        return {"success": False, "error": str(e), "job_id": job_id}


@tool
def get_my_profile() -> dict:
    """
    Show the candidate's profile (skills, experience, education) used for applications.
    Always returns data — falls back to verified static profile if LinkedIn is unavailable.
    """
    try:
        profile = get_cached_user_profile()
        if not profile:
            return {"success": False, "error": "Could not load profile."}
        return {
            "success": True,
            "profile": {
                "name": profile.get("name"),
                "headline": profile.get("headline"),
                "location": profile.get("location"),
                "about": (profile.get("about", "")[:300] + "...") if profile.get("about") else "",
                "skills": profile.get("skills", [])[:20],
                "experience_count": len(profile.get("experience", [])),
                "education_count": len(profile.get("education", [])),
                "url": profile.get("url"),
            },
            "message": "Profile loaded. This data drives all generated application materials.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def analyze_job_match(job_title: str, company: str, job_description: str) -> dict:
    """
    Score how well the candidate's profile matches a job and list missing / matching skills.

    Args:
        job_title: Title of the job
        company: Company name
        job_description: Full job description text
    """
    try:
        profile = get_cached_user_profile()
        if not profile:
            return {"success": False, "error": "Could not load profile."}

        llm = _make_llm(max_tokens=1024)
        prompt = f"""Analyze how well this candidate matches the job.

CANDIDATE PROFILE:
Name: {profile.get('name')}
Headline: {profile.get('headline')}
Skills: {', '.join(profile.get('skills', [])[:30])}
Experience:
{chr(10).join(f"- {e['title']} at {e['company']} ({e.get('duration','')})" for e in profile.get('experience', [])[:3])}

JOB: {job_title} at {company}
DESCRIPTION:
{job_description[:2000]}

Respond in this exact JSON format (no markdown, no extra text):
{{
  "match_score": 0.87,
  "matching_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1"],
  "recommendation": "APPLY | STRETCH | SKIP",
  "tailoring_tips": ["tip1", "tip2"]
}}"""

        response = llm.invoke([HumanMessage(content=prompt)])
        import json, re
        text = response.content.strip()
        # Strip markdown fences if present
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        analysis = json.loads(text)
        return {"success": True, **analysis}
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def generate_cover_letter(
    job_title: str, company_name: str, job_description: str
) -> str:
    """
    Generate a tailored cover letter using the candidate's real profile.

    Args:
        job_title: Target job title
        company_name: Target company
        job_description: Full job description text
    """
    try:
        profile = get_cached_user_profile()
        if not profile:
            return "Error: Could not load profile."
        return generate_cover_letter_for_job(
            user_profile=profile,
            job_title=job_title,
            company_name=company_name,
            job_description=job_description,
            tone="professional",
        )
    except Exception as e:
        return f"Error generating cover letter: {e}"


@tool
def generate_resume(job_description: str, format: str = "professional") -> str:
    """
    Generate a tailored plain-text resume for a job.

    Args:
        job_description: Full job description text
        format: professional | ats | technical
    """
    try:
        profile = get_cached_user_profile()
        if not profile:
            return "Error: Could not load profile."
        return generate_resume_for_job(
            user_profile=profile,
            job_description=job_description,
            format=format,
        )
    except Exception as e:
        return f"Error generating resume: {e}"


@tool
def generate_application_package(
    job_title: str,
    company_name: str,
    job_description: str,
    save_files: bool = True,
) -> dict:
    """
    Generate a complete application package (plain-text resume + cover letter) and optionally save to files.

    Args:
        job_title: Target job title
        company_name: Target company
        job_description: Full job description text
        save_files: Save materials to disk
    """
    try:
        profile = get_cached_user_profile()
        if not profile:
            return {"success": False, "error": "Could not load profile."}
        package = generate_full_application(
            user_profile=profile,
            job_title=job_title,
            company_name=company_name,
            job_description=job_description,
            save_to_files=save_files,
        )
        result = {
            "success": True,
            "candidate": package["candidate"],
            "job_title": package["job_title"],
            "company": package["company"],
            "resume": package.get("resume", ""),
            "cover_letter": package.get("cover_letter", ""),
        }
        if save_files and "saved_files" in package:
            result["saved_files"] = package["saved_files"]
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def list_resume_library() -> dict:
    """
    List all existing resumes in Parth's resume library.
    Shows folder names, available .tex and .pdf files for each role.
    """
    resumes = list_resumes()
    return {
        "success": True,
        "total": len(resumes),
        "resumes": resumes,
        "library_path": "C:/Users/parth/OneDrive/Documents/resume/",
    }


@tool
def generate_latex_resume_tool(
    company: str,
    role: str,
    job_description: str,
    reference_folder: str = "Adobe_FullStack",
    compile_pdf: bool = True,
) -> dict:
    """
    Generate a tailored LaTeX (.tex) resume for a specific job and save it to the resume library.
    Optionally compiles to PDF using pdflatex.

    This creates a properly formatted resume in Parth's Rezume template style,
    saved to C:/Users/parth/OneDrive/Documents/resume/<Company>_<Role>/.

    Args:
        company: Target company (e.g., "Stripe", "Meta")
        role: Target role (e.g., "Senior Full-Stack Engineer")
        job_description: Full job description text
        reference_folder: Existing resume to use as style reference (default: Adobe_FullStack)
        compile_pdf: Whether to compile .tex to .pdf (requires pdflatex)
    """
    try:
        result = generate_latex_resume(
            company=company,
            role=role,
            job_description=job_description,
            reference_folder=reference_folder,
            compile_pdf=compile_pdf,
        )
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def track_application(
    job_id: str,
    title: str,
    company: str,
    url: str = "",
    status: str = "applied",
    notes: str = "",
    resume_path: str = "",
) -> dict:
    """
    Save or update a job application in the local tracker.

    Args:
        job_id: Unique job ID (e.g., LinkedIn job ID or custom string)
        title: Job title
        company: Company name
        url: Job posting URL
        status: applied | interviewing | offer | rejected | withdrawn
        notes: Any notes about the application
        resume_path: Path to the resume file used
    """
    try:
        record = application_tracker.add_application(
            job_id=job_id,
            title=title,
            company=company,
            url=url,
            status=status,
            notes=notes,
            resume_path=resume_path,
        )
        return {"success": True, "application": record}
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def get_tracked_applications(status_filter: str = "") -> dict:
    """
    List all tracked job applications with their current status.

    Args:
        status_filter: Optional filter — applied | interviewing | offer | rejected | withdrawn
    """
    try:
        apps = application_tracker.get_applications(status_filter or None)
        summary = application_tracker.get_summary()
        return {
            "success": True,
            "applications": apps,
            "summary": summary,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def update_application_status(job_id: str, new_status: str, notes: str = "") -> dict:
    """
    Update the status of a tracked application.

    Args:
        job_id: The job ID of the application to update
        new_status: applied | interviewing | offer | rejected | withdrawn
        notes: Optional notes about the status change
    """
    try:
        record = application_tracker.update_status(job_id, new_status, notes)
        if record:
            return {"success": True, "application": record}
        return {"success": False, "error": f"No application found with job_id={job_id}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@tool
def apply_to_job(
    job_id: str,
    title: str = "",
    company: str = "",
    cover_letter: str = "",
    resume_path: str = "",
) -> dict:
    """
    Apply to a LinkedIn job via Easy Apply using Playwright browser automation.

    Opens a headed Chromium browser, logs in (reuses saved cookies when possible),
    navigates to the job posting, clicks Easy Apply, and fills the multi-step form
    automatically (contact info, resume upload, cover letter, work-auth questions).

    Requires in .env: LINKEDIN_EMAIL, LINKEDIN_PASSWORD, PHONE_NUMBER (optional).
    Requires: pip install playwright && playwright install chromium

    Args:
        job_id: LinkedIn numeric job ID (e.g. "3891234567")
        title: Job title — used for tracking (optional)
        company: Company name — used for tracking (optional)
        cover_letter: Cover letter text to paste into the application form
        resume_path: Absolute path to a PDF resume to upload (optional).
                     If empty, LinkedIn will use the resume already on your profile.
    """
    try:
        from linkedin_agent.easy_apply import LinkedInEasyApply
    except ImportError:
        return {
            "success": False,
            "job_id": job_id,
            "status": "playwright_not_installed",
            "message": (
                "Playwright is not installed. Run:\n"
                "  pip install playwright\n"
                "  playwright install chromium"
            ),
        }

    result = LinkedInEasyApply().apply(
        job_id=job_id,
        cover_letter=cover_letter,
        resume_path=resume_path,
    )

    # Track the outcome regardless of success/failure
    application_tracker.add_application(
        job_id=job_id,
        title=title or f"Job {job_id}",
        company=company or "Unknown",
        url=f"https://www.linkedin.com/jobs/view/{job_id}",
        status=result.get("status", "unknown"),
        notes=result.get("message", ""),
        resume_path=resume_path,
    )

    return result


# ============================================================================
# ALL TOOLS
# ============================================================================

ALL_TOOLS = [
    search_linkedin_jobs,
    get_job_details,
    get_my_profile,
    analyze_job_match,
    generate_cover_letter,
    generate_resume,
    generate_application_package,
    list_resume_library,
    generate_latex_resume_tool,
    track_application,
    get_tracked_applications,
    update_application_status,
    apply_to_job,
]


# ============================================================================
# NODES
# ============================================================================

def agent_node(state: AgentState) -> AgentState:
    """Main reasoning node — decides next action using Grok or Gemini."""
    llm = _make_llm(max_tokens=4096)
    llm_with_tools = llm.bind_tools(ALL_TOOLS)

    system_message = SystemMessage(
        content="""You are an intelligent LinkedIn job search and application assistant for Parth Bhodia.

YOUR CAPABILITIES:
1. Search real LinkedIn jobs by keywords, location, experience level, remote/on-site
2. Fetch full job details for specific postings
3. Load Parth's complete profile (always available — falls back to verified static data)
4. Analyze job match: score, matching skills, gaps, tailoring tips
5. Generate tailored plain-text resumes and cover letters
6. Generate complete application packages saved to disk
7. Generate tailored LaTeX resumes in Parth's Rezume template style, saved to his resume library
8. List existing resumes in the library (C:/Users/parth/OneDrive/Documents/resume/)
9. Track job applications locally with status (applied/interviewing/offer/rejected)
10. Update application statuses and view the full application pipeline

RESUME LIBRARY:
Parth has an existing library of tailored LaTeX resumes (Adobe, Google, Meta, DoorDash, etc.).
When asked to create a resume for a new role, use `generate_latex_resume_tool` — it saves
a properly formatted .tex file (and compiles to .pdf) in the library directory.

WORKFLOW FOR APPLICATIONS:
1. Search jobs → get_job_details for top candidates
2. analyze_job_match to score fit
3. generate_latex_resume_tool to create tailored .tex resume
4. generate_cover_letter for a personalized letter
5. track_application to log it
6. apply_to_job (Easy Apply — requires LinkedIn credentials in .env)

Always ask for confirmation before applying. Be proactive about suggesting next steps."""
    )

    response = llm_with_tools.invoke([system_message] + state["messages"])
    return {"messages": [response]}


def should_continue(state: AgentState) -> Literal["tools", "end"]:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return "end"


# ============================================================================
# GRAPH
# ============================================================================

def create_linkedin_agent() -> StateGraph:
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(ALL_TOOLS))
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
    workflow.add_edge("tools", "agent")
    return workflow.compile()


graph = create_linkedin_agent()


# ============================================================================
# LOCAL TEST
# ============================================================================

if __name__ == "__main__":
    print("LinkedIn Job Search Agent")
    print("Run `langgraph dev` and use Chat mode in LangGraph Studio for the best experience.\n")

    backend = _llm_backend()
    if backend == "grok":
        _k = _xai_api_key()
        if not _k:
            print("ERROR: XAI_API_KEY is empty. Set it in linkedin_agent/.env")
            print("  Create a key: https://console.x.ai/")
            raise SystemExit(1)
        print(f"Env: Grok (xAI) key length={len(_k)}, model={_grok_model()!r}\n")
    else:
        _k = _gemini_api_key()
        if not _k:
            print("ERROR: GOOGLE_API_KEY (or GEMINI_API_KEY) is empty. Set it in linkedin_agent/.env")
            print("  Or use Grok: set XAI_API_KEY and LLM_PROVIDER=grok")
            print("  Gemini key: https://aistudio.google.com/apikey")
            raise SystemExit(1)
        print(f"Env: Gemini, key length={len(_k)}, model={_gemini_model()!r}\n")

    try:
        result = graph.invoke(
            {
                "messages": [HumanMessage(content="Show my profile and list my existing resumes.")],
                "job_search_params": {},
                "found_jobs": [],
                "applied_jobs": [],
                "next_action": "",
            }
        )
    except Exception as exc:
        err = str(exc).lower()
        print(f"\nLLM request failed: {exc}\n")
        if backend == "grok":
            if "401" in err or "api key" in err or "unauthorized" in err:
                print("  • Check XAI_API_KEY at https://console.x.ai/\n")
        else:
            if "api key" in err or "api_key" in err or "permission" in err or "401" in err:
                print(
                    "  • Check GOOGLE_API_KEY at https://aistudio.google.com/apikey\n"
                    "  • Enable the Generative Language API for your Google Cloud project if using a Cloud key\n"
                )
            elif "quota" in err or "429" in err or "resource" in err:
                print("  • Quota may be exceeded; retry later or check Google AI Studio usage.\n")
        raise SystemExit(1) from exc

    for msg in result["messages"]:
        if isinstance(msg, AIMessage) and msg.content:
            print("Agent:", msg.content)
