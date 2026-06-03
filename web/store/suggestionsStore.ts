"use client";

import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestionCategory =
  | "quantify_impact"
  | "action_verbs"
  | "add_keywords"
  | "relevance"
  | "remove_filler"
  | "strengthen_impact";

export const CATEGORY_META: Record<SuggestionCategory, { label: string; emoji: string; color: string; bg: string }> = {
  quantify_impact:   { label: "Quantify Impact",  emoji: "📊", color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  action_verbs:      { label: "Action Verbs",     emoji: "⚡", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)"  },
  add_keywords:      { label: "Add Keywords",     emoji: "🔑", color: "#3b82f6", bg: "rgba(59,130,246,0.1)"  },
  relevance:         { label: "Relevance",         emoji: "🎯", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  remove_filler:     { label: "Remove Filler",     emoji: "✂️", color: "#64748b", bg: "rgba(100,116,139,0.1)"},
  strengthen_impact: { label: "Strengthen Impact", emoji: "💪", color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
};

/** Category order: highest-impact types first */
export const CATEGORY_ORDER: SuggestionCategory[] = [
  "add_keywords",
  "quantify_impact",
  "strengthen_impact",
  "relevance",
  "action_verbs",
  "remove_filler",
];

export interface Suggestion {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: "high" | "medium" | "low";
  /** Normalised by hydrate() — may be absent on old API responses. */
  category?: SuggestionCategory;
}

export type CategoryStatus = "pending" | "done" | "skipped";

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
  /** Active category being reviewed in the fix panel. */
  activeCategory: SuggestionCategory | null;
  /** Per-category completion status. */
  categoryStatus: Map<SuggestionCategory, CategoryStatus>;

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
  /** Update suggested text without resetting accept/reject state. */
  updateSuggested: (id: string, suggested: string) => void;
  setActiveCategory: (cat: SuggestionCategory | null) => void;
  markCategoryDone: (cat: SuggestionCategory) => void;
  markCategorySkipped: (cat: SuggestionCategory) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  incrementStep: () => void;
  reset: () => void;

  // ── Derived helpers ──
  acceptedSuggestions: () => Suggestion[];
  pendingSuggestions: () => Suggestion[];
  suggestionsForCategory: (cat: SuggestionCategory) => Suggestion[];
  categoriesPresent: () => SuggestionCategory[];
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
  activeCategory: null as SuggestionCategory | null,
  categoryStatus: new Map<SuggestionCategory, CategoryStatus>(),
  loading: false,
  error: null as string | null,
  stepsDone: 0,
});

export const useSuggestionsStore = create<SuggestionsStore>((set, get) => ({
  ...initial(),

  hydrate: (suggestions, summary, strategicTips = [], interviewQuestions = []) => {
    // Normalise: ensure every suggestion has a valid category
    const normalised = suggestions.map((s, i) => ({
      ...s,
      category: (s.category && s.category in CATEGORY_META)
        ? s.category
        : ("strengthen_impact" as SuggestionCategory),
      id: s.id || `s${i + 1}`,
    }));
    // Open the first category automatically
    const cats = CATEGORY_ORDER.filter((c) => normalised.some((s) => s.category === c));
    // Start with all suggestions pending — user reviews and accepts/skips each one.
    set({
      suggestions: normalised,
      summary,
      strategicTips: strategicTips.filter((t) => typeof t === "string" && t.trim().length > 0).slice(0, 4),
      interviewQuestions: interviewQuestions.filter((q) => typeof q === "string" && q.trim().length > 0).slice(0, 8),
      streamText: "",
      acceptedIds: new Set(),
      rejectedIds: new Set(),
      selectedId: null,
      activeCategory: cats[0] ?? null,
      categoryStatus: new Map(),
      error: null,
    });
  },

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

  updateSuggested: (id, suggested) =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.id === id ? { ...sg, suggested } : sg,
      ),
    })),

  setActiveCategory: (cat) => set({ activeCategory: cat }),

  markCategoryDone: (cat) =>
    set((s) => {
      const next = new Map(s.categoryStatus);
      next.set(cat, "done");
      // Auto-advance to next pending category
      const cats = CATEGORY_ORDER.filter((c) => s.suggestions.some((sg) => sg.category === c));
      const idx = cats.indexOf(cat);
      const nextCat = cats.slice(idx + 1).find((c) => next.get(c) !== "done" && next.get(c) !== "skipped") ?? null;
      return { categoryStatus: next, activeCategory: nextCat };
    }),

  markCategorySkipped: (cat) =>
    set((s) => {
      const next = new Map(s.categoryStatus);
      next.set(cat, "skipped");
      const cats = CATEGORY_ORDER.filter((c) => s.suggestions.some((sg) => sg.category === c));
      const idx = cats.indexOf(cat);
      const nextCat = cats.slice(idx + 1).find((c) => next.get(c) !== "done" && next.get(c) !== "skipped") ?? null;
      return { categoryStatus: next, activeCategory: nextCat };
    }),

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

  suggestionsForCategory: (cat) => {
    const { suggestions } = get();
    return suggestions.filter((s) => (s.category ?? "strengthen_impact") === cat);
  },

  categoriesPresent: () => {
    const { suggestions } = get();
    return CATEGORY_ORDER.filter((c) => suggestions.some((s) => (s.category ?? "strengthen_impact") === c));
  },
}));
