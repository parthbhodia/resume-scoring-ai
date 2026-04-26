"use client";

/**
 * AtsPanel — renders the ATS-readiness report returned by POST /api/ats-check.
 *
 * Three blocks stacked vertically:
 *   1. Score ring + headline stats (page count, word count)
 *   2. Structural checklist (text-extractable, single-column, sections, ...)
 *   3. Keyword coverage table (Found / Partial / Missing, weight-sorted)
 *
 * Pure presentational — the parent owns fetch + state + retry button.
 */

import { useMemo } from "react";

export interface AtsCheck {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

export interface AtsKeyword {
  keyword: string;
  weight: number;        // 1-3
  status: "found" | "partial" | "missing";
  count: number;
  jd_count: number;
}

export interface AtsResult {
  score: number;
  checks: AtsCheck[];
  keywords: AtsKeyword[];
  stats: { page_count: number; word_count: number; char_count: number };
}

const SEV_COLOR = {
  pass: "var(--green)",
  fail: "var(--red)",
};

const STATUS_BG: Record<AtsKeyword["status"], string> = {
  found:   "rgba(76, 217, 100, 0.16)",
  partial: "rgba(255, 204, 0, 0.16)",
  missing: "rgba(255, 95, 95, 0.14)",
};
const STATUS_FG: Record<AtsKeyword["status"], string> = {
  found:   "var(--green)",
  partial: "var(--yellow, #ffc857)",
  missing: "var(--red)",
};

function ringColor(score: number): string {
  if (score >= 85) return "var(--green)";
  if (score >= 65) return "var(--yellow, #ffc857)";
  return "var(--red)";
}

export default function AtsPanel({ result, onRecheck, rechecking }: {
  result: AtsResult;
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  const sortedKeywords = useMemo(() => {
    return [...result.keywords].sort((a, b) => {
      // Missing high-weight first (most actionable), then partial, then found.
      const rank: Record<AtsKeyword["status"], number> = { missing: 0, partial: 1, found: 2 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.keyword.localeCompare(b.keyword);
    });
  }, [result.keywords]);

  const found   = result.keywords.filter(k => k.status === "found").length;
  const partial = result.keywords.filter(k => k.status === "partial").length;
  const missing = result.keywords.filter(k => k.status === "missing").length;
  const passed  = result.checks.filter(c => c.pass).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Score header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 18,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "16px 18px",
      }}>
        <Ring score={result.score} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase", marginBottom: 4 }}>
            ATS readiness
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", letterSpacing: -0.2, lineHeight: 1.45 }}>
            {result.score >= 85 && "Looking great — most ATS systems will parse this cleanly."}
            {result.score >= 65 && result.score < 85 && "Solid, but a few items below could trip up stricter parsers."}
            {result.score < 65 && "Several issues likely to hurt you on ATS-driven applications."}
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, letterSpacing: -0.1 }}>
            {result.stats.page_count} page · {result.stats.word_count.toLocaleString()} words ·
            {" "}{passed}/{result.checks.length} structural checks pass
            {result.keywords.length > 0 && (
              <> · {found} found · {partial} partial · {missing} missing keyword{missing === 1 ? "" : "s"}</>
            )}
          </div>
        </div>
        {onRecheck && (
          <button
            onClick={onRecheck}
            disabled={rechecking}
            style={{
              fontSize: 11, padding: "6px 12px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 7, color: "var(--text)",
              cursor: rechecking ? "wait" : "pointer", fontFamily: "inherit",
              opacity: rechecking ? 0.6 : 1,
            }}
          >{rechecking ? "Re-checking…" : "Re-check"}</button>
        )}
      </div>

      {/* Structural checks */}
      <div>
        <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase", marginBottom: 8 }}>
          Structural checks
        </div>
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, overflow: "hidden",
        }}>
          {result.checks.map((c, i) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 16px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: c.pass ? SEV_COLOR.pass : SEV_COLOR.fail,
                color: "#fff", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>{c.pass ? "✓" : "✗"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text)", letterSpacing: -0.2, fontWeight: c.pass ? 400 : 500 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2, letterSpacing: -0.1 }}>
                  {c.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyword coverage */}
      {result.keywords.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--dim)", padding: "8px 4px" }}>
          (No JD provided — keyword coverage skipped.)
        </div>
      ) : (
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase" }}>
              Keyword coverage from JD
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--dim)" }}>
              <Legend color={STATUS_FG.found}   label="Found" />
              <Legend color={STATUS_FG.partial} label="Partial" />
              <Legend color={STATUS_FG.missing} label="Missing" />
            </div>
          </div>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 10,
            display: "flex", flexWrap: "wrap", gap: 6,
          }}>
            {sortedKeywords.map(k => (
              <span key={k.keyword} title={`weight ${k.weight} · ${k.jd_count}× in JD${k.count ? ` · ${k.count}× in resume` : ""}`}
                style={{
                  fontSize: 11.5, padding: "4px 10px", borderRadius: 999,
                  background: STATUS_BG[k.status], color: STATUS_FG[k.status],
                  fontWeight: k.weight >= 3 ? 600 : 500,
                  letterSpacing: -0.1, lineHeight: 1.3,
                  cursor: "default",
                  border: `1px solid ${STATUS_FG[k.status]}33`,
                }}>
                {k.keyword}
                {k.weight >= 3 && <span style={{ marginLeft: 4, opacity: 0.7 }}>★</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Ring({ score }: { score: number }) {
  const r = 28, c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} stroke="var(--border)" strokeWidth="6" fill="none" />
        <circle cx="35" cy="35" r={r} stroke={ringColor(score)} strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round" transform="rotate(-90 35 35)"
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: -0.6,
      }}>{score}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}
