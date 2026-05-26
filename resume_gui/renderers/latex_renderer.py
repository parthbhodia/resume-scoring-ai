from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_BULLET_PREFIX_RE = re.compile(r"^[\s•\-\*·◦▪‣]+\s*")


def _latex_escape(value: str) -> str:  # noqa: C901
    text = value or ""

    # -----------------------------------------------------------------------
    # Step 1 -- Unicode -> pure-ASCII substitutions.
    # Must happen BEFORE the LaTeX-command substitutions (step 3+) so that
    # we don't accidentally re-escape the backslashes we introduce later.
    # -----------------------------------------------------------------------

    # Non-breaking space -> regular space
    text = text.replace(" ", " ")

    # Dashes: en-dash -> --, em-dash -> ---
    text = text.replace("–", "--")   # en-dash
    text = text.replace("—", "---")  # em-dash
    text = text.replace("‒", "--")   # figure dash
    text = text.replace("―", "---")  # horizontal bar

    # Smart / curly quotes -> straight ASCII
    text = text.replace("‘", "'")    # left single quote
    text = text.replace("’", "'")    # right single quote / apostrophe
    text = text.replace("‚", ",")    # single low-9 quotation mark
    text = text.replace("‛", "'")    # single high-reversed quotation
    text = text.replace("“", "``")   # left double quote
    text = text.replace("”", "''")   # right double quote
    text = text.replace("„", ",,")   # double low-9 quotation mark

    # Ellipsis -> three dots
    text = text.replace("…", "...")

    # Bullet / list markers that might appear outside the bullet prefix
    for ch in "•·▪‣◦⁃∙":
        text = text.replace(ch, "")

    # -----------------------------------------------------------------------
    # Step 2 -- Escape the backslash FIRST (standard LaTeX rule).
    # Any \ remaining at this point came from the original user text; our
    # own LaTeX-command \ chars are added in steps 3-5 below, so they
    # won't be double-escaped.
    # -----------------------------------------------------------------------
    text = text.replace("\\", "\\textbackslash{} ")

    # -----------------------------------------------------------------------
    # Step 3 -- Standard LaTeX special characters (ASCII, no curly braces yet).
    # -----------------------------------------------------------------------
    text = text.replace("%", "\\%")
    text = text.replace("&", "\\&")
    text = text.replace("$", "\\$")
    text = text.replace("#", "\\#")
    text = text.replace("_", "\\_")

    # -----------------------------------------------------------------------
    # Step 4 -- Escape { and } so any literal braces in the original are safe.
    # The \command{} sequences we add in step 5 are NEW braces; they won't
    # be affected because we've already processed all original { } here.
    # -----------------------------------------------------------------------
    text = text.replace("{", "\\{")
    text = text.replace("}", "\\}")

    # -----------------------------------------------------------------------
    # Step 5 -- Remaining special characters that expand to \command{} form.
    # Safe to add now because step 4 has already consumed original braces.
    # -----------------------------------------------------------------------
    text = text.replace("~", "\\textasciitilde{}")
    text = text.replace("^", "\\textasciicircum{}")

    # Angle brackets
    text = text.replace("<", "\\textless{}")
    text = text.replace(">", "\\textgreater{}")

    # Misc symbols LLMs sometimes emit
    text = text.replace("°", "\\textdegree{}")      # degree
    text = text.replace("®", "\\textregistered{}")  # registered
    text = text.replace("™", "\\texttrademark{}")   # trademark
    text = text.replace("©", "\\textcopyright{}")   # copyright

    # -----------------------------------------------------------------------
    # Step 6 -- Safety net: drop any remaining non-latin-1 chars.
    # T1 encoding only covers latin-1 (ISO 8859-1); anything outside it
    # will cause pdflatex to bail. We replace unknowns with '?' rather than
    # raising so compilation always succeeds.
    # -----------------------------------------------------------------------
    try:
        text = text.encode("latin-1", errors="replace").decode("latin-1")
    except Exception:
        pass

    return text
def _latex_escape_bullet(value: str) -> str:
    """Escape bullet body text and strip leading •/- so LaTeX \\item does not double-mark."""
    text = _BULLET_PREFIX_RE.sub("", (value or "").strip())
    return _latex_escape(text)


@dataclass
class ExperienceItem:
    company: str
    role: str
    dates: str = ""
    location: str = ""
    bullets: list[str] = field(default_factory=list)


@dataclass
class EducationItem:
    """One school row — maps to ``\\resumeSubheading`` in Harshibar (same 4-cell layout as jobs)."""

    institution: str
    degree: str = ""
    dates: str = ""
    location: str = ""
    bullets: list[str] = field(default_factory=list)


@dataclass
class ProjectItem:
    """One project with a visible title and detail bullets (no repeated ``Name:`` on each bullet)."""

    name: str
    bullets: list[str] = field(default_factory=list)


@dataclass
class ResumeDocModel:
    full_name: str
    headline: str = ""
    location: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    github: str = ""
    summary: str = ""
    skills: list[tuple[str, list[str]]] = field(default_factory=list)
    experience: list[ExperienceItem] = field(default_factory=list)
    education: list[EducationItem] = field(default_factory=list)
    projects: list[ProjectItem] = field(default_factory=list)
    extra_sections: list[tuple[str, list[str]]] = field(default_factory=list)
    # PDF section order (e.g. education before experience) — used by Harshibar template.
    section_order: list[str] = field(
        default_factory=lambda: ["summary", "experience", "education", "skills", "projects"]
    )


class JinjaLatexRenderer:
    """Deterministic LaTeX renderer scaffold.

    This intentionally does not own tailoring logic yet. It only renders a
    validated structured model into LaTeX.
    """

    def __init__(self, templates_dir: Optional[Path] = None) -> None:
        base = templates_dir or (Path(__file__).resolve().parent.parent / "templates" / "latex")
        self._env = Environment(
            loader=FileSystemLoader(str(base)),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
            undefined=StrictUndefined,
        )
        self._env.filters["latex"] = _latex_escape
        self._env.filters["bullet_latex"] = _latex_escape_bullet

    def render(self, doc: ResumeDocModel, template_name: str = "classic_resume.tex.j2") -> str:
        template = self._env.get_template(template_name)
        return template.render(doc=doc)

    def render_from_string(self, doc: ResumeDocModel, template_source: str) -> str:
        template = self._env.from_string(template_source)
        return template.render(doc=doc)


def normalize_skill_items(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        v = " ".join((item or "").split())
        if v:
            out.append(v)
    return out
