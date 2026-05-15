# Live editor vs LaTeX export (Résumé Builder — template flow)

Companion to [ARCHITECTURE_AND_DESIGN.md](./ARCHITECTURE_AND_DESIGN.md). Read this when changing the template customize screen, `ResumePaperView`, or `/api/generate-stream` behavior.

---

## 1. Two surfaces on purpose

| Surface | Technology | Updates | Role |
|--------|------------|---------|------|
| **Live preview (HTML)** | React `ResumePaperView` — plain text profile → styled “paper” | **Instant** when the user changes accent, font size, spacing, or profile text | Fast feedback; **not** a pixel-perfect mirror of LaTeX |
| **LaTeX PDF (exported)** | Server `pdflatex` on the chosen `reference_folder` template | Only after **Generate** / **Recompile PDF** completes the SSE stream | **Authoritative** file for download, library, share links, ATS checks |

We intentionally **do not** recompile LaTeX on every slider change — that would hammer CPU and offer poor UX. Users adjust the live paper, then **Recompile PDF** when they want the export updated.

---

## 2. Where it lives in code

- **`web/components/ResumeBuilder.tsx`**
  - `TemplateCustomizePostResult`: left column stacks **Live preview (HTML)** then **LaTeX PDF (exported)** when `result.pdfUrl` exists.
  - `ResumePaperView`: optional `templateFolder` (`reference_folder` string) maps to **sans vs serif** and **name line treatment** (e.g. Malta / Harshibar vs classic centered caps).
- **`resume_gui/app.py`** + **`linkedin_agent/resume_library.py`**: stream generation, `.tex` write, compile, PDF URL in SSE `pdf` / `done` events.

---

## 3. User-facing copy rules

- Say **“live paper”** or **“HTML preview”** when referring to instant updates.
- Say **“LaTeX PDF”** or **“exported PDF”** for the iframe / download artifact.
- Avoid implying accent/font sliders change the PDF **without** recompiling.

---

## 4. Future directions (optional)

- **Single JSON schema** feeding both HTML preview and LaTeX template fill would reduce conceptual drift (see product discussions on Reactive Resume–style models).
- **Server-side style tokens** (accent hex in `.tex` macros) would require extending the generate API and templates — not implemented as of this doc.

---

## 5. Related files

- `web/lib/resumeTemplates.ts` — `referenceFolder` values must match server `LIBRARY_ROOT` folders and `ResumePaperView` `templateFolder` branches.
- `docs/ARCHITECTURE_AND_DESIGN.md` — §4.7 link from main architecture index.
