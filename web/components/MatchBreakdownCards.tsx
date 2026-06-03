"use client";

import type { Criterion } from "@/lib/types";
import { isGapAddressed, suggestionsWithDrafts } from "@/lib/tailorGapFix";
import { scoreColor, weightColor } from "@/lib/utils";
import { GapFixSuggestionCard, type GapFixSuggestion } from "@/components/ratings/GapFixSuggestionCard";

type GapFixPanel = {
  gapName: string;
  gapNotes: string;
  suggestions: GapFixSuggestion[];
};

export default function MatchBreakdownCards({
  criteria,
  onImprove,
  onFixGap,
  fixingGap,
  addressedGaps,
  gapFixPanel,
  gapFixError,
  onApplyFix,
  onDismissFix,
  generating,
  gapFixDrafts = {},
  onGapFixDraftChange,
}: {
  criteria: Criterion[];
  onImprove?: () => void;
  onFixGap?: (gap: Criterion) => void;
  fixingGap?: string | null;
  addressedGaps?: ReadonlySet<string>;
  gapFixPanel?: GapFixPanel | null;
  gapFixError?: string | null;
  onApplyFix?: (s: GapFixSuggestion) => void;
  onDismissFix?: () => void;
  generating?: boolean;
  gapFixDrafts?: Record<string, string>;
  onGapFixDraftChange?: (id: string, text: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {criteria.map((c, i) => {
        const sc = scoreColor(c.score * 10);
        const wc = weightColor(c.weight);
        const weak = c.score <= 5;
        const notes = (c.notes ?? "").replace(/^\s+/, "").trimEnd();
        const isFixing = fixingGap === c.name;
        const isAddressed = isGapAddressed(c.name, addressedGaps ?? new Set());
        const isActivePanel = gapFixPanel?.gapName === c.name;

        return (
          <div key={i}>
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${isAddressed ? "rgba(52,211,153,0.35)" : c.score <= 3 ? "rgba(248,113,113,0.22)" : "var(--border)"}`,
                background: isAddressed ? "rgba(52,211,153,0.04)" : c.score <= 3 ? "rgba(248,113,113,0.04)" : "var(--surface2)",
                padding: "12px 14px 14px",
                transition: "border-color 0.2s, background 0.2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: notes || (weak && (onImprove || onFixGap)) ? 8 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: -0.35, lineHeight: 1.25 }}>
                    {c.name}
                  </div>
                  {isAddressed && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(52,211,153,0.18)", color: "var(--green-ink, #34d399)", letterSpacing: 0.3, flexShrink: 0, whiteSpace: "nowrap" }}>
                      ✓ Fixed
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span title="JD importance" style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: wc.bg, color: wc.color }}>
                    {c.weight === "High" ? "High" : c.weight === "Medium" ? "Med" : "Low"}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: sc, minWidth: 40 }}>{c.score}/10</span>
                  <div style={{ width: 52, height: 4, borderRadius: 2, background: "rgba(148,163,184,0.35)", overflow: "hidden" }}>
                    <div style={{ width: `${c.score * 10}%`, height: "100%", background: sc }} />
                  </div>
                </div>
              </div>

              {notes ? (
                <p style={{ margin: 0, marginBottom: weak && !isAddressed && (onImprove || onFixGap) ? 10 : 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {notes}
                </p>
              ) : null}

              {weak && !isAddressed && (onImprove || onFixGap) ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onFixGap ? (
                    <button
                      type="button"
                      disabled={isFixing || !!fixingGap}
                      onClick={() => onFixGap(c)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 11px", borderRadius: 7,
                        border: "1px solid rgba(59,130,246,0.4)",
                        background: isFixing ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.1)",
                        color: "var(--accent)", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                        cursor: (isFixing || !!fixingGap) ? "not-allowed" : "pointer",
                        letterSpacing: -0.2, opacity: (fixingGap && !isFixing) ? 0.5 : 1,
                      }}
                    >
                      {isFixing ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden>
                            <circle cx="9" cy="9" r="7" stroke="rgba(59,130,246,0.3)" strokeWidth="2.5" />
                            <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          Getting fixes…
                        </>
                      ) : "Fix this gap →"}
                    </button>
                  ) : null}
                  {onImprove ? (
                    <button
                      type="button"
                      onClick={onImprove}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 11px", borderRadius: 7,
                        border: "1px solid var(--border)", background: "var(--surface)",
                        color: "var(--muted)", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                        cursor: "pointer", letterSpacing: -0.2,
                      }}
                    >
                      Get full suggestions
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Inline fix panel — appears directly under the card that was clicked */}
            {isActivePanel && (
              <div
                style={{
                  marginTop: 6,
                  borderRadius: 12,
                  border: "1px solid rgba(59,130,246,0.3)",
                  background: "rgba(59,130,246,0.04)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: -0.2 }}>
                    Suggested fixes for: <em style={{ fontStyle: "normal" }}>{gapFixPanel!.gapName}</em>
                  </span>
                  {onDismissFix && (
                    <button
                      type="button"
                      onClick={onDismissFix}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 4 }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {gapFixError ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--error, #ef4444)" }}>{gapFixError}</p>
                ) : gapFixPanel!.suggestions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                    No targeted rewrites found — try &quot;Get full suggestions&quot; for a broader analysis.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {gapFixPanel!.suggestions.map((s) => (
                      <div key={s.id}>
                        <GapFixSuggestionCard
                          suggestion={s}
                          checked
                          showCheckbox={false}
                          onToggleCheck={() => {}}
                          draftText={gapFixDrafts[s.id] ?? s.suggested}
                          onDraftChange={(text) => onGapFixDraftChange?.(s.id, text)}
                        />
                        {onApplyFix && (
                          <button
                            type="button"
                            disabled={generating}
                            onClick={() => {
                              const [drafted] = suggestionsWithDrafts([s], gapFixDrafts);
                              void onApplyFix(drafted);
                            }}
                            style={{
                              marginTop: 8,
                              padding: "5px 14px",
                              borderRadius: 7,
                              border: "none",
                              background: "var(--accent)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: "inherit",
                              cursor: generating ? "not-allowed" : "pointer",
                              opacity: generating ? 0.6 : 1,
                            }}
                          >
                            {generating ? "Applying…" : "Apply & regenerate →"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
