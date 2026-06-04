"""Comprehensive resume analysis: regex checks + LLM deep-dive."""
from __future__ import annotations

import logging
import re
from typing import Optional

from resume_gui.analysis.constants import _PRONOUN_RE
from resume_gui.analysis.deterministic_insights import inject_deterministic_insights
from resume_gui.analysis.evidence_validator import _validate_analysis_against_resume
from resume_gui.analysis.normalize import _normalize_analysis
from resume_gui.llm.client import _analysis_model, _llm_json_call

logger = logging.getLogger("resume_gui")

def _analysis_section_scores(parsed: dict, issues: dict) -> list:
    sections = parsed.get("sections") or []
    out = []
    for sec in sections:
        name = (sec.get("name") or "Section").strip()
        bullets = []
        for e in sec.get("entries", []):
            bullets.extend(e.get("bullets", []))
        warn = 0
        info = 0
        for b in bullets:
            bid = b.get("id")
            for it in (issues.get(bid) or []):
                if it.get("severity") == "warn":
                    warn += 1
                else:
                    info += 1
        score = max(1, min(10, round(9 - warn * 1.1 - info * 0.4)))
        summary = (
            "Strong section with clear, ATS-friendly wording."
            if warn == 0 and info <= 1 else
            "Good structure, but tighten phrasing and add concrete impact in a few bullets."
            if warn <= 2 else
            "Needs cleanup: too many weak or ambiguous bullets may hurt recruiter confidence."
        )
        out.append({"name": name, "score": score, "summary": summary, "warn": warn, "info": info})
    return out


def _analysis_tips(ats: dict, sections: list, issues: dict) -> tuple[list, dict]:
    tips = []
    checks = ats.get("checks") or []
    for c in checks:
        if c.get("pass"):
            continue
        sev = "critical"
        if c.get("id") in {"word_count", "page_count", "single_column"}:
            sev = "urgent"
        tips.append({
            "severity": sev,
            "title": c.get("name") or "Fix ATS issue",
            "detail": c.get("detail") or "",
        })

    missing = [k for k in (ats.get("keywords") or []) if k.get("status") == "missing"]
    for k in missing[:3]:
        tips.append({
            "severity": "optional",
            "title": f"Add missing keyword: {k.get('keyword')}",
            "detail": "Include this term naturally in experience bullets where factual.",
        })

    jd_match = ats.get("jdMatch") or {}
    for s in (jd_match.get("missingRequiredSkills") or [])[:3]:
        title = f"JD skill to cover if true: {s}"
        if any(t.get("title") == title for t in tips):
            continue
        tips.append({
            "severity": "optional",
            "title": title,
            "detail": "Mirror the job language only where it matches your real experience.",
        })

    warn_total = sum(1 for arr in issues.values() for it in arr if it.get("severity") == "warn")
    if warn_total >= 4:
        tips.append({
            "severity": "critical",
            "title": "Strengthen weak bullets",
            "detail": "Several bullets look vague or low-signal. Lead with action + measurable outcome.",
        })

    # Dedup by title while preserving order
    seen = set()
    deduped = []
    for t in tips:
        title = t.get("title") or ""
        if title in seen:
            continue
        seen.add(title)
        deduped.append(t)

    counts = {
        "urgent": sum(1 for t in deduped if t["severity"] == "urgent"),
        "critical": sum(1 for t in deduped if t["severity"] == "critical"),
        "optional": sum(1 for t in deduped if t["severity"] == "optional"),
    }
    return deduped[:8], counts

_WEAK_VERBS = re.compile(
    r"\b(helped|assisted|worked on|worked with|was responsible for|participated in|"
    r"involved in|contributed to|duties included|tasked with|"
    r"did|made|got|went|had to|tried to)\b",
    re.IGNORECASE,
)
_ACTION_VERB_START_RE = re.compile(
    r"^[•\-–*▪▸]\s*(?:"
    # Management
    r"administered|analyzed|assigned|attained|chaired|consolidated|contracted|coordinated|delegated|developed|directed|evaluated|executed|improved|increased|organized|oversaw|planned|prioritized|produced|recommended|reviewed|scheduled|strengthened|supervised|"
    # Communication
    r"addressed|arbitrated|arranged|authored|collaborated|convinced|corresponded|drafted|edited|enlisted|formulated|influenced|interpreted|lectured|mediated|moderated|negotiated|persuaded|promoted|publicized|reconciled|recruited|spoke|translated|wrote|"
    # Research
    r"clarified|collected|critiqued|diagnosed|examined|extracted|identified|inspected|interviewed|investigated|summarized|surveyed|systematized|"
    # Technical
    r"assembled|built|calculated|computed|designed|devised|engineered|fabricated|maintained|operated|overhauled|programmed|remodeled|repaired|solved|upgraded|"
    # Teaching
    r"adapted|advised|coached|communicated|demystified|enabled|encouraged|explained|facilitated|guided|informed|instructed|set\s+goals|stimulated|trained|"
    # Financial / creative accomplishments
    r"acted|conceptualized|created|customized|established|fashioned|founded|illustrated|initiated|instituted|integrated|introduced|invented|originated|performed|revitalized|shaped|"
    # Helping
    r"assessed|assisted|counseled|demonstrated|educated|expedited|familiarized|motivated|referred|rehabilitated|represented|"
    # Clerical / detail
    r"approved|cataloged|classified|compiled|dispatched|generated|implemented|monitored|prepared|processed|purchased|recorded|retrieved|screened|specified|tabulated|validated|"
    # More accomplishment verbs
    r"achieved|expanded|pioneered|reduced|resolved|restored|spearheaded|transformed|"
    # Existing in-product high-signal verbs
    r"architected|automated|launched|drove|delivered|optimized"
    r")\b",
    re.IGNORECASE,
)
# Note: _PRONOUN_RE lives in constants.py — \b us must not match inside "US".
_DATE_RE     = re.compile(
    r"\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)[,. ]+\d{4}\b"
    r"|\b\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)\b",
    re.IGNORECASE,
)
_NUMBER_RE   = re.compile(r"\b\d[\d,]*%?|\$[\d,]+[KkMmBb]?")
_EMAIL_RE    = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_RE    = re.compile(r"(\+?\d[\d\s\-().]{7,}\d)")
_LINKEDIN_RE = re.compile(r"linkedin\.com/in/", re.IGNORECASE)
_UNNECESSARY = re.compile(
    r"\b(references available|references furnished|references upon|"
    r"list of references|responsible for|"
    r"duties included|objective:|career objective|to obtain a|"
    r"seeking a position)\b",
    re.IGNORECASE,
)
# Passive / weak copula patterns in bullets (career-center “active not passive” guidance).
_PASSIVE_BULLET_RE = re.compile(
    r"\b(?:was|were|is|are|been|being)\s+[a-z]{2,22}(?:ed|en)\b",
    re.IGNORECASE,
)
# Experience bullets should not *start* with a date range — dates belong on role headers.
_BULLET_DATE_LEAD_RE = re.compile(
    r"^[•\-–*▪▸]\s*(?:"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[,. ]+\d{4}\b"
    r"|(?:19|20)\d{2}\s*[-–/]\s*(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent)"
    r"|(?:19|20)\d{2}\b\s*[,–-]\s*(?:19|20)\d{2}\b"
    r")",
    re.IGNORECASE,
)

# Universal résumé filler — vague self-descriptors and clichés that carry zero
# concrete meaning in ANY discipline (tech, healthcare, trades, arts, finance…).
# Deliberately EXCLUDES domain-ambiguous words ("framework", "scalable",
# "efficient", "reliable", "robust", "leverage", "proven", "driven") because
# those are legitimate vocabulary in some fields — flagging them violates the
# discipline-agnostic invariant. (Distinct from _UNNECESSARY, which targets whole
# boilerplate phrases like "references available".)
_BUZZWORDS = (
    "results-driven", "results-oriented", "detail-oriented", "self-motivated",
    "self-starter", "hardworking", "hard-working", "team player", "go-getter",
    "go-to", "synergy", "synergies", "synergize", "thought leader", "guru",
    "ninja", "rockstar", "wizard", "best-of-breed", "best in class",
    "world-class", "think outside the box", "outside the box", "value-add",
    "value add", "track record", "proven track record", "strong work ethic",
    "excellent communication skills", "highly skilled", "fast-paced",
    "results oriented", "detail oriented", "team-player",
)
_BUZZWORD_RE = re.compile(
    r"\b(" + "|".join(re.escape(b).replace(r"\ ", r"\s+").replace(r"\-", r"[-\s]?") for b in _BUZZWORDS) + r")\b",
    re.IGNORECASE,
)

# Portfolio / personal-site / code-host links (separate from LinkedIn). Matches
# both full URLs and the bare display words résumés often use ("GitHub",
# "Portfolio") since extracted text frequently keeps the link text, not the href.
_PORTFOLIO_RE = re.compile(
    r"\bgithub\b|\bgitlab\b|\bbitbucket\b|\bbehance\b|\bdribbble\b|\bcodepen\b|"
    r"\bportfolio\b|personal\s+website|"
    r"\b[a-z0-9-]+\.(?:dev|io|me|tech|page|app)\b|\bwww\.",
    re.IGNORECASE,
)

# Section headings that introduce a professional-summary block.
_SUMMARY_HEADING_RE = re.compile(
    r"^\s*(professional\s+summary|summary|profile|professional\s+profile|"
    r"career\s+summary|summary\s+of\s+qualifications|objective|about\s+me)\s*:?\s*$",
    re.IGNORECASE,
)
# Any other section heading (terminates the summary block).
_GENERIC_HEADING_RE = re.compile(
    r"^\s*(work\s+experience|experience|employment|education|skills|projects|"
    r"certifications?|achievements?|awards?|publications?|interests?|"
    r"technical\s+skills|professional\s+experience|activities|volunteer)\s*:?\s*$",
    re.IGNORECASE,
)


def _extract_summary_block(text: str) -> str:
    """Return the text of the professional-summary section, or '' if none.
    Reads lines after a summary heading until the next section heading."""
    lines = [l.rstrip() for l in (text or "").splitlines()]
    out: list[str] = []
    capturing = False
    for ln in lines:
        if _SUMMARY_HEADING_RE.match(ln):
            capturing = True
            continue
        if capturing:
            if not ln.strip():
                if out:  # blank line after we've captured content ends the block
                    break
                continue
            if _GENERIC_HEADING_RE.match(ln) or _SUMMARY_HEADING_RE.match(ln):
                break
            out.append(ln.strip())
    return " ".join(out).strip()


# Lazy, process-cached spellchecker. Returns None when pyspellchecker is not
# installed (prod image without the dep) so the check degrades to a no-op.
_SPELL = None
_SPELL_INIT = False
# Tech / résumé vocabulary the generic dictionary doesn't know but is correct.
_SPELL_ALLOWLIST = {
    "ai", "ml", "api", "apis", "sql", "nosql", "css", "html", "json", "yaml",
    "saas", "paas", "iaas", "ci", "cd", "cicd", "devops", "backend", "frontend",
    "fullstack", "microservices", "kubernetes", "docker", "serverless", "grpc",
    "graphql", "oauth", "jwt", "redis", "kafka", "nginx", "linux", "ubuntu",
    "kanban", "scrum", "agile", "etl", "ux", "ui", "sdk", "cli", "url", "uri",
    "github", "gitlab", "npm", "webpack", "vite", "nextjs", "nodejs", "typescript",
    "javascript", "pytorch", "tensorflow", "numpy", "pandas", "postgres",
    "postgresql", "mongodb", "dynamodb", "elasticsearch", "kibana", "rabbitmq",
    "leaflet", "htmx", "pinecone", "bedrock", "cognito", "lambda", "amplify",
    "chatbot", "chatbots", "dataset", "datasets", "realtime", "scalable",
    "onboarding", "roadmap", "stakeholder", "stakeholders", "kpis", "roi",
    "workflows", "dashboards", "analytics", "geospatial", "vue", "django",
    "admin", "config", "auth", "async", "boolean", "enum", "regex", "middleware",
    "runtime", "namespace", "schema", "schemas", "webapp", "webhooks", "webhook",
    "login", "signup", "frontend", "backend", "fullstack", "codebase", "repo",
    "repos", "plugin", "plugins", "scalable", "performant", "latency", "throughput",
}

# Strip tokens that aren't real prose words before spell-scanning: email
# addresses, URLs, and social handles. These are the dominant source of false
# positives ("gmail" from an email, "linkedin" from a handle, etc.).
_SPELL_STRIP_RE = re.compile(
    r"\S+@\S+|https?://\S+|www\.\S+|\b[a-z0-9.-]+\.(?:com|org|net|io|dev|edu|gov|co)\b"
    r"|linkedin\S*|github\S*|gitlab\S*",
    re.IGNORECASE,
)


def _get_spellchecker():
    global _SPELL, _SPELL_INIT
    if _SPELL_INIT:
        return _SPELL
    _SPELL_INIT = True
    try:
        from spellchecker import SpellChecker  # type: ignore
        _SPELL = SpellChecker(distance=1)
    except Exception:
        _SPELL = None
    return _SPELL


def _find_misspellings(text: str) -> list[str]:
    """Conservative spelling pass: only flag all-lowercase alphabetic words the
    dictionary doesn't know and that aren't in the tech allowlist. Skips
    Title-Case (names), ALL-CAPS (acronyms), CamelCase, and tokens with
    digits/punctuation — those are almost always intentional on a résumé."""
    spell = _get_spellchecker()
    if spell is None:
        return []
    scrubbed = _SPELL_STRIP_RE.sub(" ", text or "")
    seen: set[str] = set()
    candidates: list[str] = []
    for raw in re.findall(r"[A-Za-z][A-Za-z'-]*", scrubbed):
        w = raw.strip("'-")
        if len(w) < 4:
            continue
        if w != w.lower():           # has uppercase → name/acronym/CamelCase
            continue
        if w in _SPELL_ALLOWLIST:
            continue
        if w in seen:
            continue
        seen.add(w)
        candidates.append(w)
    if not candidates:
        return []
    unknown = spell.unknown(candidates)
    flagged: list[str] = []
    for w in candidates:
        if w not in unknown:
            continue
        corr = spell.correction(w)
        if corr and corr != w:
            flagged.append(f'"{w}" → "{corr}"')
        if len(flagged) >= 8:
            break
    return flagged


def _recruiter_checks(text: str) -> dict:
    """Run 10 recruiter checks on plain-text resume content."""
    raw_lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Pass 1: merge orphan bullet glyphs (some PDFs emit "•" on its own line)
    merged: list[str] = []
    i = 0
    while i < len(raw_lines):
        ln = raw_lines[i]
        if re.match(r"^[•\-–*▪▸]\s*$", ln) and i + 1 < len(raw_lines):
            merged.append(ln.rstrip() + " " + raw_lines[i + 1])
            i += 2
        else:
            merged.append(ln)
            i += 1

    # Pass 2: merge wrapped continuation lines back into their parent bullet.
    # A continuation line is one that starts with a bullet glyph followed by a
    # lowercase letter (or a conjunction/preposition) — this happens when
    # pdfplumber assigns the bullet glyph to the second visual line of a
    # long bullet that wraps.  e.g.:
    #   "• Collaborated with the sales team …"   ← real bullet start
    #   "• the sales team to identify routes …"  ← wrapped continuation
    _CONTINUATION_RE = re.compile(r"^[•\-–*▪▸]\s+[a-z]")
    lines: list[str] = []
    for ln in merged:
        if _CONTINUATION_RE.match(ln) and lines:
            # Strip the leading glyph and space, append to previous line
            tail = re.sub(r"^[•\-–*▪▸]\s+", "", ln)
            lines[-1] = lines[-1].rstrip() + " " + tail
        else:
            lines.append(ln)

    # Lines that are clearly contact / header noise — skip from bullet lists
    _NOISE_RE = re.compile(
        r"@|linkedin|github|\.com|phone|email|mobile|location|"
        r"^\s*(education|experience|projects|skills|summary|objective|certifications)\s*$",
        re.IGNORECASE,
    )

    def _is_content_bullet(line: str) -> bool:
        if _NOISE_RE.search(line):
            return False
        words = line.split()
        # Need at least 5 whitespace-separated tokens
        if len(words) < 5:
            return False
        # Reject merged-word blobs from bad PDF extraction:
        # e.g. "IamaSoftwareDeveloperwithover5years..." → max word > 20 chars
        if max(len(w) for w in words) > 20:
            return False
        # Starts with an explicit bullet glyph — highest confidence
        if re.match(r"^[•\-–*▪▸]", line):
            return True
        # Substantive sentence starting with a capital letter (≥ 60 chars)
        if re.match(r"^[A-Z][a-z]", line) and len(line) > 60:
            return True
        return False

    bullets = [l for l in lines if _is_content_bullet(l)]
    # Explicit-bullet lines only (start with •/-/–/*): used for density/action-verb checks
    explicit_bullets = [l for l in bullets if re.match(r"^[•\-–*▪▸]", l)]

    checks = []

    # 1. Quantify impact
    unquant = [b for b in bullets if not _NUMBER_RE.search(b)]
    q_score = max(0, round(10 - len(unquant) * 1.2))
    checks.append({
        "id": "quantify", "name": "Quantified Impact",
        "score": q_score, "passed": q_score >= 7,
        "detail": (
            "Recruiters scan for numbers — percentages, dollar amounts, team sizes, "
            "timeframes. Bullets without metrics feel vague. Aim for at least 75% of "
            "your bullets to contain a quantified result."
        ),
        "items": unquant[:8],
    })

    # 2. Weak verbs
    weak_hits = [b for b in bullets if _WEAK_VERBS.search(b)]
    wv_score  = max(0, round(10 - len(weak_hits) * 2))
    checks.append({
        "id": "weak_verbs", "name": "Strong Action Verbs",
        "score": wv_score, "passed": wv_score >= 7,
        "detail": (
            "Passive or generic verbs ('helped', 'assisted', 'was responsible for') "
            "dilute impact. Replace them with strong, specific verbs from action-verb families "
            "(e.g., Managed: coordinated/oversaw; Communication: negotiated/presented; "
            "Technical: designed/engineered/programmed; Results: achieved/reduced/transformed)."
        ),
        "items": weak_hits[:8],
    })

    # 3. Action verb at start — only check explicit bullet lines
    no_action = [b for b in explicit_bullets if not _ACTION_VERB_START_RE.match(b)]
    av_score  = max(0, round(10 - len(no_action) * 1.5))
    checks.append({
        "id": "action", "name": "Action Verb Start",
        "score": av_score, "passed": av_score >= 7,
        "detail": (
            "Every bullet should start with a strong action verb (UMBC-style action list), "
            "not a noun phrase or weak helper verb. This signals initiative and makes bullets skimmable."
        ),
        "items": no_action[:6],
    })

    # 4. Pronouns
    pronoun_hits = [l for l in lines if _PRONOUN_RE.search(l)]
    pron_score   = 10 if not pronoun_hits else max(0, 10 - len(pronoun_hits) * 3)
    checks.append({
        "id": "pronouns", "name": "No Personal Pronouns",
        "score": pron_score, "passed": pron_score >= 8,
        "detail": (
            "Resumes should be written in the implied first person without using "
            "'I', 'me', 'my', 'we', etc. Remove all personal pronouns."
        ),
        "items": pronoun_hits[:6],
    })

    # 5. Repetition
    verb_counts: dict[str, int] = {}
    for b in bullets:
        m = re.match(r"^([A-Z][a-z]+)", b)
        if m:
            verb_counts[m.group(1)] = verb_counts.get(m.group(1), 0) + 1
    repeated = [f"'{v}' used {n} times" for v, n in verb_counts.items() if n >= 3]
    rep_score = 10 if not repeated else max(0, 10 - len(repeated) * 2)
    checks.append({
        "id": "repetition", "name": "Verb Variety",
        "score": rep_score, "passed": rep_score >= 7,
        "detail": (
            "Using the same action verb repeatedly makes your resume monotonous. "
            "Vary your verbs across bullets to showcase a broader skill set."
        ),
        "items": repeated,
    })

    # 6. Dates present
    has_dates = bool(_DATE_RE.search(text))
    date_score = 10 if has_dates else 0
    checks.append({
        "id": "dates", "name": "Dates Present",
        "score": date_score, "passed": has_dates,
        "detail": (
            "Recruiters need dates to understand your career timeline. "
            "Every job and education entry should include start and end dates "
            "(or 'Present' for your current role)."
        ),
        "items": [] if has_dates else ["No dates detected in the resume"],
    })

    # 7. Contact info
    has_email    = bool(_EMAIL_RE.search(text))
    has_phone    = bool(_PHONE_RE.search(text))
    has_linkedin = bool(_LINKEDIN_RE.search(text))
    contact_issues = []
    if not has_email:    contact_issues.append("Email address not found")
    if not has_phone:    contact_issues.append("Phone number not found")
    if not has_linkedin: contact_issues.append("LinkedIn URL not found")
    contact_score = 10 - len(contact_issues) * 3
    checks.append({
        "id": "contact", "name": "Contact Information",
        "score": contact_score, "passed": contact_score >= 7,
        "detail": (
            "Your contact section should include an email, phone number, and LinkedIn "
            "profile URL. Missing any of these reduces your chances of being contacted."
        ),
        "items": contact_issues,
    })

    # 8. Resume length
    word_count = len(text.split())
    if word_count < 300:
        len_score, len_note = 4, f"Too short ({word_count} words) — aim for 400–700"
    elif word_count > 900:
        len_score, len_note = 5, f"Too long ({word_count} words) — aim for 400–700"
    else:
        len_score, len_note = 10, f"Good length ({word_count} words)"
    checks.append({
        "id": "length", "name": "Resume Length",
        "score": len_score, "passed": len_score >= 7,
        "detail": (
            "A one-page resume (400–700 words) is ideal for most candidates. "
            "Two pages are acceptable for 10+ years of experience. "
            "Anything shorter looks thin; anything longer loses the reader."
        ),
        "items": [] if len_score >= 7 else [len_note],
    })

    # 9. Unnecessary phrases
    unnec_hits = list({m.group(0).lower() for m in _UNNECESSARY.finditer(text)})
    un_score   = 10 if not unnec_hits else max(0, 10 - len(unnec_hits) * 3)
    checks.append({
        "id": "unnecessary", "name": "Unnecessary Phrases",
        "score": un_score, "passed": un_score >= 8,
        "detail": (
            "Phrases like 'References available upon request' or 'Objective: To obtain a '  "
            "waste space and signal an outdated template. Remove them entirely."
        ),
        "items": [f'Remove: "{p}"' for p in unnec_hits],
    })

    # 10. Bullet density (short explicit bullets only)
    short_bullets = [b for b in explicit_bullets if len(b.split()) < 8]
    dens_score    = max(0, round(10 - len(short_bullets) * 2))
    checks.append({
        "id": "density", "name": "Bullet Depth",
        "score": dens_score, "passed": dens_score >= 7,
        "detail": (
            "Bullets under 6 words are too thin to convey impact. "
            "Each bullet should tell a mini-story: Action + Context + Result."
        ),
        "items": short_bullets[:6],
    })

    # 11. Passive / copula-heavy wording in bullets (active voice & ownership)
    passive_hits = [b for b in bullets if _PASSIVE_BULLET_RE.search(b)]
    pv_score = max(0, round(10 - len(passive_hits) * 2))
    checks.append({
        "id": "passive_voice", "name": "Active Voice & Ownership",
        "score": pv_score, "passed": pv_score >= 7,
        "detail": (
            "Use strong action verbs and active phrasing recruiters can skim in seconds. "
            "Reword passive 'was/were … done' lines and vague 'responsible for' duty dumps "
            "into owned outcomes."
        ),
        "items": passive_hits[:6],
    })

    # 12. Dates leading bullet lines (keep dates on headers; open bullets with verbs)
    date_led = [b for b in explicit_bullets if _BULLET_DATE_LEAD_RE.match(b)]
    dl_score = max(0, round(10 - len(date_led) * 2.5))
    checks.append({
        "id": "date_led_bullet", "name": "Skimmable Bullet Openings",
        "score": dl_score, "passed": dl_score >= 7,
        "detail": (
            "Start bullets with an accomplishment or action, not a calendar. "
            "Put date ranges on the role or education header line."
        ),
        "items": date_led[:6],
    })

    # 13. Role depth — detect under-described work experience entries
    # Match realistic years (1960-2029) or month+year — avoids phone-number false positives
    _ROLE_HEADER_RE = re.compile(
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (?:19|20)\d{2}"
        r"|(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent)",
        re.IGNORECASE,
    )
    # Lines that look like job/edu titles (contain a separator + no bullet glyph)
    _TITLE_LINE_RE = re.compile(r"[|\-–•@]|\bat\b|\bfor\b", re.IGNORECASE)

    def _parse_role_blocks(all_lines):
        roles, cur_header, cur_bullets = [], None, []
        prev_non_bullet = ""
        for ln in all_lines:
            is_bullet = bool(re.match(r"^[•\-–*▪▸]", ln))
            has_date  = bool(_ROLE_HEADER_RE.search(ln))
            if has_date and not is_bullet:
                if cur_header is not None:
                    roles.append((cur_header, cur_bullets))
                # If this line is ONLY a date range (≤ 4 tokens), prepend the previous
                # title line so we capture "Job Title | Company Name" + date
                if len(ln.split()) <= 4 and prev_non_bullet and not _ROLE_HEADER_RE.search(prev_non_bullet):
                    cur_header = prev_non_bullet + "  " + ln
                else:
                    cur_header = ln
                cur_bullets = []
            elif cur_header and is_bullet:
                cur_bullets.append(ln)
            if not is_bullet:
                prev_non_bullet = ln
        if cur_header:
            roles.append((cur_header, cur_bullets))
        return roles

    # Education / certification headers are not work roles — they legitimately
    # have 0 bullets and no metrics, so they must not count as "thin roles".
    _EDU_HEADER_RE = re.compile(
        r"\b(university|college|institute|school|academy|bachelor|master|"
        r"b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|b\.?e\.?|ph\.?d|diploma|"
        r"certification|certificate|coursework|gpa|cgpa)\b",
        re.IGNORECASE,
    )

    role_blocks = _parse_role_blocks(lines)
    weak_roles = []
    work_role_count = 0
    for header, role_bullets in role_blocks:
        if _EDU_HEADER_RE.search(header):
            continue
        work_role_count += 1
        has_numbers  = any(_NUMBER_RE.search(b) for b in role_bullets)
        bullet_count = len(role_bullets)
        if bullet_count < 3 or not has_numbers:
            reason = []
            if bullet_count < 3:
                reason.append(f"only {bullet_count} bullet{'s' if bullet_count != 1 else ''}")
            if not has_numbers:
                reason.append("no quantified results")
            weak_roles.append(f"{header}  [{', '.join(reason)}]")

    if work_role_count:
        rd_score = max(0, round(10 - len(weak_roles) * (10 / max(work_role_count, 1))))
    else:
        rd_score = 10
    checks.append({
        "id": "role_depth", "name": "Role Descriptions",
        "score": rd_score, "passed": rd_score >= 7,
        "detail": (
            "Each role should have at least 3 bullets and at least one quantified result "
            "(a percentage, dollar amount, team size, or time saved). "
            "Thin roles signal low impact to recruiters — flesh them out with specific achievements."
        ),
        "items": weak_roles[:6],
    })

    # 14. Buzzwords / filler adjectives
    buzz_counts: dict[str, int] = {}
    for m in _BUZZWORD_RE.finditer(text):
        key = m.group(0).lower()
        buzz_counts[key] = buzz_counts.get(key, 0) + 1
    buzz_items = [f"{w} ({n}x)" if n > 1 else w for w, n in buzz_counts.items()]
    buzz_score = 10 if not buzz_items else max(0, 10 - len(buzz_items) * 2)
    checks.append({
        "id": "buzzwords", "name": "Buzzwords",
        "score": buzz_score, "passed": buzz_score >= 7,
        "detail": (
            "Vague filler clichés ('results-driven', 'team player', 'detail-oriented', "
            "'go-getter') add no concrete information in any field. Replace them with "
            "specific, measurable accomplishments that show — not tell."
        ),
        "items": buzz_items[:8],
    })

    # 15. Summary section length (the Professional Summary block specifically)
    # Only flag a summary that is too LONG — a tight one-liner is acceptable, so
    # we don't penalize short summaries (avoids over-flagging concise résumés).
    summary_block = _extract_summary_block(text)
    summary_words = len(summary_block.split()) if summary_block else 0
    if summary_block and summary_words > 75:
        sum_score = 5
        sum_items = [f"Summary is {summary_words} words — condense to 25–75."]
    else:
        sum_score, sum_items = 10, []
    checks.append({
        "id": "summary_length", "name": "Summary Length",
        "score": sum_score, "passed": sum_score >= 7,
        "detail": (
            "A professional summary reads best at a tight 25–75 words (2–4 lines). "
            "Much longer and it becomes a paragraph recruiters skip."
        ),
        "items": sum_items,
    })

    # 16. Portfolio / personal site link (separate from LinkedIn)
    has_portfolio = bool(_PORTFOLIO_RE.search(text))
    port_score = 10 if has_portfolio else 6
    checks.append({
        "id": "portfolio", "name": "Portfolio Link",
        "score": port_score, "passed": has_portfolio,
        "detail": (
            "A portfolio, GitHub, or personal-site link lets recruiters see your work "
            "directly. For technical and creative fields it's a strong signal."
        ),
        "items": [] if has_portfolio else ["No portfolio / GitHub / personal-site link found"],
    })

    # 17. Spelling (local, conservative — see _find_misspellings)
    misspellings = _find_misspellings(text)
    spell_score = 10 if not misspellings else max(0, 10 - len(misspellings) * 2)
    checks.append({
        "id": "spelling", "name": "Spelling",
        "score": spell_score, "passed": not misspellings,
        "detail": (
            "Spelling errors are the fastest way to get screened out. "
            "Proofread carefully — recruiters read typos as carelessness."
        ),
        "items": misspellings[:8],
    })

    overall = round(sum(c["score"] for c in checks) / len(checks) * 10)
    passed_names = [c["name"] for c in checks if c["passed"]]
    failed_names = [c["name"] for c in checks if not c["passed"]]
    summary_ok  = ("Scored well in " + ", ".join(passed_names[:3])) if passed_names else ""
    summary_bad = ("Needs work on "  + ", ".join(failed_names[:3])) if failed_names else ""

    return {
        "overall":     overall,
        "summary_ok":  summary_ok,
        "summary_bad": summary_bad,
        "checks":      checks,
        "bullets":     bullets[:20],
    }

_BULLET_ANALYSIS_MAX = 15

_ANALYSIS_PROMPT = """\
You are an expert resume reviewer and career coach. Analyze the following resume \
using the principles below and return ONLY a valid JSON object — no markdown, no \
code fences, no prose outside the JSON.

Career-center rubric (score and write `issues[]` strings consistent with this — \
prioritize what blocks interviews and ATS passes). Primary format reference: UMBC Career Center \
\"Resume Guidelines\" (https://careers.umbc.edu/wp-content/uploads/sites/221/2015/06/Resume-Guidelines.pdf).
• UMBC section-by-section checklist (when each appears in RESUME TEXT): HEADER — name; address, city, state, zip, \
email, and phone as available for a quick contact block. OBJECTIVE — optional; one concise statement tying \
relevant skills and/or education and career goals to the target position. SUMMARY — optional; \
two to five bullets highlighting greatest strengths and skills consistent with the rest of the document; \
UMBC notes Objective and Summary are often optional when space is tight and it may be unnecessary to include both. \
EDUCATION — university (or main school): name, city, state; degree and major; graduation date; minor and/or \
certifications line when used; GPA only when explicitly stated and above 3.00; community college line if present \
with degree or dates attended pattern. CERTIFICATIONS/LICENSES — credential title and date received. \
RESEARCH, PUBLICATIONS AND PRESENTATIONS — each item: title; place or organization presented; type \
(poster, paper, oral presentation, etc.); date. RELEVANT PROJECTS — title (class/course project without course number), \
semester and year; one to two bullets on role, actions, and results; tools or techniques gained; learning \
outcomes when present. RELEVANT COURSEWORK — optional; bulleted; most applicable major/minor courses for the role; \
no more than about three lines total. SKILLS — subcategories should match the candidate's field (e.g. Laboratory / \
Quantitative / Interpersonal; clinical systems or charting for healthcare; legal research or languages for law; \
creative software for design; Programming / Software only when computing is the focus) with proficiency tiers \
(Advanced/Proficient/Novice) when used; LANGUAGES with level (conversational/fluent) when relevant. \
PROFESSIONAL EXPERIENCE (or role-focused Experience) — position title, organization, city, state, start–end dates on the \
header line; two to five action bullets emphasizing achievements, contributions, and tangible outcomes. ADDITIONAL \
EXPERIENCE — other paid roles: one to three similar bullets each; achievements not only duties. Activities tied to \
the target role may belong under Professional/Relevant Experience per UMBC. HONORS AND AWARDS — organization, award, \
date. ACTIVITIES/INTERESTS — role, organization/club, dates; one to three achievement-oriented bullets with action \
verbs. SERVICE EXPERIENCE/COMMUNITY ENGAGEMENT — organization, role, dates involved. \
• Undergraduate recency rule (only flag when resume text clearly indicates class year or high-school-era items): \
first-year students may still list high school work/activities; after second year, work and activities should be \
college-level only — mention as a sectionStructure issue only when there is explicit tension, not by guessing.
• Top problem patterns to catch: spelling/grammar/punctuation slips; missing or hard-to-parse \
contact (email, phone); passive or duty-only wording instead of owned achievements; walls of \
text or disorganized sections that fail a fast skim; bullets that never show scale, results, \
or proof of impact.
• Resume language should be: specific rather than generic; active rather than passive; \
written to express (clear facts) not to impress with fluff; fact-based — quantify and qualify \
when truthful; formatted so humans and parsers can scan headings and bullets quickly.
• Avoid: personal pronouns (I, we, my, our); unexplained heavy abbreviation; long narrative \
paragraphs where bullets are expected; slang or overly casual phrasing; “references available” \
or reference lists; opening bullets with a date or date range (dates belong on role headers).
• Encourage: consistent formatting and emphasis (spacing, bold/italics/caps); strong \
section headings in sensible order; reverse chronological experience where applicable; \
no unexplained timeline gaps when the résumé shows them; bullets that lead with strong \
action verbs and end with outcomes/scale when possible.
• Improved bullets should use precise action verbs from proven families. Prefer verbs like: \
Management (administered, coordinated, oversaw, prioritized), Communication (authored, \
negotiated, promoted, translated), Research (examined, investigated, summarized), \
Technical (engineered, programmed, upgraded), Teaching (coached, facilitated, trained), \
Financial/Creative (conceptualized, initiated, integrated), Helping (assessed, counseled, \
expedited), Clerical/Detail (implemented, monitored, validated), and Accomplishment verbs \
(achieved, reduced, spearheaded, transformed). Keep tense sensible (prior roles past tense; \
present role may mix present for ongoing scope and past for shipped wins).

ANALYSIS PRINCIPLES (map to categoryScores and bulletAnalysis):
1. READABILITY: Short, skimmable bullets; survives a ~30-second skim; white space balance; \
avoid paragraph-long bullet blobs and cluttered layout signals in text.
2. ATS COMPATIBILITY: Tables, columns, text boxes, headers/footers, images/icons, odd \
headings; standard sections (Experience, Education, Skills); contact lines machine-readable.
3. JOB MATCH: If a JD is provided — keywords, tools, responsibilities overlap; natural \
keyword placement (no stuffing). If no JD: null scores as specified below.
4. ACHIEVEMENT QUALITY: Outcomes and ownership vs. vague duties (“responsible for”, \
“worked on”, task lists without impact). Align with results-focused bullet craft. \
Do NOT fold this into quantification — weak verbs and duty-only wording are achievement problems even when numbers exist.
5. QUANTIFICATION: %, $, scale, time saved, users, rankings, before/after — reward \
truthful metrics. Recruiter target: **~75%** of experience bullets should carry a measurable result \
(real number or honest bracket placeholder). Score quantification against that bar: if fewer than \
~75% of experience bullets have metrics, the category score should be in the 60–75 range even when \
some bullets are strong. This is a high-value dimension: be thorough, not shy. Any experience bullet \
describing an outcome, build, or improvement WITHOUT a number is a quantification opportunity — flag it \
in bulletAnalysis and supply categoryRewrites.quantification that adds a real metric OR a bracket \
placeholder ([X%], [$Y], [~N users], [X ms], [N×]). Never flag "Technologies:" / skills-only lines. \
Prioritize the weakest/highest-impact bullets within your {bullet_analysis_max}-bullet budget. \
This is separate from achievement quality: duty-language is achievement; missing metrics on a strong \
outcome bullet (Built/Engineered/Implemented with no scale) is quantification.
6. SECTION STRUCTURE: Sections and order aligned with the UMBC checklist above (header, optional Objective/Summary, \
education, optional certs/research/projects/coursework, skills, professional vs additional experience, honors, activities, \
service); enforce bullet-count norms where visible (Summary 2–5; Professional 2–5; Additional 1–3; Activities 1–3; \
Projects 1–2); flag redundant Objective + Summary when space is tight; coursework over ~3 lines; GPA not per UMBC \
(only if ≥3.0 and stated); research/pubs missing venue or presentation type when items are listed.
7. LANGUAGE QUALITY: Spelling/grammar; passive voice and buzzwords; tense; clarity over \
flowery phrasing; minimal unexplained jargon/acronyms.
8. FIELD SIGNALS & PROFESSIONAL DEPTH (JSON key MUST stay `technicalBranding` for compatibility): How clearly the \
résumé signals fit for the candidate's discipline — skills and tools grouped sensibly; field-appropriate evidence \
(e.g. portfolio or code samples for computing/design; writing or teaching clips for communications/education; \
licenses and certifications for regulated professions; publications or posters for research; patient volume or \
outcomes only when already stated). Score high when domain-relevant depth is obvious without hollow buzzwords. Do \
NOT penalize non-STEM résumés for lacking \"tech stack\" or GitHub; judge instead on clarity of training, tools, \
credentials, and outcomes that employers in THAT field expect.

SCORING GUIDANCE:
90-100 = Excellent, highly recruiter-friendly and ATS-safe.
75-89  = Strong but needs minor improvements.
60-74  = Decent but has several missed opportunities.
40-59  = Weak; needs major restructuring.
<40    = Poor; likely to fail ATS and recruiter screens.

CRITICAL RULES:
- The candidate may be in any discipline (STEM, healthcare, business, arts, education, trades, public service, etc.). \
Infer the field from the résumé text and score against that field's expectations — never assume a software-only audience.
- Be SPECIFIC, not generic. Tell exactly WHERE and HOW to fix each issue.
- When rewriting bullets, PRESERVE TRUTHFULNESS. Mark invented metrics \
  as "[X%]", "[$Y]", or "[~N]".
- For bulletAnalysis: analyze the weakest bullets, up to {bullet_analysis_max} of them. Be thorough — \
  if the résumé has many bullets that lack metrics or lead with duty phrasing, return MANY (10-15), not \
  just 2-3. Returning only a couple of bullets when the résumé clearly has more weak ones is an \
  under-report and the user notices. Skip only the genuinely strong bullets (own a quantified outcome). \
- For each weak bullet, label issues clearly (quantification vs achievement vs language). \
  improvedBullet must match the primary weakness. A bullet that leads with a strong verb (Built, \
  Engineered, Integrated, Automated, Designed, Implemented, Developed) but contains NO number is a \
  QUANTIFICATION bullet, not an achievement bullet — its weakness is the missing metric, so \
  primaryCategory is "quantification" and issueCategories includes "quantification". Reserve \
  achievementQuality for duty-language / weak-verb / no-ownership bullets. categoryRewrites.quantification and \
  categoryRewrites.achievementQuality must be DIFFERENT rewrites when both weaknesses apply — \
  never paste the same text into both fields.
- CATEGORY HONESTY (the UI buckets bullets by these fields — get them right): \
  set primaryCategory to the single categoryScores key that improvedBullet actually fixes, and \
  issueCategories to EVERY categoryScores key the bullet is weak in (a superset that always includes \
  primaryCategory). Do NOT list "quantification" in issueCategories unless the bullet genuinely lacks \
  numbers AND you can add a real or [placeholder] metric. If a bullet's only weakness is structure or \
  phrasing, primaryCategory is "sectionStructure"/"languageQuality" and issueCategories must NOT include \
  "quantification". A bullet whose primaryCategory is X must have a categoryRewrites entry for X OR use \
  improvedBullet as the X fix — never flag a category you cannot offer a rewrite for.
- REWRITE HONESTY (server will reject rewrites that violate this): every improvedBullet and every \
  categoryRewrites.* value MUST preserve every numeral (digits, percentages, counts, durations) and \
  every concrete proper noun (Title-Case names, ALL-CAPS acronyms, CamelCase tech names like PostgreSQL, \
  CI/CD, AWS Lambda, gRPC) that appeared in the originalBullet. Removing "5 refinement cycles", \
  "3 retries", "PostgreSQL", or "AWS Lambda" while calling the change "readability" or \
  "language quality" is a lie — the rewrite must add JD vocabulary, not strip the original's content. \
  Rewrites should be the same length or longer than the original.
- SUBSTANTIVE REWRITES ONLY: a rewrite that only changes tense, plurality, punctuation, or one weak \
  verb form is NOT an improvedBullet. "Conduct price verification..." → "Conducted price verification..." \
  is invalid. For duty phrasing / achievementQuality / languageQuality, rewrite the bullet into \
  ownership + scope + outcome, e.g. "Verified Bloomberg and market pricing data across $500M+ AUM \
  hedge-fund portfolios, improving NAV precision and valuation accuracy." If you cannot improve \
  substance, omit improvedBullet/categoryRewrites for that category.
- QUANTIFICATION REWRITES (required for quant bullets): when primaryCategory is "quantification" \
  (or issueCategories includes it and the bullet lacks metrics), you MUST include \
  categoryRewrites.quantification with at least one new metric or bracket placeholder ([X%], [$Y], \
  [~N], [X ms], [N×]) not present in originalBullet. Set improvedBullet to that same quant rewrite \
  when quantification is the primary fix. Example: "Implemented gRPC streaming… reducing latency" → \
  "Implemented gRPC streaming… cutting end-to-end latency by [~40%] for voice and chat workloads." \
  Do NOT omit the rewrite and leave only a category rationale — the UI shows Flagged bullets, not \
  generic lists. If you cannot add a placeholder, do not flag the bullet for quantification.
- EVIDENCE BEFORE CLAIM (server will drop unsupported claims): never claim "missing impact metrics", \
  "no quantification", or "lacks numbers" as a topIssue / atsWarning / bullet issue / final \
  recommendation when the résumé text contains numerals (digits, %, $, ×, k+, CGPA, GPA, dates, \
  counts like "9,000+ records" or "5 refinement cycles"). Count first, then claim. If the résumé \
  has 5+ numerals overall, do NOT add a "missing metrics" topIssue — the right move is to flag \
  SPECIFIC bullets that are weakest, not to claim the whole résumé lacks quantification.
- NEVER claim "duty-only bullets", "weak action verbs", or "lacks ownership" when the actual bullets \
  start with strong ownership verbs (Architected, Built, Delivered, Designed, Engineered, Developed, \
  Reduced, Implemented, Shipped, Launched, Led, Drove, Owned, Spearheaded, Scaled, Optimized, etc.). \
  Read the verbs first. If most bullets lead with strong verbs, the achievementQuality / \
  languageQuality scores cannot legitimately be below 55.
- NO TAUTOLOGICAL SUGGESTIONS: do not recommend a structural change ("create separate lines for each \
  institution", "add bullets for each role", "move skills to top") when the résumé already has that \
  structure. Read the layout before recommending a layout change.
- For each originalBullet field: copy the wording EXACTLY from RESUME TEXT (including • or -), \
  after normalizing; do not drop the first letters of words.
- If no JD is provided: set jobMatch in categoryScores to null, set \
  keywordScore to null, leave matchedKeywords/missingKeywords empty.
- Prioritize improvements that increase interview chances most.
- categoryRationales: for EVERY categoryScores key where the score is below 95, write 1-2 \
  sentences explaining WHY you assigned that score for THIS résumé — cite specific evidence \
  (counts, sections, patterns). Required even when bulletAnalysis has no entries for that \
  category; holistic scores must be justified. For scores 95-100 you may use a brief \
  one-sentence positive note or omit. Do not repeat generic rubric text — explain what you \
  actually saw.
{jd_section}

STRUCTURAL SIGNALS (deterministic pre-scan — verify against RESUME TEXT; do not invent problems):
{structural_signals}

RESUME TEXT:
{resume_text}

Return ONLY this JSON (no markdown fences, no explanation):
{{
  "overallScore": <integer 0-100>,
  "categoryScores": {{
    "readability": <0-100>,
    "atsCompatibility": <0-100>,
    "jobMatch": <0-100 or null>,
    "achievementQuality": <0-100>,
    "quantification": <0-100>,
    "sectionStructure": <0-100>,
    "languageQuality": <0-100>,
    "technicalBranding": <0-100>
  }},
  "categoryRationales": {{
    "readability": "<why this score for this résumé>",
    "atsCompatibility": "<why>",
    "jobMatch": "<why, or null when no JD>",
    "achievementQuality": "<why>",
    "quantification": "<why>",
    "sectionStructure": "<why>",
    "languageQuality": "<why>",
    "technicalBranding": "<why>"
  }},
  "summary": "<2-3 sentence specific overall assessment>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "topIssues": [
    {{
      "issue": "<short problem title>",
      "severity": "<low|medium|high>",
      "whyItMatters": "<1-2 sentences on impact>",
      "suggestion": "<concrete actionable fix>"
    }}
  ],
  "atsWarnings": [
    {{"warning": "<ATS issue>", "suggestion": "<fix>"}}
  ],
  "keywordAnalysis": {{
    "matchedKeywords": ["<keyword>"],
    "missingKeywords": ["<keyword>"],
    "keywordScore": <0-100 or null>,
    "suggestions": ["<where/how to naturally add missing keyword>"]
  }},
  "bulletAnalysis": [
    {{
      "originalBullet": "<exact bullet text, truncated to 150 chars>",
      "score": <0-100>,
      "primaryCategory": "<the ONE categoryScores key this bullet's improvedBullet addresses: quantification | achievementQuality | languageQuality | sectionStructure | readability | technicalBranding | atsCompatibility | jobMatch>",
      "issueCategories": ["<every categoryScores key this bullet is weak in — superset of primaryCategory, e.g. [\\"quantification\\", \\"languageQuality\\"]>"],
      "issues": ["<issue 1>", "<issue 2>"],
      "improvedBullet": "<rewrite for primaryCategory; REQUIRED when primary is quantification — must add [X%]/[$Y]/[~N] or a real metric>",
      "categoryRewrites": {{
        "quantification": "<REQUIRED when bullet lacks metrics: same as improvedBullet when primary is quantification; always include a new [X%]/[$Y]/[~N] or digit; never empty>",
        "achievementQuality": "<when verbs/duties are weak: strong verb + owned outcome; omit invented metrics unless in original>"
      }}
    }}
  ],
  "sectionFeedback": [
    {{"section": "<name>", "score": <0-100>, "feedback": "<specific feedback>"}}
  ],
  "rewriteSuggestions": [
    {{"before": "<weak line>", "after": "<improved line>", "reason": "<why better>"}}
  ],
  "finalRecommendations": [
    "<most impactful action 1>",
    "<action 2>",
    "<action 3>",
    "<action 4>"
  ]
}}
"""

def _regex_to_comprehensive(struct: dict, jd: str) -> dict:
    """Convert _recruiter_checks output to comprehensive format (LLM unavailable fallback)."""
    checks = struct.get("checks", [])

    def _s(cid: str) -> int:
        c = next((x for x in checks if x["id"] == cid), None)
        return round((c["score"] / 10) * 100) if c else 50

    quant  = _s("quantify")
    weak   = _s("weak_verbs")
    action = _s("action")
    pron   = _s("pronouns")
    rep    = _s("repetition")
    dens   = _s("density")
    dates  = _s("dates")
    cont   = _s("contact")
    leng   = _s("length")
    rdepth = _s("role_depth")
    unnec  = _s("unnecessary")
    passive = _s("passive_voice")
    dlead = _s("date_led_bullet")

    overall = struct.get("overall", 60)
    issues = []
    for c in checks:
        if not c.get("passed"):
            sev = "high" if c["score"] < 5 else "medium"
            first_items = "; ".join(str(x) for x in (c.get("items") or [])[:2])
            issues.append({
                "issue": c["name"],
                "severity": sev,
                "whyItMatters": c.get("detail", ""),
                "suggestion": f"Fix these: {first_items}" if first_items else c.get("detail", "")[:80],
            })

    return {
        "overallScore": overall,
        "categoryScores": {
            "readability":       round((dens + leng) / 2),
            "atsCompatibility":  round((dates + cont) / 2),
            "jobMatch":          None,
            "achievementQuality": round((weak + action + rdepth) / 3),
            "quantification":    quant,
            "sectionStructure":  round((dates + unnec + dlead) / 3),
            "languageQuality":   round((pron + rep + passive) / 3),
            "technicalBranding": 50,
        },
        "summary": (
            (struct.get("summary_ok") or "") + " " + (struct.get("summary_bad") or "")
        ).strip() or "Resume analysis complete. Fix the highlighted issues to improve your score.",
        "topStrengths": [c["name"] for c in checks if c.get("passed")][:3],
        "topIssues":    issues[:6],
        "atsWarnings":  [],
        "keywordAnalysis": {
            "matchedKeywords": [], "missingKeywords": [],
            "keywordScore": None, "suggestions": [],
        },
        "bulletAnalysis":       [],
        "sectionFeedback":      [],
        "rewriteSuggestions":   [],
        "finalRecommendations": [
            "Add quantified results (%, $, numbers) to at least 75% of your bullets.",
            "Replace weak verbs (helped, assisted, worked on) with strong action verbs.",
            "Ensure every job entry has at least 3 achievement-focused bullets.",
            "Verify contact section includes email, phone, and LinkedIn URL.",
            "Make sure the resume is formatted correctly with the correct spacing and alignment.",
            "Use a professional font like Arial, Times New Roman, or Calibri for the resume.",
            "Fix spelling/grammar and verify email + phone (and LinkedIn) are obvious in the header.",
            "Replace passive or duty-only lines with action-verb openings and measurable outcomes where truthful.",
            "Tighten layout for a 30-second skim: short bullets, dates on role lines, verbs first.",
            "Drop references blurb, unexplained abbreviations, and narrative blobs — use crisp bullets.",
        ],
    }


def _analyze_resume_comprehensive(text: str, jd: str = "") -> dict:
    """Full resume analysis: structural regex + LLM deep-dive."""
    # Structural checks (fast, always run)
    struct = _recruiter_checks(text)

    # Summarize failed structural checks for the LLM (align narrative with deterministic scan)
    sig_lines: list[str] = []
    for c in struct.get("checks", []):
        if c.get("passed"):
            continue
        samp = "; ".join(str(x) for x in (c.get("items") or [])[:2])
        title = c.get("name", "Check")
        sig_lines.append(f"- {title}: {samp}" if samp else f"- {title}")
    struct_summary = (
        "\n".join(sig_lines[:14])
        if sig_lines
        else "(All automated structural checks passed.)"
    )

    # Build LLM prompt
    jd_section = (
        f"\nJOB DESCRIPTION (analyze keyword match against this):\n{jd[:4000]}"
        if jd.strip()
        else "\n(No job description provided. Set jobMatch and keywordScore to null.)"
    )
    prompt = _ANALYSIS_PROMPT.format(
        bullet_analysis_max=_BULLET_ANALYSIS_MAX,
        jd_section=jd_section,
        structural_signals=struct_summary,
        resume_text=text[:6000],
    )

    # Route the main analysis through the reasoning tier (default grok-4 —
    # same model used for vision-extract). Better quality on bullet-issue
    # tagging + rewrite generation, at ~8-10s extra latency per request.
    raw = _llm_json_call(prompt, model_override=_analysis_model())
    if raw and isinstance(raw, dict):
        # Strip bogus issues / recommendations that contradict the actual
        # résumé text BEFORE _normalize_analysis runs its score calibration —
        # otherwise the calibration penalty fires on lies and the overall
        # score gets crushed to 36 on a perfectly fine résumé.
        raw = _validate_analysis_against_resume(raw, text)
        normalized = _normalize_analysis(raw)
        # Deterministic topIssues (generic "add a metric" + raw line lists) are only
        # surfaced when the LLM path fails — they duplicate categoryRationales and
        # lack per-bullet rewrites. Structural checks still feed the prompt above.
        return normalized

    logger.warning("LLM unavailable for comprehensive analysis — using regex fallback")
    return inject_deterministic_insights(_regex_to_comprehensive(struct, jd), struct)
