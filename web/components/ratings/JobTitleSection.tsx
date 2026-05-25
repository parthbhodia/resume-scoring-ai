"use client";

import type { JobTitleRating } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  exact: "exact",
  partial: "partial",
  related: "related",
};

const SECTION_COLOR: Record<string, string> = {
  EXPERIENCE: "#22c55e",
  EDUCATION: "#3b82f6",
  PROJECTS: "#a855f7",
  SKILLS: "#f59e0b",
};

export function JobTitleSection({ jobTitle }: { jobTitle: JobTitleRating }) {
  const refs = jobTitle.references ?? [];
  const pct = Math.min(100, Math.max(0, jobTitle.score));

  const barColor = pct >= 75 ? "var(--green, #34d399)" : pct >= 50 ? "#f59e0b" : "#f87171";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Target Position ──────────────────────────────── */}
      <div
        style={{
          padding: "16px 18px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--dim)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          TARGET POSITION
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--accent)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            {jobTitle.jd_title || "—"}
          </span>
        </div>
      </div>

      {/* ── Found References ─────────────────────────────── */}
      {refs.length > 0 && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--dim)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 14,
            }}
          >
            FOUND JOB TITLE REFERENCES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {refs.map((ref, i) => {
              const sectionColor = SECTION_COLOR[ref.section.toUpperCase()] ?? "var(--accent)";
              return (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "var(--green, #34d399)",
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                  />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: sectionColor,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                        }}
                      >
                        {ref.section}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--dim)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                        }}
                      >
                        {TYPE_LABEL[ref.type] ?? ref.type}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--muted)",
                        fontStyle: "italic",
                      }}
                    >
                      &ldquo;{ref.text}&rdquo;
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Similarity Score ─────────────────────────────── */}
      <div
        style={{
          padding: "16px 18px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Similarity Score
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: barColor,
              letterSpacing: -0.5,
            }}
          >
            {pct}%
          </span>
        </div>
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
              background: barColor,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* ── Assessment ───────────────────────────────────── */}
      {jobTitle.detail && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
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
            <span style={{ fontSize: 13 }}>👁</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              ASSESSMENT
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
            {jobTitle.detail}
          </p>
        </div>
      )}
    </div>
  );
}
