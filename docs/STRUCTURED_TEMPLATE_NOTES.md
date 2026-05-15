# Structured Rendering Notes (A + B)

This note captures the current implementation for dynamic template selection and fuller profile-content preservation.

## A) Dynamic Template Selection

- Source key still comes from `reference_folder` (Supabase `resume_templates`).
- Rendering now supports two modes:
  1. **Supabase Jinja template mode** when `tex_body` contains Jinja markers (`{{ doc.` or `{%`).
  2. **File template mode** fallback (currently `classic_resume.tex.j2`).
- Runtime emits status events so the client can see which template mode was used.

Current limitation:
- Existing Supabase `tex_body` rows are mostly plain LaTeX, not Jinja templates, so fallback to file-based template is common.

## B) Candidate Profile Content Preservation

- Added profile normalization/parser pipeline in `resume_gui/profile_parser.py`.
- Normalization handles escaped/literal newline variants (`\\n`, `` `n ``).
- Extracts contact fields (regex + optional spaCy/Presidio), summary, skills, experience, projects, education.
- Structured mapping now preserves more content by:
  - mapping skills into `doc.skills`,
  - keeping larger experience bullet sets,
  - appending project/education lines as additional bullets when explicit sections exist.

Current limitation:
- `ResumeDocModel` still only has Summary/Skills/Experience sections. Projects/Education are preserved as prefixed bullets in experience for now.

## Validation Checklist

For `POST /api/generate-stream` with `reference_folder=Harshibar_Template1` and full `candidate_profile`:

- `status` includes source load and chosen template mode.
- `saved` + `pdf` events are present.
- `ratings` includes non-empty `criteria`, `gaps`, and `match_score`.
- `GET /api/resume/{folder}` rawTex should not contain parser noise (`leftmargin`, `textbackslash`, chained structured folder artifacts).

## Next Steps

1. Add per-template Jinja files (or Jinja-compatible Supabase rows) for true visual parity with each design.
2. Extend `ResumeDocModel` to first-class `projects` and `education` sections.
3. Add regression fixtures for known bad payloads and rawTex outcomes.
