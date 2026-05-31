import type { TBFont, TBPageWidth, TBStylePreset } from "./types";

export interface TBStylePresetOption {
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

export interface TBPageWidthOption {
  id: TBPageWidth;
  label: string;
  description: string;
  paddingX: number;
  paddingY: number;
}

export const STYLE_PRESETS: TBStylePresetOption[] = [
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

export const PAGE_WIDTH_OPTIONS: TBPageWidthOption[] = [
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
    description: "Balanced spacing for most resumes.",
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

export function getStylePreset(id?: TBStylePreset): TBStylePresetOption {
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? STYLE_PRESETS[0];
}

export function getPageWidth(id?: TBPageWidth): TBPageWidthOption {
  return PAGE_WIDTH_OPTIONS.find((option) => option.id === id) ?? PAGE_WIDTH_OPTIONS[1];
}
