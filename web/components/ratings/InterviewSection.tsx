"use client";

type Props = {
  keyGap?: string;
  tips?: string[];
};

export function InterviewSection({ keyGap, tips = [] }: Props) {
  const hasSomething = keyGap || tips.length > 0;

  if (!hasSomething) {
    return (
      <div
        style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "var(--dim)",
          fontSize: 13,
        }}
      >
        Run &ldquo;Get suggestions&rdquo; to generate interview coaching tips for this role.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Key Gap card ─────────────────────────────────── */}
      {keyGap && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid rgba(248,113,113,0.25)",
            background: "rgba(248,113,113,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <span style={{ fontSize: 15 }}>🎯</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#f87171",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Key Gap
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
            {keyGap}
          </p>
        </div>
      )}

      {/* ── Strategic tips ───────────────────────────────── */}
      {tips.length > 0 && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid rgba(245,158,11,0.25)",
            background: "rgba(245,158,11,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 15 }}>💡</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#f59e0b",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Strategic Tips
            </span>
          </div>
          <p
            style={{
              margin: "0 0 14px",
              fontSize: 11,
              color: "var(--dim)",
              lineHeight: 1.5,
            }}
          >
            Coaching on how to position your story for this role — not automatic PDF edits.
            Use bullet suggestions below for résumé changes.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tips.map((tip, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                {/* Step number */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "rgba(245,158,11,0.15)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#f59e0b",
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {tip}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
