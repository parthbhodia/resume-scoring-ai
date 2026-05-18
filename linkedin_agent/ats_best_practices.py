"""
ATS best-practice checks (rule-based, from extracted PDF text).

UIC OCS guidance: ``/blog/optimizing-resumes-for-ats``
Parsing research summary: ``/blog/how-ats-really-works``
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set, Tuple

# Month names and numeric month/date patterns for ATS-friendly dates
_MONTH_NAMES = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
)
_DATE_WITH_MONTH_RE = re.compile(
    r"\b(?:"
    r"(?:0?[1-9]|1[0-2])[/\-.](?:0?[1-9]|[12]\d|3[01])[/\-.](?:19|20)\d{2}"
    r"|(?:19|20)\d{2}\s*[/\-.]\s*(?:0?[1-9]|1[0-2])"
    r"|(?:"
    + "|".join(_MONTH_NAMES)
    + r")\s+(?:['\u2019]?\d{2}|\d{4})"
    r")\b",
    re.I,
)
_ACRONYM_EXPANDED_RE = re.compile(
    r"\b[A-Za-z][A-Za-z\s&/-]{2,48}\s+\([A-Za-z0-9][A-Za-z0-9+\-]{1,12}\)",
)
_CREDENTIAL_SUFFIX_RE = re.compile(
    r"\b(?:MBA|MPA|M\.?S\.?|M\.?A\.?|B\.?S\.?|B\.?A\.?|Ph\.?D\.?|CPA|CFA|PMP|RN|JD|MD|"
    r"SHRM(?:-CP)?|CISSP|CSM|CAPM)\b",
    re.I,
)
_NAME_PUNCT_RE = re.compile(r"[\(\),/\-]")
_CAPS_SECTION_RE = re.compile(
    r"\b(?:EXPERIENCE|EDUCATION|SKILLS|PROJECTS|SUMMARY|CERTIFICATIONS|"
    r"WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|TECHNICAL\s+SKILLS)\b",
)
_NON_ASCII_LETTER_RE = re.compile(r"[^\x00-\x7F]")
# Common mojibake / accented résumé letters
_ACCENTS_SAMPLE = ("résumé", "resume\u0301", "\u00e9", "\u00e8", "\u00f1", "\u00fc")
_EMOJI_OR_ICON_RE = re.compile(
    r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE0F]"
)
_CREATIVE_SECTION_RE = re.compile(
    r"\b(?:my\s+journey|toolkit|superpowers|passion\s+projects?|where\s+i(?:'ve|\s+have)\s+been|"
    r"what\s+i\s+bring|core\s+competenc(?:y|ies)|arsenal)\b",
    re.I,
)
_STANDARD_SECTION_RE = re.compile(
    r"\b(?:work\s+experience|professional\s+experience|experience|employment|"
    r"education|skills|technical\s+skills|certifications?|summary|projects?)\b",
    re.I,
)
_SLASH_DATE_RE = re.compile(
    r"\b(?:0?[1-9]|1[0-2])[/\-.](?:19|20)\d{2}\b"
)
_ISO_DATE_RE = re.compile(r"\b(?:19|20)\d{2}[/\-.](?:0?[1-9]|1[0-2])\b")
_YEAR_ONLY_RANGE_RE = re.compile(r"\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}\b")
_HEADER_ZONE_CHARS = 2200


def _check(
    checks: List[Dict],
    *,
    id: str,
    name: str,
    passed: bool,
    detail: str,
    category: str,
) -> None:
    checks.append({
        "id": id,
        "name": name,
        "pass": passed,
        "detail": detail,
        "category": category,
    })


def _first_name_line(full_text: str) -> str:
    for ln in (full_text or "").splitlines():
        s = ln.strip()
        if not s or len(s) > 72:
            continue
        if re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,4}$", s):
            return s
        if re.match(r"^[A-Z][A-Z\s'.-]{2,48}$", s) and " " in s:
            return s
    return ""


def _has_accents_or_non_ascii(text: str) -> bool:
    if not text:
        return False
    if _NON_ASCII_LETTER_RE.search(text):
        for ch in text:
            if ord(ch) > 127 and ch.isalpha():
                return True
    low = text.lower()
    return any(sample in low for sample in _ACCENTS_SAMPLE)


def _normalize_title_phrase(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _exact_title_in_header(full_text: str, role: str) -> bool:
    if not role or len(role) < 4:
        return True
    zone = (full_text or "")[:_HEADER_ZONE_CHARS].lower()
    role_n = _normalize_title_phrase(role)
    if role_n in zone:
        return True
    # Allow en-dash/em-dash variants in ranges only; title itself should be literal
    return False


def _date_format_families(text: str) -> List[str]:
    families: List[str] = []
    if _DATE_WITH_MONTH_RE.search(text):
        families.append("month_name_or_mdy")
    if _SLASH_DATE_RE.search(text):
        families.append("slash_month_year")
    if _ISO_DATE_RE.search(text):
        families.append("iso_year_month")
    if _YEAR_ONLY_RANGE_RE.search(text):
        families.append("year_only_range")
    return families


def _keyword_stuffing_score(full_text: str, jd_terms: Set[str]) -> Tuple[bool, str]:
    if not full_text or not jd_terms:
        return True, "No stuffing heuristics applied."
    lower = full_text.lower()
    words = re.findall(r"[a-z0-9+#./-]{3,}", lower)
    if len(words) < 80:
        return True, "Résumé too short for stuffing heuristics."
    suspicious = 0
    for term in sorted(jd_terms, key=len, reverse=True)[:24]:
        if len(term) < 4:
            continue
        pat = re.compile(r"\b" + re.escape(term.lower()) + r"\b")
        hits = len(pat.findall(lower))
        if hits >= 8:
            suspicious += 1
    if suspicious >= 2:
        return False, "Several JD phrases repeat unnaturally — weave terms into bullets instead of repeating them."
    return True, "No obvious keyword-stuffing pattern detected."


def _jd_terms_in_bullets(bullets: List[str], jd_terms: Set[str]) -> int:
    if not bullets or not jd_terms:
        return 0
    hits = 0
    for b in bullets:
        bl = b.lower()
        for t in jd_terms:
            if len(t) < 3:
                continue
            if re.search(r"\b" + re.escape(t) + r"\b", bl):
                hits += 1
                break
    return hits


def evaluate_ats_best_practices(
    full_text: str,
    *,
    page_count: int = 1,
    layout_single_column: bool = True,
    target_role: str = "",
    title_guess: str = "",
    has_jd: bool = False,
    jd_kw_ratio: float = 0.0,
    jd_keywords_found: int = 0,
    has_objective: bool = False,
    bullets: Optional[List[str]] = None,
    jd_terms: Optional[Set[str]] = None,
    quant_ratio: float = 0.0,
    action_ratio: float = 0.0,
    from_resunova_pdf: bool = True,
    has_email: bool = False,
    has_phone: bool = False,
) -> Dict:
    """Return UIC + parsing-research best-practice checks from PDF text."""
    checks: List[Dict] = []
    text = full_text or ""
    lower = text.lower()
    bullets = bullets or []
    jd_terms = jd_terms or set()
    name_line = _first_name_line(text)

    # --- Format checklist (detectable) -----------------------------------------
    accents = _has_accents_or_non_ascii(text)
    _check(
        checks,
        id="no_special_chars",
        name="No accented or non-ASCII letters",
        passed=not accents,
        detail="Accented characters (e.g. é in résumé) can parse incorrectly in some ATS."
        if accents else "No accented letters detected in extracted text.",
        category="format",
    )

    name_punct = bool(name_line and _NAME_PUNCT_RE.search(name_line))
    _check(
        checks,
        id="no_name_punctuation",
        name="Name line without punctuation",
        passed=not name_punct,
        detail=f"Keep credentials and punctuation off the name line (saw: {name_line[:40]})."
        if name_punct else "First name line looks clean for parsers.",
        category="format",
    )

    cred_in_name = bool(name_line and _CREDENTIAL_SUFFIX_RE.search(name_line))
    _check(
        checks,
        id="name_only_top_line",
        name="Credentials not beside name",
        passed=not cred_in_name,
        detail="Move MBA, CPA, etc. to a separate line — not next to your name."
        if cred_in_name else "No degree/credential suffix detected on the name line.",
        category="format",
    )

    _check(
        checks,
        id="single_column",
        name="Single-column layout",
        passed=layout_single_column,
        detail="Multi-column PDF text order can scramble in ATS parsers."
        if not layout_single_column else "Layout reads as a single primary column.",
        category="format",
    )

    has_caps_sections = bool(_CAPS_SECTION_RE.search(text))
    _check(
        checks,
        id="caps_section_headers",
        name="Section headers easy to categorize",
        passed=has_caps_sections or bool(re.search(r"\b(experience|education|skills)\b", lower)),
        detail="ALL CAPS section labels (EXPERIENCE, SKILLS) help parsers bucket content."
        if not has_caps_sections else "Clear section headers detected.",
        category="format",
    )

    has_month_dates = bool(_DATE_WITH_MONTH_RE.search(text))
    _check(
        checks,
        id="dates_with_months",
        name="Dates include months",
        passed=has_month_dates,
        detail="Use month + year (06/2010 – 08/2012 or Jan 2020 – Mar 2022) so tenure is unambiguous."
        if not has_month_dates else "Month-level dates detected.",
        category="format",
    )

    has_expanded_acronyms = bool(_ACRONYM_EXPANDED_RE.search(text))
    _check(
        checks,
        id="spell_out_acronyms",
        name="Spelled-out terms with abbreviations",
        passed=has_expanded_acronyms or not bool(re.search(r"\b[A-Z]{2,6}\b", text)),
        detail="Where space allows, use “Certified Public Accountant (CPA)” style expansions."
        if not has_expanded_acronyms else "Found expanded term + abbreviation pattern.",
        category="format",
    )

    page_ok = 1 <= page_count <= 3
    _check(
        checks,
        id="length_ok",
        name="Length appropriate for humans",
        passed=page_ok,
        detail=f"{page_count} page(s) — ATS rarely penalizes length; 1–2 pages is ideal for most roles."
        if page_ok else f"{page_count} page(s) — consider tightening to ~2 pages for recruiters.",
        category="format",
    )

    # --- Top tips (behavior) ---------------------------------------------------
    if not has_jd:
        customize_detail = "Paste a job description to score keyword tailoring."
    elif jd_kw_ratio < 0.32:
        customize_detail = "Mirror posting language — one generic résumé underperforms in ATS and with recruiters."
    else:
        customize_detail = "Keyword alignment with this JD looks reasonable."
    _check(
        checks,
        id="customize_per_job",
        name="Tailored to this job description",
        passed=not has_jd or jd_kw_ratio >= 0.32,
        detail=customize_detail,
        category="do",
    )

    bullet_jd_hits = _jd_terms_in_bullets(bullets, jd_terms) if jd_terms else 0
    bullets_ok = len(bullets) == 0 or bullet_jd_hits >= max(1, min(3, len(bullets) // 4))
    _check(
        checks,
        id="keywords_in_context",
        name="Keywords inside accomplishment bullets",
        passed=bullets_ok and (quant_ratio >= 0.2 or action_ratio >= 0.3 or len(bullets) < 4),
        detail="Weave JD phrases into bullet achievements, not only a skills list."
        if not bullets_ok else "Role terms appear in experience bullets.",
        category="do",
    )

    role = (target_role or title_guess or "").strip()
    title_ok = True
    if role and len(role) >= 4:
        title_ok = role.lower() in lower or any(
            re.search(r"\b" + re.escape(tok) + r"\b", lower)
            for tok in re.findall(r"[a-z0-9+#./-]{3,}", role.lower())
            if tok not in ("and", "the", "for", "with")
        )
    _check(
        checks,
        id="exact_job_title",
        name="Target job title visible",
        passed=title_ok,
        detail=f"Include the posting title (“{role[:60]}”) when applying for that role."
        if role and not title_ok else "Role/title language appears in the résumé text.",
        category="do",
    )

    header_title_ok = _exact_title_in_header(text, role) if role else True
    _check(
        checks,
        id="exact_title_header",
        name="Exact posting title in header/summary",
        passed=header_title_ok,
        detail=(
            f"Put the exact title from the posting (“{role[:56]}”) in your header or summary — "
            "not a synonym like “Product Lead” when the JD says “Senior Product Manager.”"
        )
        if role and not header_title_ok
        else "Posting title appears near the top of the résumé.",
        category="research",
    )

    if has_jd:
        kw_band_ok = 25 <= jd_keywords_found <= 35
        if jd_keywords_found < 25:
            kw_detail = (
                f"About {jd_keywords_found} distinct JD terms detected — aim for ~25–35 relevant "
                "posting phrases woven into bullets (literal matches, not synonyms)."
            )
        elif jd_keywords_found > 35:
            kw_detail = (
                f"About {jd_keywords_found} JD terms detected — above ~35 may look like stuffing; "
                "keep only terms you can defend in context."
            )
        else:
            kw_detail = f"~{jd_keywords_found} JD terms detected — in the common 25–35 visibility band."
        _check(
            checks,
            id="keyword_band",
            name="JD keyword visibility band (25–35)",
            passed=kw_band_ok,
            detail=kw_detail,
            category="research",
        )

    standard_headers = bool(_STANDARD_SECTION_RE.search(text))
    creative_headers = bool(_CREATIVE_SECTION_RE.search(text))
    _check(
        checks,
        id="standard_headers",
        name="Standard section headers",
        passed=standard_headers and not creative_headers,
        detail=(
            "Use “Work Experience,” “Education,” “Skills” — creative labels often land in uncategorized ATS fields."
        )
        if creative_headers or not standard_headers
        else "Standard section labels detected.",
        category="research",
    )

    has_emoji = bool(_EMOJI_OR_ICON_RE.search(text))
    _check(
        checks,
        id="no_decorative",
        name="No emojis or decorative icons",
        passed=not has_emoji,
        detail="Icons and emojis often parse as blanks or garbage characters in ATS.",
        category="research",
    )

    contact_ok = has_email and has_phone
    _check(
        checks,
        id="contact_in_body",
        name="Contact info in parseable body text",
        passed=contact_ok,
        detail="Email and phone should appear in the main body — many ATS ignore PDF headers/footers."
        if not contact_ok
        else "Email and phone detected in extracted text.",
        category="research",
    )

    date_families = _date_format_families(text)
    dates_consistent = len(date_families) <= 1 or (len(date_families) == 2 and "year_only_range" in date_families)
    _check(
        checks,
        id="consistent_dates",
        name="Consistent date formatting",
        passed=dates_consistent,
        detail=(
            "Mixed date styles (Jan 2020 vs 2020-01 vs 01/2020) can miscalculate tenure — pick one format everywhere."
        )
        if not dates_consistent
        else "Date formats look consistent for parsers.",
        category="research",
    )

    stuffing_ok, stuffing_detail = _keyword_stuffing_score(text, jd_terms)
    _check(
        checks,
        id="no_stuffing",
        name="No keyword-stuffing pattern",
        passed=stuffing_ok,
        detail=stuffing_detail,
        category="research",
    )

    if from_resunova_pdf:
        _check(
            checks,
            id="docx_when_asked",
            name="Export format for uploads",
            passed=True,
            detail=(
                "Resunova PDFs are text-based and single-column. When an employer allows Word, "
                "download DOCX from the builder — .docx parsed most reliably in systematic ATS tests."
            ),
            category="research",
        )

    _check(
        checks,
        id="proofread",
        name="Clean, parseable text",
        passed=len(text) > 200 and "  " not in text[:500],
        detail="Typos and garbled extraction hurt ATS matching and recruiter trust.",
        category="do",
    )

    # --- Don'ts ----------------------------------------------------------------
    _check(
        checks,
        id="no_generic_objective",
        name="No dated objective block",
        passed=not has_objective,
        detail="Replace objective statements with a short, role-specific summary.",
        category="dont",
    )

    _check(
        checks,
        id="simple_formatting",
        name="No dense multi-column blocks",
        passed=layout_single_column,
        detail="Tables, text boxes, and multi-column designer templates confuse many parsers.",
        category="dont",
    )

    if from_resunova_pdf:
        _check(
            checks,
            id="simple_word_doc",
            name="Resunova PDF export (ATS-oriented layout)",
            passed=True,
            detail="Generated via structured LaTeX — selectable text, single column. For employers requiring .doc, export DOCX when available.",
            category="do",
        )

    passed_n = sum(1 for c in checks if c["pass"])
    total = len(checks) or 1
    score = max(0, min(100, int(round(100 * passed_n / total))))

    return {
        "checks": checks,
        "score": score,
        "passed": passed_n,
        "total": total,
        "source": "uic_ocs_ats_guide_and_parsing_research",
        "guidePath": "/blog/how-ats-really-works",
        "secondaryGuidePath": "/blog/optimizing-resumes-for-ats",
        "attribution": (
            "UIC Office of Career Services (careers.uic.edu) plus Resunova ATS parsing research — "
            "see blog for the quick-fix checklist."
        ),
        "sources": [
            {
                "id": "research",
                "guidePath": "/blog/how-ats-really-works",
                "label": "How ATS really works",
            },
            {
                "id": "uic",
                "guidePath": "/blog/optimizing-resumes-for-ats",
                "label": "UIC ATS formatting guide",
            },
        ],
    }
