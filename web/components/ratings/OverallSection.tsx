"use client";

type Props = {
  verdict?: string;
  whats_working?: string[];
  gaps?: string[];
};

export function OverallSection({ verdict, whats_working = [], gaps = [] }: Props) {
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
        Overview
      </div>

      {verdict && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--accent)",
            marginBottom: 20,
            fontSize: 13,
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          {verdict}
        </div>
      )}

      {whats_working.length > 0 && (
        <div style={{ marginBottom: 20 }}>
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
                  lineHeight: 1.5,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--green, #34d399)", flexShrink: 0 }}>✓</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  lineHeight: 1.5,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "#f87171", flexShrink: 0 }}>→</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
