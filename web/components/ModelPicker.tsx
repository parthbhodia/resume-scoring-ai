"use client";

const MODELS = [
  { label: "2.5 Flash", value: "gemini-2.5-flash" },
  { label: "2.0 Flash", value: "gemini-2.0-flash" },
  { label: "2.0 Lite",  value: "gemini-2.0-flash-lite" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function ModelPicker({ value, onChange }: Props) {
  return (
    <div style={{
      display: "flex",
      background: "var(--surface2)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      {MODELS.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          style={{
            padding: "9px 16px",
            fontSize: 12,
            fontFamily: "inherit",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
            background: value === m.value ? "var(--accent-bg)" : "transparent",
            color:      value === m.value ? "var(--accent)"    : "var(--muted)",
            fontWeight: value === m.value ? 600 : 400,
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
