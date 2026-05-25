"use client";

import type { DetailedCategory, DetailedRatingItem } from "@/lib/types";

type Props = {
  category: DetailedCategory;
  onFixGap?: (item: DetailedRatingItem) => void;
};

export function CoveredMissingSection({ category, onFixGap }: Props) {
  const covered = category.covered ?? [];
  const missing = category.missing ?? [];

  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            flex: 1,
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(52,211,153,0.06)",
            border: "1px solid rgba(52,211,153,0.2)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "var(--green, #34d399)",
              letterSpacing: -1,
            }}
          >
            {covered.length}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--green, #34d399)",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            ✓ Covered
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.2)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f87171", letterSpacing: -1 }}>
            {missing.length}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#f87171",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            ✕ Missing
          </div>
        </div>
      </div>

      {/* Missing items */}
      {missing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(248,113,113,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>✕</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", letterSpacing: 0.2 }}>
              Missing ({missing.length})
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {missing.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(248,113,113,0.2)",
                  background: "var(--surface)",
                  borderLeft: "3px solid #f87171",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                    marginBottom: item.analysis ? 8 : 0,
                    lineHeight: 1.4,
                  }}
                >
                  {item.text}
                </div>
                {item.analysis && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 7,
                      background: "rgba(248,113,113,0.06)",
                      marginBottom: onFixGap ? 8 : 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#f87171",
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        marginRight: 6,
                      }}
                    >
                      Analysis
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                      {item.analysis}
                    </span>
                  </div>
                )}
                {onFixGap && (
                  <button
                    type="button"
                    onClick={() => onFixGap(item)}
                    style={{
                      marginTop: 6,
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(59,130,246,0.4)",
                      background: "rgba(59,130,246,0.08)",
                      color: "var(--accent)",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    Fix this gap →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Covered items */}
      {covered.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(52,211,153,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--green, #34d399)",
                letterSpacing: 0.2,
              }}
            >
              Covered ({covered.length})
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {covered.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(52,211,153,0.2)",
                  background: "var(--surface)",
                  borderLeft: "3px solid var(--green, #34d399)",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                    marginBottom: item.context ? 6 : 0,
                    lineHeight: 1.4,
                  }}
                >
                  {item.text}
                </div>
                {item.context && (
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 7,
                      background: "rgba(52,211,153,0.06)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--green, #34d399)",
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        marginRight: 6,
                      }}
                    >
                      Context
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                      {item.context}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
