"use client";

import { useState } from "react";

type QuestionCategory = "all" | "technical" | "behavioural" | "gap";

type Props = {
  keyGap?: string;
  tips?: string[];
  questions?: string[];
};

const CATEGORY_LABELS: { id: QuestionCategory; label: string; emoji: string }[] = [
  { id: "all",         label: "All",        emoji: "📋" },
  { id: "technical",   label: "Technical",  emoji: "⚙️" },
  { id: "behavioural", label: "Behavioural",emoji: "🧠" },
  { id: "gap",         label: "Gap Probes", emoji: "🎯" },
];

/** Heuristic: classify questions without an extra LLM call. */
function classify(q: string): QuestionCategory {
  const lower = q.toLowerCase();

  // Behavioural: past-tense / STAR-story framing.
  // Guard: "walk me through how you would ..." is a technical/design question,
  // not a behavioural one — require situational/past-tense context alongside it.
  if (
    lower.includes("tell me about a time") ||
    lower.includes("describe a situation") ||
    lower.includes("give me an example") ||
    lower.includes("how did you handle") ||
    lower.includes("walk me through a time") ||
    lower.includes("walk me through a situation") ||
    lower.includes("walk me through when you") ||
    lower.includes("walk me through how you handled") ||
    lower.includes("walk me through how you managed") ||
    lower.includes("walk me through your experience")
  ) return "behavioural";

  if (
    lower.includes("how would you") ||
    lower.includes("have you worked with") ||
    lower.includes("do you have experience") ||
    lower.includes("what is your experience with") ||
    lower.includes("why don't you") ||
    lower.includes("you lack") ||
    lower.includes("no experience") ||
    lower.includes("gap") ||
    lower.includes("missing") ||
    lower.includes("haven't")
  ) return "gap";

  return "technical";
}

export function InterviewSection({ keyGap, tips = [], questions = [] }: Props) {
  const [activeSection, setActiveSection] = useState<"coaching" | "questions">("coaching");
  const [questionFilter, setQuestionFilter] = useState<QuestionCategory>("all");

  const hasSomething = keyGap || tips.length > 0 || questions.length > 0;

  if (!hasSomething) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
        Run &ldquo;Get suggestions&rdquo; to generate interview coaching tips and likely questions for this role.
      </div>
    );
  }

  const classified = questions.map((q) => ({ q, cat: classify(q) }));
  const filtered = questionFilter === "all"
    ? classified
    : classified.filter((c) => c.cat === questionFilter);

  const countFor = (cat: QuestionCategory) =>
    cat === "all" ? classified.length : classified.filter((c) => c.cat === cat).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Sub-nav tabs ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--surface2)",
        }}
      >
        {[
          { id: "coaching" as const,   label: "💡 Coaching",  count: tips.length   },
          { id: "questions" as const,  label: "❓ Questions", count: questions.length },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveSection(t.id)}
            style={{
              flex: 1,
              padding: "9px 14px",
              border: "none",
              borderRight: "1px solid var(--border)",
              background: activeSection === t.id ? "var(--accent)" : "transparent",
              color: activeSection === t.id ? "#fff" : "var(--muted)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeSection === t.id ? "rgba(255,255,255,0.25)" : "rgba(148,163,184,0.2)",
                  color: activeSection === t.id ? "#fff" : "var(--muted)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Coaching panel ───────────────────────────────── */}
      {activeSection === "coaching" && (
        <>
          {/* Key Gap */}
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
                <span style={{ fontSize: 11, fontWeight: 800, color: "#f87171", letterSpacing: 0.5, textTransform: "uppercase" }}>
                  Key Gap
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>{keyGap}</p>
            </div>
          )}

          {/* Strategic Tips */}
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
                <span style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", letterSpacing: 0.5, textTransform: "uppercase" }}>
                  Strategic Tips
                </span>
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
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
                    <div
                      style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(245,158,11,0.15)",
                        border: "1px solid rgba(245,158,11,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, marginTop: 1,
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b" }}>{i + 1}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tips.length === 0 && !keyGap && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
              No coaching tips yet — run &ldquo;Get suggestions&rdquo; to generate them.
            </div>
          )}
        </>
      )}

      {/* ── Questions panel ──────────────────────────────── */}
      {activeSection === "questions" && (
        <>
          {questions.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
              No interview questions yet — run &ldquo;Get suggestions&rdquo; to generate them.
            </div>
          ) : (
            <>
              {/* Category filter chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CATEGORY_LABELS.map(({ id, label, emoji }) => {
                  const cnt = countFor(id);
                  if (id !== "all" && cnt === 0) return null;
                  const active = questionFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setQuestionFilter(id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 11px", borderRadius: 20,
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        background: active ? "rgba(59,130,246,0.1)" : "var(--surface2)",
                        color: active ? "var(--accent)" : "var(--muted)",
                        fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                        transition: "background 0.12s, border-color 0.12s, color 0.12s",
                      }}
                    >
                      <span>{emoji}</span>
                      <span>{label}</span>
                      <span
                        style={{
                          fontSize: 10, fontWeight: 700,
                          padding: "1px 5px", borderRadius: 8,
                          background: active ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.15)",
                        }}
                      >
                        {cnt}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Question cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map(({ q, cat }, i) => {
                  const catStyle: Record<QuestionCategory, { color: string; bg: string; label: string }> = {
                    all:         { color: "var(--muted)", bg: "transparent", label: "" },
                    technical:   { color: "var(--accent)", bg: "rgba(59,130,246,0.08)", label: "Technical" },
                    behavioural: { color: "#a855f7", bg: "rgba(168,85,247,0.08)", label: "Behavioural" },
                    gap:         { color: "#f87171", bg: "rgba(248,113,113,0.08)", label: "Gap Probe" },
                  };
                  const cs = catStyle[cat];
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface2)",
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      {/* Question number */}
                      <div
                        style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: "var(--surface)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, marginTop: 1,
                        }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)" }}>
                          {i + 1}
                        </span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500, color: "var(--text)", lineHeight: 1.55 }}>
                          {q}
                        </p>
                        {cat !== "all" && (
                          <span
                            style={{
                              fontSize: 10, fontWeight: 700,
                              padding: "2px 8px", borderRadius: 5,
                              background: cs.bg, color: cs.color,
                              letterSpacing: 0.3,
                            }}
                          >
                            {cs.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
