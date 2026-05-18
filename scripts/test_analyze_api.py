#!/usr/bin/env python3
"""Smoke-test Analyze upload + LaTeX PDF + DOCX export against a running resume_gui server."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767"
DOCX = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/api-test-resume.docx")
OUT = Path("/tmp/api-test-results")
OUT.mkdir(parents=True, exist_ok=True)


def post_multipart(url: str, field: str, path: Path, mime: str) -> tuple[int, dict]:
    boundary = "----ResunovaTestBoundary7MA4YWxk"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            data = json.loads(raw) if raw else {"error": e.reason}
        except json.JSONDecodeError:
            data = {"error": raw.decode("utf-8", errors="replace")[:500]}
        return e.code, data


def post_json(url: str, payload: dict, timeout: int = 300) -> tuple[int, bytes | dict]:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype:
                return resp.status, json.loads(raw) if raw else {}
            return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {"error": e.reason}
        except json.JSONDecodeError:
            return e.code, {"error": raw.decode("utf-8", errors="replace")[:500]}


def main() -> int:
    print(f"=== API smoke tests @ {BASE} ===\n")

    # Health
    with urllib.request.urlopen(f"{BASE}/api/health", timeout=10) as resp:
        health = json.loads(resp.read())
    print(f"health: {health}")
    assert health.get("ok") is True

    if not DOCX.is_file():
        print(f"Missing test file: {DOCX}", file=sys.stderr)
        return 1

    # analyze-upload (DOCX)
    print("\n--- POST /api/analyze-upload (DOCX) ---")
    status, upload = post_multipart(
        f"{BASE}/api/analyze-upload",
        "file",
        DOCX,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    (OUT / "analyze-upload.json").write_text(json.dumps(upload, indent=2)[:200000])
    print(f"HTTP {status}")
    if status >= 400:
        print(f"FAIL: {upload}")
        return 1
    ext_len = len((upload.get("extractedText") or ""))
    sr = upload.get("structuredResume")
    bm = upload.get("bulletMap") or []
    print(f"  overallScore: {upload.get('overallScore')}")
    print(f"  extractedText: {ext_len} chars")
    print(f"  structuredResume: {'yes' if sr else 'NO'}")
    print(f"  bulletMap: {len(bm)} entries")
    if ext_len < 20:
        print("FAIL: extracted text too short")
        return 1

    if not sr:
        print("WARN: no structuredResume (PDF/DOCX export will be disabled in UI)")

    # analyze-export-pdf (Harshibar)
    print("\n--- POST /api/analyze-export-pdf (Harshibar_Template1) ---")
    if not sr:
        print("SKIP: no structuredResume")
    else:
        status, pdf_body = post_json(
            f"{BASE}/api/analyze-export-pdf",
            {
                "structuredResume": sr,
                "acceptedEdits": {},
                "referenceFolder": "Harshibar_Template1",
            },
            timeout=600,
        )
        print(f"HTTP {status}")
        if status >= 400:
            err = pdf_body.get("error", pdf_body) if isinstance(pdf_body, dict) else pdf_body
            print(f"  WARN/FAIL: {err}")
            if "pdflatex" in str(err).lower() or "compilation" in str(err).lower():
                print("  (LaTeX compile env issue — install Harshibar deps e.g. fullpage, fontawesome5)")
            else:
                return 1
        elif not isinstance(pdf_body, (bytes, bytearray)):
            print(f"FAIL: expected PDF bytes, got {type(pdf_body)}: {pdf_body}")
            return 1
        else:
            pdf_path = OUT / "export-harshibar.pdf"
            pdf_path.write_bytes(pdf_body)
            print(f"  PDF size: {len(pdf_body)} bytes -> {pdf_path}")
            if len(pdf_body) < 1000 or not pdf_body[:4] == b"%PDF":
                print("FAIL: response is not a valid PDF")
                return 1

    # export-docx
    print("\n--- POST /api/export-docx ---")
    if not sr:
        print("SKIP: no structuredResume")
    else:
        status, docx_body = post_json(
            f"{BASE}/api/export-docx",
            {"structuredResume": sr, "acceptedEdits": {}},
            timeout=120,
        )
        print(f"HTTP {status}")
        if status >= 400:
            print(f"FAIL: {docx_body}")
            return 1
        if not isinstance(docx_body, (bytes, bytearray)):
            print(f"FAIL: expected DOCX bytes, got {docx_body}")
            return 1
        docx_path = OUT / "export.docx"
        docx_path.write_bytes(docx_body)
        print(f"  DOCX size: {len(docx_body)} bytes -> {docx_path}")
        if len(docx_body) < 200:
            print("FAIL: DOCX too small")
            return 1

    # upload-resume (DOCX extract only)
    print("\n--- POST /api/upload-resume (DOCX) ---")
    status, up_resume = post_multipart(
        f"{BASE}/api/upload-resume",
        "file",
        DOCX,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    print(f"HTTP {status}")
    if status >= 400:
        print(f"FAIL: {up_resume}")
        return 1
    text = (up_resume.get("text") or "") if isinstance(up_resume, dict) else ""
    print(f"  text: {len(text)} chars")
    if len(text) < 20:
        print("FAIL: upload-resume text too short")
        return 1

    print("\n=== ALL TESTS PASSED ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
