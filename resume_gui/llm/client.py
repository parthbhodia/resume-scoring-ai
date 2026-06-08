"""JSON LLM calls with Grok/Gemini fallback chain."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

from resume_library import grok_preferred_for_throughput, primary_gemini_flash_model, primary_llm_model_for_resume_workloads

logger = logging.getLogger("resume_gui")

def _grok_reasoning_model() -> str:
    """Reasoning-tier Grok for tasks where structural accuracy matters more
    than latency (e.g. structured résumé extraction). Override via env."""
    return (os.environ.get("GROK_REASONING_MODEL") or "grok-4-fast-reasoning").strip()


def _gemini_reasoning_model() -> str:
    """Reasoning-tier Gemini fallback."""
    return (os.environ.get("GEMINI_REASONING_MODEL") or "gemini-2.5-pro").strip()


def _analysis_model() -> str:
    """Model for the main résumé-analysis prompt (the one that produces
    bulletAnalysis with issue tags + improvedBullet and topIssues +
    categoryScores). Defaults to the full grok-4 reasoning tier — same model
    we use for vision-extract — because the analysis is where dishonest tags
    and weak rewrites cost the user most. Latency hit (~8-10s) is worth the
    quality gain. Override via env: ANALYSIS_MODEL=grok-4-fast-reasoning for
    a cheaper/faster middle ground, or =grok-4-fast-non-reasoning to revert."""
    return (os.environ.get("ANALYSIS_MODEL") or "grok-4").strip()


def _llm_json_call(
    prompt: str,
    *,
    model_override: Optional[str] = None,
    temperature: float = 0.2,
    schema: Optional[dict] = None,
) -> Optional[dict]:
    """Call Grok (primary when configured) or Gemini for a JSON response.

    Pass ``model_override`` to force a specific model (e.g. the reasoning tier
    for structured extraction). When set, we use the override for the matching
    provider and fall back to the other provider's default if the override
    fails. Without override, behavior is unchanged from before.

    Pass ``schema`` (a json_schema dict with ``name`` + ``schema`` keys) to
    switch the Grok call from ``json_object`` to ``json_schema`` mode. This
    removes the need for a verbose JSON block in the prompt — the model is
    constrained to match the shape at the API level instead.
    """
    import time
    selected_model = (model_override or primary_llm_model_for_resume_workloads()).strip()

    def _is_grok_model(model_name: str) -> bool:
        return (model_name or "").strip().lower().startswith("grok")

    def _grok_json(model_name: Optional[str] = None) -> Optional[dict]:
        xai_key = os.environ.get("XAI_API_KEY")
        if not xai_key:
            return None
        try:
            from openai import OpenAI  # type: ignore
            model = (model_name or os.environ.get("GROK_MODEL", "grok-4-1-fast-non-reasoning")).strip()
            xai = OpenAI(api_key=xai_key, base_url="https://api.x.ai/v1")
            response_format: dict = (
                {"type": "json_schema", "json_schema": schema}
                if schema is not None
                else {"type": "json_object"}
            )
            r = xai.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                response_format=response_format,
            )
            text = (r.choices[0].message.content or "").strip()
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            return json.loads(text)
        except Exception as exc:
            logger.warning(f"Grok analysis failed: {exc}")
        return None

    def _gemini_json(model_name: Optional[str] = None) -> Optional[dict]:
        google_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        if not google_key:
            return None
        try:
            from google import genai as _genai  # type: ignore
            from google.genai import types as _gtypes  # type: ignore
            client = _genai.Client(api_key=google_key)
            cfg = _gtypes.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=temperature,
            )
            r = client.models.generate_content(
                model=(model_name or primary_gemini_flash_model()).strip(),
                contents=prompt,
                config=cfg,
            )
            text = (r.text or "").strip()
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            return json.loads(text)
        except Exception as exc:
            logger.warning(f"Gemini analysis failed: {exc}")
        return None

    if _is_grok_model(selected_model):
        out = _grok_json(selected_model)
        if out is not None:
            return out
        # Cross-provider fallback. When we were forced onto a reasoning tier
        # and it failed, try the reasoning-tier Gemini equivalent before the
        # default flash model.
        if model_override:
            out = _gemini_json(_gemini_reasoning_model())
            if out is not None:
                return out
        return _gemini_json(primary_gemini_flash_model())
    out = _gemini_json(selected_model)
    if out is not None:
        return out
    if model_override:
        out = _grok_json(_grok_reasoning_model())
        if out is not None:
            return out
    return _grok_json(os.environ.get("GROK_MODEL", "grok-4-1-fast-non-reasoning"))
