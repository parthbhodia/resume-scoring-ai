"""Tests for analyze persistence helpers."""
from resume_gui.services.persistence import _analysis_label


def test_analysis_label_from_header_list():
    result = {"resumeHeader": ["Parth Bhodia", "pbhodia1@umbc.edu", "Baltimore, MD"]}
    assert _analysis_label(result, False) == "Parth Bhodia | pbhodia1@umbc.edu | Baltimore, MD"[:80]


def test_analysis_label_from_header_string():
    result = {"resumeHeader": "Jane Doe"}
    assert _analysis_label(result, False) == "Jane Doe"


def test_analysis_label_jd_fallback():
    assert _analysis_label({}, True) == "With JD"
    assert _analysis_label({}, False) == "General"
