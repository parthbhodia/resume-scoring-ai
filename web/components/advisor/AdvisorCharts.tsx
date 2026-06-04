"use client";

import type { CSSProperties } from "react";

export interface ScorePoint {
  date: string | null;
  score: number | null;
  label?: string | null;
}

export interface CategoryHistoryPoint {
  date: string | null;
  scores: Record<string, number | null>;
}

const DIM_KEYS = [
  "readability",
  "atsCompatibility",
  "jobMatch",
  "achievementQuality",
  "quantification",
  "sectionStructure",
  "languageQuality",
  "technicalBranding",
] as const;

const LINE_COLORS = [
  "var(--accent, #c4793a)",
  "var(--blue, #3b82f6)",
  "var(--green)",
  "var(--amber)",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

function fmtShort(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function scoreColor(s: number | null): string {
  if (s === null) return "var(--dim)";
  if (s >= 75) return "var(--green)";
  if (s >= 55) return "var(--amber)";
  return "var(--red)";
}

function yScale(score: number, plotH: number, yMin = 0, yMax = 100): number {
  const t = (score - yMin) / Math.max(yMax - yMin, 1);
  return plotH - t * plotH;
}

function xAt(i: number, n: number, plotW: number): number {
  if (n <= 1) return plotW / 2;
  return (i / (n - 1)) * plotW;
}

function EmptyChart({ message }: { message: string }) {
  return <p className="m-0 text-xs text-muted-foreground">{message}</p>;
}

/** Overall score over time — line chart (not bars). */
export function ScoreLineChart({ history }: { history: ScorePoint[] }) {
  const valid = history.filter((p) => p.score !== null && typeof p.score === "number");
  if (valid.length === 0) return <EmptyChart message="No score data yet." />;

  const W = 400;
  const H = 140;
  const pad = { t: 14, r: 14, b: 26, l: 34 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const yMin = 0;
  const yMax = 100;

  const pts = valid.map((p, i) => ({
    x: pad.l + xAt(i, valid.length, plotW),
    y: pad.t + yScale(p.score!, plotH, yMin, yMax),
    score: p.score!,
    date: p.date,
  }));

  const lineD =
    pts.length > 1
      ? pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";

  const gridYs = [0, 25, 50, 75, 100];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full max-h-[160px]"
        role="img"
        aria-label="Score history line chart"
      >
        {gridYs.map((g) => {
          const gy = pad.t + yScale(g, plotH, yMin, yMax);
          return (
            <g key={g}>
              <line
                x1={pad.l}
                y1={gy}
                x2={W - pad.r}
                y2={gy}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={g === 0 || g === 100 ? undefined : "4 4"}
              />
              <text x={pad.l - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
                {g}
              </text>
            </g>
          );
        })}
        {lineD ? (
          <path
            d={lineD}
            fill="none"
            stroke="var(--accent, #c4793a)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill="var(--card)" stroke={scoreColor(p.score)} strokeWidth={2.5} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill={scoreColor(p.score)}>
              {p.score}
            </text>
          </g>
        ))}
        {pts.map((p, i) => (
          <text
            key={`d-${i}`}
            x={p.x}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill="var(--muted)"
          >
            {fmtShort(p.date)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Horizontal bars for dimension or category scores (0–100). */
export function ScoreBarChart({
  entries,
  emptyMessage = "No data.",
}: {
  entries: { key: string; label: string; value: number | null }[];
  emptyMessage?: string;
}) {
  const valid = entries.filter((e) => e.value !== null && typeof e.value === "number");
  if (valid.length === 0) return <EmptyChart message={emptyMessage} />;

  const maxVal = 100;

  return (
    <div className="grid gap-2.5">
      {valid.map((e) => {
        const v = e.value!;
        const pct = Math.min(100, Math.max(0, (v / maxVal) * 100));
        const color = scoreColor(v);
        return (
          <div key={e.key}>
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className="text-foreground">{e.label}</span>
              <span className="font-semibold tabular-nums" style={{ color }}>
                {Math.round(v)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%`, background: color } as CSSProperties}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Multi-line chart: weakest dimensions across analysis runs. */
export function DimensionTrendChart({
  history,
  dimLabels,
  focusKeys,
}: {
  history: CategoryHistoryPoint[];
  dimLabels: Record<string, string>;
  focusKeys?: string[];
}) {
  const validRuns = history.filter((h) => h.date && Object.values(h.scores).some((v) => v !== null));
  if (validRuns.length < 2) {
    return <EmptyChart message="Run at least two analyses to see dimension trends." />;
  }

  const keys =
    focusKeys && focusKeys.length > 0
      ? focusKeys.slice(0, 4)
      : (() => {
          const avgs: { key: string; avg: number }[] = [];
          for (const k of DIM_KEYS) {
            const vals = validRuns
              .map((r) => r.scores[k])
              .filter((v): v is number => typeof v === "number");
            if (vals.length) avgs.push({ key: k, avg: vals.reduce((a, b) => a + b, 0) / vals.length });
          }
          avgs.sort((a, b) => a.avg - b.avg);
          return avgs.slice(0, 3).map((a) => a.key);
        })();

  const W = 400;
  const H = 150;
  const pad = { t: 12, r: 12, b: 28, l: 34 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const n = validRuns.length;

  const lines = keys.map((key, ki) => {
    const pts = validRuns.map((run, i) => {
      const score = run.scores[key];
      if (typeof score !== "number") return null;
      return {
        x: pad.l + xAt(i, n, plotW),
        y: pad.t + yScale(score, plotH),
        score,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return { key, color: LINE_COLORS[ki % LINE_COLORS.length], d, pts, label: dimLabels[key] ?? key };
  }).filter((l) => l.pts.length >= 2);

  if (lines.length === 0) return <EmptyChart message="Not enough dimension scores across runs." />;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-h-[170px]" role="img" aria-label="Dimension trend chart">
        {[0, 50, 100].map((g) => {
          const gy = pad.t + yScale(g, plotH);
          return (
            <g key={g}>
              <line x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
              <text x={pad.l - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--muted">
                {g}
              </text>
            </g>
          );
        })}
        {lines.map((ln) => (
          <path key={ln.key} d={ln.d} fill="none" stroke={ln.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {validRuns.map((run, i) => (
          <text key={i} x={pad.l + xAt(i, n, plotW)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--muted)">
            {fmtShort(run.date)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {lines.map((ln) => (
          <div key={ln.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: ln.color }} />
            {ln.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildBarEntries(
  scores: Record<string, number | null>,
  labels: Record<string, string>,
  order?: readonly string[],
): { key: string; label: string; value: number | null }[] {
  const keys = order ?? Object.keys(labels);
  return keys.map((key) => ({
    key,
    label: labels[key] ?? key,
    value: scores[key] ?? null,
  }));
}

export function weakestDimKeys(
  dimAvgs: Record<string, number | null>,
  count = 3,
): string[] {
  return Object.entries(dimAvgs)
    .filter(([, v]) => v !== null && typeof v === "number")
    .sort((a, b) => (a[1] as number) - (b[1] as number))
    .slice(0, count)
    .map(([k]) => k);
}
