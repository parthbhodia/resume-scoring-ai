"use client";

import { isGapAddressed } from "@/lib/tailorGapFix";
import type { AddressedGapAction, KeywordsRating, ContextualKeyword } from "@/lib/types";

type Props = {
  keywords: KeywordsRating;
  onFixKeyword?: (keyword: string) => void;
  fixingKeyword?: string | null;
  addressedGaps?: ReadonlySet<string>;
  addressedGapActions?: readonly AddressedGapAction[];
};

export function KeywordsSection({
  keywords,
  onFixKeyword,
  fixingKeyword,
  addressedGaps,
  addressedGapActions,
}: Props) {
  const addressed = addressedGaps ?? new Set<string>();
  const dsFound: string[] = keywords.direct_skills?.found ?? keywords.found ?? [];
  const dsMissing: string[] = (keywords.direct_skills?.missing ?? keywords.missing ?? []).filter(
    (kw) => !isGapAddressed(kw, addressed),
  );
  const ctxFound: ContextualKeyword[] = keywords.contextual?.found ?? [];
  const ctxMissing: string[] = (keywords.contextual?.missing ?? []).filter(
    (kw) => !isGapAddressed(kw, addressed),
  );

  const totalFound = dsFound.length + ctxFound.length;
  const totalMissing = dsMissing.length + ctxMissing.length;

  function MissingKeywordRow({ kw }: { kw: string }) {
    const isFixing = fixingKeyword === kw;
    const isAddressed = isGapAddressed(kw, addressed, addressedGapActions);

    return (
      <div>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", flex: 1 }}>{kw}</span>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {onFixKeyword && !isAddressed && (
              <button
                type="button"
                disabled={isFixing || !!fixingKeyword}
                onClick={() => onFixKeyword(kw)}
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
