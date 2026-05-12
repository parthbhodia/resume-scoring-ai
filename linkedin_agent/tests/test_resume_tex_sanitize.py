"""Golden tests for assembled-resume LaTeX sanitization and assembly audits."""

import unittest

from linkedin_agent.resume_library import (
    _audit_assembled_resume_tex,
    _audit_pdflatex_log,
    _sanitize_full_resume_tex,
)


class TestSanitizeFullResumeTex(unittest.TestCase):
    def test_strips_standalone_metric_noise(self):
        tex = (
            "\\begin{document}\n"
            "sep 0in\n"
            "topsep 0pt\n"
            "\\section{Summary}\n"
            "Body.\n"
            "\\end{document}\n"
        )
        out = _sanitize_full_resume_tex(tex)
        self.assertNotIn("sep 0in", out)
        self.assertNotIn("topsep 0pt", out)
        self.assertIn("\\section{Summary}", out)

    def test_strips_duplicate_contact_tabular_after_marker(self):
        tail = (
            "\\begin{tabular*}{\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\n"
            "  \\textbf{\\Huge Dup} & Location: X \\\\\n"
            "  Email: a@b.com & \\\\\n"
            "\\end{tabular*}\n"
            "\\section{SUMMARY}\n"
            "Hello.\n"
        )
        tex = (
            "\\begin{document}\n"
            "% RESUME-CONTACT-BLOCK-END\n"
            + tail
            + "\\end{document}\n"
        )
        out = _sanitize_full_resume_tex(tex)
        self.assertNotIn("Dup", out)
        self.assertIn("\\section{SUMMARY}", out)

    def test_strips_two_duplicate_mastheads_after_end_linewidth(self):
        dup = (
            "\\begin{tabular*}{\\linewidth}{l@{\\extracolsep{\\fill}}r}\n"
            "  \\textbf{\\Huge Dup} & Location: X \\\\\n"
            "  Email: a@b.com & \\\\\n"
            "\\end{tabular*}\n"
        )
        tex = (
            "\\begin{document}\n"
            "% RESUME-CONTACT-BLOCK-END\n"
            + dup
            + dup
            + "\\section{SUMMARY}\n"
            "\\end{document}\n"
        )
        out = _sanitize_full_resume_tex(tex)
        self.assertNotIn("Dup", out)
        self.assertIn("\\section{SUMMARY}", out)

    def test_fixes_runon_employer_month(self):
        tex = (
            "\\begin{document}\n"
            "% RESUME-CONTACT-BLOCK-END\n"
            "CAPITAL ONEJan 2020 -- Present \\\\\n"
            "\\end{document}\n"
        )
        out = _sanitize_full_resume_tex(tex)
        self.assertIn("CAPITAL ONE Jan", out)
        self.assertNotIn("CAPITAL ONEJan", out)


class TestAssembledTexAudit(unittest.TestCase):
    def _good_shell(self, body_mid: str) -> str:
        return (
            "\\documentclass{article}\n"
            "\\begin{document}\n"
            "% RESUME-CONTACT-BLOCK-START\n"
            "\\begin{tabular}{l}Name\\end{tabular}\n"
            "% RESUME-CONTACT-BLOCK-END\n"
            + body_mid
            + "\\end{document}\n"
        )

    def test_audit_passes_minimal_valid_tex(self):
        tex = self._good_shell("\\section{X}\n")
        self.assertEqual(_audit_assembled_resume_tex(tex), [])

    def test_audit_flags_duplicate_begin_document_in_body(self):
        tex = self._good_shell("\\begin{document}\n\\section{X}\n")
        issues = _audit_assembled_resume_tex(tex)
        self.assertTrue(any("begin_document" in m for m in issues))

    def test_audit_flags_double_huge_before_first_section(self):
        tex = self._good_shell("\\Huge One\n\\Huge Two\n\\section{X}\n")
        issues = _audit_assembled_resume_tex(tex)
        self.assertTrue(any("huge_in_masthead" in m for m in issues))


class TestPdflatexLogAudit(unittest.TestCase):
    def test_collects_overfull_hbox_lines(self):
        log = "Some noise\nOverfull \\hbox (12pt too wide) in paragraph at lines 3--4\n"
        hits = _audit_pdflatex_log(log)
        self.assertEqual(len(hits), 1)
        self.assertIn("Overfull", hits[0])


if __name__ == "__main__":
    unittest.main()
