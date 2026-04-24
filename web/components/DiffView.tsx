"use client";
import React, { useMemo, useState } from "react";
import type { DiffLine, ChangeRationale } from "@/lib/types";

interface Props {
  diff: DiffLine[];
  adds: number;
  removes: number;
  rationales?: ChangeRationale[];
  baseFolder: string | null;
  jdKeywords?: string[];
}

function highlightKeywords(text: string, keywords: string[]): React.ReactNode {
  if (!keywords.length) return text;
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} style={{ background: "rgba(251,191,36,0.28)", color: "var(--orange)", borderRadius: 2, padding: "0 2px", fontWeight: 600, fontStyle: "normal" }}>{part}</mark>
          : part
      )}
    </>
  );
}

/** Strip LaTeX commands and return human-readable prose. */
function latexToText(s: string): string {
  let t = s;

  // Drop comments
  t = t.replace(/(^|[^\\])%.*$/gm, "$1");

  // Heading macros: \resumeQuadHeading{A}{B}{C}{D} → "A — B · C · D"
  t = t.replace(
    /\\resume(?:Quad|Trio|Sub|SubSub)Heading\s*((?:\{[^{}]*\}){2,4})/g,
    (_m, args: string) => {
      const parts = [...args.matchAll(/\{([^{}]*)\}/g)].map(m => m[1].trim()).filter(Boolean);
      return parts.join(" — ");
    }
  );

  // \resumeItem{...} → inner text
  t = t.replace(/\\resumeItem\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, "$1");

  // Common text-preserving macros
  t = t.replace(/\\(?:section|textbf|emph|uline|textit|underline)\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, "$1");

  // Drop structural macros with no payload
  t = t.replace(
    /\\(?:resumeItemListStart|resumeItemListEnd|resumeHeadingListStart|resumeHeadingListEnd|resumeSubHeadingListStart|resumeSubHeadingListEnd|begin\{[^}]*\}|end\{[^}]*\}|vspace\*?\{[^}]*\}|hspace\*?\{[^}]*\}|hfill|newline|small|large|tiny|noindent|centering)/g,
    ""
  );

  // Any remaining macro
  t = t.replace(/\\[a-zA-Z]+\*?\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\[a-zA-Z]+\*?/g, "");

  // LaTeX text tweaks
  t = t.replace(/---/g, "—").replace(/--/g, "–");
  t = t.replace(/~/g, " ").replace(/\\\\/g, " ");
  t = t.replace(/[{}]/g, "");

  return t.replace(/\s+/g, " ").trim();
}

interface Change {
  type: "added" | "removed" | "rewrote";
  text: string;
  previous?: string;
  why?: string;
}

/** Fallback: collapse raw diff lines into Change cards when no server rationales exist. */
function diffToChanges(diff: DiffLine[]): Change[] {
  const out: Change[] = [];
  const buf: { adds: string[]; removes: string[] } = { adds: [], removes: [] };

  const flush = () => {
    const adds    = buf.adds.filter(Boolean);
    const removes = buf.removes.filter(Boolean);
    const n       = Math.max(adds.length, removes.length);
    for (let i = 0; i < n; i++) {
      const a = adds[i];
      const r = removes[i];
      if (a && r)      out.push({ type: "rewrote", text: a, previous: r });
      else if (a)      out.push({ type: "added",   text: a });
      else if (r)      out.push({ type: "removed", text: r });
    }
    buf.adds = [];
    buf.removes = [];
  };

  for (const line of diff) {
    if (line.type === "add") {
      const t = latexToText(line.text);
      if (t.length > 6) buf.adds.push(t);
    } else if (line.type === "remove") {
      const t = latexToText(line.text);
      if (t.length > 6) buf.removes.push(t);
    } else {
      flush();
    }
  }
  flush();
  return out;
}

export default function DiffView({ diff, adds, removes, rationales, baseFolder, jdKeywords = [] }: Props) {
  const changes: Change[] = useMemo(() => {
    if (rationales && rationales.length) {
      return rationales.map(r => ({
        type: r.type,
        text: latexToText(r.text),
        previous: r.previous ? latexToText(r.previous) : undefined,
        why: r.why,
      }));
    }
    return diffToChanges(diff);
  }, [diff, rationales]);

  if (!diff.length && (!rationales || rationales.length === 0)) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--dim)", fontSize: 12, lineHeight: 1.6 }}>
        No previous resume to compare against.<br />
        <span style={{ fontSize: 11 }}>Click a past resume in the sidebar, then regenerate to see what changed.</span>
      </div>
    );
  }

  if (!changes.length) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--dim)", fontSize: 12, lineHeight: 1.6 }}>
        Only formatting changed — no meaningful content differences.
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
        {rationales && rationales.length > 0 && (
          <span style={{ marginLeft: "auto", color: "var(--dim)", fontSize: 11 }}>
            Hover the ⓘ icon to see why each change was made.
          </span>
        )}
      </div>

      {/* Human-readable changes */}
      {jdKeywords.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--orange)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(251,191,36,0.3)" }} />
          JD keywords highlighted
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {changes.map((c, i) => (
          <ChangeCard key={i} change={c} jdKeywords={jdKeywords} />
        ))}
      </div>
    </div>
  );
}

function ChangeCard({ change, jdKeywords = [] }: { change: Change; jdKeywords?: string[] }) {
  const [open, setOpen] = useState(false);

  const meta =
    change.type === "added"
      ? { label: "Added",   color: "var(--green)", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.25)"  }
      : change.type === "removed"
      ? { label: "Removed", color: "var(--red)",   bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)" }
      : { label: "Rewrote", color: "var(--accent)", bg: "rgba(0,113,227,0.08)",  border: "rgba(0,113,227,0.25)" };

  return (
    <div style={{
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: 10,
      padding: "12px 14px",
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          color: meta.color,
        }}>
          {meta.label}
        </div>

        {change.why && (
          <InfoIcon color={meta.color} open={open} onToggle={() => setOpen(v => !v)} tooltip={change.why} />
        )}
      </div>

      {change.type === "rewrote" && change.previous && (
        <div style={{
          fontSize: 12, color: "var(--dim)", lineHeight: 1.55, marginBottom: 6,
          textDecoration: "line-through", opacity: 0.75,
        }}>
          {change.previous}
        </div>
      )}

      <div style={{
        fontSize: 13, color: change.type === "removed" ? "var(--dim)" : "var(--text)",
        lineHeight: 1.55,
        textDecoration: change.type === "removed" ? "line-through" : "none",
      }}>
        {change.type !== "removed"
          ? highlightKeywords(change.text, jdKeywords)
          : change.text}
      </div>

      {/* Expanded "why" — shown on click (mobile-friendly) */}
      {change.why && open && (
        <div style={{
          marginTop: 10,
          padding: "10px 12px",
          background: "var(--surface2)",
          borderLeft: `3px solid ${meta.color}`,
          borderRadius: "0 8px 8px 0",
          fontSize: 12, color: "var(--text)", lineHeight: 1.55,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
            Why this change
          </div>
          {change.why}
        </div>
      )}
    </div>
  );
}

function InfoIcon({ color, open, onToggle, tooltip }: { color: string; open: boolean; onToggle: () => void; tooltip: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      aria-label={`Why this change: ${tooltip}`}
      style={{
        width: 16, height: 16, borderRadius: "50%",
        border: `1px solid ${color}`, background: open ? color : "transparent",
        color: open ? "white" : color,
        fontSize: 10, fontWeight: 700, lineHeight: 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0, fontFamily: "inherit",
      }}
    >
      i
    </button>
  );
}
