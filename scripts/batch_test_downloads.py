#!/usr/bin/env python3
"""Batch-test resumes under downloads/datasets (Kaggle samples).

Usage:
  .venv/bin/python scripts/batch_test_downloads.py
  .venv/bin/python scripts/batch_test_downloads.py --pdf-limit 100
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "linkedin_agent"))
sys.path.insert(0, str(ROOT / "resume_gui"))

PALAK_DIR = (
    ROOT
    / "downloads"
    / "datasets"
    / "palaksood97"
    / "resume-dataset"
    / "versions"
    / "1"
    / "Resumes"
)
DATASETS_DIR = ROOT / "downloads" / "datasets"


def _quiet_logs() -> None:
    logging.basicConfig(level=logging.WARNING)
    for name in ("resume_gui", "resume_gui.resume_extraction", "linkedin_agent"):
        logging.getLogger(name).setLevel(logging.WARNING)


def test_docx_batch() -> dict:
    from linkedin_agent.resume_upload_parse import (
        _det_quality_ok,
        _extract_docx_structured,
        parse_upload_resume_full_pipeline,
    )

    files = sorted(PALAK_DIR.glob("*.docx")) if PALAK_DIR.is_dir() else []
    ok_extract = ok_quality = ok_pipeline = 0
    failures: list[str] = []

    for path in files:
        try:
            data = path.read_bytes()
            result = _extract_docx_structured(data)
            if result is None:
                failures.append(f"{path.name}: extract=None")
                continue
            ok_extract += 1
            if not _det_quality_ok(result):
                failures.append(f"{path.name}: quality_gate")
                continue
            ok_quality += 1
            structured, plain, status, hints = parse_upload_resume_full_pipeline(
                "fallback", file_content=data, filename=path.name
            )
            if status == "ready_deterministic" and structured and plain:
                ok_pipeline += 1
            else:
                failures.append(f"{path.name}: status={status} hints={hints}")
        except Exception as exc:
            failures.append(f"{path.name}: {exc}")

    return {
        "total": len(files),
        "extract_ok": ok_extract,
        "quality_ok": ok_quality,
        "pipeline_ok": ok_pipeline,
        "failures": failures,
    }


def test_pdf_batch(limit: int | None = None) -> dict:
    from linkedin_agent.resume_upload_parse import extract_upload_markdown
    from app import (
        _finalize_structured_doc,
        _is_experience_section_label,
        _looks_like_accomplishment_bullet,
        _resume_doc_from_profile_text,
    )
    from resume_extraction import profile_section_inventory

    pdfs = sorted(DATASETS_DIR.rglob("*.pdf"))
    if limit is not None:
        pdfs = pdfs[:limit]

    no_text = extract_fail = ok_text = structured_ok = 0
    issues: dict[str, int] = {
        "company_experience_label": 0,
        "skills_have_bullets": 0,
        "edu_missing_degree": 0,
        "no_experience": 0,
    }
    issue_samples: list[str] = []

    for i, path in enumerate(pdfs, 1):
        try:
            outcome = extract_upload_markdown(path.read_bytes(), path.name)
            text = (outcome.markdown or "").strip()
            if not text:
                if outcome.empty_reason == "pdf_no_text":
                    no_text += 1
                else:
                    extract_fail += 1
                continue
            ok_text += 1
            doc = _resume_doc_from_profile_text(text, "", "")
            inv = profile_section_inventory(text)
            _finalize_structured_doc(doc, text, inv, None, "", "")

            bad: list[str] = []
            for exp in doc.experience or []:
                if _is_experience_section_label(exp.company or ""):
                    bad.append("company_experience_label")
                    issues["company_experience_label"] += 1
                    break
            skill_items = [it for _, items in (doc.skills or []) for it in items]
            if any(_looks_like_accomplishment_bullet(it) for it in skill_items):
                bad.append("skills_have_bullets")
                issues["skills_have_bullets"] += 1
            if doc.education and any(
                (e.institution or "").strip()
                and not (e.degree or "").strip()
                and not (e.dates or "").strip()
                for e in doc.education
            ):
                bad.append("edu_missing_degree")
                issues["edu_missing_degree"] += 1
            if inv.expects_experience() and not doc.experience:
                bad.append("no_experience")
                issues["no_experience"] += 1
            if not bad:
                structured_ok += 1
            elif len(issue_samples) < 20:
                issue_samples.append(f"{path.relative_to(DATASETS_DIR)}: {','.join(bad)}")
        except Exception as exc:
            extract_fail += 1
            if len(issue_samples) < 20:
                issue_samples.append(f"{path.name}: ERROR {exc}")
        if i % 500 == 0:
            print(f"  PDF progress: {i}/{len(pdfs)}", flush=True)

    return {
        "total": len(pdfs),
        "text_ok": ok_text,
        "no_text": no_text,
        "extract_fail": extract_fail,
        "structured_clean": structured_ok,
        "issues": issues,
        "issue_samples": issue_samples,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-test downloads/ resume datasets")
    parser.add_argument("--skip-pdf", action="store_true", help="Only run DOCX deterministic batch")
    parser.add_argument("--pdf-limit", type=int, default=None, help="Cap PDF count (default: all)")
    args = parser.parse_args()
    _quiet_logs()

    print("=== palaksood97 DOCX (deterministic) ===")
    docx = test_docx_batch()
    print(f"  files:       {docx['total']}")
    print(f"  extract ok:  {docx['extract_ok']}/{docx['total']}")
    print(f"  quality ok:  {docx['quality_ok']}/{docx['total']}")
    print(f"  pipeline ok: {docx['pipeline_ok']}/{docx['total']}")
    if docx["failures"]:
        print(f"  failures ({len(docx['failures'])}):")
        for f in docx["failures"][:15]:
            print(f"    - {f}")

    if args.skip_pdf:
        return 0 if docx["pipeline_ok"] == docx["total"] and docx["total"] else 1

    print("\n=== snehaanbhawal + palaksood PDFs (conservative profile) ===")
    pdf = test_pdf_batch(limit=args.pdf_limit)
    print(f"  files:            {pdf['total']}")
    print(f"  text extracted:   {pdf['text_ok']}/{pdf['total']}")
    print(f"  no text (scan):   {pdf['no_text']}")
    print(f"  extract errors:   {pdf['extract_fail']}")
    print(f"  structured clean: {pdf['structured_clean']}/{pdf['text_ok']} (of text ok)")
    for k, v in pdf["issues"].items():
        if v:
            print(f"  {k}: {v}")
    if pdf["issue_samples"]:
        print("  samples:")
        for s in pdf["issue_samples"][:12]:
            print(f"    - {s}")

    docx_ok = docx["pipeline_ok"] == docx["total"] and docx["total"] > 0
    return 0 if docx_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
