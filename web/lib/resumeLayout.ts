/**
 * Single source of truth for résumé preview/PDF layout (Template Builder, Analyze, Tailor).
 * Spacing follows ATS-friendly single-column rules: symmetric page padding, tight bullets,
 * entryGap between jobs. Template Builder + AnalyzeLiveResumeBody both consume this module.
 */
import type { CSSProperties } from "react";
import type { TBFont, TBPageWidth, TBStylePreset } from "@/components/TemplateBuilder/types";

export type { TBFont, TBPageWidth, TBStylePreset };

export interface ResumeStylePresetOption {
  id: TBStylePreset;
  label: string;
  description: string;
  font: TBFont;
  accentColor: string;
  baseFont: number;
  bodyFont: number;
  metaFont: number;
  sectionFont: number;
  nameFont: number;
  lineHeight: number;
  summaryLineHeight: number;
  skillsLineHeight: number;
  sectionGap: number;
  entryGap: number;
  bulletGap: number;
  letterSpacing: number;
}

export interface ResumePageWidthOption {
  id: TBPageWidth;
  label: string;
  description: string;
  paddingX: number;
  paddingY: number;
}

/** US Letter width — WYSIWYG preview + Chromium export. */
export const RESUME_PAGE_WIDTH = "8.5in";

/** Shared constants not tied to a style preset. */
export const RESUME_LAYOUT_SHELL = {
  sectionTitleMarginBottom: 6,
  sectionTitlePaddingBottom: 2,
  contactMarginBottom: 16,
  headerNameMarginBottom: 3,
  headerNameLetterSpacing: 0.3,
  bulletIndentPx: 12,
  contactRowGap: 4,
  secondaryEntryMarginFloor: 5,
} as const;

export const RESUME_STYLE_PRESETS: ResumeStylePresetOption[] = [
  {
    id: "executive",
    label: "Executive",
    description: "Default polished template with strong hierarchy.",
    font: "Helvetica",
    accentColor: "#1e3a5f",
    baseFont: 10.5,
    bodyFont: 9.5,
    metaFont: 9,
    sectionFont: 10.5,
    nameFont: 22,
    lineHeight: 1.45,
    summaryLineHeight: 1.55,
    skillsLineHeight: 1.6,
    sectionGap: 11,
    entryGap: 8,
    bulletGap: 2,
    letterSpacing: 1,
  },
  {
    id: "modern",
    label: "Modern",
    description: "Tighter sans-serif layout for dense technical resumes.",
    font: "Helvetica",
    accentColor: "#0f5561",
    baseFont: 10.2,
    bodyFont: 9.3,
    metaFont: 8.8,
    sectionFont: 10.2,
    nameFont: 21,
    lineHeight: 1.38,
    summaryLineHeight: 1.48,
    skillsLineHeight: 1.48,
    sectionGap: 9,
    entryGap: 6,
    bulletGap: 1.5,
    letterSpacing: 0.9,
  },
  {
    id: "classic",
    label: "Classic",
    description: "Traditional serif styling for academic or formal roles.",
    font: "Times-Roman",
    accentColor: "#1a1a1a",
    baseFont: 10.8,
    bodyFont: 10,
    metaFont: 9.3,
    sectionFont: 10.8,
    nameFont: 22.5,
    lineHeight: 1.42,
    summaryLineHeight: 1.5,
    skillsLineHeight: 1.5,
    sectionGap: 11,
    entryGap: 7,
    bulletGap: 2,
    letterSpacing: 0.8,
  },
];

export const RESUME_PAGE_WIDTH_OPTIONS: ResumePageWidthOption[] = [
  {
    id: "narrow",
    label: "Narrow",
    description: "More side margin, refined reading column.",
    paddingX: 64,
    paddingY: 38,
  },
  {
    id: "standard",
    label: "Standard",
    description: "Balanced spacing for most resumes (~0.5in sides at 96dpi).",
    paddingX: 48,
    paddingY: 36,
  },
  {
    id: "wide",
    label: "Wide",
    description: "More usable width for dense content.",
    paddingX: 36,
    paddingY: 34,
  },
];

const FONT_STACK: Record<TBFont, string> = {
  Helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "Times-Roman": "'Times New Roman', Georgia, serif",
  Courier: "'Courier New', Courier, monospace",
};

export function fontStackFor(font: TBFont): string {
  return FONT_STACK[font] ?? FONT_STACK.Helvetica;
}

export function getResumeStylePreset(id?: TBStylePreset): ResumeStylePresetOption {
  return RESUME_STYLE_PRESETS.find((p) => p.id === id) ?? RESUME_STYLE_PRESETS[0];
}

export function getResumePageWidth(id?: TBPageWidth): ResumePageWidthOption {
  return RESUME_PAGE_WIDTH_OPTIONS.find((o) => o.id === id) ?? RESUME_PAGE_WIDTH_OPTIONS[1];
}

/** Analyze/Tailor style chip ids (persisted in localStorage). */
export type ResumePreviewStyleId = "classic" | "modern" | "compact";

const PREVIEW_STYLE_TO_PRESET: Record<ResumePreviewStyleId, TBStylePreset> = {
  classic: "classic",
  modern: "modern",
  compact: "executive",
};

export interface ResumeLayoutContext {
  preset: ResumeStylePresetOption;
  page: ResumePageWidthOption;
  fontStack: string;
  accent: string;
}

export function resolveResumeLayout(opts: {
  stylePreset?: TBStylePreset;
  pageWidth?: TBPageWidth;
  font?: TBFont;
  accentColor?: string;
}): ResumeLayoutContext {
  const preset = getResumeStylePreset(opts.stylePreset);
  const page = getResumePageWidth(opts.pageWidth);
  const font = opts.font ?? preset.font;
  return {
    preset,
    page,
    fontStack: fontStackFor(font),
    accent: opts.accentColor ?? preset.accentColor,
  };
}

export function resumeLayoutFromPreviewStyle(
  styleId: ResumePreviewStyleId,
  pageWidthId: TBPageWidth = "standard",
  accentColor?: string,
): ResumeLayoutContext {
  return resolveResumeLayout({
    stylePreset: PREVIEW_STYLE_TO_PRESET[styleId],
    pageWidth: pageWidthId,
    accentColor,
  });
}

/** CSS custom properties for AnnotatedResumePanel paper + AnalyzeLiveResumeBody. */
export function resumeLayoutCssVars(ctx: ResumeLayoutContext): Record<string, string> {
  const { preset, page, fontStack } = ctx;
  return {
    "--az-resume-heading-font": fontStack,
    "--az-resume-body-font": fontStack,
    "--az-resume-ui-font": fontStack,
    "--az-resume-base-font-size": `${preset.baseFont}px`,
    "--az-resume-body-font-size": `${preset.bodyFont}px`,
    "--az-resume-line-height": String(preset.lineHeight),
    "--az-resume-summary-line-height": String(preset.summaryLineHeight),
    "--az-resume-skills-line-height": String(preset.skillsLineHeight),
    "--az-resume-name-size": `${preset.nameFont}px`,
    "--az-resume-section-size": `${preset.sectionFont}px`,
    "--az-resume-section-tracking": `${preset.letterSpacing}px`,
    "--az-resume-paper-padding": `${page.paddingY}px ${page.paddingX}px`,
    "--az-resume-section-margin-top": `${preset.sectionGap}px`,
    "--az-resume-section-title-margin-bottom": `${RESUME_LAYOUT_SHELL.sectionTitleMarginBottom}px`,
    "--az-resume-entry-gap": `${preset.entryGap}px`,
    "--az-resume-bullet-gap": `${preset.bulletGap}px`,
    "--az-resume-contact-margin-bottom": `${RESUME_LAYOUT_SHELL.contactMarginBottom}px`,
    "--az-resume-header-name-margin-bottom": `${RESUME_LAYOUT_SHELL.headerNameMarginBottom}px`,
    "--resume-paper-accent": ctx.accent,
  };
}

export function resumeLayoutCssVarsForPreviewStyle(
  styleId: ResumePreviewStyleId,
  pageWidthId: TBPageWidth = "standard",
  accentColor?: string,
): Record<string, string> {
  return resumeLayoutCssVars(resumeLayoutFromPreviewStyle(styleId, pageWidthId, accentColor));
}

/** Template Builder `ResumePreview` page root. */
export function resumePageRootStyle(
  ctx: ResumeLayoutContext,
  opts?: { showShadow?: boolean },
): CSSProperties {
  return {
    background: "#ffffff",
    color: "#1a1a1a",
    fontFamily: ctx.fontStack,
    fontSize: ctx.preset.baseFont,
    lineHeight: ctx.preset.lineHeight,
    padding: `${ctx.page.paddingY}px ${ctx.page.paddingX}px`,
    minHeight: "11in",
    width: RESUME_PAGE_WIDTH,
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: opts?.showShadow !== false ? "0 2px 16px rgba(0,0,0,0.18)" : undefined,
    margin: "0 auto",
  };
}

export function resumeSectionTitleStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    fontSize: ctx.preset.sectionFont,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ctx.preset.letterSpacing,
    color: ctx.accent,
    borderBottom: `0.5px solid ${ctx.accent}`,
    paddingBottom: RESUME_LAYOUT_SHELL.sectionTitlePaddingBottom,
    marginBottom: RESUME_LAYOUT_SHELL.sectionTitleMarginBottom,
    marginTop: ctx.preset.sectionGap,
  };
}

export function resumeNameStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    fontSize: ctx.preset.nameFont,
    fontWeight: 700,
    letterSpacing: RESUME_LAYOUT_SHELL.headerNameLetterSpacing,
    marginBottom: RESUME_LAYOUT_SHELL.headerNameMarginBottom,
    color: "#111",
  };
}

export function resumeContactStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    fontSize: ctx.preset.metaFont + 0.5,
    color: "#555",
    marginBottom: RESUME_LAYOUT_SHELL.contactMarginBottom,
    display: "flex",
    flexWrap: "wrap",
    gap: RESUME_LAYOUT_SHELL.contactRowGap,
  };
}

export function resumeJobRowStyle(): CSSProperties {
  return { display: "flex", justifyContent: "space-between", alignItems: "baseline" };
}

export function resumeJobTitleStyle(ctx: ResumeLayoutContext): CSSProperties {
  return { fontWeight: 700, fontSize: ctx.preset.baseFont };
}

export function resumeMetaStyle(ctx: ResumeLayoutContext): CSSProperties {
  return { fontSize: ctx.preset.metaFont + 0.5, color: "#666" };
}

export function resumeCompanyLineStyle(ctx: ResumeLayoutContext): CSSProperties {
  return { fontSize: ctx.preset.baseFont - 0.5, color: "#333" };
}

export function resumeBulletStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    fontSize: ctx.preset.bodyFont,
    marginLeft: RESUME_LAYOUT_SHELL.bulletIndentPx,
    marginBottom: ctx.preset.bulletGap,
    color: "#222",
  };
}

export function resumeSummaryStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    fontSize: ctx.preset.bodyFont,
    color: "#333",
    lineHeight: ctx.preset.summaryLineHeight,
    margin: 0,
  };
}

export function resumeMetaSmallStyle(ctx: ResumeLayoutContext): CSSProperties {
  return { fontSize: ctx.preset.metaFont, color: "#666" };
}

export function resumeEntryBlockStyle(ctx: ResumeLayoutContext): CSSProperties {
  return { marginBottom: ctx.preset.entryGap };
}

export function resumeSecondaryEntryBlockStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    marginBottom: Math.max(
      RESUME_LAYOUT_SHELL.secondaryEntryMarginFloor,
      ctx.preset.entryGap - RESUME_LAYOUT_SHELL.secondaryEntryMarginFloor,
    ),
  };
}

export function resumeSkillsGridStyle(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "4px 16px",
    marginBottom: RESUME_LAYOUT_SHELL.sectionTitleMarginBottom,
  };
}

export function resumeSkillsTextStyle(ctx: ResumeLayoutContext): CSSProperties {
  return {
    fontSize: ctx.preset.bodyFont,
    color: "#333",
    lineHeight: ctx.preset.skillsLineHeight,
  };
}

/* ── Analyze/Tailor block builders (structured + text paths) ── */

export type ResumeSectionRole =
  | "education"
  | "experience"
  | "skills"
  | "projects"
  | "summary"
  | "activities"
  | "other";

export function isTechnologiesLine(line: string): boolean {
  return /^technologies\s*:/i.test(line.trim());
}

export function paragraphBlockStyle(
  role: ResumeSectionRole | null,
  lines: string[],
): CSSProperties {
  if (role === "summary" || role === "skills") {
    return { marginTop: 0, marginBottom: 0 };
  }
  if (role === "experience") {
    if (lines.some((l) => isTechnologiesLine(l))) {
      return { marginTop: 0, marginBottom: "var(--az-resume-entry-gap, 8px)" };
    }
    return { marginTop: 0, marginBottom: 2 };
  }
  if (role === "education") {
    return { marginTop: 0, marginBottom: 2 };
  }
  return { marginTop: 0, marginBottom: 4 };
}

export function bulletsBlockStyle(role: ResumeSectionRole | null): CSSProperties {
  if (role === "experience") {
    return { marginTop: 0, marginBottom: 2 };
  }
  return { marginTop: 0, marginBottom: 4 };
}

/** Inline <style> for AnalyzeLiveResumeBody bullet rows — values use CSS vars from resumeLayoutCssVars. */
export const RESUME_BULLET_STYLESHEET = `
  .az-resume-bullet {
    position: relative;
    padding: 0 4px 0 12px;
    border-radius: 2px;
    margin-bottom: var(--az-resume-bullet-gap, 2px);
    cursor: default;
    transition: background 0.12s;
  }
  .az-resume-bullet--tailor {
    padding: 2px 6px 2px 14px;
  }
  .az-resume-bullet::before {
    content: "•";
    position: absolute;
    left: 0;
    top: 0.15em;
    color: var(--resume-paper-dim);
    font-size: var(--az-resume-body-font-size, 10px);
    line-height: inherit;
  }
  .az-clean-export .az-resume-bullet {
    border-left-color: transparent !important;
    background: transparent !important;
    box-shadow: none !important;
    animation: none !important;
    cursor: default !important;
  }
  .az-clean-export .az-score-badge,
  .az-clean-export .az-preview-applied-mark {
    display: none !important;
  }
  .az-highlights-off .az-resume-bullet,
  .az-highlights-off [data-bullet-idx] {
    background: transparent !important;
    border-left: none !important;
    box-shadow: none !important;
    animation: none !important;
  }
  .az-highlights-off .az-metric {
    font-weight: inherit !important;
    color: inherit !important;
    background: transparent !important;
  }
`;
