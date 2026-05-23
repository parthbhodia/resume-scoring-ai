"use client";

import type { Criterion } from "@/lib/types";
import { scoreColor, weightColor } from "@/lib/utils";

export default function MatchBreakdownCards({
  criteria,
  onImprove,
  onFixGap,
  fixingGap,
}: {
  criteria: Criterion[];
  onImprove?: () => void;
  /** Called when user clicks "Fix this gap →" on a specific criterion. */
  onFixGap?: (gap: Criterion) => void;
  /** Name of the gap currently being fixed (shows loading state on that card). */
  fixingGap?: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {criteria.map((c, i) => {
        const sc = scoreColor(c.score * 10);
        const wc = weightColor(c.weight);
        const weak = c.score <= 5;
        const notes = (c.notes ?? "").replace(/^\s+/, "").trimEnd();
        const isFixing = fixingGap === c.name;
        return (
          <div
            key={i}
            style={{
              borderRadius: 12,
              border: `1px solid ${c.score <= 3 ? "rgba(248,113,113,0.22)" : "var(--border)"}`,
              background: c.score <= 3 ? "rgba(248,113,113,0.04)" : "var(--surface2)",
              padding: "12px 14px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: notes || (weak && (onImprove || onFixGap)) ? 8 : 0,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text)",
                  letterSpacing: -0.35,
                  flex: "1 1 160px",
                  minWidth: 0,
                  lineHeight: 1.25,
                }}
              >
                {c.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span
                  title="JD importance"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: wc.bg,
                    color: wc.color,
                  }}
                >
                  {c.weight === "High" ? "High" : c.weight === "Medium" ? "Med" : "Low"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: sc, minWidth: 40 }}>{c.score}/10</span>
                <div
                  style={{
                    width: 52,
                    height: 4,
                    borderRadius: 2,
                    background: "rgba(148, 163, 184, 0.35)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: `${c.score * 10}%`, height: "100%", background: sc }} />
                </div>
              </div>
            </div>
            {notes ? (
              <p
                style={{
                  margin: 0,
                  marginBottom: weak && (onImprove || onFixGap) ? 10 : 0,
                  fontSize: 12.5,
                  color: "var(--muted)",
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {notes}
              </p>
            ) : null}
            {weak && (onImprove || onFixGap) ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {onFixGap ? (
                  <button
                    type="button"
                    disabled={isFixing}
                    onClick={() => onFixGap(c)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      borderRadius: 7,
                      border: "1px solid rgba(59,130,246,0.4)",
                      background: isFixing ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.1)",
                      color: "var(--accent)",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: isFixing ? "not-allowed" : "pointer",
                      letterSpacing: -0.2,
                      opacity: isFixing ? 0.7 : 1,
                    }}
                  >
                    {isFixing ? "Getting fixes…" : "Fix this gap →"}
                  </button>
                ) : null}
                {onImprove ? (
                  <button
                    type="button"
                    onClick={onImprove}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 11px",
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--muted)",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      letterSpacing: -0.2,
                    }}
                  >
                    Get full suggestions
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
