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
    _log_user_id: Optional[str] = None,
    _log_email: Optional[str] = None,
    _log_tool: Optional[str] = None,
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
    selected_model = (model_override or primary_llm_model_for_resume_workloads()).strip()
    _usage: dict = {}  # filled by whichever inner fn succeeds first

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
            result = json.loads(text)
            if not _usage and r.usage:
                _usage.update({
                    "model": model,
                    "prompt_tokens": getattr(r.usage, "prompt_tokens", None),
                    "completion_tokens": getattr(r.usage, "completion_tokens", None),
                })
            return result
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
            model = (model_name or primary_gemini_flash_model()).strip()
            r = client.models.generate_content(model=model, contents=prompt, config=cfg)
            text = (r.text or "").strip()
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            result = json.loads(text)
            if not _usage:
                meta = getattr(r, "usage_metadata", None)
                if meta:
                    _usage.update({
                        "model": model,
                        "prompt_tokens": getattr(meta, "prompt_token_count", None),
                        "completion_tokens": getattr(meta, "candidates_token_count", None),
                    })
            return result
        except Exception as exc:
            logger.warning(f"Gemini analysis failed: {exc}")
        return None

    def _maybe_log(out: Optional[dict]) -> Optional[dict]:
        if out is not None and _log_tool and _usage:
            try:
                from resume_gui.services.usage import log_usage_event
                log_usage_event(
                    user_id=_log_user_id,
                    user_email=_log_email,
                    tool_name=_log_tool,
                    model_used=_usage.get("model"),
                    prompt_tokens=_usage.get("prompt_tokens"),
                    completion_tokens=_usage.get("completion_tokens"),
                )
            except Exception:
                pass
        return out

    if _is_grok_model(selected_model):
        out = _grok_json(selected_model)
        if out is not None:
            return _maybe_log(out)
        if model_override:
            out = _gemini_json(_gemini_reasoning_model())
            if out is not None:
                return _maybe_log(out)
        return _maybe_log(_gemini_json(primary_gemini_flash_model()))
    out = _gemini_json(selected_model)
    if out is not None:
        return _maybe_log(out)
    if model_override:
        out = _grok_json(_grok_reasoning_model())
        if out is not None:
            return _maybe_log(out)
    return _maybe_log(_grok_json(os.environ.get("GROK_MODEL", "grok-4-1-fast-non-reasoning")))
