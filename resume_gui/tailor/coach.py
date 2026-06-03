"""Coach prompts and ratings payload builders."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("resume_gui")

def _resume_coach_prompt(
    candidate_profile: str,
    job_description: str,
    digest: str,
    focus_gaps: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Shared JD + résumé + optional web-digest prompt for suggest-changes (JSON coach)."""
    digest_block = ""
    ds = (digest or "").strip()
    if ds:
        digest_block = (
            "\n---\nJOB & MARKET CONTEXT (from live web search before this analysis — use for terminology, "
            "JD vocabulary, and honest keyword overlap only; do NOT add employers, degrees, dates, or metrics "
            "not already in the résumé or JD):\n"
            f"{ds[:4500]}\n\n"
        )

    gaps_block = ""
    if focus_gaps:
        lines = []
        for g in focus_gaps[:8]:
            name = str(g.get("name") or "").strip()
            score = g.get("score")
            if not name:
                continue
            score_str = f" ({score}/10)" if isinstance(score, (int, float)) else ""
            lines.append(f"  - {name}{score_str}")
        if lines:
            gaps_block = (
                "\n---\nPRIORITY GAPS FROM PREVIOUS SCORING (these criteria scored low — focus your "
                "suggestions on surfacing any related experience already in the résumé, reframing bullets "
                "to use the exact keywords, or advising the candidate to add missing context they may have "
                "omitted. Do NOT fabricate experience):\n"
                + "\n".join(lines)
                + "\n\n"
            )

    return (
        "You are an expert resume coach. Analyze this resume against the job description "
        "and return 5-8 specific, actionable improvements for individual bullets or sections.\n\n"
        f"RESUME:\n{candidate_profile[:6000]}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:3000]}\n"
        f"{digest_block}"
        f"{gaps_block}"
        "Return a JSON object with this exact structure:\n"
        '{\n'
        '  "summary": "One sentence: the most important gap between this resume and the JD.",\n'
        '  "strategic_tips": [\n'
        '    "2-4 actionable coaching tips (1-2 sentences each) on how to strengthen the candidacy for THIS role — '
        'what to emphasize in interviews, how to reframe experience, or gaps to address in narrative. '
        'NOT resume bullet rewrites; those belong in suggestions."\n'
        '  ],\n'
        '  "interview_questions": [\n'
        '    "5-8 specific questions an interviewer is VERY LIKELY to ask for THIS exact role, based on the JD responsibilities and the candidate\'s gaps. '
        'Include a mix: technical skill questions, behavioural (STAR) questions, and gap-probe questions. '
        'Each question is a complete sentence ending in a question mark."\n'
        '  ],\n'
        '  "suggestions": [\n'
        '    {\n'
        '      "id": "s1",\n'
        '      "section": "Work Experience",\n'
        '      "original": "The exact bullet text from the resume (quote it verbatim)",\n'
        '      "suggested": "The improved version, tailored to the JD keywords",\n'
        '      "reason": "Why this change improves the match — 1 concise sentence.",\n'
        '      "priority": "high",\n'
        '      "category": "quantify_impact"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        "Rules:\n"
        "- Only suggest changes to bullets that EXIST in the resume — quote them exactly.\n"
        "- Do NOT invent metrics, employers, or facts not in the resume.\n"
        "- When JOB & MARKET CONTEXT is present, use it only to sharpen **wording** and JD-aligned phrasing for facts already in the résumé.\n"
        "- When PRIORITY GAPS are listed, bias your suggestions toward addressing them — find the closest "
        "existing bullets and rewrite them to surface the relevant skill or experience.\n"
        "- If the résumé summary/objective exists, suggest rewriting it to open with the EXACT job title "
        "from the posting (verbatim, not a synonym) — e.g. if the JD title is 'Software Engineer, Full Stack', "
        "the summary should begin 'Software Engineer, Full Stack with…', not 'Full Stack Engineer with…'.\n"
        "- Priority: 'high' = missing critical JD keyword; 'medium' = wording improvement; 'low' = polish.\n"
        "- category: MUST be exactly one of: 'quantify_impact' (add metrics/numbers/%), "
        "'action_verbs' (stronger/more specific action verbs), "
        "'add_keywords' (surface JD-critical keywords missing from the bullet), "
        "'relevance' (reframe to align with the target role), "
        "'remove_filler' (cut vague/generic language), "
        "'strengthen_impact' (make outcomes and scope clearer). "
        "Pick the SINGLE best-fit category for each suggestion.\n"
        "- strategic_tips: honest, specific, second-person OK; do not repeat the summary sentence; "
        "do not invent employers or metrics.\n"
        "- interview_questions: 5-8 questions an interviewer would realistically ask; mix technical, behavioural, "
        "and gap-probe questions; tailor to THIS specific role and the candidate's gaps; full question sentences.\n"
        "- Return ONLY the JSON object, no markdown fences."
    )


SUGGESTION_CATEGORIES = {
    "quantify_impact", "action_verbs", "add_keywords",
    "relevance", "remove_filler", "strengthen_impact",
}

def _sanitize_suggestions(raw: object) -> List[dict]:
    """Validate and normalise suggestions list — ensures category is always a known value."""
    if not isinstance(raw, list):
        return []
    out: List[dict] = []
    for item in raw[:12]:
        if not isinstance(item, dict):
            continue
        original = str(item.get("original") or "").strip()
        suggested = str(item.get("suggested") or "").strip()
        if not original or not suggested or original == suggested:
            continue
        cat = str(item.get("category") or "").strip().lower()
        if cat not in SUGGESTION_CATEGORIES:
            # fall back: infer from reason text
            reason_lower = str(item.get("reason") or "").lower()
            if any(w in reason_lower for w in ["metric", "number", "quantif", "%", "percent"]):
                cat = "quantify_impact"
            elif any(w in reason_lower for w in ["verb", "action", "strong"]):
                cat = "action_verbs"
            elif any(w in reason_lower for w in ["keyword", "missing", "jd", "ats"]):
                cat = "add_keywords"
            elif any(w in reason_lower for w in ["filler", "vague", "generic", "weak"]):
                cat = "remove_filler"
            elif any(w in reason_lower for w in ["relevance", "align", "reframe", "target"]):
                cat = "relevance"
            else:
                cat = "strengthen_impact"
        priority = str(item.get("priority") or "medium").lower()
        if priority not in ("high", "medium", "low"):
            priority = "medium"
        out.append({
            "id": str(item.get("id") or f"s{len(out)+1}"),
            "section": str(item.get("section") or "Resume").strip(),
            "original": original,
            "suggested": suggested,
            "reason": str(item.get("reason") or "").strip(),
            "priority": priority,
            "category": cat,
        })
    return out


def _sanitize_strategic_tips(raw: object) -> List[str]:
    """Coaching tips shown before PDF generate (not résumé diff rows)."""
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw[:6]:
        t = str(item or "").strip()
        if len(t) < 24 or len(t) > 520:
            continue
        out.append(t)
    return out[:4]


def _sanitize_interview_questions(raw: object) -> List[str]:
    """Likely interview questions for this specific role."""
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw[:12]:
        q = str(item or "").strip()
        if len(q) < 15 or len(q) > 600:
            continue
        out.append(q)
    return out[:8]


def _sanitize_reuse_research_sources(raw: object) -> List[dict]:
    out: List[dict] = []
    if not isinstance(raw, list):
        return out
    for it in raw[:40]:
        if not isinstance(it, dict):
            continue
        url = str(it.get("url") or "").strip()[:2000]
        if not url:
            continue
        title = str(it.get("title") or "").strip()[:500] or None
        out.append({"title": title, "url": url})
    return out


def _try_suggest_reuse_research(body: dict) -> Optional[Tuple[str, List[str], List[dict]]]:
    """If the client sends a prior digest (same JD session), skip a second live web search."""
    d = str(body.get("reuse_research_digest") or "").strip()
    if len(d) < 40:
        return None
    rq_in = body.get("reuse_research_queries")
    rq = [
        str(q).strip()[:500]
        for q in (rq_in if isinstance(rq_in, list) else [])
        if str(q).strip()
    ][:40]
    rs = _sanitize_reuse_research_sources(body.get("reuse_research_sources"))
    return (d[:5000], rq, rs)


def _parse_focus_gaps(raw: object) -> List[Dict[str, Any]]:
    """Validate and sanitize the focus_gaps list from the request body."""
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw[:10]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()[:120]
        if not name:
            continue
        score = item.get("score")
        try:
            score = float(score) if score is not None else None
        except (TypeError, ValueError):
            score = None
        out.append({"name": name, "score": score})
    return out


def _category_with_resolved(raw: object) -> dict:
    """Ensure detailed category buckets include resolved_by_user."""
    if not isinstance(raw, dict):
        return {"score": 0, "covered": [], "missing": [], "resolved_by_user": []}
    out = dict(raw)
    out.setdefault("covered", [])
    out.setdefault("missing", [])
    out.setdefault("resolved_by_user", [])
    return out


def _build_ratings_payload(llm_ratings: Optional[dict]) -> Optional[dict]:
    """Normalise _rate_resume output → the JSON shape the frontend expects.

    Returns None when llm_ratings is missing/unusable so callers can fall back.
    Schema (detailed): overall_score, job_title, qualifications, responsibilities,
    keywords, whats_working, gaps, verdict, strategic_tips, interview_questions.
    """
    if not llm_ratings or not isinstance(llm_ratings, dict):
        return None

    has_detailed = "qualifications" in llm_ratings or "responsibilities" in llm_ratings
    if not has_detailed:
        return {
            "match_score": llm_ratings.get("match_score", 0),
            "criteria": (llm_ratings.get("criteria") or [])[:12],
            "whats_working": llm_ratings.get("whats_working") or [],
            "gaps": llm_ratings.get("gaps") or [],
            "verdict": llm_ratings.get("verdict", ""),
        }

    kw = llm_ratings.get("keywords") or {}
    overall = int(llm_ratings.get("overall_score") or llm_ratings.get("match_score") or 0)

    if isinstance(kw, dict) and ("direct_skills" in kw or "contextual" in kw):
        ds = kw.get("direct_skills") or {}
        ctx = kw.get("contextual") or {}
        ds_found  = ds.get("found") or [] if isinstance(ds, dict) else []
        ds_miss   = ds.get("missing") or [] if isinstance(ds, dict) else []
        ctx_found = ctx.get("found") or [] if isinstance(ctx, dict) else []
        ctx_miss  = ctx.get("missing") or [] if isinstance(ctx, dict) else []
        ctx_found_norm: List[dict] = []
        for item in ctx_found:
            if isinstance(item, dict):
                ctx_found_norm.append({"keyword": str(item.get("keyword", "")), "count": int(item.get("count", 1))})
            else:
                ctx_found_norm.append({"keyword": str(item), "count": 1})
        kw_payload = {
            "direct_skills": {"found": ds_found, "missing": ds_miss},
            "contextual": {"found": ctx_found_norm, "missing": ctx_miss},
            "found_count": len(ds_found) + len(ctx_found_norm),
            "total_count": len(ds_found) + len(ds_miss) + len(ctx_found_norm) + len(ctx_miss),
        }
    else:
        found_kw   = kw.get("found") or [] if isinstance(kw, dict) else []
        missing_kw = kw.get("missing") or [] if isinstance(kw, dict) else []
        kw_payload = {
            "direct_skills": {"found": found_kw, "missing": missing_kw},
            "contextual": {"found": [], "missing": []},
            "found_count": len(found_kw),
            "total_count": len(found_kw) + len(missing_kw),
        }

    return {
        "overall_score": overall,
        "match_score": overall,
        "criteria": [],
        "job_title": llm_ratings.get("job_title") or {},
        "qualifications": _category_with_resolved(llm_ratings.get("qualifications")),
        "responsibilities": _category_with_resolved(llm_ratings.get("responsibilities")),
        "keywords": kw_payload,
        "whats_working": llm_ratings.get("whats_working") or [],
        "gaps": llm_ratings.get("gaps") or [],
        "verdict": llm_ratings.get("verdict", ""),
        "strategic_tips": llm_ratings.get("strategic_tips") or [],
        "interview_questions": llm_ratings.get("interview_questions") or [],
    }

