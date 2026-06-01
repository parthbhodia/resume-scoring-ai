# Analyze algorithm — working notes

> Tracking doc for how Analyze scores, filters, and surfaces fixes.
> See also [`CLAUDE.md`](../CLAUDE.md) (honesty pipeline invariants) and [`analyze-preview-flow.md`](analyze-preview-flow.md) (preview UI).

## Pipeline overview

```
POST /api/analyze-upload
  → extract text / vision structured doc
  → _synthesize_text_from_resume_doc (preview text)
  → _analyze_resume_comprehensive(clean_text, jd)
       → _recruiter_checks (deterministic structural pre-scan)
       → LLM JSON call (_ANALYSIS_PROMPT, model = ANALYSIS_MODEL / grok-4)
       → _validate_analysis_against_resume (evidence validator)
       → _strip_non_issue_ats_warnings
       → _normalize_analysis (rewrite filter + calibration)
  → compute_experience_summary_from_structured (when structuredResume present)
  → return { overallScore, categoryScores, bulletAnalysis, experienceSummary, ... }
```

Entry points: `resume_gui/app.py` → `_analyze_resume_comprehensive`, `api_analyze_upload`.

---

## Two independent scoring systems

### Layer A: categoryScores (holistic)

- **Source:** Single LLM pass over full résumé text (~6000 chars).
- **Output:** 8 integers 0–100 per dimension.
- **Nature:** Global impression — **not** derived from averaging bullet scores.
- **overallScore:** `_normalize_analysis` calibration v2 ≈ mean(categoryScores) minus small topIssue penalty; floor 20.

### Layer B: bulletAnalysis (sampled weakest lines)

- **Source:** Same LLM call; prompt limits to **8 weakest bullets** (`_ANALYSIS_PROMPT` ~L4979).
- **Per bullet:** originalBullet, score, issues[], improvedBullet, categoryRewrites{}, primaryCategory, issueCategories[].
- **Coverage:** Most résumé lines never appear in bulletAnalysis.

### Mismatch symptoms (UX)

| Symptom | Cause |
|---------|-------|
| Category score low but no bullets when clicked | Holistic score without bullets bucketed to that category |
| Category in COMPLETED with low score | `categoryHasActionableContent` false → dead-end bucket |
| Preview banner vs empty detail panel | Was: banner always on; **fixed:** gated on `flaggedCount > 0` |
| Sidebar badge vs detail panel | Was: primaryCategory only; **fixed:** display uses `issueCategories` too |

### Display vs rewrite bucketing (invariant #10)

- **Display** (filter, highlight, sidebar counts): `bulletBelongsToCategory()` — checks `issueCategories` first, then `primaryCategory`.
- **Rewrites**: `getRewriteForCategory()` — **primaryCategory only** (never show a rewrite for the wrong fix target).

---

## Honesty pipeline

### _validate_analysis_against_resume

Drops claims contradicting résumé evidence; floors some category scores when evidence supports strength.

### _filter_bullet_rewrites

Drops improvedBullet / categoryRewrites when:

1. Fails `_validate_rewrite_against_original` (dropped numerals, proper nouns, tech)
2. Normalized rewrite == original (true no-op)
3. Word Jaccard ≥ 0.88 (near-no-op)
4. Morphology-only (tense/plural tweak)

Strips lying `quantification` issue tags when no rewrite adds numerals.

**Critical:** `score` is **not** recalculated when rewrite is dropped → "no change but still scores low" UX.

### Helpless bullet drop (score ≥ 70, no rewrite)

Removed from bulletAnalysis entirely — dead-end UX prevention.

Bullets with score **< 70** and no rewrite **stay** so user sees low score + issue tags.

### Calibration v2

`base_overall = mean(categoryScores)`; soft penalty from high/medium topIssues; blend with LLM overall unless validator flagged ≥2 adjustments; floor 20.

---

## Experience tenure

`resume_gui/experience_tenure.py` parses `structuredResume.experience[].dates`, merges overlapping intervals, returns:

```json
{
  "totalMonths": 8,
  "totalYearsLabel": "< 1 year",
  "roleCount": 1,
  "datedRoleCount": 1,
  "roles": [{ "company": "...", "role": "...", "dates": "...", "months": 8 }]
}
```

Shown in Analyze sidebar + overview chips. Internships included; overlapping concurrent roles merged.

---

## Frontend rules (AnalyzeResume.tsx)

- **TOP FIXES:** categoryScores[key] < 70 AND `categoryHasActionableContent`
- **COMPLETED:** score ≥ 70 OR !actionable
- **Actionable:** ≥1 bullet in category (via `bulletBelongsToCategory`) OR ≥1 related topIssue
- **Preview banner:** red only when `flaggedCount > 0`; green neutral when category active but no bullets match

---

## Tests

```bash
.venv/bin/python -m pytest resume_gui/tests/test_analyze_dimensions.py -v
.venv/bin/python -m pytest resume_gui/tests/test_experience_tenure.py -v
```
