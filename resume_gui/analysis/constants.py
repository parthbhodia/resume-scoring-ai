"""Shared constants and regex patterns for the analyze pipeline."""
from __future__ import annotations

import re

# Tokens we treat as numerals (any digit run, including "5%", "3x", "$10k").
_NUMERAL_RE = re.compile(r"\d[\d.,]*")

# Tokens we treat as concrete proper nouns / named technologies — Title Case,
# all-caps acronyms, CamelCase, or slashed/dotted product names. These are
# the recruiter Ctrl-F targets that must survive any rewrite.
_PROPER_NOUN_RE = re.compile(
    r"\b(?:"
    r"[A-Z]{2,}(?:[/.][A-Z]{2,})*"          # ALL-CAPS / CI/CD / AWS
    r"|[A-Z][a-z]+(?:[A-Z][a-z]+)+"          # CamelCase / PostgreSQL / GraphQL
    r"|[A-Z][a-zA-Z0-9]+(?:\.[a-z]+)+"       # node.js, asp.net
    r")\b"
)

_CATEGORY_SCORE_KEYS = (
    "readability", "atsCompatibility", "jobMatch", "achievementQuality",
    "quantification", "sectionStructure", "languageQuality", "technicalBranding",
)

_CATEGORY_DISPLAY_NAMES = {
    "readability": "Readability",
    "atsCompatibility": "ATS Safety",
    "jobMatch": "Job Match",
    "achievementQuality": "Achievement",
    "quantification": "Quantification",
    "sectionStructure": "Structure",
    "languageQuality": "Language",
    "technicalBranding": "Field & depth",
}

# Light text → category map. Backend-only backfill for when the LLM omits
# primaryCategory (or emits an invalid one). This is intentionally small and is
# NOT the frontend's job: the frontend now trusts primaryCategory/issueCategories
# verbatim. Keep this conservative — when unsure, fall through to the default.
_ISSUE_TEXT_CATEGORY_HINTS: Tuple[Tuple[str, str], ...] = (
    ("quantif", "quantification"),
    ("metric", "quantification"),
    ("number", "quantification"),
    ("passive", "languageQuality"),
    ("verb", "languageQuality"),
    ("filler", "languageQuality"),
    ("wordy", "languageQuality"),
    ("duty", "achievementQuality"),
    ("ownership", "achievementQuality"),
    ("impact", "achievementQuality"),
    ("achievement", "achievementQuality"),
    ("outcome", "achievementQuality"),
    ("keyword", "jobMatch"),
    ("ats", "atsCompatibility"),
    ("section", "sectionStructure"),
    ("structure", "sectionStructure"),
    ("format", "readability"),
    ("readab", "readability"),
    ("tech", "technicalBranding"),
)

_STRONG_OWNERSHIP_VERBS = (
    # Build / ship — the core "I made this" cluster
    "architected", "built", "delivered", "designed", "engineered",
    "developed", "implemented", "shipped", "launched", "deployed",
    "rebuilt", "refactored", "modernized", "modernised", "composed",
    "produced", "authored", "drafted", "created", "generated",
    "configured", "provisioned", "automated", "migrated", "integrated",
    "orchestrated", "executed", "wrote", "rewrote",
    # Lead / own — leadership ownership cluster
    "led", "drove", "owned", "managed", "directed", "spearheaded",
    "headed", "supervised", "oversaw", "coordinated", "championed",
    "founded", "established", "originated", "pioneered", "initiated",
    "instituted", "introduced", "rolled",
    # Outcome — measurable result verbs
    "reduced", "achieved", "increased", "decreased", "improved",
    "transformed", "accelerated", "scaled", "optimized", "optimised",
    "streamlined", "boosted", "grew", "saved", "cut", "doubled",
    "tripled", "expanded", "secured", "negotiated",
    # Teach / mentor — common in education + early-career résumés;
    # genuinely ownership verbs, not duty-style
    "taught", "trained", "coached", "mentored", "facilitated",
    "instructed", "tutored", "educated", "guided", "handled",
    "presented", "moderated",
    # Investigate / resolve — analyst / engineer / consulting verbs
    "analyzed", "analysed", "researched", "investigated", "diagnosed",
    "evaluated", "assessed", "resolved", "troubleshot", "debugged",
    "audited", "validated", "verified", "tested", "benchmarked",
    # Acquisition / partnership
    "recruited", "hired", "onboarded", "partnered", "collaborated",
    "consulted", "advised",
)
_STRONG_VERB_RE = re.compile(
    r"^[\s•\-\*▪▸–—]*(?:" + "|".join(_STRONG_OWNERSHIP_VERBS) + r")\b",
    re.IGNORECASE,
)

_MISSING_METRICS_CLAIM_RE = re.compile(
    # No trailing \b — the right-hand tokens (metric, number, quantif, result)
    # often appear pluralized or suffixed (metrics / numbers / quantifiable /
    # quantification / results), and a closing \b would block those matches.
    r"\b(?:"
    r"missing\s+(?:impact\s+)?metric|missing\s+number|no\s+metric|no\s+number|"
    r"lack(?:s|ing)?\s+(?:of\s+)?(?:metric|number|data|quantif|impact|measurable|quantifi)|"
    r"lack(?:s|ing)?\s+impact|"
    r"need\s+(?:to\s+)?(?:add|include)\s+(?:metric|number|quantif)|"
    r"no\s+quantif|not\s+quantif|un[- ]?quantif|"
    r"add\s+(?:metric|number|quantifi)|specific\s+metric|fact[- ]based|"
    r"demonstrat\w*\s+result|"
    r"quantifiable\s+outcome|measurable\s+outcome|measurable\s+result"
    r")",
    re.IGNORECASE,
)

_WEAK_VERB_CLAIM_RE = re.compile(
    r"\b(?:"
    r"weak\s+(?:action\s+)?verb|weak\s+verb|"
    r"duty[- ]only|duty[- ]style|duty[- ]focused|duties?\s+included|task[- ]focused|"
    r"fail(?:s|ed|ing)?\s+to\s+highlight\s+ownership|"
    r"no\s+ownership|lack\s+ownership|responsible\s+for|helped\s+with|assisted\s+with"
    r")",
    re.IGNORECASE,
)


def _resume_numeral_count(text: str) -> int:
    """Number of distinct numeral tokens in the résumé text (CGPA 9.266 counts as 1)."""
    return len(_NUMERAL_RE.findall(text or ""))


def _resume_strong_verb_share(text: str) -> Tuple[int, int]:
    """Return (strong_verb_lead_lines, total_bullet_like_lines) over the résumé.

    Denominator is strict — only lines that start with an actual bullet glyph
    (• – * ▪ ▸) count as bullets. Tech-stack lines like 'Python · Django · …'
    or section / project headers must NOT inflate the denominator, otherwise
    the strong-verb majority floor never fires on real résumés.
    """
    if not text:
        return 0, 0
    # Optional whitespace after the glyph — bullets in real PDFs sometimes
    # come out as `•managed` with no space, e.g. when extract_words collapses
    # the glyph and first token. Require a real word char after the glyph so
    # standalone "•" lines aren't counted.
    BULLET_LEAD = re.compile(r"^[•\-\*▪▸]\s*(?=\w)")
    strong = 0
    total = 0
    for raw in text.splitlines():
        ln = raw.strip()
        if not ln:
            continue
        if not BULLET_LEAD.match(ln):
            continue
        # Drop the leading glyph + any whitespace before matching the verb.
        body = BULLET_LEAD.sub("", ln, count=1)
        total += 1
        if _STRONG_VERB_RE.search(body):
            strong += 1
    return strong, total


def _issue_text_blob(item: dict) -> str:
    parts = []
    for k in ("issue", "suggestion", "whyItMatters", "category", "warning"):
        v = item.get(k) if isinstance(item, dict) else None
        if isinstance(v, str):
            parts.append(v)
    return " ".join(parts).lower()


def _issue_contradicts_resume(
    blob: str,
    has_plenty_of_numerals: bool,
    has_strong_verb_majority: bool,
) -> Optional[str]:
    """Return a non-empty reason string when the issue's claim contradicts evidence."""
    if has_plenty_of_numerals and _MISSING_METRICS_CLAIM_RE.search(blob):
        return "claims missing metrics but résumé has plenty of numerals"
    if has_strong_verb_majority and _WEAK_VERB_CLAIM_RE.search(blob):
        return "claims weak/duty verbs but most bullets lead with strong ownership verbs"
    return None


# Thresholds. Tuned for typical 1-page résumés: ≥6 numerals is "plenty" and
# ≥60% strong-verb bullets is a "strong-verb majority". Both are conservative
# (only drop when the contradiction is overwhelming).
_NUMERAL_PLENTY_MIN = 6
_STRONG_VERB_MAJORITY_SHARE = 0.6


# Phrasings the LLM emits as atsWarnings that are actually GOOD facts about
# the résumé, not warnings. "No tables detected" doesn't deserve a warning
# label — the absence of tables is precisely what ATS-friendly résumés want.
_NON_ISSUE_ATS_WARNING_RE = re.compile(
    # Trailing `s?\b` on the noun alternatives so plurals match without
    # accidentally eating compounds like "tablespace" / "graphical".
    r"\b(?:"
    r"no\s+(?:table|graphic|image|column|header|footer|text\s*box|chart|icon|sidebar)s?\b|"
    r"no\s+multi[- ]column\b|"
    r"no\s+(?:embedded|complex)\s+(?:formatting|layout)s?\b|"
    r"standard\s+(?:heading|section|format)s?\b|"
    r"plain[- ]text\s+(?:heading|format|layout)s?\b|"
    r"ats[- ]friendly\s+(?:layout|format|structure)s?\b|"
    r"no\s+(?:non[- ]standard|unusual)\s+formatting\b"
    r")",
    re.IGNORECASE,
)

