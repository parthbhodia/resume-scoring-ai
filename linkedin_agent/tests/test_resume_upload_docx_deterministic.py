"""Deterministic DOCX extraction (element.body traversal, quality gate)."""

from __future__ import annotations

import unittest
from pathlib import Path

try:
    from docx import Document  # noqa: F401

    _HAS_DOCX = True
except ImportError:
    _HAS_DOCX = False

from linkedin_agent.resume_upload_parse import (
    UploadedResumeStructured,
    _build_structured_from_lines,
    _det_canonical_section,
    _det_quality_ok,
    _extract_docx_structured,
    parse_upload_bytes,
    structured_to_plain_resume_text,
)

_DATASET_DIR = (
    Path(__file__).resolve().parents[2]
    / "downloads"
    / "datasets"
    / "palaksood97"
    / "resume-dataset"
    / "versions"
    / "1"
    / "Resumes"
)


class TestDetHelpers(unittest.TestCase):
    def test_canonical_section_maps_experience(self):
        self.assertEqual(_det_canonical_section("PROFESSIONAL EXPERIENCE"), "experience")

    def test_quality_ok_with_name_only(self):
        self.assertTrue(
            _det_quality_ok(
                UploadedResumeStructured(full_name="Balaji Gopalakrishnan"),
            )
        )

    def test_quality_ok_with_content_only(self):
        self.assertTrue(
            _det_quality_ok(
                UploadedResumeStructured(
                    summary="Ten years of program management across enterprise clients.",
                )
            )
        )

    def test_quality_rejects_empty(self):
        self.assertFalse(_det_quality_ok(UploadedResumeStructured()))

    def test_build_from_lines_no_section_headers_still_parses_preamble(self):
        lines = [
            "Balaji Gopalakrishnan",
            "balaji@example.com",
            "+1 410 555 0100",
            "Led budgeting across six units with 20% accuracy gains.",
        ]

        def never_heading(_i: int) -> bool:
            return False

        result = _build_structured_from_lines(lines, is_heading_fn=never_heading)
        self.assertEqual(result.full_name, "Balaji Gopalakrishnan")
        self.assertEqual(result.email, "balaji@example.com")

    def test_pdf_bullet_glyph_rows_attach_to_following_text(self):
        lines = [
            "PROJECTS",
            "EXTRA CURRICULAR ACTIVITIES",
            "• •",
            "Student’s event co-ordinator and manager for Spoural Cultural Fest- ARIP Jan-Feb 2023",
            "• Student Representative of Women’s Development Cell at ARIP- 2020-2022",
        ]

        def heading(i: int) -> bool:
            return lines[i] in {"PROJECTS", "EXTRA CURRICULAR ACTIVITIES"}

        result = _build_structured_from_lines(lines, is_heading_fn=heading)
        self.assertIsNotNone(result)
        assert result is not None

        plain = structured_to_plain_resume_text(result)
        self.assertNotIn("• •", plain)
        self.assertIn(
            "• Student’s event co-ordinator and manager for Spoural Cultural Fest- ARIP Jan-Feb 2023",
            plain,
        )


class TestDocxDatasetSmoke(unittest.TestCase):
    @unittest.skipUnless(_HAS_DOCX, "python-docx not installed")
    @unittest.skipUnless(_DATASET_DIR.is_dir(), "Kaggle dataset not present")
    def test_palaksood_docx_files_parse_deterministically(self):
        files = sorted(_DATASET_DIR.glob("*.docx"))[:5]
        self.assertGreater(len(files), 0)
        for path in files:
            data = path.read_bytes()
            result = _extract_docx_structured(data)
            self.assertIsNotNone(result, f"no parse for {path.name}")
            assert result is not None
            self.assertTrue(
                _det_quality_ok(result),
                f"quality gate failed for {path.name}",
            )

    @unittest.skipUnless(_HAS_DOCX, "python-docx not installed")
    @unittest.skipUnless(_DATASET_DIR.is_dir(), "Kaggle dataset not present")
    def test_pipeline_returns_ready_deterministic_for_docx(self):
        path = next(_DATASET_DIR.glob("*.docx"))
        content = path.read_bytes()
        structured, plain, status, hints = parse_upload_bytes(content, path.name, "fallback markdown")
        self.assertEqual(status, "ready_deterministic")
        self.assertTrue(structured)
        self.assertTrue(plain)
        self.assertEqual(hints, [])


if __name__ == "__main__":
    unittest.main()
