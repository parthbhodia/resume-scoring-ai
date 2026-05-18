import type { CSSProperties } from "react";

export type SuggestionPriority = "high" | "medium" | "low";

export const PRIORITY_COLOR: Record<SuggestionPriority, string> = {
  high: "var(--red)",
  medium: "var(--amber)",
  low: "var(--muted)",
};

export const PRIORITY_BG: Record<SuggestionPriority, string> = {
  high: "var(--red-bg)",
  medium: "var(--amber-bg)",
  low: "rgba(148,163,184,0.12)",
};

/** Left stripe + résumé line tint — aligned with severity (not card index). */
export const PRIORITY_STRIPE: Record<SuggestionPriority, { border: string; bg: string }> = {
  high: { border: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  medium: { border: "#d97706", bg: "rgba(217, 119, 6, 0.11)" },
  low: { border: "#94a3b8", bg: "rgba(148, 163, 184, 0.14)" },
};

/** PDF text-layer highlights (slightly stronger opacity for legibility). */
export const PRIORITY_PDF_STRIPE: Record<SuggestionPriority, { border: string; bg: string }> = {
  high: { border: "rgba(239, 68, 68, 0.85)", bg: "rgba(239, 68, 68, 0.32)" },
  medium: { border: "rgba(217, 119, 6, 0.75)", bg: "rgba(217, 119, 6, 0.32)" },
  low: { border: "rgba(148, 163, 184, 0.75)", bg: "rgba(148, 163, 184, 0.22)" },
};

export function priorityLabel(p: SuggestionPriority): string {
  if (p === "high") return "HIGH";
  if (p === "medium") return "MEDIUM";
  return "LOW";
}

export function normalizeSuggestionPriority(p: unknown): SuggestionPriority {
  if (p === "high" || p === "medium" || p === "low") return p;
  return "medium";
}

export function stripeStyleForPriority(priority: SuggestionPriority): CSSProperties {
  const c = PRIORITY_STRIPE[priority] ?? PRIORITY_STRIPE.medium;
  return {
    background: c.bg,
    borderLeft: `3px solid ${c.border}`,
    paddingLeft: 6,
    marginLeft: -9,
    borderRadius: "0 3px 3px 0",
  };
}
