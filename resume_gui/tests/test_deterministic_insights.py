"""Tests for the deterministic recruiter-check surfacing layer.

These checks are rule-based (no LLM) and are injected into the analysis result
AFTER the honesty pipeline, so they must be precise: a false positive here is a
dishonest claim shown to the user. Covers the newly-added checks (buzzwords,
summary length, portfolio, spelling) plus the check→category injection.

Run with:  pytest resume_gui/tests/test_deterministic_insights.py -v
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("XAI_API_KEY", "test")
os.environ.setdefault("GOOGLE_API_KEY", "test")
_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "linkedin_agent"))

import pytest  # noqa: E402

from resume_gui.analysis.comprehensive import (  # noqa: E402
    _extract_summary_block,
    _find_misspellings,
    _recruiter_checks,
)
from resume_gui.analysis.deterministic_insights import (  # noqa: E402
    _CHECK_CATEGORY,
    build_deterministic_issues,
    inject_deterministic_insights,
)


def _check(struct: dict, cid: str) -> dict:
    return next(c for c in struct["checks"] if c["id"] == cid)


# ── Buzzwords: narrowed to universal filler; domain vocabulary must NOT fire ──

def test_buzzwords_flags_universal_filler():
    text = "SUMMARY\nA results-driven team player and self-starter with a strong work ethic."
    buzz = _check(_recruiter_checks(text), "buzzwords")
    assert not buzz["passed"]
    joined = " ".join(buzz["items"]).lower()
    assert "results-driven" in joined or "results driven" in joined
    assert "team player" in joined


@pytest.mark.parametrize("word", [
    "framework", "scalable", "efficient", "reliable", "robust", "proven",
    "driven", "leverage", "leveraging",
])
def test_buzzwords_does_not_flag_domain_vocabulary(word):
    """Domain-ambiguous technical words are legitimate in some fields and must
    never be flagged as buzzwords (discipline-agnostic invariant)."""
    text = f"WORK EXPERIENCE\n- Designed a GIS visualization {word} for real-time anomaly detection."
    buzz = _check(_recruiter_checks(text), "buzzwords")
    joined = " ".join(buzz["items"]).lower()
    assert word not in joined


# ── Summary length: the Professional Summary block specifically ──────────────

def test_summary_block_extraction_and_length():
    long_summary = " ".join(["word"] * 90)
    text = f"PROFESSIONAL SUMMARY\n{long_summary}\n\nWORK EXPERIENCE\n- Built things."
    block = _extract_summary_block(text)
    assert len(block.split()) == 90
    sl = _check(_recruiter_checks(text), "summary_length")
    assert not sl["passed"]
    assert "90" in " ".join(sl["items"])


def test_summary_length_passes_when_concise():
    text = "SUMMARY\nBackend engineer focused on payments and reliability.\n\nEXPERIENCE\n- Did work."
    sl = _check(_recruiter_checks(text), "summary_length")
    assert sl["passed"]


def test_no_summary_section_is_not_penalized():
    text = "WORK EXPERIENCE\n- Built and shipped a service handling 2M requests/day."
    sl = _check(_recruiter_checks(text), "summary_length")
    assert sl["passed"]  # absence of a summary isn't a summary-length problem


# ── Portfolio: bare display words count, not only URLs ───────────────────────

def test_portfolio_detected_from_bare_word():
    text = "Jane Doe | jane@example.com | LinkedIn | GitHub"
    port = _check(_recruiter_checks(text), "portfolio")
    assert port["passed"]


def test_portfolio_missing_when_absent():
    text = "Jane Doe | jane@example.com | 555-1234"
    port = _check(_recruiter_checks(text), "portfolio")
    assert not port["passed"]


# ── Spelling: must not false-positive on emails or tech vocabulary ───────────

def test_spelling_ignores_email_derived_tokens():
    # "gmail" must not be flagged — it comes from the email address.
    flagged = _find_misspellings("Contact: parth.bhodia08@gmail.com")
    joined = " ".join(flagged).lower()
    assert "gmail" not in joined


def test_spelling_ignores_tech_allowlist():
    flagged = _find_misspellings("Improved admin panel and backend auth middleware config.")
    joined = " ".join(flagged).lower()
    for w in ("admin", "backend", "auth", "middleware", "config"):
        assert w not in joined


def test_spelling_catches_a_real_typo():
    flagged = _find_misspellings("Managment of the team and projcet delivery.")
    joined = " ".join(flagged).lower()
    # At least one of the obvious typos should surface (dictionary-dependent).
    assert "managment" in joined or "projcet" in joined


# ── Role depth: education entries are not under-described work roles ──────────

def test_role_depth_excludes_education_entries():
    text = (
        "WORK EXPERIENCE\n"
        "Senior Engineer | Acme | Jan 2020 - Present\n"
        "- Cut latency 40% across the checkout path.\n"
        "- Led a team of 5 engineers.\n"
        "- Shipped 12 services to production.\n"
        "EDUCATION\n"
        "University of Maryland | August 2021 - May 2023\n"
        "Master of Science, Computer Science\n"
    )
    rd = _check(_recruiter_checks(text), "role_depth")
    items_blob = " ".join(rd["items"]).lower()
    assert "university" not in items_blob
    assert "maryland" not in items_blob


# ── Injection: category mapping + dedup against LLM issues ───────────────────

def test_inject_maps_checks_to_categories():
    text = "WORK EXPERIENCE\n- Built and maintained the onboarding flow for new users."
    struct = _recruiter_checks(text)
    issues = build_deterministic_issues(struct)
    for it in issues:
        assert it["category"] in set(_CHECK_CATEGORY.values())
        assert it["source"] == "deterministic"
        assert it["severity"] in ("low", "medium", "high")


def test_inject_dedups_against_existing_llm_issue():
    struct = {"checks": [{
        "id": "pronouns", "name": "No Personal Pronouns", "passed": False,
        "score": 4, "detail": "Remove pronouns.", "items": ["I built things"],
    }]}
    result = {"topIssues": [{
        "issue": "No Personal Pronouns in bullets",
        "severity": "medium", "whyItMatters": "x", "suggestion": "y",
    }]}
    out = inject_deterministic_insights(result, struct)
    det = [it for it in out["topIssues"] if it.get("source") == "deterministic"]
    assert len(det) == 0  # LLM already named this; deterministic one deduped out


def test_inject_adds_issue_llm_missed():
    struct = {"checks": [{
        "id": "buzzwords", "name": "Buzzwords", "passed": False,
        "score": 4, "detail": "Filler.", "items": ["team player"],
    }]}
    result = {"topIssues": [{
        "issue": "Quantify your impact", "severity": "high",
        "whyItMatters": "x", "suggestion": "y",
    }]}
    out = inject_deterministic_insights(result, struct)
    det = [it for it in out["topIssues"] if it.get("source") == "deterministic"]
    assert len(det) == 1
    assert det[0]["category"] == "languageQuality"
    assert det[0]["items"] == ["team player"]
