from resume_gui.tailor.gap_fix_prompt import build_suggest_gap_fix_prompt, role_specific_examples
from resume_gui.tailor.gap_fix_schema import SUGGEST_GAP_FIX_SCHEMA


def test_schema_has_suggestions_array():
    assert SUGGEST_GAP_FIX_SCHEMA["required"] == ["suggestions"]
    items = SUGGEST_GAP_FIX_SCHEMA["properties"]["suggestions"]["items"]
    assert "original" in items["required"]
    assert items["properties"]["category"]["enum"]


def test_software_jd_gets_software_examples():
    jd = "Senior Software Engineer Python React AWS Kubernetes"
    examples = role_specific_examples("software")
    prompt = build_suggest_gap_fix_prompt(
        gap_name="Nuxt.js",
        gap_notes="",
        gap_target_terms=["Nuxt.js"],
        eligible_bullets_json='[{"section":"Work Experience","context":"Co","original":"Built Vue apps."}]',
        job_description=jd,
    )
    assert "FastAPI" in examples or "AWS Lambda" in examples
    assert "Preserve every concrete named entity" in prompt
    assert "Nuxt.js" in prompt


def test_legal_jd_role_in_prompt():
    jd = "Litigation paralegal Westlaw Lexis discovery motions"
    prompt = build_suggest_gap_fix_prompt(
        gap_name="CaseWise",
        gap_notes="Bridge research work",
        gap_target_terms=["CaseWise"],
        eligible_bullets_json="[]",
        job_description=jd,
    )
    assert "legal" in prompt
    assert "do not force into unrelated bullets" in prompt.lower() or "honest connection" in prompt.lower()
