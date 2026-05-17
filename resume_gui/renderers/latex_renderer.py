from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from jinja2 import Environment, FileSystemLoader, StrictUndefined


def _latex_escape(value: str) -> str:
    text = value or ""
    # Order: replace `\` first, then `%` (which is LaTeX comment char).
    text = text.replace("\\", "\\textbackslash{} ")
    text = text.replace("%", "\\%")
    text = text.replace("&", "\\&")
    text = text.replace("$", "\\$")
    text = text.replace("#", "\\#")
    text = text.replace("_", "\\_")
    text = text.replace("{", "\\{")
    text = text.replace("}", "\\}")
    text = text.replace("~", "\\textasciitilde{}")
    text = text.replace("^", "\\textasciicircum{}")
    return text


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
