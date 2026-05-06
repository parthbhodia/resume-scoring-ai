# Analyze: live preview column

## Files

| Path | Role |
|------|------|
| `web/store/resumeAnalyzeStore.ts` | Zustand store: `extractedText`, `analysisBullets`, `lineOverrides`, `annotationByIndex`, `pulseBulletIndex` / `pulseToken`. Hydrate API shape uses `bulletAnalysis`. |
| `web/lib/analysisCategoryMatch.ts` | Maps bullet issues → category keys; `inferPrimaryCategoryFromBullet` when a bullet is selected. |
| `web/components/BulletImprovedEditor.tsx` | Editable AI rewrite + “Replace line in preview” / “Show original scan”; optional textarea focus/blur for Analyze. |
| `web/components/AnalyzePreviewPane.tsx` | Subscribes to the store and renders `AnnotatedResumePanel`. |
| `web/components/AnnotatedResumePanel.tsx` | Scroll shell, toolbar (non–presentation-only), coordinate mirror overlay in split preview. |
| `web/components/AnalyzeLiveResumeBody.tsx` | Parses `extractedText` into sections/bullets; `data-bullet-idx` per line. |
| `web/components/AnalyzeResume.tsx` | Layout: split grid uses `AnalyzePreviewPane` with `presentationOnly`; narrow layout uses `.az-resume-panel` + toggle (`previewOpen`). Syncs store from `result` on change. |

## After upload

1. **`/api/analyze-upload`** (and related flows) should return **`bulletAnalysis`** and ideally **`extractedText`** (plain text from PDF/TeX). The store **`hydrateFromAnalysis`** resets overrides and stamps bullets.
2. If **`extractedText`** is missing, the UI falls back to a **synthetic** bullet-only extract.
3. **Split layout** (`result` + preview open): right column is **presentation-only** (document-style bullets, no numeric chips in-pane).
4. **Clicking** a bullet in the preview runs **`handleBulletLinkedSelect`** (category sync + pulse).
5. **Replace line in preview** updates **`lineOverrides`** in the store (session-only; **does not rewrite the uploaded PDF file**).

## Highlight semantics (approximate)

- With **no** active category and bullet has issues: score bands tint background (weak / fair / strong).
- With **active category**: bullets mapped to that category get a blush highlight.
- **Selected** bullet: blue inset ring; in split preview, optional **thick left bar** tracks geometry on scroll/resize.

## PDF output

**No.** The right column is an **HTML preview** of extracted text and analysis metadata. It does **not** generate or download a new PDF. Use **Résumé Builder** / export paths elsewhere if you need a file.

## Manual push (example)

```bash
git checkout -b claude/add-client-components-FnlEt
git add docs/analyze-preview-flow.md web/ resume_gui/app.py
git commit -m "Analyze: Zustand preview mirror, docs, and related web updates"
git push -u origin claude/add-client-components-FnlEt
```

Adjust `git add` to match what you intend to ship (avoid committing editor noise like `.claude/` or stray `C:/` paths).
