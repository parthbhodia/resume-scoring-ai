import type { ReactNode } from "react";

/**
 * Wraps common résumé metric patterns in a soft green background (Resume Worded–style “good” spans).
 * Best-effort only — not a full NLP parse.
 */
export function highlightMetricSpans(text: string): ReactNode[] {
  const re = /(\d+(?:\.\d+)?%|\$\d[\d,]*|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s*(?:k|K|M|m|bn|million|billion)\b|\b\d{2,}\+?\b)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark
        key={`hk-${key++}`}
        style={{
          background: "rgba(165, 214, 167, 0.55)",
          color: "inherit",
          padding: "0 2px",
          borderRadius: 2,
          fontWeight: 600,
        }}
      >
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : [text];
}
