"use client";

import { scoreColor } from "./scoreColor";

export function ScorePill({
  score,
  total,
  label,
}: {
  score: number;
  total?: number;
  label?: string;
}) {
  const pct = total ? Math.round((score / total) * 100) : score;
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(pct) }}>
      {total ? `${score}/${total}` : `${score}%`}
      {label && (
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", marginLeft: 4 }}>
          {label}
        </span>
      )}
    </span>
  );
}
