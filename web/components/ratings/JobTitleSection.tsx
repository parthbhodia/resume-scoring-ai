"use client";

import type { JobTitleRating } from "@/lib/types";
import { ScorePill } from "./ScorePill";

export function JobTitleSection({ jobTitle }: { jobTitle: JobTitleRating }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--dim)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        Job Title Match
      </div>

      <div
        style={{
          padding: "20px 24px",
          borderRadius: 12,
          border: `1px solid ${jobTitle.matched ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
          background: jobTitle.matched ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: jobTitle.matched ? "var(--green, #34d399)" : "#f87171",
            }}
          >
            {jobTitle.matched ? "✓ Title Match" : "✕ Title Mismatch"}
          </span>
          <ScorePill score={jobTitle.score} label="match" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 4,
              }}
            >
              JD Title
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              {jobTitle.jd_title || "—"}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 4,
              }}
            >
              Your Title
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              {jobTitle.resume_title || "—"}
            </div>
          </div>
        </div>

        {jobTitle.detail && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--surface2)",
              fontSize: 12,
              color: "var(--muted)",
              lineHeight: 1.5,
            }}
          >
            {jobTitle.detail}
          </div>
        )}
      </div>
    </div>
  );
}
