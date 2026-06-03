"use client";

export type GapFixSuggestion = {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: string;
};

type Props = {
  suggestion: GapFixSuggestion;
  checked: boolean;
  onToggleCheck: () => void;
  draftText: string;
  onDraftChange: (text: string) => void;
  showCheckbox?: boolean;
};

export function GapFixSuggestionCard({
  suggestion: s,
  checked,
  onToggleCheck,
  draftText,
  onDraftChange,
  showCheckbox = true,
}: Props) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: checked ? "1.5px solid rgba(99,102,241,0.35)" : "1px solid var(--border)",
        background: checked ? "rgba(99,102,241,0.03)" : "var(--surface2)",
        padding: "12px 14px",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
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
          Suggested correction (editable):
        </div>
        <textarea
          value={draftText}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={4}
          style={{
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
            minHeight: 72,
          }}
        />
      </div>

      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
        <strong style={{ color: "var(--text)" }}>Fix explanation:</strong> {s.reason}
      </div>
    </div>
  );
}
