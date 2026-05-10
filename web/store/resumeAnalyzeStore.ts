"use client";

import { create } from "zustand";

/** Mirrors API bullet row — kept stable for PDF line matching. */
export interface AnalyzeBulletSnapshot {
  originalBullet: string;
  score: number;
  issues: string[];
  improvedBullet: string;
}

/** Rule-based tint tier for preview highlighting (orthogonal to numeric score chips). */
export type AnnotationTone = "weak" | "fair" | "strong";

export interface ResumeAnalyzeHydratePayload {
  extractedText?: string | null;
  bulletAnalysis: AnalyzeBulletSnapshot[];
  resumeHeader?: string[];
}

function tierFromScore(score: number): AnnotationTone {
  if (score >= 75) return "strong";
  if (score >= 55) return "fair";
  return "weak";
}

export interface ResumeAnalyzeStore {
  /** Plain extract for live doc layout */
  extractedText: string;
  /** Name + contact lines from backend extraction, used as header fallback. */
  resumeHeader: string[];
  analysisBullets: AnalyzeBulletSnapshot[];
  /** Session-only preview replacements (Analyze column, not PDF). */
  lineOverrides: Record<number, string>;
  /** Maps bullet index → tone for future overlays / consistent legend. */
  annotationByIndex: Record<number, AnnotationTone>;
  /** Transient “flash” target after an override or touch (ms timestamp + index). */
  pulseBulletIndex: number | null;
  pulseToken: number;

  hydrateFromAnalysis: (payload: ResumeAnalyzeHydratePayload) => void;
  reset: () => void;
  setLineOverride: (index: number, text: string) => void;
  clearLineOverride: (index: number) => void;
  /** Replace preview line overrides (e.g. after loading a local draft). */
  replaceLineOverrides: (map: Record<number, string>) => void;
  /** Call when user focuses a bullet on the left to nudge preview focus. */
  pulseBullet: (index: number) => void;
  clearPulse: () => void;
}

const initial = (): Pick<
  ResumeAnalyzeStore,
  | "extractedText"
  | "resumeHeader"
  | "analysisBullets"
  | "lineOverrides"
  | "annotationByIndex"
  | "pulseBulletIndex"
  | "pulseToken"
> => ({
  extractedText: "",
  resumeHeader: [],
  analysisBullets: [],
  lineOverrides: {},
  annotationByIndex: {},
  pulseBulletIndex: null,
  pulseToken: 0,
});

export const useResumeAnalyzeStore = create<ResumeAnalyzeStore>((set) => ({
  ...initial(),

  hydrateFromAnalysis: (payload) => {
    const bullets = (payload.bulletAnalysis ?? []).map((b) => ({ ...b }));
    const annotationByIndex: Record<number, AnnotationTone> = {};
    bullets.forEach((b, i) => {
      annotationByIndex[i] = tierFromScore(b.score);
    });
    set({
      extractedText: (payload.extractedText ?? "").trim().slice(0, 50000),
      resumeHeader: payload.resumeHeader ?? [],
      analysisBullets: bullets,
      lineOverrides: {},
      annotationByIndex,
      pulseBulletIndex: null,
      pulseToken: 0,
    });
  },

  reset: () => set(initial()),

  setLineOverride: (index, text) => {
    const t = text.trim();
    set((s) => {
      const next = { ...s.lineOverrides };
      if (!t) delete next[index];
      else next[index] = text;
      return {
        lineOverrides: next,
        pulseBulletIndex: index,
        pulseToken: s.pulseToken + 1,
      };
    });
  },

  clearLineOverride: (index) => {
    set((s) => {
      const next = { ...s.lineOverrides };
      delete next[index];
      return {
        lineOverrides: next,
        pulseBulletIndex: index,
        pulseToken: s.pulseToken + 1,
      };
    });
  },

  replaceLineOverrides: (map) => {
    const next: Record<number, string> = {};
    for (const [k, v] of Object.entries(map)) {
      const idx = Number(k);
      if (!Number.isFinite(idx) || typeof v !== "string") continue;
      const t = v.trim();
      if (t) next[idx] = v;
    }
    set({ lineOverrides: next, pulseBulletIndex: null });
  },

  pulseBullet: (index) =>
    set((s) => ({
      pulseBulletIndex: index,
      pulseToken: s.pulseToken + 1,
    })),

  clearPulse: () => set({ pulseBulletIndex: null }),
}));
