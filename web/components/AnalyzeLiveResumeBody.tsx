"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import BulletImprovedEditor from "@/components/BulletImprovedEditor";
import { highlightMetricSpans } from "@/lib/highlightResumeMetrics";
import {
  bulletMatchesAnalysisCategory,
} from "@/lib/analysisCategoryMatch";

export interface LiveBulletItem {
  originalBullet: string;
  score: number;
  issues: string[];
  improvedBullet: string;
}

type Block =
  | { type: "header"; lines: string[] }
  | { type: "paragraph"; lines: string[] }
  | { type: "bullets"; items: Array<{ rawLine: string; bulletIdx: number }> };

function normalizeForMatch(s: string): string {
  return s
    .replace(/\u2022/g, "•")
    .replace(/^\s*[•*·\-\u2013\u2014]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a scanned PDF line to a bulletAnalysis row when text aligns. */
export function findBulletIndexForLine(
  line: string,
  bulletAnalysis: LiveBulletItem[],
): number {
  const ln = normalizeForMatch(line);
  if (ln.length < 4) return -1;

  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < bulletAnalysis.length; i++) {
    const b = normalizeForMatch(bulletAnalysis[i].originalBullet);
    if (!b || b.length < 4) continue;
    let s = 0;
    if (ln === b) s = 100;
    else if (ln.includes(b) || b.includes(ln)) s = Math.min(80, (Math.min(ln.length, b.length) / Math.max(ln.length, b.length)) * 90);
    else {
      const p = Math.min(24, b.length - 1);
      if (ln.slice(0, p) === b.slice(0, p) && p >= 12) s = 55;
    }
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return bestScore >= 55 ? best : -1;
}

function buildBlocks(lines: string[], bulletAnalysis: LiveBulletItem[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  const header: string[] = [];
  while (i < lines.length && header.length < 12) {
    const line = lines[i];
    if (findBulletIndexForLine(line, bulletAnalysis) >= 0) break;
    const t = line.trim();
    if (t === "") {
      if (header.length >= 2) {
        i++;
        break;
      }
      i++;
      continue;
    }
    header.push(line);
    i++;
  }
  if (header.length) blocks.push({ type: "header", lines: header });

  while (i < lines.length) {
    const idx = findBulletIndexForLine(lines[i], bulletAnalysis);
    if (idx >= 0) {
      const items: Array<{ rawLine: string; bulletIdx: number }> = [];
      while (i < lines.length) {
        const ti = lines[i].trim();
        if (ti === "") {
          i++;
          continue;
        }
        const j = findBulletIndexForLine(lines[i], bulletAnalysis);
        if (j < 0) break;
        items.push({ rawLine: lines[i], bulletIdx: j });
        i++;
      }
      if (items.length) blocks.push({ type: "bullets", items });
    } else {
      const t = lines[i].trim();
      if (!t) {
        i++;
        continue;
      }
      const para: string[] = [];
      while (i < lines.length) {
        const ti = lines[i].trim();
        if (!ti) break;
        if (findBulletIndexForLine(lines[i], bulletAnalysis) >= 0) break;
        para.push(lines[i]);
        i++;
      }
      if (para.length) blocks.push({ type: "paragraph", lines: para });
    }
  }

  if (!blocks.length) {
    const nonempty = lines.map(l => l.trimEnd()).filter(l => l.trim());
    if (nonempty.length) blocks.push({ type: "paragraph", lines: nonempty });
  }
  return blocks;
}

/** Render inline emphasis like PreviewPane (`**bold**`). */
function renderInline(text: string): ReactNode[] {
  const normalized = text.replace(/\\textbf\{([^}]*)\}/g, "**$1**");
  const parts = normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, k) => {
    if (/^\*\*.+\*\*$/.test(p)) {
      const inner = p.slice(2, -2);
      return <strong key={k}>{inner}</strong>;
    }
    return <span key={k}>{p}</span>;
  });
}

interface Props {
  extractedText: string;
  bulletAnalysis: LiveBulletItem[];
  activeCategory: string | null;
  rewriteEdits: Record<number, string>;
  patchBulletRewrite: (bulletIndex: number, value: string | null) => void;
  previewLineOverrides: Record<number, string>;
  patchPreviewLine: (bulletIndex: number, value: string | null) => void;
  selectedBulletIndex?: number | null;
  onBulletLinkedSelect?: (index: number) => void;
  /** Transient amber outline when the left workspace updates this bullet’s preview text. */
  pulseBulletIndex?: number | null;
  /** Document-style preview only — tint highlights, no scores / chips / rewritten text in-pane. */
  presentationOnly?: boolean;
}

export default function AnalyzeLiveResumeBody({
  extractedText,
  bulletAnalysis,
  activeCategory,
  rewriteEdits,
  patchBulletRewrite,
  previewLineOverrides,
  patchPreviewLine,
  selectedBulletIndex = null,
  onBulletLinkedSelect,
  presentationOnly = false,
  pulseBulletIndex = null,
}: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const blocks = useMemo(() => {
    const lines = extractedText.split(/\r?\n/);
    return buildBlocks(lines, bulletAnalysis);
  }, [extractedText, bulletAnalysis]);

  return (
    <div style={{
      background: "#fafaf7",
      color: "#111",
      padding: "28px 32px 48px",
      fontFamily: "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
      fontSize: 10.8,
      lineHeight: 1.38,
      minHeight: 120,
    }}>
      <style>{`
        @keyframes az-mirror-pulse {
          from {
            outline: 2px solid rgba(234, 179, 8, 0.95);
            outline-offset: 2px;
          }
          to {
            outline: 2px solid transparent;
            outline-offset: 10px;
          }
        }
      `}</style>
      {blocks.length === 0 && (
        <div style={{ color: "#757575", fontStyle: "italic" }}>No extractable résumé text.</div>
      )}
      {blocks.map((blk, bi) => {
        if (blk.type === "header") {
          const nameLine = blk.lines[0]?.trim() || "(Name)";
          const rest = blk.lines.slice(1).map(l => l.trim()).filter(Boolean);
          return (
            <div key={bi} style={{ textAlign: "center", marginBottom: 14, paddingBottom: 8, borderBottom: "0.5px solid #d7d2c6" }}>
              <div style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: 0.15, marginBottom: 4 }}>
                {renderInline(nameLine)}
              </div>
              <div style={{ fontSize: 9.8, lineHeight: 1.45, color: "#333", fontFamily: "system-ui, sans-serif" }}>
                {rest.map((ln, ui) => (
                  <div key={ui}>{renderInline(ln)}</div>
                ))}
              </div>
            </div>
          );
        }
        if (blk.type === "paragraph") {
          return (
            <div key={bi} style={{ marginBottom: 10, fontFamily: "system-ui, sans-serif", fontSize: 10.2, color: "#222" }}>
              {blk.lines.map((ln, li) => (
                <div key={li} style={{ marginBottom: 3 }}>{renderInline(ln.trim())}</div>
              ))}
            </div>
          );
        }

        /* bullets */
        return (
          <ul
            key={bi}
            style={{
              paddingLeft: 17,
              margin: "6px 0 12px",
              listStyle: "disc outside",
            }}
          >
            {blk.items.map(({ rawLine, bulletIdx }, ii) => {
              const bullet = bulletAnalysis[bulletIdx];
              if (!bullet) return null;
              const nm = normalizeForMatch(rawLine);
              const showText = previewLineOverrides[bulletIdx] ?? (nm.length >= 8 ? nm : bullet.originalBullet);

              const isHighlighted = activeCategory ? bulletMatchesAnalysisCategory(bullet, activeCategory) : false;
              const isSelected = selectedBulletIndex === bulletIdx;
              const previewLineApplied = previewLineOverrides[bulletIdx] !== undefined;

              let bg = "#fafafa";
              if (activeCategory && isHighlighted) bg = "rgba(255, 227, 222, 0.55)";
              else if (!activeCategory && bullet.issues.length) {
                bg = bullet.score < 50 ? "rgba(255, 205, 210, 0.22)" : bullet.score < 70 ? "rgba(255, 249, 196, 0.25)" : "rgba(232, 245, 233, 0.2)";
              }

              return (
                <li
                  key={`${bulletIdx}-${bi}-${ii}`}
                  data-bullet-idx={bulletIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!presentationOnly) setExpandedIdx((prev) => (prev === bulletIdx ? null : bulletIdx));
                    onBulletLinkedSelect?.(bulletIdx);
                  }}
                  style={{
                    marginBottom: 4,
                    marginLeft: 2,
                    lineHeight: 1.42,
                    padding: presentationOnly ? "5px 7px 6px" : "6px 8px 8px",
                    borderRadius: 4,
                    background: bg,
                    boxShadow: isSelected ? "inset 0 0 0 2px #2196f3" : undefined,
                    animation:
                      pulseBulletIndex === bulletIdx
                        ? "az-mirror-pulse 0.85s ease-out 1"
                        : undefined,
                    cursor: presentationOnly || bullet.improvedBullet || bullet.issues.length ? "pointer" : "default",
                    listStylePosition: "outside",
                  }}
                >
                  {!presentationOnly && (
                  <span style={{
                    fontSize: 9.6,
                    fontWeight: 800,
                    color: bullet.score >= 70 ? "#2e7d32" : bullet.score >= 55 ? "#f57c00" : "#c62828",
                    fontFamily: "system-ui, sans-serif",
                    marginRight: 6,
                  }}>
                    {bullet.score}
                  </span>
                  )}
                  <span style={{ fontSize: 10.65 }}>
                    {highlightMetricSpans(showText)}
                    {!presentationOnly && previewLineApplied && (
                      <span title="Preview line updated" style={{ marginLeft: 5, color: "#fb8c00", fontWeight: 800 }}>
                        ●
                      </span>
                    )}
                  </span>
                  {!presentationOnly && expandedIdx === bulletIdx && bullet.issues.length > 0 && (
                    <div style={{
                      marginTop: 6,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      fontFamily: "system-ui, sans-serif",
                    }}>
                      {bullet.issues.map((issue, ij) => (
                        <span key={ij} style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: "rgba(248,113,113,0.12)",
                          color: "#c62828",
                          fontWeight: 500,
                        }}>
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                  {!presentationOnly && expandedIdx === bulletIdx && !!bullet.improvedBullet && (
                    <div style={{ fontFamily: "system-ui, sans-serif" }}>
                      <BulletImprovedEditor
                        layout="plain"
                        minHeight={56}
                        value={rewriteEdits[bulletIdx] ?? (bullet.improvedBullet ?? "")}
                        onChange={v => patchBulletRewrite(bulletIdx, v)}
                        onReset={() => patchBulletRewrite(bulletIdx, null)}
                        canReset={rewriteEdits[bulletIdx] !== undefined}
                        toolbarRight={<CopyTiny text={rewriteEdits[bulletIdx] ?? (bullet.improvedBullet ?? "")} />}
                        previewLineApplied={previewLineApplied}
                        onReplaceInPreview={() => patchPreviewLine(bulletIdx, (rewriteEdits[bulletIdx] ?? bullet.improvedBullet ?? "").trim())}
                        onRevertPreviewLine={() => patchPreviewLine(bulletIdx, null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}

function CopyTiny({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
      }}
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 6,
        border: "1px solid rgba(52,211,153,0.35)",
        background: "rgba(52,211,153,0.08)",
        color: "#2e7d32",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      Copy
    </button>
  );
}
