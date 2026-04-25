"use client";
import type { Criterion } from "@/lib/types";
import { scoreColor, weightColor } from "@/lib/utils";

interface Props { criteria: Criterion[] }

// Shared 4-column grid template — header row + body rows must line up.
const GRID_COLS = "1.2fr 78px 110px 1.4fr";

export default function CriteriaTable({ criteria }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Legend — explains the two axes (Importance vs Match) so users don't
          read "High" as "high score". This was a real point of confusion. */}
      <div style={{
        fontSize: 11, color: "var(--dim)", lineHeight: 1.5,
        padding: "6px 14px 4px", letterSpacing: -0.1,
      }}>
        <strong style={{ color: "var(--text)" }}>How to read this:</strong>{" "}
        <span style={{ color: "var(--text)" }}>Importance</span> = how critical the JD says it is.{" "}
        <span style={{ color: "var(--text)" }}>Match</span> = how strongly your resume evidences it.{" "}
        <em>High importance + low match = focus your interview prep here.</em>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 12,
        padding: "0 14px 4px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: "var(--dim)",
      }}>
        <div>Requirement</div>
        <div title="How critical the JD says this requirement is">Importance</div>
        <div title="How strongly your resume evidences this requirement (1–10)">Match</div>
        <div>Why</div>
      </div>

      {criteria.map((c, i) => {
        const sc     = scoreColor(c.score * 10);
        const wc     = weightColor(c.weight);
        const alert  = c.score <= 2;
        return (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: GRID_COLS,
            gap: 12,
            alignItems: "center",
            padding: "11px 14px",
            background: alert ? "rgba(248,113,113,0.06)" : "var(--surface2)",
            borderRadius: "var(--radius)",
          }}>
            {/* Name */}
            <div style={{ fontSize: 12, color: alert ? "var(--red)" : "var(--text)", lineHeight: 1.4 }}>
              {c.name}
            </div>

            {/* Importance badge */}
            <div
              title={`Importance: ${c.weight} — how critical this requirement is in the JD`}
              style={{
                fontSize: 11, fontWeight: 600, padding: "3px 8px",
                borderRadius: 4, textAlign: "center",
                letterSpacing: -0.1,
                background: wc.bg, color: wc.color,
              }}
            >
              {c.weight === "High" ? "High" : c.weight === "Medium" ? "Med" : "Low"}
            </div>

            {/* Match score bar */}
            <div
              title={`Match: ${c.score}/10 — how strongly your resume evidences this`}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: sc, minWidth: 36 }}>
                {c.score}/10
              </span>
              <div style={{ flex: 1, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${c.score * 10}%`,
                  background: sc,
                  transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
                }} />
              </div>
            </div>

            {/* Notes */}
            <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
              {c.notes}
            </div>
          </div>
        );
      })}
    </div>
  );
}
