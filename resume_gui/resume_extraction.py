"""
Résumé text → structured doc: section inventory, LLM prompt guards, and profile backfill.

Used by the Jinja structured PDF path so tailoring does not drop education, projects, or skills.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from renderers.latex_renderer import ResumeDocModel

logger = logging.getLogger(__name__)

DEFAULT_SECTION_ORDER = ["summary", "experience", "education", "skills", "projects"]

_CANONICAL_SECTION_HEADERS: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "profile", "objective"),
    "education": ("education", "academic background"),
    "skills": ("skills", "technical skills", "core competencies"),
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "employment",
    ),
    "projects": ("projects", "project"),
}

# All-caps headers glued to prior lowercase text (e.g. "analystSUMMARY") — case-sensitive to avoid
# matching "experience" inside bullets.
_GLUED_HEADER_RE = re.compile(
    r"(?<=[a-z.])(SUMMARY|EDUCATION|(?:TECHNICAL )?SKILLS|PROJECTS|CERTIFICATIONS|AWARDS)\b"
)
_GLUED_EXPERIENCE_HEADER_RE = re.compile(
    r"(?<=[a-z.])((?:WORK |PROFESSIONAL )?EXPERIENCE|EMPLOYMENT)\b"
)

_EDUCATION_SIGNAL_RE = re.compile(
    r"\b(?:"
    r"university|college|institute|school|academy|"
    r"bachelor|master|mba|ph\.?\s*d|b\.?\s*s\.?|m\.?\s*s\.?|b\.?\s*a\.?|"
    r"diploma|associate|undergraduate|postgraduate|gpa|cum laude"
    r")\b",
    re.IGNORECASE,
)

_EXPERIENCE_SIGNAL_RE = re.compile(
    r"\b(?:"
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}"
    r"\s*[–—\-]\s*(?:present|now|current|\w+\s+\d{4}|\d{4})",
    re.IGNORECASE,
)


@dataclass
class ExtractionManifest:
    """LLM self-report of what it saw in the source — used to catch dropped sections."""

    sections_seen: list[str] = field(default_factory=list)
    education_count: int = 0
    experience_job_count: int = 0
    skills_present: bool = False
    projects_present: bool = False

    def expects_education(self) -> bool:
        return "education" in self.sections_seen or self.education_count > 0

    def expects_experience(self) -> bool:
        return "experience" in self.sections_seen or self.experience_job_count > 0


@dataclass
class ProfileSectionInventory:
    """What the plain-text profile appears to contain (regex/heuristic, pre-LLM)."""

    headers_found: list[str] = field(default_factory=list)
    has_education_header: bool = False
    has_education_signal: bool = False
    has_experience_header: bool = False
    has_experience_signal: bool = False
    has_skills_header: bool = False
    has_projects_header: bool = False
    has_summary_header: bool = False
    estimated_education_lines: int = 0
    estimated_job_blocks: int = 0

    def expects_education(self) -> bool:
        return self.has_education_header or self.has_education_signal

    def expects_experience(self) -> bool:
        return self.has_experience_header or self.estimated_job_blocks >= 1 or self.has_experience_signal


def inject_section_line_breaks(text: str) -> str:
    """Insert newlines before common section headers when PDF text runs sections together."""
    t = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not t.strip():
        return t
    t = _GLUED_HEADER_RE.sub(r"\n\1", t)
    t = _GLUED_EXPERIENCE_HEADER_RE.sub(r"\n\1", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def infer_section_order_from_profile(profile_text: str) -> list[str]:
    """Preserve source PDF section order (e.g. education before experience when present)."""
    text = inject_section_line_breaks(profile_text or "")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    found: list[tuple[int, str]] = []
    for idx, ln in enumerate(lines):
        low = re.sub(r"[^a-z ]", "", ln.lower()).strip()
        for key, aliases in _CANONICAL_SECTION_HEADERS.items():
            if low in aliases:
                found.append((idx, key))
                break
    found.sort(key=lambda x: x[0])
    order: list[str] = []
    seen: set[str] = set()
    for _, key in found:
        if key not in seen:
            order.append(key)
            seen.add(key)
    for key in DEFAULT_SECTION_ORDER:
        if key not in seen:
            order.append(key)
    return order


def profile_section_inventory(profile_text: str) -> ProfileSectionInventory:
    """Scan upload/profile text for section headers and education/experience signals."""
    text = inject_section_line_breaks(profile_text or "")
    inv = ProfileSectionInventory()
    if not text.strip():
        return inv

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    headers: list[str] = []
    for ln in lines:
        low = re.sub(r"[^a-z ]", "", ln.lower()).strip()
        if low in {
            "summary", "profile", "objective",
            "skills", "technical skills", "core competencies",
            "experience", "work experience", "professional experience", "employment",
            "education", "academic background",
            "projects", "project",
            "certifications", "certification", "awards", "publications", "languages",
        }:
            headers.append(low)
            if "education" in low or "academic" in low:
                inv.has_education_header = True
            if "experience" in low or "employment" in low:
                inv.has_experience_header = True
            if "skill" in low or "competenc" in low:
                inv.has_skills_header = True
            if "project" in low:
                inv.has_projects_header = True
            if low in ("summary", "profile", "objective"):
                inv.has_summary_header = True

    inv.headers_found = list(dict.fromkeys(headers))
    inv.has_education_signal = bool(_EDUCATION_SIGNAL_RE.search(text))
    inv.has_experience_signal = bool(_EXPERIENCE_SIGNAL_RE.search(text))
    inv.estimated_job_blocks = len(_EXPERIENCE_SIGNAL_RE.findall(text))

    in_edu = False
    edu_lines = 0
    for ln in lines:
        low = ln.lower().strip()
        if low in ("education", "academic background"):
            in_edu = True
            continue
        if in_edu and low in {
            "skills", "technical skills", "experience", "work experience",
            "projects", "certifications", "summary",
        }:
            break
        if in_edu and len(ln) > 8:
            edu_lines += 1
    inv.estimated_education_lines = edu_lines

    return inv


def extraction_guard_prompt_block(inv: ProfileSectionInventory) -> str:
    """Inject into LLM extract prompts so the model knows what MUST appear in JSON output."""
    if not inv.headers_found and not inv.expects_education() and not inv.expects_experience():
        return (
            "\n---\nEXTRACTION GUARDRAILS:\n"
            "- Scan the full résumé for every section (contact, summary, skills, experience, education, projects).\n"
            "- Never return empty \"education\" if the source mentions a school, degree, or university.\n"
            "- Never return empty \"experience\" if the source lists employers or date ranges.\n"
            "- Map each degree to education[] with institution, degree, dates, and details[] for GPA/coursework lines.\n"
            "- Fill extraction_manifest honestly (sections you saw vs counts you emitted).\n"
        )

    lines = [
        "\n---\nEXTRACTION GUARDRAILS (read before writing JSON):",
        f"- Section headers detected in source text: {', '.join(inv.headers_found) or 'none explicit'}",
    ]
    if inv.expects_education():
        lines.append(
            "- Source contains EDUCATION (header or school/degree keywords). "
            "You MUST populate education[] with at least one object per degree/program — "
            "never omit this array or leave it empty."
        )
        if inv.estimated_education_lines:
            lines.append(
                f"- Expect roughly {max(1, inv.estimated_education_lines)} education row(s) from the source."
            )
    if inv.expects_experience():
        blocks = max(1, inv.estimated_job_blocks)
        lines.append(
            f"- Source contains work history ({blocks} date-range block(s) detected). "
            "Include every job in experience[] with company, role, dates, location, bullets."
        )
    if inv.has_skills_header:
        lines.append("- Source has a SKILLS section — populate skills[] with all categories and items.")
    if inv.has_projects_header:
        lines.append("- Source has PROJECTS — populate projects[]; use [] only if truly absent.")
    lines.extend([
        "- Contact: copy email, phone, LinkedIn, GitHub verbatim when present.",
        "- If one education line mixes degree + dates + school (e.g. \"MS Data Science 2022-2024 | City | University\"), "
        "split into institution, degree, dates, location fields — do not drop the entry.",
        "- extraction_manifest: report sections_seen and counts BEFORE finalizing JSON; counts must match arrays.",
        "- Self-check: every section visible in the source must appear in the JSON.",
    ])
    return "\n".join(lines) + "\n"


_MANIFEST_SCHEMA = """
  "extraction_manifest": {
    "sections_seen": ["summary", "education", "skills", "experience", "projects"],
    "education_count": 0,
    "experience_job_count": 0,
    "skills_present": true,
    "projects_present": false
  }"""

_EXTRACT_SCHEMA = """{
  "full_name": "string (required)",
  "headline": "string",
  "location": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string",
  "github": "string",
  "summary": "string",
  "skills": [{"category": "string", "items": ["string"]}],
  "experience": [{
    "company": "string (required per job)",
    "role": "string",
    "dates": "string",
    "location": "string",
    "bullets": ["string"]
  }],
  "projects": [{"name": "string", "bullets": ["string"]}],
  "education": [{
    "institution": "string (school name — required if degree present)",
    "degree": "string (required if institution present)",
    "dates": "string",
    "location": "string",
    "details": ["string — GPA, coursework, honors"]
  }],
""" + _MANIFEST_SCHEMA + "\n}"

_EXTRACT_SCHEMA_FAITHFUL = (
    _EXTRACT_SCHEMA.replace("string (required)", "string")
    .replace('"bullets": ["string"]', '"bullets": ["string — copy EXACTLY from source, no rewriting"]')
    .replace('"summary": "string"', '"summary": "string — copy EXACTLY from source"')
)

_FAITHFUL_INSTRUCTIONS = """Instructions:
- FIRST pass: identify every section header and block in the source résumé.
- Copy ALL content faithfully — do NOT rewrite, improve, or omit sections.
- Bullets and summary must match source wording exactly (minor whitespace only).
- education[]: REQUIRED when source has EDUCATION or any school/degree — never return [] if a degree is mentioned.
- experience[]: one object per job; never merge multiple employers into one entry.
- extraction_manifest.sections_seen must list every section header found (use keys: summary, education, skills, experience, projects).
- extraction_manifest.education_count must equal len(education[]); experience_job_count must equal len(experience[]).
- Output ONLY valid JSON matching the schema (no markdown fences)."""


def faithful_extract_prompt(profile_snippet: str, inv: ProfileSectionInventory) -> str:
    return (
        "You are a precise résumé parser. Extract ALL content into structured JSON.\n"
        "Do NOT rewrite bullets or summary.\n\n"
        f"RÉSUMÉ TEXT:\n{profile_snippet}\n"
        f"{extraction_guard_prompt_block(inv)}\n"
        f"{_FAITHFUL_INSTRUCTIONS}\n\n"
        f"{_EXTRACT_SCHEMA_FAITHFUL}"
    )


def tailor_doc_prompt(
    doc: "ResumeDocModel",
    jd_snippet: str,
    role: str,
    company: str,
) -> str:
    """Second-pass prompt: tailor summary + bullets only; structure is fixed."""
    import json

    n_jobs = len(doc.experience)
    base = {
        "summary": doc.summary,
        "experience": [
            {
                "company": e.company,
                "role": e.role,
                "dates": e.dates,
                "location": e.location,
                "bullets": list(e.bullets),
            }
            for e in doc.experience
        ],
    }
    return (
        "You tailor an ALREADY-STRUCTURED résumé JSON for a specific job.\n\n"
        f"TARGET ROLE: {role} at {company}\n\n"
        f"JOB DESCRIPTION:\n{jd_snippet}\n\n"
        f"CURRENT STRUCTURED CONTENT:\n{json.dumps(base, ensure_ascii=False)[:5500]}\n\n"
        "RULES (strict):\n"
        f"- Return JSON with ONLY \"summary\" and \"experience\" keys.\n"
        f"- experience[] MUST contain exactly {n_jobs} entries in the SAME order.\n"
        "- Each entry MUST keep the same company, role, dates, and location strings — only rewrite bullets[].\n"
        "- Do NOT add, remove, or merge jobs. Do NOT fabricate employers, degrees, or metrics.\n"
        "- summary: 2-3 sentences tailored to the JD using facts already in the résumé.\n"
        "- Do NOT output education, skills, or projects — those are preserved separately.\n"
        "- Output ONLY valid JSON (no markdown fences):\n"
        '{"summary": "...", "experience": [{"company": "...", "role": "...", "dates": "...", '
        '"location": "...", "bullets": ["..."]}]}'
    )


def sanitize_extraction_manifest(raw: Any) -> Optional[ExtractionManifest]:
    if not isinstance(raw, dict):
        return None
    seen_raw = raw.get("sections_seen")
    sections_seen: list[str] = []
    if isinstance(seen_raw, list):
        allowed = set(_CANONICAL_SECTION_HEADERS.keys())
        for s in seen_raw:
            key = str(s or "").strip().lower()
            if key in allowed and key not in sections_seen:
                sections_seen.append(key)
    try:
        edu_n = int(raw.get("education_count") or 0)
    except (TypeError, ValueError):
        edu_n = 0
    try:
        exp_n = int(raw.get("experience_job_count") or 0)
    except (TypeError, ValueError):
        exp_n = 0
    return ExtractionManifest(
        sections_seen=sections_seen,
        education_count=max(0, edu_n),
        experience_job_count=max(0, exp_n),
        skills_present=bool(raw.get("skills_present")),
        projects_present=bool(raw.get("projects_present")),
    )


def pop_manifest_from_llm_raw(raw: dict) -> tuple[dict, Optional[ExtractionManifest]]:
    """Remove extraction_manifest from LLM payload before building ResumeDocModel."""
    if not isinstance(raw, dict):
        return raw, None
    copy = dict(raw)
    manifest = sanitize_extraction_manifest(copy.pop("extraction_manifest", None))
    return copy, manifest


def validate_extraction_against_inventory(
    doc: "ResumeDocModel",
    inv: ProfileSectionInventory,
) -> list[str]:
    """Return human-readable gaps when structured doc is missing expected sections."""
    warnings: list[str] = []
    if inv.expects_education() and not doc.education:
        warnings.append("education missing despite EDUCATION header or school/degree signals in source")
    if inv.expects_experience() and not doc.experience:
        warnings.append("experience missing despite work history signals in source")
    if inv.has_skills_header and not doc.skills:
        warnings.append("skills missing despite SKILLS header in source")
    if inv.has_projects_header and not doc.projects:
        warnings.append("projects missing despite PROJECTS header in source")
    if inv.expects_experience() and inv.estimated_job_blocks >= 2:
        if len(doc.experience) < inv.estimated_job_blocks - 1:
            warnings.append(
                f"experience has {len(doc.experience)} job(s) but source suggests ~{inv.estimated_job_blocks}"
            )
    return warnings


def validate_manifest_against_doc(
    doc: "ResumeDocModel",
    manifest: Optional[ExtractionManifest],
) -> list[str]:
    if not manifest:
        return []
    warnings: list[str] = []
    if manifest.expects_education() and not doc.education:
        warnings.append("manifest claims education but education[] is empty")
    if manifest.education_count > 0 and len(doc.education) < manifest.education_count:
        warnings.append(
            f"manifest education_count={manifest.education_count} but got {len(doc.education)} row(s)"
        )
    if manifest.expects_experience() and not doc.experience:
        warnings.append("manifest claims experience but experience[] is empty")
    if manifest.experience_job_count > 0 and len(doc.experience) < manifest.experience_job_count:
        warnings.append(
            f"manifest experience_job_count={manifest.experience_job_count} "
            f"but got {len(doc.experience)} job(s)"
        )
    if manifest.skills_present and not doc.skills:
        warnings.append("manifest claims skills but skills[] is empty")
    if manifest.projects_present and not doc.projects:
        warnings.append("manifest claims projects but projects[] is empty")
    return warnings
