"use client";

import { useState } from "react";
import type { KeywordsRating, ContextualKeyword } from "@/lib/types";

export function KeywordsSection({ keywords }: { keywords: KeywordsRating }) {
  const [checkedMissing, setCheckedMissing] = useState<Set<string>>(new Set());

  // Normalise to categorised shape — handles both new and legacy flat schemas
  const dsFound: string[] = keywords.direct_skills?.found ?? keywords.found ?? [];
  const dsMissing: string[] = keywords.direct_skills?.missing ?? keywords.missing ?? [];
  const ctxFound: ContextualKeyword[] = keywords.contextual?.found ?? [];
  const ctxMissing: string[] = keywords.contextual?.missing ?? [];

  const totalFound = dsFound.length + ctxFound.length;
  const totalMissing = dsMissing.length + ctxMissing.length;

  const toggleMissing = (key: string) => {
    setCheckedMissing((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      {/* ── Section header ─────────────────────────────────── */}
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
        Keywords
      </div>

      {/* ── Big summary chips ──────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div
          style={{
            flex: 1,
            padding: "18px 20px",
            borderRadius: 14,
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
              fontSize: 10,
              fontWeight: 800,
              color: "var(--green, #34d399)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            FOUND
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: "18px 20px",
            borderRadius: 14,
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
              fontSize: 10,
              fontWeight: 800,
              color: "#f87171",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            MISSING
          </div>
        </div>
      </div>

      {/* ── Missing Direct Skills — checkbox tag cloud ─────── */}
      {dsMissing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
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
            Missing Direct Skills ({dsMissing.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dsMissing.map((kw, i) => {
              const key = `ds:${kw}`;
              const checked = checkedMissing.has(key);
              return (
                <label
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: checked ? "rgba(248,113,113,0.14)" : "rgba(248,113,113,0.06)",
                    border: `1px solid ${checked ? "rgba(248,113,113,0.45)" : "rgba(248,113,113,0.22)"}`,
                    transition: "background 0.12s, border-color 0.12s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMissing(key)}
                    style={{
                      accentColor: "#f87171",
                      width: 12,
                      height: 12,
                      margin: 0,
                      cursor: "pointer",
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>{kw}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Missing Contextual Keywords — checkbox tag cloud ── */}
      {ctxMissing.length > 0 && (
        <div style={{ marginBottom: 24 }}>
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
            Missing Contextual Keywords ({ctxMissing.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {ctxMissing.map((kw, i) => {
              const key = `ctx:${kw}`;
              const checked = checkedMissing.has(key);
              return (
                <label
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: checked ? "rgba(248,113,113,0.14)" : "rgba(248,113,113,0.06)",
                    border: `1px solid ${checked ? "rgba(248,113,113,0.45)" : "rgba(248,113,113,0.22)"}`,
                    transition: "background 0.12s, border-color 0.12s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMissing(key)}
                    style={{
                      accentColor: "#f87171",
                      width: 12,
                      height: 12,
                      margin: 0,
                      cursor: "pointer",
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>{kw}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Found Direct Skills — uppercase bold green tags ─── */}
      {dsFound.length > 0 && (
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
            Found Direct Skills ({dsFound.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dsFound.map((kw, i) => (
              <span
                key={i}
                style={{
                  padding: "5px 11px",
                  borderRadius: 7,
                  border: "1.5px solid rgba(52,211,153,0.45)",
                  background: "rgba(52,211,153,0.07)",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--green, #34d399)",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Found Contextual Keywords — rows with match count ── */}
      {ctxFound.length > 0 && (
        <div>
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
            Found Contextual Keywords ({ctxFound.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ctxFound.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(52,211,153,0.18)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>
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
