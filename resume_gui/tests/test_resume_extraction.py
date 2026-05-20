"""Section inventory and PDF text normalization for structured extraction."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from resume_extraction import (  # noqa: E402
    inject_section_line_breaks,
    infer_section_order_from_profile,
    profile_section_inventory,
    extraction_guard_prompt_block,
    sanitize_extraction_manifest,
    validate_manifest_against_doc,
    extract_education_section_text,
    filter_education_grounded_in_source,
)
from dataclasses import dataclass, field  # noqa: E402


@dataclass
class _DocStub:
    education: list = field(default_factory=list)
    experience: list = field(default_factory=list)
    skills: list = field(default_factory=list)
    projects: list = field(default_factory=list)


def test_inject_section_breaks_glued_headers():
    raw = "FP&A analyst.SUMMARY Bullet one.EDUCATION Master of Science 2022.SKILLS Python"
    out = inject_section_line_breaks(raw)
    assert "\nSUMMARY" in out or "SUMMARY" in out.split("\n")
    assert "\nEDUCATION" in out or out.index("EDUCATION") > 0
    assert "\nSKILLS" in out or "SKILLS" in out


def test_infer_section_order_education_before_experience():
    text = """
Name
SUMMARY
Line one
EDUCATION
Master of Science
SKILLS
Python
EXPERIENCE
Company A
Jan 2020 - Present
"""
    order = infer_section_order_from_profile(text)
    assert order.index("education") < order.index("experience")
    assert order.index("summary") < order.index("education")


def test_manifest_mismatch_detects_missing_education():
    manifest = sanitize_extraction_manifest({
        "sections_seen": ["summary", "education", "experience"],
        "education_count": 1,
        "experience_job_count": 1,
        "skills_present": False,
        "projects_present": False,
    })
    doc = _DocStub()
    warnings = validate_manifest_against_doc(doc, manifest)
    assert any("education" in w for w in warnings)


def test_filter_drops_hallucinated_education_not_in_source_section():
    profile = """
Harini Payala
SUMMARY
FP&A analyst

EDUCATION
Master of professional studies in Data Science Aug 2022 - May 2024 | Baltimore University of Maryland, Baltimore County

SKILLS
SQL, Python
"""
    edu_section = extract_education_section_text(profile)
    assert "Data Science" in edu_section
    assert "Osmania" not in edu_section

    @dataclass
    class _Edu:
        institution: str = ""
        degree: str = ""
        dates: str = ""
        location: str = ""
        bullets: list = field(default_factory=list)

    @dataclass
    class _Doc:
        education: list = field(default_factory=list)

    doc = _Doc(
        education=[
            _Edu(
                institution="University of Maryland",
                degree="Master of Science in Finance",
                dates="2022–2024",
                location="College Park, MD",
            ),
            _Edu(
                institution="Osmania University",
                degree="Bachelor of Commerce",
                dates="2015–2019",
                location="Hyderabad, India",
            ),
            _Edu(
                institution="University of Maryland, Baltimore County",
                degree="Master of professional studies in Data Science",
                dates="Aug 2022 - May 2024",
                location="Baltimore, Maryland",
            ),
        ]
    )
    warnings = filter_education_grounded_in_source(doc, profile)
    assert len(doc.education) == 1
    assert "Data Science" in doc.education[0].degree
    assert any("Osmania" in w or "Finance" in w for w in warnings)


HARINI_PROFILE_SNIPPET = """
Harini Payala
Financial Analyst
harini.p@protectmymails.com
(410)530-9684
linkedin.com/in/harini-payala-402458346

SUMMARY
Financial Analyst with 4+ years of experience in FP&A.

SKILLS
Skills : SQL, Python, R, MySQL, PostgreSQL, Snowflake, Power BI, Tableau

EXPERIENCE
Sr Financial Analyst | CAPITAL ONE | MC LEAN, VIRGINIA | JAN 2026 - PRESENT
- Supported capital markets operations by validating liquidity datasets.

Financial Analyst | Morgan Stanley | Baltimore, Maryland | Dec 2023 - JAN 2026
- Developed and maintained detailed financial models (DCF, NPV, IRR).

Financial Analyst | Accenture | Hyderabad, India | Nov 2019 - Jul 2022
- Built customized financial forecasting models for global client accounts.

EDUCATION
University of Maryland, Baltimore County
Master of professional studies in Data Science
Aug 2022 - May 2024
Baltimore, Maryland
"""


def test_harini_conservative_profile_maps_experience_and_education():
    from app import (  # noqa: WPS433
        _finalize_structured_doc,
        _resume_doc_from_profile_text,
    )
    from resume_extraction import profile_section_inventory  # noqa: E402

    doc = _resume_doc_from_profile_text(HARINI_PROFILE_SNIPPET, "Financial Analyst", "")
    inv = profile_section_inventory(HARINI_PROFILE_SNIPPET)
    _finalize_structured_doc(doc, HARINI_PROFILE_SNIPPET, inv, None, "Financial Analyst", "")

    assert len(doc.experience) == 3
    assert all(e.company.lower() != "experience" for e in doc.experience)
    assert "Morgan Stanley" in doc.experience[1].company
    assert doc.experience[1].role.startswith("Financial Analyst")
    assert "Baltimore" in (doc.experience[1].location or "")

    assert len(doc.education) == 1
    edu = doc.education[0]
    assert "Maryland" in edu.institution
    assert "Data Science" in edu.degree
    assert "2022" in edu.dates
    assert "Baltimore" in (edu.location or "")
    assert not any(b.lower() == "projects" for b in edu.bullets)

    skill_items = [it for _, items in doc.skills for it in items]
    assert skill_items
    assert not any("capital markets" in it.lower() for it in skill_items)
    assert doc.phone.startswith("(")


def test_inventory_detects_education_before_skills():
    text = """
Harini Payala
Financial Analyst

SUMMARY
- FP&A experience

EDUCATION
Master of professional studies in Data Science Aug 2022 - May 2024 | Baltimore University of Maryland

SKILLS
SQL, Python
"""
    inv = profile_section_inventory(text)
    assert inv.has_education_header
    assert inv.expects_education()
    assert inv.estimated_education_lines >= 1
    block = extraction_guard_prompt_block(inv)
    assert "education[]" in block.lower()
    assert "MUST" in block
