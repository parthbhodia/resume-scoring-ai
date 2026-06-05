"""Tests for deterministic structural / ATS flags."""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("XAI_API_KEY", "test")
os.environ.setdefault("GOOGLE_API_KEY", "test")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from resume_gui.analysis.structural_flags import compute_structural_flags  # noqa: E402


def _issues(flags):
    return " || ".join(f["issue"] for f in flags)


class TestStructuralFlags:
    def test_missing_linkedin_flagged(self):
        flags = compute_structural_flags("Jane Doe\njane@x.com\n(804) 555-1212", {"experience": []})
        assert any("LinkedIn" in f["issue"] for f in flags)
        assert all(set(f.keys()) >= {"issue", "risk", "severity"} for f in flags)

    def test_linkedin_present_not_flagged(self):
        flags = compute_structural_flags("Jane Doe\nlinkedin.com/in/janedoe", {"experience": []})
        assert not any("LinkedIn" in f["issue"] for f in flags)

    def test_single_open_date_flagged(self):
        structured = {"experience": [{"company": "Women in Design", "role": "Designer", "dates": "March 2024", "location": "NYC"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert any("single date" in f["issue"] for f in flags)

    def test_date_range_not_flagged_as_open(self):
        structured = {"experience": [{"company": "Acme", "role": "Eng", "dates": "June 2024 - July 2025", "location": "NY"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert not any("single date" in f["issue"] for f in flags)

    def test_present_date_not_flagged(self):
        structured = {"experience": [{"company": "Acme", "role": "Eng", "dates": "July 2025 - Present", "location": "NY"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert not any("single date" in f["issue"] for f in flags)

    def test_community_entry_flagged(self):
        structured = {"experience": [{"company": "Carrom Club NYC", "role": "Co-founder", "dates": "2024 - Present", "location": "NYC"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert any("community / club" in f["issue"] for f in flags)

    def test_real_job_not_flagged_as_community(self):
        structured = {"experience": [{"company": "Jersey Tech Partners", "role": "UX Designer", "dates": "2025 - Present", "location": "NJ"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert not any("community / club" in f["issue"] for f in flags)

    def test_missing_location_on_current_role(self):
        structured = {"experience": [{"company": "Acme", "role": "Eng", "dates": "2025 - Present", "location": ""}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert any("city/state" in f["issue"] for f in flags)

    def test_middot_separator_flagged(self):
        flags = compute_structural_flags("linkedin.com/in/x\nAcme Corp · San Francisco, CA", {"experience": []})
        assert any("·" in f["issue"] for f in flags)

    def test_state_only_location_flagged_as_missing_city(self):
        structured = {"experience": [{"company": "Jersey Tech", "role": "UX", "dates": "2025 - Present", "location": "New Jersey, NJ"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert any("No city" in f["issue"] for f in flags)

    def test_city_location_not_flagged(self):
        structured = {"experience": [{"company": "Jersey Tech", "role": "UX", "dates": "2025 - Present", "location": "Newark, NJ"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert not any("No city" in f["issue"] for f in flags)

    def test_ambiguous_new_york_not_flagged(self):
        # "New York, NY" might be NYC — too ambiguous to flag as state-only.
        structured = {"experience": [{"company": "Acme", "role": "Eng", "dates": "2025 - Present", "location": "New York, NY"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert not any("No city" in f["issue"] for f in flags)

    def test_remote_location_not_flagged(self):
        structured = {"experience": [{"company": "Acme", "role": "Eng", "dates": "2025 - Present", "location": "Remote"}]}
        flags = compute_structural_flags("linkedin.com/in/x", structured)
        assert not any("city" in f["issue"].lower() for f in flags)

    def test_emdash_header_separator_flagged(self):
        raw = "linkedin.com/in/x\nJersey Tech Partners — New Jersey, NJ\nUX Designer | July 2025 - Present"
        flags = compute_structural_flags(raw, {"experience": []})
        assert any("—" in f["issue"] and "separator" in f["issue"] for f in flags)

    def test_emdash_in_bullet_prose_not_flagged_as_separator(self):
        # Long bullet prose with an em-dash must not trip the header-separator check.
        raw = ("linkedin.com/in/x\n"
               "• Led discovery and synthesis through clinical research with providers "
               "— surfacing root-cause pain points that shaped strategy and validated direction")
        flags = compute_structural_flags(raw, {"experience": []})
        assert not any("separator" in f["issue"] for f in flags)

    def test_cid_glyph_codes_flag_broken_text_layer(self):
        raw = "Jane Doe\nlinkedin.com/in/x\n| Jersey | Tech (cid:22) | New | Jersey (cid:21) NJ |\nDesigner (cid:21) 2024"
        flags = compute_structural_flags(raw, {"experience": []})
        assert any("extract cleanly" in f["issue"] for f in flags)
        assert flags[0]["severity"] == "high"  # high sorts first

    def test_clean_text_no_cid_flag(self):
        flags = compute_structural_flags("linkedin.com/in/x\nAcme Corp, New York, NY", {"experience": []})
        assert not any("extract cleanly" in f["issue"] for f in flags)

    def test_clean_resume_no_flags(self):
        structured = {"experience": [{"company": "Acme", "role": "Eng", "dates": "2023 - Present", "location": "NY"}]}
        flags = compute_structural_flags("linkedin.com/in/jane\nAcme, New York, NY", structured)
        assert flags == []

    def test_severity_sorted_high_first(self):
        structured = {"experience": [{"company": "Chess Club", "role": "Member", "dates": "May 2024", "location": "NY"}]}
        flags = compute_structural_flags("no contact links here", structured)
        sevs = [f["severity"] for f in flags]
        # medium (LinkedIn) should sort before low (community / single-date)
        assert sevs == sorted(sevs, key=lambda s: {"high": 0, "medium": 1, "low": 2}[s])
