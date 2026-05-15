"""
Resume upload: document → markdown (MarkItDown), then LLM → structured JSON (Pydantic).

Mirrors the Resume-Matcher pattern (extraction vs understanding) using this repo's
Grok/Gemini stack from ``resume_library``.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

# Align with Resume Matcher user-mistake guardrails (docs/user-mistake-guards.md).
RESUME_UPLOAD_MAX_BYTES = 4 * 1024 * 1024

ALLOWED_UPLOAD_SUFFIXES = frozenset({".pdf", ".doc", ".docx"})
EXPECTED_MIME_BY_SUFFIX: Dict[str, frozenset[str]] = {
    ".pdf": frozenset({"application/pdf"}),
    ".doc": frozenset({"application/msword"}),
    ".docx": frozenset(
        {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    ),
}


def validate_resume_upload_file(content_type: Optional[str], filename: str) -> None:
    """
    Validate extension + browser-reported MIME. Raises ValueError with a safe user message (400).
    ``application/octet-stream`` or missing type skips MIME check (many clients omit a precise type).
    """
    name = (filename or "").strip() or "resume"
    suf = Path(name).suffix.lower()
    if suf not in ALLOWED_UPLOAD_SUFFIXES:
        raise ValueError(
            f"Unsupported file type ({suf or 'no extension'}). "
            "Allowed: PDF, Microsoft Word .doc, or .docx."
        )

    ct = (content_type or "").split(";")[0].strip().lower()
    if not ct or ct == "application/octet-stream":
        return

    if ct.startswith(("image/", "video/", "audio/")):
        raise ValueError(
            "The upload looks like an image or media file, not a résumé document. "
            "Export or save as PDF or Word (.doc / .docx) from your editor — do not rename image files."
        )
    if ct.startswith("text/") or ct in ("application/json", "application/xml", "text/xml"):
        raise ValueError(
            "The upload looks like plain text or code, not a PDF or Word file. "
            "Please upload an actual .pdf or .doc / .docx export."
        )

    expected = EXPECTED_MIME_BY_SUFFIX.get(suf, frozenset())
    if ct in expected:
        return

    # Legacy / uncommon PDF MIME seen in the wild
    if suf == ".pdf" and ct in ("application/x-pdf", "binary/octet-stream"):
        return

    if suf == ".pdf":
        raise ValueError(
            "The file does not look like a real PDF (the browser reported a different format). "
            "If you renamed a non-PDF to .pdf, use Save as PDF or Print to PDF instead."
        )
    if suf == ".docx":
        if ct == "application/msword":
            raise ValueError(
                "The file is named .docx but was reported as an older .doc type. "
                "Re-save as .docx in Word, or rename to .doc if it is actually Word 97–2003 format."
            )
        raise ValueError(
            "The file does not look like a Word .docx (the browser reported a different format). "
            "Export as .docx from Word or Google Docs."
        )
    if suf == ".doc" and ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        raise ValueError(
            "The file is named .doc but was reported as .docx format. "
            "Rename to .docx or re-save with the correct extension."
        )
    raise ValueError(
        "The file’s reported type does not match the extension. "
        "Upload a genuine PDF or Word export (avoid renaming unrelated files)."
    )


@dataclass(frozen=True)
class UploadMarkdownOutcome:
    """Result of binary → text extraction for résumé upload."""

    markdown: str
    """Set when ``markdown`` is empty; drives HTTP 422 messaging."""
    empty_reason: Optional[str] = None


def message_for_empty_resume_extract(empty_reason: Optional[str]) -> str:
    if empty_reason == "corrupt_or_unreadable_pdf":
        return (
            "Could not read this PDF — it may be corrupted, encrypted, or not a valid PDF. "
            "Try opening it in a PDF viewer; if it fails, re-export from the original document."
        )
    if empty_reason == "corrupt_or_unreadable_word":
        return (
            "Could not read this Word file — it may be corrupted, password-protected, or not a valid .doc/.docx. "
            "Try opening it in Word; re-save a copy without encryption."
        )
    if empty_reason == "pdf_no_text":
        return (
            "No text could be extracted from this PDF. It is often a scanned (image-only) résumé. "
            "Upload a PDF with selectable text, or use a .docx export, or run OCR first."
        )
    if empty_reason == "word_no_text":
        return (
            "No text could be extracted from this Word document. "
            "The file may be empty, heavily restricted, or not a real Word export."
        )
    return (
        "Could not extract readable text from the file. "
        "Try another format (PDF with selectable text or .docx) or a different export."
    )


def extract_upload_markdown(
    content: bytes,
    filename: str,
    pdf_plain_fallback: Optional[str] = None,
) -> UploadMarkdownOutcome:
    """
    PDF or Word → markdown/plain text via MarkItDown; PDF falls back to pdfplumber
    when MarkItDown returns empty. Records ``empty_reason`` when output is blank.
    """
    suffix = Path(filename or "resume.pdf").suffix.lower() or ".pdf"
    if suffix not in ALLOWED_UPLOAD_SUFFIXES:
        suffix = ".pdf"

    markitdown_failed = False
    tmp_path: Optional[Path] = None
    try:
        from markitdown import MarkItDown  # type: ignore[import-untyped]

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)

        md = MarkItDown()
        result = md.convert(str(tmp_path))
        text = (getattr(result, "text_content", None) or "").strip()
    except Exception as exc:
        logger.warning("MarkItDown convert failed (%s): %s", filename, exc)
        markitdown_failed = True
        text = ""
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    if text:
        return UploadMarkdownOutcome(text, None)

    if suffix == ".pdf":
        fb = (pdf_plain_fallback or "").strip() or _extract_pdf_text_pdfplumber(content)
        if fb.strip():
            logger.info("resume_upload_parse: MarkItDown empty; used pdfplumber fallback for %s", filename)
            return UploadMarkdownOutcome(fb.strip(), None)
        if markitdown_failed:
            return UploadMarkdownOutcome("", "corrupt_or_unreadable_pdf")
        return UploadMarkdownOutcome("", "pdf_no_text")

    if markitdown_failed:
        return UploadMarkdownOutcome("", "corrupt_or_unreadable_word")
    return UploadMarkdownOutcome("", "word_no_text")

# ── Date repair (year-only → month-inclusive from markdown) ─────────────────

_MD_DATE_RE = re.compile(
    r"(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
    r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?"
    r"|Dec(?:ember)?)"
    r"\.?\s+\d{4})"
    r"(?:\s*[-–—]\s*"
    r"(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
    r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?"
    r"|Dec(?:ember)?)"
    r"\.?\s+\d{4}"
    r"|Present|Current|Now|Ongoing))?",
    re.IGNORECASE,
)


def _extract_markdown_dates(markdown: str) -> List[str]:
    return _MD_DATE_RE.findall(markdown)


def restore_dates_from_markdown(
    parsed_data: Dict[str, Any],
    markdown: str,
) -> Dict[str, Any]:
    """Patch year-only ``years`` fields using month-inclusive spans found in markdown."""
    md_dates = _extract_markdown_dates(markdown)
    if not md_dates:
        return parsed_data

    year_only_re = re.compile(r"\d{4}")
    year_to_full: Dict[str, str] = {}
    for md_date in md_dates:
        years_in_date = year_only_re.findall(md_date)
        if years_in_date:
            year_key = " - ".join(years_in_date)
            if year_key not in year_to_full:
                normalized = re.sub(r"\s*[-–—]\s*", " - ", md_date.strip())
                year_to_full[year_key] = normalized

    if not year_to_full:
        return parsed_data

    month_re = re.compile(
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
        re.IGNORECASE,
    )

    def patch_years(years_val: str) -> Optional[str]:
        if not isinstance(years_val, str) or not years_val.strip():
            return None
        if month_re.search(years_val):
            return None
        key = years_val.strip()
        if key in year_to_full:
            return year_to_full[key]
        return None

    patched = 0
    for key in ("work_experience", "education", "projects"):
        for entry in parsed_data.get(key) or []:
            if not isinstance(entry, dict):
                continue
            new_y = patch_years(entry.get("years") or "")
            if new_y:
                entry["years"] = new_y
                patched += 1

    if patched:
        logger.info("resume_upload_parse: restored months in %d date fields from markdown", patched)

    return parsed_data


# ── Pydantic schema (strict enough to validate; extra keys ignored) ───────────


class WorkExperienceItem(BaseModel):
    title: str = ""
    organization: str = ""
    location: str = ""
    years: str = ""
    bullets: List[str] = Field(default_factory=list)

    @field_validator("bullets", mode="before")
    @classmethod
    def _bullets(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, str) and v.strip():
            return [v.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []


class EducationItem(BaseModel):
    school: str = ""
    degree: str = ""
    years: str = ""
    details: str = ""


class ProjectItem(BaseModel):
    name: str = ""
    description: str = ""
    years: str = ""
    bullets: List[str] = Field(default_factory=list)

    @field_validator("bullets", mode="before")
    @classmethod
    def _bullets(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, str) and v.strip():
            return [v.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []


class UploadedResumeStructured(BaseModel):
    model_config = {"extra": "ignore"}

    full_name: str = ""
    headline: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    github: str = ""
    website: str = ""
    summary: str = ""
    skills: List[str] = Field(default_factory=list)
    work_experience: List[WorkExperienceItem] = Field(default_factory=list)
    education: List[EducationItem] = Field(default_factory=list)
    projects: List[ProjectItem] = Field(default_factory=list)

    @field_validator("skills", mode="before")
    @classmethod
    def _skills(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, str):
            parts = re.split(r"[,;|]\s*|\n+", v)
            return [p.strip() for p in parts if p.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []


RESUME_JSON_SCHEMA_HINT = """{
  "full_name": "string",
  "headline": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string (URL or path)",
  "github": "string (URL or path)",
  "website": "string",
  "summary": "string — 2-5 sentences professional summary if present else empty",
  "skills": ["skill1", "skill2"],
  "work_experience": [
    {
      "title": "Job title",
      "organization": "Company",
      "location": "City, ST or Remote",
      "years": "Jan 2020 - Present",
      "bullets": ["Achievement with metric", "…"]
    }
  ],
  "education": [
    {"school": "…", "degree": "BS Computer Science", "years": "2016 - 2020", "details": "Honors, GPA if worth keeping"}
  ],
  "projects": [
    {"name": "…", "description": "one line", "years": "", "bullets": ["…"]}
  ]
}"""


def _build_parse_prompt(markdown: str) -> str:
    clipped = markdown.strip()
    if len(clipped) > 52000:
        clipped = clipped[:52000] + "\n\n[… document truncated for parsing …]\n"
    return (
        "You extract structured résumé data from the following document text (Markdown or plain).\n"
        "Rules:\n"
        "- Copy facts faithfully; do not invent employers, degrees, dates, or metrics.\n"
        "- If a field is unknown, use empty string or empty array.\n"
        "- Preserve employment date ranges with months when shown in the source.\n"
        "- Split skills into individual array entries (not one long comma string).\n"
        "- work_experience bullets: action-led lines; keep numbers/units from source.\n\n"
        "Return ONLY valid JSON matching this shape (keys required; use defaults for missing sections):\n"
        f"{RESUME_JSON_SCHEMA_HINT}\n\n"
        "DOCUMENT:\n"
        f"{clipped}"
    )


def structured_to_plain_resume_text(data: UploadedResumeStructured) -> str:
    """Render structured résumé as plain text for the builder textarea (pipe-friendly lines)."""
    lines: List[str] = []
    name = (data.full_name or "").strip()
    if name:
        lines.append(name)
    head = (data.headline or "").strip()
    if head:
        lines.append(head)
    lines.append("")

    meta_bits = []
    for val in (
        (data.email or "").strip(),
        (data.phone or "").strip(),
        (data.linkedin or "").strip(),
        (data.github or "").strip(),
        (data.website or "").strip(),
    ):
        if val:
            meta_bits.append(val)
    if meta_bits:
        lines.append("  |  ".join(meta_bits))
        lines.append("")

    summ = (data.summary or "").strip()
    if summ:
        lines.append("SUMMARY")
        lines.append(summ)
        lines.append("")

    skills = [s.strip() for s in data.skills if s and str(s).strip()]
    if skills:
        lines.append("SKILLS")
        lines.append(", ".join(skills))
        lines.append("")

    if data.work_experience:
        lines.append("EXPERIENCE")
        for w in data.work_experience:
            title = (w.title or "").strip()
            org = (w.organization or "").strip()
            loc = (w.location or "").strip()
            yrs = (w.years or "").strip()
            pipe = " | ".join(p for p in (title, org, loc, yrs) if p)
            if pipe:
                lines.append(pipe)
            for b in w.bullets:
                bt = (b or "").strip()
                if bt:
                    lines.append(f"• {bt}")
            lines.append("")

    if data.education:
        lines.append("EDUCATION")
        for e in data.education:
            school = (e.school or "").strip()
            deg = (e.degree or "").strip()
            yrs = (e.years or "").strip()
            det = (e.details or "").strip()
            pipe = " | ".join(p for p in (school, deg, yrs) if p)
            if pipe:
                lines.append(pipe)
            if det:
                lines.append(f"• {det}")
            lines.append("")

    if data.projects:
        lines.append("PROJECTS")
        for p in data.projects:
            nm = (p.name or "").strip()
            desc = (p.description or "").strip()
            yrs = (p.years or "").strip()
            head_line = " | ".join(x for x in (nm, desc, yrs) if x)
            if head_line:
                lines.append(head_line)
            for b in p.bullets:
                bt = (b or "").strip()
                if bt:
                    lines.append(f"• {bt}")
            lines.append("")

    return "\n".join(lines).strip()


def _post_clean_resume_text(text: str) -> str:
    """Normalize PDF placeholder glyphs; keep line breaks (same semantics as resume_gui.app)."""
    text = re.sub(r"\(\s*cid\s*:\s*\d+\)", " • ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUsed\s*:\s*to\b", "Used to", text, flags=re.IGNORECASE)
    lines = [" ".join(ln.split()) for ln in text.splitlines()]
    return "\n".join(lines).strip()


def _merge_split_word_tokens(tokens: List[str]) -> List[str]:
    """Fuse a lone uppercase letter with the following lowercase token (pdfplumber quirk)."""
    skip_single = frozenset({"I", "A"})
    out: List[str] = []
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


def _extract_pdf_text_pdfplumber(content: bytes) -> str:
    """Word-spacing-aware PDF extract when MarkItDown returns empty."""
    import pdfplumber

    pages_text: List[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(x_tolerance=1, y_tolerance=3, keep_blank_chars=False)
            if not words:
                pages_text.append(page.extract_text() or "")
                continue
            line_map: Dict[int, List[str]] = {}
            for w in words:
                y_key = round(float(w["top"]) / 4) * 4
                line_map.setdefault(y_key, []).append(w["text"])
            page_lines = [
                " ".join(_merge_split_word_tokens(tokens))
                for _, tokens in sorted(line_map.items())
            ]
            pages_text.append("\n".join(page_lines))
    return _post_clean_resume_text("\n".join(pages_text))


def markdown_from_upload_bytes(
    content: bytes,
    filename: str,
    pdf_plain_fallback: Optional[str] = None,
) -> str:
    """Backward-compatible: returns markdown/plain text only (see ``extract_upload_markdown``)."""
    return extract_upload_markdown(content, filename, pdf_plain_fallback).markdown


def llm_resume_markdown_to_structured(markdown: str) -> Dict[str, Any]:
    """
    Call configured LLM(s) to produce structured JSON, validate, apply date repair.

    Raises RuntimeError if no provider succeeds.
    """
    from google.genai import types

    from resume_library import (
        _GROK_FALLBACK_MODELS,
        _backoff_if_rate_limited,
        _is_grok,
        _json_grok,
        _model_chain,
        _optional_gemini_client,
        _transient_provider_error,
        grok_preferred_for_throughput,
        primary_gemini_flash_model,
        primary_llm_model_for_resume_workloads,
    )

    prompt = _build_parse_prompt(markdown)

    if grok_preferred_for_throughput():
        seen: set[str] = set()
        chain = []
        prim = primary_llm_model_for_resume_workloads()
        for m in (prim,) + _GROK_FALLBACK_MODELS + tuple(_model_chain(primary_gemini_flash_model())):
            if m and m not in seen:
                seen.add(m)
                chain.append(m)
    else:
        chain = _model_chain(primary_gemini_flash_model())

    api_key = (os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()
    client: Any = _optional_gemini_client() if api_key else None

    last_exc: Optional[BaseException] = None

    for model in chain:
        try:
            if _is_grok(model):
                parsed = _json_grok(model, prompt, temperature=0.1)
                if not parsed or not isinstance(parsed, dict):
                    continue
            else:
                if client is None:
                    continue
                cfg = types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                )
                r = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=cfg,
                )
                raw = (getattr(r, "text", None) or "").strip()
                if not raw:
                    continue
                parsed = json.loads(raw)
                if not isinstance(parsed, dict):
                    continue

            patched = restore_dates_from_markdown(parsed, markdown)
            validated = UploadedResumeStructured.model_validate(patched)
            logger.info("resume_upload_parse: LLM structured parse succeeded on model %s", model)
            return validated.model_dump()

        except Exception as exc:
            last_exc = exc
            logger.warning("resume_upload_parse: model %s failed: %s", model, exc)
            if _transient_provider_error(exc):
                _backoff_if_rate_limited(exc)
            continue

    if last_exc:
        raise RuntimeError(f"Structured resume parse failed: {last_exc}") from last_exc
    raise RuntimeError(
        "Structured resume parse failed: no LLM response (check GOOGLE_API_KEY / GEMINI_API_KEY or XAI_API_KEY)."
    )


def parse_upload_resume_full_pipeline(markdown: str) -> tuple[Dict[str, Any], str, str, List[str]]:
    """
    Returns ``(structured_dict, plain_text, status, hints)``.

    ``status`` is ``ready`` or ``llm_failed``. ``hints`` is non-empty when structured
    parsing failed but extracted text is still usable.
    """
    hints: List[str] = []
    try:
        structured = llm_resume_markdown_to_structured(markdown)
        model = UploadedResumeStructured.model_validate(structured)
        return structured, structured_to_plain_resume_text(model), "ready", hints
    except Exception as exc:
        logger.warning("resume_upload_parse: LLM pipeline failed, falling back to markdown-only text: %s", exc)
        fallback = re.sub(r"^#+\s*", "", markdown, flags=re.MULTILINE).strip()
        hints.append(
            "Structured résumé parsing did not finish (model unavailable or output invalid). "
            "You can still edit the extracted text below — try again later for automatic section layout."
        )
        return {}, fallback, "llm_failed", hints
