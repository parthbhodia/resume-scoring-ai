"""
JD keyword filtering — allowlist-first + section weighting + generic English.

Replaces an ever-growing manual blocklist in ``ats_service`` with:
  - A static high-frequency English / HR-fluff set (``GENERIC_ENGLISH``)
  - A small meta/EOE blocklist (``JD_META_BLOCKLIST``)
  - Priority text from requirements / qualifications sections
  - Within-JD specificity (priority TF vs whole-document TF)
"""

from __future__ import annotations

import re
from typing import Dict, List, Set, Tuple

# HR boilerplate, EOE, apply instructions — not searchable skills.
JD_META_BLOCKLIST: frozenset = frozenset({
    "benefits", "compensation", "salary", "bonus", "equity", "stock", "options",
    "remote", "hybrid", "onsite", "relocation", "visa", "sponsorship",
    "posted", "apply", "application", "applicant", "applicants", "hiring",
    "recruiting", "recruiter", "interview", "interviews", "eeo", "eeoc",
    "opportunity", "employer", "disability", "veteran", "veterans",
    "looking", "forward", "hearing", "regards", "sincerely", "dear",
    "equal", "affirmative", "consent", "privacy", "gdpr",
    "requirements", "qualifications", "responsibilities", "preferred",
})

# High-frequency English + job-ad filler (not skills). Tech tokens are excluded via allowlist.
_GENERIC_ENGLISH_RAW = """
about above across after again against almost also always among another any anyone
anything anywhere around because become becomes becoming been before behind being
below between beyond both bring brings brought came can cannot could did does doing
done down during each either else enough even ever every everybody everyone
everything everywhere few fewer first five following found four from further gave
get gets getting give given gives giving gone got had has have having here herself
him himself his how however hundred into its itself just keep keeps kept know
knows known last later least less let lets like made make makes making many may
maybe might more most mostly much must myself near nearly need needed needs never
next nine nobody none nothing nowhere off often once one ones only other others
our ours ourselves out over own perhaps please quite rather really said same say
says saying see seem seemed seems seen several shall she should show showed shown
shows since six so some somebody someone something somewhere still such take takes
taken taking than thank thanks that their theirs them themselves then there
therefore these they thing things think thinks third this those though three
through throughout thus today together too toward towards tried tries trying
turn turns two under until upon used uses using very want wanted wants was way
ways well went were what whatever when whenever where whereas wherever whether
which while whoever whole whom whose why will willing with within without would
yes yet you your yours yourself yourselves

able ability across adapt adaptable aligned alignment approach approaches area
areas assist assistance atmosphere attitude backgrounds based basic basis become
brand building business businesses candidate candidates career careers challenge
challenges collaborative colleagues comfortable commitment communicate
communication communications companies company complex compliance context contribute
contributes contributing contribution contributions coordinate coordinates
coordination corporate culture customer customers deliver delivers delivering
delivery department departments detail detailed details develop develops
developing development developments diverse diversity drive drives driving dynamic
effective effectively efficiency efficient employee employees employment engage
engaged engagement environment environments establish establishes establishing
excellent experience experiences expertise familiar familiarity fast flexible
focus focused following forward functional further future general globally goals
growing growth help helped helping helps high highly hire hires hiring holistic
ideal impact impacts implement implements implementing improve improves improving
improvement improvements including increase increases increasing individual
individuals industry innovative inspire inspired interpersonal join knowledge
landscape lead leading leads learn learning leverage leverages leveraging
location locations looking maintain maintains maintaining management manager
managers managing meaningful mission motivated multicultural multiple objectives
opportunities optimize organizational organizations oriented outcomes outstanding
partners passionate people performance perspective place platform platforms
position positions potential practices preferred problem problems processes
professional professionals program programs project projects provide provides
providing proven quality range record records related relationships relevant
reliable requirements responsibilities responsible results role roles scale
scaling seeking self senior serve serves service services share shared sharing
significant situation situations skill skilled skills solid solution solutions
solve solves solving stakeholder stakeholders standards starter strategic
strategies strategy strong successfully support supports supporting sustainable
talent team teamwork teams technical technology together track understanding
various vision well working workplace world
"""

GENERIC_ENGLISH: frozenset = frozenset(
    w.strip().lower()
    for w in _GENERIC_ENGLISH_RAW.split()
    if len(w.strip()) >= 3
)

_PRIORITY_SECTION_STARTS: Tuple[str, ...] = (
    "requirements",
    "required qualifications",
    "minimum qualifications",
    "basic qualifications",
    "must have",
    "must-have",
    "you have",
    "you'll need",
    "you will need",
    "what you'll need",
    "what you will need",
    "technical skills",
    "required skills",
    "skill requirements",
    "qualifications",
    "key qualifications",
)

_PRIORITY_SECTION_ENDS: Tuple[str, ...] = (
    "preferred qualifications",
    "nice to have",
    "nice-to-have",
    "bonus",
    "plus:",
    "preferred skills",
    "benefits",
    "we offer",
    "what we offer",
    "about us",
    "about the company",
    "about the team",
    "equal opportunity",
    "how to apply",
    "application process",
    "our culture",
)

_SECONDARY_SECTION_STARTS: Tuple[str, ...] = (
    "responsibilities",
    "what you'll do",
    "what you will do",
    "the role",
    "in this role",
    "your role",
    "day to day",
    "day-to-day",
    "key responsibilities",
)

_TOKEN_RE = re.compile(r"[a-z][a-z+#./-]{2,}")


def _jd_slice(lower: str, start_keys: Tuple[str, ...], end_keys: Tuple[str, ...]) -> str:
    idx = len(lower)
    for k in start_keys:
        p = lower.find(k)
        if p != -1 and p < idx:
            idx = p
    if idx >= len(lower):
        return ""
    end = len(lower)
    for k in end_keys:
        p = lower.find(k, idx + 5)
        if p != -1 and p < end:
            end = p
    return lower[idx:end]


def slice_jd_keyword_regions(jd: str) -> Tuple[str, str, str]:
    """
    Return (priority, secondary, remainder) lowercase text slices.

    Priority = requirements / qualifications / must-have blocks.
    Secondary = responsibilities / role description.
    Remainder = full JD minus explicit boilerplate markers when possible.
    """
    low = (jd or "").lower()
    if not low.strip():
        return "", "", ""

    priority = _jd_slice(low, _PRIORITY_SECTION_STARTS, _PRIORITY_SECTION_ENDS)
    secondary = _jd_slice(low, _SECONDARY_SECTION_STARTS, _PRIORITY_SECTION_ENDS)

    boilerplate_markers = (
        "benefits", "we offer", "equal opportunity", "how to apply",
        "about us", "about the company", "our mission", "why join",
    )
    remainder = low
    for mk in boilerplate_markers:
        p = remainder.find(mk)
        if p > 80:
            remainder = remainder[:p]
            break

    if not priority.strip():
        priority = remainder or low
    return priority, secondary, remainder or low


def tokenize_jd_text(text: str) -> List[str]:
    tokens = _TOKEN_RE.findall((text or "").lower())
    return [t.strip(".-/+#") for t in tokens if t and len(t.strip(".-/+#")) >= 3]


def build_term_frequencies(
    priority_text: str,
    secondary_text: str,
    whole_text: str,
) -> Tuple[Dict[str, float], Dict[str, int], Dict[str, int]]:
    """Weighted counts: priority x3, secondary x2, whole x1; raw whole + priority TF."""
    weighted: Dict[str, float] = {}
    priority_n: Dict[str, int] = {}
    whole_n: Dict[str, int] = {}

    for t in tokenize_jd_text(whole_text):
        whole_n[t] = whole_n.get(t, 0) + 1
        weighted[t] = weighted.get(t, 0.0) + 1.0

    for t in tokenize_jd_text(secondary_text):
        weighted[t] = weighted.get(t, 0.0) + 2.0

    for t in tokenize_jd_text(priority_text):
        priority_n[t] = priority_n.get(t, 0) + 1
        weighted[t] = weighted.get(t, 0.0) + 3.0

    for label, blob in (("priority", priority_text), ("secondary", secondary_text)):
        words = tokenize_jd_text(blob)
        for a, b in zip(words, words[1:]):
            if len(a) < 3 or len(b) < 3:
                continue
            bg = f"{a} {b}"
            weighted[bg] = weighted.get(bg, 0.0) + 2.0
            whole_n[bg] = whole_n.get(bg, 0) + 1
            if label == "priority":
                priority_n[bg] = priority_n.get(bg, 0) + 1

    return weighted, priority_n, whole_n


def is_generic_english(token: str) -> bool:
    t = (token or "").lower().strip()
    if not t:
        return True
    if t in JD_META_BLOCKLIST:
        return True
    if " " in t:
        parts = [p for p in t.split() if p]
        if not parts:
            return True
        generic_parts = sum(1 for p in parts if p in GENERIC_ENGLISH or p in JD_META_BLOCKLIST)
        return generic_parts == len(parts)
    return t in GENERIC_ENGLISH


def within_jd_specificity(priority_count: int, whole_count: int) -> float:
    """Higher when term is concentrated in requirements vs spread across fluff."""
    if whole_count <= 0:
        return 0.0
    if priority_count <= 0:
        return 0.15
    return min(1.0, priority_count / whole_count)


def jd_keyword_is_scorable(
    term: str,
    *,
    whole_count: int,
    priority_count: int,
    blocked_names: Set[str],
    is_tech_skill: callable,
    is_low_value_phrase: callable,
) -> bool:
    """
    Allowlist-first: keep known skills, priority-section terms, and non-generic phrases.
    ``is_tech_skill`` / ``is_low_value_phrase`` are injected from ats_service to avoid cycles.
    """
    t = (term or "").lower().strip()
    if not t or len(t) < 2:
        return False
    if t in blocked_names:
        return False

    if is_low_value_phrase(t):
        return False
    if is_tech_skill(t):
        return True
    if " " in t:
        parts = [p for p in t.split() if p]
        if any(is_tech_skill(p) for p in parts):
            return True
        if is_generic_english(t) and not any(is_tech_skill(p) for p in parts):
            return priority_count >= 1 and whole_count >= 2
        return priority_count >= 1 or whole_count >= 3

    if is_generic_english(t):
        return False
    if t in JD_META_BLOCKLIST:
        return False
    if is_low_value_phrase(t):
        return False

    # Singleton: must appear in priority section OR repeat in JD with specificity
    spec = within_jd_specificity(priority_count, whole_count)
    if priority_count >= 1 and spec >= 0.25:
        return len(t) >= 3
    if whole_count >= 2 and spec >= 0.4 and len(t) >= 5:
        return True
    return False


def rank_keyword_candidates(
    weighted: Dict[str, float],
    priority_n: Dict[str, int],
    whole_n: Dict[str, int],
    *,
    blocked_names: Set[str],
    is_tech_skill: callable,
    is_low_value_phrase: callable,
    max_keywords: int,
) -> List[Tuple[str, int, float]]:
    """Return [(term, whole_count, sort_score), ...] best first."""
    ranked: List[Tuple[str, int, float]] = []
    for term, w in weighted.items():
        wc = whole_n.get(term, 0)
        pc = priority_n.get(term, 0)
        if not jd_keyword_is_scorable(
            term,
            whole_count=wc,
            priority_count=pc,
            blocked_names=blocked_names,
            is_tech_skill=is_tech_skill,
            is_low_value_phrase=is_low_value_phrase,
        ):
            continue
        spec = within_jd_specificity(pc, wc)
        tech_boost = 4.0 if is_tech_skill(term) else 0.0
        if " " in term and any(is_tech_skill(p) for p in term.split()):
            tech_boost = max(tech_boost, 3.0)
        generic_penalty = 2.5 if is_generic_english(term) and not is_tech_skill(term) else 0.0
        score = w + tech_boost + spec * 3.0 - generic_penalty
        ranked.append((term, wc, score))

    ranked.sort(key=lambda x: (-x[2], -x[1], x[0]))
    return ranked[: max_keywords * 2]
