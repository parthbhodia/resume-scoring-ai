"use client";

import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors API bullet row — kept stable for PDF line matching. */
export interface AnalyzeBulletSnapshot {
  originalBullet: string;
  score: number;
  issues: string[];
  improvedBullet: string;
}

export type AnnotationTone = "weak" | "fair" | "strong";

/** Structured resume model returned by the backend's _llm_extract(). */
export interface StructuredResumeExperience {
  company: string;
  role: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface StructuredResumeEducation {
  institution: string;
  degree: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface StructuredResumeProject {
  name: string;
  tech: string;
  bullets: string[];
}

export interface StructuredResumeSkill {
  category: string;
  items: string[];
}

export interface StructuredResumeExtraSection {
  title: string;
  lines: string[];
}

export interface StructuredResume {
  full_name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  summary: string;
  skills: StructuredResumeSkill[];
  experience: StructuredResumeExperience[];
  education: StructuredResumeEducation[];
  projects: StructuredResumeProject[];
  extra_sections: StructuredResumeExtraSection[];
  section_order?: string[];
}

/** Maps flat bulletAnalysis[flatIdx] → position in structuredResume.experience. */
export interface BulletMapEntry {
  experienceIdx: number;
  bulletIdx: number;
}

/** Coerce a backend structured payload into a fully-populated StructuredResume.
 *  Legacy / partial payloads may omit education/projects/section_order — default
 *  them to [] so consumers never have to null-check those arrays. */
export function normalizeStructuredResume(
  s: StructuredResume | null | undefined,
): StructuredResume | null {
  if (!s) return null;
  return {
    full_name: s.full_name ?? "",
    headline: s.headline ?? "",
    location: s.location ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    linkedin: s.linkedin ?? "",
    github: s.github ?? "",
    summary: s.summary ?? "",
    skills: Array.isArray(s.skills) ? s.skills : [],
    experience: Array.isArray(s.experience) ? s.experience : [],
    education: Array.isArray(s.education) ? s.education : [],
    projects: Array.isArray(s.projects) ? s.projects : [],
    extra_sections: Array.isArray(s.extra_sections) ? s.extra_sections : [],
    section_order: Array.isArray(s.section_order) ? s.section_order : undefined,
  };
}

export interface ResumeAnalyzeHydratePayload {
  extractedText?: string | null;
  bulletAnalysis: AnalyzeBulletSnapshot[];
  resumeHeader?: string[];
  structuredResume?: StructuredResume | null;
  bulletMap?: BulletMapEntry[];
}

// ─── LocalStorage persistence ─────────────────────────────────────────────────

const LS_PREFIX = "rn_az_edit_v2_";

interface PersistedEdits {
  version: 2;
  lineOverrides: Record<string, string>;
  rewriteEdits: Record<string, string>;
  acceptedBullets: Record<string, "ai" | "custom">;
  savedAt: string;
}

function lsKey(id: string) { return `${LS_PREFIX}${id}`; }

function loadPersistedEdits(id: string): PersistedEdits | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = localStorage.getItem(lsKey(id));
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedEdits;
    return p?.version === 2 ? p : null;
  } catch { return null; }
}

function savePersistedEdits(
  id: string,
  lineOverrides: Record<number, string>,
  rewriteEdits: Record<number, string>,
  acceptedBullets: Record<number, "ai" | "custom">,
) {
  if (typeof window === "undefined" || !id) return;
  const clean = <T>(rec: Record<number, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec)) if (v !== undefined) out[k] = v;
    return out;
  };
  try {
    localStorage.setItem(lsKey(id), JSON.stringify({
      version: 2,
      lineOverrides: clean(lineOverrides),
      rewriteEdits: clean(rewriteEdits),
      acceptedBullets: clean(acceptedBullets),
      savedAt: new Date().toISOString(),
    } satisfies PersistedEdits));
  } catch { /* quota */ }
}

function clearPersistedEdits(id: string) {
  if (typeof window === "undefined" || !id) return;
  try { localStorage.removeItem(lsKey(id)); } catch { /* ignore */ }
}

function migratePersistedEdits(oldId: string, newId: string) {
  if (typeof window === "undefined" || !oldId || !newId || oldId === newId) return;
  try {
    const raw = localStorage.getItem(lsKey(oldId));
    if (!raw) return;
    localStorage.setItem(lsKey(newId), raw);
    localStorage.removeItem(lsKey(oldId));
  } catch { /* ignore */ }
}

// ─── Store interface ──────────────────────────────────────────────────────────

export interface ResumeAnalyzeStore {
  // ── Analysis data ──
  extractedText: string;
  resumeHeader: string[];
  analysisBullets: AnalyzeBulletSnapshot[];
  annotationByIndex: Record<number, AnnotationTone>;
  /** Faithfully-extracted structured model (no JD tailoring). Available after analyze-upload. */
  structuredResume: StructuredResume | null;
  /** Maps flat bulletAnalysis index → {experienceIdx, bulletIdx} in structuredResume. */
  bulletMap: BulletMapEntry[];

  // ── Edit state (single source of truth — replaces rewriteEdits useState + analyzeEditDraft.ts) ──
  /** Preview line overrides applied to the resume document. */
  lineOverrides: Record<number, string>;
  /** User's working draft text for each bullet (pre-accept edits). */
  rewriteEdits: Record<number, string>;
  /** Formally accepted bullets: "ai" = accepted AI suggestion, "custom" = user wrote own. */
  acceptedBullets: Record<number, "ai" | "custom">;

  // ── UI state ──
  pulseBulletIndex: number | null;
  pulseToken: number;

  // ── Analysis actions ──
  hydrateFromAnalysis: (payload: ResumeAnalyzeHydratePayload) => void;
  reset: () => void;

  // ── Edit actions ──
  setLineOverride: (index: number, text: string) => void;
  clearLineOverride: (index: number) => void;
  replaceLineOverrides: (map: Record<number, string>) => void;
  patchRewrite: (index: number, text: string | null) => void;
  acceptBullet: (index: number, text: string, kind: "ai" | "custom") => void;
  unacceptBullet: (index: number) => void;

  // ── Persistence actions ──
  /** Persist current edit state under a draft ID (replaces saveAnalyzeEditDraft). */
  persistEdits: (draftId: string) => void;
  /** Restore persisted edits from localStorage (replaces loadAnalyzeEditDraft). */
  restoreEdits: (draftId: string) => boolean;
  /** Clear persisted edits (replaces clearAnalyzeEditDraft). */
  clearEdits: (draftId: string) => void;
  /** Move persisted draft to a new ID (replaces migrateAnalyzeEditDraft). */
  migrateEdits: (oldId: string, newId: string) => void;

  // ── Focus pulse ──
  pulseBullet: (index: number) => void;
  clearPulse: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tierFromScore(score: number): AnnotationTone {
  if (score >= 75) return "strong";
  if (score >= 55) return "fair";
  return "weak";
}

const emptyEdits = () => ({
  lineOverrides: {} as Record<number, string>,
  rewriteEdits: {} as Record<number, string>,
  acceptedBullets: {} as Record<number, "ai" | "custom">,
});

const initial = () => ({
  extractedText: "",
  resumeHeader: [] as string[],
  analysisBullets: [] as AnalyzeBulletSnapshot[],
  annotationByIndex: {} as Record<number, AnnotationTone>,
  structuredResume: null as StructuredResume | null,
  bulletMap: [] as BulletMapEntry[],
  ...emptyEdits(),
  pulseBulletIndex: null as number | null,
  pulseToken: 0,
});

// ─── Store ────────────────────────────────────────────────────────────────────

export const useResumeAnalyzeStore = create<ResumeAnalyzeStore>((set, get) => ({
  ...initial(),

  hydrateFromAnalysis: (payload) => {
    const bullets = (payload.bulletAnalysis ?? []).map((b) => ({
      ...b,
      issues: Array.isArray(b.issues) ? b.issues : [],
    }));
    const annotationByIndex: Record<number, AnnotationTone> = {};
    bullets.forEach((b, i) => { annotationByIndex[i] = tierFromScore(b.score); });
    set({
      extractedText: (payload.extractedText ?? "").trim().slice(0, 50000),
      resumeHeader: payload.resumeHeader ?? [],
      analysisBullets: bullets,
      annotationByIndex,
      structuredResume: normalizeStructuredResume(payload.structuredResume),
      bulletMap: payload.bulletMap ?? [],
      ...emptyEdits(),
      pulseBulletIndex: null,
      pulseToken: 0,
    });
  },

  reset: () => set(initial()),

  setLineOverride: (index, text) => {
    set((s) => {
      const next = { ...s.lineOverrides };
      if (!text.trim()) delete next[index];
      else next[index] = text;
      return { lineOverrides: next, pulseBulletIndex: index, pulseToken: s.pulseToken + 1 };
    });
  },

  clearLineOverride: (index) => {
    set((s) => {
      const next = { ...s.lineOverrides };
      delete next[index];
      return { lineOverrides: next, pulseBulletIndex: index, pulseToken: s.pulseToken + 1 };
    });
  },

  replaceLineOverrides: (map) => {
    const next: Record<number, string> = {};
    for (const [k, v] of Object.entries(map)) {
      const idx = Number(k);
      if (Number.isFinite(idx) && typeof v === "string" && v.trim()) next[idx] = v;
    }
    set({ lineOverrides: next, pulseBulletIndex: null });
  },

  patchRewrite: (index, text) => {
    set((s) => {
      const next = { ...s.rewriteEdits };
      if (text === null) delete next[index];
      else next[index] = text;
      return { rewriteEdits: next };
    });
  },

  acceptBullet: (index, text, kind) => {
    const t = text.trim();
    if (!t) return;
    set((s) => ({
      lineOverrides: { ...s.lineOverrides, [index]: t },
      rewriteEdits: { ...s.rewriteEdits, [index]: t },
      acceptedBullets: { ...s.acceptedBullets, [index]: kind },
      pulseBulletIndex: index,
      pulseToken: s.pulseToken + 1,
    }));
  },

  unacceptBullet: (index) => {
    set((s) => {
      const lo = { ...s.lineOverrides };
      const ab = { ...s.acceptedBullets };
      delete lo[index];
      delete ab[index];
      return { lineOverrides: lo, acceptedBullets: ab, pulseBulletIndex: index, pulseToken: s.pulseToken + 1 };
    });
  },

  persistEdits: (draftId) => {
    const { lineOverrides, rewriteEdits, acceptedBullets } = get();
    savePersistedEdits(draftId, lineOverrides, rewriteEdits, acceptedBullets);
  },

  restoreEdits: (draftId) => {
    const saved = loadPersistedEdits(draftId);
    if (!saved) return false;
    const toNum = (rec: Record<string, string>) => {
      const out: Record<number, string> = {};
      for (const [k, v] of Object.entries(rec)) {
        const n = Number(k);
        if (Number.isFinite(n) && typeof v === "string" && v.trim()) out[n] = v;
      }
      return out;
    };
    const ab: Record<number, "ai" | "custom"> = {};
    for (const [k, v] of Object.entries(saved.acceptedBullets ?? {})) {
      const n = Number(k);
      if (Number.isFinite(n) && (v === "ai" || v === "custom")) ab[n] = v;
    }
    set({ lineOverrides: toNum(saved.lineOverrides ?? {}), rewriteEdits: toNum(saved.rewriteEdits ?? {}), acceptedBullets: ab });
    return true;
  },

  clearEdits: (draftId) => clearPersistedEdits(draftId),

  migrateEdits: (oldId, newId) => migratePersistedEdits(oldId, newId),

  pulseBullet: (index) =>
    set((s) => ({ pulseBulletIndex: index, pulseToken: s.pulseToken + 1 })),

  clearPulse: () => set({ pulseBulletIndex: null }),
}));
