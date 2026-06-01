"""Bullet and role rewrite routes."""
from __future__ import annotations

from resume_gui.routes._shared import *  # noqa: F403

async def api_rewrite_role(request: Request):
    """POST /api/rewrite-role — rewrite a weak role using AI.
    Body: { "header": "Job Title | Company • Dates", "bullets": ["• bullet1", ...] }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    header  = (body.get("header") or "").strip()
    bullets = body.get("bullets") or []
    if not header:
        return JSONResponse({"error": "header required"}, status_code=400)

    bullets_text = "\n".join(bullets) if bullets else "(no bullets provided)"
    prompt = (
        f"You are a professional resume writer. Rewrite the following work experience role "
        f"to be much stronger and more impactful for a tech recruiter.\n\n"
        f"Role: {header}\n"
        f"Current bullets:\n{bullets_text}\n\n"
        f"Instructions:\n"
        f"- Write exactly 3-4 strong bullet points\n"
        f"- Each bullet MUST start with a powerful past-tense action verb "
        f"(e.g., administered, coordinated, authored, negotiated, investigated, engineered, "
        f"programmed, coached, trained, initiated, implemented, monitored, achieved, reduced, spearheaded)\n"
        f"- Each bullet MUST include a quantified result (%, $, time saved, team size, etc.) "
        f"— if the original has no numbers, invent plausible but conservative estimates\n"
        f"- Remove weak verbs (helped, assisted, worked on, was responsible for)\n"
        f"- Remove pronouns (I, my, we)\n"
        f"- Format: return ONLY the bullet points, one per line, each starting with •\n"
        f"- Do not include the role header, just the bullets"
    )

    loop = asyncio.get_event_loop()

    def _call_llm():
        try:
            # Reuse the same LLM routing (Gemini → Grok fallback) as the bullet rewriter
            text = ai_rewrite_bullet("", prompt, "")
            return text.strip() if text else None
        except Exception as exc:
            logger.warning(f"rewrite_role LLM call failed: {exc}")
            return None

    text = await loop.run_in_executor(None, _call_llm)
    if not text:
        return JSONResponse({"error": "LLM unavailable"}, status_code=503)

    # Parse out bullet lines
    rewritten = [l.strip() for l in text.splitlines() if l.strip() and re.match(r"^[•\-–*]", l.strip())]
    if not rewritten:
        rewritten = [l.strip() for l in text.splitlines() if l.strip()]

    return JSONResponse({"bullets": rewritten})

async def api_rewrite_bullet(request: Request):
    """POST /api/rewrite-bullet — score and optionally rewrite a single bullet.

    Reusable endpoint: works standalone from Analyze inline editing, Resume Builder
    suggestions, or any other UI that needs per-bullet AI feedback.

    Request body (JSON):
      bullet      string  — the bullet text to evaluate (required)
      jd          string  — job description for keyword alignment (optional)
      role        string  — target role title for context (optional)
      company     string  — target company name (optional)
      rewrite     bool    — if true, return an improved version; default true

    Response (JSON):
      {
        "original":    string,
        "score":       int (0–100),
        "issues":      string[],
        "improved":    string | null,   // null when rewrite=false
        "explanation": string
      }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    bullet  = (body.get("bullet") or "").strip()
    jd      = (body.get("jd") or "").strip()
    role    = (body.get("role") or "").strip()
    company = (body.get("company") or "").strip()
    want_rewrite = body.get("rewrite", True)

    if not bullet:
        return JSONResponse({"error": "bullet required"}, status_code=400)

    context_parts: list[str] = []
    if role or company:
        context_parts.append(f"Target role: {role} at {company}".strip(" at"))
    if jd:
        context_parts.append(f"Job description (first 1500 chars):\n{jd[:1500]}")
    context_block = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""

    rewrite_instruction = (
        '"improved": "A stronger rewrite using an action verb, quantified where possible, '
        'aligned with JD keywords. Do NOT invent metrics not in the original.",'
        if want_rewrite else
        '"improved": null,'
    )

    prompt = f"""You are an expert resume coach. Evaluate the following resume bullet and return ONLY a JSON object — no markdown, no prose.

BULLET:
{bullet}{context_block}

Return this exact JSON schema:
{{
  "score": <integer 0-100 — overall bullet quality>,
  "issues": ["short issue label", ...],
  "explanation": "One sentence: the single most important weakness.",
  {rewrite_instruction}
}}

Scoring rubric:
- 80-100: Strong action verb, specific outcome/metric, relevant to JD
- 60-79: Good verb, decent specificity, minor improvements possible
- 40-59: Weak verb or vague, duty-focused, no metric
- 0-39: Passive voice, responsibilities-only, no impact shown

Issues labels (use only these): "No metric", "Weak verb", "Passive voice", "Too vague",
"Duty-focused", "Too long", "Missing JD keyword", "Starts with date"

Return ONLY the JSON object."""

    raw = _llm_json_call(prompt)
    if not raw or not isinstance(raw, dict):
        return JSONResponse({"error": "LLM unavailable"}, status_code=503)

    score = max(0, min(100, int(raw.get("score") or 50)))
    issues = [str(i) for i in (raw.get("issues") or []) if str(i).strip()][:6]
    improved = str(raw.get("improved") or "").strip() or None if want_rewrite else None
    explanation = str(raw.get("explanation") or "").strip()

    return JSONResponse({
        "original":    bullet,
        "score":       score,
        "issues":      issues,
        "improved":    improved,
        "explanation": explanation,
    })
