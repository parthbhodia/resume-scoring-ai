"""
Resume Generator GUI — Starlette backend
Run locally:
  .venv/Scripts/python.exe resume_gui/app.py   (Windows)
  python resume_gui/app.py                      (macOS/Linux)

Deploy on Railway — LLM env (pick one primary):
  Grok-first (recommended to avoid Gemini free-tier caps):
    XAI_API_KEY=…
    LLM_PROVIDER=grok
    (optional) GROK_MODEL=grok-4-1-fast-non-reasoning
  Gemini-first:
    GOOGLE_API_KEY=…
    LLM_PROVIDER=gemini   # also use if XAI_API_KEY is set but you want Gemini primary
  Shared: LIBRARY_ROOT, ALLOWED_ORIGINS, …
  Railway auto-detects the Procfile and runs: uvicorn resume_gui.app:app --host 0.0.0.0 --port $PORT
"""

import asyncio
import io
from functools import partial
import json
import logging
import os
import re
import sys
import threading
from uuid import uuid4
from pathlib import Path
from typing import List, Optional, Tuple

import pdfplumber

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("resume_gui")

sys.path.insert(0, str(Path(__file__).parent.parent / "linkedin_agent"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "linkedin_agent" / ".env")

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, FileResponse
from starlette.routing import Route
from sse_starlette.sse import EventSourceResponse

import uvicorn

from resume_library import (
    list_resumes,
    stream_latex_resume,
    extract_jd_from_url,
    get_resume_tex,
    parse_resume_tex,
    splice_bullets_into_tex,
    recompile_resume_from_tex,
    ai_rewrite_bullet,
    ai_generate_skills,
    ats_check,
    doctor_check_resume,
    primary_gemini_flash_model,
    primary_llm_model_for_resume_workloads,
    grok_preferred_for_throughput,
    run_tailor_research_job_context,
    coach_suggestions_llm,
    _get_resume_tex_for_user,
)
try:
    from resume_gui.renderers.latex_renderer import JinjaLatexRenderer, ResumeDocModel, ExperienceItem, normalize_skill_items
except ImportError:
    from renderers.latex_renderer import JinjaLatexRenderer, ResumeDocModel, ExperienceItem, normalize_skill_items  # type: ignore
try:
    from resume_gui.profile_parser import parse_profile_text
except ImportError:
    from profile_parser import parse_profile_text  # type: ignore

# Storage helper — works whether run as `uvicorn resume_gui.app:app` (Railway) or
# `python resume_gui/app.py` (local dev).
try:
    from resume_gui.storage import upload_pdf, upload_tex, download_tex, download_pdf, save_version, list_versions, load_version, download_json, storage_status
except ImportError:
    from storage import upload_pdf, upload_tex, download_tex, download_pdf, save_version, list_versions, load_version, download_json, storage_status  # type: ignore

# ── Config (env-var driven for Railway) ──────────────────────────────────────
LIBRARY_ROOT    = os.environ.get("LIBRARY_ROOT", str(Path(__file__).parent.parent / "resumes"))
HTML_FILE       = Path(__file__).parent / "index.html"
PORT            = int(os.environ.get("PORT", 8765))
USE_JINJA_LATEX_RENDERER = os.environ.get("USE_JINJA_LATEX_RENDERER", "true").strip().lower() in {"1", "true", "yes", "on"}
ENABLE_JD_URL_EXTRACT = os.environ.get("ENABLE_JD_URL_EXTRACT", "false").strip().lower() in {"1", "true", "yes", "on"}


def _parse_entry_header(header: str) -> Tuple[str, str, str, str]:
    parts = [p.strip() for p in (header or "").split("|") if p.strip()]
    if not parts:
        return "", "", "", ""
    if len(parts) == 1:
        return "", parts[0], "", ""
    if len(parts) == 2:
        return parts[0], parts[1], "", ""
    if len(parts) == 3:
        return parts[0], parts[1], "", parts[2]
    return parts[0], parts[1], parts[2], " | ".join(parts[3:])


def _clean_model_text(value: str) -> str:
    t = (value or "").strip()
    if not t:
        return ""
    # Remove Markdown emphasis markers that leak from parser output.
    t = t.replace("**", "")
    # Remove common LaTeX control sequences while preserving plain words.
    t = re.sub(r"\\(?:begin|end)\{[^}]*\}", " ", t)
    t = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?", " ", t)
    t = t.replace("{", " ").replace("}", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


_STRUCTURAL_NOISE_PATTERNS = (
    r"^leftmargin\s*=",
    r"^label\s*=",
    r"^textbackslash$",
    r"^begin\s+itemize$",
    r"^end\s+itemize$",
    r"^item$",
    r"^\\item$",
    r"^\\textbackslash$",
)

_SECTION_HEADING_LINES = {
    "candidate",
    "summary",
    "technical skills",
    "skills",
    "experience",
    "work experience",
    "professional experience",
    "education",
    "github",
    "linkedin",
}


def _is_structural_noise_line(value: str) -> bool:
    t = _clean_model_text(value)
    if not t:
        return True
    low = t.lower().strip(" :-")
    if low in _SECTION_HEADING_LINES:
        return True
    for pat in _STRUCTURAL_NOISE_PATTERNS:
        if re.match(pat, low):
            return True
    return False


def _resume_doc_from_parsed(parsed: dict) -> ResumeDocModel:
    contact = parsed.get("contact") or {}
    sections = parsed.get("sections") or []

    doc = ResumeDocModel(
        full_name=str(contact.get("name") or "Candidate").strip() or "Candidate",
        headline="",
        location=str(contact.get("location") or "").strip(),
        email=str(contact.get("email") or "").strip(),
        phone=str(contact.get("phone") or "").strip(),
        linkedin=str(contact.get("linkedinUrl") or contact.get("linkedin") or "").strip(),
        github=str(contact.get("githubUrl") or contact.get("github") or "").strip(),
        summary="",
        skills=[],
        experience=[],
    )

    for sec in sections:
        sec_name = str(sec.get("name") or "").strip().lower()
        entries = sec.get("entries") or []

        if "summary" in sec_name or "profile" in sec_name:
            for ent in entries:
                bullets = ent.get("bullets") or []
                if bullets:
                    cleaned_lines = []
                    for b in bullets:
                        line = _clean_model_text(str(b.get("text") or ""))
                        if not line or _is_structural_noise_line(line):
                            continue
                        cleaned_lines.append(line)
                    doc.summary = " ".join(cleaned_lines)
                    break
            continue

        if "skill" in sec_name:
            for ent in entries:
                for b in ent.get("bullets") or []:
                    line = _clean_model_text(str(b.get("text") or ""))
                    if not line or _is_structural_noise_line(line):
                        continue
                    if ":" in line:
                        label, rest = line.split(":", 1)
                        if _is_structural_noise_line(label):
                            label = "Skills"
                        items = [x.strip() for x in rest.split(",") if x.strip()]
                        items = [x for x in items if not _is_structural_noise_line(x)]
                        clean_label = _clean_model_text(label)
                        if not clean_label:
                            clean_label = "Skills"
                        normalized = normalize_skill_items(items)
                        if normalized:
                            doc.skills.append((clean_label, normalized))
                    else:
                        normalized = normalize_skill_items([line])
                        if normalized:
                            doc.skills.append(("Skills", normalized))
            continue

        if "experience" in sec_name or "work" in sec_name:
            for ent in entries:
                role, company, location, dates = _parse_entry_header(str(ent.get("header") or ""))
                bullets = [
                    _clean_model_text(str(b.get("text") or ""))
                    for b in (ent.get("bullets") or [])
                    if _clean_model_text(str(b.get("text") or ""))
                ]
                bullets = [b for b in bullets if not _is_structural_noise_line(b)]
                if not company and not role and not bullets:
                    continue
                doc.experience.append(
                    ExperienceItem(
                        company=company or "Experience",
                        role=role,
                        location=location,
                        dates=dates,
                        bullets=bullets,
                    )
                )

    # Consolidate duplicated skill labels/items from noisy model output.
    merged_skills: list[tuple[str, list[str]]] = []
    skill_index: dict[str, int] = {}
    for label, items in doc.skills:
        clean_label = _clean_model_text(label) or "Skills"
        key = clean_label.lower()
        if key not in skill_index:
            skill_index[key] = len(merged_skills)
            merged_skills.append((clean_label, []))
        idx = skill_index[key]
        existing = merged_skills[idx][1]
        seen = {x.lower() for x in existing}
        for item in items:
            item_clean = _clean_model_text(item)
            if not item_clean or _is_structural_noise_line(item_clean):
                continue
            lk = item_clean.lower()
            if lk not in seen:
                existing.append(item_clean)
                seen.add(lk)
    doc.skills = [(label, items) for label, items in merged_skills if items]

    cleaned_exp: list[ExperienceItem] = []
    for exp in doc.experience:
        company = _clean_model_text(exp.company)
        role = _clean_model_text(exp.role)
        bullets = [b for b in exp.bullets if b and not _is_structural_noise_line(b)]
        if not bullets and not role and company.lower() in {"", "experience"}:
            continue
        cleaned_exp.append(
            ExperienceItem(
                company=company or "Experience",
                role=role,
                location=_clean_model_text(exp.location),
                dates=_clean_model_text(exp.dates),
                bullets=bullets,
            )
        )
    doc.experience = cleaned_exp

    return doc


def _apply_accepted_edits_to_doc(doc: ResumeDocModel, accepted_suggestions: Optional[list]) -> None:
    if not isinstance(accepted_suggestions, list):
        return

    for item in accepted_suggestions:
        if not isinstance(item, dict):
            continue
        original = str(item.get("original") or "").strip()
        suggested = str(item.get("suggested") or "").strip()
        if not original:
            continue

        replaced = False

        if doc.summary and original in doc.summary:
            doc.summary = doc.summary.replace(original, suggested).strip()
            replaced = True

        for idx, (label, items) in enumerate(doc.skills):
            next_items = []
            changed = False
            for it in items:
                if original in it:
                    if suggested:
                        next_items.append(it.replace(original, suggested).strip())
                    changed = True
                    replaced = True
                else:
                    next_items.append(it)
            if changed:
                doc.skills[idx] = (label, [x for x in next_items if x])

        for exp in doc.experience:
            next_bullets = []
            changed = False
            for b in exp.bullets:
                if original in b:
                    if suggested:
                        next_bullets.append(b.replace(original, suggested).strip())
                    changed = True
                    replaced = True
                else:
                    next_bullets.append(b)
            if changed:
                exp.bullets = [x for x in next_bullets if x]

        if not replaced and suggested:
            if doc.summary:
                doc.summary = suggested
            else:
                doc.summary = suggested


def _structured_ratings_from_ats(ats: dict) -> dict:
    checks = ats.get("checks") if isinstance(ats, dict) else []
    jd_match = ats.get("jdMatch") if isinstance(ats, dict) else {}
    criteria = []
    for chk in (checks or [])[:8]:
        name = str(chk.get("name") or "").strip()
        if not name:
            continue
        passed = bool(chk.get("pass"))
        criteria.append({
            "name": name,
            "weight": "Medium",
            "score": 10 if passed else 4,
            "notes": str(chk.get("detail") or "").strip(),
        })

    whats_working = []
    gaps = []
    for chk in (checks or []):
        name = str(chk.get("name") or "").strip()
        detail = str(chk.get("detail") or "").strip()
        if not name:
            continue
        msg = f"{name}: {detail}" if detail else name
        if chk.get("pass"):
            if len(whats_working) < 5:
                whats_working.append(msg)
        else:
            if len(gaps) < 5:
                gaps.append(msg)

    for sk in (jd_match.get("missingRequiredSkills") or [])[:4]:
        gaps.append(f"Missing required skill signal: {sk}")

    score = ats.get("score") if isinstance(ats, dict) else None
    if score is None:
        score = jd_match.get("matchScore") if isinstance(jd_match, dict) else 0
    try:
        match_score = int(score)
    except Exception:
        match_score = 0

    verdict = "Strong alignment overall." if match_score >= 75 else (
        "Moderate alignment; address top gaps for better fit." if match_score >= 55 else
        "Low alignment right now; prioritize required skills and JD phrasing improvements."
    )

    return {
        "match_score": match_score,
        "criteria": criteria,
        "whats_working": whats_working,
        "gaps": gaps,
        "verdict": verdict,
    }


def _template_name_for_reference(reference_folder: Optional[str]) -> str:
    rf = (reference_folder or "").strip().lower()
    if rf == "harshibar_template1":
        return "classic_resume.tex.j2"
    if rf == "adobe_fullstack":
        return "classic_resume.tex.j2"
    if rf == "maltacv_modern":
        return "classic_resume.tex.j2"
    return "classic_resume.tex.j2"


def _supabase_template_is_jinja(tex_body: Optional[str]) -> bool:
    t = (tex_body or "").strip()
    if not t:
        return False
    return "{{ doc." in t or "{%" in t


def _create_structured_output_folder(base_folder: Optional[str], reference_folder: Optional[str], role: str, company: str) -> Tuple[str, str]:
    ref_name = (reference_folder or "").strip()
    base_name = (base_folder or "").strip()

    # Never chain from prior generated artifacts like *_structured_<id>.
    # Prefer canonical template key from reference_folder.
    source_name = ref_name
    if not source_name and base_name and "_structured_" not in base_name:
        source_name = base_name
    if not source_name:
        rc = f"{role}_{company}".strip("_") or "structured"
        source_name = re.sub(r"[^A-Za-z0-9_.-]+", "", rc) or "structured"

    new_folder = f"{source_name}_structured_{uuid4().hex[:8]}"
    dst = Path(LIBRARY_ROOT) / new_folder
    dst.mkdir(parents=True, exist_ok=True)

    tex_files = [p for p in dst.iterdir() if p.suffix == ".tex"]
    if not tex_files:
        fallback = dst / "resume.tex"
        fallback.write_text("", encoding="utf-8")
        tex_files = [fallback]
    return new_folder, str(tex_files[0])


def _load_tex_from_candidate(folder: str, user_id: Optional[str]) -> Optional[str]:
    name = (folder or "").strip()
    if not name:
        return None
    tex = _get_resume_tex_for_user(name, user_id)
    if tex:
        return tex
    return get_resume_tex(name)


def _resolve_structured_source_folder(base_folder: Optional[str], reference_folder: Optional[str], user_id: Optional[str]) -> Tuple[str, str]:
    _ = user_id  # Structured template resolution is Supabase-driven.
    candidates: List[str] = []
    base_name = (base_folder or "").strip()
    if base_name and "_structured_" not in base_name:
        candidates.append(base_name)
    if (reference_folder or "").strip() and (reference_folder or "").strip() not in candidates:
        candidates.append((reference_folder or "").strip())
    for fallback in ("Adobe_FullStack", "Harshibar_Template1", "MaltaCV_Modern"):
        if fallback not in candidates:
            candidates.append(fallback)

    for c in candidates:
        # Canonical source: Supabase `resume_templates`.
        tex_from_template = _load_template_tex_from_supabase(c)
        if tex_from_template:
            return c, tex_from_template

    raise RuntimeError(
        "Could not load template TeX from Supabase table `resume_templates` for folders: "
        + ", ".join(candidates)
        + ". Ensure rows exist with {reference_folder, tex_body, active=true}."
    )


def _resume_doc_from_profile_text(candidate_profile: Optional[str], role: str, company: str) -> ResumeDocModel:
    parsed = parse_profile_text(candidate_profile)
    full_name = _clean_model_text(parsed.full_name or "Candidate") or "Candidate"
    summary = _clean_model_text(parsed.summary or "")
    bullets = [_clean_model_text(b) for b in (parsed.experience_bullets or []) if _clean_model_text(b)]
    skills = []
    for ln in parsed.skills_lines or []:
        clean = _clean_model_text(ln)
        if not clean or _is_structural_noise_line(clean):
            continue
        if ":" in clean:
            label, rest = clean.split(":", 1)
            items = [x.strip() for x in rest.split(",") if x.strip()]
            if items:
                skills.append((_clean_model_text(label) or "Skills", normalize_skill_items(items)))
        else:
            skills.append(("Skills", normalize_skill_items([clean])))

    extra_bullets: list[str] = []
    for p in parsed.projects_bullets or []:
        cp = _clean_model_text(p)
        if cp:
            extra_bullets.append(f"Project: {cp}")
    for e in parsed.education_lines or []:
        ce = _clean_model_text(e)
        if ce:
            extra_bullets.append(f"Education: {ce}")

    merged_bullets = bullets + extra_bullets
    return ResumeDocModel(
        full_name=full_name,
        headline=_clean_model_text(parsed.headline or role or ""),
        location=_clean_model_text(parsed.location or ""),
        email=_clean_model_text(parsed.email or ""),
        phone=_clean_model_text(parsed.phone or ""),
        linkedin=_clean_model_text(parsed.linkedin or ""),
        github=_clean_model_text(parsed.github or ""),
        summary=summary,
        skills=skills,
        experience=[
            ExperienceItem(
                company=company or "Experience",
                role=role or "Role",
                dates="",
                location="",
                bullets=merged_bullets,
            )
        ],
    )

# CORS: allow localhost dev + deployed frontend
_raw_origins    = os.environ.get(
    "ALLOWED_ORIGINS",
    ",".join([
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:8765",
        "https://www.resunova.io",
        "https://resunova.io",
    ]),
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


async def homepage(request: Request):
    return HTMLResponse(HTML_FILE.read_text(encoding="utf-8"))


async def api_resumes(request: Request):
    user_id = (request.query_params.get("user_id") or "").strip()

    # 1. Try the Supabase `resumes` *table* first — this is the authoritative source
    #    and is properly scoped to the authenticated user.
    if user_id:
        supabase = _supabase_client()
        if supabase:
            try:
                rows = (
                    supabase.table("resumes")
                    .select("folder, company, role, score, pdf_url, created_at, job_description")
                    .eq("user_id", user_id)
                    .order("created_at", desc=True)
                    .execute()
                    .data or []
                )
                if rows:
                    logger.info(f"GET /api/resumes  |  {len(rows)} DB rows  user={user_id}")
                    return JSONResponse(rows)
            except Exception as exc:
                logger.warning(f"api_resumes: DB query failed: {exc}")

    # 2. Fall back to local disk (dev mode only — never exposes other users' data
    #    because local resumes have no user_id concept).
    resumes = list_resumes()
    logger.info(f"GET /api/resumes  |  {len(resumes)} local entries  user={user_id or 'anon'}")
    return JSONResponse(resumes)


async def api_generate_stream(request: Request):
    """SSE endpoint — streams events as the resume is generated."""
    try:
        body = await request.json()
    except json.JSONDecodeError:
        async def err_gen():
            yield {
                "data": json.dumps({
                    "event": "error",
                    "msg": "Invalid JSON body. Send strict JSON with double-quoted property names.",
                })
            }
        return EventSourceResponse(err_gen())

    if not isinstance(body, dict):
        async def err_gen():
            yield {
                "data": json.dumps({
                    "event": "error",
                    "msg": "Invalid request body. Expected a JSON object.",
                })
            }
        return EventSourceResponse(err_gen())

    company           = (body.get("company") or "").strip()
    role              = (body.get("role") or "").strip()
    jd                = (body.get("job_description") or "").strip()
    model = primary_llm_model_for_resume_workloads((body.get("model") or "").strip() or None)
    base_folder       = (body.get("base_folder") or "").strip() or None
    reference_folder  = (body.get("reference_folder") or "").strip() or None
    candidate_profile = (body.get("candidate_profile") or "").strip() or None
    user_id           = (body.get("user_id") or "").strip() or "local"
    layout_compile    = bool(body.get("layout_compile"))
    accepted_suggestions = body.get("accepted_suggestions")
    suggest_research_digest = (body.get("suggest_research_digest") or "").strip() or None
    post_suggestion_coach_run = bool(body.get("post_suggestion_coach_run"))
    _tb = body.get("tailor_body_with_ai")
    tailor_body_with_ai = True if _tb is None else bool(_tb)
    use_jinja_renderer = True

    logger.info(
        f"STREAM  |  {role} @ {company}  |  model={model}  |  base={base_folder}  "
        f"|  reference_folder={reference_folder}  "
        f"|  custom_profile={bool(candidate_profile)}  |  layout_compile={layout_compile}  "
        f"|  user={user_id or 'anon'}  |  accepted_suggestions={len(accepted_suggestions) if isinstance(accepted_suggestions, list) else 0}"
        f"  |  reuse_suggest_digest={bool(suggest_research_digest)}"
        f"  |  post_suggestion_coach_run={post_suggestion_coach_run}"
        f"  |  tailor_body_with_ai={tailor_body_with_ai}"
        f"  |  use_jinja_renderer={use_jinja_renderer}"
    )

    if not company or not role or not jd:
        async def err_gen():
            yield {"data": json.dumps({"event": "error", "msg": "company, role, and job_description required"})}
        return EventSourceResponse(err_gen())

    loop  = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def run_sync():
        # Track local file paths from the "saved" event so we can upload to
        # Supabase Storage when the matching "pdf" event fires.
        saved_folder: Optional[str] = None
        saved_tex_path: Optional[str] = None
        # "local" = anonymous / no Supabase user — do not write under that prefix in Storage.
        storage_user = user_id if user_id and user_id != "local" else ""

        if use_jinja_renderer:
            try:
                source_folder = (base_folder or "").strip() or (reference_folder or "").strip() or "structured"
                base_tex: Optional[str] = None
                try:
                    _sf, _tex = _resolve_structured_source_folder(base_folder, reference_folder, user_id)
                    source_folder, base_tex = _sf, _tex
                except Exception:
                    base_tex = None

                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "status",
                    "msg": f"Structured renderer: loading source ({source_folder})…",
                }), loop).result()

                # Prefer candidate_profile content when provided.
                # The selected template controls layout; profile text should control content.
                if candidate_profile:
                    doc = _resume_doc_from_profile_text(candidate_profile, role, company)
                elif base_tex:
                    parsed = parse_resume_tex(base_tex)
                    doc = _resume_doc_from_parsed(parsed)
                else:
                    doc = _resume_doc_from_profile_text(candidate_profile, role, company)
                _apply_accepted_edits_to_doc(doc, accepted_suggestions if isinstance(accepted_suggestions, list) else None)

                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "status",
                    "msg": "Structured renderer: generating deterministic LaTeX…",
                }), loop).result()

                renderer = JinjaLatexRenderer()
                template_name = _template_name_for_reference(source_folder or reference_folder)
                # Dynamic template selection:
                # 1) If Supabase template is Jinja-shaped, render directly from DB body.
                # 2) Otherwise render with file-based template selected by reference key.
                if _supabase_template_is_jinja(base_tex):
                    new_tex = renderer.render_from_string(doc, base_tex or "")
                    asyncio.run_coroutine_threadsafe(queue.put({
                        "event": "status",
                        "msg": f"Structured renderer: using Supabase Jinja template ({source_folder})…",
                    }), loop).result()
                else:
                    new_tex = renderer.render(doc, template_name=template_name)
                    asyncio.run_coroutine_threadsafe(queue.put({
                        "event": "status",
                        "msg": f"Structured renderer: using file template ({template_name})…",
                    }), loop).result()

                out_folder, _ = _create_structured_output_folder(base_folder, reference_folder, role, company)
                compiled = recompile_resume_from_tex(out_folder, new_tex)
                tex_path = compiled.get("tex_path")
                pdf_path = compiled.get("pdf_path")
                filename = Path(tex_path).name if tex_path else "resume.tex"

                saved_event = {
                    "event": "saved",
                    "folder": out_folder,
                    "tex_path": tex_path,
                }

                # mirror storage upload handling for .tex
                saved_folder = saved_event.get("folder")
                saved_tex_path = saved_event.get("tex_path")
                if storage_user and saved_folder and saved_tex_path:
                    try:
                        tex_url = upload_tex(storage_user, saved_folder, saved_tex_path)
                        if tex_url:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": True,
                                "url": tex_url,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_tex failed: {exc}")

                asyncio.run_coroutine_threadsafe(queue.put(saved_event), loop).result()

                if not compiled.get("compiled"):
                    raise RuntimeError(compiled.get("compile_error") or "Structured renderer compile failed")

                rel_pdf = f"/pdf/{out_folder}/{Path(pdf_path).name}" if pdf_path else None
                pdf_event = {"event": "pdf", "url": rel_pdf}

                if storage_user and saved_folder and pdf_path:
                    try:
                        public = upload_pdf(storage_user, saved_folder, pdf_path)
                        if public and public.startswith(("http://", "https://")):
                            pdf_event = {"event": "pdf", "url": public}
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": True,
                                "url": public,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_pdf failed: {exc}")

                # Frontend/library contract + ATS/JD scoring.
                parsed_for_analysis = parse_resume_tex(new_tex)
                ats = ats_check(
                    out_folder,
                    jd,
                    storage_user or user_id,
                    target_role=role,
                    parsed=parsed_for_analysis,
                )
                ratings_payload = _structured_ratings_from_ats(ats)

                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "base",
                    "folder": source_folder,
                    "loaded": True,
                }), loop).result()

                diff_data = []
                if isinstance(accepted_suggestions, list):
                    for item in accepted_suggestions:
                        if not isinstance(item, dict):
                            continue
                        orig = str(item.get("original") or "").strip()
                        sugg = str(item.get("suggested") or "").strip()
                        if orig or sugg:
                            diff_data.append({"original": orig, "suggested": sugg})
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "diff",
                    "data": diff_data,
                    "adds": len([d for d in diff_data if d.get("suggested")]),
                    "removes": len([d for d in diff_data if d.get("original") and not d.get("suggested")]),
                }), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "rationales",
                    "data": ratings_payload.get("gaps", [])[:4],
                }), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "ratings",
                    "data": ratings_payload,
                }), loop).result()

                asyncio.run_coroutine_threadsafe(queue.put(pdf_event), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put({"event": "done"}), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()
                return
            except Exception as exc:
                logger.exception("structured renderer failed")
                asyncio.run_coroutine_threadsafe(queue.put({
                    "event": "error",
                    "msg": f"Structured renderer failed: {exc}",
                }), loop).result()
                asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()
                return

        for event in stream_latex_resume(
            company, role, jd,
            reference_folder=reference_folder,
            model=model, base_folder=base_folder, candidate_profile=candidate_profile, user_id=user_id,
            layout_compile=layout_compile,
            accepted_suggestions=accepted_suggestions if isinstance(accepted_suggestions, list) else None,
            pre_research_digest=suggest_research_digest,
            post_suggestion_coach_run=post_suggestion_coach_run,
            tailor_body_with_ai=tailor_body_with_ai,
        ):
            ev_name = event.get("event")

            if ev_name == "saved":
                saved_folder   = event.get("folder")
                saved_tex_path = event.get("tex_path")
                # Upload the .tex source straight away — even if pdflatex fails
                # later, we still want the source preserved for diff/use-as-base.
                if storage_user and saved_folder and saved_tex_path:
                    try:
                        tex_url = upload_tex(storage_user, saved_folder, saved_tex_path)
                        if tex_url:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": True,
                                "url": tex_url,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "tex",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_tex failed: {exc}")
                        asyncio.run_coroutine_threadsafe(queue.put({
                            "event": "storage",
                            "artifact": "tex",
                            "stored": False,
                            "reason": str(exc),
                        }), loop).result()

            elif ev_name == "pdf" and storage_user and saved_folder:
                # The library emits a relative URL like "/pdf/<folder>/<file>.pdf".
                # Resolve the local file path, push to Supabase Storage, and
                # rewrite the event so the frontend gets a durable absolute URL.
                rel_url  = event.get("url") or ""
                filename = rel_url.rsplit("/", 1)[-1] if rel_url else None
                if filename:
                    pdf_path = os.path.join(LIBRARY_ROOT, saved_folder, filename)
                    try:
                        public = upload_pdf(storage_user, saved_folder, pdf_path)
                        if public and public.startswith(("http://", "https://")):
                            event = {**event, "url": public}
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": True,
                                "url": public,
                            }), loop).result()
                        else:
                            asyncio.run_coroutine_threadsafe(queue.put({
                                "event": "storage",
                                "artifact": "pdf",
                                "stored": False,
                                "reason": storage_status().get("reason") or "Supabase upload returned no public URL",
                            }), loop).result()
                    except Exception as exc:
                        logger.warning(f"upload_pdf failed: {exc}")
                        asyncio.run_coroutine_threadsafe(queue.put({
                            "event": "storage",
                            "artifact": "pdf",
                            "stored": False,
                            "reason": str(exc),
                        }), loop).result()

            asyncio.run_coroutine_threadsafe(queue.put(event), loop).result()
        asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

    threading.Thread(target=run_sync, daemon=True).start()

    async def event_gen():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield {"data": json.dumps(item)}

    return EventSourceResponse(event_gen())


async def api_upload_resume(request: Request):
    """Extract plain text from an uploaded PDF resume."""
    try:
        form    = await request.form()
        file    = form.get("file")
        if file is None:
            return JSONResponse({"error": "No file uploaded"}, status_code=400)
        content = await file.read()
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
        text = "\n".join(pages_text).strip()
        if not text:
            return JSONResponse({"error": "Could not extract text from PDF"}, status_code=422)
        logger.info(f"PDF upload  |  {len(text)} chars extracted from {getattr(file, 'filename', 'upload.pdf')}")
        return JSONResponse({"text": text})
    except Exception as exc:
        logger.exception("PDF upload failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_extract_jd(request: Request):
    """Fetch a job posting URL and extract structured {company, role, location, job_description}."""
    if not ENABLE_JD_URL_EXTRACT:
        return JSONResponse(
            {
                "error": "JD URL extraction is temporarily disabled.",
                "code": "feature_disabled",
            },
            status_code=503,
        )
    try:
        body = await request.json()
        url  = (body.get("url") or "").strip()
        if not url:
            return JSONResponse({"error": "url required"}, status_code=400)
        logger.info(f"EXTRACT-JD  |  {url}")
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, extract_jd_from_url, url)
        return JSONResponse(data)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=422)
    except Exception as exc:
        logger.exception("extract-jd failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_resume_parsed(request: Request):
    """GET /api/resume/{folder} — return parsed bullet tree for the editor.

    Source-of-truth resolution:
      1. Local filesystem (Railway has the freshly-generated copy in /tmp).
      2. Supabase Storage (covers re-deploys / cross-machine reads).
    """
    folder  = request.path_params["folder"]
    user_id = (request.query_params.get("user_id") or "").strip()
    if user_id == "local":
        user_id = ""
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    tex = get_resume_tex(folder)
    if tex is None and user_id:
        tex = download_tex(user_id, folder)
    if tex is None:
        return JSONResponse({"error": "resume not found"}, status_code=404)

    try:
        parsed = parse_resume_tex(tex)
    except Exception as exc:
        logger.exception("parse_resume_tex failed")
        return JSONResponse({"error": f"parse failed: {exc}"}, status_code=500)
    return JSONResponse(parsed)


async def api_resume_save(request: Request):
    """POST /api/resume/{folder} — accept edited tree, splice bullets into the
    original .tex, re-run pdflatex, push refreshed PDF to Supabase Storage,
    and return the new public URL."""
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    user_id = (body.get("user_id") or "").strip() or "local"
    storage_user = user_id if user_id != "local" else ""
    parsed  = body.get("parsed") or {}
    if not isinstance(parsed, dict) or "sections" not in parsed:
        return JSONResponse({"error": "missing parsed.sections"}, status_code=400)

    # Source .tex — same fallback chain as the GET endpoint.
    raw_tex = parsed.get("rawTex") or get_resume_tex(folder)
    if not raw_tex and storage_user:
        raw_tex = download_tex(storage_user, folder)
    if not raw_tex:
        return JSONResponse({"error": "source .tex not found"}, status_code=404)

    new_tex = splice_bullets_into_tex(raw_tex, parsed)

    loop   = asyncio.get_event_loop()
    layout = parsed.get("pdfLayout") if isinstance(parsed, dict) else None
    result = await loop.run_in_executor(None, recompile_resume_from_tex, folder, new_tex, layout)

    if not result.get("compiled"):
        return JSONResponse({
            "error":          "recompile failed",
            "compile_error":  result.get("compile_error"),
        }, status_code=500)

    # Refresh both artifacts in Supabase so the Download button picks up the
    # new PDF and future GET /api/resume/{folder} reads see the new bullets.
    pdf_url: Optional[str] = None
    try:
        if storage_user and result.get("pdf_path"):
            pdf_url = upload_pdf(storage_user, folder, result["pdf_path"])
    except Exception as exc:
        logger.warning(f"upload_pdf (post-edit) failed: {exc}")
    try:
        if storage_user and result.get("tex_path"):
            upload_tex(storage_user, folder, result["tex_path"])
    except Exception as exc:
        logger.warning(f"upload_tex (post-edit) failed: {exc}")

    return JSONResponse({
        "folder":   folder,
        "pdf_url":  pdf_url,
        "tex_path": result.get("tex_path"),
    })


async def api_ai_edit_bullet(request: Request):
    """POST /api/ai-edit-bullet — single bullet AI rewrite for the editor."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    bullet_text = (body.get("bullet_text") or "").strip()
    instruction = (body.get("instruction") or "").strip()
    jd_snippet  = (body.get("jd") or "").strip()
    if not bullet_text:
        return JSONResponse({"error": "bullet_text required"}, status_code=400)

    loop = asyncio.get_event_loop()
    try:
        new_text = await loop.run_in_executor(
            None, ai_rewrite_bullet, bullet_text, instruction, jd_snippet,
        )
    except Exception as exc:
        logger.exception("ai_rewrite_bullet failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"text": new_text})


async def api_generate_skills(request: Request):
    """POST /api/generate-skills — generate a list of skills for a job role.

    Body: {"role": "Software Engineer", "existing_skills": ["Python", ...]}
    Returns: {"skills": ["Skill 1", "Skill 2", ...]}
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    role = (body.get("role") or "").strip()
    if not role:
        return JSONResponse({"error": "role required"}, status_code=400)
    existing = body.get("existing_skills") or []
    if not isinstance(existing, list):
        existing = []

    loop = asyncio.get_event_loop()
    try:
        skills = await loop.run_in_executor(None, ai_generate_skills, role, existing)
    except Exception as exc:
        logger.exception("ai_generate_skills failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"skills": skills})


async def api_ats_check(request: Request):
    """POST /api/ats-check/{folder} — ATS + JD alignment on the compiled PDF.

    Body JSON: ``jd`` (optional), ``user_id`` (**required** — authenticated Supabase user; rejects ``local`` or empty),
      ``target_role`` / ``role``, optional ``parsed`` sections for bullet metrics.

    Runs pdfplumber extraction and rule-based alignment in a thread-pool executor.
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}
    jd      = (body.get("jd") or "").strip()
    user_id = (body.get("user_id") or "").strip()
    if not user_id or user_id == "local":
        return JSONResponse({"error": "authentication required"}, status_code=401)
    target_role = (body.get("target_role") or body.get("role") or "").strip()
    parsed = body.get("parsed") if isinstance(body.get("parsed"), dict) else None

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(ats_check, folder, jd, user_id, None, target_role=target_role, parsed=parsed),
        )
    except FileNotFoundError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        logger.exception("ats_check failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse(result)


async def api_doctor_check(request: Request):
    """POST /api/doctor-check — analyze a parsed resume tree for writing-quality
    issues (passive voice, weak verbs, missing metrics, ...). Pure regex-based,
    runs synchronously, no LLM cost.

    Body: {"parsed": ParsedResume}
    Returns: {"issues": {bullet_id: [issue, ...]}, "total": int}
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)
    parsed = body.get("parsed")
    if not isinstance(parsed, dict):
        return JSONResponse({"error": "parsed required"}, status_code=400)

    try:
        issues = doctor_check_resume(parsed)
    except Exception as exc:
        logger.exception("doctor_check_resume failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    total = sum(len(v) for v in issues.values())
    return JSONResponse({"issues": issues, "total": total})


def _analysis_section_scores(parsed: dict, issues: dict) -> list:
    sections = parsed.get("sections") or []
    out = []
    for sec in sections:
        name = (sec.get("name") or "Section").strip()
        bullets = []
        for e in sec.get("entries", []):
            bullets.extend(e.get("bullets", []))
        warn = 0
        info = 0
        for b in bullets:
            bid = b.get("id")
            for it in (issues.get(bid) or []):
                if it.get("severity") == "warn":
                    warn += 1
                else:
                    info += 1
        score = max(1, min(10, round(9 - warn * 1.1 - info * 0.4)))
        summary = (
            "Strong section with clear, ATS-friendly wording."
            if warn == 0 and info <= 1 else
            "Good structure, but tighten phrasing and add concrete impact in a few bullets."
            if warn <= 2 else
            "Needs cleanup: too many weak or ambiguous bullets may hurt recruiter confidence."
        )
        out.append({"name": name, "score": score, "summary": summary, "warn": warn, "info": info})
    return out


def _analysis_tips(ats: dict, sections: list, issues: dict) -> tuple[list, dict]:
    tips = []
    checks = ats.get("checks") or []
    for c in checks:
        if c.get("pass"):
            continue
        sev = "critical"
        if c.get("id") in {"word_count", "page_count", "single_column"}:
            sev = "urgent"
        tips.append({
            "severity": sev,
            "title": c.get("name") or "Fix ATS issue",
            "detail": c.get("detail") or "",
        })

    missing = [k for k in (ats.get("keywords") or []) if k.get("status") == "missing"]
    for k in missing[:3]:
        tips.append({
            "severity": "optional",
            "title": f"Add missing keyword: {k.get('keyword')}",
            "detail": "Include this term naturally in experience bullets where factual.",
        })

    jd_match = ats.get("jdMatch") or {}
    for s in (jd_match.get("missingRequiredSkills") or [])[:3]:
        title = f"JD skill to cover if true: {s}"
        if any(t.get("title") == title for t in tips):
            continue
        tips.append({
            "severity": "optional",
            "title": title,
            "detail": "Mirror the job language only where it matches your real experience.",
        })

    warn_total = sum(1 for arr in issues.values() for it in arr if it.get("severity") == "warn")
    if warn_total >= 4:
        tips.append({
            "severity": "critical",
            "title": "Strengthen weak bullets",
            "detail": "Several bullets look vague or low-signal. Lead with action + measurable outcome.",
        })

    # Dedup by title while preserving order
    seen = set()
    deduped = []
    for t in tips:
        title = t.get("title") or ""
        if title in seen:
            continue
        seen.add(title)
        deduped.append(t)

    counts = {
        "urgent": sum(1 for t in deduped if t["severity"] == "urgent"),
        "critical": sum(1 for t in deduped if t["severity"] == "critical"),
        "optional": sum(1 for t in deduped if t["severity"] == "optional"),
    }
    return deduped[:8], counts


async def api_resume_analysis(request: Request):
    """POST /api/resume-analysis/{folder} — combined ATS + writing analysis.

    Body: {"user_id": "...", "jd": "...", "parsed": ParsedResume?}
    Returns section scores + prioritized fixes for UX-friendly report views.
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}

    jd = (body.get("jd") or "").strip()
    user_id = (body.get("user_id") or "").strip()
    if not user_id or user_id == "local":
        return JSONResponse({"error": "authentication required"}, status_code=401)
    target_role = (body.get("target_role") or body.get("role") or "").strip()
    parsed = body.get("parsed") if isinstance(body.get("parsed"), dict) else None

    if parsed is None:
        tex = get_resume_tex(folder)
        if tex is None and user_id:
            tex = download_tex(user_id, folder)
        if tex is None:
            return JSONResponse({"error": "resume not found"}, status_code=404)
        parsed = parse_resume_tex(tex)

    loop = asyncio.get_event_loop()
    try:
        ats = await loop.run_in_executor(
            None,
            partial(ats_check, folder, jd, user_id, None, target_role=target_role, parsed=parsed),
        )
        issues = doctor_check_resume(parsed)
    except FileNotFoundError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:
        logger.exception("resume analysis failed")
        return JSONResponse({"error": str(exc)}, status_code=500)

    sections = _analysis_section_scores(parsed, issues)
    tips, counts = _analysis_tips(ats, sections, issues)
    overall = round(((ats.get("score") or 0) / 10 + (sum(s["score"] for s in sections) / max(1, len(sections)))) / 2)
    summary = (
        "Overall structure is strong and ATS-friendly, with a few high-impact fixes needed before submitting."
        if overall >= 7 else
        "Resume is promising but needs structural and wording improvements before applying broadly."
    )

    return JSONResponse({
        "overall": {"score": overall, "summary": summary},
        "sections": [{"name": s["name"], "score": s["score"], "summary": s["summary"]} for s in sections],
        "tips": tips,
        "counts": counts,
        "ats": ats,
    })


# ── Share links (Phase 8b) ───────────────────────────────────────────────────
import secrets
import string
_SHORTID_ALPHABET = string.ascii_lowercase + string.digits


def _gen_shortid(n: int = 8) -> str:
    return "".join(secrets.choice(_SHORTID_ALPHABET) for _ in range(n))


def _share_table():
    """Return the supabase share_links table or None if storage isn't configured."""
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return None
        return client.table("share_links")
    except Exception as exc:
        logger.warning(f"share_table unavailable: {exc}")
        return None


def _supabase_table(table_name: str):
    """Return a Supabase table handle via service-role client, else None."""
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return None
        return client.table(table_name)
    except Exception as exc:
        logger.warning(f"supabase table unavailable [{table_name}]: {exc}")
        return None


def _load_template_tex_from_supabase(reference_folder: str) -> Optional[str]:
    """Load canonical template tex from `resume_templates` table when available.

    Expected columns: reference_folder text, tex_body text, active bool.
    """
    rf = (reference_folder or "").strip()
    if not rf:
        return None
    table = _supabase_table("resume_templates")
    if table is None:
        return None
    try:
        res = (
            table.select("tex_body")
            .eq("reference_folder", rf)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows and isinstance(rows[0], dict):
            tex = str(rows[0].get("tex_body") or "").strip()
            if tex:
                logger.info(f"Loaded template tex from Supabase  |  reference_folder={rf}")
                return tex
    except Exception as exc:
        logger.warning(f"template lookup failed  |  reference_folder={rf}  |  {exc}")
    return None


async def api_share_create(request: Request):
    """POST /api/share/{folder} — mint a shortid for `folder`. Idempotent if
    the same user already created one — returns the existing one.

    Body: {"user_id": "...", "pdf_url": "..."}
    """
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    pdf_url = (body.get("pdf_url") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)

    # Ensure the resume exists and belongs to the caller before minting a public link.
    # Also lets us fall back to the stored PDF URL if the client did not send one.
    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "share storage not configured"}, status_code=503)
        resume_res = (
            client.table("resumes")
                  .select("id, pdf_url")
                  .eq("user_id", user_id)
                  .eq("folder", folder)
                  .limit(1)
                  .execute()
        )
        if not resume_res.data:
            return JSONResponse(
                {
                    "error": "Résumé not in your library yet — wait a moment and tap Share again, "
                    "or sign in and generate so we can save the row Supabase needs for links.",
                },
                status_code=404,
            )
        pdf_url = pdf_url or (resume_res.data[0].get("pdf_url") or "")
    except Exception as exc:
        logger.exception("share resume ownership lookup failed")
        return JSONResponse({"error": f"share lookup failed: {exc}"}, status_code=500)

    # Reuse existing shortid if one already exists for this user+folder.
    try:
        existing = (
            table.select("shortid, pdf_url, views, revoked")
                 .eq("user_id", user_id).eq("folder", folder)
                 .eq("revoked", False)
                 .limit(1).execute()
        )
        if existing.data:
            row = existing.data[0]
            return JSONResponse({
                "shortid": row["shortid"], "pdf_url": row.get("pdf_url"),
                "views":   row.get("views", 0), "reused": True,
            })
    except Exception as exc:
        logger.warning(f"share lookup failed: {exc}")

    # Mint a new one — retry on the (vanishingly unlikely) collision.
    for _ in range(5):
        shortid = _gen_shortid()
        try:
            table.insert({
                "shortid": shortid, "user_id": user_id,
                "folder":  folder,  "pdf_url": pdf_url or None,
            }).execute()
            return JSONResponse({"shortid": shortid, "pdf_url": pdf_url, "reused": False})
        except Exception as exc:
            msg = str(exc)
            logger.warning(f"share insert failed: {msg}")
            # Only retry actual shortid collisions; other DB errors need to be
            # surfaced so the UI/operator sees the real Supabase problem.
            if "duplicate key" in msg.lower() or "unique" in msg.lower():
                continue
            return JSONResponse({"error": f"share insert failed: {msg}"}, status_code=500)
    return JSONResponse({"error": "could not mint unique shortid after retries"}, status_code=500)


def _share_token_slug_shape(token: str) -> bool:
    """Lowercase resume `public_slug`: 3–50 chars, letters/digits, single hyphens between segments."""
    if len(token) < 3 or len(token) > 50:
        return False
    return re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", token) is not None


async def api_share_resolve(request: Request):
    """GET /api/share/{shortid} — resolve a share shortid or a resume `public_slug` to folder + pdf_url.
    Share rows increment the view counter; slug-based resolves do not.

    Public endpoint — used by the recipient page (no auth).
    """
    raw = (request.path_params.get("shortid") or "").strip().lower()
    if not raw:
        return JSONResponse({"error": "invalid id"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)

    # ── 1) Legacy minted shortids (6–16 lowercase alnum) in share_links ─────
    if re.match(r"^[a-z0-9]{6,16}$", raw):
        try:
            rows = table.select("shortid, folder, pdf_url, views, revoked, created_at") \
                        .eq("shortid", raw).limit(1).execute()
        except Exception as exc:
            logger.exception("share resolve query failed")
            return JSONResponse({"error": str(exc)}, status_code=500)
        if rows.data:
            row = rows.data[0]
            if row.get("revoked"):
                return JSONResponse({"error": "link revoked"}, status_code=410)
            try:
                table.update({"views": (row.get("views") or 0) + 1}).eq("shortid", raw).execute()
            except Exception as exc:
                logger.warning(f"share view-counter update failed: {exc}")
            return JSONResponse({
                "shortid":    row["shortid"],
                "folder":     row["folder"],
                "pdf_url":    row.get("pdf_url"),
                "views":      (row.get("views") or 0) + 1,
                "created_at": row.get("created_at"),
            })

    # ── 2) Custom per-resume slug (resumes.public_slug, service-role read) ───
    if not _share_token_slug_shape(raw):
        return JSONResponse({"error": "invalid id"}, status_code=400)

    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "share storage not configured"}, status_code=503)
        resume_res = (
            client.table("resumes")
                  .select("folder, pdf_url, public_slug")
                  .eq("public_slug", raw)
                  .limit(1)
                  .execute()
        )
        if not resume_res.data:
            return JSONResponse({"error": "not found"}, status_code=404)
        r0 = resume_res.data[0]
        pdf_url = (r0.get("pdf_url") or "").strip()
        if not pdf_url:
            return JSONResponse({"error": "not found"}, status_code=404)
        return JSONResponse({
            "shortid":    raw,
            "folder":     r0.get("folder"),
            "pdf_url":    pdf_url,
            "views":      0,
            "created_at": None,
        })
    except Exception as exc:
        logger.exception("resume slug resolve failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_share_revoke(request: Request):
    """DELETE /api/share/{shortid} — owner-only revoke. Body: {"user_id": "..."}.
    We require user_id match because this is what the frontend has after login.
    Service-role on the backend would let us bypass RLS, but we still scope by
    user_id to prevent cross-user revocation by a logged-in attacker."""
    shortid = request.path_params["shortid"]
    if not re.match(r"^[a-z0-9]{6,16}$", shortid or ""):
        return JSONResponse({"error": "invalid shortid"}, status_code=400)
    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    table = _share_table()
    if table is None:
        return JSONResponse({"error": "share storage not configured"}, status_code=503)
    try:
        table.update({"revoked": True}).eq("shortid", shortid).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.exception("share revoke failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse({"ok": True})


# ── Version History ───────────────────────────────────────────────────

async def api_version_save(request: Request):
    """POST /api/version/{folder} — save current editor state as a version.
    Body: {"user_id": "...", "parsed": "..."}"""
    folder = request.path_params["folder"]
    if ".." in folder or "/" in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)
    
    try:
        body = await request.json()
    except Exception:
        body = {}
    user_id = (body.get("user_id") or "").strip()
    parsed = body.get("parsed")
    
    if not user_id or not parsed:
        return JSONResponse({"error": "user_id and parsed required"}, status_code=400)
    
    result = save_version(user_id, folder, json.dumps(parsed))
    if result is None:
        return JSONResponse({"error": "failed to save version"}, status_code=500)
    
    return JSONResponse(result)


async def api_version_list(request: Request):
    """GET /api/version/{folder}?user_id=xxx — list all versions."""
    folder = request.path_params["folder"]
    user_id = request.query_params.get("user_id", "").strip()
    
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    
    versions = list_versions(user_id, folder)
    if versions is None:
        return JSONResponse({"error": "failed to list versions"}, status_code=500)
    
    return JSONResponse({"versions": versions})


async def api_version_load(request: Request):
    """GET /api/version/{folder}/{version}?user_id=xxx — load a specific version."""
    folder = request.path_params["folder"]
    try:
        version = int(request.path_params.get("version", 0))
    except ValueError:
        return JSONResponse({"error": "invalid version"}, status_code=400)
    user_id = request.query_params.get("user_id", "").strip()
    
    if not user_id or version < 1:
        return JSONResponse({"error": "user_id and version required"}, status_code=400)
    
    parsed = load_version(user_id, folder, version)
    if parsed is None:
        return JSONResponse({"error": "version not found"}, status_code=404)
    
    return JSONResponse({"parsed": json.loads(parsed)})


async def api_storage_status(request: Request):
    """GET /api/storage-status?user_id=<uuid> — diagnose missing .tex files.

    Compares the `resumes` table for user_id against what's in the resume-tex
    Storage bucket AND the local LIBRARY_ROOT (which only ever has data in
    local dev — Railway's filesystem is empty after each deploy).

    Returns: { rows: [{folder, company, role, has_storage_tex, has_local_tex, status}], summary }
    """
    user_id = (request.query_params.get("user_id") or "").strip()
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)

    try:
        try:
            from resume_gui.storage import _get_client  # type: ignore
        except ImportError:
            from storage import _get_client  # type: ignore
        client = _get_client()
        if client is None:
            return JSONResponse({"error": "storage not configured"}, status_code=503)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    loop = asyncio.get_event_loop()

    def _scan():
        db_rows = client.table("resumes").select("folder, company, role, created_at") \
                        .eq("user_id", user_id).order("created_at", desc=True).execute().data or []
        try:
            objs = client.storage.from_("resume-tex").list(user_id) or []
        except Exception:
            objs = []
        in_storage = {o["name"][:-4] for o in objs if o.get("name", "").endswith(".tex")}

        local_with_tex: set = set()
        if os.path.isdir(LIBRARY_ROOT):
            for entry in os.listdir(LIBRARY_ROOT):
                p = os.path.join(LIBRARY_ROOT, entry)
                if os.path.isdir(p) and any(f.endswith(".tex") for f in os.listdir(p)):
                    local_with_tex.add(entry)

        rows = []
        in_storage_count = recoverable = lost = 0
        for r in db_rows:
            folder   = r["folder"]
            has_stor = folder in in_storage
            has_loc  = folder in local_with_tex
            if has_stor:
                status = "in_storage"; in_storage_count += 1
            elif has_loc:
                status = "recoverable"; recoverable += 1
            else:
                status = "lost"; lost += 1
            rows.append({
                "folder":   folder,
                "company":  r.get("company"),
                "role":     r.get("role"),
                "has_storage_tex": has_stor,
                "has_local_tex":   has_loc,
                "status":   status,
            })
        return {
            "rows": rows,
            "summary": {
                "total":       len(db_rows),
                "in_storage":  in_storage_count,
                "recoverable": recoverable,
                "lost":        lost,
            },
        }

    try:
        result = await loop.run_in_executor(None, _scan)
    except Exception as exc:
        logger.exception("storage_status failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    return JSONResponse(result)


async def api_backfill_tex(request: Request):
    """POST /api/backfill-tex — upload any local-only .tex/.pdf into Storage.

    Body: {"user_id": "<uuid>", "folders": ["folder1", ...]}.
    `folders` is optional — if omitted, attempts every recoverable folder
    found by api_storage_status. Each folder must exist in the local
    LIBRARY_ROOT, otherwise it's skipped.

    Designed for one-shot recovery from a logged-in browser session — no admin
    auth gate (single-user app today). Locks down: only the row's own user_id
    can re-upload, since the path is partitioned by user_id.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)
    user_id = (body.get("user_id") or "").strip()
    folders = body.get("folders") or None
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    if folders is not None and (not isinstance(folders, list) or not all(isinstance(f, str) for f in folders)):
        return JSONResponse({"error": "folders must be list[str]"}, status_code=400)

    loop = asyncio.get_event_loop()

    def _run():
        # Resolve the candidate list — either explicit `folders` or auto-detect.
        if folders is None:
            try:
                try:
                    from resume_gui.storage import _get_client  # type: ignore
                except ImportError:
                    from storage import _get_client  # type: ignore
                client = _get_client()
                rows = client.table("resumes").select("folder").eq("user_id", user_id).execute().data or []
                candidates = [r["folder"] for r in rows]
                objs = client.storage.from_("resume-tex").list(user_id) or []
                in_storage = {o["name"][:-4] for o in objs if o.get("name", "").endswith(".tex")}
                target = [f for f in candidates if f not in in_storage]
            except Exception as exc:
                return {"error": f"could not list candidates: {exc}"}
        else:
            target = list(folders)

        report = {"fixed": [], "skipped": [], "errors": []}
        for folder in target:
            if ".." in folder or "/" in folder:
                report["errors"].append({"folder": folder, "msg": "invalid folder name"})
                continue
            local = os.path.join(LIBRARY_ROOT, folder)
            if not os.path.isdir(local):
                report["skipped"].append({"folder": folder, "reason": "not in local LIBRARY_ROOT"})
                continue
            tex_files = [f for f in os.listdir(local) if f.endswith(".tex")]
            if not tex_files:
                report["skipped"].append({"folder": folder, "reason": "no .tex inside local folder"})
                continue
            try:
                tex_url = upload_tex(user_id, folder, os.path.join(local, tex_files[0]))
            except Exception as exc:
                report["errors"].append({"folder": folder, "msg": f"upload_tex: {exc}"})
                continue
            pdf_url = None
            pdf_files = [f for f in os.listdir(local) if f.endswith(".pdf")]
            if pdf_files:
                try:
                    pdf_url = upload_pdf(user_id, folder, os.path.join(local, pdf_files[0]))
                except Exception as exc:
                    # Non-fatal — tex is the important one for the editor.
                    logger.warning(f"backfill upload_pdf failed for {folder}: {exc}")
            report["fixed"].append({"folder": folder, "tex_url": tex_url, "pdf_url": pdf_url})
        report["summary"] = {
            "fixed":   len(report["fixed"]),
            "skipped": len(report["skipped"]),
            "errors":  len(report["errors"]),
        }
        return report

    try:
        result = await loop.run_in_executor(None, _run)
    except Exception as exc:
        logger.exception("backfill_tex failed")
        return JSONResponse({"error": str(exc)}, status_code=500)
    if isinstance(result, dict) and result.get("error"):
        return JSONResponse(result, status_code=500)
    return JSONResponse(result)


# ── Recruiter Checks ──────────────────────────────────────────────────────────


def _merge_split_word_tokens(tokens: list[str]) -> list[str]:
    """Fuse a lone uppercase letter with the following lowercase token.

    pdfplumber occasionally splits words like ``Led`` into ``L`` + ``ed``.
    """
    skip_single = frozenset({"I", "A"})
    out: list[str] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if (
            len(t) == 1
            and t.isalpha()
            and t.isupper()
            and t not in skip_single
            and i + 1 < len(tokens)
        ):
            nxt = tokens[i + 1]
            if nxt and len(nxt) >= 2 and nxt[0].islower():
                out.append(t + nxt)
                i += 2
                continue
        out.append(t)
        i += 1
    return out


_SECTION_KW = re.compile(
    r"^(?:"
    r"EXPERIENCE|"
    r"WORK\s+HISTORY|"
    r"WORK\s+EXPERIENCE|"
    r"PROFESSIONAL\s+EXPERIENCE|"
    r"PROFESSIONAL\s+HISTORY|"
    r"EMPLOYMENT(?:\s+HISTORY)?|"
    r"CAREER(?:\s+HISTORY|\s+OVERVIEW|\s+SUMMARY)?|"
    r"EDUCATION|"
    r"SKILLS|"
    r"SUMMARY|"
    r"PROFILE|"
    r"PROJECTS|"
    r"CERTIFICATIONS|"
    r"AWARDS|"
    r"PUBLICATIONS|"
    r"LANGUAGES|"
    r"VOLUNTEER|"
    r"PROFESSIONAL\s+SUMMARY|"
    r"TECHNICAL\s+SKILLS|"
    r"ACHIEVEMENTS?|"
    r"REFERENCES|"
    r"OBJECTIVE|"
    r"ACTIVITIES|"
    r"HONORS|"
    r"LEADERSHIP|"
    r"INTERESTS|"
    r"EXTRACURRICULAR"
    r")\s*$",
    re.IGNORECASE,
)

_HEADER_CONTACT_ANCHOR = re.compile(
    r"@|linkedin\.com/|www\.linkedin\.com/|github\.com/|www\.github\.com/|"
    r"\bportfolio\b|\bsite\b|\bmobile\b|\bphone\b|"
    r"[\[\(]?\d{3}[\])]?[\s.\-]?\d{3}[\s.\-]?\d{4}",
    re.IGNORECASE,
)

_BULLET_START_HEADER = re.compile(
    r"^[\s\ufeff]*(?:[-*•●◦·‣⁃▪►➤○⚫—–‑]|\d{1,2}[\).]\s?)",
    re.UNICODE,
)

_HEADER_JOB_ROLE = re.compile(
    r"\b(Engineer|Developer|Architect|Scientist|Analyst|Designer|Consultant|"
    r"Specialist|Manager|Director|Lead|Intern|Associate|Executive)\b",
    re.IGNORECASE,
)


def _strip_header_candidate_lines(lines: list[str], start: int, end: int) -> list[str]:
    out: list[str] = []
    lo = max(0, start)
    hi = min(len(lines), end)
    for j in range(lo, hi):
        line = lines[j].replace("\ufeff", "").strip()
        if not line:
            if len(out) >= 2:
                break
            continue
        if _SECTION_KW.match(line):
            continue
        if _BULLET_START_HEADER.match(line):
            continue
        if len(line) > 180:
            continue
        if re.search(r"%|↑|€|\$\d", line):
            continue
        out.append(line)
        if len(out) >= 8:
            break
    return out[:8]


def _header_window(lines: list[str], center_idx: int, before: int, after: int) -> list[str]:
    return _strip_header_candidate_lines(lines, center_idx - before, center_idx + after)


def _looks_like_all_caps_person_name(line: str) -> bool:
    t = line.strip()
    words = [re.sub(r"[''\-‐‑]", "", w) for w in t.split() if w]
    if len(words) < 2 or len(words) > 5 or len(t) > 48:
        return False
    if not words[0][0].isalpha():
        return False
    caps_words = [w for w in words if len(w) > 1 and w == w.upper()]
    if len(caps_words) < 2:
        return False
    return _SECTION_KW.match(t) is None


def _looks_like_title_person_name(line: str) -> bool:
    t = line.strip()
    if len(t) < 5 or len(t) > 44:
        return False
    if _HEADER_JOB_ROLE.search(t):
        return False
    words = [w for w in t.split() if w]
    if len(words) < 2 or len(words) > 4:
        return False

    def _tok_ok(w: str) -> bool:
        w = re.sub(r"[''.,]", "", w)
        return bool(re.fullmatch(r"[A-Z][a-z]+(?:-[A-Z][a-z]+)*", w))

    if not all(_tok_ok(w) for w in words):
        return False
    return _SECTION_KW.match(t) is None


def _extract_resume_header(text: str) -> list[str]:
    """Name + contact: top-of-document pass, then contact anchors / name heuristics in-body."""
    if not text.strip():
        return []

    raw_lines = text.split("\n")
    lines = [ln.replace("\ufeff", "").strip() for ln in raw_lines]

    primary: list[str] = []
    for line in lines:
        if not line:
            if len(primary) >= 2:
                break
            continue
        if _SECTION_KW.match(line):
            break
        if _BULLET_START_HEADER.match(line):
            break
        primary.append(line)
        if len(primary) >= 6:
            break
    if primary:
        return primary[:6]

    limit = min(220, len(lines))
    best: list[str] = []
    for i in range(limit):
        line = lines[i]
        if not line or len(line) > 200:
            continue
        if _HEADER_CONTACT_ANCHOR.search(line):
            chunk = _header_window(lines, i, 10, 6)
            if len(chunk) > len(best):
                best = chunk
    if not best:
        for i in range(min(360, len(lines))):
            line = lines[i]
            if _looks_like_all_caps_person_name(line) or _looks_like_title_person_name(line):
                best = _header_window(lines, i, 2, 6)
                break
    if not best:
        email_re = re.compile(r"\S+@\S+\.\S+")
        for i in range(min(400, len(lines))):
            line = lines[i]
            if line and email_re.search(line):
                best = _header_window(lines, i, 10, 6)
                break
    return best[:6]


def _post_clean_resume_text(text: str) -> str:
    """Normalize PDF placeholder glyphs; keep line breaks for section structure."""
    text = re.sub(r"\(\s*cid\s*:\s*\d+\)", " • ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUsed\s*:\s*to\b", "Used to", text, flags=re.IGNORECASE)
    lines = [" ".join(ln.split()) for ln in text.splitlines()]
    return "\n".join(lines).strip()


def _sanitize_bullet_display(s: str) -> str:
    """Strip CID placeholders and collapse spaces in LLM bullet fields."""
    if not isinstance(s, str):
        return ""
    s = re.sub(r"\(\s*cid\s*:\s*\d+\)", "", s, flags=re.IGNORECASE)
    s = " ".join(s.split())
    return s.strip()


def _extract_pdf_text(pdf) -> str:
    """Extract text from a pdfplumber PDF object, reconstructing proper word spacing.

    pdfplumber's default extract_text() sometimes collapses spaces between words
    (especially in multi-column or tightly-set PDFs), producing concatenated blobs
    like 'IamaSoftwareDeveloper'.  extract_words() uses glyph bounding boxes to
    identify individual words, which we then reconstruct line-by-line.
    """
    pages_text = []
    for page in pdf.pages:
        words = page.extract_words(x_tolerance=1, y_tolerance=3, keep_blank_chars=False)
        if not words:
            # Fallback to plain extract_text for image-heavy pages
            pages_text.append(page.extract_text() or "")
            continue
        # Group words by their approximate y-position (line)
        line_map: dict[int, list[str]] = {}
        for w in words:
            y_key = round(float(w["top"]) / 4) * 4  # bucket every 4pt
            line_map.setdefault(y_key, []).append(w["text"])
        page_lines = [
            " ".join(_merge_split_word_tokens(tokens))
            for _, tokens in sorted(line_map.items())
        ]
        pages_text.append("\n".join(page_lines))
    return _post_clean_resume_text("\n".join(pages_text))

_WEAK_VERBS = re.compile(
    r"\b(helped|assisted|worked on|worked with|was responsible for|participated in|"
    r"involved in|contributed to|duties included|tasked with|"
    r"did|made|got|went|had to|tried to)\b",
    re.IGNORECASE,
)
_ACTION_VERB_START_RE = re.compile(
    r"^[•\-–*▪▸]\s*(?:"
    # Management
    r"administered|analyzed|assigned|attained|chaired|consolidated|contracted|coordinated|delegated|developed|directed|evaluated|executed|improved|increased|organized|oversaw|planned|prioritized|produced|recommended|reviewed|scheduled|strengthened|supervised|"
    # Communication
    r"addressed|arbitrated|arranged|authored|collaborated|convinced|corresponded|drafted|edited|enlisted|formulated|influenced|interpreted|lectured|mediated|moderated|negotiated|persuaded|promoted|publicized|reconciled|recruited|spoke|translated|wrote|"
    # Research
    r"clarified|collected|critiqued|diagnosed|examined|extracted|identified|inspected|interviewed|investigated|summarized|surveyed|systematized|"
    # Technical
    r"assembled|built|calculated|computed|designed|devised|engineered|fabricated|maintained|operated|overhauled|programmed|remodeled|repaired|solved|upgraded|"
    # Teaching
    r"adapted|advised|coached|communicated|demystified|enabled|encouraged|explained|facilitated|guided|informed|instructed|set\s+goals|stimulated|trained|"
    # Financial / creative accomplishments
    r"acted|conceptualized|created|customized|established|fashioned|founded|illustrated|initiated|instituted|integrated|introduced|invented|originated|performed|revitalized|shaped|"
    # Helping
    r"assessed|assisted|counseled|demonstrated|educated|expedited|familiarized|motivated|referred|rehabilitated|represented|"
    # Clerical / detail
    r"approved|cataloged|classified|compiled|dispatched|generated|implemented|monitored|prepared|processed|purchased|recorded|retrieved|screened|specified|tabulated|validated|"
    # More accomplishment verbs
    r"achieved|expanded|pioneered|reduced|resolved|restored|spearheaded|transformed|"
    # Existing in-product high-signal verbs
    r"architected|automated|launched|drove|delivered|optimized"
    r")\b",
    re.IGNORECASE,
)
_PRONOUN_RE  = re.compile(r"\b(I|[Mm]e|[Mm]y|[Ww]e|[Oo]ur|[Uu]s)\b")
# Note: no IGNORECASE — we need to distinguish "us" from "US" (country code)
_DATE_RE     = re.compile(
    r"\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)[,. ]+\d{4}\b"
    r"|\b\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)\b",
    re.IGNORECASE,
)
_NUMBER_RE   = re.compile(r"\b\d[\d,]*%?|\$[\d,]+[KkMmBb]?")
_EMAIL_RE    = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_RE    = re.compile(r"(\+?\d[\d\s\-().]{7,}\d)")
_LINKEDIN_RE = re.compile(r"linkedin\.com/in/", re.IGNORECASE)
_UNNECESSARY = re.compile(
    r"\b(references available|references furnished|references upon|"
    r"list of references|responsible for|"
    r"duties included|objective:|career objective|to obtain a|"
    r"seeking a position)\b",
    re.IGNORECASE,
)
# Passive / weak copula patterns in bullets (career-center “active not passive” guidance).
_PASSIVE_BULLET_RE = re.compile(
    r"\b(?:was|were|is|are|been|being)\s+[a-z]{2,22}(?:ed|en)\b",
    re.IGNORECASE,
)
# Experience bullets should not *start* with a date range — dates belong on role headers.
_BULLET_DATE_LEAD_RE = re.compile(
    r"^[•\-–*▪▸]\s*(?:"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[,. ]+\d{4}\b"
    r"|(?:19|20)\d{2}\s*[-–/]\s*(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent)"
    r"|(?:19|20)\d{2}\b\s*[,–-]\s*(?:19|20)\d{2}\b"
    r")",
    re.IGNORECASE,
)


def _recruiter_checks(text: str) -> dict:
    """Run 10 recruiter checks on plain-text resume content."""
    raw_lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Pass 1: merge orphan bullet glyphs (some PDFs emit "•" on its own line)
    merged: list[str] = []
    i = 0
    while i < len(raw_lines):
        ln = raw_lines[i]
        if re.match(r"^[•\-–*▪▸]\s*$", ln) and i + 1 < len(raw_lines):
            merged.append(ln.rstrip() + " " + raw_lines[i + 1])
            i += 2
        else:
            merged.append(ln)
            i += 1

    # Pass 2: merge wrapped continuation lines back into their parent bullet.
    # A continuation line is one that starts with a bullet glyph followed by a
    # lowercase letter (or a conjunction/preposition) — this happens when
    # pdfplumber assigns the bullet glyph to the second visual line of a
    # long bullet that wraps.  e.g.:
    #   "• Collaborated with the sales team …"   ← real bullet start
    #   "• the sales team to identify routes …"  ← wrapped continuation
    _CONTINUATION_RE = re.compile(r"^[•\-–*▪▸]\s+[a-z]")
    lines: list[str] = []
    for ln in merged:
        if _CONTINUATION_RE.match(ln) and lines:
            # Strip the leading glyph and space, append to previous line
            tail = re.sub(r"^[•\-–*▪▸]\s+", "", ln)
            lines[-1] = lines[-1].rstrip() + " " + tail
        else:
            lines.append(ln)

    # Lines that are clearly contact / header noise — skip from bullet lists
    _NOISE_RE = re.compile(
        r"@|linkedin|github|\.com|phone|email|mobile|location|"
        r"^\s*(education|experience|projects|skills|summary|objective|certifications)\s*$",
        re.IGNORECASE,
    )

    def _is_content_bullet(line: str) -> bool:
        if _NOISE_RE.search(line):
            return False
        words = line.split()
        # Need at least 5 whitespace-separated tokens
        if len(words) < 5:
            return False
        # Reject merged-word blobs from bad PDF extraction:
        # e.g. "IamaSoftwareDeveloperwithover5years..." → max word > 20 chars
        if max(len(w) for w in words) > 20:
            return False
        # Starts with an explicit bullet glyph — highest confidence
        if re.match(r"^[•\-–*▪▸]", line):
            return True
        # Substantive sentence starting with a capital letter (≥ 60 chars)
        if re.match(r"^[A-Z][a-z]", line) and len(line) > 60:
            return True
        return False

    bullets = [l for l in lines if _is_content_bullet(l)]
    # Explicit-bullet lines only (start with •/-/–/*): used for density/action-verb checks
    explicit_bullets = [l for l in bullets if re.match(r"^[•\-–*▪▸]", l)]

    checks = []

    # 1. Quantify impact
    unquant = [b for b in bullets if not _NUMBER_RE.search(b)]
    q_score = max(0, round(10 - len(unquant) * 1.2))
    checks.append({
        "id": "quantify", "name": "Quantified Impact",
        "score": q_score, "passed": q_score >= 7,
        "detail": (
            "Recruiters scan for numbers — percentages, dollar amounts, team sizes, "
            "timeframes. Bullets without metrics feel vague. Aim for at least 50% of "
            "your bullets to contain a quantified result."
        ),
        "items": unquant[:8],
    })

    # 2. Weak verbs
    weak_hits = [b for b in bullets if _WEAK_VERBS.search(b)]
    wv_score  = max(0, round(10 - len(weak_hits) * 2))
    checks.append({
        "id": "weak_verbs", "name": "Strong Action Verbs",
        "score": wv_score, "passed": wv_score >= 7,
        "detail": (
            "Passive or generic verbs ('helped', 'assisted', 'was responsible for') "
            "dilute impact. Replace them with strong, specific verbs from action-verb families "
            "(e.g., Managed: coordinated/oversaw; Communication: negotiated/presented; "
            "Technical: designed/engineered/programmed; Results: achieved/reduced/transformed)."
        ),
        "items": weak_hits[:8],
    })

    # 3. Action verb at start — only check explicit bullet lines
    no_action = [b for b in explicit_bullets if not _ACTION_VERB_START_RE.match(b)]
    av_score  = max(0, round(10 - len(no_action) * 1.5))
    checks.append({
        "id": "action", "name": "Action Verb Start",
        "score": av_score, "passed": av_score >= 7,
        "detail": (
            "Every bullet should start with a strong action verb (UMBC-style action list), "
            "not a noun phrase or weak helper verb. This signals initiative and makes bullets skimmable."
        ),
        "items": no_action[:6],
    })

    # 4. Pronouns
    pronoun_hits = [l for l in lines if _PRONOUN_RE.search(l)]
    pron_score   = 10 if not pronoun_hits else max(0, 10 - len(pronoun_hits) * 3)
    checks.append({
        "id": "pronouns", "name": "No Personal Pronouns",
        "score": pron_score, "passed": pron_score >= 8,
        "detail": (
            "Resumes should be written in the implied first person without using "
            "'I', 'me', 'my', 'we', etc. Remove all personal pronouns."
        ),
        "items": pronoun_hits[:6],
    })

    # 5. Repetition
    verb_counts: dict[str, int] = {}
    for b in bullets:
        m = re.match(r"^([A-Z][a-z]+)", b)
        if m:
            verb_counts[m.group(1)] = verb_counts.get(m.group(1), 0) + 1
    repeated = [f"'{v}' used {n} times" for v, n in verb_counts.items() if n >= 3]
    rep_score = 10 if not repeated else max(0, 10 - len(repeated) * 2)
    checks.append({
        "id": "repetition", "name": "Verb Variety",
        "score": rep_score, "passed": rep_score >= 7,
        "detail": (
            "Using the same action verb repeatedly makes your resume monotonous. "
            "Vary your verbs across bullets to showcase a broader skill set."
        ),
        "items": repeated,
    })

    # 6. Dates present
    has_dates = bool(_DATE_RE.search(text))
    date_score = 10 if has_dates else 0
    checks.append({
        "id": "dates", "name": "Dates Present",
        "score": date_score, "passed": has_dates,
        "detail": (
            "Recruiters need dates to understand your career timeline. "
            "Every job and education entry should include start and end dates "
            "(or 'Present' for your current role)."
        ),
        "items": [] if has_dates else ["No dates detected in the resume"],
    })

    # 7. Contact info
    has_email    = bool(_EMAIL_RE.search(text))
    has_phone    = bool(_PHONE_RE.search(text))
    has_linkedin = bool(_LINKEDIN_RE.search(text))
    contact_issues = []
    if not has_email:    contact_issues.append("Email address not found")
    if not has_phone:    contact_issues.append("Phone number not found")
    if not has_linkedin: contact_issues.append("LinkedIn URL not found")
    contact_score = 10 - len(contact_issues) * 3
    checks.append({
        "id": "contact", "name": "Contact Information",
        "score": contact_score, "passed": contact_score >= 7,
        "detail": (
            "Your contact section should include an email, phone number, and LinkedIn "
            "profile URL. Missing any of these reduces your chances of being contacted."
        ),
        "items": contact_issues,
    })

    # 8. Resume length
    word_count = len(text.split())
    if word_count < 300:
        len_score, len_note = 4, f"Too short ({word_count} words) — aim for 400–700"
    elif word_count > 900:
        len_score, len_note = 5, f"Too long ({word_count} words) — aim for 400–700"
    else:
        len_score, len_note = 10, f"Good length ({word_count} words)"
    checks.append({
        "id": "length", "name": "Resume Length",
        "score": len_score, "passed": len_score >= 7,
        "detail": (
            "A one-page resume (400–700 words) is ideal for most candidates. "
            "Two pages are acceptable for 10+ years of experience. "
            "Anything shorter looks thin; anything longer loses the reader."
        ),
        "items": [] if len_score >= 7 else [len_note],
    })

    # 9. Unnecessary phrases
    unnec_hits = list({m.group(0).lower() for m in _UNNECESSARY.finditer(text)})
    un_score   = 10 if not unnec_hits else max(0, 10 - len(unnec_hits) * 3)
    checks.append({
        "id": "unnecessary", "name": "Unnecessary Phrases",
        "score": un_score, "passed": un_score >= 8,
        "detail": (
            "Phrases like 'References available upon request' or 'Objective: To obtain a '  "
            "waste space and signal an outdated template. Remove them entirely."
        ),
        "items": [f'Remove: "{p}"' for p in unnec_hits],
    })

    # 10. Bullet density (short explicit bullets only)
    short_bullets = [b for b in explicit_bullets if len(b.split()) < 8]
    dens_score    = max(0, round(10 - len(short_bullets) * 2))
    checks.append({
        "id": "density", "name": "Bullet Depth",
        "score": dens_score, "passed": dens_score >= 7,
        "detail": (
            "Bullets under 6 words are too thin to convey impact. "
            "Each bullet should tell a mini-story: Action + Context + Result."
        ),
        "items": short_bullets[:6],
    })

    # 11. Passive / copula-heavy wording in bullets (active voice & ownership)
    passive_hits = [b for b in bullets if _PASSIVE_BULLET_RE.search(b)]
    pv_score = max(0, round(10 - len(passive_hits) * 2))
    checks.append({
        "id": "passive_voice", "name": "Active Voice & Ownership",
        "score": pv_score, "passed": pv_score >= 7,
        "detail": (
            "Use strong action verbs and active phrasing recruiters can skim in seconds. "
            "Reword passive 'was/were … done' lines and vague 'responsible for' duty dumps "
            "into owned outcomes."
        ),
        "items": passive_hits[:6],
    })

    # 12. Dates leading bullet lines (keep dates on headers; open bullets with verbs)
    date_led = [b for b in explicit_bullets if _BULLET_DATE_LEAD_RE.match(b)]
    dl_score = max(0, round(10 - len(date_led) * 2.5))
    checks.append({
        "id": "date_led_bullet", "name": "Skimmable Bullet Openings",
        "score": dl_score, "passed": dl_score >= 7,
        "detail": (
            "Start bullets with an accomplishment or action, not a calendar. "
            "Put date ranges on the role or education header line."
        ),
        "items": date_led[:6],
    })

    # 13. Role depth — detect under-described work experience entries
    # Match realistic years (1960-2029) or month+year — avoids phone-number false positives
    _ROLE_HEADER_RE = re.compile(
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (?:19|20)\d{2}"
        r"|(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent)",
        re.IGNORECASE,
    )
    # Lines that look like job/edu titles (contain a separator + no bullet glyph)
    _TITLE_LINE_RE = re.compile(r"[|\-–•@]|\bat\b|\bfor\b", re.IGNORECASE)

    def _parse_role_blocks(all_lines):
        roles, cur_header, cur_bullets = [], None, []
        prev_non_bullet = ""
        for ln in all_lines:
            is_bullet = bool(re.match(r"^[•\-–*▪▸]", ln))
            has_date  = bool(_ROLE_HEADER_RE.search(ln))
            if has_date and not is_bullet:
                if cur_header is not None:
                    roles.append((cur_header, cur_bullets))
                # If this line is ONLY a date range (≤ 4 tokens), prepend the previous
                # title line so we capture "Job Title | Company Name" + date
                if len(ln.split()) <= 4 and prev_non_bullet and not _ROLE_HEADER_RE.search(prev_non_bullet):
                    cur_header = prev_non_bullet + "  " + ln
                else:
                    cur_header = ln
                cur_bullets = []
            elif cur_header and is_bullet:
                cur_bullets.append(ln)
            if not is_bullet:
                prev_non_bullet = ln
        if cur_header:
            roles.append((cur_header, cur_bullets))
        return roles

    role_blocks = _parse_role_blocks(lines)
    weak_roles = []
    for header, role_bullets in role_blocks:
        has_numbers  = any(_NUMBER_RE.search(b) for b in role_bullets)
        bullet_count = len(role_bullets)
        if bullet_count < 3 or not has_numbers:
            reason = []
            if bullet_count < 3:
                reason.append(f"only {bullet_count} bullet{'s' if bullet_count != 1 else ''}")
            if not has_numbers:
                reason.append("no quantified results")
            weak_roles.append(f"{header}  [{', '.join(reason)}]")

    if role_blocks:
        rd_score = max(0, round(10 - len(weak_roles) * (10 / max(len(role_blocks), 1))))
    else:
        rd_score = 10
    checks.append({
        "id": "role_depth", "name": "Role Descriptions",
        "score": rd_score, "passed": rd_score >= 7,
        "detail": (
            "Each role should have at least 3 bullets and at least one quantified result "
            "(a percentage, dollar amount, team size, or time saved). "
            "Thin roles signal low impact to recruiters — flesh them out with specific achievements."
        ),
        "items": weak_roles[:6],
    })

    overall = round(sum(c["score"] for c in checks) / len(checks) * 10)
    passed_names = [c["name"] for c in checks if c["passed"]]
    failed_names = [c["name"] for c in checks if not c["passed"]]
    summary_ok  = ("Scored well in " + ", ".join(passed_names[:3])) if passed_names else ""
    summary_bad = ("Needs work on "  + ", ".join(failed_names[:3])) if failed_names else ""

    return {
        "overall":     overall,
        "summary_ok":  summary_ok,
        "summary_bad": summary_bad,
        "checks":      checks,
        "bullets":     bullets[:20],
    }


def _latex_to_plain(tex: str) -> str:
    """Strip common LaTeX markup to produce readable plain text for analysis."""
    # Remove comments
    tex = re.sub(r"%.*", "", tex)
    # Extract text from common resume macros
    tex = re.sub(r"\\resumeQuadHeading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}", r"\1 \2 \3 \4", tex)
    tex = re.sub(r"\\resumeTrioHeading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}", r"\1 \2 \3", tex)
    tex = re.sub(r"\\resumeItem\{([^}]*)\}", r"• \1", tex)
    tex = re.sub(r"\\resumeItem\s*\{([^}]*)\}", r"• \1", tex)
    tex = re.sub(r"\\textbf\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\textit\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\emph\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\href\{[^}]*\}\{([^}]*)\}", r"\1", tex)
    tex = re.sub(r"\\section\*?\{([^}]*)\}", r"\n\1\n", tex)
    # Remove remaining commands
    tex = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})*", "", tex)
    # Clean up
    tex = re.sub(r"[{}]", "", tex)
    tex = re.sub(r"\n{3,}", "\n\n", tex)
    return tex.strip()


# ── Comprehensive AI-powered resume analysis ──────────────────────────────────

_ANALYSIS_PROMPT = """\
You are an expert resume reviewer and career coach. Analyze the following resume \
using the principles below and return ONLY a valid JSON object — no markdown, no \
code fences, no prose outside the JSON.

Career-center rubric (score and write `issues[]` strings consistent with this — \
prioritize what blocks interviews and ATS passes). Primary format reference: UMBC Career Center \
\"Resume Guidelines\" (https://careers.umbc.edu/wp-content/uploads/sites/221/2015/06/Resume-Guidelines.pdf).
• UMBC section-by-section checklist (when each appears in RESUME TEXT): HEADER — name; address, city, state, zip, \
email, and phone as available for a quick contact block. OBJECTIVE — optional; one concise statement tying \
relevant skills and/or education and career goals to the target position. SUMMARY — optional; \
two to five bullets highlighting greatest strengths and skills consistent with the rest of the document; \
UMBC notes Objective and Summary are often optional when space is tight and it may be unnecessary to include both. \
EDUCATION — university (or main school): name, city, state; degree and major; graduation date; minor and/or \
certifications line when used; GPA only when explicitly stated and above 3.00; community college line if present \
with degree or dates attended pattern. CERTIFICATIONS/LICENSES — credential title and date received. \
RESEARCH, PUBLICATIONS AND PRESENTATIONS — each item: title; place or organization presented; type \
(poster, paper, oral presentation, etc.); date. RELEVANT PROJECTS — title (class/course project without course number), \
semester and year; one to two bullets on role, actions, and results; tools or techniques gained; learning \
outcomes when present. RELEVANT COURSEWORK — optional; bulleted; most applicable major/minor courses for the role; \
no more than about three lines total. SKILLS — subcategories should match the candidate's field (e.g. Laboratory / \
Quantitative / Interpersonal; clinical systems or charting for healthcare; legal research or languages for law; \
creative software for design; Programming / Software only when computing is the focus) with proficiency tiers \
(Advanced/Proficient/Novice) when used; LANGUAGES with level (conversational/fluent) when relevant. \
PROFESSIONAL EXPERIENCE (or role-focused Experience) — position title, organization, city, state, start–end dates on the \
header line; two to five action bullets emphasizing achievements, contributions, and tangible outcomes. ADDITIONAL \
EXPERIENCE — other paid roles: one to three similar bullets each; achievements not only duties. Activities tied to \
the target role may belong under Professional/Relevant Experience per UMBC. HONORS AND AWARDS — organization, award, \
date. ACTIVITIES/INTERESTS — role, organization/club, dates; one to three achievement-oriented bullets with action \
verbs. SERVICE EXPERIENCE/COMMUNITY ENGAGEMENT — organization, role, dates involved. \
• Undergraduate recency rule (only flag when resume text clearly indicates class year or high-school-era items): \
first-year students may still list high school work/activities; after second year, work and activities should be \
college-level only — mention as a sectionStructure issue only when there is explicit tension, not by guessing.
• Top problem patterns to catch: spelling/grammar/punctuation slips; missing or hard-to-parse \
contact (email, phone); passive or duty-only wording instead of owned achievements; walls of \
text or disorganized sections that fail a fast skim; bullets that never show scale, results, \
or proof of impact.
• Resume language should be: specific rather than generic; active rather than passive; \
written to express (clear facts) not to impress with fluff; fact-based — quantify and qualify \
when truthful; formatted so humans and parsers can scan headings and bullets quickly.
• Avoid: personal pronouns (I, we, my, our); unexplained heavy abbreviation; long narrative \
paragraphs where bullets are expected; slang or overly casual phrasing; “references available” \
or reference lists; opening bullets with a date or date range (dates belong on role headers).
• Encourage: consistent formatting and emphasis (spacing, bold/italics/caps); strong \
section headings in sensible order; reverse chronological experience where applicable; \
no unexplained timeline gaps when the résumé shows them; bullets that lead with strong \
action verbs and end with outcomes/scale when possible.
• Improved bullets should use precise action verbs from proven families. Prefer verbs like: \
Management (administered, coordinated, oversaw, prioritized), Communication (authored, \
negotiated, promoted, translated), Research (examined, investigated, summarized), \
Technical (engineered, programmed, upgraded), Teaching (coached, facilitated, trained), \
Financial/Creative (conceptualized, initiated, integrated), Helping (assessed, counseled, \
expedited), Clerical/Detail (implemented, monitored, validated), and Accomplishment verbs \
(achieved, reduced, spearheaded, transformed). Keep tense sensible (prior roles past tense; \
present role may mix present for ongoing scope and past for shipped wins).

ANALYSIS PRINCIPLES (map to categoryScores and bulletAnalysis):
1. READABILITY: Short, skimmable bullets; survives a ~30-second skim; white space balance; \
avoid paragraph-long bullet blobs and cluttered layout signals in text.
2. ATS COMPATIBILITY: Tables, columns, text boxes, headers/footers, images/icons, odd \
headings; standard sections (Experience, Education, Skills); contact lines machine-readable.
3. JOB MATCH: If a JD is provided — keywords, tools, responsibilities overlap; natural \
keyword placement (no stuffing). If no JD: null scores as specified below.
4. ACHIEVEMENT QUALITY: Outcomes and ownership vs. vague duties (“responsible for”, \
“worked on”, task lists without impact). Align with results-focused bullet craft.
5. QUANTIFICATION: %, $, scale, time saved, users, rankings, before/after — reward \
truthful metrics; flag truthful opportunities to add numbers.
6. SECTION STRUCTURE: Sections and order aligned with the UMBC checklist above (header, optional Objective/Summary, \
education, optional certs/research/projects/coursework, skills, professional vs additional experience, honors, activities, \
service); enforce bullet-count norms where visible (Summary 2–5; Professional 2–5; Additional 1–3; Activities 1–3; \
Projects 1–2); flag redundant Objective + Summary when space is tight; coursework over ~3 lines; GPA not per UMBC \
(only if ≥3.0 and stated); research/pubs missing venue or presentation type when items are listed.
7. LANGUAGE QUALITY: Spelling/grammar; passive voice and buzzwords; tense; clarity over \
flowery phrasing; minimal unexplained jargon/acronyms.
8. FIELD SIGNALS & PROFESSIONAL DEPTH (JSON key MUST stay `technicalBranding` for compatibility): How clearly the \
résumé signals fit for the candidate's discipline — skills and tools grouped sensibly; field-appropriate evidence \
(e.g. portfolio or code samples for computing/design; writing or teaching clips for communications/education; \
licenses and certifications for regulated professions; publications or posters for research; patient volume or \
outcomes only when already stated). Score high when domain-relevant depth is obvious without hollow buzzwords. Do \
NOT penalize non-STEM résumés for lacking \"tech stack\" or GitHub; judge instead on clarity of training, tools, \
credentials, and outcomes that employers in THAT field expect.

SCORING GUIDANCE:
90-100 = Excellent, highly recruiter-friendly and ATS-safe.
75-89  = Strong but needs minor improvements.
60-74  = Decent but has several missed opportunities.
40-59  = Weak; needs major restructuring.
<40    = Poor; likely to fail ATS and recruiter screens.

CRITICAL RULES:
- The candidate may be in any discipline (STEM, healthcare, business, arts, education, trades, public service, etc.). \
Infer the field from the résumé text and score against that field's expectations — never assume a software-only audience.
- Be SPECIFIC, not generic. Tell exactly WHERE and HOW to fix each issue.
- When rewriting bullets, PRESERVE TRUTHFULNESS. Mark invented metrics \
  as "[X%]", "[$Y]", or "[~N]".
- For bulletAnalysis: analyze ONLY the 8 WEAKEST bullets (lowest-quality ones). \
  Skip good bullets.
- For each originalBullet field: copy the wording EXACTLY from RESUME TEXT (including • or -), \
  after normalizing; do not drop the first letters of words.
- If no JD is provided: set jobMatch in categoryScores to null, set \
  keywordScore to null, leave matchedKeywords/missingKeywords empty.
- Prioritize improvements that increase interview chances most.
{jd_section}

STRUCTURAL SIGNALS (deterministic pre-scan — verify against RESUME TEXT; do not invent problems):
{structural_signals}

RESUME TEXT:
{resume_text}

Return ONLY this JSON (no markdown fences, no explanation):
{{
  "overallScore": <integer 0-100>,
  "categoryScores": {{
    "readability": <0-100>,
    "atsCompatibility": <0-100>,
    "jobMatch": <0-100 or null>,
    "achievementQuality": <0-100>,
    "quantification": <0-100>,
    "sectionStructure": <0-100>,
    "languageQuality": <0-100>,
    "technicalBranding": <0-100>
  }},
  "summary": "<2-3 sentence specific overall assessment>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "topIssues": [
    {{
      "issue": "<short problem title>",
      "severity": "<low|medium|high>",
      "whyItMatters": "<1-2 sentences on impact>",
      "suggestion": "<concrete actionable fix>"
    }}
  ],
  "atsWarnings": [
    {{"warning": "<ATS issue>", "suggestion": "<fix>"}}
  ],
  "keywordAnalysis": {{
    "matchedKeywords": ["<keyword>"],
    "missingKeywords": ["<keyword>"],
    "keywordScore": <0-100 or null>,
    "suggestions": ["<where/how to naturally add missing keyword>"]
  }},
  "bulletAnalysis": [
    {{
      "originalBullet": "<exact bullet text, truncated to 150 chars>",
      "score": <0-100>,
      "issues": ["<issue 1>", "<issue 2>"],
      "improvedBullet": "<stronger rewritten version>"
    }}
  ],
  "sectionFeedback": [
    {{"section": "<name>", "score": <0-100>, "feedback": "<specific feedback>"}}
  ],
  "rewriteSuggestions": [
    {{"before": "<weak line>", "after": "<improved line>", "reason": "<why better>"}}
  ],
  "finalRecommendations": [
    "<most impactful action 1>",
    "<action 2>",
    "<action 3>",
    "<action 4>"
  ]
}}
"""


def _llm_json_call(prompt: str) -> Optional[dict]:
    """Call Grok (primary when configured) or Gemini for a JSON response."""
    import time
    selected_model = primary_llm_model_for_resume_workloads()

    def _is_grok_model(model_name: str) -> bool:
        return (model_name or "").strip().lower().startswith("grok")

    def _grok_json(model_name: Optional[str] = None) -> Optional[dict]:
        xai_key = os.environ.get("XAI_API_KEY")
        if not xai_key:
            return None
        try:
            from openai import OpenAI  # type: ignore
            model = (model_name or os.environ.get("GROK_MODEL", "grok-4-1-fast-non-reasoning")).strip()
            xai = OpenAI(api_key=xai_key, base_url="https://api.x.ai/v1")
            r = xai.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            text = (r.choices[0].message.content or "").strip()
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            return json.loads(text)
        except Exception as exc:
            logger.warning(f"Grok analysis failed: {exc}")
        return None

    def _gemini_json(model_name: Optional[str] = None) -> Optional[dict]:
        google_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        if not google_key:
            return None
        try:
            from google import genai as _genai  # type: ignore
            from google.genai import types as _gtypes  # type: ignore
            client = _genai.Client(api_key=google_key)
            cfg = _gtypes.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
            r = client.models.generate_content(
                model=(model_name or primary_gemini_flash_model()).strip(),
                contents=prompt,
                config=cfg,
            )
            text = (r.text or "").strip()
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            return json.loads(text)
        except Exception as exc:
            logger.warning(f"Gemini analysis failed: {exc}")
        return None

    if _is_grok_model(selected_model):
        out = _grok_json(selected_model)
        if out is not None:
            return out
        return _gemini_json(primary_gemini_flash_model())
    out = _gemini_json(selected_model)
    if out is not None:
        return out
    return _grok_json(os.environ.get("GROK_MODEL", "grok-4-1-fast-non-reasoning"))


def _normalize_analysis(raw: dict) -> dict:
    """Ensure the LLM result has all required keys with sane defaults."""
    cs_defaults = {
        "readability": 50, "atsCompatibility": 50, "jobMatch": None,
        "achievementQuality": 50, "quantification": 50,
        "sectionStructure": 50, "languageQuality": 50, "technicalBranding": 50,
    }
    cs = raw.get("categoryScores") or {}
    for k, v in cs_defaults.items():
        if k not in cs:
            cs[k] = v
    scores = [v for v in cs.values() if isinstance(v, (int, float))]
    base_overall = round(sum(scores) / len(scores)) if scores else 50
    raw.setdefault("summary", "Analysis complete.")
    raw.setdefault("topStrengths", [])
    raw.setdefault("topIssues", [])
    raw.setdefault("atsWarnings", [])
    raw.setdefault("keywordAnalysis", {
        "matchedKeywords": [], "missingKeywords": [], "keywordScore": None, "suggestions": [],
    })
    raw.setdefault("bulletAnalysis", [])
    raw.setdefault("sectionFeedback", [])
    raw.setdefault("rewriteSuggestions", [])
    raw.setdefault("finalRecommendations", [])
    raw["categoryScores"] = cs
    bullets = raw.get("bulletAnalysis") or []
    if isinstance(bullets, list):
        for ba in bullets:
            if isinstance(ba, dict):
                ba["originalBullet"] = _sanitize_bullet_display(ba.get("originalBullet", ""))
                ba["improvedBullet"] = _sanitize_bullet_display(ba.get("improvedBullet", ""))

    # Calibrate overall score so it reflects visible weaknesses.
    # This prevents inflated "90+" overall when there are many weak bullets/issues.
    weak_bullets = 0
    if isinstance(bullets, list):
        weak_bullets = sum(
            1 for ba in bullets
            if isinstance(ba, dict) and isinstance(ba.get("score"), (int, float)) and ba.get("score", 0) < 55
        )

    issues = raw.get("topIssues") or []
    high_issues = 0
    medium_issues = 0
    if isinstance(issues, list):
        for it in issues:
            if not isinstance(it, dict):
                continue
            sev = str(it.get("severity", "")).lower()
            if sev == "high":
                high_issues += 1
            elif sev == "medium":
                medium_issues += 1

    min_cat = min(scores) if scores else 50
    weak_penalty = min(20, weak_bullets * 3)
    issue_penalty = min(15, high_issues * 4 + medium_issues * 2)
    # If any category is weak, overall should drop noticeably.
    floor_penalty = round(max(0, 70 - min_cat) * 0.35)
    calibrated = max(0, min(100, round(base_overall - weak_penalty - issue_penalty - floor_penalty)))

    # Keep the LLM's intent but avoid implausibly high overall given concrete weaknesses.
    llm_overall = raw.get("overallScore")
    if isinstance(llm_overall, (int, float)):
        raw["overallScore"] = int(min(llm_overall, calibrated))
    else:
        raw["overallScore"] = int(calibrated)
    return raw


def _regex_to_comprehensive(struct: dict, jd: str) -> dict:
    """Convert _recruiter_checks output to comprehensive format (LLM unavailable fallback)."""
    checks = struct.get("checks", [])

    def _s(cid: str) -> int:
        c = next((x for x in checks if x["id"] == cid), None)
        return round((c["score"] / 10) * 100) if c else 50

    quant  = _s("quantify")
    weak   = _s("weak_verbs")
    action = _s("action")
    pron   = _s("pronouns")
    rep    = _s("repetition")
    dens   = _s("density")
    dates  = _s("dates")
    cont   = _s("contact")
    leng   = _s("length")
    rdepth = _s("role_depth")
    unnec  = _s("unnecessary")
    passive = _s("passive_voice")
    dlead = _s("date_led_bullet")

    overall = struct.get("overall", 60)
    issues = []
    for c in checks:
        if not c.get("passed"):
            sev = "high" if c["score"] < 5 else "medium"
            first_items = "; ".join(str(x) for x in (c.get("items") or [])[:2])
            issues.append({
                "issue": c["name"],
                "severity": sev,
                "whyItMatters": c.get("detail", ""),
                "suggestion": f"Fix these: {first_items}" if first_items else c.get("detail", "")[:80],
            })

    return {
        "overallScore": overall,
        "categoryScores": {
            "readability":       round((dens + leng) / 2),
            "atsCompatibility":  round((dates + cont) / 2),
            "jobMatch":          None,
            "achievementQuality": round((weak + action + rdepth) / 3),
            "quantification":    quant,
            "sectionStructure":  round((dates + unnec + dlead) / 3),
            "languageQuality":   round((pron + rep + passive) / 3),
            "technicalBranding": 50,
        },
        "summary": (
            (struct.get("summary_ok") or "") + " " + (struct.get("summary_bad") or "")
        ).strip() or "Resume analysis complete. Fix the highlighted issues to improve your score.",
        "topStrengths": [c["name"] for c in checks if c.get("passed")][:3],
        "topIssues":    issues[:6],
        "atsWarnings":  [],
        "keywordAnalysis": {
            "matchedKeywords": [], "missingKeywords": [],
            "keywordScore": None, "suggestions": [],
        },
        "bulletAnalysis":       [],
        "sectionFeedback":      [],
        "rewriteSuggestions":   [],
        "finalRecommendations": [
            "Add quantified results (%, $, numbers) to at least 50% of your bullets.",
            "Replace weak verbs (helped, assisted, worked on) with strong action verbs.",
            "Ensure every job entry has at least 3 achievement-focused bullets.",
            "Verify contact section includes email, phone, and LinkedIn URL.",
            "Make sure the resume is formatted correctly with the correct spacing and alignment.",
            "Use a professional font like Arial, Times New Roman, or Calibri for the resume.",
            "Fix spelling/grammar and verify email + phone (and LinkedIn) are obvious in the header.",
            "Replace passive or duty-only lines with action-verb openings and measurable outcomes where truthful.",
            "Tighten layout for a 30-second skim: short bullets, dates on role lines, verbs first.",
            "Drop references blurb, unexplained abbreviations, and narrative blobs — use crisp bullets.",
        ],
    }


def _analyze_resume_comprehensive(text: str, jd: str = "") -> dict:
    """Full resume analysis: structural regex + LLM deep-dive."""
    # Structural checks (fast, always run)
    struct = _recruiter_checks(text)

    # Summarize failed structural checks for the LLM (align narrative with deterministic scan)
    sig_lines: list[str] = []
    for c in struct.get("checks", []):
        if c.get("passed"):
            continue
        samp = "; ".join(str(x) for x in (c.get("items") or [])[:2])
        title = c.get("name", "Check")
        sig_lines.append(f"- {title}: {samp}" if samp else f"- {title}")
    struct_summary = (
        "\n".join(sig_lines[:14])
        if sig_lines
        else "(All automated structural checks passed.)"
    )

    # Build LLM prompt
    jd_section = (
        f"\nJOB DESCRIPTION (analyze keyword match against this):\n{jd[:3000]}"
        if jd.strip()
        else "\n(No job description provided. Set jobMatch and keywordScore to null.)"
    )
    prompt = _ANALYSIS_PROMPT.format(
        jd_section=jd_section,
        structural_signals=struct_summary,
        resume_text=text[:6000],
    )

    raw = _llm_json_call(prompt)
    if raw and isinstance(raw, dict):
        return _normalize_analysis(raw)

    logger.warning("LLM unavailable for comprehensive analysis — using regex fallback")
    return _regex_to_comprehensive(struct, jd)


async def api_analyze_upload(request: Request):
    """POST /api/analyze-upload — upload a PDF and run comprehensive AI analysis.

    Form fields:
      file  — PDF binary
      jd    — optional job description text
    """
    try:
        form   = await request.form()
        upload = form.get("file")
        jd     = (form.get("jd") or "").strip()
        if not upload:
            return JSONResponse({"error": "No file provided"}, status_code=400)
        data = await upload.read()
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            text = _extract_pdf_text(pdf)
        if not text.strip():
            return JSONResponse({"error": "Could not extract text from PDF"}, status_code=400)
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _analyze_resume_comprehensive, text, jd)
        if isinstance(result, dict):
            result["extractedText"] = text[:25000]
            result["resumeHeader"] = _extract_resume_header(text)
        return JSONResponse(result)
    except Exception as exc:
        logger.exception("analyze_upload failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def api_analyze_folder(request: Request):
    """POST /api/analyze-folder/{folder} — run comprehensive analysis on a stored resume."""
    folder = request.path_params.get("folder", "").strip()
    if not folder or ".." in folder:
        return JSONResponse({"error": "invalid folder"}, status_code=400)

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass
    user_id = body.get("user_id", "")
    jd      = (body.get("jd") or "").strip()

    loop = asyncio.get_event_loop()

    def _run():
        # 1. Local filesystem (fresh Railway deploy or local dev)
        tex_path = os.path.join(LIBRARY_ROOT, folder, "resume.tex")
        if os.path.isfile(tex_path):
            with open(tex_path, encoding="utf-8", errors="ignore") as f:
                return _latex_to_plain(f.read())

        # 2. Supabase Storage via the shared download_tex helper
        if user_id:
            try:
                tex = download_tex(user_id, folder)
                if tex:
                    return _latex_to_plain(tex)
            except Exception as e:
                logger.warning(f"analyze_folder: download_tex failed: {e}")
        return None

    plain = await loop.run_in_executor(None, _run)
    if not plain:
        return JSONResponse({"error": "Could not load resume text"}, status_code=404)

    result = await loop.run_in_executor(None, _analyze_resume_comprehensive, plain, jd)
    if isinstance(result, dict):
        result["extractedText"] = (plain or "")[:25000]
        result["resumeHeader"] = _extract_resume_header(plain or "")
    return JSONResponse(result)


async def api_rewrite_role(request: Request):
    """POST /api/rewrite-role — rewrite a weak role using AI.
    Body: { "header": "Job Title | Company • Dates", "bullets": ["• bullet1", ...] }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    header  = (body.get("header") or "").strip()
    bullets = body.get("bullets") or []
    if not header:
        return JSONResponse({"error": "header required"}, status_code=400)

    bullets_text = "\n".join(bullets) if bullets else "(no bullets provided)"
    prompt = (
        f"You are a professional resume writer. Rewrite the following work experience role "
        f"to be much stronger and more impactful for a tech recruiter.\n\n"
        f"Role: {header}\n"
        f"Current bullets:\n{bullets_text}\n\n"
        f"Instructions:\n"
        f"- Write exactly 3-4 strong bullet points\n"
        f"- Each bullet MUST start with a powerful past-tense action verb "
        f"(e.g., administered, coordinated, authored, negotiated, investigated, engineered, "
        f"programmed, coached, trained, initiated, implemented, monitored, achieved, reduced, spearheaded)\n"
        f"- Each bullet MUST include a quantified result (%, $, time saved, team size, etc.) "
        f"— if the original has no numbers, invent plausible but conservative estimates\n"
        f"- Remove weak verbs (helped, assisted, worked on, was responsible for)\n"
        f"- Remove pronouns (I, my, we)\n"
        f"- Format: return ONLY the bullet points, one per line, each starting with •\n"
        f"- Do not include the role header, just the bullets"
    )

    loop = asyncio.get_event_loop()

    def _call_llm():
        try:
            # Reuse the same LLM routing (Gemini → Grok fallback) as the bullet rewriter
            text = ai_rewrite_bullet("", prompt, "")
            return text.strip() if text else None
        except Exception as exc:
            logger.warning(f"rewrite_role LLM call failed: {exc}")
            return None

    text = await loop.run_in_executor(None, _call_llm)
    if not text:
        return JSONResponse({"error": "LLM unavailable"}, status_code=503)

    # Parse out bullet lines
    rewritten = [l.strip() for l in text.splitlines() if l.strip() and re.match(r"^[•\-–*]", l.strip())]
    if not rewritten:
        rewritten = [l.strip() for l in text.splitlines() if l.strip()]

    return JSONResponse({"bullets": rewritten})


async def api_suggest_changes(request: Request):
    """POST /api/suggest-changes — analyze resume vs JD and return per-bullet suggestions.

    Body: { "candidate_profile": str, "job_description": str }
    Returns: { "summary", "suggestions", optional "research_queries", "research_sources", "research_digest" }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    candidate_profile = (body.get("candidate_profile") or "").strip()
    job_description   = (body.get("job_description") or "").strip()

    if not candidate_profile:
        return JSONResponse({"error": "candidate_profile required"}, status_code=400)
    if not job_description:
        return JSONResponse({"error": "job_description required"}, status_code=400)

    loop = asyncio.get_event_loop()
    digest = ""
    research_queries: List[str] = []
    research_sources: List[dict] = []
    try:
        digest, research_queries, research_sources = await loop.run_in_executor(
            None, run_tailor_research_job_context, job_description
        )
    except Exception as exc:
        logger.warning("pre-suggestion web research failed (suggestions will use resume+JD only): %s", exc)

    digest_block = ""
    if digest.strip():
        digest_block = (
            "\n---\nJOB & MARKET CONTEXT (from live web search before this analysis — use for terminology, "
            "JD vocabulary, and honest keyword overlap only; do NOT add employers, degrees, dates, or metrics "
            "not already in the résumé or JD):\n"
            f"{digest.strip()[:4500]}\n\n"
        )

    prompt = (
        "You are an expert resume coach. Analyze this resume against the job description "
        "and return 5-8 specific, actionable improvements for individual bullets or sections.\n\n"
        f"RESUME:\n{candidate_profile[:6000]}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:3000]}\n"
        f"{digest_block}"
        "Return a JSON object with this exact structure:\n"
        '{\n'
        '  "summary": "One sentence: the most important gap between this resume and the JD.",\n'
        '  "suggestions": [\n'
        '    {\n'
        '      "id": "s1",\n'
        '      "section": "Work Experience",\n'
        '      "original": "The exact bullet text from the resume (quote it verbatim)",\n'
        '      "suggested": "The improved version, tailored to the JD keywords",\n'
        '      "reason": "Why this change improves the match — 1 concise sentence.",\n'
        '      "priority": "high"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        "Rules:\n"
        "- Only suggest changes to bullets that EXIST in the resume — quote them exactly.\n"
        "- Do NOT invent metrics, employers, or facts not in the resume.\n"
        "- When JOB & MARKET CONTEXT is present, use it only to sharpen **wording** and JD-aligned phrasing for facts already in the résumé.\n"
        "- Priority: 'high' = missing critical JD keyword; 'medium' = wording improvement; 'low' = polish.\n"
        "- Return ONLY the JSON object, no markdown fences."
    )

    def _call():
        return coach_suggestions_llm(prompt)

    try:
        text = await loop.run_in_executor(None, _call)
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        data = json.loads(text)
        if isinstance(data, dict):
            data["research_queries"] = research_queries
            data["research_sources"] = research_sources
            if digest.strip():
                data["research_digest"] = digest.strip()[:2500]
        return JSONResponse(data)
    except json.JSONDecodeError as exc:
        logger.error(f"suggest-changes JSON parse error: {exc}  raw={text[:200]}")
        return JSONResponse({"error": "AI response could not be parsed."}, status_code=500)
    except Exception as exc:
        logger.exception("suggest-changes failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def serve_pdf(request: Request):
    folder   = request.path_params["folder"]
    filename = request.path_params["filename"]

    if not filename.endswith(".pdf") or ".." in folder or ".." in filename:
        return JSONResponse({"error": "not found"}, status_code=404)

    pdf_path = os.path.join(LIBRARY_ROOT, folder, filename)
    if not os.path.isfile(pdf_path):
        return JSONResponse({"error": "not found"}, status_code=404)

    logger.info(f"Serving PDF  |  {pdf_path}")
    return FileResponse(pdf_path, media_type="application/pdf")


routes = [
    Route("/",                              homepage),
    Route("/api/resumes",                   api_resumes),
    Route("/api/generate-stream",           api_generate_stream, methods=["POST"]),
    Route("/api/upload-resume",             api_upload_resume,   methods=["POST"]),
    Route("/api/extract-jd",              api_extract_jd,     methods=["POST"]),
    Route("/api/resume/{folder}",          api_resume_parsed,  methods=["GET"]),
    Route("/api/resume/{folder}",          api_resume_save,    methods=["POST"]),
    Route("/api/ai-edit-bullet",           api_ai_edit_bullet,methods=["POST"]),
    Route("/api/generate-skills",          api_generate_skills, methods=["POST"]),
    Route("/api/ats-check/{folder}",     api_ats_check,     methods=["POST"]),
    Route("/api/doctor-check",             api_doctor_check,   methods=["POST"]),
    Route("/api/resume-analysis/{folder}", api_resume_analysis, methods=["POST"]),
    Route("/api/share/{folder}",           api_share_create,  methods=["POST"]),
    Route("/api/share/{shortid}",         api_share_resolve, methods=["GET"]),
    Route("/api/share/{shortid}",         api_share_revoke, methods=["DELETE"]),
    Route("/api/version/{folder}",        api_version_save, methods=["POST"]),
    Route("/api/version/{folder}",        api_version_list, methods=["GET"]),
    Route("/api/version/{folder}/{version}", api_version_load, methods=["GET"]),
    Route("/api/storage-status",            api_storage_status,methods=["GET"]),
    Route("/api/backfill-tex",              api_backfill_tex,  methods=["POST"]),
    Route("/api/analyze-upload",           api_analyze_upload,  methods=["POST"]),
    Route("/api/analyze-folder/{folder}", api_analyze_folder,  methods=["POST"]),
    Route("/api/rewrite-role",            api_rewrite_role,    methods=["POST"]),
    Route("/api/suggest-changes",         api_suggest_changes, methods=["POST"]),
    Route("/pdf/{folder}/{filename}",      serve_pdf),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        # Allow any GitHub Pages domain + any resunova.io subdomain
        allow_origin_regex=r"https://(.*\.github\.io|(.*\.)?resunova\.io)",
        allow_methods=["GET", "POST", "OPTIONS", "DELETE"],
        allow_headers=["Content-Type"],
        allow_credentials=False,
    ),
]

app = Starlette(routes=routes, middleware=middleware)

if __name__ == "__main__":
    host = "0.0.0.0" if os.environ.get("RAILWAY_ENVIRONMENT") else "127.0.0.1"
    logger.info(f"Resume Generator starting on http://{host}:{PORT}")
    uvicorn.run(app, host=host, port=PORT, log_level="info")
