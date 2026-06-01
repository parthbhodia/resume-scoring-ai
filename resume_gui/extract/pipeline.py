"""LLM extract orchestration and structured-doc finalize pass."""
from __future__ import annotations

import logging
from typing import Any, Optional

from resume_gui.doc_utils import _clean_model_text
from resume_gui.extract.doc_normalize import (
    _normalize_structured_contact, _normalize_structured_education,
    _normalize_structured_experience, _normalize_structured_skills,
)
from resume_gui.extract.education import _split_collapsed_education_entries
from resume_gui.extract.profile import _preserve_structured_sections_from_profile, _resume_doc_from_profile_text
from resume_gui.extract.structured_doc import (
    _build_resume_doc_from_llm_raw, _doc_extraction_counts,
    _resume_doc_from_parsed, _resume_doc_to_dict,
)
from resume_gui.extract.vision import _llm_extract_pdf_vision
from resume_gui.llm.client import _analysis_model, _gemini_reasoning_model, _grok_reasoning_model, _llm_json_call
from resume_gui.renderers.latex_renderer import ResumeDocModel
from resume_library import grok_preferred_for_throughput, parse_resume_tex
from resume_gui.resume_extraction import (
    DEFAULT_SECTION_ORDER, ExtractionManifest, ProfileSectionInventory,
    filter_education_grounded_in_source, inventory_to_dict, log_extraction_debug,
    manifest_to_dict, validate_extraction_against_inventory, validate_manifest_against_doc,
    faithful_extract_prompt, pop_manifest_from_llm_raw, profile_section_inventory,
    inject_section_line_breaks, infer_section_order_from_profile, tailor_doc_prompt,
)

logger = logging.getLogger("resume_gui")

def _log_structured_doc(stage: str, doc: "ResumeDocModel", **extra: Any) -> None:
    payload: dict = {"counts": _doc_extraction_counts(doc), "structured_doc": _resume_doc_to_dict(doc)}
    if extra:
        payload["meta"] = extra
    log_extraction_debug(stage, payload)


def _llm_tailor_doc_for_jd(
    doc: ResumeDocModel,
    jd: str,
    role: str,
    company: str,
) -> ResumeDocModel:
    """Second pass: JD-tailor summary, experience bullets, and project bullets (structure unchanged)."""
    jd_snippet = (jd or "")[:3000].strip()
    if not jd_snippet:
        return doc
    if not doc.experience and not doc.projects and not (doc.summary or "").strip():
        return doc
    before_counts = _doc_extraction_counts(doc)
    prompt = tailor_doc_prompt(doc, jd_snippet, role, company)
    try:
        raw = _llm_json_call(prompt)
        if not raw or not isinstance(raw, dict):
            log_extraction_debug(
                "jd_tailor_skipped",
                {"reason": "empty_llm_response", "before": before_counts},
            )
            return doc
        log_extraction_debug(
            "jd_tailor_llm_response",
            {
                "keys": list(raw.keys()),
                "summary_preview": (_clean_model_text(str(raw.get("summary") or "")) or "")[:400],
                "experience_patches": len(raw.get("experience") or [])
                if isinstance(raw.get("experience"), list)
                else 0,
            },
        )
        summary = _clean_model_text(str(raw.get("summary") or ""))
        if summary:
            doc.summary = summary
        exp_in = raw.get("experience")
        if isinstance(exp_in, list) and len(exp_in) == len(doc.experience):
            for i, patch in enumerate(exp_in):
                if not isinstance(patch, dict):
                    continue
                bullets = [
                    _clean_model_text(str(b))
                    for b in (patch.get("bullets") or [])
                    if _clean_model_text(str(b))
                ]
                if bullets:
                    doc.experience[i].bullets = bullets
        proj_in = raw.get("projects")
        if isinstance(proj_in, list) and doc.projects and len(proj_in) == len(doc.projects):
            for i, patch in enumerate(proj_in):
                if not isinstance(patch, dict):
                    continue
                bullets = [
                    _clean_model_text(str(b))
                    for b in (patch.get("bullets") or [])
                    if _clean_model_text(str(b))
                ]
                if bullets:
                    doc.projects[i].bullets = bullets
        _log_structured_doc(
            "jd_tailor_after",
            doc,
            before=before_counts,
            after=_doc_extraction_counts(doc),
        )
        return doc
    except Exception as exc:
        logger.warning("LLM tailor-doc second pass failed: %s", exc)
        return doc


def _structured_doc_for_generate(
    candidate_profile: Optional[str],
    jd: str,
    role: str,
    company: str,
    *,
    use_conservative_tailor: bool,
    base_tex: Optional[str] = None,
    pre_parsed: Optional[dict] = None,
) -> ResumeDocModel:
    """Faithful extract first, optional JD tailor second, then profile backfill + section order."""
    profile_norm = inject_section_line_breaks((candidate_profile or "")[:8000])
    inv = profile_section_inventory(profile_norm)
    section_order = infer_section_order_from_profile(profile_norm)

    log_extraction_debug(
        "generate_pipeline_start",
        {
            "inventory": inventory_to_dict(inv),
            "section_order_inferred": section_order,
            "profile_chars": len(profile_norm),
            "profile_preview": profile_norm[:2000],
            "use_conservative_tailor": use_conservative_tailor,
            "has_base_tex": bool(base_tex),
            "jd_chars": len((jd or "").strip()),
            "role": role,
            "company": company,
            "has_pre_parsed": bool(pre_parsed),
        },
    )

    doc: Optional[ResumeDocModel] = None
    manifest: Optional[ExtractionManifest] = None
    extract_path = "unknown"

    # Use the structured JSON produced at upload time to skip redundant LLM re-extraction.
    # Only applies on the non-conservative path (conservative paths rely on base_tex/profile text
    # for intentional minimal-diff behaviour).
    if pre_parsed and isinstance(pre_parsed, dict) and not use_conservative_tailor and not base_tex:
        try:
            doc = _build_resume_doc_from_llm_raw(pre_parsed)
            if doc and (doc.experience or doc.education or doc.summary):
                extract_path = "pre_parsed_upload_json"
                if jd.strip():
                    extract_path = "pre_parsed_upload_json_then_jd_tailor"
                    doc = _llm_tailor_doc_for_jd(doc, jd, role, company)
            else:
                logger.warning("pre_parsed upload JSON yielded empty doc — falling through to LLM extract")
                doc = None
        except Exception as exc:
            logger.warning("pre_parsed upload JSON parse failed (%s) — falling through to LLM extract", exc)
            doc = None

    if doc is not None:
        pass  # pre_parsed path succeeded — skip remaining extraction branches
    elif use_conservative_tailor and base_tex:
        extract_path = "conservative_tex"
        parsed = parse_resume_tex(base_tex)
        doc = _resume_doc_from_parsed(parsed)
    elif use_conservative_tailor and profile_norm:
        extract_path = "conservative_profile_regex"
        doc = _resume_doc_from_profile_text(profile_norm, role, company)
    elif profile_norm:
        extract_path = "faithful_llm"
        doc, manifest = _llm_extract_with_manifest(profile_norm)
        if doc is None:
            extract_path = "faithful_llm_failed_regex_fallback"
            logger.warning("Faithful LLM extract failed — falling back to regex profile parse")
            doc = _resume_doc_from_profile_text(profile_norm, role, company)
        elif jd.strip() and not use_conservative_tailor:
            extract_path = "faithful_llm_then_jd_tailor"
            doc = _llm_tailor_doc_for_jd(doc, jd, role, company)

    if doc is None and profile_norm:
        extract_path = "regex_fallback"
        doc = _resume_doc_from_profile_text(profile_norm, role, company)
    if doc is None and base_tex:
        extract_path = "tex_fallback"
        parsed = parse_resume_tex(base_tex)
        doc = _resume_doc_from_parsed(parsed)
    if doc is None:
        extract_path = "empty_profile_default"
        doc = _resume_doc_from_profile_text(profile_norm or "", role, company)

    _finalize_structured_doc(doc, profile_norm, inv, manifest, role, company)
    doc.section_order = section_order or list(DEFAULT_SECTION_ORDER)
    _log_structured_doc(
        "generate_pipeline_final_json",
        doc,
        extract_path=extract_path,
        manifest=manifest_to_dict(manifest),
    )
    return doc


def _llm_extract_with_manifest(text: str) -> tuple[Optional[ResumeDocModel], Optional[ExtractionManifest]]:
    """Faithful structured extract; returns (doc, manifest) for validation/backfill."""
    profile_norm = inject_section_line_breaks((text or "")[:8000])
    profile_snippet = profile_norm[:6000].strip()
    if not profile_snippet:
        return None, None

    inv = profile_section_inventory(profile_norm)
    log_extraction_debug(
        "faithful_extract_input",
        {
            "inventory": inventory_to_dict(inv),
            "profile_snippet_chars": len(profile_snippet),
            "profile_snippet": profile_snippet,
        },
    )
    prompt = faithful_extract_prompt(profile_snippet, inv)

    try:
        # Structured extraction is where accuracy matters most — the parsed
        # ResumeDocModel feeds both the analysis and the rendered preview. A
        # bad split here (3 schools collapsed into 1) cascades through both.
        # Route this single call to the reasoning tier (grok-4-fast-reasoning
        # / gemini-2.5-pro). Real cost: ~8s of extra latency on Analyze, ~1.6×
        # the cost of that single call. Empirically improves date extraction
        # (0/3 → 2/3 runs) and reduces miss rates on the entry-split task.
        # Other calls (analyze prompt, gap-fix, suggestions) stay on the fast
        # non-reasoning model.
        if grok_preferred_for_throughput():
            extract_model = _grok_reasoning_model()
        else:
            extract_model = _gemini_reasoning_model()
        raw = _llm_json_call(prompt, model_override=extract_model)
        if not raw or not isinstance(raw, dict):
            log_extraction_debug("faithful_extract_failed", {"reason": "empty_or_non_dict_llm_response"})
            return None, None
        body, manifest = pop_manifest_from_llm_raw(raw)
        log_extraction_debug(
            "faithful_extract_llm_raw",
            {
                "manifest": manifest_to_dict(manifest),
                "body_keys": list(body.keys()) if isinstance(body, dict) else [],
                "llm_top_level_keys": list(raw.keys()),
            },
        )
        doc = _build_resume_doc_from_llm_raw(body)
        if doc is not None:
            _log_structured_doc("faithful_extract_parsed_doc", doc, manifest=manifest_to_dict(manifest))
        return doc, manifest
    except Exception as exc:
        logger.warning("LLM faithful extract failed: %s", exc)
        log_extraction_debug("faithful_extract_failed", {"reason": str(exc)})
        return None, None


def _finalize_structured_doc(
    doc: ResumeDocModel,
    profile_norm: str,
    inv: ProfileSectionInventory,
    manifest: Optional[ExtractionManifest],
    role: str,
    company: str,
) -> None:
    """Manifest + inventory checks, then regex profile backfill for any dropped sections."""
    before = _doc_extraction_counts(doc)
    warnings: list[str] = []
    for w in validate_extraction_against_inventory(doc, inv):
        logger.warning("Structured extract completeness: %s", w)
        warnings.append(w)
    for w in validate_manifest_against_doc(doc, manifest):
        logger.warning("Structured extract manifest mismatch: %s", w)
        warnings.append(w)
    for w in filter_education_grounded_in_source(doc, profile_norm):
        logger.warning("Structured extract education grounding: %s", w)
        warnings.append(w)
    _preserve_structured_sections_from_profile(doc, profile_norm, inv, role, company)
    # Split collapsed-into-one education entries BEFORE the per-entry normalizer
    # so the date/degree swap heuristics in _normalize_structured_education see
    # each institution as its own entry.
    _split_collapsed_education_entries(doc)
    _normalize_structured_experience(doc)
    _normalize_structured_education(doc)
    _normalize_structured_skills(doc)
    _normalize_structured_contact(doc)
    after = _doc_extraction_counts(doc)
    log_extraction_debug(
        "finalize_structured_doc",
        {
            "before_counts": before,
            "after_counts": after,
            "validation_warnings": warnings,
            "manifest": manifest_to_dict(manifest),
        },
    )






def _llm_extract(text: str, pdf_bytes: Optional[bytes] = None) -> "Optional[ResumeDocModel]":
    """Extract structured resume data faithfully — no tailoring or bullet rewriting.

    Used by the Analyze path so the structured model mirrors what the user actually wrote.
    Returns None on failure.

    When ``pdf_bytes`` is provided, tries the vision-based PDF extract first
    (cleaner on multi-column layouts) and falls back to the text-based
    reasoning extract on any failure.
    """
    profile_norm = inject_section_line_breaks((text or "")[:8000])
    profile_snippet = profile_norm[:6000].strip()
    if not profile_snippet and not pdf_bytes:
        return None

    # ── Vision-first for PDF uploads ──────────────────────────────────────
    vision_doc = _llm_extract_pdf_vision(pdf_bytes) if pdf_bytes else None
    if vision_doc is not None:
        # Vision output is already clean — skip the manifest/inventory backfill
        # and the entry-splitter post-processors (which were built for the
        # text-extract failure modes). Keep the lightweight normalizers as a
        # safety net.
        _normalize_structured_experience(vision_doc)
        _normalize_structured_education(vision_doc)
        _normalize_structured_skills(vision_doc)
        _normalize_structured_contact(vision_doc)
        vision_doc.section_order = infer_section_order_from_profile(profile_norm or "")
        _log_structured_doc("analyze_extract_final_json_vision", vision_doc)
        return vision_doc

    # ── Fallback: text-based reasoning extract ────────────────────────────
    doc, manifest = _llm_extract_with_manifest(text)
    if doc is None:
        return None
    inv = profile_section_inventory(profile_norm)
    log_extraction_debug(
        "analyze_extract_input",
        {"inventory": inventory_to_dict(inv), "profile_chars": len(profile_norm)},
    )
    _finalize_structured_doc(doc, profile_norm, inv, manifest, "", "")
    doc.section_order = infer_section_order_from_profile(profile_norm)
    _log_structured_doc("analyze_extract_final_json", doc)
    return doc
