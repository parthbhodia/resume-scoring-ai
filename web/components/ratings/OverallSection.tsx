"use client";

type Props = {
  whats_working?: string[];
  gaps?: string[];
  keywords?: { found_count: number; total_count: number };
  qualifications?: { covered: unknown[]; missing: unknown[] };
  responsibilities?: { covered: unknown[]; missing: unknown[] };
};

export function OverallSection({
  whats_working = [],
  gaps = [],
  keywords,
  qualifications,
  responsibilities,
}: Props) {
  const missingKeywords = keywords
    ? keywords.total_count - keywords.found_count
    : 0;
  const missingQuals = qualifications ? qualifications.missing.length : 0;
  const coveredQuals = qualifications ? qualifications.covered.length : 0;
  const coveredResp = responsibilities ? responsibilities.covered.length : 0;

  return (
    <div>
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
