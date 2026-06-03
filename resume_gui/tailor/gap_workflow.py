"""Tailor gap workflow: stable IDs, JD-driven verification, addressed-gap rescore merge."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Set

from resume_gui.tailor.requirement_match import verify_gap_in_resume

_GAP_TYPES = frozenset({"qualification", "responsibility", "keyword"})


def stable_gap_id(label: str, gap_type: str = "qualification") -> str:
    """Stable id for a gap label — must match frontend makeStableGapId."""
    gtype = gap_type if gap_type in _GAP_TYPES else "qualification"
    raw = (label or "").strip().lower().replace(".js", " js")
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:80]
    return f"{gtype}:{slug or 'unknown'}"


def contains_skill_evidence(
    resume_text: str,
    skill_label: str,
    *,
    job_description: str = "",
    applied_text: str = "",
    gap_type: str = "qualification",
    requirement_id: str | None = None,
) -> bool:
    """Backward-compatible bool — prefer verify_gap_in_resume for match metadata."""
    match = verify_gap_in_resume(
        resume_text,
        skill_label,
        job_description=job_description,
        applied_text=applied_text,
        gap_type=gap_type,
        requirement_id=requirement_id,
    )
    return match.matched


def parse_addressed_gaps(raw: object) -> List[Dict[str, str]]:
    """Validate addressed_gaps from POST /api/analyze."""
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for item in raw[:24]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("name") or "").strip()[:200]
        if not label:
            continue
        gap_type = str(item.get("type") or "qualification").strip().lower()
        if gap_type not in _GAP_TYPES:
            gap_type = "qualification"
        gap_id = str(item.get("id") or "").strip() or stable_gap_id(label, gap_type)
        applied = str(item.get("appliedText") or item.get("applied_text") or "").strip()[:4000]
        out.append({
            "id": gap_id[:120],
            "label": label,
            "type": gap_type,
            "appliedText": applied,
        })
    return out


def _item_id(item: dict, gap_type: str) -> str:
    existing = str(item.get("id") or "").strip()
    if existing:
        return existing
    text = str(item.get("text") or item.get("keyword") or "").strip()
    return stable_gap_id(text, gap_type) if text else ""


def _labels_match(a: str, b: str) -> bool:
    """Lightweight label match for ratings bucket moves (label drift)."""
    ka = re.sub(r"[^a-z0-9]+", " ", a.lower().replace(".js", " js")).strip()
    kb = re.sub(r"[^a-z0-9]+", " ", b.lower().replace(".js", " js")).strip()
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    ta, tb = set(ka.split()), set(kb.split())
    stop = {"framework", "platform", "skill", "skills", "tool", "tools", "experience"}
    ta -= stop
    tb -= stop
    if not ta or not tb:
        return False
    overlap = len(ta & tb)
    return overlap / min(len(ta), len(tb)) >= 0.75


def _gap_matches_item(gap: Dict[str, str], item: dict, gap_type: str) -> bool:
    gid = gap.get("id") or ""
    iid = _item_id(item, gap_type)
    if gid and iid and gid == iid:
        return True
    label = gap.get("label") or ""
    text = str(item.get("text") or item.get("keyword") or "").strip()
    return bool(label and text and _labels_match(label, text))


def attach_gap_ids(ratings: dict) -> dict:
    """Ensure covered/missing items carry stable ids."""
    if not isinstance(ratings, dict):
        return ratings
    out = dict(ratings)
    for cat_key, gap_type in (("qualifications", "qualification"), ("responsibilities", "responsibility")):
        cat = out.get(cat_key)
        if not isinstance(cat, dict):
            continue
        patched = dict(cat)
        for bucket in ("covered", "missing", "resolved_by_user"):
            items = patched.get(bucket)
            if not isinstance(items, list):
                if bucket == "resolved_by_user":
                    patched[bucket] = []
                continue
            new_items = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                row = dict(item)
                if not row.get("id"):
                    row["id"] = _item_id(row, gap_type)
                new_items.append(row)
            patched[bucket] = new_items
        out[cat_key] = patched
    return out


def _dedupe_items(items: List[dict], gap_type: str) -> List[dict]:
    seen: Set[str] = set()
    out: List[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        iid = _item_id(item, gap_type)
        if iid in seen:
            continue
        seen.add(iid)
        out.append(item)
    return out


def _verification_context(match_method: str, matched_text: str | None) -> str:
    if match_method == "exact":
        return f"Verified in updated résumé (exact: {matched_text or 'match'})"
    if match_method in ("alias", "abbreviation"):
        return f"Verified in updated résumé ({match_method}: {matched_text or 'match'})"
    return "Fix applied — pending full verification"


def _patch_category(
    cat: dict,
    gap_type: str,
    gap: Dict[str, str],
    resume_text: str,
    job_description: str,
    verified: bool,
    match_method: str = "not_found",
    matched_text: str | None = None,
) -> dict:
    patched = dict(cat)
    covered = list(patched.get("covered") or [])
    missing = list(patched.get("missing") or [])
    resolved = list(patched.get("resolved_by_user") or [])

    hit = None
    new_missing = []
    for item in missing:
        if isinstance(item, dict) and _gap_matches_item(gap, item, gap_type):
            hit = dict(item)
            continue
        new_missing.append(item)

    label = gap.get("label") or ""
    if hit is None and label:
        hit = {"text": label, "analysis": "", "id": gap.get("id") or stable_gap_id(label, gap_type)}

    if not hit:
        return patched

    if not hit.get("id"):
        hit["id"] = gap.get("id") or stable_gap_id(hit.get("text", label), gap_type)

    already_covered = any(
        isinstance(c, dict) and _gap_matches_item(gap, c, gap_type) for c in covered
    )
    already_resolved = any(
        isinstance(r, dict) and _gap_matches_item(gap, r, gap_type) for r in resolved
    )

    if verified and not already_covered:
        row = {
            "id": hit["id"],
            "text": hit.get("text") or label,
            "context": _verification_context(match_method, matched_text),
            "locations": 1,
            "status": "verified_covered",
            "verification": "deterministic",
        }
        covered.append(row)
    elif not verified and not already_resolved and not already_covered:
        row = {
            "id": hit["id"],
            "text": hit.get("text") or label,
            "context": "Fix applied — pending verification",
            "analysis": hit.get("analysis") or "",
            "status": "resolved_by_user",
            "verification": "user_applied",
        }
        resolved.append(row)

    patched["covered"] = _dedupe_items(covered, gap_type)
    patched["missing"] = new_missing
    patched["resolved_by_user"] = _dedupe_items(resolved, gap_type)
    return patched


def _patch_keywords(
    kw: dict,
    gap: Dict[str, str],
    verified: bool,
) -> dict:
    if gap.get("type") != "keyword":
        return kw
    patched = dict(kw)
    label = gap.get("label") or ""
    if not label:
        return patched

    had_missing = (
        (kw.get("direct_skills") or {}).get("missing")
        or (kw.get("contextual") or {}).get("missing")
        or kw.get("missing")
    )
    had = False
    if isinstance(kw.get("direct_skills"), dict):
        had = any(_labels_match(str(k), label) for k in (kw["direct_skills"].get("missing") or []))
    if not had and isinstance(kw.get("contextual"), dict):
        had = any(_labels_match(str(k), label) for k in (kw["contextual"].get("missing") or []))
    if not had and isinstance(kw.get("missing"), list):
        had = any(_labels_match(str(k), label) for k in kw["missing"])

    def _bump_found() -> None:
        if had:
            patched["found_count"] = min(
                int(patched.get("total_count") or 0),
                int(patched.get("found_count") or 0) + 1,
            )

    ds = patched.get("direct_skills")
    if isinstance(ds, dict):
        miss = [m for m in (ds.get("missing") or []) if not _labels_match(str(m), label)]
        if len(miss) < len(ds.get("missing") or []):
            found = list(ds.get("found") or [])
            if verified and not any(_labels_match(str(f), label) for f in found):
                found.append(label)
                _bump_found()
            patched["direct_skills"] = {**ds, "missing": miss, "found": found}

    ctx = patched.get("contextual")
    if isinstance(ctx, dict):
        miss = [m for m in (ctx.get("missing") or []) if not _labels_match(str(m), label)]
        if len(miss) < len(ctx.get("missing") or []):
            found = list(ctx.get("found") or [])
            if verified and not any(
                _labels_match(str(f.get("keyword") if isinstance(f, dict) else f), label)
                for f in found
            ):
                found.append({"keyword": label, "count": 1})
                _bump_found()
            patched["contextual"] = {**ctx, "missing": miss, "found": found}

    legacy_miss = patched.get("missing")
    if isinstance(legacy_miss, list):
        miss = [m for m in legacy_miss if not _labels_match(str(m), label)]
        if len(miss) < len(legacy_miss):
            found = list(patched.get("found") or [])
            if verified and not any(_labels_match(str(f), label) for f in found):
                found.append(label)
                _bump_found()
            patched["missing"] = miss
            patched["found"] = found

    return patched


def apply_gap_workflow(
    ratings: dict,
    resume_text: str,
    addressed_gaps: List[Dict[str, str]],
    *,
    job_description: str = "",
) -> dict:
    """
    Merge user-addressed gaps after LLM rescore using JD-driven deterministic matching.

    - Layer 1–3: phrase / alias / abbreviation match against résumé + applied text
    - verified → covered; otherwise → resolved_by_user
    """
    if not isinstance(ratings, dict):
        return ratings
    out = attach_gap_ids(ratings)
    if not addressed_gaps:
        return out

    search_base = (resume_text or "").strip()
    jd = (job_description or "").strip()

    for gap in addressed_gaps:
        applied = gap.get("appliedText") or ""
        label = gap.get("label") or ""
        gtype = gap.get("type") or "qualification"
        match = verify_gap_in_resume(
            search_base,
            label,
            job_description=jd,
            applied_text=applied,
            gap_type=gtype,
            requirement_id=gap.get("id"),
        )
        verified = match.matched

        if gtype == "qualification" and isinstance(out.get("qualifications"), dict):
            out["qualifications"] = _patch_category(
                out["qualifications"],
                "qualification",
                gap,
                search_base,
                jd,
                verified,
                match.method,
                match.matched_text,
            )
        elif gtype == "responsibility" and isinstance(out.get("responsibilities"), dict):
            out["responsibilities"] = _patch_category(
                out["responsibilities"],
                "responsibility",
                gap,
                search_base,
                jd,
                verified,
                match.method,
                match.matched_text,
            )
        if isinstance(out.get("keywords"), dict):
            out["keywords"] = _patch_keywords(out["keywords"], gap, verified)

    return out
