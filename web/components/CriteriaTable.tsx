"use client";
import type { Criterion } from "@/lib/types";
import { scoreColor, weightColor } from "@/lib/utils";

interface Props { criteria: Criterion[] }

export default function CriteriaTable({ criteria }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {criteria.map((c, i) => {
        const sc     = scoreColor(c.score * 10);
        const wc     = weightColor(c.weight);
        const alert  = c.score <= 2;
        return (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 58px 100px 1.4fr",
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

            {/* Weight badge */}
            <div style={{
              fontSize: 11, fontWeight: 600, padding: "3px 8px",
              borderRadius: 4, textAlign: "center",
              letterSpacing: -0.1,
              background: wc.bg, color: wc.color,
            }}>
              {c.weight === "High" ? "High" : c.weight === "Medium" ? "Med" : "Low"}
            </div>

            {/* Score bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
