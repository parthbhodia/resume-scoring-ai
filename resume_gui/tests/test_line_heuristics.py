"""Gap-fix line eligibility — project headers must not be rewritten as bullets."""
from resume_gui.extract.line_heuristics import is_gap_fix_eligible_line


def test_project_title_line_not_eligible():
    assert not is_gap_fix_eligible_line("Nutri AI Scan | Vue Js, REST API, Mongo DB")


def test_achievement_bullet_eligible():
    line = (
        "Built and maintained scalable frontend UIs in Vue.js for federal platforms "
        "(Project Spectrum), leveraging HTMX for real-time UI without full reloads."
    )
    assert is_gap_fix_eligible_line(line)


def test_explicit_bullet_marker_eligible():
    assert is_gap_fix_eligible_line("• Led migration of Vue.js apps to Nuxt.js for SSR.")
