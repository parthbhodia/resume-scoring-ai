"""JD-driven requirement matching (no global alias map)."""
from resume_gui.tailor.requirement_match import (
    classify_role_family,
    match_requirement,
    requirement_from_gap_label,
    verify_gap_in_resume,
)
from resume_gui.tailor.requirement_match.normalize import phrase_exists


def test_phrase_exists_java_not_javascript():
    assert phrase_exists("Built services in Java Spring", "java")
    assert not phrase_exists("Built services in JavaScript", "java")


def test_phrase_exists_sql_not_nosql():
    assert phrase_exists("Designed SQL schemas", "sql")
    assert not phrase_exists("Experience with NoSQL databases", "sql")


def test_nuxt_from_jd_vocabulary_and_resume():
    jd = "Must have Nuxt.js framework experience for SSR apps."
    req = requirement_from_gap_label(
        "Nuxt.js framework",
        "qualification",
        job_description=jd,
    )
    resume = "Built SSR features using Nuxt.js for federal platforms."
    match = match_requirement(resume, req)
    assert match.matched
    assert match.method in ("exact", "alias")


def test_abbreviation_nec_electrician_jd():
    jd = "Knowledge of National Electrical Code required for commercial wiring."
    req = requirement_from_gap_label(
        "National Electrical Code",
        "qualification",
        job_description=jd,
        role_family="skilled_trades",
    )
    resume = "Installed panels per NEC on commercial sites."
    match = match_requirement(resume, req)
    assert match.matched
    assert match.method in ("alias", "abbreviation", "exact")


def test_role_family_software():
    jd = "Senior React developer with TypeScript and Node.js backend."
    assert classify_role_family(jd) == "software"


def test_verify_gap_in_resume_not_found():
    match = verify_gap_in_resume(
        "REST APIs only",
        "GraphQL federation",
        job_description="GraphQL federation required.",
        applied_text="REST endpoints",
        gap_type="qualification",
    )
    assert not match.matched
    assert match.method == "not_found"
