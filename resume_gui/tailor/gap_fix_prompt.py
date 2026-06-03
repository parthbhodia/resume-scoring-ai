"""Role-neutral prompt builder for suggest-gap-fix."""
from __future__ import annotations

from resume_gui.tailor.requirement_match.role_family import classify_role_family

_GENERAL_EXAMPLES = """\
Example — preserve entities, add JD phrase:
ORIGINAL: "Managed intake scheduling and documentation for 40+ clients per week."
GAP: "Electronic health record documentation"
GOOD: "Managed intake scheduling and EHR documentation for 40+ clients per week."
BAD: "Managed client scheduling and records." (lost concrete scope)

Example — skip when no honest bridge:
ORIGINAL: "Designed onboarding flow with progress bars for new users."
GAP: "Commercial electrical code compliance"
SKIP — no truthful connection; return fewer suggestions.
"""

_SOFTWARE_EXAMPLES = """\
Example — software:
ORIGINAL: "Built FastAPI on AWS Lambda ingesting Kafka events into PostgreSQL."
GAP: "real-time data pipelines"
GOOD: adds "real-time data pipeline" while keeping FastAPI, AWS Lambda, Kafka, PostgreSQL.
BAD: "Built a real-time pipeline on AWS." (dropped named tools)

Example — named products (honest bridge only):
ORIGINAL: "Developed an LLM chatbot via Amazon Bedrock for federal platforms."
GAP: "CaseWise, TortEquity litigation tools"
GOOD: adds "patterns applicable to CaseWise/TortEquity-style workflows" on that bullet only.
BAD: vague "similar litigation tools" without naming JD products.
"""

_LEGAL_EXAMPLES = """\
Example — legal:
ORIGINAL: "Drafted motions and managed discovery calendars for civil litigation matters."
GAP: "Westlaw and Lexis research"
GOOD: adds "Westlaw/Lexis-backed research" while keeping original duties.
"""

_TRADES_EXAMPLES = """\
Example — skilled trades:
ORIGINAL: "Installed and tested 200+ residential circuits per NEC standards."
GAP: "conduit bending and panel upgrades"
GOOD: adds "conduit bending" and "panel upgrades" while keeping NEC and scope.
"""

_HEALTHCARE_EXAMPLES = """\
Example — healthcare:
ORIGINAL: "Administered medications and monitored vitals for 12-bed med-surg unit."
GAP: "Epic charting"
GOOD: adds "Epic charting" alongside existing duties; does not invent licenses.
"""


def role_specific_examples(role_family: str) -> str:
    if role_family == "software":
        return _SOFTWARE_EXAMPLES
    if role_family == "legal":
        return _LEGAL_EXAMPLES
    if role_family == "skilled_trades":
        return _TRADES_EXAMPLES
    if role_family == "healthcare":
        return _HEALTHCARE_EXAMPLES
    return _GENERAL_EXAMPLES


def build_suggest_gap_fix_prompt(
    *,
    gap_name: str,
    gap_notes: str,
    gap_target_terms: list[str],
    eligible_bullets_json: str,
    job_description: str,
) -> str:
    role_family = classify_role_family(job_description)
    examples = role_specific_examples(role_family)

    notes_block = f"Gap notes: {gap_notes}\n" if gap_notes else ""
    terms_block = ""
    if gap_target_terms:
        terms_block = (
            "JD target terms (use only on bullets with an honest connection; "
            "at least one exact term per such rewrite; do not force into unrelated bullets):\n"
            + ", ".join(gap_target_terms)
            + "\n\n"
        )

    return f"""\
SYSTEM:
You are a résumé rewrite assistant. You only rewrite existing bullet bodies from ELIGIBLE BULLETS.
You never invent employers, dates, credentials, tools, licenses, metrics, or hands-on experience.

INPUTS:
Gap: {gap_name}
{notes_block}{terms_block}Role context: {role_family}
Eligible bullets (JSON — rewrite ONLY the `original` field; never rewrite `context` headers):
{eligible_bullets_json}

Job description (excerpt):
{job_description[:2000]}

TASK:
Choose 0–3 eligible bullets with an honest, transferable connection to the gap.
Rewrite each to improve alignment with the job description.

RULES:
1. `original` must exactly match one eligible bullet `original` field.
2. Preserve every concrete named entity from the original, including tools, platforms, licenses,
   certifications, laws/regulations, methods, software, equipment, domain terms, product names,
   organizations, and measurable numbers. Do not replace specifics with generic words.
3. Do not invent facts. Add JD vocabulary only when truthful.
4. Default: suggested rewrite must not be shorter than the original (word count).
   Exception: category "remove_filler" may shorten only if every named entity, number, credential,
   tool, method, and responsibility from the original remains.
5. Skip bullets with no honest bridge — return an empty suggestions array if none qualify.
6. One bullet in → one bullet out (no splitting).

{examples}

Output must conform to the enforced JSON schema (suggestions array, max 3 items).
Schema categories: add_keywords, relevance, quantification, readability, action_verbs,
languageQuality, remove_filler. Priority: high, medium, low.
"""


def gap_fix_schema_for_provider() -> dict:
    """Return schema dict passed to Grok/Gemini structured-output APIs."""
    return SUGGEST_GAP_FIX_SCHEMA
