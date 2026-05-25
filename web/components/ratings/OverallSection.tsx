"use client";

import { scoreColor } from "./scoreColor";

type Props = {
  overallScore: number;
  verdict?: string;
  whats_working?: string[];
  gaps?: string[];
  keywords?: { found_count: number; total_count: number };
  qualifications?: { covered: unknown[]; missing: unknown[] };
  responsibilities?: { covered: unknown[]; missing: unknown[] };
};

function qualityLabel(score: number) {
  if (score >= 80) return { label: "EXCELLENT", color: "var(--green, #34d399)", bg: "rgba(52,211,153,0.12)" };
  if (score >= 65) return { label: "GOOD", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  if (score >= 45) return { label: "FAIR", color: "#f97316", bg: "rgba(249,115,22,0.12)" };
  return { label: "NEEDS WORK", color: "#f87171", bg: "rgba(248,113,113,0.12)" };
}

export function OverallSection({
  overallScore,
  verdict,
  whats_working = [],
  gaps = [],
  keywords,
  qualifications,
  responsibilities,
}: Props) {
  const ql = qualityLabel(overallScore);
  const pct = Math.min(100, Math.max(0, overallScore));

  const missingKeywords = keywords
    ? keywords.total_count - keywords.found_count
    : 0;
  const missingQuals = qualifications ? qualifications.missing.length : 0;
  const coveredQuals = qualifications ? qualifications.covered.length : 0;
  const coveredResp = responsibilities ? responsibilities.covered.length : 0;

  return (
    <div>
      {/* ── Score card ───────────────────────────────────── */}
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--dim)",
            }}
          >
            JOB MATCH SCORE
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 6,
              background: ql.bg,
              color: ql.color,
              letterSpacing: 0.4,
            }}
          >
            {ql.label}
          </span>
        </div>

        {/* Big score */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 52,
              fontWeight: 900,
              color: scoreColor(pct),
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {overallScore}
          </span>
          <span style={{ fontSize: 20, fontWeight: 600, color: "var(--dim)" }}>/100</span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "rgba(148,163,184,0.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 4,
              background: scoreColor(pct),
              transition: "width 0.6s ease",
            }}
          />
        </div>
      </div>

      {/* ── AI Verdict ───────────────────────────────────── */}
      {verdict && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 14 }}>⚡</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text)",
                letterSpacing: 0.1,
              }}
            >
              AI Verdict
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.65,
            }}
          >
            {verdict}
          </p>
        </div>
      )}

      {/* ── Key Strengths + Attention Needed ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* Key Strengths */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid rgba(52,211,153,0.2)",
            background: "var(--surface2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 13 }}>✅</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              Key Strengths
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Job Title Match</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green, #34d399)" }}>100%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Keywords Found</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green, #34d399)" }}>
                {keywords?.found_count ?? 0}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Major Quals Met</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green, #34d399)" }}>
                {coveredQuals}
              </span>
            </div>
            {coveredResp > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Responsibilities</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green, #34d399)" }}>
                  {coveredResp}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Attention Needed */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid rgba(248,113,113,0.2)",
            background: "var(--surface2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 13 }}>⚠️</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              Attention Needed
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Missing keywords</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>
                {missingKeywords}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Missing Quals</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>
                {missingQuals}
              </span>
            </div>
            {gaps.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Gaps to Address</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>
                  {gaps.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── What's Working ───────────────────────────────── */}
      {whats_working.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--green, #34d399)",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            What&apos;s Working
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {whats_working.map((w, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--muted)",
                  lineHeight: 1.55,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--green, #34d399)", flexShrink: 0, marginTop: 1 }}>✓</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gaps to Address ──────────────────────────────── */}
      {gaps.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#f87171",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Gaps to Address
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gaps.map((g, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--muted)",
                  lineHeight: 1.55,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "#f87171", flexShrink: 0, marginTop: 1 }}>→</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
