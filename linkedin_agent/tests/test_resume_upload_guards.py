"""Guards for résumé upload (MIME, size constant, empty-extract messaging)."""

import unittest

from linkedin_agent.resume_upload_parse import (
    RESUME_UPLOAD_MAX_BYTES,
    message_for_empty_resume_extract,
    validate_resume_upload_file,
)


class TestValidateResumeUploadFile(unittest.TestCase):
    def test_max_bytes_matches_four_mb(self):
        self.assertEqual(RESUME_UPLOAD_MAX_BYTES, 4 * 1024 * 1024)

    def test_pdf_with_application_pdf_ok(self):
        validate_resume_upload_file("application/pdf", "Resume.pdf")

    def test_docx_with_word_mime_ok(self):
        validate_resume_upload_file(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "cv.docx",
        )

    def test_octet_stream_allows_suffix_check_only(self):
        validate_resume_upload_file("application/octet-stream", "cv.pdf")
        validate_resume_upload_file("", "cv.docx")
        validate_resume_upload_file(None, "cv.pdf")

    def test_image_mime_rejected_even_if_pdf_suffix(self):
        with self.assertRaises(ValueError) as ctx:
            validate_resume_upload_file("image/png", "resume.pdf")
        self.assertIn("image", str(ctx.exception).lower())

    def test_plain_text_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_resume_upload_file("text/plain", "notes.pdf")
        self.assertIn("plain", str(ctx.exception).lower())

    def test_wrong_mime_for_pdf_extension(self):
        with self.assertRaises(ValueError) as ctx:
            validate_resume_upload_file("application/msword", "file.pdf")
        self.assertIn("pdf", str(ctx.exception).lower())

    def test_docx_with_old_doc_mime_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_resume_upload_file("application/msword", "cv.docx")
        self.assertIn("docx", str(ctx.exception).lower())

    def test_doc_named_as_docx_mime_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            validate_resume_upload_file(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "legacy.doc",
            )
        self.assertIn("docx", str(ctx.exception).lower())

    def test_bad_extension(self):
        with self.assertRaises(ValueError) as ctx:
            validate_resume_upload_file("application/pdf", "x.txt")
        self.assertIn("Unsupported", str(ctx.exception))


class TestEmptyExtractMessages(unittest.TestCase):
    def test_pdf_no_text_mentions_scan(self):
        msg = message_for_empty_resume_extract("pdf_no_text")
        self.assertIn("scanned", msg.lower())

    def test_corrupt_pdf_message(self):
        msg = message_for_empty_resume_extract("corrupt_or_unreadable_pdf")
        self.assertIn("encrypted", msg.lower())

    def test_unknown_reason_generic(self):
        msg = message_for_empty_resume_extract(None)
        self.assertTrue(len(msg) > 20)
