"""Name_Role export filename stem."""
from __future__ import annotations

from resume_gui.export.filename import name_role_export_filename, name_role_export_stem


def test_name_role_from_full_name_and_experience():
    structured = {
        "full_name": "Krish Patel",
        "experience": [{"role": "Software Developer", "company": "Tata", "bullets": []}],
    }
    assert name_role_export_stem(structured) == "KrishPatel_SoftwareDeveloper"
    assert name_role_export_filename(structured, "pdf") == "KrishPatel_SoftwareDeveloper.pdf"


def test_role_override_wins():
    structured = {
        "full_name": "Krish Patel",
        "experience": [{"role": "Software Developer", "company": "Tata", "bullets": []}],
    }
    assert name_role_export_stem(structured, role_override="Data Engineer") == "KrishPatel_DataEngineer"


def test_participial_style_name_role_docx():
    structured = {
        "full_name": "Jane Smith",
        "headline": "Full Stack Engineer",
        "experience": [],
    }
    assert name_role_export_filename(structured, "docx") == "JaneSmith_FullStackEngineer.docx"
