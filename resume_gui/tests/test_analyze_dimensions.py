"""Per-dimension regression tests for the Analyze pipeline.

Covers each `categoryScores` dimension plus the cross-cutting validators
(rewrite filter, evidence validator, ATS-warning non-issue filter,
calibration v2, synthesizer, helpers). All tests run against pure-Python
helpers — no LLM calls — so they're deterministic and CI-safe.

Run with:  pytest resume_gui/tests/test_analyze_dimensions.py -v
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow `import resume_gui.app` from a fresh checkout without env config.
os.environ.setdefault("XAI_API_KEY", "test")
os.environ.setdefault("GOOGLE_API_KEY", "test")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402

from resume_gui.app import (  # noqa: E402
    _CATEGORY_SCORE_KEYS,
    _bullet_leads_with_strong_ownership_verb,
    _filter_bullet_rewrites,
    _is_participial_noun_phrase_lead,
    _normalize_analysis,
    _normalize_bullet_categories,
    _resume_numeral_count,
    _resume_strong_verb_share,
    _split_collapsed_education_entries,
    _stitch_wrapped_bullets,
    _strip_bracket_placeholders_from_prose,
    _strip_non_issue_ats_warnings,
    _synthesize_text_from_resume_doc,
    _validate_analysis_against_resume,
    _validate_rewrite_against_original,
    _vision_raw_to_resume_doc,
)
from resume_gui.renderers.latex_renderer import (  # noqa: E402
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ResumeDocModel,
)


# ──────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ──────────────────────────────────────────────────────────────────────────────


def _all_cats() -> tuple[str, ...]:
    return (
        "readability",
        "atsCompatibility",
        "achievementQuality",
        "quantification",
        "sectionStructure",
        "languageQuality",
        "technicalBranding",
    )


def _category_scores(default: int = 65, **overrides) -> dict:
    cs: dict = {k: default for k in _all_cats()}
    cs["jobMatch"] = None
    cs.update(overrides)
    return cs


STRONG_RESUME = (
    "• Architected payment platform on AWS Lambda + PostgreSQL handling 9,000+ TPS\n"
    "• Built ML pipeline with XGBoost cutting fraud loss 70% across 50,000+ users\n"
    "• Delivered FastAPI gateway with sub-50ms p99 latency over 3 services\n"
    "• Engineered Kafka ingestion handling 1,000+ events/sec on 5 nodes\n"
    "• Reduced cold-start time from 800ms to 180ms (4× speedup)\n"
    "• Designed multi-region DR with RPO < 30s across 2 AWS regions\n"
    "• Implemented CI/CD pipeline cutting deploy time 65%"
)

WEAK_RESUME = (
    "• helped with various tasks around the office\n"
    "• assisted senior staff on projects\n"
    "• worked on assignments as needed\n"
    "• maintained files and records\n"
    "• was responsible for various duties\n"
    "• participated in team meetings"
)


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 1 — Quantification
# ══════════════════════════════════════════════════════════════════════════════


class TestQuantificationDimension:
    """Bullets with %, $, scale, time-saved, count metrics."""

    def test_strong_resume_floors_quantification_to_55(self):
        """Résumé with 6+ numerals → category floored, lying low score raised."""
        raw = {"categoryScores": _category_scores(quantification=30)}
        result = _validate_analysis_against_resume(raw, STRONG_RESUME)
        assert result["categoryScores"]["quantification"] >= 55

    def test_weak_resume_no_floor(self):
        """Résumé with no real metrics → no artificial floor."""
        raw = {"categoryScores": _category_scores(quantification=30)}
        result = _validate_analysis_against_resume(raw, WEAK_RESUME)
        assert result["categoryScores"]["quantification"] == 30

    def test_missing_metrics_topissue_dropped_on_strong_resume(self):
        raw = {
            "categoryScores": _category_scores(),
            "topIssues": [
                {"issue": "Missing impact metrics across bullets",
                 "severity": "high",
                 "suggestion": "Add measurable outcomes"},
            ],
        }
        result = _validate_analysis_against_resume(raw, STRONG_RESUME)
        assert result["topIssues"] == []

    def test_missing_metrics_topissue_kept_on_weak_resume(self):
        raw = {
            "categoryScores": _category_scores(),
            "topIssues": [
                {"issue": "Missing impact metrics across bullets",
                 "severity": "high",
                 "suggestion": "Add measurable outcomes"},
            ],
        }
        result = _validate_analysis_against_resume(raw, WEAK_RESUME)
        assert len(result["topIssues"]) == 1

    def test_lying_quantification_tag_stripped(self):
        """No-op rewrite tagged 'quantification' — strip the tag."""
        orig = "Designed and implemented secure modules for form handling."
        improved = "Designed and implemented secure modules for form handling."
        kept_imp, kept_cr, kept_issues = _filter_bullet_rewrites(
            orig, improved, {}, ["quantification", "achievementQuality"],
        )
        assert "quantification" not in [str(t).lower() for t in kept_issues]
        assert "achievementQuality" in kept_issues
        assert kept_imp == ""

    def test_honest_quantification_rewrite_kept(self):
        """Rewrite that actually adds numerals — tag and rewrite both kept."""
        orig = "Built a service that handles real-time data."
        improved = "Built a service handling 10,000 events/sec at sub-50ms p99 latency."
        kept_imp, _, kept_issues = _filter_bullet_rewrites(
            orig, improved, {}, ["quantification"],
        )
        assert "quantification" in kept_issues
        assert kept_imp == improved


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 2 — Achievement Quality (strong-verb ownership vs duty-only)
# ══════════════════════════════════════════════════════════════════════════════


class TestAchievementQualityDimension:

    def test_strong_verb_majority_floors_achievement(self):
        """≥60% bullets lead with strong verbs → achievementQuality floored."""
        raw = {"categoryScores": _category_scores(achievementQuality=35)}
        result = _validate_analysis_against_resume(raw, STRONG_RESUME)
        s, t = _resume_strong_verb_share(STRONG_RESUME)
        assert t >= 5 and s / t >= 0.6
        assert result["categoryScores"]["achievementQuality"] >= 55

    def test_weak_verbs_no_floor(self):
        raw = {"categoryScores": _category_scores(achievementQuality=35)}
        result = _validate_analysis_against_resume(raw, WEAK_RESUME)
        assert result["categoryScores"]["achievementQuality"] == 35

    def test_duty_only_topissue_dropped_on_strong_resume(self):
        raw = {
            "categoryScores": _category_scores(),
            "topIssues": [
                {"issue": "Duty-style bullets that fail to highlight ownership",
                 "severity": "high"},
            ],
        }
        result = _validate_analysis_against_resume(raw, STRONG_RESUME)
        assert result["topIssues"] == []

    def test_weak_verb_topissue_kept_on_weak_resume(self):
        raw = {
            "categoryScores": _category_scores(),
            "topIssues": [
                {"issue": "Weak action verbs throughout",
                 "severity": "high"},
            ],
        }
        result = _validate_analysis_against_resume(raw, WEAK_RESUME)
        assert len(result["topIssues"]) == 1

    def test_participial_testing_lead_not_strong(self):
        line = (
            "• Automated testing and feature deployments, ensuring reliable "
            "and efficient workflows."
        )
        assert _is_participial_noun_phrase_lead(line)
        assert not _bullet_leads_with_strong_ownership_verb(line)

    def test_participial_cicd_lead_is_strong(self):
        line = "• Automated CI/CD pipelines across 12 services, cutting deploy time 40%."
        assert not _is_participial_noun_phrase_lead(line)
        assert _bullet_leads_with_strong_ownership_verb(line)

    def test_achievement_rewrite_same_opening_rejected(self):
        orig = (
            "Automated testing and feature deployments, ensuring reliable "
            "and efficient workflows."
        )
        improved = (
            "Automated testing and feature deployments for production releases, "
            "ensuring reliable workflows and reducing manual deployment errors."
        )
        kept_imp, kept_cr, _ = _filter_bullet_rewrites(
            orig,
            improved,
            {},
            ["duty phrasing"],
            primary_category="achievementQuality",
        )
        assert kept_imp == ""
        assert kept_cr == {}

    def test_achievement_rewrite_strong_opening_kept(self):
        orig = (
            "Automated testing and feature deployments, ensuring reliable "
            "and efficient workflows."
        )
        improved = (
            "Built automated testing and deployment pipelines for production "
            "releases, reducing manual deployment errors."
        )
        kept_imp, _, _ = _filter_bullet_rewrites(
            orig,
            improved,
            {},
            ["duty phrasing"],
            primary_category="achievementQuality",
        )
        assert kept_imp == improved

    def test_legal_achievement_rewrite_with_example_placeholders_kept(self):
        orig = (
            "Prepared research notes on domain name cybersquatting, copyright and "
            "trademark infringements. Assisted in filing interim injunction in "
            "trademark infringement suit. Prepared summary of exemptions available "
            "under Indian patent law regime."
        )
        improved = (
            "Authored [N] research memos on domain name cybersquatting, "
            "copyright, and trademark infringements; supported interim-injunction "
            "filing in a trademark infringement suit and summarized exemptions "
            "available under Indian patent law regime to inform litigation strategy."
        )
        kept_imp, kept_cr, kept_issues = _filter_bullet_rewrites(
            orig,
            improved,
            {"achievementQuality": improved},
            ["achievementQuality", "quantification"],
            primary_category="achievementQuality",
        )
        assert kept_imp == improved
        assert kept_cr["achievementQuality"] == improved
        assert "quantification" in kept_issues

    def test_section_feedback_pronoun_claim_stripped(self):
        """PROJECTS feedback must not claim pronouns when section has none."""
        resume = (
            "PROJECTS\n"
            "Nutri AI Scan | Vue Js, REST API, Mongo DB\n"
            "• Won 2nd place at the CBIC Entrepreneurship at UMBC out of 25+ teams by "
            "developing a progressive web app using OCR to identify allergens and harmful "
            "ingredients and provide healthiness ratings for food products."
        )
        raw = {
            "sectionFeedback": [{
                "section": "PROJECTS",
                "score": 60,
                "feedback": (
                    "Split the single bullet or rephrase to remove the personal pronoun "
                    "and keep to 1-2 achievement bullets."
                ),
            }],
        }
        result = _validate_analysis_against_resume(raw, resume)
        fb = result["sectionFeedback"][0]["feedback"].lower()
        assert "pronoun" not in fb
        assert "1-2" in fb or "split" in fb

    def test_section_feedback_kept_when_pronoun_present(self):
        resume = (
            "EXPERIENCE\n"
            "• I led a team of 5 engineers and delivered APIs on AWS."
        )
        raw = {
            "sectionFeedback": [{
                "section": "Experience",
                "score": 55,
                "feedback": "Remove personal pronouns and use strong verbs.",
            }],
        }
        result = _validate_analysis_against_resume(raw, resume)
        assert "pronoun" in result["sectionFeedback"][0]["feedback"].lower()

    def test_duty_tag_dropped_when_bullet_already_strong_verb(self):
        """Weak-verb issue tags on Built/Designed bullets are contradictions."""
        raw = {
            "bulletAnalysis": [{
                "originalBullet": "• Built payment APIs on AWS Lambda.",
                "issues": ["weak action verb", "duty-only"],
            }],
        }
        result = _validate_analysis_against_resume(raw, STRONG_RESUME)
        assert result["bulletAnalysis"][0]["issues"] == []


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 3 — ATS Compatibility (warnings phrased as actual issues, not non-issues)
# ══════════════════════════════════════════════════════════════════════════════


class TestATSCompatibilityDimension:

    @pytest.mark.parametrize("warning", [
        "No tables or graphics detected",
        "No graphics detected",
        "No multi-column layout",
        "Standard headings used",
        "Plain-text format throughout",
        "ATS-friendly layout confirmed",
        "No non-standard formatting",
        "No icons or charts present",
    ])
    def test_non_issue_warning_dropped(self, warning):
        raw = {"atsWarnings": [{"warning": warning, "suggestion": "keep it up"}]}
        _strip_non_issue_ats_warnings(raw)
        assert raw["atsWarnings"] == []

    @pytest.mark.parametrize("warning", [
        "Contact info uses non-standard separators",
        "Section header 'CAREER' may not parse cleanly",
        "Multiple consecutive blank lines",
        "Embedded image of email may not parse",
    ])
    def test_real_warning_kept(self, warning):
        raw = {"atsWarnings": [{"warning": warning, "suggestion": "fix it"}]}
        _strip_non_issue_ats_warnings(raw)
        assert len(raw["atsWarnings"]) == 1


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 4 — Readability (bullet length, line wrapping)
# ══════════════════════════════════════════════════════════════════════════════


class TestReadabilityDimension:

    def test_wrapped_bullets_stitched_back(self):
        """Multi-line wrapped bullet emitted as separate lines gets joined.

        The stitcher is deliberately conservative: continuations must start
        with lowercase / hyphen so we don't accidentally swallow capitalized
        new content. Both real cases from KrishResume PDFs match that shape.
        """
        text = (
            "• Built an iterative LLM feedback loop for automated EDA on uploaded CSV/Excel/JSON datasets, generating statistical\n"
            "summaries, correlations, and visualizations across up to 5 refinement cycles\n"
            "• Reduced cold-start from 800ms to 180ms via container optimization\n"
            "across 5 regions."
        )
        out = _stitch_wrapped_bullets(text)
        lines = [ln for ln in out.split("\n") if ln.strip()]
        assert len(lines) == 2
        assert "summaries, correlations" in lines[0]
        assert "5 refinement cycles" in lines[0]
        assert "across 5 regions" in lines[1]

    def test_section_heading_breaks_continuation(self):
        text = (
            "• Built a service that does many things\n"
            "EDUCATION"
        )
        out = _stitch_wrapped_bullets(text)
        # EDUCATION must not be stitched into the bullet.
        assert "Built a service that does many things" in out
        assert "EDUCATION" in out
        assert "many things EDUCATION" not in out

    def test_terminated_bullet_does_not_swallow_next_line(self):
        text = (
            "• Built a service. \n"
            "additional context not part of bullet"
        )
        out = _stitch_wrapped_bullets(text)
        # Ends in period → not a continuation candidate.
        assert "Built a service. additional" not in out


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 5 — Section Structure (entry splits, education grouping)
# ══════════════════════════════════════════════════════════════════════════════


class TestSectionStructureDimension:

    def test_collapsed_education_entries_get_split(self):
        """LLM merges 3 schools into one entry → splitter restores 3 entries."""
        doc = ResumeDocModel(
            full_name="Test User",
            education=[
                EducationItem(
                    institution="D.J. Sanghvi College of Engineering",
                    degree="",
                    dates="Higher Secondary Certificate — 79.67% (2023)",
                    location="",
                    bullets=[
                        "B.Tech in Computer Engineering — CGPA: 9.266",
                        "Kishinchand Chellaram College",
                        "Greenlawns High School",
                        "ICSE — 97.16% (2021)",
                    ],
                ),
            ],
        )
        _split_collapsed_education_entries(doc)
        assert len(doc.education) == 3
        insts = [e.institution for e in doc.education]
        assert insts == [
            "D.J. Sanghvi College of Engineering",
            "Kishinchand Chellaram College",
            "Greenlawns High School",
        ]
        # The mis-placed HSC degree gets moved into Kishinchand's degree slot.
        assert "Higher Secondary Certificate" in doc.education[1].degree
        assert "ICSE" in doc.education[2].degree

    def test_clean_education_unaffected(self):
        doc = ResumeDocModel(
            full_name="Test",
            education=[
                EducationItem(institution="MIT", degree="BS CS", dates="2020"),
                EducationItem(institution="Stanford", degree="MS CS", dates="2022"),
            ],
        )
        _split_collapsed_education_entries(doc)
        assert len(doc.education) == 2
        assert doc.education[0].institution == "MIT"


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 6 — Language Quality (passive voice, weak verbs, grammar)
# ══════════════════════════════════════════════════════════════════════════════


class TestLanguageQualityDimension:

    def test_strong_verb_majority_floors_language_quality(self):
        raw = {"categoryScores": _category_scores(languageQuality=35)}
        result = _validate_analysis_against_resume(raw, STRONG_RESUME)
        assert result["categoryScores"]["languageQuality"] >= 55

    def test_no_op_rewrite_dropped(self):
        """LLM 'improved' rewrite identical to original — drop it."""
        orig = "• Designed and implemented secure PHP modules."
        improved = "• Designed and implemented secure PHP modules."
        kept_imp, _, _ = _filter_bullet_rewrites(orig, improved, {}, [])
        assert kept_imp == ""

    def test_whitespace_only_change_treated_as_noop(self):
        orig = "Designed   the   system."
        improved = "Designed the system."
        kept_imp, _, _ = _filter_bullet_rewrites(orig, improved, {}, [])
        assert kept_imp == ""

    def test_tense_only_rewrite_salvaged_to_language_quality(self):
        orig = "Conduct price verification using Bloomberg and market data, enhancing valuation accuracy and improving NAV precision."
        improved = "Conducted price verification using Bloomberg and market data, enhancing valuation accuracy and improving NAV precision."
        kept_imp, kept_cr, _ = _filter_bullet_rewrites(orig, improved, {}, ["duty phrasing"])
        assert kept_imp == ""
        assert kept_cr.get("languageQuality") == improved

    def test_tense_only_category_rewrite_kept_for_language_quality(self):
        orig = "Conduct price verification using Bloomberg and market data."
        category_rewrites = {
            "languageQuality": "Conducted price verification using Bloomberg and market data."
        }
        _, kept_cr, _ = _filter_bullet_rewrites(orig, "", category_rewrites, ["grammar"])
        assert kept_cr.get("languageQuality") == category_rewrites["languageQuality"]

    def test_semicolon_tweak_salvaged_to_language_quality(self):
        orig = "Built APIs for internal tools; improved latency for dashboard queries."
        improved = "Built APIs for internal tools and improved latency for dashboard queries."
        kept_imp, kept_cr, _ = _filter_bullet_rewrites(orig, improved, {}, [])
        assert kept_imp == ""
        assert kept_cr.get("languageQuality") == improved

    def test_real_rewrite_kept(self):
        orig = "Designed the system."
        improved = "Architected a distributed system handling 10k req/s."
        kept_imp, _, _ = _filter_bullet_rewrites(orig, improved, {}, [])
        assert kept_imp == improved


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 7 — Technical Branding (proper nouns, named tech, CamelCase)
# ══════════════════════════════════════════════════════════════════════════════


class TestTechnicalBrandingDimension:

    def test_rewrite_dropping_proper_noun_rejected(self):
        ok, reason = _validate_rewrite_against_original(
            "Built FastAPI service on AWS Lambda with PostgreSQL.",
            "Built a service with a database.",
        )
        assert not ok
        assert "dropped" in reason.lower()

    def test_rewrite_dropping_acronym_rejected(self):
        ok, _ = _validate_rewrite_against_original(
            "Implemented CI/CD pipeline reducing release time.",
            "Implemented automated deployment reducing release time.",
        )
        assert not ok

    def test_rewrite_preserving_tech_accepted(self):
        ok, _ = _validate_rewrite_against_original(
            "Built FastAPI service on AWS Lambda with PostgreSQL.",
            "Built FastAPI service on AWS Lambda powering real-time pipeline ingesting from PostgreSQL.",
        )
        assert ok


# ══════════════════════════════════════════════════════════════════════════════
# DIMENSION 8 — Job Match (no JD = null jobMatch; doesn't fire validator)
# ══════════════════════════════════════════════════════════════════════════════


class TestJobMatchDimension:

    def test_no_jd_keeps_job_match_null(self):
        raw = {"categoryScores": _category_scores(jobMatch=None)}
        result = _normalize_analysis(raw)
        assert result["categoryScores"]["jobMatch"] is None

    def test_keyword_analysis_default_shape(self):
        raw = {"categoryScores": _category_scores()}
        result = _normalize_analysis(raw)
        ka = result.get("keywordAnalysis")
        assert ka is not None
        assert "matchedKeywords" in ka and "missingKeywords" in ka


# ══════════════════════════════════════════════════════════════════════════════
# Cross-cutting — Rewrite quantification claim
# ══════════════════════════════════════════════════════════════════════════════


class TestRewriteValidator:

    def test_dropping_numeral_rejected(self):
        ok, reason = _validate_rewrite_against_original(
            "Reduced latency by 50% across 1000 services.",
            "Reduced latency across services.",
        )
        assert not ok
        assert "numeral" in reason.lower()

    def test_quantification_claim_requires_new_numeral(self):
        ok, reason = _validate_rewrite_against_original(
            "Designed onboarding flow.",
            "Improved onboarding flow.",
            category="quantification",
        )
        assert not ok
        assert "numeral" in reason.lower()

    def test_quantification_claim_with_new_numeral_accepted(self):
        ok, _ = _validate_rewrite_against_original(
            "Reduced latency through caching.",
            "Reduced latency by [40%] through caching, serving 10k requests/min.",
            category="quantification",
        )
        assert ok

    def test_extreme_shrinkage_rejected(self):
        """Word-count drop > 20% should fail. The validator returns at the
        first failure; numeral-loss is checked before shrinkage so use a
        numeral-free original to isolate the shrinkage rule."""
        ok, reason = _validate_rewrite_against_original(
            "Designed and implemented a multi-region disaster recovery system across AWS regions with automated failover and full observability tooling.",
            "Designed a DR system.",
        )
        assert not ok
        # First failure could be proper-noun loss (AWS) OR shrinkage —
        # either is honest evidence the rewrite is bad.
        assert any(kw in reason.lower() for kw in ("shr", "drop"))


# ══════════════════════════════════════════════════════════════════════════════
# Calibration v2
# ══════════════════════════════════════════════════════════════════════════════


class TestCalibration:

    def test_overall_score_floors_at_20(self):
        raw = {
            "overallScore": 5,
            "categoryScores": {k: 10 for k in _all_cats()},
        }
        result = _normalize_analysis(raw)
        assert result["overallScore"] >= 20

    def test_extreme_inflation_rejected(self):
        """LLM said 90 but categoryScores mean is 55 → use calibrated."""
        raw = {
            "overallScore": 90,
            "categoryScores": _category_scores(default=55),
        }
        result = _normalize_analysis(raw)
        # Mean ≈ 55, soft_penalty ≤ 6 → final in 49-55 range, NOT 90.
        assert result["overallScore"] < 80

    def test_honest_blend_within_band(self):
        """LLM 60, mean 65 → blend ≈ 62."""
        raw = {
            "overallScore": 60,
            "categoryScores": _category_scores(default=65),
        }
        result = _normalize_analysis(raw)
        assert 55 <= result["overallScore"] <= 70

    def test_validator_adjustment_disables_llm_cap(self):
        """When evidence validator floored categories AND dropped issues, the
        LLM's overall is no longer trusted — use calibrated."""
        raw = {
            "overallScore": 20,  # LLM was crushing the résumé
            "categoryScores": _category_scores(quantification=30, achievementQuality=30, languageQuality=30),
            "topIssues": [
                {"issue": "Missing impact metrics", "severity": "high"},
                {"issue": "Duty-only bullets", "severity": "high"},
            ],
        }
        validated = _validate_analysis_against_resume(raw, STRONG_RESUME)
        result = _normalize_analysis(validated)
        # Floors raised categories to 55 + topIssues dropped → calibrated > 20.
        assert result["overallScore"] > 20


# ══════════════════════════════════════════════════════════════════════════════
# Synthesizer
# ══════════════════════════════════════════════════════════════════════════════


def _build_test_doc() -> ResumeDocModel:
    return ResumeDocModel(
        full_name="Krish Shah",
        phone="+91 8452951044",
        email="krishshah0505@gmail.com",
        linkedin="linkedin.com/in/krish",
        github="github.com/KrishShah0505",
        education=[
            EducationItem(
                institution="D.J. Sanghvi College of Engineering",
                degree="B.Tech in Computer Engineering — CGPA: 9.266 (Ongoing)",
                location="Vile Parle, Mumbai",
                dates="",
            ),
            EducationItem(
                institution="Kishinchand Chellaram College",
                degree="Higher Secondary Certificate — 79.67% (2023)",
                location="Churchgate, Mumbai",
                dates="",
            ),
        ],
        experience=[
            ExperienceItem(
                role="Backend Developer Intern",
                company="Navlakhi Education",
                location="Tardeo, Mumbai",
                dates="June 2024 – July 2024",
                bullets=[
                    "Designed and implemented secure PHP server-side modules.",
                    "Reduced manual data-entry toil by automating insertion pipelines.",
                ],
            ),
        ],
        projects=[
            ProjectItem(
                name="Querify",
                bullets=[
                    "Python · Django · React · LLM (Llama 3) · MySQL · MongoDB",
                    "Architected a multi-agent NLP pipeline.",
                ],
            ),
        ],
        skills=[
            ("Languages and Frameworks", ["Python", "Java", "C", "React"]),
            ("ML / AI", ["Scikit-learn", "XGBoost", "CatBoost"]),
        ],
    )


class TestSynthesizer:

    def test_header_first_two_lines(self):
        text = _synthesize_text_from_resume_doc(_build_test_doc())
        lines = text.split("\n")
        assert lines[0] == "Krish Shah"
        assert "krishshah0505@gmail.com" in lines[1]
        assert "linkedin.com/in/krish" in lines[1]

    def test_education_year_lifted_to_header(self):
        """`(Ongoing)` should appear in the entry header pipe slot, not as a bullet."""
        text = _synthesize_text_from_resume_doc(_build_test_doc())
        # Find D.J. Sanghvi line
        dj_line = next(l for l in text.split("\n") if l.startswith("D.J. Sanghvi"))
        assert "Ongoing" in dj_line
        # And the degree line should NOT still contain "(Ongoing)"
        idx = text.split("\n").index(dj_line)
        degree_line = text.split("\n")[idx + 1]
        assert "(Ongoing)" not in degree_line
        assert "CGPA: 9.266" in degree_line
        # And there's no stray "• Ongoing" anywhere.
        assert "• Ongoing" not in text

    def test_education_year_real_year_lifted(self):
        text = _synthesize_text_from_resume_doc(_build_test_doc())
        kch = next(l for l in text.split("\n") if l.startswith("Kishinchand"))
        assert "2023" in kch
        # Year stripped from degree line.
        idx = text.split("\n").index(kch)
        deg = text.split("\n")[idx + 1]
        assert "(2023)" not in deg

    def test_experience_4_pipe_header(self):
        text = _synthesize_text_from_resume_doc(_build_test_doc())
        exp = next(l for l in text.split("\n") if l.startswith("Backend Developer Intern"))
        parts = exp.split(" | ")
        assert len(parts) == 4
        assert "Navlakhi Education" in parts[1]
        assert "Tardeo, Mumbai" in parts[2]
        assert "2024" in parts[3]

    def test_skills_section_preserves_groups(self):
        text = _synthesize_text_from_resume_doc(_build_test_doc())
        assert "SKILLS" in text
        assert "Languages and Frameworks: Python, Java, C, React" in text
        assert "ML / AI: Scikit-learn, XGBoost, CatBoost" in text


# ══════════════════════════════════════════════════════════════════════════════
# Vision-raw → ResumeDocModel mapper
# ══════════════════════════════════════════════════════════════════════════════


class TestVisionRawMapper:

    def test_degree_and_grade_merged_when_separate(self):
        raw = {
            "education": [{
                "institution": "MIT",
                "degree": "BS Computer Science",
                "gpa_or_grade": "GPA: 3.9",
                "dates": "2022",
            }],
        }
        doc = _vision_raw_to_resume_doc(raw)
        assert len(doc.education) == 1
        assert "GPA: 3.9" in doc.education[0].degree
        assert "BS Computer Science" in doc.education[0].degree

    def test_degree_and_grade_not_double_merged(self):
        """If grade is already inside degree, don't append it again."""
        raw = {
            "education": [{
                "institution": "D.J. Sanghvi",
                "degree": "B.Tech in CE — CGPA: 9.266 (Ongoing)",
                "gpa_or_grade": "CGPA: 9.266 (Ongoing)",
            }],
        }
        doc = _vision_raw_to_resume_doc(raw)
        assert doc.education[0].degree.count("CGPA: 9.266") == 1

    def test_location_embedded_in_company_stripped(self):
        raw = {
            "experience": [{
                "company": "Navlakhi Education · Tardeo, Mumbai",
                "role": "Backend Intern",
                "location": "Tardeo, Mumbai",
                "dates": "June 2024 – July 2024",
                "bullets": ["did things"],
            }],
        }
        doc = _vision_raw_to_resume_doc(raw)
        assert doc.experience[0].company == "Navlakhi Education"
        assert doc.experience[0].location == "Tardeo, Mumbai"

    def test_csv_skill_string_split(self):
        raw = {
            "skills_groups": [{
                "category": "Languages",
                "items": ["Python, Java, C, HTML/CSS, SQL"],
            }],
        }
        doc = _vision_raw_to_resume_doc(raw)
        assert doc.skills[0][1] == ["Python", "Java", "C", "HTML/CSS", "SQL"]

    def test_array_skill_passthrough(self):
        raw = {
            "skills_groups": [{
                "category": "Languages",
                "items": ["Python", "Java", "C"],
            }],
        }
        doc = _vision_raw_to_resume_doc(raw)
        assert doc.skills[0][1] == ["Python", "Java", "C"]


# ══════════════════════════════════════════════════════════════════════════════
# Resume-text helpers
# ══════════════════════════════════════════════════════════════════════════════


class TestResumeHelpers:

    def test_numeral_count_strong(self):
        assert _resume_numeral_count(STRONG_RESUME) >= 6

    def test_numeral_count_weak(self):
        assert _resume_numeral_count(WEAK_RESUME) < 3

    def test_strong_verb_share_strong(self):
        s, t = _resume_strong_verb_share(STRONG_RESUME)
        assert t >= 5
        assert s / t >= 0.6

    def test_strong_verb_share_weak(self):
        s, t = _resume_strong_verb_share(WEAK_RESUME)
        # Cashier-style résumé: most bullets are weak verbs.
        if t > 0:
            assert s / t < 0.5


# ══════════════════════════════════════════════════════════════════════════════
# Structured bullet category fields (primaryCategory / issueCategories)
#
# These back the frontend contract: the UI now buckets bullets by these fields
# verbatim instead of re-deriving them with regex. The whole point is that the
# backend never hands the UI a category it can't act on — esp. a phantom
# "quantification" bucket that triggers the "Add a number…" hint with no rewrite.
# ══════════════════════════════════════════════════════════════════════════════


class TestBulletCategoryNormalization:

    def test_primary_always_valid_key(self):
        primary, cats = _normalize_bullet_categories(
            "garbage_not_a_real_category", ["also_garbage"],
            original="Was responsible for handling tickets.",
            improved="Resolved 30+ support tickets weekly, cutting backlog.",
            category_rewrites=None,
            issues=["passive voice", "duty-only"],
        )
        assert primary in _CATEGORY_SCORE_KEYS
        assert all(c in _CATEGORY_SCORE_KEYS for c in cats)

    def test_primary_always_in_issue_categories(self):
        primary, cats = _normalize_bullet_categories(
            "languageQuality", [],
            original="Was responsible for the thing.",
            improved="Owned the thing end to end.",
            category_rewrites=None,
            issues=["passive voice"],
        )
        assert primary == "languageQuality"
        assert "languageQuality" in cats

    def test_unsupported_quantification_stripped_from_issue_categories(self):
        """LLM tagged quantification but no rewrite adds a numeral → the
        category bucket must drop quantification (mirrors the issues[] strip)."""
        primary, cats = _normalize_bullet_categories(
            "languageQuality", ["quantification", "languageQuality"],
            original="Improved the onboarding flow for new users.",
            improved="Streamlined the onboarding flow for new users.",
            category_rewrites=None,
            issues=["wordy", "quantification"],
        )
        assert "quantification" not in cats
        assert primary == "languageQuality"

    def test_supported_quantification_kept(self):
        """A rewrite that adds a new numeral legitimizes the quantification
        bucket — it must survive."""
        primary, cats = _normalize_bullet_categories(
            "quantification", ["quantification"],
            original="Reduced page load time through caching.",
            improved="Reduced page load time by [40%] through caching.",
            category_rewrites=None,
            issues=["quantification"],
        )
        assert primary == "quantification"
        assert "quantification" in cats

    def test_placeholder_quantification_kept(self):
        """Bracket placeholders ([X%]) count as quantification support."""
        primary, cats = _normalize_bullet_categories(
            "quantification", ["quantification"],
            original="Implemented gRPC streaming for real-time data transfer.",
            improved="",
            category_rewrites={
                "quantification": (
                    "Implemented gRPC streaming for real-time data transfer, "
                    "cutting end-to-end latency by [~40%]."
                ),
            },
            issues=["quantification"],
        )
        assert primary == "quantification"
        assert "quantification" in cats

    def test_quantification_primary_rederived_when_unsupported(self):
        """If the LLM made quantification the primaryCategory but no rewrite
        adds a numeral, primary must move to a category we can act on — never
        stay on the phantom quantification bucket."""
        primary, cats = _normalize_bullet_categories(
            "quantification", ["quantification", "achievementQuality"],
            original="Was responsible for managing the team backlog.",
            improved="Owned the team backlog end to end.",
            category_rewrites=None,
            issues=["duty-only", "quantification"],
        )
        assert primary != "quantification"
        assert primary in _CATEGORY_SCORE_KEYS
        assert "quantification" not in cats

    def test_category_with_rewrite_is_always_listed(self):
        """A surviving categoryRewrites key is legitimate even if the LLM
        forgot to list it in issueCategories."""
        primary, cats = _normalize_bullet_categories(
            "achievementQuality", ["achievementQuality"],
            original="Helped with the migration to PostgreSQL.",
            improved="Led the migration to PostgreSQL.",
            category_rewrites={"achievementQuality": "Drove the PostgreSQL migration to completion."},
            issues=["duty-only"],
        )
        assert "achievementQuality" in cats
        assert primary == "achievementQuality"

    def test_missing_primary_backfilled_from_issue_text(self):
        primary, cats = _normalize_bullet_categories(
            None, None,
            original="Handled passive duties as assigned.",
            improved="",
            category_rewrites=None,
            issues=["passive voice"],
        )
        assert primary in _CATEGORY_SCORE_KEYS
        assert primary in cats

    def test_normalize_analysis_backfills_bullet_categories(self):
        """End-to-end through _normalize_analysis: every surviving bullet gets
        valid primaryCategory + issueCategories, and a phantom quantification
        claim with no numeric rewrite never reaches the UI."""
        raw = {
            "overallScore": 70,
            "categoryScores": _category_scores(default=65),
            "bulletAnalysis": [
                {
                    "originalBullet": "Was responsible for the onboarding docs.",
                    "score": 45,
                    "primaryCategory": "quantification",
                    "issueCategories": ["quantification", "languageQuality"],
                    "issues": ["quantification", "passive voice"],
                    # No numeral added anywhere → quantification is a lie.
                    "improvedBullet": "Owned the onboarding documentation.",
                },
            ],
        }
        result = _normalize_analysis(raw)
        bullets = result["bulletAnalysis"]
        assert len(bullets) == 1
        ba = bullets[0]
        assert ba["primaryCategory"] in _CATEGORY_SCORE_KEYS
        assert ba["primaryCategory"] != "quantification"
        assert "quantification" not in ba["issueCategories"]
        assert "quantification" not in [str(i).lower() for i in ba["issues"]]


class TestCategoryRationales:
    def test_normalize_analysis_keeps_category_rationales(self):
        raw = {
            "overallScore": 75,
            "categoryScores": _category_scores(quantification=75),
            "categoryRationales": {
                "quantification": "Only 1 of 4 experience bullets includes a metric.",
                "readability": "Bullets are concise and skimmable.",
                "bogus": "should be dropped",
            },
        }
        result = _normalize_analysis(raw)
        cr = result["categoryRationales"]
        assert cr["quantification"] == "Only 1 of 4 experience bullets includes a metric."
        assert cr["readability"] == "Bullets are concise and skimmable."
        assert "bogus" not in cr

    def test_normalize_analysis_defaults_empty_rationales(self):
        result = _normalize_analysis({"overallScore": 70, "categoryScores": _category_scores()})
        assert result["categoryRationales"] == {}


class TestBracketPlaceholderProseScrub:
    """Bracket placeholders ([X%], [X stakeholders]) read as "written by AI" and
    tell the candidate to paste brackets — they must never survive in advice
    prose. They stay only in bulletAnalysis rewrites (frontend materializes them)."""

    def test_scrubs_topissue_suggestion(self):
        raw = {
            "topIssues": [{
                "issue": "Insufficient quantification",
                "severity": "high",
                "whyItMatters": "Recruiters skim for results.",
                "suggestion": "Add specific numbers or [placeholders] such as "
                              "[X stakeholders], [Y% improvement], or [~N prototypes].",
            }],
        }
        n = _strip_bracket_placeholders_from_prose(raw)
        s = raw["topIssues"][0]["suggestion"]
        assert "[" not in s and "]" not in s
        assert "a number" in s and "a percentage" in s
        assert n >= 1

    def test_scrubs_final_recommendations(self):
        raw = {"finalRecommendations": ["Quantify outcomes, e.g. [X%] faster.", "Add a portfolio link."]}
        _strip_bracket_placeholders_from_prose(raw)
        assert raw["finalRecommendations"][0] == "Quantify outcomes, e.g. a percentage faster."
        assert raw["finalRecommendations"][1] == "Add a portfolio link."

    def test_scrubs_summary_and_rationales_and_money_multiple(self):
        raw = {
            "summary": "Strong resume, but add [$Y] revenue impact and [N×] scale.",
            "categoryRationales": {"quantification": "Only 1 bullet has a metric; add [X%]."},
        }
        _strip_bracket_placeholders_from_prose(raw)
        assert "[" not in raw["summary"]
        assert "a dollar figure" in raw["summary"] and "a multiple" in raw["summary"]
        assert "[" not in raw["categoryRationales"]["quantification"]

    def test_leaves_bullet_rewrites_untouched(self):
        # The frontend materializes these; the backend must NOT scrub them.
        raw = {
            "bulletAnalysis": [{
                "originalBullet": "Built the pipeline.",
                "improvedBullet": "Built the pipeline, cutting runtime by [~40%].",
                "categoryRewrites": {"quantification": "Built the pipeline, cutting runtime by [~40%]."},
            }],
        }
        _strip_bracket_placeholders_from_prose(raw)
        assert raw["bulletAnalysis"][0]["improvedBullet"] == "Built the pipeline, cutting runtime by [~40%]."
        assert "[~40%]" in raw["bulletAnalysis"][0]["categoryRewrites"]["quantification"]

    def test_noop_when_no_brackets(self):
        raw = {"summary": "Clean, quantified resume with strong verbs."}
        assert _strip_bracket_placeholders_from_prose(raw) == 0
        assert raw["summary"] == "Clean, quantified resume with strong verbs."


class TestReadabilityRewriteShortening:
    """Readability fixes condense run-on bullets, so the shrink guard must allow
    shortening for the readability category while still protecting facts."""

    ORIG = (
        "Maintained UCLA's Art website for visitor engagement, wrote pieces "
        "highlighting contributions, and conducted interviews with alumni, students "
        "and patrons for insights, gaining hands-on experience in communications, "
        "marketing, journalism, and content management within the prestigious institution."
    )
    SHORT = (
        "Maintained UCLA's Art website and authored feature pieces; interviewed "
        "alumni, students, and patrons to source stories for communications and marketing."
    )

    def test_readability_rewrite_allows_shortening(self):
        ok, why = _validate_rewrite_against_original(self.ORIG, self.SHORT, category="readability")
        assert ok, why

    def test_achievement_rewrite_allows_condensing_multi_clause_bullet(self):
        # Achievement rewrites of multi-clause duty-lists should be allowed to
        # condense significantly (floor is 0.45), because collapsing a wall of
        # activities into a focused outcome IS the fix.
        ok, why = _validate_rewrite_against_original(self.ORIG, self.SHORT, category="achievementQuality")
        assert ok, why

    def test_achievement_rewrite_rejects_excessive_shrink(self):
        # Even with the relaxed floor, dropping to <45% of original words fails.
        tiny = "Maintained website."
        ok, _ = _validate_rewrite_against_original(self.ORIG, tiny, category="achievementQuality")
        assert not ok

    def test_quantification_placeholder_rewrite_rejects_dropped_responsibilities(self):
        orig = (
            "Drafted service agreements, technology and trademark license agreements. "
            "Reviewed company's privacy policy and researched updates on data "
            "protection laws. Screened promotional material for IP clearance and "
            "drafted guidelines on avoiding copyright infringement in advertisements."
        )
        rewrite = (
            "Drafted [4] service, technology, and trademark license agreements; "
            "screened promotional material for IP clearance."
        )
        ok, why = _validate_rewrite_against_original(orig, rewrite, category="quantification")
        assert not ok
        assert any(kw in why.lower() for kw in ("shrank", "substantive", "drop"))

    def test_quantification_placeholder_rewrite_keeps_listed_work(self):
        orig = (
            "Researched and summarized IP cases for project tracking recent developments in IP law. "
            "Researched and drafted notes on sand mining regulations, objections related to "
            "distinctiveness in trademark applications, and contracts."
        )
        rewrite = (
            "Researched and summarized [~12] IP cases for project tracking and recent developments "
            "in IP law; drafted notes on sand mining regulations, trademark distinctiveness "
            "objections, and contracts."
        )
        ok, why = _validate_rewrite_against_original(orig, rewrite, category="quantification")
        assert ok, why

    def test_quantification_yum_brands_rewrite_rejected(self):
        orig = (
            "Yum! operates the brands KFC, Pizza Hut and Taco Bell. Drafted service agreements, "
            "technology and trademark license agreements. Reviewed company's privacy policy and "
            "researched updates on data protection laws. Screened promotional material for IP clearance "
            "and drafted guidelines on avoiding copyright infringement in advertisements."
        )
        rewrite = (
            "Drafted [4] service and trademark license agreements; "
            "screened promotional material for IP clearance."
        )
        ok, why = _validate_rewrite_against_original(orig, rewrite, category="quantification")
        assert not ok
        assert any(kw in why.lower() for kw in ("shrank", "substantive", "drop", "proper"))

    def test_quantification_yum_brands_rewrite_keeps_context(self):
        orig = (
            "Yum! operates the brands KFC, Pizza Hut and Taco Bell. Drafted service agreements, "
            "technology and trademark license agreements. Reviewed company's privacy policy and "
            "researched updates on data protection laws. Screened promotional material for IP clearance "
            "and drafted guidelines on avoiding copyright infringement in advertisements."
        )
        rewrite = (
            "Yum! operates KFC, Pizza Hut, and Taco Bell; drafted [4] service, technology, and "
            "trademark license agreements; reviewed privacy policy and data-protection updates; "
            "screened promotional material for IP clearance and drafted copyright guidelines for ads."
        )
        ok, why = _validate_rewrite_against_original(orig, rewrite, category="quantification")
        assert ok, why

    def test_readability_rewrite_still_rejects_dropped_numeral(self):
        orig = "Led 12 volunteers across 3 events to raise funds for the campus food bank each year."
        short = "Led volunteers across events to raise funds for the campus food bank."
        ok, why = _validate_rewrite_against_original(orig, short, category="readability")
        assert not ok and "numeral" in why

    def test_filter_keeps_readability_improved_bullet(self):
        kept_improved, _kept_cr, _kept_issues = _filter_bullet_rewrites(
            self.ORIG, self.SHORT, {}, ["readability"], primary_category="readability",
        )
        assert kept_improved == self.SHORT

    def test_filter_keeps_category_readability_rewrite(self):
        _kept_improved, kept_cr, _ = _filter_bullet_rewrites(
            self.ORIG, "", {"readability": self.SHORT}, ["readability"],
            primary_category="readability",
        )
        assert kept_cr.get("readability") == self.SHORT


class TestFallbackRewrites:
    def test_readability_fallback_preserves_sentences(self):
        from resume_gui.analysis.fallback_rewrites import synthesize_fallback_rewrite

        orig = (
            "Assisted in breach of contract cases including contracts, remedies, and defenses for breach. "
            "Analyzed consumer rights for pending consumer litigation. Drafted and reviewed wills."
        )
        rewrite, cr = synthesize_fallback_rewrite(orig, "readability", ["readability"])
        assert rewrite
        assert "breach of contract" in rewrite.lower()
        assert "consumer rights" in rewrite.lower()
        assert "wills" in rewrite.lower()
        assert cr.get("readability") == rewrite

    def test_normalize_backfills_empty_rewrite(self):
        from resume_gui.analysis.normalize import _normalize_analysis

        raw = {
            "overallScore": 60,
            "categoryScores": {k: 55 for k in (
                "readability", "atsCompatibility", "jobMatch", "achievementQuality",
                "quantification", "sectionStructure", "languageQuality", "technicalBranding",
            )},
            "bulletAnalysis": [{
                "originalBullet": "Assisted in breach of contract cases. Analyzed consumer rights.",
                "score": 38,
                "primaryCategory": "readability",
                "issueCategories": ["readability"],
                "issues": ["run-on list"],
                "improvedBullet": "",
                "categoryRewrites": {},
            }],
        }
        result = _normalize_analysis(raw)
        ba = result["bulletAnalysis"][0]
        assert (ba.get("improvedBullet") or "").strip()
        assert ba.get("categoryRewrites")
