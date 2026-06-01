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
2. If **`extractedText`** is missing, the UI falls back to a **synthetic** extract that prefixes bullets with `- ` and interleaves **`sectionFeedback`** names as ALL-CAPS headings when possible (experience/work section anchoring).
3. If **`extractedText`** is present but looks like a **bare bullet dump** (few “non-bullet” lines), **`fullExtractHasStructure`** forces the synthetic layout so headings still appear.
4. **`AnalyzeLiveResumeBody`** treats ALL-CAPS / known section titles as **`section`** blocks with a bordered heading row.
5. **Split layout** (`result` + preview open): right column is **presentation-only** (document-style bullets, no numeric chips in-pane). Bullets with suggestions show **✦**; applied preview overrides show **✓**.
6. **Clicking** a bullet in the preview runs **`handleBulletLinkedSelect`** (category sync + pulse). In **presentationOnly**, an actionable bullet also opens a **fixed-position popup** (score, issue chips, editable rewrite, Apply / Revert / Copy / Reset; Escape or outside-click closes).
7. **Replace line in preview** updates **`lineOverrides`** in the store (session-only; **does not rewrite the uploaded PDF file**).

## Highlight semantics (approximate)

- With **no** active category and bullet has issues: score bands tint background (weak / fair / strong).
- With **active category**: bullets where `bulletBelongsToCategory()` is true (checks `issueCategories` then `primaryCategory`) get a blush highlight.
- **Selected** bullet: blue inset ring; in split preview, optional **thick left bar** tracks geometry on scroll/resize.
- Preview banner: **red** only when ≥1 bullet matches the active category; **green** neutral copy when the category score is holistic but no sample bullets were flagged.

See [`docs/ANALYSIS_ALGORITHM.md`](ANALYSIS_ALGORITHM.md) for the two-layer scoring model.

## PDF output

The preview is primarily **HTML**. The panel header includes **Save as PDF**, which snapshots the preview “paper” card (including session line overrides) to a **multi-page US Letter PDF** via `html2canvas` + `jsPDF`. That export is approximate (rasterized), not identical to print typography. Your **uploaded résumé file** is unchanged; use **Résumé Builder** for structured source edits.

## Manual push (example)

```bash
git checkout -b claude/add-client-components-FnlEt
git add docs/analyze-preview-flow.md web/ resume_gui/app.py
git commit -m "Analyze: Zustand preview mirror, docs, and related web updates"
git push -u origin claude/add-client-components-FnlEt
```

Adjust `git add` to match what you intend to ship (avoid committing editor noise like `.claude/` or stray `C:/` paths).
