"""
ATS readiness + job-alignment checks (rule-based, no LLM).

Analyzes compiled PDF text (pdfplumber) for parseability, structure, contact info,
JD keyword coverage, bullet quality, and recruiter-scan heuristics.

Public API:
  - ``ats_check`` — main entry point used by ``POST /api/ats-check/{folder}``
  - ``structured_ratings_from_ats`` — map ATS payload to builder ratings shape
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

from ats_best_practices import evaluate_ats_best_practices
from jd_keyword_filter import (
    GENERIC_ENGLISH,
    JD_META_BLOCKLIST,
    build_term_frequencies,
    is_generic_english,
    jd_keyword_is_scorable as _filter_jd_keyword_is_scorable,
    rank_keyword_candidates,
    slice_jd_keyword_regions,
)

LIBRARY_ROOT = os.environ.get("LIBRARY_ROOT", str(Path(__file__).parent.parent / "resumes"))

# ============================================================================
# ATS CHECK — structural + keyword-coverage scoring against a JD
# ============================================================================
#
# This is *not* a JD-fit score (we already have that via `_rate_resume`).
# It's a "will an ATS actually parse this PDF?" check — text-extractable,
# single-column, sections present, contact info detected, page count — plus
# a keyword coverage table built from the JD.
#
# Runs locally on the compiled PDF; no LLM needed. Fast (~200ms).

_STOPWORDS = {
    "a","an","and","the","or","but","if","of","to","in","on","for","with","by",
    "as","is","are","was","were","be","been","being","this","that","these",
    "those","it","its","at","from","not","you","your","we","our","us","i",
    "they","them","their","he","she","his","her","will","would","can","could",
    "should","may","might","must","do","does","did","done","have","has","had",
    "having","about","into","over","under","up","down","out","than","then",
    "so","because","while","when","where","how","what","which","who","whom",
    "all","any","each","every","other","some","such","no","nor","only","own",
    "same","also","just","more","most","very","there","here","both","few","many",
    "much","new","please","via","etc","including","include","includes","using",
    "use","used","uses","make","makes","made","work","works","worked","working",
    "team","teams","role","roles","skills","skill","ability","experience",
    "experiences","year","years","job","jobs","position","candidate","required",
    "preferred","plus","strong","excellent","good","great","across","within",
    "already","looking","seeking","join","apply","hiring","posted",
}

# Legacy alias: stopwords + HR meta + generic English (see jd_keyword_filter.py).
_JD_KEYWORD_BLOCKLIST: frozenset = _STOPWORDS | JD_META_BLOCKLIST | GENERIC_ENGLISH

_SHORT_TECH_ALLOW: frozenset = frozenset({
    "llm", "llms", "nlp", "api", "apis", "sql", "aws", "gcp", "css", "html",
    "xml", "json", "ml", "ai", "bi", "etl", "ci", "cd", "ui", "ux", "qa",
    "iot", "erp", "crm", "sdk", "gpu", "rest", "grpc", "tcp", "udp", "http",
    "https", "npm", "pip", "vpc", "iam", "s3", "ec2", "rds", "k8s",
})

_JD_SALUTATION_NAME_RE = re.compile(
    r"(?:dear|hi|hello|hey|regards|sincerely|thanks|thank you|contact|"
    r"hiring manager|recruiter|interviewer|from)\s*[,:]?\s*([A-Z][a-z]{2,18})\b",
    re.I,
)

# Weak alone — keep only inside multi-word skill phrases (e.g. "machine learning").
_JD_WEAK_SINGLETONS: frozenset = frozenset({
    "machine", "learning", "data", "model", "models", "code", "tool", "tools",
    "cloud", "web", "mobile", "core", "base", "stack", "full", "end", "front",
    "back", "high", "level", "senior", "junior", "staff", "principal",
    "years", "year", "yrs", "field", "fields", "information", "manage", "strong",
    "ability", "related", "complex",
})

# Common given names in email/sign-off boilerplate (lowercase).
_JD_LIKELY_PERSON_NAMES: frozenset = frozenset({
    "aaron", "adam", "alex", "alexander", "alice", "amanda", "amy", "andrew",
    "anna", "ashley", "ben", "brian", "chris", "christopher", "dan", "daniel",
    "david", "diana", "emily", "eric", "emma", "ethan", "eva", "frank",
    "george", "grace", "hannah", "helen", "henry", "jack", "james", "jane",
    "jason", "jeff", "jennifer", "jessica", "jim", "john", "jon", "jordan",
    "jose", "joseph", "josh", "joshua", "julia", "karen", "kate", "katherine",
    "kevin", "kim", "kyle", "laura", "lauren", "lisa", "luke", "mark",
    "maria", "marie", "matt", "matthew", "michael", "michelle", "mike",
    "nancy", "nathan", "nick", "nicole", "olivia", "paul", "peter", "rachel",
    "ray", "rebecca", "richard", "robert", "ryan", "sam", "samantha", "sarah",
    "scott", "sean", "sophia", "stephanie", "steve", "steven", "susan",
    "thomas", "tim", "tyler", "victor", "william", "zach", "zoe",
})

# Common section labels — case-insensitive substring check on extracted text.
_ATS_REQUIRED_SECTIONS = ["experience", "education", "skills"]
_ATS_OPTIONAL_SECTIONS = ["projects", "summary", "objective"]

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}")
_URL_RE   = re.compile(r"(?:https?://|www\.|linkedin\.com|github\.com)[\w./?=&%+#:-]+", re.I)


def _blocked_name_tokens_from_jd(jd: str) -> Set[str]:
    """Names from salutations/sign-offs in pasted postings (e.g. 'Hi Aaron')."""
    blocked: Set[str] = set()
    for m in _JD_SALUTATION_NAME_RE.finditer(jd or ""):
        blocked.add(m.group(1).lower())
    return blocked


def _is_tech_skill_token(token: str) -> bool:
    t = (token or "").lower().strip()
    if not t:
        return False
    if t in _COMMON_SKILL_TOKENS or t in _SHORT_TECH_ALLOW:
        return True
    if any(t in p for p in _COMMON_SKILL_PHRASES):
        return True
    if re.search(r"[+#.0-9]", t) or t.endswith(".js") or t.endswith(".net"):
        return True
    return False


def _jd_keyword_is_scorable(
    term: str,
    jd_count: int,
    blocked_names: Set[str],
    priority_count: int = 0,
) -> bool:
    """Keep skills and priority-section terms; drop generic English / person names."""
    t = (term or "").lower().strip()
    if t in _JD_LIKELY_PERSON_NAMES:
        return False
    if t in _JD_DOMAIN_SINGLETON_NOISE and " " not in t:
        return False
    if " " not in t and t in _JD_WEAK_SINGLETONS:
        return False
    return _filter_jd_keyword_is_scorable(
        term,
        whole_count=jd_count,
        priority_count=priority_count,
        blocked_names=blocked_names,
        is_tech_skill=_is_tech_skill_token,
        is_low_value_phrase=_is_low_value_jd_keyword,
    )


def _extract_jd_keywords(jd: str, max_keywords: int = 25) -> List[Dict]:
    """Pull weighted keywords from a JD using section-weighted TF + allowlist-first filtering.

    Returns: [{"keyword": "...", "weight": 1-3, "jd_count": n}, ...] sorted by weight desc.
    """
    text = (jd or "").lower()
    if not text.strip():
        return []

    blocked_names = _blocked_name_tokens_from_jd(jd)
    priority, secondary, whole = slice_jd_keyword_regions(jd)
    weighted, priority_n, whole_n = build_term_frequencies(priority, secondary, text)

    phrase_lc = {p.lower() for p in _COMMON_SKILL_PHRASES}
    for phrase in _COMMON_SKILL_PHRASES:
        pl = phrase.lower()
        if pl in text:
            weighted[pl] = max(weighted.get(pl, 0), 5.0)
            whole_n[pl] = max(whole_n.get(pl, 0), 2)
            if pl in priority or pl in secondary:
                priority_n[pl] = max(priority_n.get(pl, 0), 1)

    for bg in list(weighted.keys()):
        if " " not in bg:
            continue
        if bg.lower() in phrase_lc:
            weighted[bg] = max(weighted.get(bg, 0), 4.0)
        for part in bg.split():
            if part in weighted and part in _JD_WEAK_SINGLETONS:
                del weighted[part]

    ranked = rank_keyword_candidates(
        weighted,
        priority_n,
        whole_n,
        blocked_names=blocked_names,
        is_tech_skill=_is_tech_skill_token,
        is_low_value_phrase=_is_low_value_jd_keyword,
        max_keywords=max_keywords,
    )

    out: List[Dict] = []
    for k, c, _score in ranked[:max_keywords]:
        pc = priority_n.get(k, 0)
        if not _jd_keyword_is_scorable(k, c, blocked_names, priority_count=pc):
            continue
        if c >= 4:
            w = 3
        elif c >= 2:
            w = 2
        else:
            w = 1
        out.append({"keyword": k, "weight": w, "jd_count": c})
    return out


def _check_keyword_in_resume(keyword: str, resume_text: str) -> Dict:
    """Find a JD keyword in resume text. Multi-word keywords match either as a
    contiguous phrase (status=found) or with all parts present separately
    (status=partial). Single words are found/missing only.

    Counts matches case-insensitively with word-boundary regex so "react"
    doesn't match "reaction".
    """
    rt = (resume_text or "").lower()
    if not rt:
        return {"keyword": keyword, "status": "missing", "count": 0}

    # Word-boundary match for the full phrase
    pat = re.compile(r"\b" + re.escape(keyword) + r"\b", re.I)
    count = len(pat.findall(rt))
    if count > 0:
        return {"keyword": keyword, "status": "found", "count": count}

    # For multi-word phrases, also check if all words appear separately
    if " " in keyword:
        parts = keyword.split()
        all_present = all(re.search(r"\b" + re.escape(p) + r"\b", rt) for p in parts)
        if all_present:
            return {"keyword": keyword, "status": "partial", "count": 0}

    return {"keyword": keyword, "status": "missing", "count": 0}


# --- ATS: JD signals, weighted keywords, bullet/summary heuristics (no LLM) ---

_KEYWORD_TYPE_WEIGHTS: Dict[str, int] = {
    "jobTitle": 25,
    "requiredSkills": 25,
    "repeatedKeywords": 15,
    "certifications": 15,
    "preferredSkills": 10,
    "industryTerms": 10,
}

_ATS_SCORE_WEIGHTS: Dict[str, int] = {
    "jdKeywordMatch": 30,
    "requiredSkillMatch": 20,
    "categoryAndTitleMatch": 15,
    "experienceBulletQuality": 15,
    "formattingAndParseability": 10,
    "contactAndLinks": 5,
}

_JD_CATEGORY_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "Engineering / Software": (
        "software", "engineer", "developer", "frontend", "front-end", "backend", "back-end",
        "full stack", "fullstack", "devops", "sre", "api", "microservices", "cloud", "kubernetes",
        "python", "java", "typescript", "javascript", "react", "vue", "angular", "node",
    ),
    "Data / Analytics": (
        "data analyst", "analytics", "sql", "tableau", "looker", "power bi", "snowflake",
        "etl", "warehouse", "metrics", "dashboard", "reporting", "scientist", "machine learning",
    ),
    "Sales": (
        "sales", "account executive", "ae ", " sdr", "bdr", "quota", "pipeline", "territory",
        "business development", "revenue", "prospecting",
    ),
    "Marketing": (
        "marketing", "seo", "sem", "content", "brand", "campaign", "growth", "email marketing",
        "social media", "copywriting",
    ),
    "Healthcare": (
        "clinical", "patient", "rn ", "nurse", "hospital", "medical", "pharma", "healthcare",
        "hipaa",
    ),
    "Finance / Accounting": (
        "finance", "accounting", "cpa", "audit", "budget", "forecast", "fp&a", "controller",
        "treasury", "tax",
    ),
    "Product / Program": (
        "product manager", "program manager", "roadmap", "stakeholder", "agile", "scrum",
        "prioritization", "discovery",
    ),
}

_COMMON_SKILL_PHRASES: Tuple[str, ...] = (
    "machine learning", "deep learning", "computer vision", "natural language",
    "ci/cd", "object oriented", "object-oriented", "rest api", "rest apis", "graphql",
    "react native", "next.js", "node.js", "vue.js", "ruby on rails", "spring boot",
    "power bi", "google cloud", "aws lambda", "kubernetes",
    "credit cards", "financial services", "business analyst", "data analyst",
    "regulatory compliance", "risk management",
)

# Lone JD tokens that are noise unless part of a phrase (e.g. keep "credit cards", drop "cards").
_JD_DOMAIN_SINGLETON_NOISE: frozenset = frozenset({
    "domain", "credit", "cards", "card", "margin", "performance", "challenges", "challenge",
    "banking", "financial", "business", "industry", "services", "service", "analyst",
})

# Job-title words that should not appear as standalone keyword chips.
_JD_TITLE_FRAGMENT_WORDS: frozenset = frozenset({
    "business", "analyst", "senior", "junior", "associate", "manager", "engineer",
    "developer", "specialist", "consultant", "lead", "staff", "principal", "director",
})

_COMMON_SKILL_TOKENS: frozenset = frozenset({
    "python", "java", "kotlin", "swift", "go", "golang", "rust", "ruby", "php", "scala", "r",
    "javascript", "typescript", "react", "vue", "angular", "svelte", "nextjs", "nodejs", "node",
    "express", "django", "flask", "fastapi", "spring", "rails", "laravel", "dotnet", "csharp",
    "sql", "mysql", "postgresql", "postgres", "mongo", "mongodb", "redis", "elasticsearch",
    "dynamodb", "cassandra", "snowflake", "databricks", "spark", "kafka", "rabbitmq",
    "aws", "gcp", "azure", "terraform", "docker", "kubernetes", "jenkins", "nginx",
    "graphql", "grpc", "html", "css", "sass", "tailwind", "webpack", "vite",
    "pandas", "numpy", "tensorflow", "pytorch", "sklearn", "tableau", "looker", "excel",
    "salesforce", "sap", "figma", "jira", "confluence", "git", "github", "gitlab",
    "linux", "bash", "shell", "c++", "csharp", "dotnet", ".net",
})

_STRONG_ACTION_VERBS: frozenset = frozenset({
    "built", "developed", "designed", "launched", "led", "managed", "delivered", "improved",
    "reduced", "increased", "decreased", "automated", "implemented", "architected", "scaled",
    "migrated", "secured", "optimized", "debugged", "refactored", "integrated", "deployed",
    "owned", "created", "established", "accelerated", "streamlined", "drove", "shipped",
    "grew", "saved", "expanded", "negotiated", "mentored", "coached", "defined", "spearheaded",
})

_ATS_WEAK_VERBS: frozenset = frozenset({
    "worked", "helped", "assisted", "responsible", "involved", "participated", "contributed",
    "supported", "handled", "did", "made", "got", "had", "tried", "attempted",
})

_WEAK_BULLET_PREFIXES: Tuple[str, ...] = (
    "responsible for ", "worked on ", "helped with ", "involved in ", "assisted with ",
    "duties included ", "tasked with ", "duty to ", "main duty",
)

_ATS_NUMBER_RE = re.compile(r"\b\d+([.,]\d+)?[%KkMmBb]?\+?\b|\$\d|\b\d+x\b", re.I)

_CERT_PATTERNS = re.compile(
    r"\b(?:PMP|CAPM|CPA|CFA|SHRM(?:-CP)?|PHR|SPHR|CISSP|CISM|CEH|Security\+|CompTIA|"
    r"AWS\s+Certified|Azure\s+Certified|Google\s+Cloud\s+Professional|GCP\s+Professional|"
    r"Scrum\s*Master|PSM\s*(?:I{1,3}|1|2)|CSM|ITIL|PE\s*License|Six\s+Sigma)\b",
    re.I,
)

_UNPROFESSIONAL_EMAIL_LOCAL = re.compile(
    r"(?:^|\b)(?:beer|booze|partygirl|partyguy|hotmail420|sexy|badass|killer|"
    r"princess|gangsta|420|69{2,})(?:\b|\d)",
    re.I,
)

_US_CITY_STATE_RE = re.compile(
    r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\b",
)


_JD_PROSE_CLAUSE_RE = re.compile(
    r"^(?:and|or|but|with|in|to|for|at|the|a|an)\b|"
    r"^\d+[\).\]]?\s*[-–]?\s*|"
    r"\b(?:years?|yrs?)\s+of\s+experience\b|"
    r"^ability\s+to\b|"
    r"^preferably\b|"
    r"^requirements?\b$|"
    r"^related\s+field\b|"
    r"^or\s+a\s+related\b",
    re.I,
)

_MAX_JD_KEYWORD_CHARS = 48


def _normalize_keyword_phrase(raw: str) -> str:
    t = re.sub(r"^[\s•\-–—*●◦▪·\d.)]+", "", (raw or "").strip())
    t = re.sub(r"\s+", " ", t)
    t = t.strip(".,;:-·")
    t = re.sub(r"\s+experience\s*$", "", t, flags=re.I).strip()
    return t


def _is_low_value_jd_keyword(term: str) -> bool:
    """Drop sentence fragments and HR boilerplate mistaken for skills."""
    t = _normalize_keyword_phrase(term).lower()
    if not t or len(t) < 3:
        return True
    if len(t) > _MAX_JD_KEYWORD_CHARS:
        return True
    if _JD_PROSE_CLAUSE_RE.search(t):
        return True
    if re.match(r"^(\w+)\s+\1$", t):
        return True
    if re.match(r"^(?:requirements?|qualifications?|preferred|responsibilities)\s+", t):
        return True
    if re.search(r"\s+(?:and|or|the|in|of|to|with|for|a|an|as|at|by|on)$", t):
        return True
    if re.match(r"^(?:and|or|the|in|of|to|with|for|a|an|as|at|by|on)\s+", t):
        return True
    words = [w for w in t.split() if w]
    if len(words) >= 6:
        return True
    if len(words) >= 4:
        stop = sum(
            1 for w in words
            if w in _STOPWORDS or is_generic_english(w) or w in JD_META_BLOCKLIST
        )
        if stop / len(words) >= 0.55:
            return True
    if is_generic_english(t) or t in JD_META_BLOCKLIST:
        return True
    return False


def _prune_redundant_keywords(items: List[Dict]) -> List[Dict]:
    """Drop single words already covered by a longer phrase in the same list."""
    if not items:
        return items
    phrases = [
        i["keyword"].lower()
        for i in items
        if " " in (i.get("keyword") or "")
    ]
    out: List[Dict] = []
    for item in items:
        kw = _normalize_keyword_phrase(str(item.get("keyword") or ""))
        if not kw or _is_low_value_jd_keyword(kw):
            continue
        kl = kw.lower()
        if " " not in kl and phrases:
            if any(
                re.search(r"\b" + re.escape(kl) + r"\b", ph)
                for ph in phrases
            ) and not _is_tech_skill_token(kl):
                continue
        if kl in _JD_DOMAIN_SINGLETON_NOISE or kl in _JD_TITLE_FRAGMENT_WORDS:
            continue
        out.append({**item, "keyword": kw})
    return out


def _keyword_worth_displaying(keyword: str) -> bool:
    kl = (keyword or "").lower().strip()
    if not kl or _is_low_value_jd_keyword(kl):
        return False
    if " " not in kl and kl in _STOPWORDS:
        return False
    if " " not in kl and kl in _JD_WEAK_SINGLETONS:
        return False
    if " " not in kl and kl in _JD_DOMAIN_SINGLETON_NOISE:
        return False
    if " " not in kl and kl in _JD_TITLE_FRAGMENT_WORDS:
        return False
    return True


_LATEX_ENV_RE = re.compile(
    r"\\begin\{(?:itemize|enumerate|description)\}(?:\[[^\]]*\])?|"
    r"\\end\{(?:itemize|enumerate|description)\}",
    re.I,
)


def _sanitize_recruiter_display_text(raw: str, max_len: int = 200) -> str:
    """Plain text for recruiter-scan UI — strip LaTeX / markup from PDF or parsed bullets."""
    s = (raw or "").strip()
    if not s:
        return ""
    if _LATEX_ENV_RE.search(s) or "\\item" in s or "\\resumeItem" in s:
        s = _LATEX_ENV_RE.sub(" ", s)
        s = re.sub(r"\\item\s*\{?", " ", s, flags=re.I)
        s = re.sub(r"\\resumeItem\s*\{?", " ", s, flags=re.I)
        s = re.sub(r"\\small\s*\{?", " ", s, flags=re.I)
    for _ in range(10):
        prev = s
        s = re.sub(r"\\[a-zA-Z@]+(?:\*)?(?:\[[^\]]*\])?\{([^{}]*)\}", r"\1", s)
        s = re.sub(r"\{([^{}]*)\}", r"\1", s)
        if s == prev:
            break
    s = re.sub(r"\\[a-zA-Z@]+(?:\*)?(?:\[[^\]]*\])?", " ", s)
    s = re.sub(r"\*\*", " ", s)
    s = re.sub(r"\{:\s*", ": ", s)
    s = re.sub(r"[{}]", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;:-·")
    return s[:max_len]


def _line_looks_like_location_only(line: str) -> bool:
    s = (line or "").strip()
    if not s or len(s) > 80:
        return False
    if re.search(r"\b(University|College|Institute|Bachelor|Master|B\.?S\.?|M\.?A\.?|MBA|Ph\.?D\.?)\b", s, re.I):
        return False
    if _US_CITY_STATE_RE.search(s):
        return True
    if re.match(
        r"^[A-Za-z][A-Za-z\s.'-]{1,40},\s*(?:[A-Z]{2}|[A-Za-z]{4,})(?:\s*,\s*(?:USA|US|U\.S\.?))?\s*$",
        s,
        re.I,
    ):
        return True
    return False


def _line_looks_like_education_entry(line: str) -> bool:
    s = (line or "").strip()
    if len(s) < 8:
        return False
    if _line_looks_like_location_only(s):
        return False
    return bool(
        re.search(
            r"\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|MBA|Ph\.?D\.?|Bachelor|Master|"
            r"University|College|Institute|School of)\b",
            s,
            re.I,
        )
    )


def _education_line_score(line: str) -> int:
    s = _sanitize_recruiter_display_text(line, max_len=220)
    if not s or not _line_looks_like_education_entry(s):
        return -1
    score = 0
    if re.search(r"\b(University|College|Institute)\b", s, re.I):
        score += 3
    if re.search(r"\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|MBA|Ph\.?D\.?|Bachelor|Master)\b", s, re.I):
        score += 4
    if re.search(r"\b(19|20)\d{2}\b", s):
        score += 1
    if _line_looks_like_location_only(s):
        score -= 6
    return score


def _extract_education_line(full_text: str) -> str:
    """Education snippet — degree/school lines only; not city/state contact rows."""
    text = full_text or ""
    lower = text.lower()
    candidates: List[str] = []

    for marker in ("education", "academic background", "academics"):
        idx = lower.find(marker)
        if idx == -1:
            continue
        for raw in text[idx: idx + 800].splitlines()[1:14]:
            line = _sanitize_recruiter_display_text(raw.strip(), max_len=220)
            if len(line) < 8 or len(line) > 200:
                continue
            if _line_looks_like_education_entry(line):
                candidates.append(line)

    for m in re.finditer(
        r"(?i)(?:[^\n]{0,30}\b(?:B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|MBA|Ph\.?D\.?|Bachelor|Master)\b[^\n]{0,90})",
        text,
    ):
        snippet = _sanitize_recruiter_display_text(m.group(0).strip(), max_len=200)
        if snippet and "margin" not in snippet.lower() and _line_looks_like_education_entry(snippet):
            candidates.append(snippet)

    for m in re.finditer(
        r"(?i)[^\n]{0,50}\b(University|College|Institute)\b[^\n]{0,90}",
        text,
    ):
        snippet = _sanitize_recruiter_display_text(m.group(0).strip(), max_len=200)
        if snippet and _line_looks_like_education_entry(snippet):
            candidates.append(snippet)

    if not candidates:
        return ""

    best = max(candidates, key=_education_line_score)
    return best if _education_line_score(best) >= 0 else ""


def _skills_plain_from_latex_or_text(raw: str) -> str:
    """Turn a skills block (often LaTeX) into a short comma-separated line."""
    s = _sanitize_recruiter_display_text(raw, max_len=400)
    if not s:
        return ""
    if "\\" in (raw or "") or "{" in (raw or ""):
        chunks: List[str] = []
        for m in re.finditer(r"\\textbf\{([^}]*)\}", raw or "", re.I):
            label = _sanitize_recruiter_display_text(m.group(1), max_len=80)
            if label:
                chunks.append(label.rstrip(":"))
        tail = re.split(r"\{:\s*", raw or "", maxsplit=1)
        if len(tail) > 1:
            body = _sanitize_recruiter_display_text(tail[-1], max_len=300)
            if body:
                chunks.append(body)
        if chunks:
            s = ", ".join(c for c in chunks if c)[:200]
    tokens = _tokenize_skill_line(s)
    if len(tokens) >= 2:
        return ", ".join(tokens)[:200]
    return s[:200]


def _line_has_latex_markup(line: str) -> bool:
    s = line or ""
    return bool(
        _LATEX_ENV_RE.search(s)
        or "\\item" in s
        or "\\resumeItem" in s
        or re.search(r"\\[a-zA-Z@]+\{", s)
    )


def _sanitize_evidence_line(b: str) -> str:
    return _sanitize_recruiter_display_text(b, max_len=160)


def _bullet_quantification_ux_hint(metrics_n: int, n_bul: int) -> str:
    if not n_bul:
        return "Fewer bullet-like lines detected in the PDF — confirm experience uses clear accomplishment bullets."
    if metrics_n >= n_bul:
        return (
            f"All {n_bul} accomplishment line{'s' if n_bul != 1 else ''} include measurable numbers — "
            "strong for ATS and recruiter scan."
        )
    need = max(1, int(n_bul * 0.5) - metrics_n)
    return (
        f"{metrics_n} of {n_bul} lines include measurable impact — "
        f"aim to add numbers to about {need} more bullet{'s' if need != 1 else ''}."
    )


def _action_verb_tip_for_role(cat_name: str, sw_category: str) -> str:
    cat = (cat_name or "").lower()
    if sw_category == "software" or "engineering" in cat or "software" in cat:
        return "Prefer verbs like Built, Shipped, Automated, Optimized, and Integrated."
    if "finance" in cat or "analyst" in cat or "banking" in cat or "data" in cat:
        return "Prefer verbs like Analyzed, Modeled, Quantified, Streamlined, and Delivered."
    return "Lead bullets with strong verbs (Led, Delivered, Improved, Reduced) plus a clear outcome."


def _jd_slice(lower: str, start_keys: Tuple[str, ...], end_keys: Tuple[str, ...]) -> str:
    """Return substring of JD between first start marker and earliest end marker."""
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


def _skill_chunks_from_clause(clause: str) -> List[str]:
    """Break one clause into display-sized skill phrases."""
    t = _normalize_keyword_phrase(clause)
    if not t:
        return []

    m = re.search(r"\b(?:experience|exp)\s+in\s+(.+)$", t, re.I)
    if m:
        return _skill_chunks_from_clause(m.group(1))

    m = re.search(r"\b(?:degree|bachelor|master|phd)\s+(?:['\u2019]s\s+)?in\s+(.+)$", t, re.I)
    if m:
        return _skill_chunks_from_clause(m.group(1))

    if re.search(r"\s+(?:and|or)\s+", t, re.I):
        out: List[str] = []
        for sub in re.split(r"\s+(?:and|or|/)\s+", t, flags=re.I):
            out.extend(_skill_chunks_from_clause(sub))
        if out:
            return out

    if _is_low_value_jd_keyword(t):
        return []

    if len(t) <= _MAX_JD_KEYWORD_CHARS:
        return [t]

    out = []
    for sub in re.split(r"\s+(?:and|or|/)\s+", t, flags=re.I):
        out.extend(_skill_chunks_from_clause(sub))
    if out:
        return out

    for sub in re.split(r"\s+(?:in|for|with|to)\s+", t, flags=re.I):
        sub = _normalize_keyword_phrase(sub)
        if sub and not _is_low_value_jd_keyword(sub) and len(sub) <= _MAX_JD_KEYWORD_CHARS:
            out.append(sub)
    return out


def _tokenize_skill_line(line: str) -> List[str]:
    """Split a JD requirement line into short skill-like phrases (not full sentences)."""
    line = (line or "").strip()
    if not line:
        return []
    parts = re.split(
        r"[,;|/•\n]+|(?<=[.!?])\s+(?=[A-Za-z0-9\"'(])",
        line,
    )
    out: List[str] = []
    seen: Set[str] = set()
    for p in parts:
        for chunk in _skill_chunks_from_clause(p):
            k = chunk.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append(chunk)
    return out


def _line_looks_like_skills_list(line: str) -> bool:
    """Heuristic: comma/pipe-separated tools or a short run of skill-like tokens."""
    s = (line or "").strip()
    if len(s) < 10 or len(s) > 280:
        return False
    if _line_has_latex_markup(s):
        return False
    low = s.lower()
    if re.match(
        r"^(experience|employment|work history|education|projects|summary|objective|certifications?)\b",
        low,
    ):
        return False
    if re.search(r"\b\d{4}\s*[-–—]\s*(?:\d{4}|present)\b", low):
        return False
    tokens = _tokenize_skill_line(s)
    if len(tokens) >= 3:
        return True
    if "," in s or "|" in s or " • " in s or " · " in s:
        return len(tokens) >= 2
    words = [w for w in re.findall(r"[A-Za-z+#.]{2,}", s) if w.lower() not in _STOPWORDS]
    return 5 <= len(words) <= 22 and not s.endswith(".")


def _skills_line_from_parsed(parsed: Optional[Dict]) -> str:
    if not parsed or not isinstance(parsed.get("sections"), list):
        return ""
    chunks: List[str] = []
    for sec in parsed["sections"]:
        name = (sec.get("name") or "").lower()
        if "skill" not in name or "experience" in name:
            continue
        for ent in sec.get("entries") or []:
            for b in ent.get("bullets") or []:
                t = (b.get("text") or "").strip()
                if len(t) >= 2:
                    plain = _skills_plain_from_latex_or_text(t)
                    if plain:
                        chunks.append(plain)
    if not chunks:
        return ""
    if len(chunks) == 1:
        return chunks[0][:200]
    return ", ".join(chunks[:8])[:200]


def _mine_resume_skill_tokens(resume_lower: str, max_items: int = 12) -> List[str]:
    """Surface tools mentioned anywhere in the PDF text (fallback when no Skills block)."""
    found: List[str] = []
    seen: Set[str] = set()
    for phrase in _COMMON_SKILL_PHRASES:
        if phrase in resume_lower:
            k = phrase.lower()
            if k not in seen:
                seen.add(k)
                found.append(phrase)
    for tok in sorted(_COMMON_SKILL_TOKENS, key=len, reverse=True):
        if re.search(r"\b" + re.escape(tok) + r"\b", resume_lower):
            k = tok.lower()
            if k not in seen:
                seen.add(k)
                found.append(tok)
        if len(found) >= max_items:
            break
    return found[:max_items]


def _recruiter_top_skills_line(
    full_text: str,
    parsed: Optional[Dict],
    resume_lower: str,
) -> str:
    """Skills line for 6-second scan: parsed Skills section, heading block, any skill-dense line, or mined tokens."""
    from_parsed = _skills_line_from_parsed(parsed)
    if from_parsed:
        return from_parsed

    m_blk = re.search(
        r"(?is)\b(?:technical\s+|core\s+)?skills?\b[:\s]*\n((?:[^\n]{6,220}\n?){1,4})",
        full_text or "",
    )
    if m_blk:
        block = " ".join(ln.strip() for ln in m_blk.group(1).splitlines() if ln.strip())
        plain = _skills_plain_from_latex_or_text(block)
        if plain and (_line_looks_like_skills_list(plain) or len(_tokenize_skill_line(plain)) >= 2):
            return plain[:200]

    best_ln = ""
    best_score = 0
    for ln in (full_text or "").splitlines():
        s = ln.strip()
        if _line_has_latex_markup(s):
            plain = _skills_plain_from_latex_or_text(s)
            if not plain:
                continue
            s = plain
        if not _line_looks_like_skills_list(s):
            continue
        score = len(_tokenize_skill_line(s))
        if re.search(r"\bskills?\b", s, re.I):
            score += 4
        if score > best_score:
            best_score = score
            best_ln = s
    if best_ln:
        return best_ln[:200]

    mined = _mine_resume_skill_tokens(resume_lower)
    if mined:
        return ", ".join(mined)[:200]
    return ""


def _extract_jd_skill_phrases(jd_lower: str) -> Tuple[List[str], List[str]]:
    """Heuristic required vs preferred skill phrases from JD structure."""
    req_keys = (
        "requirements", "required qualifications", "minimum qualifications",
        "must have", "you have", "you'll need", "basic qualifications",
    )
    pref_keys = ("preferred qualifications", "nice to have", "bonus", "plus:", "preferred skills")
    end_keys = (
        "benefits", "we offer", "salary", "how to apply", "application", "equal opportunity",
        "about the company", "what you bring", "what we offer",
    )
    req_blob = _jd_slice(jd_lower, req_keys, pref_keys + end_keys)
    pref_blob = _jd_slice(jd_lower, pref_keys, end_keys)

    def _from_blob(blob: str) -> List[str]:
        found: List[str] = []
        for line in blob.splitlines():
            line_l = line.strip().lower()
            if len(line_l) < 4:
                continue
            if line_l.startswith(("•", "-", "*")):
                line_l = line_l.lstrip("•-* ").strip()
            for tok in _tokenize_skill_line(line_l):
                if (
                    len(tok) >= 3
                    and tok not in _STOPWORDS
                    and not _is_low_value_jd_keyword(tok)
                    and not (is_generic_english(tok) and not _is_tech_skill_token(tok))
                ):
                    found.append(tok)
        # De-dupe preserving order
        seen: Set[str] = set()
        uniq: List[str] = []
        for t in found:
            k = t.lower()
            if k in seen:
                continue
            seen.add(k)
            uniq.append(t)
        return uniq[:40]

    required = _from_blob(req_blob) if req_blob else []
    preferred = _from_blob(pref_blob) if pref_blob else []

    # If structure didn't yield skills, mine common tech tokens from whole JD
    if len(required) < 3:
        extra: List[str] = []
        for phrase in _COMMON_SKILL_PHRASES:
            if phrase in jd_lower and phrase not in extra:
                extra.append(phrase)
        for tok in sorted(_COMMON_SKILL_TOKENS, key=len, reverse=True):
            if re.search(r"\b" + re.escape(tok) + r"\b", jd_lower):
                extra.append(tok)
        for e in extra:
            if e.lower() not in {x.lower() for x in required}:
                required.append(e)
        required = required[:35]

    return required[:35], preferred[:25]


def _infer_jd_job_title(jd: str, target_role: str) -> str:
    tr = (target_role or "").strip()
    if tr and len(tr) < 120:
        return tr
    lines = [ln.strip() for ln in (jd or "").splitlines() if ln.strip()]
    skip = re.compile(r"^(location|remote|hybrid|onsite|apply|salary|company|overview)\b", re.I)
    for ln in lines[:25]:
        if len(ln) > 100 or skip.search(ln):
            continue
        if re.search(r"\b(inc\.|llc|corp\.)\b", ln, re.I) and "engineer" not in ln.lower():
            continue
        return ln[:120]
    return ""


def _infer_jd_category(jd_lower: str) -> str:
    best_cat = "General"
    best = 0
    for cat, kws in _JD_CATEGORY_KEYWORDS.items():
        score = sum(1 for k in kws if re.search(r"\b" + re.escape(k) + r"\b", jd_lower))
        if score > best:
            best, best_cat = score, cat
    return best_cat if best > 0 else "General"


def _extract_certifications(jd: str) -> List[str]:
    return sorted(set(m.group(0).strip() for m in _CERT_PATTERNS.finditer(jd or "")))


def _years_experience_hint(jd_lower: str) -> Optional[int]:
    m = re.search(
        r"\b(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)\b",
        jd_lower,
    )
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


# Sign-offs and boilerplate — must not become "posting emphasis".
_JD_EMPLOYER_PROBLEM_SKIP = re.compile(
    r"looking forward to|hearing from you|thank you for (?:your )?(?:interest|application)|"
    r"equal opportunity|eoe\b|we look forward|apply (?:today|now)|"
    r"please (?:submit|send) your (?:resume|cv)|don't hesitate to",
    re.I,
)

_JD_EMPLOYER_PROBLEM_PATTERNS: Tuple[Tuple[re.Pattern, int], ...] = (
    (re.compile(r"\byou will\b", re.I), 4),
    (re.compile(r"\byou'll\b", re.I), 4),
    (re.compile(r"\bwe (?:are )?(?:seeking|looking for)\b", re.I), 4),
    (re.compile(r"\b(?:seeking|hiring) (?:a|an|the)\b", re.I), 3),
    (re.compile(r"\bresponsible for\b", re.I), 3),
    (re.compile(r"\b(?:must|should) have\b", re.I), 3),
    (re.compile(r"\b(?:required|preferred) (?:skills|qualifications)\b", re.I), 3),
    (re.compile(r"\b(?:build|develop|implement|design|lead|drive|scale|improve)\b", re.I), 2),
)


def _shorten_display_line(text: str, max_len: int = 100) -> str:
    s = _sanitize_recruiter_display_text(text, max_len=max_len + 40)
    if not s:
        return ""
    if len(s) <= max_len:
        return s
    cut = s[: max_len - 1].rsplit(" ", 1)[0]
    return (cut or s[: max_len - 1]) + "…"


def _employer_problem_short(jd: str) -> str:
    """One short line for what the posting emphasizes."""
    hint = _employer_problem_hint_from_jd(jd)
    return _shorten_display_line(hint, 120)


def _employer_fit_evidence_lines(
    bullets: List[str],
    jd_lower: str,
    *,
    max_lines: int = 3,
) -> List[str]:
    """Best resume bullets that overlap JD language — sanitized and brief."""
    if not bullets or not jd_lower:
        return []

    focus: Set[str] = set()
    for t in re.findall(r"[a-z][a-z+#.-]{3,}", jd_lower):
        t = t.strip(".,;:-·")
        if t in _STOPWORDS or is_generic_english(t) or t in JD_META_BLOCKLIST:
            continue
        if len(t) >= 4:
            focus.add(t)
            if t.endswith("s") and len(t) > 4:
                focus.add(t[:-1])

    scored: List[Tuple[int, str]] = []
    for b in bullets:
        plain = _sanitize_recruiter_display_text(b, max_len=320)
        if len(plain) < 28:
            continue
        if _bullet_looks_like_education_or_date_row(plain):
            continue
        low = plain.lower()
        hits = sum(1 for t in focus if re.search(r"\b" + re.escape(t) + r"\b", low))
        role_match = bool(
            re.search(
                r"\b(content|writing|social|blog|campaign|marketing|healthcare|patient|seo)\b",
                low,
            )
        )
        if hits < 1 and not role_match:
            continue
        if re.search(r"\b(content|writing|social|blog|campaign|marketing|healthcare|patient)\b", low):
            hits += 2
        if _ATS_NUMBER_RE.search(plain) or "%" in plain:
            hits += 8
        if re.match(
            r"^(?:Increased|Reduced|Delivered|Developed|Led|Built|Translated|Created|Improved|Supported)\b",
            plain,
            re.I,
        ):
            hits += 4
        if re.search(r"\b(?:detail-driven|summary|objective)\b", low) and not _ATS_NUMBER_RE.search(plain):
            hits -= 4
        scored.append((hits, plain))

    scored.sort(key=lambda x: (-x[0], -len(x[1])))
    seen: Set[str] = set()
    out: List[str] = []
    for _hits, plain in scored:
        key = plain.lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        line = _shorten_display_line(plain, 100)
        if line:
            out.append(line)
        if len(out) >= max_lines:
            break
    return out


def _employer_fit_gap_labels(missing_req: List[str]) -> List[str]:
    """Human-readable gap chips — drop JD parsing noise."""
    out: List[str] = []
    seen: Set[str] = set()
    for raw in missing_req:
        raw_s = re.sub(r"^[\s–—\-]+", "", str(raw or "").strip())
        if not raw_s or len(raw_s) < 4:
            continue
        m_years = re.search(
            r"\d+\+?\s*(?:years?|yrs?)\b[^.]{0,90}\b(?:content writing|healthcare|marketing|digital)\b",
            raw_s,
            re.I,
        )
        if m_years:
            label = _shorten_display_line(m_years.group(0).strip(), 72)
        else:
            s = _normalize_keyword_phrase(raw_s)
            if not s or len(s) < 4:
                continue
            sl = s.lower()
            if sl in ("requirements", "qualifications", "responsibilities", "preferred"):
                continue
            if _is_low_value_jd_keyword(s) and not re.search(
                r"\b(\d+\+?\s*years?|bachelor|master|degree|journalism|communication|content writing)\b",
                sl,
            ):
                continue
            if re.search(r"\b(bachelor|master|degree|journalism|communication)\b", sl):
                label = _shorten_display_line(s, 72)
            else:
                label = _shorten_display_line(s, 56)
        if not label:
            continue
        k = label.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(label)
        if len(out) >= 4:
            break
    return out


def _employer_problem_hint_from_jd(jd: str) -> str:
    """Best-effort one-liner for what the posting emphasizes (ATS panel). Not LLM-generated."""
    jd = (jd or "").strip()
    if not jd:
        return ""

    best_line = ""
    best_score = 0
    for ln in jd.splitlines():
        s = ln.strip()
        if not (40 < len(s) < 280):
            continue
        if _JD_EMPLOYER_PROBLEM_SKIP.search(s):
            continue
        score = sum(w for pat, w in _JD_EMPLOYER_PROBLEM_PATTERNS if pat.search(s))
        if score > best_score:
            best_score = score
            best_line = s

    if best_line:
        return best_line[:400]

    for block in (b.strip() for b in jd.split("\n\n") if b.strip()):
        if len(block) < 40 or _JD_EMPLOYER_PROBLEM_SKIP.search(block):
            continue
        first_ln = block.splitlines()[0].strip()
        if 40 <= len(first_ln) < 280 and not _JD_EMPLOYER_PROBLEM_SKIP.search(first_ln):
            return first_ln[:400]
        if len(block) >= 40:
            return block[:240]

    if _JD_EMPLOYER_PROBLEM_SKIP.search(jd):
        return ""
    return jd[:240]


def _analyze_jd_signals(jd: str, target_role: str) -> Dict:
    jd = jd or ""
    jd_lower = jd.lower()
    title = _infer_jd_job_title(jd, target_role)
    category = _infer_jd_category(jd_lower)
    req_skills, pref_skills = _extract_jd_skill_phrases(jd_lower)
    certs = _extract_certifications(jd)
    repeated: List[Dict] = []
    for item in _extract_jd_keywords(jd, max_keywords=40):
        if item.get("jd_count", 0) >= 3:
            repeated.append({"keyword": item["keyword"], "count": item["jd_count"]})
    prob = _employer_problem_hint_from_jd(jd)
    return {
        "jobTitle": title,
        "jobCategory": category,
        "requiredSkills": req_skills,
        "preferredSkills": pref_skills,
        "certifications": certs,
        "repeatedKeywords": repeated[:15],
        "minYearsExperience": _years_experience_hint(jd_lower),
        "employerProblemHint": prob[:400],
    }


def _classify_keyword_type(
    keyword: str,
    jd_lower: str,
    signals: Dict,
    title_l: str,
) -> str:
    kl = keyword.lower()
    for c in signals.get("certifications") or []:
        cl = c.lower()
        if cl in kl or kl in cl or re.search(r"\b" + re.escape(kl) + r"\b", cl):
            return "certifications"
    if (
        (" " in kl or kl not in _JD_TITLE_FRAGMENT_WORDS)
        and (kl in title_l or (len(kl) > 3 and kl in title_l.replace("-", " ")))
    ):
        return "jobTitle"
    req_l = [_normalize_keyword_phrase(s).lower() for s in (signals.get("requiredSkills") or [])]
    if kl in req_l or any(
        re.search(r"\b" + re.escape(kl) + r"\b", r)
        for r in req_l
        if len(kl) >= 4 and len(r) >= len(kl)
    ):
        return "requiredSkills"
    pref_l = [_normalize_keyword_phrase(s).lower() for s in (signals.get("preferredSkills") or [])]
    if kl in pref_l or any(
        re.search(r"\b" + re.escape(kl) + r"\b", r)
        for r in pref_l
        if len(kl) >= 4 and len(r) >= len(kl)
    ):
        return "preferredSkills"
    rep = signals.get("repeatedKeywords") or []
    if any(r.get("keyword", "").lower() == kl for r in rep):
        return "repeatedKeywords"
    return "industryTerms"


def _resume_bullets(full_text: str, parsed: Optional[Dict]) -> List[str]:
    out: List[str] = []
    if parsed and isinstance(parsed.get("sections"), list):
        for sec in parsed["sections"]:
            if not sec.get("editable"):
                continue
            name = (sec.get("name") or "").lower()
            if "skill" in name and "experience" not in name:
                continue
            for ent in sec.get("entries") or []:
                for b in ent.get("bullets") or []:
                    t = (b.get("text") or "").strip()
                    if len(t) > 10:
                        out.append(t)
    if out:
        return out[:120]
    for raw in (full_text or "").splitlines():
        s = raw.strip()
        if len(s) < 22 or len(s) > 420:
            continue
        if s[:1] in "•–-*●◦▪·" or re.match(r"^[\-\u2013\u2014]\s+\S", s) or re.match(r"^\d+[\).\]]\s+\S", s):
            t = re.sub(r"^[\d\s.)•–\-*●◦▪·]+", "", s).strip()
            if len(t) > 15:
                out.append(t)
    return out[:100]


_US_PHONE_INLINE = re.compile(
    r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b",
)


def _bullet_looks_like_contact_or_latex_noise(b: str) -> bool:
    """PDF bullet heuristics often swallow the header row (email, LaTeX). Skip for metrics."""
    low = b.lower()
    if "@" in b or "mailto:" in low or "linkedin.com" in low or "github.com" in low:
        return True
    if "href" in low or "http://" in low or "https://" in low or "www." in low:
        return True
    if "\\" in b or "{" in b:
        return True
    if _US_PHONE_INLINE.search(b):
        return True
    return False


def _token_is_long_bare_id_or_phone(token: str) -> bool:
    """7+ digit runs without %, $, or k/m/b scale are almost never résumé impact metrics."""
    if re.search(r"[%$]", token) or re.search(r"[kKmMbB]", token):
        return False
    if re.search(r"\d\s*x\b", token, re.I):
        return False
    core = re.sub(r"[^\d]", "", token.split("+", 1)[0])
    return bool(core.isdigit() and len(core) >= 7)


def _token_is_year_not_impact_metric(token: str) -> bool:
    t = (token or "").strip()
    if re.fullmatch(r"(?:19|20)\d{2}\+?", t):
        return True
    if re.fullmatch(r"(?:19|20)\d{2}", re.sub(r"[^\d]", "", t)):
        return True
    return False


def _bullet_looks_like_education_or_date_row(b: str) -> bool:
    s = _sanitize_recruiter_display_text(b, max_len=220)
    if not s:
        return True
    if _line_looks_like_education_entry(s) and not re.search(r"[%$]|\d+\s*x\b", s, re.I):
        return True
    if re.search(r"\b(University|College|Institute)\b", s, re.I) and re.search(r"\b(19|20)\d{2}\b", s):
        if not re.search(r"[%$]|\b\d{1,3}%\b", s):
            return True
    if re.search(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(19|20)\d{2}\b", s, re.I):
        if re.search(r"\b(University|College|Graduat)\b", s, re.I):
            return True
    return False


def _pick_strongest_metric_snippet(bullets: List[str]) -> str:
    """Pick a number that reads like an accomplishment metric — not longest digit substring."""
    best_key: Tuple[int, float] = (-1, -1.0)
    best_snip = ""

    for b in bullets:
        if _bullet_looks_like_contact_or_latex_noise(b):
            continue
        plain_b = _sanitize_recruiter_display_text(b, max_len=220)
        if _bullet_looks_like_education_or_date_row(plain_b or b):
            continue
        scan_b = plain_b or b
        for mm in _ATS_NUMBER_RE.finditer(scan_b):
            tok = mm.group(0).strip()
            if _token_is_long_bare_id_or_phone(tok):
                continue
            if _token_is_year_not_impact_metric(tok):
                continue
            prio = 1
            tie = 0.0
            if "%" in tok:
                prio = 5
                try:
                    tie = float(re.sub(r"[^\d.]", "", tok.split("%", 1)[0] or "0"))
                except ValueError:
                    tie = 0.0
            elif re.match(r"^\$", tok):
                prio = 4
                try:
                    tie = float(re.sub(r"[^\d.]", "", tok.replace(",", "")))
                except ValueError:
                    tie = 0.0
            elif re.search(r"\d+\s*x\b", tok, re.I):
                prio = 3
                try:
                    tie = float(re.sub(r"[^\d.]", "", re.split(r"(?i)x", tok)[0] or "0"))
                except ValueError:
                    tie = 0.0
            elif re.search(r"[kKmMbB]", tok, re.I):
                prio = 2
                mscale = re.search(r"([\d.,]+)\s*[kKmMbB]", tok, re.I)
                if mscale:
                    try:
                        tie = float(mscale.group(1).replace(",", ""))
                    except ValueError:
                        tie = 0.0
            else:
                try:
                    parts = re.split(r"\s+", tok.strip(), 1)
                    tie = float(re.sub(r"[^\d.]", "", parts[0] or "0"))
                except ValueError:
                    tie = 0.0
                prio = 2 if "+" in tok else 1
            if (prio, tie) > best_key:
                best_key = (prio, tie)
                best_snip = tok + " — " + _sanitize_evidence_line(scan_b)[:100]
    return best_snip


def _summary_excerpt(lower_text: str, full_text: str) -> str:
    """Best-effort summary/objective region from PDF text."""
    markers = ("summary", "profile", "objective", "about me")
    lines = full_text.splitlines()
    grab = False
    buf: List[str] = []
    for ln in lines:
        l = ln.strip()
        low = l.lower()
        if any(re.match(rf"^\s*{re.escape(m)}\b", low) for m in markers):
            grab = True
            continue
        if grab:
            if any(
                re.match(rf"^\s*{re.escape(m)}\b", low)
                for m in ("experience", "employment", "work history", "education", "skills", "projects")
            ):
                break
            if l:
                buf.append(l)
        if len(buf) > 12:
            break
    return " ".join(buf)[:1200]


def _bullet_score_row(text: str, jd_terms: Set[str]) -> Dict:
    low = text.lower()
    words = re.findall(r"[A-Za-z']+", text)
    first = words[0].lower() if words else ""
    starts_action = first in _STRONG_ACTION_VERBS
    has_metric = bool(_ATS_NUMBER_RE.search(text))
    impact_kw = any(
        x in low
        for x in (
            "revenue", "cost", "latency", "churn", "conversion", "retention", "efficiency",
            "downtime", "customer", "user", "users", "traffic", "throughput", "budget",
            "deadline", "satisfaction", "nps", "arr", "mrr",
        )
    )
    has_rel = False
    for t in jd_terms:
        if len(t) >= 3 and re.search(r"\b" + re.escape(t.lower()) + r"\b", low):
            has_rel = True
            break
    weak_prefix = any(low.startswith(p) for p in _WEAK_BULLET_PREFIXES)
    is_generic = (
        weak_prefix
        or first in _ATS_WEAK_VERBS
        or (len(words) < 10 and not has_metric)
    )
    return {
        "startsWithActionVerb": starts_action,
        "hasMetric": has_metric,
        "hasBusinessImpact": impact_kw,
        "hasRelevantKeyword": has_rel,
        "isTooGeneric": is_generic,
    }


def _skill_suggestion_rows(
    jd_lower: str,
    resume_lower: str,
    required: List[str],
    preferred: List[str],
) -> List[Dict]:
    rows: List[Dict] = []
    for skill in required[:20]:
        sl = skill.lower()
        in_jd = len(re.findall(r"\b" + re.escape(sl) + r"\b", jd_lower))
        present = bool(re.search(r"\b" + re.escape(sl) + r"\b", resume_lower))
        related = False
        if not present:
            for tok in sl.replace("/", " ").split():
                if len(tok) >= 4 and tok != sl and tok in resume_lower:
                    related = True
                    break
        if present:
            status = "already_present"
            rec = "add_if_true"
        elif related:
            status = "candidate_claimed_related"
            rec = "add_if_true"
        else:
            status = "missing"
            rec = "add_if_true" if in_jd >= 2 else "do_not_add_without_experience"
        rows.append({
            "skill": skill,
            "source": "job_description",
            "status": status,
            "recommendation": rec,
            "jdMentions": in_jd,
        })
    for skill in preferred[:12]:
        sl = skill.lower()
        if any(r["skill"].lower() == sl for r in rows):
            continue
        present = bool(re.search(r"\b" + re.escape(sl) + r"\b", resume_lower))
        rows.append({
            "skill": skill,
            "source": "job_description",
            "status": "already_present" if present else "missing",
            "recommendation": "add_if_true" if present else "do_not_add_without_experience",
            "jdMentions": len(re.findall(r"\b" + re.escape(sl) + r"\b", jd_lower)),
        })
    return rows[:28]


def _detect_layout_issues(pdf) -> Dict:
    """Heuristics for ATS-unfriendly layouts. Multi-column resumes (common in
    designer templates) often confuse parsers — the text comes out interleaved
    line-by-line instead of column-by-column.

    We look at the x-coordinate distribution of words on the first page: if
    there are two clear clusters with a gap, it's likely multi-column.
    """
    out = {"single_column": True, "x0_clusters": 1, "detail": ""}
    try:
        if not pdf.pages:
            out["detail"] = "no pages"
            return out
        page = pdf.pages[0]
        words = page.extract_words() or []
        if len(words) < 20:
            out["detail"] = "too few words to analyze layout"
            return out
        x0s = sorted(w["x0"] for w in words)
        # Bin x0 to nearest 10pt; the most common bin is the left margin.
        from collections import Counter
        bins = Counter(int(x) // 10 * 10 for x in x0s)
        # If two bins each contain >25% of words, with a gap of 100+ pts, multi-col.
        sorted_bins = bins.most_common(3)
        total = sum(bins.values())
        big_bins = [(b, c) for b, c in sorted_bins if c / total > 0.20]
        if len(big_bins) >= 2:
            xs = sorted(b for b, _ in big_bins)
            if xs[-1] - xs[0] > 100:
                out["single_column"] = False
                out["x0_clusters"] = len(big_bins)
                out["detail"] = f"two text columns detected at x≈{xs[0]} and x≈{xs[-1]}"
        if out["single_column"]:
            out["detail"] = f"primary column at x≈{sorted_bins[0][0]}"
    except Exception as exc:
        out["detail"] = f"layout check failed: {exc}"
    return out


def ats_check(
    folder: str,
    jd: str = "",
    user_id: str = "",
    pdf_bytes: Optional[bytes] = None,
    *,
    target_role: str = "",
    parsed: Optional[Dict] = None,
) -> Dict:
    """Run an ATS + job-alignment check on the compiled PDF (text extraction).

    Resolution order for the PDF:
      1. `pdf_bytes` arg (if caller already has it)
      2. local LIBRARY_ROOT/<folder>/*.pdf
      3. Supabase resume-pdfs bucket via download_pdf

    Always returns legacy keys: ``score``, ``checks``, ``keywords``, ``stats``.
    When a job description is present, adds JD match analysis, weighted
    keyword types, bullet/summary heuristics, recruiter scan, and score
    breakdown (rule-based — not a guarantee any ATS will pass).
    """
    import io as _io

    # 1. Locate PDF bytes
    data: Optional[bytes] = pdf_bytes
    if data is None:
        folder_path = os.path.join(LIBRARY_ROOT, folder)
        if os.path.isdir(folder_path):
            for fn in os.listdir(folder_path):
                if fn.endswith(".pdf"):
                    try:
                        with open(os.path.join(folder_path, fn), "rb") as f:
                            data = f.read()
                        break
                    except Exception as exc:
                        logger.warning(f"ats_check: read {fn} failed: {exc}")
    if data is None and user_id and user_id != "local":
        try:
            try:
                from resume_gui.storage import download_pdf  # type: ignore
            except ImportError:
                from storage import download_pdf  # type: ignore
            data = download_pdf(user_id, folder)
        except Exception as exc:
            logger.warning(f"ats_check: storage download failed: {exc}")

    if data is None:
        raise FileNotFoundError(f"PDF for folder '{folder}' not found locally or in storage")

    try:
        import pdfplumber  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"pdfplumber required for ATS check: {exc}")

    pages_text: List[str] = []
    layout: Dict = {"single_column": True, "detail": "(not analyzed)"}
    page_count = 0
    with pdfplumber.open(_io.BytesIO(data)) as pdf:
        page_count = len(pdf.pages)
        for p in pdf.pages:
            # Use layout=True so pdfminer's full layout analysis is applied —
            # this preserves right-aligned table columns (dates, locations in
            # tabularx {Xr} tables from the LaTeX template) that plain
            # character-stream extraction misses.
            text = p.extract_text(layout=True) or ""
            if not text.strip():
                text = p.extract_text() or ""
            pages_text.append(text)
        layout = _detect_layout_issues(pdf)

    full_text = "\n".join(pages_text)
    word_count = len(re.findall(r"\b\w+\b", full_text))
    char_count = len(full_text)
    lower_text = full_text.lower()
    jd_stripped = (jd or "").strip()
    jd_lower = jd_stripped.lower()

    jd_signals = _analyze_jd_signals(jd_stripped, target_role)
    title_guess = jd_signals.get("jobTitle") or ""
    title_l = title_guess.lower()

    # --- Structural checks (legacy + summary hygiene) ----------------------------
    checks: List[Dict] = []

    text_extractable = char_count > 200
    checks.append({
        "id":     "text_extractable",
        "name":   "Text is selectable / extractable",
        "pass":   text_extractable,
        "detail": f"extracted {char_count:,} chars across {page_count} page(s)"
                  if text_extractable else
                  f"only {char_count} chars extracted — PDF may be image-based",
    })

    checks.append({
        "id":     "single_column",
        "name":   "Single-column, ATS-friendly layout",
        "pass":   layout["single_column"],
        "detail": layout.get("detail", ""),
    })

    page_ok = 1 <= page_count <= 3
    checks.append({
        "id":     "page_count",
        "name":   "Concise length (1–3 pages)",
        "pass":   page_ok,
        "detail": f"{page_count} page(s) — aim for 1–2 for most roles, up to 3 for deep senior histories",
    })

    sections_found  = [s for s in _ATS_REQUIRED_SECTIONS if s in lower_text]
    sections_missing = [s for s in _ATS_REQUIRED_SECTIONS if s not in lower_text]
    checks.append({
        "id":     "required_sections",
        "name":   "Standard sections present (Experience, Education, Skills)",
        "pass":   not sections_missing,
        "detail": (f"found: {', '.join(sections_found).title()}" if sections_found else "none found")
                  + (f"  |  missing: {', '.join(sections_missing).title()}" if sections_missing else ""),
    })

    has_email = bool(_EMAIL_RE.search(full_text))
    has_phone = bool(_PHONE_RE.search(full_text))
    has_url   = bool(_URL_RE.search(full_text))
    checks.append({
        "id":     "contact_info",
        "name":   "Contact info detectable (email + phone/URL)",
        "pass":   has_email and (has_phone or has_url),
        "detail": f"email={'✓' if has_email else '✗'}  phone={'✓' if has_phone else '✗'}  url={'✓' if has_url else '✗'}",
    })

    wc_ok = 200 <= word_count <= 1000
    checks.append({
        "id":     "word_count",
        "name":   "Word count in a healthy range (about 200–1,000)",
        "pass":   wc_ok,
        "detail": f"{word_count:,} words "
                  + ("(too short — add detail)" if word_count < 200 else
                     "(likely too long — trim to ~1–2 pages; most résumés stay under ~1,000 words)" if word_count > 1000 else "(OK)"),
    })

    has_objective = bool(re.search(r"\bobjective\b", lower_text)) or bool(
        re.search(r"\bseeking (a |an )?(challenging|new|)?\s*(role|position|opportunity)", lower_text)
    )
    checks.append({
        "id":     "summary_not_objective",
        "name":   "Use a professional summary (avoid a generic objective)",
        "pass":   not has_objective,
        "detail": "Objective-style headers or 'seeking a challenging role' openings read dated to recruiters."
                  if has_objective else "No classic objective pattern detected in extracted text.",
    })

    # --- Keyword table with JD signal types ------------------------------------
    kw_merge: List[Dict] = []
    seen_kw: Set[str] = set()
    for item in _extract_jd_keywords(jd_stripped, max_keywords=28):
        kw_merge.append(dict(item))
        seen_kw.add(item["keyword"].lower())
    for s in jd_signals.get("requiredSkills") or []:
        norm = _normalize_keyword_phrase(s)
        if not norm or _is_low_value_jd_keyword(norm):
            continue
        sl = norm.lower()
        if sl not in seen_kw:
            kw_merge.append({
                "keyword": norm,
                "weight": 3,
                "jd_count": len(re.findall(re.escape(sl), jd_lower)) or 1,
            })
            seen_kw.add(sl)

    kw_merge = _prune_redundant_keywords(kw_merge)
    kw_merge = [k for k in kw_merge if _keyword_worth_displaying(k.get("keyword", ""))]

    kw_results: List[Dict] = []
    w_num = 0.0
    w_den = 0.0
    for kw in kw_merge:
        r = _check_keyword_in_resume(kw["keyword"], full_text)
        r["weight"] = kw["weight"]
        r["jd_count"] = kw["jd_count"]
        ktype = _classify_keyword_type(kw["keyword"], jd_lower, jd_signals, title_l)
        r["keywordType"] = ktype
        tw = float(_KEYWORD_TYPE_WEIGHTS.get(ktype, 10))
        w_den += tw
        frac = 1.0 if r["status"] == "found" else (0.5 if r["status"] == "partial" else 0.0)
        w_num += tw * frac
        kw_results.append(r)

    jd_kw_ratio = (w_num / w_den) if w_den > 0 else 1.0

    # --- Required skills vs resume ---------------------------------------------
    req_skills: List[str] = list(jd_signals.get("requiredSkills") or [])
    resume_lower = lower_text
    missing_req: List[str] = []
    matched_req: List[str] = []
    for s in req_skills:
        sl = s.lower()
        if re.search(r"\b" + re.escape(sl) + r"\b", resume_lower) or sl in resume_lower:
            matched_req.append(s)
        else:
            missing_req.append(s)

    req_ratio = (len(matched_req) / max(1, len(req_skills))) if req_skills else 1.0

    # --- Title & category alignment --------------------------------------------
    title_tokens = [
        t for t in re.findall(r"[a-z0-9+#./-]{3,}", title_l)
        if t not in _STOPWORDS and not t.isdigit()
    ]
    title_hits = sum(
        1 for t in title_tokens
        if len(t) >= 3 and re.search(r"\b" + re.escape(t) + r"\b", resume_lower)
    )
    title_ratio = (title_hits / max(1, len(title_tokens))) if title_tokens else 0.0
    if title_ratio >= 0.45:
        title_match_label = "Strong"
    elif title_ratio >= 0.2:
        title_match_label = "Partial"
    else:
        title_match_label = "Weak"

    cat_name = jd_signals.get("jobCategory") or "General"
    cat_kws = _JD_CATEGORY_KEYWORDS.get(cat_name, ())
    cat_hits = sum(1 for k in cat_kws if re.search(r"\b" + re.escape(k) + r"\b", resume_lower))
    cat_jd = sum(1 for k in cat_kws if re.search(r"\b" + re.escape(k) + r"\b", jd_lower))
    cat_strength = cat_hits / max(5, cat_jd + 4) if jd_lower else 0.0
    if cat_strength >= 0.28:
        category_match_label = "Strong"
    elif cat_strength >= 0.12:
        category_match_label = "Partial"
    else:
        category_match_label = "Weak"

    # --- Bullets & quantification -----------------------------------------------
    jd_term_set: Set[str] = set()
    for k in kw_results[:40]:
        jd_term_set.add(k["keyword"].lower())
    for s in req_skills[:25]:
        jd_term_set.add(s.lower())

    bullets = _resume_bullets(full_text, parsed)
    bullet_rows: List[Dict] = []
    metrics_n = 0
    action_n = 0
    generic_n = 0
    weak_starts: List[str] = []
    for b in bullets:
        row = _bullet_score_row(b, jd_term_set)
        bullet_rows.append({"text": b[:220], **row})
        if row["hasMetric"]:
            metrics_n += 1
        if row["startsWithActionVerb"]:
            action_n += 1
        if row["isTooGeneric"]:
            generic_n += 1
        bl = b.lower()
        for p in _WEAK_BULLET_PREFIXES:
            if bl.startswith(p.strip()):
                weak_starts.append(b[:80])
                break
    n_bul = len(bullets)
    if n_bul:
        quant_ratio = metrics_n / n_bul
        action_ratio = action_n / n_bul
        generic_ratio = generic_n / n_bul
        bullet_quality = min(
            1.0,
            0.45 * quant_ratio + 0.35 * action_ratio + 0.25 * (1.0 - generic_ratio),
        )
    else:
        quant_ratio = 0.35
        action_ratio = 0.35
        generic_ratio = 0.35
        bullet_quality = 0.45

    # --- Summary heuristics -----------------------------------------------------
    summary_text = _summary_excerpt(lower_text, full_text)
    sum_low = summary_text.lower()
    generic_summary = bool(
        re.search(r"\b(seeking|looking for|challenging role|opportunity to grow)\b", sum_low)
    )
    jd_kw_hits_in_summary = sum(
        1 for k in kw_results[:20]
        if re.search(r"\b" + re.escape(k["keyword"].lower()) + r"\b", sum_low)
    )
    summary_has_metric = bool(_ATS_NUMBER_RE.search(summary_text))

    # --- Contact & links --------------------------------------------------------
    email_m = _EMAIL_RE.search(full_text)
    email_val = email_m.group(0) if email_m else ""
    bad_email = bool(email_val and _UNPROFESSIONAL_EMAIL_LOCAL.search(email_val.split("@")[0]))
    linkedin_ok = bool(
        re.search(r"linkedin\.com[/\w.-]*", full_text, re.I)
        or re.search(r"\blinkedin\b", full_text, re.I)
    )
    github_ok = bool(re.search(r"github\.com/[\w./-]+", full_text, re.I))
    portfolio_ok = bool(re.search(r"(?:portfolio|personal site|behance\.com|dribbble\.com)", lower_text))
    city_state_ok = bool(_US_CITY_STATE_RE.search(full_text))

    sw_category = "software" if (
        "software" in cat_name.lower()
        or "engineering" in cat_name.lower()
        or any(t in jd_lower for t in ("github", "kubernetes", "typescript", "react", "api "))
    ) else "general"

    contact_validation: Dict = {
        "fullName": False,
        "email": has_email,
        "phone": has_phone,
        "cityState": city_state_ok,
        "linkedIn": linkedin_ok,
        "gitHub": github_ok,
        "portfolioHint": portfolio_ok,
        "emailLooksUnprofessional": bad_email,
    }
    for ln in full_text.splitlines():
        s = ln.strip()
        if 4 < len(s) < 60 and re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,4}$", s):
            contact_validation["fullName"] = True
            break

    # --- Red flags & density ----------------------------------------------------
    red_flags: List[Dict] = []
    if bad_email:
        red_flags.append({"id": "email_unprofessional", "severity": "high", "detail": "Email local-part looks informal — use a simple professional address."})
    long_lines = [ln for ln in full_text.splitlines() if len(ln.split()) > 48]
    if len(long_lines) >= 2:
        red_flags.append({"id": "dense_blocks", "severity": "medium", "detail": "Very long lines may scan as dense blocks — break into bullets."})
    if sw_category == "software" and jd_stripped and not github_ok:
        red_flags.append({"id": "github_missing", "severity": "low", "detail": "GitHub link not detected — add it if you have public code relevant to this role."})
    if jd_stripped and not linkedin_ok:
        red_flags.append({"id": "linkedin_missing", "severity": "low", "detail": "LinkedIn URL not detected — recruiters often expect it."})

    red_penalty = sum(
        {"high": 8, "medium": 4, "low": 2}.get(r.get("severity", "low"), 2)
        for r in red_flags
    )
    red_penalty = min(15, red_penalty)

    bullets_per_job_hint = ""
    if n_bul > 18:
        bullets_per_job_hint = f"{n_bul} accomplishment lines detected — consider trimming older roles if any section feels long."

    # --- Employer problem fit (lightweight) ------------------------------------
    top_evidence = (
        _employer_fit_evidence_lines(bullets, jd_lower, max_lines=3)
        if jd_stripped
        else []
    )
    missing_evidence = _employer_fit_gap_labels(missing_req) if jd_stripped else []

    # --- Recruiter 6-second scan ------------------------------------------------
    scan_name = ""
    for ln in full_text.splitlines():
        s = ln.strip()
        if 4 < len(s) < 56 and re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,4}$", s):
            scan_name = s
            break
    skills_line = _sanitize_recruiter_display_text(
        _recruiter_top_skills_line(full_text, parsed, resume_lower),
        max_len=200,
    )
    edu_line = _extract_education_line(full_text)
    strongest_metric = _sanitize_evidence_line(_pick_strongest_metric_snippet(bullets))

    recruiter_scan = {
        "name": scan_name or "(not detected from PDF text)",
        "targetRole": (target_role or title_guess or "").strip() or "—",
        "topSkillsLine": skills_line or "(no skills list detected — add a Skills section or name tools in summary/experience)",
        "education": edu_line or "—",
        "strongestMetric": strongest_metric or "—",
        "signals": [
            {"label": "Target role obvious", "ok": bool((target_role or title_guess) and title_ratio >= 0.15)},
            {"label": "Current title relevant", "ok": title_match_label != "Weak"},
            {"label": "Top skills visible", "ok": bool(skills_line)},
            {"label": "Metrics visible", "ok": metrics_n >= max(1, n_bul // 5)},
            {"label": "Education easy to find", "ok": bool(edu_line)},
        ],
    }

    # --- Weak JD keywords (low resume density vs JD) ----------------------------
    weak_kw: List[str] = []
    for k in kw_results:
        if k["status"] == "found" and k.get("jd_count", 0) >= 3:
            if k.get("count", 0) * 3 < k["jd_count"]:
                weak_kw.append(k["keyword"])
    matched_kw_display = [k["keyword"] for k in kw_results if k["status"] == "found"][:18]

    jd_match_score = round(
        100 * (0.52 * jd_kw_ratio + 0.24 * req_ratio + 0.12 * min(1.0, title_ratio * 1.4) + 0.12 * min(1.0, cat_strength * 2.2))
    ) if jd_stripped else 0

    jd_keywords_found = sum(1 for k in kw_results if k.get("status") == "found")

    # --- Best-practice checks (blog: /blog/how-ats-really-works, /blog/optimizing-resumes-for-ats)
    best_practices = evaluate_ats_best_practices(
        full_text,
        page_count=page_count,
        layout_single_column=bool(layout.get("single_column")),
        target_role=target_role,
        title_guess=title_guess,
        has_jd=bool(jd_stripped),
        jd_kw_ratio=jd_kw_ratio,
        jd_keywords_found=jd_keywords_found,
        has_objective=has_objective,
        bullets=bullets,
        jd_terms=jd_term_set,
        quant_ratio=quant_ratio if n_bul else 0.0,
        action_ratio=action_ratio if n_bul else 0.0,
        from_resunova_pdf=True,
        has_email=has_email,
        has_phone=has_phone,
    )

    # --- Score breakdown (max 95 before penalty) --------------------------------
    fmt_ids = {"text_extractable", "single_column", "required_sections", "word_count", "page_count"}
    fmt_checks = [c for c in checks if c["id"] in fmt_ids]
    structural_fmt_ratio = sum(1 for c in fmt_checks if c["pass"]) / max(1, len(fmt_checks))
    bp_ratio = (best_practices.get("passed", 0) / max(1, best_practices.get("total", 1)))
    fmt_blend = 0.72 * structural_fmt_ratio + 0.28 * bp_ratio
    fmt_pts = _ATS_SCORE_WEIGHTS["formattingAndParseability"] * fmt_blend

    ct_pts = 0.0
    if has_email:
        ct_pts += 2.0
    if has_phone:
        ct_pts += 1.5
    if has_url or linkedin_ok:
        ct_pts += 1.0
    if city_state_ok:
        ct_pts += 0.5
    ct_pts = min(float(_ATS_SCORE_WEIGHTS["contactAndLinks"]), ct_pts)

    if jd_stripped:
        jd_kw_pts = _ATS_SCORE_WEIGHTS["jdKeywordMatch"] * jd_kw_ratio
        req_pts = _ATS_SCORE_WEIGHTS["requiredSkillMatch"] * req_ratio
        cat_title_pts = _ATS_SCORE_WEIGHTS["categoryAndTitleMatch"] * (
            0.55 * min(1.0, cat_strength * 2.5) + 0.45 * min(1.0, title_ratio * 1.8)
        )
    else:
        jd_kw_pts = _ATS_SCORE_WEIGHTS["jdKeywordMatch"] * 0.55
        req_pts = _ATS_SCORE_WEIGHTS["requiredSkillMatch"] * 0.55
        cat_title_pts = _ATS_SCORE_WEIGHTS["categoryAndTitleMatch"] * 0.55

    bullet_pts = _ATS_SCORE_WEIGHTS["experienceBulletQuality"] * bullet_quality

    # Primary ATS score = UIC + parsing-research best-practice checklist (passed / total).
    score = max(0, min(100, int(best_practices.get("score", 0))))

    score_breakdown = {
        "bestPracticesScore": score,
        "bestPracticesPassed": best_practices.get("passed", 0),
        "bestPracticesTotal": best_practices.get("total", 0),
        "redFlagPenalty": red_penalty,
        # Legacy weighted subscores (informational only — not used for the headline score).
        "jdKeywordMatch": round(jd_kw_pts, 1),
        "requiredSkillMatch": round(req_pts, 1),
        "categoryAndTitleMatch": round(cat_title_pts, 1),
        "experienceBulletQuality": round(bullet_pts, 1),
        "formattingAndParseability": round(fmt_pts, 1),
        "contactAndLinks": round(ct_pts, 1),
        "keywordTypeWeights": dict(_KEYWORD_TYPE_WEIGHTS),
    }

    export_checklist = [
        {"id": "jd_custom", "label": "Résumé tailored to this job description", "pass": bool(jd_stripped and jd_kw_ratio >= 0.35)},
        {"id": "title_cat", "label": "Job title / category reflected in story", "pass": title_match_label != "Weak" and category_match_label != "Weak"},
        {"id": "req_skills", "label": "Required skills addressed where truthful", "pass": req_ratio >= 0.45 or not req_skills},
        {"id": "certs", "label": "Certifications from JD surfaced if you hold them", "pass": not jd_signals.get("certifications") or any(c.lower() in resume_lower for c in jd_signals["certifications"])},
        {"id": "contact", "label": "Contact block complete (email, phone, location)", "pass": has_email and has_phone and city_state_ok},
        {"id": "no_objective", "label": "No generic objective statement", "pass": not has_objective},
        {"id": "verbs", "label": "Strong action verbs on accomplishments", "pass": n_bul == 0 or (action_n / n_bul) >= 0.35},
        {"id": "metrics", "label": "Quantified impact on most bullets", "pass": n_bul == 0 or quant_ratio >= 0.35},
    ]
    disclaimer = (
        "Score is the share of ATS best-practice checks passed (UIC formatting guide + parsing research). "
        "It does not guarantee passage of any specific applicant tracking system."
    )

    return {
        "score": score,
        "checks": checks,
        "keywords": kw_results,
        "stats": {
            "page_count": page_count,
            "word_count": word_count,
            "char_count": char_count,
        },
        "disclaimer": disclaimer,
        "scoreBreakdown": score_breakdown,
        "jdAnalysis": jd_signals,
        "jdMatch": {
            "matchScore": jd_match_score if jd_stripped else None,
            "missingRequiredSkills": missing_req[:20],
            "weakKeywords": weak_kw[:20],
            "matchedKeywords": matched_kw_display,
            "categoryMatch": category_match_label,
            "titleMatch": title_match_label,
        },
        "summarySignals": {
            "hasObjectivePattern": has_objective,
            "summaryLooksGeneric": generic_summary or (len(summary_text) < 40),
            "jdKeywordsInSummary": jd_kw_hits_in_summary,
            "summaryHasMetric": summary_has_metric,
            "suggestions": [
                *(["Replace an objective block with a 2–3 line summary tied to this role."] if has_objective else []),
                *(["Add role category + top tools + one measurable outcome to your summary."] if generic_summary or len(summary_text) < 40 else []),
                *(["Weave 2–3 truthful JD phrases into the summary where they match your experience."] if jd_stripped and jd_kw_hits_in_summary < 2 else []),
                *(["Add one quantified win to the summary (%, $, time, scale)."] if jd_stripped and not summary_has_metric else []),
            ],
        },
        "bulletStrength": {
            "bulletCount": n_bul,
            "samples": bullet_rows[:12],
            "quantifiedCount": metrics_n,
            "weakOpenersCount": len(set(weak_starts)),
            "weakOpenersSample": weak_starts[:4],
            "uxHint": _bullet_quantification_ux_hint(metrics_n, n_bul),
        },
        "quantification": {
            "withMetric": metrics_n,
            "total": n_bul,
            "ratio": round(quant_ratio, 2) if n_bul else None,
        },
        "actionVerbs": {
            "strongVerbRatio": round(action_ratio, 2) if n_bul else None,
            "weakStartsFound": weak_starts[:6],
            "tip": _action_verb_tip_for_role(cat_name, sw_category),
        },
        "skillSuggestions": _skill_suggestion_rows(jd_lower, resume_lower, req_skills, list(jd_signals.get("preferredSkills") or [])),
        "redFlags": red_flags,
        "contactValidation": contact_validation,
        "lengthDensity": {
            "suggestedPages": "1–2 for most candidates; up to 3 for very senior histories",
            "longLines": len(long_lines),
            "bulletsPerJobHint": bullets_per_job_hint,
        },
        "employerProblemFit": {
            "employerProblem": _employer_problem_short(jd_stripped) if jd_stripped else "",
            "candidateEvidence": top_evidence,
            "missingEvidence": missing_evidence,
            "rewriteHint": (
                "Add one bullet using the JD’s channel words (social, blog, campaign) where accurate."
                if jd_stripped and (missing_evidence or len(top_evidence) < 2)
                else ""
            ),
        },
        "recruiterScan": recruiter_scan,
        "exportChecklist": export_checklist,
        "bestPractices": best_practices,
    }


def structured_ratings_from_ats(ats: dict) -> dict:
    """Map ``ats_check`` output to the builder ``ratings`` payload shape."""
    checks = ats.get("checks") if isinstance(ats, dict) else []
    jd_match = ats.get("jdMatch") if isinstance(ats, dict) else {}
    keywords = ats.get("keywords") if isinstance(ats, dict) else []
    score_breakdown = ats.get("scoreBreakdown") if isinstance(ats, dict) else {}
    jd_signals = ats.get("jdAnalysis") if isinstance(ats, dict) else {}
    best_practices = ats.get("bestPractices") if isinstance(ats, dict) else {}
    criteria = []

    bp_checks = best_practices.get("checks") if isinstance(best_practices, dict) else []
    if isinstance(bp_checks, list) and bp_checks:
        for chk in bp_checks[:23]:
            if not isinstance(chk, dict):
                continue
            name = str(chk.get("name") or "").strip()
            if not name:
                continue
            note = str(chk.get("detail") or "").strip()
            passed = bool(chk.get("pass"))
            criteria.append({
                "name": name,
                "weight": "Medium",
                "score": 10 if passed else 4,
                "notes": note,
                "text": f"{name} — {note}" if note else name,
            })
        try:
            match_score = int(best_practices.get("score", ats.get("score", 0)))
        except (TypeError, ValueError):
            match_score = 0
        match_score = max(0, min(100, match_score))
        whats_working = [c["text"] for c in criteria if c.get("score", 0) >= 7][:6]
        gaps = [c["text"] for c in criteria if c.get("score", 0) < 7][:6]
        if match_score >= 85:
            verdict = "Strong ATS formatting and role alignment on the checklist."
        elif match_score >= 65:
            verdict = "Solid foundation — address the open checklist items to strengthen ATS parsing."
        else:
            verdict = "Several ATS best-practice gaps — fix the failed checks before you apply."
        return {
            "match_score": match_score,
            "criteria": criteria[:15],
            "whats_working": whats_working,
            "gaps": gaps,
            "verdict": verdict,
        }

    req_skills = jd_signals.get("requiredSkills") if isinstance(jd_signals, dict) else []
    pref_skills = jd_signals.get("preferredSkills") if isinstance(jd_signals, dict) else []
    certs = jd_signals.get("certifications") if isinstance(jd_signals, dict) else []
    rep_kw = jd_signals.get("repeatedKeywords") if isinstance(jd_signals, dict) else []
    req_years = jd_signals.get("minYearsExperience") if isinstance(jd_signals, dict) else None

    for sk in (req_skills or [])[:6]:
        kw_state = None
        for k in (keywords or []):
            if isinstance(k, dict) and sk.lower() in str(k.get("keyword") or "").lower():
                kw_state = k.get("status")
                break
        if kw_state == "found":
            criteria.append({"name": f"Required: {sk}", "weight": "High", "score": 9, "notes": "Skill detected in resume", "text": f"Required skill \"{sk}\" found ✓"})
        elif kw_state == "partial":
            criteria.append({"name": f"Required: {sk}", "weight": "High", "score": 5, "notes": "Partial match detected", "text": f"Required skill \"{sk}\" partially found"})
        else:
            criteria.append({"name": f"Required: {sk}", "weight": "High", "score": 2, "notes": "Not detected in resume text", "text": f"Missing required skill: {sk}"})

    for sk in (pref_skills or [])[:3]:
        kw_state = None
        for k in (keywords or []):
            if isinstance(k, dict) and sk.lower() in str(k.get("keyword") or "").lower():
                kw_state = k.get("status")
                break
        if kw_state == "found":
            criteria.append({"name": f"Preferred: {sk}", "weight": "Low", "score": 8, "notes": "Nice-to-have skill found", "text": f"Preferred skill \"{sk}\" found ✓"})
        else:
            criteria.append({"name": f"Preferred: {sk}", "weight": "Low", "score": 4, "notes": "Nice-to-have skill not detected", "text": f"Preferred skill \"{sk}\" not found"})

    for rk in (rep_kw or [])[:3]:
        kw = rk.get("keyword", "") if isinstance(rk, dict) else ""
        if kw:
            kw_state = None
            for k in (keywords or []):
                if isinstance(k, dict) and kw.lower() == str(k.get("keyword") or "").lower():
                    kw_state = k.get("status")
                    break
            score = 8 if kw_state == "found" else 3
            criteria.append({"name": f"Emphasized: {kw}", "weight": "High", "score": score, "notes": f"Mentioned {rk.get('count', '?')}x in JD" if isinstance(rk, dict) else "", "text": f"JD emphasizes \"{kw}\" ({rk.get('count', '?')}x) {'✓' if kw_state == 'found' else '△'}"})

    for cert in (certs or [])[:2]:
        kw_state = None
        for k in (keywords or []):
            if isinstance(k, dict) and cert.lower() in str(k.get("keyword") or "").lower():
                kw_state = k.get("status")
                break
        criteria.append({"name": f"Cert: {cert}", "weight": "Medium", "score": 8 if kw_state else 4, "notes": "Certification mentioned in JD", "text": f"JD mentions {cert} {'✓' if kw_state else '△'}"})

    if req_years:
        criteria.append({"name": "Years of Experience", "weight": "Medium", "score": 8, "notes": f"JD asks for {req_years}+ years", "text": f"JD requires {req_years}+ years experience"})

    if isinstance(jd_match, dict):
        ms = jd_match.get("matchScore")
        if ms is not None:
            try:
                ms_int = int(ms)
            except Exception:
                ms_int = 0
            criteria.append({"name": "Overall JD Match", "weight": "High", "score": min(10, max(1, int(ms_int / 10))), "notes": f"Match score: {ms_int}/100" if ms_int else "", "text": f"JD Match Score: {ms_int}/100"})

    if isinstance(score_breakdown, dict):
        for cat, val in list(score_breakdown.items())[:5]:
            if cat in ("redFlagPenalty", "keywordTypeWeights"):
                continue
            try:
                s = int(val) if isinstance(val, (int, float)) else 0
            except Exception:
                continue
            cat_score = min(10, max(1, int(s / 10)))
            criteria.append({"name": f"Metric: {cat}", "weight": "Medium", "score": cat_score, "notes": f"Score: {s}/100", "text": f"{cat}: {s}/100 {'✓' if cat_score >= 7 else '△'}"})

    for chk in (checks or [])[:6]:
        if len(criteria) >= 14:
            break
        name = str(chk.get("name") or "").strip()
        if not name:
            continue
        note = str(chk.get("detail") or "").strip()
        passed = bool(chk.get("pass"))
        criteria.append({"name": name, "weight": "Medium", "score": 10 if passed else 4, "notes": note, "text": f"{name}: {note}" if note else name})

    whats_working = [c["text"] for c in criteria if c.get("score", 0) >= 7][:5]
    gaps = [c["text"] for c in criteria if c.get("score", 0) < 7][:5]

    score = ats.get("score") if isinstance(ats, dict) else 0
    try:
        match_score = int(score)
    except Exception:
        match_score = 0

    verdict = "Strong alignment with this role." if match_score >= 75 else (
        "Decent alignment; filling key gaps will strengthen candidacy." if match_score >= 55 else
        "Low alignment; prioritize addressing missing JD requirements."
    )

    return {
        "match_score": match_score,
        "criteria": criteria[:15],
        "whats_working": whats_working,
        "gaps": gaps,
        "verdict": verdict,
    }
