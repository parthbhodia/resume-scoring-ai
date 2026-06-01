"""Text post-processing for PDF/markdown extraction."""
from __future__ import annotations

import re
from typing import List

_BULLET_GLYPH_LEAD_RE = re.compile(r"^[•\-\*▪▸●◦‧·・‣⁃►➤○⚫—–‑]")

# Tokens that mark a line as a structural anchor (section header, role/company
# row, education degree, contact line, project header) — these end any
# bullet-continuation chain even when the previous bullet looks unterminated.
_STITCH_STOP_LINE_RE = re.compile(
    r"^(?:"
    r"[A-Z][A-Z\s/&]+$"                  # all-caps section heading
    r"|.{0,90}\|.{0,90}\|"                # multi-pipe entry header (Co | Role | Date)
    r"|.*\b(?:19|20)\d{2}\s*[–—\-]\s*(?:(?:19|20)\d{2}|Present|Current)\b"
    r"|.*\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2}\b"
    r")",
    re.IGNORECASE,
)

def _stitch_wrapped_bullets(text: str) -> str:
    """Rejoin display-line wrapped bullet bodies back onto their bullet.

    Multi-column / tightly-set PDFs make bullets wrap to several display lines.
    pdfplumber's word-bucketing then emits each wrapped line as its own row, so
    a bullet like:

        • Designed and implemented secure PHP server-side modules for form
          handling and MySQL database operations, following input-validation
          best practices to prevent injection vulnerabilities.

    comes out as 3 separate lines, and ``bulletAnalysis`` only sees the first
    one — truncating at "following" and tagging the bullet as "incomplete
    sentence". The structured-extract LLM does stitch them, but the per-bullet
    analyzer doesn't. Fix here in the extraction so both paths see the same
    complete bullet.

    Stitching rule: a non-bullet line joins the previous bullet when ALL of:
      - previous line is/was a bullet (starts with a bullet glyph OR we're
        currently mid-stitch)
      - previous bullet did NOT end with sentence-final punctuation
        (``.``/``!``/``?``/``;``) — open-clause continuations are the ones we
        want to glue
      - current line is short prose (no bullet glyph, no pipe table, not a
        section heading, not a date line)
      - current line starts with lowercase OR a hyphen-continuation
        ("input-validation" after "form handling and MySQL operations,
        following")
    """
    lines = text.splitlines()
    out: List[str] = []
    in_bullet = False
    blank_gap = 0  # consecutive blanks since the last non-blank line
    for raw in lines:
        ln = raw.rstrip()
        stripped = ln.strip()
        if not stripped:
            out.append(ln)
            blank_gap += 1
            continue
        if _BULLET_GLYPH_LEAD_RE.match(stripped):
            out.append(ln)
            in_bullet = True
            blank_gap = 0
            continue
        # Not a bullet — decide if it's a continuation. Allow up to one blank
        # line between a wrapped bullet and its continuation, since
        # pdfplumber's y-bucketing sometimes emits an empty bucket between
        # display lines that share the same logical bullet.
        if in_bullet and blank_gap <= 1 and out:
            # Find the previous non-blank line (the bullet head we want to join).
            j = len(out) - 1
            while j >= 0 and not out[j].strip():
                j -= 1
            if j >= 0:
                prev = out[j].rstrip()
                prev_tail = prev[-1:] if prev else ""
                terminated = prev_tail in (".", "!", "?", ";", ":")
                looks_anchor = bool(_STITCH_STOP_LINE_RE.match(stripped))
                starts_lower_or_continuation = bool(
                    re.match(r"^[a-z]", stripped) or stripped.startswith("-")
                )
                if (
                    not terminated
                    and not looks_anchor
                    and starts_lower_or_continuation
                    and len(stripped) <= 200
                ):
                    out[j] = f"{prev} {stripped}"
                    # Drop any blank lines we accumulated between bullet and continuation.
                    while len(out) > j + 1 and not out[-1].strip():
                        out.pop()
                    blank_gap = 0
                    # Still in bullet — next continuation can keep stitching.
                    continue
        out.append(ln)
        in_bullet = False
        blank_gap = 0
    return "\n".join(out)
