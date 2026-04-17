"use client";
import type { DiffLine } from "@/lib/types";

interface Props {
  diff: DiffLine[];
  adds: number;
  removes: number;
  baseFolder: string | null;
}

const LINE_COLORS: Record<DiffLine["type"], { bg: string; color: string; prefix: string }> = {
  add:     { bg: "rgba(52,211,153,0.06)",  color: "var(--green)",  prefix: "+" },
  remove:  { bg: "rgba(248,113,113,0.06)", color: "var(--red)",    prefix: "-" },
  hunk:    { bg: "rgba(79,143,247,0.06)",  color: "var(--accent)", prefix: ""  },
  context: { bg: "transparent",            color: "var(--dim)",    prefix: " " },
};

export default function DiffView({ diff, adds, removes, baseFolder }: Props) {
  if (!diff.length) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--dim)", fontSize: 12 }}>
        No base resume selected — diff not available
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, fontSize: 12 }}>
        <span style={{ color: "var(--green)", fontWeight: 600 }}>+{adds} added</span>
        <span style={{ color: "var(--red)",   fontWeight: 600 }}>−{removes} removed</span>
        {baseFolder && (
          <span style={{ color: "var(--dim)" }}>
            vs <strong style={{ color: "var(--muted)" }}>{baseFolder}</strong>
          </span>
        )}
      </div>

      {/* Diff lines */}
      <div style={{
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        overflow: "auto",
        maxHeight: 420,
      }}>
        <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.6 }}>
          {diff.map((line, i) => {
            const s = LINE_COLORS[line.type];
            return (
              <div key={i} style={{ background: s.bg, padding: "0 14px", display: "flex", gap: 8 }}>
                <span style={{ color: s.color, userSelect: "none", minWidth: 12 }}>{s.prefix}</span>
                <span style={{ color: line.type === "hunk" ? s.color : undefined }}>{line.text}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
