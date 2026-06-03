from resume_gui.tailor.gap_fix_terms import (
    extract_gap_target_terms,
    min_terms_required_for_gap,
    rewrite_includes_gap_terms,
)


def test_extract_product_names_from_gap_label():
    label = "Specific products CaseWise, Brief, TortEquity, Dockit"
    terms = extract_gap_target_terms(label, "")
    assert "CaseWise" in terms
    assert "TortEquity" in terms
    assert "Dockit" in terms
    assert "Brief" in terms


def test_rewrite_must_include_named_products():
    terms = extract_gap_target_terms("Specific products CaseWise, Brief, TortEquity, Dockit")
    weak = (
        "Delivering AI-native workflows similar to litigation case-management tools."
    )
    strong = (
        "Patterns applicable to CaseWise and Brief litigation workflows, "
        "and TortEquity-style document automation."
    )
    assert not rewrite_includes_gap_terms(weak, terms)
    assert rewrite_includes_gap_terms(strong, terms)


def test_min_terms_for_multi_product_gap():
    terms = ["CaseWise", "Brief", "TortEquity", "Dockit"]
    assert min_terms_required_for_gap(terms) == 1
