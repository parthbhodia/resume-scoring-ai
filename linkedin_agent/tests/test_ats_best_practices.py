"""Unit tests for ATS best-practice evaluator."""

from linkedin_agent.ats_best_practices import evaluate_ats_best_practices


def test_exact_title_in_header_requires_literal_phrase():
    text = (
        "Jane Doe\n"
        "Product Lead\n"
        "Summary\n"
        "Senior product leader with 8 years experience.\n"
    )
    out = evaluate_ats_best_practices(
        text,
        target_role="Senior Product Manager",
        has_jd=True,
        jd_keywords_found=10,
    )
    by_id = {c["id"]: c for c in out["checks"]}
    assert by_id["exact_title_header"]["pass"] is False
    assert by_id["exact_job_title"]["pass"] is True  # tokens still match loosely


def test_exact_title_in_header_passes_when_literal():
    text = "Jane Doe\nSenior Product Manager\nSummary\nBuilt products.\n"
    out = evaluate_ats_best_practices(text, target_role="Senior Product Manager", has_jd=True)
    by_id = {c["id"]: c for c in out["checks"]}
    assert by_id["exact_title_header"]["pass"] is True


def test_keyword_band_when_jd_present():
    text = "Jane Doe\nEngineer\nExperience\nPython React AWS Docker Kubernetes.\n" * 3
    low = evaluate_ats_best_practices(text, has_jd=True, jd_keywords_found=12)
    mid = evaluate_ats_best_practices(text, has_jd=True, jd_keywords_found=28)
    high = evaluate_ats_best_practices(text, has_jd=True, jd_keywords_found=42)
    assert next(c for c in low["checks"] if c["id"] == "keyword_band")["pass"] is False
    assert next(c for c in mid["checks"] if c["id"] == "keyword_band")["pass"] is True
    assert next(c for c in high["checks"] if c["id"] == "keyword_band")["pass"] is False


def test_creative_section_headers_fail():
    text = "Jane Doe\nMy Journey\nDid things.\n"
    out = evaluate_ats_best_practices(text)
    by_id = {c["id"]: c for c in out["checks"]}
    assert by_id["standard_headers"]["pass"] is False
