"""LaTeX template resolution and structured output folders."""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from resume_gui.config import LIBRARY_ROOT
from resume_gui.auth.supabase import _load_template_tex_from_supabase
from resume_gui.renderers.latex_renderer import ResumeDocModel
from resume_library import _compute_diff, _explain_changes, _extract_body, _get_resume_tex_for_user, _sanitize_change_rationales, get_resume_tex

logger = logging.getLogger("resume_gui")

def _template_name_for_reference(reference_folder: Optional[str]) -> str:
    rf = (reference_folder or "").strip().lower()
    if rf == "harshibar_template1":
        return "harshibar_resume.tex.j2"
    if rf == "adobe_fullstack":
        return "classic_resume.tex.j2"
    if rf == "maltacv_modern":
        return "classic_resume.tex.j2"
    return "classic_resume.tex.j2"


def _supabase_template_is_jinja(tex_body: Optional[str]) -> bool:
    t = (tex_body or "").strip()
    if not t:
        return False
    return "{{ doc." in t or "{%" in t


def _create_structured_output_folder(base_folder: Optional[str], reference_folder: Optional[str], role: str, company: str) -> Tuple[str, str]:
    ref_name = (reference_folder or "").strip()
    base_name = (base_folder or "").strip()

    # Never chain from prior generated artifacts like *_structured_<id>.
    # Prefer canonical template key from reference_folder.
    source_name = ref_name
    if not source_name and base_name and "_structured_" not in base_name:
        source_name = base_name
    if not source_name:
        rc = f"{role}_{company}".strip("_") or "structured"
        source_name = re.sub(r"[^A-Za-z0-9_.-]+", "", rc) or "structured"

    new_folder = f"{source_name}_structured_{uuid4().hex[:8]}"
    dst = Path(LIBRARY_ROOT) / new_folder
    dst.mkdir(parents=True, exist_ok=True)

    tex_files = [p for p in dst.iterdir() if p.suffix == ".tex"]
    if not tex_files:
        fallback = dst / "resume.tex"
        fallback.write_text("", encoding="utf-8")
        tex_files = [fallback]
    return new_folder, str(tex_files[0])


def _load_tex_from_candidate(folder: str, user_id: Optional[str]) -> Optional[str]:
    name = (folder or "").strip()
    if not name:
        return None
    tex = _get_resume_tex_for_user(name, user_id)
    if tex:
        return tex
    return get_resume_tex(name)


def _resolve_structured_source_folder(base_folder: Optional[str], reference_folder: Optional[str], user_id: Optional[str]) -> Tuple[str, str]:
    _ = user_id  # Structured template resolution is Supabase-driven.
    candidates: List[str] = []
    ref_name = (reference_folder or "").strip()
    base_name = (base_folder or "").strip()
    # Builder sends `reference_folder` as the explicit LaTeX style choice (e.g. Harshibar).
    # `base_folder` is whichever library row backed the last compile (often Adobe_FullStack) — it must
    # not override the user's selected reference style when loading `resume_templates` rows.
    if ref_name:
        candidates.append(ref_name)
    if base_name and "_structured_" not in base_name and base_name not in candidates:
        candidates.append(base_name)
    for fallback in ("Harshibar_Template1", "Adobe_FullStack", "MaltaCV_Modern"):
        if fallback not in candidates:
            candidates.append(fallback)

    for c in candidates:
        # Canonical source: Supabase `resume_templates`.
        tex_from_template = _load_template_tex_from_supabase(c)
        if tex_from_template:
            return c, tex_from_template

    raise RuntimeError(
        "Could not load template TeX from Supabase table `resume_templates` for folders: "
        + ", ".join(candidates)
        + ". Ensure rows exist with {reference_folder, tex_body, active=true}."
    )




def _count_approved_suggestions(accepted_suggestions: Optional[List]) -> int:
    if not isinstance(accepted_suggestions, list):
        return 0
    n = 0
    for item in accepted_suggestions:
        if not isinstance(item, dict):
            continue
        orig = str(item.get("original") or "").strip()
        sugg = str(item.get("suggested") or "").strip()
        if orig or sugg:
            n += 1
    return n


def _rationales_from_accepted_suggestions(accepted_suggestions: Optional[List]) -> List[Dict]:
    """Human-readable change cards from user-approved suggestion rows only."""
    out: List[Dict] = []
    if not isinstance(accepted_suggestions, list):
        return out
    for item in accepted_suggestions:
        if not isinstance(item, dict):
            continue
        orig = str(item.get("original") or "").strip()
        sugg = str(item.get("suggested") or "").strip()
        why = str(item.get("reason") or "").strip() or "Approved from your suggestion cards."
        if orig and sugg and orig != sugg:
            out.append({"type": "rewrote", "previous": orig, "text": sugg, "why": why})
        elif sugg and not orig:
            out.append({"type": "added", "text": sugg, "why": why})
        elif orig and not sugg:
            out.append({"type": "removed", "text": orig, "why": why or "Removed per approved suggestion."})
    return _sanitize_change_rationales(out)


def _structured_tailor_diff_and_rationales(
    *,
    baseline_tex: Optional[str],
    new_tex: str,
    jd: str,
    model: str,
    gemini_client,
    accepted_suggestions: Optional[List],
) -> Tuple[List[Dict], int, int, List[Dict]]:
    """Line diff + change rationales for the Jinja structured PDF path (never JD gap chips)."""
    diff_lines: List[Dict] = []
    adds = removes = 0
    rationales: List[Dict] = []

    old_body = _extract_body(baseline_tex or "") if baseline_tex else ""
    new_body = _extract_body(new_tex or "") if new_tex else ""
    if old_body.strip() and new_body.strip() and old_body.strip() != new_body.strip():
        diff_lines, adds, removes = _compute_diff(old_body, new_body)
        try:
            explained = _explain_changes(gemini_client, model, old_body, new_body, (jd or "")[:1500])
            if explained:
                rationales = _sanitize_change_rationales(explained)
        except Exception as exc:
            logger.warning("structured path: change explanations failed: %s", exc)

    if not rationales:
        rationales = _rationales_from_accepted_suggestions(accepted_suggestions)

    return diff_lines, adds, removes, rationales

