/** Shared colour helper used across all ratings sub-components. */
export function scoreColor(pct: number): string {
  if (pct >= 75) return "var(--green, #34d399)";
  if (pct >= 50) return "#f59e0b";
  return "#f87171";
}
