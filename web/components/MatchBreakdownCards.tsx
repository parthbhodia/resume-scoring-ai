"use client";

import Link from "next/link";
import type { Criterion } from "@/lib/types";
import { scoreColor, weightColor } from "@/lib/utils";

export default function MatchBreakdownCards({ criteria }: { criteria: Criterion[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {criteria.map((c, i) => {
        const sc = scoreColor(c.score * 10);
        const wc = weightColor(c.weight);
        const weak = c.score <= 3;
        const notes = (c.notes ?? "").replace(/^\s+/, "").trimEnd();
        return (
          <div
            key={i}
            style={{
              borderRadius: 12,
              border: `1px solid ${weak ? "rgba(248,113,113,0.22)" : "var(--border)"}`,
              background: weak ? "rgba(248,113,113,0.04)" : "var(--surface2)",
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
                marginBottom: 8,
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <Link
                href="/?view=profile"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  minHeight: 36,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  color: "var(--accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: "inherit",
                }}
              >
                Add detail in profile
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
