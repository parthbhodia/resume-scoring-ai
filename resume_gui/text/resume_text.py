"""PDF/header text extraction and post-processing."""
from __future__ import annotations

import re
from typing import List

from resume_gui.extract.text_utils import _stitch_wrapped_bullets
from resume_gui.resume_extraction import inject_section_line_breaks

def _merge_split_word_tokens(tokens: list[str]) -> list[str]:
    """Fuse a lone uppercase letter with the following lowercase token.

    pdfplumber occasionally splits words like ``Led`` into ``L`` + ``ed``.
    """
    skip_single = frozenset({"I", "A"})
    out: list[str] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if (
            len(t) == 1
            and t.isalpha()
            and t.isupper()
            and t not in skip_single
            and i + 1 < len(tokens)
        ):
            nxt = tokens[i + 1]
            if nxt and len(nxt) >= 2 and nxt[0].islower():
                out.append(t + nxt)
                i += 2
                continue
        out.append(t)
        i += 1
    return out


_SECTION_KW = re.compile(
    r"^(?:"
    r"EXPERIENCE|"
    r"WORK\s+HISTORY|"
    r"WORK\s+EXPERIENCE|"
    r"PROFESSIONAL\s+EXPERIENCE|"
    r"PROFESSIONAL\s+HISTORY|"
    r"EMPLOYMENT(?:\s+HISTORY)?|"
    r"CAREER(?:\s+HISTORY|\s+OVERVIEW|\s+SUMMARY)?|"
    r"EDUCATION|"
    r"SKILLS|"
    r"SUMMARY|"
    r"PROFILE|"
    r"PROJECTS|"
    r"CERTIFICATIONS|"
    r"AWARDS|"
    r"PUBLICATIONS|"
    r"LANGUAGES|"
    r"VOLUNTEER|"
    r"PROFESSIONAL\s+SUMMARY|"
    r"TECHNICAL\s+SKILLS|"
    r"ACHIEVEMENTS?|"
    r"REFERENCES|"
    r"OBJECTIVE|"
    r"ACTIVITIES|"
    r"HONORS|"
    r"LEADERSHIP|"
    r"INTERESTS|"
    r"EXTRACURRICULAR"
    r")\s*$",
    re.IGNORECASE,
)

_HEADER_CONTACT_ANCHOR = re.compile(
    r"@|linkedin\.com/|www\.linkedin\.com/|github\.com/|www\.github\.com/|"
    r"\bportfolio\b|\bsite\b|\bmobile\b|\bphone\b|"
    r"[\[\(]?\d{3}[\])]?[\s.\-]?\d{3}[\s.\-]?\d{4}",
    re.IGNORECASE,
)

_BULLET_START_HEADER = re.compile(
    r"^[\s\ufeff]*(?:[-*•●◦·‣⁃▪►➤○⚫—–‑]|\d{1,2}[\).]\s?)",
    re.UNICODE,
)

_HEADER_JOB_ROLE = re.compile(
    r"\b(Engineer|Developer|Architect|Scientist|Analyst|Designer|Consultant|"
    r"Specialist|Manager|Director|Lead|Intern|Associate|Executive)\b",
    re.IGNORECASE,
)


def _strip_header_candidate_lines(lines: list[str], start: int, end: int) -> list[str]:
    out: list[str] = []
    lo = max(0, start)
    hi = min(len(lines), end)
    for j in range(lo, hi):
        line = lines[j].replace("\ufeff", "").strip()
        if not line:
            if len(out) >= 2:
                break
            continue
        if _SECTION_KW.match(line):
            continue
        if _BULLET_START_HEADER.match(line):
            continue
        if len(line) > 180:
            continue
        if re.search(r"%|↑|€|\$\d", line):
            continue
        out.append(line)
        if len(out) >= 8:
            break
    return out[:8]


def _header_window(lines: list[str], center_idx: int, before: int, after: int) -> list[str]:
    return _strip_header_candidate_lines(lines, center_idx - before, center_idx + after)


def _looks_like_all_caps_person_name(line: str) -> bool:
    t = line.strip()
    words = [re.sub(r"[''\-‐‑]", "", w) for w in t.split() if w]
    if len(words) < 2 or len(words) > 5 or len(t) > 48:
        return False
    if not words[0][0].isalpha():
        return False
    caps_words = [w for w in words if len(w) > 1 and w == w.upper()]
    if len(caps_words) < 2:
        return False
    return _SECTION_KW.match(t) is None


def _looks_like_title_person_name(line: str) -> bool:
    t = line.strip()
    if len(t) < 5 or len(t) > 44:
        return False
    if _HEADER_JOB_ROLE.search(t):
        return False
    words = [w for w in t.split() if w]
    if len(words) < 2 or len(words) > 4:
        return False

    def _tok_ok(w: str) -> bool:
        w = re.sub(r"[''.,]", "", w)
        return bool(re.fullmatch(r"[A-Z][a-z]+(?:-[A-Z][a-z]+)*", w))

    if not all(_tok_ok(w) for w in words):
        return False
    return _SECTION_KW.match(t) is None


def _extract_resume_header(text: str) -> list[str]:
    """Name + contact: top-of-document pass, then contact anchors / name heuristics in-body."""
    if not text.strip():
        return []

    raw_lines = text.split("\n")
    lines = [ln.replace("\ufeff", "").strip() for ln in raw_lines]

    primary: list[str] = []
    for line in lines:
        if not line:
            if len(primary) >= 2:
                break
            continue
        if _SECTION_KW.match(line):
            break
        if _BULLET_START_HEADER.match(line):
            break
        primary.append(line)
        if len(primary) >= 6:
            break
    if primary:
        return primary[:6]

    limit = min(220, len(lines))
    best: list[str] = []
    for i in range(limit):
        line = lines[i]
        if not line or len(line) > 200:
            continue
        if _HEADER_CONTACT_ANCHOR.search(line):
            chunk = _header_window(lines, i, 10, 6)
            if len(chunk) > len(best):
                best = chunk
    if not best:
        for i in range(min(360, len(lines))):
            line = lines[i]
            if _looks_like_all_caps_person_name(line) or _looks_like_title_person_name(line):
                best = _header_window(lines, i, 2, 6)
                break
    if not best:
        email_re = re.compile(r"\S+@\S+\.\S+")
        for i in range(min(400, len(lines))):
            line = lines[i]
            if line and email_re.search(line):
                best = _header_window(lines, i, 10, 6)
                break
    return best[:6]


# Bullet-glyph prefix detector used by the continuation stitcher.


def _post_clean_resume_text(text: str) -> str:
    """Normalize PDF placeholder glyphs; keep line breaks for section structure."""
    text = re.sub(r"\(\s*cid\s*:\s*\d+\)", " • ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUsed\s*:\s*to\b", "Used to", text, flags=re.IGNORECASE)
    lines = [" ".join(ln.split()) for ln in text.splitlines()]
    text = "\n".join(lines).strip()
    # Stitch BEFORE inject_section_line_breaks so the section breaker doesn't
    # see continuation fragments as standalone lines.
    text = _stitch_wrapped_bullets(text)
    try:
        return inject_section_line_breaks(text)
    except Exception:
        return text




def _extract_pdf_text(pdf) -> str:
    """Extract text from a pdfplumber PDF object, reconstructing proper word spacing.

    pdfplumber's default extract_text() sometimes collapses spaces between words
    (especially in multi-column or tightly-set PDFs), producing concatenated blobs
    like 'IamaSoftwareDeveloper'.  extract_words() uses glyph bounding boxes to
    identify individual words, which we then reconstruct line-by-line.
    """
    pages_text = []
    for page in pdf.pages:
        words = page.extract_words(x_tolerance=1, y_tolerance=3, keep_blank_chars=False)
        if not words:
            # Fallback to plain extract_text for image-heavy pages
            pages_text.append(page.extract_text() or "")
            continue
        # Group words by their approximate y-position (line)
        line_map: dict[int, list[str]] = {}
        for w in words:
            y_key = round(float(w["top"]) / 4) * 4  # bucket every 4pt
            line_map.setdefault(y_key, []).append(w["text"])
        page_lines = [
            " ".join(_merge_split_word_tokens(tokens))
            for _, tokens in sorted(line_map.items())
        ]
        pages_text.append("\n".join(page_lines))
    return _post_clean_resume_text("\n".join(pages_text))
