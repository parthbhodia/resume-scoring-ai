"""Schema-enforced JSON call for suggest-gap-fix."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, Optional

from resume_gui.llm.client import _analysis_model, _gemini_reasoning_model, _grok_reasoning_model
from resume_gui.tailor.gap_fix_schema import SUGGEST_GAP_FIX_SCHEMA
from resume_library import grok_preferred_for_throughput, primary_gemini_flash_model, primary_llm_model_for_resume_workloads

logger = logging.getLogger("resume_gui")


def _strip_json_fences(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^```[a-z]*\n?", "", text)
    return re.sub(r"\n?```$", "", text).strip()


def _grok_schema_json(prompt: str, schema: dict, *, model: str) -> Optional[dict]:
    xai_key = (os.environ.get("XAI_API_KEY") or "").strip()
    if not xai_key:
        return None
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=xai_key, base_url="https://api.x.ai/v1")
        r = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "suggest_gap_fix",
                    "strict": True,
                    "schema": schema,
                },
            },
        )
        text = _strip_json_fences(r.choices[0].message.content or "")
        return json.loads(text) if text else None
    except Exception as exc:
        logger.warning("Grok schema gap-fix failed (%s): %s", model, exc)
        return None


def _grok_json_object(prompt: str, *, model: str) -> Optional[dict]:
    xai_key = (os.environ.get("XAI_API_KEY") or "").strip()
    if not xai_key:
        return None
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=xai_key, base_url="https://api.x.ai/v1")
        r = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        text = _strip_json_fences(r.choices[0].message.content or "")
        return json.loads(text) if text else None
    except Exception as exc:
        logger.warning("Grok json_object gap-fix failed (%s): %s", model, exc)
        return None


def _gemini_schema_json(prompt: str, schema: dict, *, model: str) -> Optional[dict]:
    google_key = (os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()
    if not google_key:
        return None
    try:
        from google import genai as _genai  # type: ignore
        from google.genai import types as _gtypes  # type: ignore

        client = _genai.Client(api_key=google_key)
        cfg = _gtypes.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=schema,
        )
        r = client.models.generate_content(model=model, contents=prompt, config=cfg)
        text = _strip_json_fences(r.text or "")
        return json.loads(text) if text else None
    except Exception as exc:
        logger.warning("Gemini schema gap-fix failed (%s): %s", model, exc)
        return None


def call_suggest_gap_fix_llm(prompt: str) -> Optional[Dict[str, Any]]:
    """
    Return parsed {suggestions: [...]} using provider JSON schema when available.
    Falls back to json_object mode, then None.
    """
    schema = SUGGEST_GAP_FIX_SCHEMA
    grok_model = (os.environ.get("GROK_MODEL") or primary_llm_model_for_resume_workloads()).strip()
    gemini_model = primary_gemini_flash_model()

    if grok_preferred_for_throughput():
        for model in (grok_model, _analysis_model(), _grok_reasoning_model()):
            out = _grok_schema_json(prompt, schema, model=model)
            if out is not None:
                return out
        for model in (grok_model, _analysis_model()):
            out = _grok_json_object(prompt, model=model)
            if out is not None:
                return out
        for model in (_gemini_reasoning_model(), gemini_model):
            out = _gemini_schema_json(prompt, schema, model=model)
            if out is not None:
                return out
        return None

    for model in (gemini_model, _gemini_reasoning_model()):
        out = _gemini_schema_json(prompt, schema, model=model)
        if out is not None:
            return out
    for model in (grok_model, _grok_reasoning_model()):
        out = _grok_schema_json(prompt, schema, model=model)
        if out is not None:
            return out
    return _grok_json_object(prompt, model=grok_model)
