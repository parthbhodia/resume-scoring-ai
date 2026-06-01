"use client";

import { useState } from "react";
import { accentCardBorder } from "@/lib/accentCardBorder";
import type { DetailedCategory, DetailedRatingItem } from "@/lib/types";

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
  category: DetailedCategory;
  label: string;
  onFixGap?: (item: DetailedRatingItem) => void;
  fixingGapName?: string | null;
  gapFixPanel?: GapFixPanel | null;
  gapFixError?: string | null;
  onApplyFix?: (s: GapFixSuggestion) => void | Promise<void>;
  /** Apply all checked suggestions in one batch (preferred over per-item onApplyFix). */
  onApplyAllFixes?: (suggestions: GapFixSuggestion[]) => void | Promise<void>;
  onDismissFix?: () => void;
};

export function CoveredMissingSection({
  category,
  label,
  onFixGap,
  fixingGapName,
  gapFixPanel,
  gapFixError,
  onApplyFix,
  onApplyAllFixes,
  onDismissFix,
}: Props) {
  const [coveredOpen, setCoveredOpen] = useState(true);
  const [missingOpen, setMissingOpen] = useState(true);
  // Track which suggestions are checked (all checked by default)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // When a new panel opens, default all to checked
  const panelSuggestions = gapFixPanel?.suggestions ?? [];
  const allPanelIds = panelSuggestions.map((s) => s.id);
  const effectiveChecked = checkedIds.size === 0 && panelSuggestions.length > 0
    ? new Set(allPanelIds)
    : checkedIds;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(effectiveChecked);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const covered = category.covered ?? [];
  const missing = category.missing ?? [];

  return (
    <div>
      {/* ── Summary chips ────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, padding: "18px 20px", borderRadius: 12, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: "var(--green, #34d399)", letterSpacing: -1, lineHeight: 1 }}>{covered.length}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.3, marginTop: 4 }}>✓ COVERED</div>
        </div>
        <div style={{ flex: 1, padding: "18px 20px", borderRadius: 12, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#f87171", letterSpacing: -1, lineHeight: 1 }}>{missing.length}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.3, marginTop: 4 }}>✕ MISSING</div>
        </div>
      </div>

      {/* ── Missing section ──────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMissingOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "8px 0", marginBottom: missingOpen && missing.length > 0 ? 12 : 0, fontFamily: "inherit" }}
        >
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: missing.length > 0 ? "rgba(248,113,113,0.15)" : "rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: missing.length > 0 ? "#f87171" : "var(--dim)", fontWeight: 700 }}>✕</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: missing.length > 0 ? "var(--text)" : "var(--muted)", textAlign: "left" }}>
            Missing {label} ({missing.length})
          </span>
          <span style={{ fontSize: 12, color: "var(--dim)", marginLeft: "auto" }}>{missingOpen ? "▾" : "▸"}</span>
        </button>

        {missingOpen && missing.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {missing.map((item, i) => {
              const isFixing = fixingGapName === item.text;
              const isActivePanel = gapFixPanel?.gapName === item.text;

              return (
                <div key={i}>
                  {/* Gap card */}
                  <div
                    style={{
                      padding: "16px 18px",
                      borderRadius: 10,
                      ...accentCardBorder(
                        isActivePanel ? "#818cf8" : "#f87171",
                        isActivePanel ? "rgba(99,102,241,0.4)" : "var(--border)",
                      ),
                      background: isActivePanel ? "rgba(99,102,241,0.04)" : "var(--surface2)",
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.45, marginBottom: item.analysis ? 12 : 0 }}>
                      {item.text}
                    </div>
                    {item.analysis && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", marginBottom: onFixGap ? 10 : 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#f87171", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 5 }}>⊙ ANALYSIS</span>
                        <span style={{ fontSize: 12.5, color: "#f87171", lineHeight: 1.55 }}>{item.analysis}</span>
                      </div>
                    )}
                    {onFixGap && !isActivePanel && (
                      <button
                        type="button"
                        disabled={isFixing || !!fixingGapName}
                        onClick={() => { setCheckedIds(new Set()); onFixGap(item); }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 14px", borderRadius: 7,
                          border: "1px solid rgba(99,102,241,0.4)",
                          background: isFixing ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)",
                          color: "#818cf8",
                          fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                          cursor: (isFixing || !!fixingGapName) ? "not-allowed" : "pointer",
                          opacity: (fixingGapName && !isFixing) ? 0.5 : 1,
                        }}
                      >
                        {isFixing ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden>
                              <circle cx="9" cy="9" r="7" stroke="rgba(99,102,241,0.3)" strokeWidth="2.5" />
                              <path d="M9 2a7 7 0 017 7" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                            Getting fixes…
                          </>
                        ) : (
                          <>⚡ Fix with AI</>
                        )}
                      </button>
                    )}
                    {isActivePanel && onDismissFix && (
                      <button
                        type="button"
                        onClick={onDismissFix}
                        style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                      >
                        ✕ Close
                      </button>
                    )}
                  </div>

                  {/* Gap fix panel — appears below the clicked card */}
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
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 16 }}>⚡</span>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>AI Suggested Fixes</div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                              {panelSuggestions.length} fix{panelSuggestions.length !== 1 ? "es" : ""} for: <em style={{ fontStyle: "normal", fontWeight: 600 }}>{gapFixPanel!.gapName}</em>
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

                      {/* Error state */}
                      {gapFixError && (
                        <div style={{ padding: "14px 18px", fontSize: 12, color: "var(--error, #ef4444)" }}>{gapFixError}</div>
                      )}

                      {/* Empty state */}
                      {!gapFixError && panelSuggestions.length === 0 && (
                        <div style={{ padding: "20px 18px", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                          No targeted rewrites found — try "Get suggestions" for a broader analysis.
                        </div>
                      )}

                      {/* Bullet cards */}
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
                                {/* Checkbox + section label */}
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
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: 0.2, textTransform: "uppercase" }}>{s.section}</span>
                                </div>

                                {/* Original bullet */}
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>Original bullet:</div>
                                  <div style={{ padding: "8px 10px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
                                    {s.original}
                                  </div>
                                </div>

                                {/* Suggested correction */}
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>Suggested correction:</div>
                                  <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 12.5, color: "var(--green, #34d399)", lineHeight: 1.45 }}>
                                    {s.suggested}
                                  </div>
                                </div>

                                {/* Reason */}
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
            })}
          </div>
        )}
      </div>

      {/* ── Covered section ──────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setCoveredOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "8px 0", marginBottom: coveredOpen && covered.length > 0 ? 12 : 0, fontFamily: "inherit" }}
        >
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: covered.length > 0 ? "rgba(52,211,153,0.15)" : "rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", textAlign: "left" }}>Covered {label} ({covered.length})</span>
          <span style={{ fontSize: 12, color: "var(--dim)", marginLeft: "auto" }}>{coveredOpen ? "▾" : "▸"}</span>
        </button>

        {coveredOpen && covered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {covered.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "16px 18px",
                  borderRadius: 10,
                  ...accentCardBorder("var(--green, #34d399)", "rgba(52,211,153,0.18)"),
                  background: "var(--surface2)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.45, marginBottom: item.context ? 10 : 0 }}>{item.text}</div>
                {item.context && (
                  <div style={{ marginBottom: item.locations ? 8 : 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", marginRight: 6 }}>CONTEXT:</span>
                    <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>{item.context}</span>
                  </div>
                )}
                {item.locations && item.locations > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 12, color: "var(--green, #34d399)" }}>✓</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.2 }}>
                      FOUND IN {item.locations} {item.locations === 1 ? "LOCATION" : "LOCATIONS"}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
