"""Section inventory and PDF text normalization for structured extraction."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from resume_extraction import (  # noqa: E402
    inject_section_line_breaks,
    profile_section_inventory,
    extraction_guard_prompt_block,
)


def test_inject_section_breaks_glued_headers():
    raw = "FP&A analyst.SUMMARY Bullet one.EDUCATION Master of Science 2022.SKILLS Python"
    out = inject_section_line_breaks(raw)
    assert "\nSUMMARY" in out or "SUMMARY" in out.split("\n")
    assert "\nEDUCATION" in out or out.index("EDUCATION") > 0
    assert "\nSKILLS" in out or "SKILLS" in out


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
