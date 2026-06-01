"""Tests for merged professional tenure from experience date strings."""

from datetime import date

from resume_gui.experience_tenure import (
    compute_experience_summary,
    format_tenure_label,
    _merge_intervals,
    _months_inclusive,
    _parse_date_range,
)


def test_parse_month_year_to_present():
    today = date(2026, 5, 31)
    parsed = _parse_date_range("May 2025 – Present", today=today)
    assert parsed is not None
    start, end = parsed
    assert start == date(2025, 5, 1)
    assert end == today


def test_parse_year_only_range():
    parsed = _parse_date_range("2020 – 2022", today=date(2026, 1, 1))
    assert parsed == (date(2020, 1, 1), date(2022, 12, 31))


def test_merge_overlapping_intervals():
    iv = [
        (date(2020, 1, 1), date(2021, 6, 30)),
        (date(2021, 1, 1), date(2022, 12, 31)),
    ]
    merged = _merge_intervals(iv)
    assert len(merged) == 1
    assert merged[0] == (date(2020, 1, 1), date(2022, 12, 31))


def test_compute_summary_merges_roles():
    today = date(2026, 5, 31)
    summary = compute_experience_summary(
        [
            {"company": "A", "role": "Intern", "dates": "Jan 2025 – Present"},
            {"company": "B", "role": "Dev", "dates": "Jun 2024 – Dec 2024"},
        ],
        today=today,
    )
    assert summary["roleCount"] == 2
    assert summary["datedRoleCount"] == 2
    assert summary["totalMonths"] == _months_inclusive(date(2024, 6, 1), today)
    assert summary["totalYearsLabel"] in ("1 year", "2 years", "< 1 year")


def test_format_tenure_label():
    assert format_tenure_label(0) == "No dated experience"
    assert format_tenure_label(8) == "< 1 year"
    assert format_tenure_label(12) == "1 year"
    assert format_tenure_label(24) == "2 years"


def test_missing_dates_skipped():
    summary = compute_experience_summary(
        [{"company": "X", "role": "Engineer", "dates": ""}],
        today=date(2026, 1, 1),
    )
    assert summary["totalMonths"] == 0
    assert summary["datedRoleCount"] == 0
