"use client";

export type GapFixSuggestion = {
  id: string;
  section: string;
  employer?: string;
  original: string;
  suggested: string;
  reason: string;
  category?: string;
  priority: string;
  action_type?: "rewrite" | "append";
  risk_level?: "low" | "medium" | "high";
};

type Props = {
  suggestion: GapFixSuggestion;
  index: number;
  checked: boolean;
  onToggleCheck: () => void;
  draftText: string;
  onDraftChange: (text: string) => void;
  showCheckbox?: boolean;
};

const RISK_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  low:    { bg: "rgba(34,197,94,0.10)",  color: "#16a34a", label: "LOW RISK" },
  medium: { bg: "rgba(245,158,11,0.10)", color: "#d97706", label: "MED RISK" },
  high:   { bg: "rgba(239,68,68,0.10)",  color: "#dc2626", label: "HIGH RISK" },
};

const CATEGORY_LABEL: Record<string, string> = {
  add_keywords:   "KEYWORDS",
  relevance:      "RELEVANCE",
  quantification: "METRICS",
  readability:    "CLARITY",
  action_verbs:   "LANGUAGE",
  languageQuality:"LANGUAGE",
  remove_filler:  "CLARITY",
};

export function GapFixSuggestionCard({
  suggestion: s,
  index,
  checked,
  onToggleCheck,
  draftText,
  onDraftChange,
  showCheckbox = true,
}: Props) {
  const risk = RISK_STYLES[s.risk_level ?? "low"] ?? RISK_STYLES.low;
  const actionType = s.action_type ?? "rewrite";
  const categoryLabel = (s.category ? CATEGORY_LABEL[s.category] : null) ?? s.section.toUpperCase();
  const employerLabel = (s.employer || s.section || "").trim();

  return (
    <div
      style={{
        borderRadius: 12,
        border: checked ? "1.5px solid rgba(99,102,241,0.4)" : "1px solid var(--border)",
        background: checked ? "rgba(99,102,241,0.02)" : "var(--surface2)",
        overflow: "hidden",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexWrap: "wrap",
        }}
      >
        {showCheckbox && (
          <button
            type="button"
            onClick={onToggleCheck}
            aria-label={checked ? "Deselect fix" : "Select fix"}
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              flexShrink: 0,
              border: checked ? "none" : "1.5px solid var(--border)",
              background: checked ? "#6366f1" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {checked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
          </button>
        )}

        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", letterSpacing: -0.1 }}>
          Option {index + 1}
        </span>

        {/* Risk badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 7px",
          borderRadius: 20, background: risk.bg, color: risk.color,
        }}>
          {risk.label}
        </span>

        {/* Category badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 7px",
          borderRadius: 20, background: "rgba(99,102,241,0.08)", color: "#6366f1",
        }}>
          {categoryLabel}
        </span>

        {/* Action type badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 7px",
          borderRadius: 20,
          background: actionType === "append" ? "rgba(59,130,246,0.10)" : "rgba(139,92,246,0.10)",
          color: actionType === "append" ? "#2563eb" : "#7c3aed",
        }}>
          {actionType.toUpperCase()}
        </span>

        <div style={{ flex: 1 }} />

        {/* Company chip */}
        {employerLabel && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 600, color: "var(--muted)",
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 20, padding: "2px 8px", maxWidth: 160,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={employerLabel}>
            <span style={{ fontSize: 9 }}>📍</span>
            {employerLabel.length > 20 ? employerLabel.slice(0, 20) + "…" : employerLabel}
          </span>
        )}
      </div>

      {/* ── Rationale ── */}
      {s.reason && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <p style={{ margin: 0, fontSize: 11.5, fontStyle: "italic", color: "var(--muted)", lineHeight: 1.5 }}>
            {s.reason}
          </p>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Original (shown as strikethrough for rewrite) */}
        {actionType === "rewrite" && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>
              Original
            </div>
            <div style={{
              padding: "7px 10px", borderRadius: 6,
              background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
              fontSize: 12, color: "var(--muted)", lineHeight: 1.45,
              textDecoration: "line-through", textDecorationColor: "rgba(239,68,68,0.4)",
            }}>
              {s.original}
            </div>
          </div>
        )}

        {/* Editable suggestion */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 }}>
            {actionType === "append" ? "+ Adding content" : "Content modification"}
          </div>
          <textarea
            value={draftText}
            onChange={(e) => onDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
            rows={3}
            aria-label="Suggested correction"
            style={{
              cursor: "text",
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: 6,
              background: "rgba(52,211,153,0.06)",
              border: "1px solid rgba(52,211,153,0.25)",
              fontSize: 12.5,
              color: "var(--text)",
              lineHeight: 1.45,
              fontFamily: "inherit",
              resize: "vertical",
              minHeight: 68,
            }}
          />
        </div>
      </div>
    </div>
  );
}
