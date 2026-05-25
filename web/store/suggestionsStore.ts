"use client";

import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Suggestion {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface SuggestionsStore {
  // ── Data ──
  suggestions: Suggestion[];
  summary: string;
  /** JD gap / interview coaching — shown before generate, not applied to the PDF. */
  strategicTips: string[];
  /** Role-specific interview questions predicted by the coach LLM. */
  interviewQuestions: string[];
  /** Accumulated streamed text from /api/suggest-changes-stream. */
  streamText: string;
  acceptedIds: Set<string>;
  rejectedIds: Set<string>;
  selectedId: string | null;

  // ── Async state ──
  loading: boolean;
  error: string | null;
  /** Progress step count for loader animation. */
  stepsDone: number;

  // ── Actions ──
  hydrate: (suggestions: Suggestion[], summary: string, strategicTips?: string[], interviewQuestions?: string[]) => void;
  appendStream: (chunk: string) => void;
  accept: (id: string) => void;
  reject: (id: string) => void;
  undoAccept: (id: string) => void;
  undoReject: (id: string) => void;
  select: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  incrementStep: () => void;
  reset: () => void;

  // ── Derived helpers ──
  acceptedSuggestions: () => Suggestion[];
  pendingSuggestions: () => Suggestion[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

const initial = () => ({
  suggestions: [] as Suggestion[],
  summary: "",
  strategicTips: [] as string[],
  interviewQuestions: [] as string[],
  streamText: "",
  acceptedIds: new Set<string>(),
  rejectedIds: new Set<string>(),
  selectedId: null as string | null,
  loading: false,
  error: null as string | null,
  stepsDone: 0,
});

export const useSuggestionsStore = create<SuggestionsStore>((set, get) => ({
  ...initial(),

  hydrate: (suggestions, summary, strategicTips = [], interviewQuestions = []) =>
    set({
      suggestions,
      summary,
      strategicTips: strategicTips.filter((t) => typeof t === "string" && t.trim().length > 0).slice(0, 4),
      interviewQuestions: interviewQuestions.filter((q) => typeof q === "string" && q.trim().length > 0).slice(0, 8),
      streamText: "",
      acceptedIds: new Set(),
      rejectedIds: new Set(),
      selectedId: null,
      error: null,
    }),

  appendStream: (chunk) =>
    set((s) => ({ streamText: s.streamText + chunk })),

  accept: (id) =>
    set((s) => {
      const next = new Set(s.acceptedIds);
      next.add(id);
      const rej = new Set(s.rejectedIds);
      rej.delete(id);
      return { acceptedIds: next, rejectedIds: rej };
    }),

  reject: (id) =>
    set((s) => {
      const next = new Set(s.rejectedIds);
      next.add(id);
      const acc = new Set(s.acceptedIds);
      acc.delete(id);
      return { rejectedIds: next, acceptedIds: acc };
    }),

  undoAccept: (id) =>
    set((s) => { const next = new Set(s.acceptedIds); next.delete(id); return { acceptedIds: next }; }),

  undoReject: (id) =>
    set((s) => { const next = new Set(s.rejectedIds); next.delete(id); return { rejectedIds: next }; }),

  select: (id) => set({ selectedId: id }),

  setLoading: (loading) => set({ loading, ...(loading ? { error: null, stepsDone: 0 } : {}) }),

  setError: (error) => set({ error, loading: false }),

  incrementStep: () => set((s) => ({ stepsDone: Math.min(s.stepsDone + 1, 3) })),

  reset: () => set(initial()),

  acceptedSuggestions: () => {
    const { suggestions, acceptedIds } = get();
    return suggestions.filter((s) => acceptedIds.has(s.id));
  },

  pendingSuggestions: () => {
    const { suggestions, acceptedIds, rejectedIds } = get();
    return suggestions.filter((s) => !acceptedIds.has(s.id) && !rejectedIds.has(s.id));
  },
}));
