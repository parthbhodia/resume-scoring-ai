"use client";

import { useState } from "react";
import type { KeywordsRating, ContextualKeyword } from "@/lib/types";

type GapFixSuggestion = {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: string;
};

type GapFixPanel = {
  gapName: string;
  gapNotes: string;
  suggestions: GapFixSuggestion[];
};

type Props = {
  keywords: KeywordsRating;
  onFixKeyword?: (keyword: string) => void;
  fixingKeyword?: string | null;
  gapFixPanel?: GapFixPanel | null;
  gapFixError?: string | null;
  onApplyFix?: (s: GapFixSuggestion) => void | Promise<void>;
  onApplyAllFixes?: (suggestions: GapFixSuggestion[]) => void | Promise<void>;
  onDismissFix?: () => void;
};

export function KeywordsSection({
  keywords,
  onFixKeyword,
  fixingKeyword,
  gapFixPanel,
  gapFixError,
  onApplyFix,
  onApplyAllFixes,
  onDismissFix,
}: Props) {
  // Normalise to categorised shape — handles both new and legacy flat schemas
  const dsFound: string[] = keywords.direct_skills?.found ?? keywords.found ?? [];
  const dsMissing: string[] = keywords.direct_skills?.missing ?? keywords.missing ?? [];
  const ctxFound: ContextualKeyword[] = keywords.contextual?.found ?? [];
  const ctxMissing: string[] = keywords.contextual?.missing ?? [];

  const totalFound = dsFound.length + ctxFound.length;
  const totalMissing = dsMissing.length + ctxMissing.length;

  // Track checked suggestions in the active fix panel
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const panelSuggestions = gapFixPanel?.suggestions ?? [];
  const allPanelIds = panelSuggestions.map((s) => s.id);
  const effectiveChecked =
    checkedIds.size === 0 && panelSuggestions.length > 0 ? new Set(allPanelIds) : checkedIds;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(effectiveChecked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Render a missing-keyword row with an optional "Fix with AI" button + panel */
  function MissingKeywordRow({ kw }: { kw: string }) {
    const isFixing = fixingKeyword === kw;
    const isActivePanel = gapFixPanel?.gapName === kw;

    return (
      <div>
        {/* Keyword card */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: isActivePanel ? "1px solid rgba(99,102,241,0.4)" : "1px solid var(--border)",
            background: isActivePanel ? "rgba(99,102,241,0.04)" : "var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", flex: 1 }}>{kw}</span>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isActivePanel && onDismissFix && (
              <button
                type="button"
                onClick={() => { setCheckedIds(new Set()); onDismissFix(); }}
                style={{
                  fontSize: 11, fontWeight: 600, color: "var(--muted)",
                  background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
                }}
              >
                ✕ Close
              </button>
            )}
            {onFixKeyword && !isActivePanel && (
              <button
                type="button"
                disabled={isFixing || !!fixingKeyword}
                onClick={() => { setCheckedIds(new Set()); onFixKeyword(kw); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 7,
                  border: "1px solid rgba(99,102,241,0.4)",
                  background: isFixing ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)",
                  color: "#818cf8",
                  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                  cursor: (isFixing || !!fixingKeyword) ? "not-allowed" : "pointer",
                  opacity: (fixingKeyword && !isFixing) ? 0.5 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {isFixing ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 18 18" fill="none"
                      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden>
                      <circle cx="9" cy="9" r="7" stroke="rgba(99,102,241,0.3)" strokeWidth="2.5" />
                      <path d="M9 2a7 7 0 017 7" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Getting fixes…
                  </>
                ) : "⚡ Fix with AI"}
              </button>
            )}
          </div>
        </div>

        {/* Gap fix panel — appears below the clicked keyword */}
        {isActivePanel && (
          <div
            style={{
              marginTop: 8,
              borderRadius: 12,
              border: "1.5px solid rgba(99,102,241,0.3)",
              background: "var(--surface)",
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: "14px 18px",
                background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
                borderBottom: "1px solid rgba(99,102,241,0.2)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(99,102,241,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
                    AI Suggested Fixes
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {panelSuggestions.length} fix{panelSuggestions.length !== 1 ? "es" : ""} for:{" "}
                    <em style={{ fontStyle: "normal", fontWeight: 600 }}>{gapFixPanel!.gapName}</em>
                  </div>
                </div>
              </div>
              {onApplyFix && panelSuggestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const toApply = panelSuggestions.filter((s) => effectiveChecked.has(s.id));
                    if (toApply.length === 0) return;
                    if (onApplyAllFixes) {
                      void onApplyAllFixes(toApply);
                    } else {
                      toApply.forEach((s) => { void onApplyFix!(s); });
                    }
                  }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 8,
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    border: "none", color: "#fff",
                    fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  ✓ Apply ({effectiveChecked.size})
                </button>
              )}
            </div>

            {/* Error */}
            {gapFixError && (
              <div style={{ padding: "14px 18px", fontSize: 12, color: "var(--error, #ef4444)" }}>
                {gapFixError}
              </div>
            )}

            {/* Empty state */}
            {!gapFixError && panelSuggestions.length === 0 && (
              <div style={{ padding: "20px 18px", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                No targeted rewrites found — try "Get suggestions" for a broader analysis.
              </div>
            )}

            {/* Suggestion cards */}
            {!gapFixError && panelSuggestions.length > 0 && (
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {panelSuggestions.map((s) => {
                  const checked = effectiveChecked.has(s.id);
                  return (
                    <div
                      key={s.id}
                      style={{
                        borderRadius: 10,
                        border: checked ? "1.5px solid rgba(99,102,241,0.35)" : "1px solid var(--border)",
                        background: checked ? "rgba(99,102,241,0.03)" : "var(--surface2)",
                        padding: "12px 14px",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <button
                          type="button"
                          onClick={() => toggleCheck(s.id)}
                          style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                            border: checked ? "none" : "1.5px solid var(--border)",
                            background: checked ? "#6366f1" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", padding: 0,
                          }}
                        >
                          {checked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                        </button>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: 0.2, textTransform: "uppercase" }}>
                          {s.section}
                        </span>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>
                          Original bullet:
                        </div>
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
                          {s.original}
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>
                          Suggested correction:
                        </div>
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 12.5, color: "var(--green, #34d399)", lineHeight: 1.45 }}>
                          {s.suggested}
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
                        <strong style={{ color: "var(--text)" }}>Fix explanation:</strong> {s.reason}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Big summary chips ──────────────────────────────── */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, padding: "18px 20px", borderRadius: 12, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "var(--green, #34d399)", letterSpacing: -1.5, lineHeight: 1 }}>{totalFound}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.3, marginTop: 4 }}>✓ FOUND</div>
        </div>
        <div style={{ flex: 1, padding: "18px 20px", borderRadius: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#f87171", letterSpacing: -1.5, lineHeight: 1 }}>{totalMissing}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.3, marginTop: 4 }}>✕ MISSING</div>
        </div>
      </div>

      {/* ── Missing Direct Skills ─────────────────────────── */}
      {dsMissing.length > 0 && (
        <div style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>✕</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Missing Direct Skills ({dsMissing.length})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dsMissing.map((kw, i) => (
              <MissingKeywordRow key={i} kw={kw} />
            ))}
          </div>
        </div>
      )}

      {/* ── Missing Contextual Keywords ───────────────────── */}
      {ctxMissing.length > 0 && (
        <div style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>✕</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Missing Contextual Keywords ({ctxMissing.length})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ctxMissing.map((kw, i) => (
              <MissingKeywordRow key={i} kw={kw} />
            ))}
          </div>
        </div>
      )}

      {/* ── Found Direct Skills ───────────────────────────── */}
      {dsFound.length > 0 && (
        <div style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid rgba(52,211,153,0.2)", background: "var(--surface2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Found Direct Skills ({dsFound.length})</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dsFound.map((kw, i) => (
              <span key={i} style={{ padding: "5px 11px", borderRadius: 7, border: "1.5px solid rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.07)", fontSize: 11, fontWeight: 800, color: "var(--green, #34d399)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Found Contextual Keywords ─────────────────────── */}
      {ctxFound.length > 0 && (
        <div style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid rgba(52,211,153,0.2)", background: "var(--surface2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Found Contextual Keywords ({ctxFound.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {ctxFound.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(52,211,153,0.15)", background: "var(--surface)" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>&ldquo;{item.keyword}&rdquo;</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", background: "rgba(52,211,153,0.1)", borderRadius: 5, padding: "2px 8px", flexShrink: 0, marginLeft: 8 }}>
                  {item.count} {item.count === 1 ? "match" : "matches"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
