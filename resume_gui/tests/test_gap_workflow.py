"""Tests for tailor gap workflow (stable IDs + deterministic verification)."""
from resume_gui.tailor.gap_workflow import (
    apply_gap_workflow,
    attach_gap_ids,
    contains_skill_evidence,
    parse_addressed_gaps,
    stable_gap_id,
)
from resume_gui.tailor.requirement_match import verify_gap_in_resume


def test_stable_gap_id_deterministic():
    assert stable_gap_id("Nuxt.js framework", "qualification") == stable_gap_id(
        "Nuxt.js framework", "qualification",
    )


def test_java_not_javascript_evidence():
    assert contains_skill_evidence("Built APIs in Java Spring", "Java")
    assert not contains_skill_evidence("Built APIs in Java Spring", "JavaScript")


def test_verify_returns_match_metadata():
    m = verify_gap_in_resume("Nuxt.js SSR", "Nuxt.js framework", job_description="Nuxt.js framework")
    assert m.matched
    assert m.method in ("exact", "alias", "abbreviation")


def test_nuxt_evidence_after_apply():
    text = "Leveraging Nuxt.js conventions for SSR and routing in Vue apps."
    assert contains_skill_evidence(text, "Nuxt.js framework")


def test_apply_gap_workflow_verified_moves_to_covered():
    ratings = {
        "qualifications": {
            "score": 50,
            "covered": [],
            "missing": [{"text": "Nuxt.js framework", "analysis": "gap"}],
            "resolved_by_user": [],
        },
        "responsibilities": {"score": 0, "covered": [], "missing": [], "resolved_by_user": []},
        "keywords": {
            "direct_skills": {"found": [], "missing": []},
            "contextual": {"found": [], "missing": []},
            "found_count": 0,
            "total_count": 0,
        },
    }
    addressed = parse_addressed_gaps([
        {
            "label": "Nuxt.js framework",
            "type": "qualification",
            "appliedText": "Used Nuxt.js for SSR features.",
        },
    ])
    merged = apply_gap_workflow(
        ratings,
        "Nuxt.js SSR in production",
        addressed,
        job_description="Nuxt.js framework required.",
    )
    qual = merged["qualifications"]
    assert len(qual["missing"]) == 0
    assert len(qual["covered"]) == 1
    assert qual["covered"][0].get("status") == "verified_covered"


def test_apply_gap_workflow_unverified_goes_resolved():
    ratings = {
        "qualifications": {
            "score": 50,
            "covered": [],
            "missing": [{"text": "GraphQL federation", "analysis": "gap"}],
            "resolved_by_user": [],
        },
        "responsibilities": {"score": 0, "covered": [], "missing": [], "resolved_by_user": []},
    }
    addressed = parse_addressed_gaps([
        {"label": "GraphQL federation", "type": "qualification", "appliedText": "REST only"},
    ])
    merged = apply_gap_workflow(
        ratings,
        "Built REST APIs only",
        addressed,
        job_description="GraphQL federation required.",
    )
    qual = merged["qualifications"]
    assert len(qual["missing"]) == 0
    assert len(qual["resolved_by_user"]) == 1
    assert qual["resolved_by_user"][0].get("status") == "resolved_by_user"


def test_attach_gap_ids():
    ratings = {
        "qualifications": {
            "score": 1,
            "covered": [{"text": "Vue.js"}],
            "missing": [{"text": "Nuxt.js"}],
        },
    }
    out = attach_gap_ids(ratings)
    assert out["qualifications"]["covered"][0]["id"].startswith("qualification:")
