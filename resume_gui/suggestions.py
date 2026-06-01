"""Apply accepted coach/tailor suggestions to structured ResumeDocModel."""
from __future__ import annotations

import logging
import re
from typing import Any, List, Optional

from resume_gui.doc_utils import _clean_model_text
from resume_gui.extract.doc_normalize import _is_structural_noise_line
from resume_gui.extract.education_parse import _education_items_from_flat_lines
from resume_gui.renderers.latex_renderer import ProjectItem, ResumeDocModel, normalize_skill_items

logger = logging.getLogger("resume_gui")

def _resume_doc_with_updates(doc: "ResumeDocModel", **overrides: Any) -> "ResumeDocModel":
    """Rebuild ``ResumeDocModel`` preserving sections not mentioned in ``overrides``."""
    return ResumeDocModel(
        full_name=overrides.get("full_name", doc.full_name),
        headline=overrides.get("headline", doc.headline),
        location=overrides.get("location", doc.location),
        email=overrides.get("email", doc.email),
        phone=overrides.get("phone", doc.phone),
        linkedin=overrides.get("linkedin", doc.linkedin),
        github=overrides.get("github", doc.github),
        summary=overrides.get("summary", doc.summary),
        skills=overrides.get("skills", doc.skills),
        experience=overrides.get("experience", doc.experience),
        education=overrides.get("education", doc.education),
        projects=overrides.get("projects", doc.projects),
        extra_sections=overrides.get("extra_sections", doc.extra_sections),
    )


def _accepted_suggestion_section_bucket(section: Optional[str]) -> str:
    """Where to apply a suggestion when verbatim ``original`` is not found in the structured doc.

    Coach quotes ``original`` from raw profile text, while ``_resume_doc_from_profile_text`` may
    normalize via LLM — substring matches often fail. A blanket ``doc.summary = suggested`` fallback
    then pasted *skills* text into the summary (user-visible bug).
    """
    s = (section or "").strip().lower()
    if not s:
        return "other"
    if "summary" in s or "profile" in s or "objective" in s:
        return "summary"
    if "skill" in s:
        return "skills"
    if "experience" in s or "employment" in s or ("work" in s and "project" not in s):
        return "experience"
    if "project" in s:
        return "projects"
    if "education" in s or "academic" in s:
        return "education"
    return "other"


def _append_extra_section_line(doc: ResumeDocModel, section_title: str, line: str) -> None:
    lt = (line or "").strip()
    if not lt:
        return
    key = section_title.strip().lower()
    if key in ("projects", "project"):
        if doc.projects:
            doc.projects[-1].bullets.append(lt)
        else:
            doc.projects.append(ProjectItem(name="", bullets=[lt]))
        return
    if key == "education":
        if doc.education:
            doc.education[-1].bullets.append(lt)
        else:
            doc.education.extend(_education_items_from_flat_lines([lt]))
        return
    for i, (name, lines) in enumerate(doc.extra_sections):
        nl = name.strip().lower()
        if nl == key or key in nl or nl in key:
            seq = list(lines)
            if lt not in seq:
                seq.append(lt)
            doc.extra_sections[i] = (name, seq)
            return
    doc.extra_sections.append((section_title, [lt]))


def _skills_fallback_replace_or_append(doc: ResumeDocModel, original: str, suggested: str) -> None:
    """When ``original`` is not inside any skill line, still apply a skills-section approval."""
    sug = (suggested or "").strip()
    if not sug:
        return
    orig = (original or "").strip()
    # Prefer replacing a line that shares a long prefix with what the coach quoted.
    if orig and len(orig) >= 24:
        prefix = orig[:48].lower()
        for idx, (label, items) in enumerate(doc.skills):
            next_items: list[str] = []
            changed = False
            for it in items:
                if prefix in (it or "").lower():
                    next_items.append(sug)
                    changed = True
                else:
                    next_items.append(it)
            if changed:
                doc.skills[idx] = (label, [x for x in next_items if x])
                return
    # Parse "Category: a, b, c" like the profile parser.
    if ":" in sug:
        label, rest = sug.split(":", 1)
        label = _clean_model_text(label)
        rest = rest.strip()
        if not label:
            label = "Skills"
        items = [x.strip() for x in rest.replace("·", ",").split(",") if x.strip()]
        items = [x for x in items if not _is_structural_noise_line(x)]
        normalized = normalize_skill_items(items)
        if normalized:
            doc.skills.append((label, normalized))
            return
    doc.skills.append(("Skills", [sug]))


def _normalize_resume_line_for_suggestion(s: str) -> str:
    """Align with ``web/lib/suggestionResumeMatch.ts`` ``normalizeResumeLineForSuggestion``."""
    t = (s or "").strip().lower()
    for a, b in (
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u201c", "'"),
        ("\u201d", "'"),
        ("\u2032", "'"),
        ("\u2033", "'"),
    ):
        t = t.replace(a, b)
    t = re.sub(
        r"^[\s\u2022\u00b7\u2023\u2024\u2043\u2219\-\u2013\u2014*‧·.]+",
        "",
        t,
    )
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _resume_line_matches_suggestion_original(line: str, original: str) -> bool:
    """Same contract as ``resumeLineMatchesSuggestionOriginal`` in ``suggestionResumeMatch.ts``."""
    no = _normalize_resume_line_for_suggestion(original)
    nl = _normalize_resume_line_for_suggestion(line)
    if not no or not nl:
        return False
    if nl == no:
        return True

    raw_line = line.strip().lower().replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", "'").replace("\u201d", "'")
    raw_orig = original.strip().lower().replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", "'").replace("\u201d", "'")
    if raw_line == raw_orig:
        return True

    min_contains = 8
    if len(no) >= min_contains and len(nl) >= min_contains:
        if no in nl or nl in no:
            return True

    pref_len = 55
    pref_a = nl[:pref_len]
    pref_b = no[:pref_len]
    if len(pref_a) >= 12 and len(pref_b) >= 12:
        if pref_a.startswith(pref_b) or pref_b.startswith(pref_a):
            return True

    if len(no) >= 14 and len(nl) >= 14:
        shorter = nl if len(nl) <= len(no) else no
        longer = no if len(nl) <= len(no) else nl
        window = longer[: len(shorter) + 8]
        if shorter in window:
            return True

    return False


def _apply_line_suggestion(line: str, original: str, suggested: str) -> Optional[str]:
    """If ``original`` matches this line (verbatim or fuzzy), return the new line text; else None."""
    if not original:
        return None
    if original in line:
        if suggested:
            return line.replace(original, suggested).strip()
        return ""
    if _resume_line_matches_suggestion_original(line, original):
        if suggested:
            return suggested.strip()
        return ""
    return None


def _experience_fallback_replace_by_prefix(doc: ResumeDocModel, original: str, suggested: str) -> bool:
    """Last resort when fuzzy match failed: replace the bullet whose text contains a long prefix of ``original``."""
    orig = (original or "").strip()
    sug = (suggested or "").strip()
    if not orig or not sug or len(orig) < 24:
        return False
    prefix = orig[:48].lower()
    for exp in doc.experience:
        next_bullets: list[str] = []
        changed = False
        for b in exp.bullets:
            if prefix in (b or "").lower():
                next_bullets.append(sug)
                changed = True
            else:
                next_bullets.append(b)
        if changed:
            exp.bullets = [x for x in next_bullets if x]
            return True
    return False


def _apply_accepted_edits_to_doc(doc: ResumeDocModel, accepted_suggestions: Optional[list]) -> None:
    if not isinstance(accepted_suggestions, list):
        return

    for item in accepted_suggestions:
        if not isinstance(item, dict):
            continue
        original = str(item.get("original") or "").strip()
        suggested = str(item.get("suggested") or "").strip()
        if not original:
            continue

        replaced = False

        if doc.summary and original in doc.summary:
            doc.summary = doc.summary.replace(original, suggested).strip()
            replaced = True

        for idx, (label, items) in enumerate(doc.skills):
            next_items = []
            changed = False
            for it in items:
                updated = _apply_line_suggestion(it, original, suggested)
                if updated is None:
                    next_items.append(it)
                else:
                    changed = True
                    replaced = True
                    if updated:
                        next_items.append(updated)
            if changed:
                doc.skills[idx] = (label, [x for x in next_items if x])

        for exp in doc.experience:
            next_bullets = []
            changed = False
            for b in exp.bullets:
                updated = _apply_line_suggestion(b, original, suggested)
                if updated is None:
                    next_bullets.append(b)
                else:
                    changed = True
                    replaced = True
                    if updated:
                        next_bullets.append(updated)
            if changed:
                exp.bullets = [x for x in next_bullets if x]

        for proj in doc.projects:
            next_bullets = []
            changed = False
            for b in proj.bullets:
                updated = _apply_line_suggestion(b, original, suggested)
                if updated is None:
                    next_bullets.append(b)
                else:
                    changed = True
                    replaced = True
                    if updated:
                        next_bullets.append(updated)
            if changed:
                proj.bullets = [x for x in next_bullets if x]

        for edu in doc.education:
            for attr in ("institution", "degree", "dates", "location"):
                cur = getattr(edu, attr, "") or ""
                if cur and original in cur:
                    setattr(edu, attr, cur.replace(original, suggested).strip())
                    replaced = True
            next_bullets = []
            changed = False
            for b in edu.bullets:
                updated = _apply_line_suggestion(b, original, suggested)
                if updated is None:
                    next_bullets.append(b)
                else:
                    changed = True
                    replaced = True
                    if updated:
                        next_bullets.append(updated)
            if changed:
                edu.bullets = [x for x in next_bullets if x]

        # Coach quotes raw profile lines; structured doc may normalize wording — do not
        # route unrelated sections into ``summary``.
        if not replaced and suggested:
            bucket = _accepted_suggestion_section_bucket(str(item.get("section") or ""))
            if bucket == "summary":
                doc.summary = suggested.strip()
            elif bucket == "skills":
                _skills_fallback_replace_or_append(doc, original, suggested)
            elif bucket == "projects":
                _append_extra_section_line(doc, "Projects", suggested)
            elif bucket == "education":
                _append_extra_section_line(doc, "Education", suggested)
            elif bucket == "experience":
                if not _experience_fallback_replace_by_prefix(doc, original, suggested):
                    logger.warning(
                        "accepted_suggestion could not be matched to structured experience "
                        "(no verbatim or fuzzy line match, prefix fallback failed); skipped id=%s section=%r",
                        str(item.get("id") or "")[:32],
                        (item.get("section") or "")[:80],
                    )
            else:
                logger.warning(
                    "accepted_suggestion could not be matched in structured doc; skipped id=%s section=%r",
                    str(item.get("id") or "")[:32],
                    (item.get("section") or "")[:80],
                )
