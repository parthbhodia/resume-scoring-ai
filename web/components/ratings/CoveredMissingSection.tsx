"use client";

import { useState } from "react";
import { accentCardBorder } from "@/lib/accentCardBorder";
import { isGapAddressed } from "@/lib/tailorGapFix";
import type { AddressedGapAction, DetailedCategory, DetailedRatingItem } from "@/lib/types";

function gapTypeForLabel(label: string): AddressedGapAction["type"] {
  return label.toLowerCase().includes("responsibilit") ? "responsibility" : "qualification";
}

type Props = {
  category: DetailedCategory;
  label: string;
  onFixGap?: (item: DetailedRatingItem, gapType: AddressedGapAction["type"]) => void;
  fixingGapName?: string | null;
  addressedGaps?: ReadonlySet<string>;
  addressedGapActions?: readonly AddressedGapAction[];
};

export function CoveredMissingSection({
  category,
  label,
  onFixGap,
  fixingGapName,
  addressedGaps,
  addressedGapActions,
}: Props) {
  const [coveredOpen, setCoveredOpen] = useState(true);
  const [missingOpen, setMissingOpen] = useState(true);

  const covered = category.covered ?? [];
  const resolved = category.resolved_by_user ?? [];
  const missing = (category.missing ?? []).filter(
    (item) => !isGapAddressed(item.text, addressedGaps ?? new Set(), addressedGapActions),
  );

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
              const isAddressed = isGapAddressed(item.text, addressedGaps ?? new Set(), addressedGapActions);

              return (
                <div key={i}>
                  <div
                    style={{
                      padding: "16px 18px",
                      borderRadius: 10,
                      ...accentCardBorder("#f87171", "var(--border)"),
                      background: "var(--surface2)",
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
                    {onFixGap && !isAddressed && (
                      <button
                        type="button"
                        disabled={isFixing || !!fixingGapName}
                        onClick={() => onFixGap?.(item, gapTypeForLabel(label))}
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Applied (pending verification) ───────────────── */}
      {resolved.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>◐</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Applied — re-check to confirm ({resolved.length})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {resolved.map((item, i) => (
              <div
                key={item.id ?? i}
                style={{
                  padding: "16px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(245,158,11,0.35)",
                  background: "rgba(245,158,11,0.05)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: item.context ? 8 : 0 }}>
                  {item.text}
                </div>
                {item.context && (
                  <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>{item.context}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Covered (verified) section ───────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setCoveredOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "8px 0", marginBottom: coveredOpen && covered.length > 0 ? 12 : 0, fontFamily: "inherit" }}
        >
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: covered.length > 0 ? "rgba(52,211,153,0.15)" : "rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", textAlign: "left" }}>Verified {label} ({covered.length})</span>
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
