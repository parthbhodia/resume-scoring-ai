"""Regression tests for structured ResumeDocModel mapping (projects, tailor preserve)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "renderers"))

from latex_renderer import (  # noqa: E402
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ResumeDocModel,
)


def _project_items_from_llm_projects(raw_projects):
    """Mirror of resume_gui.app._project_items_from_llm_projects."""
    out: list[ProjectItem] = []
    for proj in raw_projects or []:
        if not isinstance(proj, dict):
            continue
        name_p = " ".join((str(proj.get("name") or "")).split())
        p_buls = [" ".join((str(b)).split()) for b in (proj.get("bullets") or []) if str(b).strip()]
        if name_p and p_buls:
            out.append(ProjectItem(name=name_p, bullets=p_buls))
        elif name_p:
            out.append(ProjectItem(name=name_p, bullets=[]))
        elif p_buls:
            out.append(ProjectItem(name="", bullets=p_buls))
    return out


def _resume_doc_with_updates(doc: ResumeDocModel, **overrides) -> ResumeDocModel:
    """Mirror of resume_gui.app._resume_doc_with_updates."""
    return ResumeDocModel(
        full_name=overrides.get("full_name", doc.full_name),
        headline=overrides.get("headline", doc.headline),
        location=overrides.get("location", doc.location),
        email=overrides.get("email", doc.email),
        phone=overrides.get("phone", doc.phone),
        linkedin=overrides.get("linkedin", doc.linkedin),
        github=overrides.get("github", doc.github),
        summary=overrides.get("summary", doc.summary),
        skills=overrides.get("skills", doc.skills),
        experience=overrides.get("experience", doc.experience),
        education=overrides.get("education", doc.education),
        projects=overrides.get("projects", doc.projects),
        extra_sections=overrides.get("extra_sections", doc.extra_sections),
    )


def test_project_items_from_llm_json():
    raw = [
        {"name": "Resume Agent", "bullets": ["Built with LangGraph", "800+ stars"]},
        {"name": "CLI Tool", "bullets": ["Published on PyPI"]},
    ]
    items = _project_items_from_llm_projects(raw)
    assert len(items) == 2
    assert items[0].name == "Resume Agent"
    assert len(items[0].bullets) == 2
    assert items[1].name == "CLI Tool"


def test_resume_doc_with_updates_preserves_education_and_projects():
    doc = ResumeDocModel(
        full_name="Jane Doe",
        summary="Old summary",
        experience=[
            ExperienceItem(company="Acme", role="Engineer", bullets=["Did things"]),
        ],
        education=[
            EducationItem(
                institution="MIT",
                degree="MS CS",
                dates="2020",
                bullets=["GPA 4.0"],
            )
        ],
        projects=[ProjectItem(name="Side Project", bullets=["Shipped v1"])],
        skills=[("Languages", ["Python"])],
    )
    tailored = _resume_doc_with_updates(
        doc,
        summary="New summary",
        experience=[
            ExperienceItem(company="Acme", role="Engineer", bullets=["Improved things 40%"]),
        ],
    )
    assert tailored.summary == "New summary"
    assert len(tailored.experience) == 1
    assert tailored.experience[0].bullets[0].startswith("Improved")
    assert len(tailored.education) == 1
    assert tailored.education[0].institution == "MIT"
    assert len(tailored.projects) == 1
    assert tailored.projects[0].name == "Side Project"
    assert tailored.skills == doc.skills
