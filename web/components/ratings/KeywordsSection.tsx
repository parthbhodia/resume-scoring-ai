"use client";

import { useState } from "react";
import type { KeywordsRating, ContextualKeyword } from "@/lib/types";

export function KeywordsSection({ keywords }: { keywords: KeywordsRating }) {
  // Normalise to categorised shape — handles both new and legacy flat schemas
  const dsFound: string[] = keywords.direct_skills?.found ?? keywords.found ?? [];
  const dsMissing: string[] = keywords.direct_skills?.missing ?? keywords.missing ?? [];
  const ctxFound: ContextualKeyword[] = keywords.contextual?.found ?? [];
  const ctxMissing: string[] = keywords.contextual?.missing ?? [];

  const totalFound = dsFound.length + ctxFound.length;
  const totalMissing = dsMissing.length + ctxMissing.length;

  const [checkedDs, setCheckedDs] = useState<Set<number>>(new Set());
  const [checkedCtx, setCheckedCtx] = useState<Set<number>>(new Set());

  const toggleDs = (i: number) =>
    setCheckedDs((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const toggleCtx = (i: number) =>
    setCheckedCtx((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const selectAllDs = () =>
    setCheckedDs(checkedDs.size === dsMissing.length ? new Set() : new Set(dsMissing.map((_, i) => i)));

  const selectAllCtx = () =>
    setCheckedCtx(checkedCtx.size === ctxMissing.length ? new Set() : new Set(ctxMissing.map((_, i) => i)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Big summary chips ──────────────────────────────── */}
      <div style={{ display: "flex", gap: 12 }}>
        <div
          style={{
            flex: 1,
            padding: "18px 20px",
            borderRadius: 12,
            background: "rgba(52,211,153,0.08)",
            border: "1px solid rgba(52,211,153,0.25)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: "var(--green, #34d399)",
              letterSpacing: -1.5,
              lineHeight: 1,
            }}
          >
            {totalFound}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--green, #34d399)",
              letterSpacing: 0.3,
              marginTop: 4,
            }}
          >
            ✓ FOUND
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: "18px 20px",
            borderRadius: 12,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.25)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: "#f87171",
              letterSpacing: -1.5,
              lineHeight: 1,
            }}
          >
            {totalMissing}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#f87171",
              letterSpacing: 0.3,
              marginTop: 4,
            }}
          >
            ✕ MISSING
          </div>
        </div>
      </div>

      {/* ── Missing Direct Skills ─────────────────────────── */}
      {dsMissing.length > 0 && (
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
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(248,113,113,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>✕</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                Missing Direct Skills ({dsMissing.length})
              </span>
            </div>
            <button
              type="button"
              onClick={selectAllDs}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                fontFamily: "inherit",
                padding: "2px 0",
              }}
            >
              {checkedDs.size === dsMissing.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {dsMissing.map((kw, i) => {
              const checked = checkedDs.has(i);
              return (
                <label
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: checked ? "rgba(248,113,113,0.08)" : "var(--surface)",
                    border: `1px solid ${checked ? "rgba(248,113,113,0.3)" : "var(--border)"}`,
                    transition: "background 0.12s, border-color 0.12s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDs(i)}
                    style={{
                      accentColor: "#f87171",
                      width: 14,
                      height: 14,
                      margin: 0,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>{kw}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Missing Contextual Keywords ───────────────────── */}
      {ctxMissing.length > 0 && (
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
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(248,113,113,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>✕</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                Missing Contextual Keywords ({ctxMissing.length})
              </span>
            </div>
            <button
              type="button"
              onClick={selectAllCtx}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                fontFamily: "inherit",
                padding: "2px 0",
              }}
            >
              {checkedCtx.size === ctxMissing.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {ctxMissing.map((kw, i) => {
              const checked = checkedCtx.has(i);
              return (
                <label
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: checked ? "rgba(248,113,113,0.08)" : "var(--surface)",
                    border: `1px solid ${checked ? "rgba(248,113,113,0.3)" : "var(--border)"}`,
                    transition: "background 0.12s, border-color 0.12s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCtx(i)}
                    style={{
                      accentColor: "#f87171",
                      width: 14,
                      height: 14,
                      margin: 0,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>{kw}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Found Direct Skills ───────────────────────────── */}
      {dsFound.length > 0 && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid rgba(52,211,153,0.2)",
            background: "var(--surface2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(52,211,153,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Found Direct Skills ({dsFound.length})
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dsFound.map((kw, i) => (
              <span
                key={i}
                style={{
                  padding: "5px 11px",
                  borderRadius: 7,
                  border: "1.5px solid rgba(52,211,153,0.4)",
                  background: "rgba(52,211,153,0.07)",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--green, #34d399)",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Found Contextual Keywords ─────────────────────── */}
      {ctxFound.length > 0 && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid rgba(52,211,153,0.2)",
            background: "var(--surface2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(52,211,153,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Found Contextual Keywords ({ctxFound.length})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {ctxFound.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(52,211,153,0.15)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  &ldquo;{item.keyword}&rdquo;
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--green, #34d399)",
                    background: "rgba(52,211,153,0.1)",
                    borderRadius: 5,
                    padding: "2px 8px",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
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
