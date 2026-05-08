"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  | { type: "section"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "bullets"; items: Array<{ rawLine: string; bulletIdx: number }> };

/** Known resume section keywords — used to distinguish section headings from ALL-CAPS names. */
const KNOWN_SECTIONS = /^(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|PROJECTS|CERTIFICATIONS|AWARDS|PUBLICATIONS|LANGUAGES|VOLUNTEER|WORK\s+HISTORY|PROFESSIONAL\s+SUMMARY|TECHNICAL\s+SKILLS|ACHIEVEMENTS?|REFERENCES|OBJECTIVE|ACTIVITIES|HONORS|LEADERSHIP|INTERESTS|EXTRACURRICULAR)/i;

function looksLikeSectionHeading(line: string, strict = false): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  // In strict mode (used for first-line header detection), only match known section keywords.
  // This prevents "JOHN DOE" or "PARTH BHODIA" from being misidentified as section headings.
  if (strict) return KNOWN_SECTIONS.test(t);
  if (/[A-Z]/.test(t) && t === t.toUpperCase() && !/^\d/.test(t)) return true;
  if (KNOWN_SECTIONS.test(t)) return true;
  return false;
}

function normalizeForMatch(s: string): string {
  return s
    .replace(/•/g, "•")
    .replace(/^\s*[•*·\-–—]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
      if (header.length >= 2) { i++; break; }
      i++;
      continue;
    }
    // Stop at any known section keyword — strict so names like "PARTH BHODIA" aren't mistaken.
    if (looksLikeSectionHeading(t, true)) break;
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
        if (ti === "") { i++; continue; }
        const j = findBulletIndexForLine(lines[i], bulletAnalysis);
        if (j < 0) break;
        items.push({ rawLine: lines[i], bulletIdx: j });
        i++;
      }
      if (items.length) blocks.push({ type: "bullets", items });
    } else {
      const t = lines[i].trim();
      if (!t) { i++; continue; }
      if (looksLikeSectionHeading(t)) {
        blocks.push({ type: "section", text: t });
        i++;
        continue;
      }
      const para: string[] = [];
      while (i < lines.length) {
        const ti = lines[i].trim();
        if (!ti) break;
        if (findBulletIndexForLine(lines[i], bulletAnalysis) >= 0) break;
        if (looksLikeSectionHeading(ti)) break;
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

function renderInline(text: string): ReactNode[] {
  const normalized = text.replace(/\\textbf\{([^}]*)\}/g, "**$1**");
  const parts = normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, k) => {
    if (/^\*\*.+\*\*$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
    return <span key={k}>{p}</span>;
  });
}

/** True if a line looks like a job/education entry header (title | company | date). */
function looksLikeEntryHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  if (t.includes("|")) return true;
  if (/\b(19|20)\d{2}\s*[–—\-]\s*((19|20)\d{2}|present|current)/i.test(t)) return true;
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(19|20)\d{2}/i.test(t)) return true;
  return false;
}

function EntryHeaderLine({ line }: { line: string }) {
  const t = line.trim();

  if (t.includes("|")) {
    const parts = t.split("|").map(p => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    const isLastDate = /\b(19|20)\d{2}\b/.test(last) || /present|current/i.test(last);
    const mains = isLastDate ? parts.slice(0, -1) : parts;
    const datePart = isLastDate ? last : null;

    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0 8px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: "#111827", fontSize: 10.8, fontFamily: "system-ui, sans-serif" }}>
            {mains[0]}
          </span>
          {mains.slice(1).map((p, i) => (
            <span key={i} style={{ color: "#546e7a", fontSize: 10, fontStyle: "italic", fontFamily: "system-ui, sans-serif" }}>
              · {p}
            </span>
          ))}
        </div>
        {datePart && (
          <span style={{ color: "#78909c", fontSize: 9.5, fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>
            {datePart}
          </span>
        )}
      </div>
    );
  }

  // Year-range line without pipe — treat as date/location
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <span style={{ color: "#78909c", fontSize: 9.5, fontStyle: "italic", fontFamily: "system-ui, sans-serif" }}>
        {renderInline(t)}
      </span>
    </div>
  );
}

function scoreBorderColor(score: number): string {
  if (score >= 70) return "rgba(52,211,153,0.8)";
  if (score >= 55) return "rgba(245,158,11,0.85)";
  return "rgba(248,113,113,0.85)";
}

function scoreBgTint(score: number, highlighted: boolean): string {
  if (highlighted) return "rgba(239,68,68,0.06)";
  if (score >= 70) return "rgba(52,211,153,0.04)";
  if (score >= 55) return "rgba(245,158,11,0.05)";
  return "rgba(248,113,113,0.06)";
}

interface PopupState {
  bulletIdx: number;
  top: number;
  left: number;
}

interface Props {
  extractedText: string;
  resumeHeader?: string[];
  bulletAnalysis: LiveBulletItem[];
  activeCategory: string | null;
  rewriteEdits: Record<number, string>;
  patchBulletRewrite: (bulletIndex: number, value: string | null) => void;
  previewLineOverrides: Record<number, string>;
  patchPreviewLine: (bulletIndex: number, value: string | null) => void;
  selectedBulletIndex?: number | null;
  onBulletLinkedSelect?: (index: number) => void;
  pulseBulletIndex?: number | null;
  presentationOnly?: boolean;
}

export default function AnalyzeLiveResumeBody({
  extractedText,
  resumeHeader,
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
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupDraft, setPopupDraft] = useState<string>("");
  const popupRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => {
    const lines = extractedText.split(/\r?\n/);
    const result = buildBlocks(lines, bulletAnalysis);
    // If buildBlocks didn't find a header (name/contact) but the backend sent one,
    // prepend it so the name always appears at the top of the preview.
    if (result[0]?.type !== "header" && resumeHeader && resumeHeader.length > 0) {
      result.unshift({ type: "header", lines: resumeHeader });
    }
    return result;
  }, [extractedText, bulletAnalysis, resumeHeader]);

  useEffect(() => {
    if (popup == null) return;
    const bullet = bulletAnalysis[popup.bulletIdx];
    if (!bullet) return;
    setPopupDraft(rewriteEdits[popup.bulletIdx] ?? bullet.improvedBullet ?? "");
  }, [popup, rewriteEdits, bulletAnalysis]);

  useEffect(() => {
    if (!popup) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
    };
    window.addEventListener("mousedown", handler, true);
    return () => window.removeEventListener("mousedown", handler, true);
  }, [popup]);

  useEffect(() => {
    if (!popup) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [popup]);

  const popupBullet = popup != null ? bulletAnalysis[popup.bulletIdx] : null;
  const popupPreviewApplied = popup != null ? previewLineOverrides[popup.bulletIdx] !== undefined : false;

  return (
    <div style={{
      background: "#fff",
      color: "#111",
      padding: "32px 36px 52px",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: 10.8,
      lineHeight: 1.45,
      minHeight: 120,
    }}>
      <style>{`
        @keyframes az-mirror-pulse {
          0%   { outline: 2px solid rgba(234,179,8,0.95); outline-offset: 1px; }
          100% { outline: 2px solid transparent; outline-offset: 8px; }
        }
        .az-resume-bullet {
          position: relative;
          padding: 4px 8px 4px 12px;
          border-radius: 3px;
          margin-bottom: 3px;
          cursor: default;
          transition: background 0.12s;
        }
        .az-resume-bullet::before {
          content: "•";
          position: absolute;
          left: 1px;
          top: 4px;
          color: #9e9e9e;
          font-size: 10px;
          line-height: 1.45;
        }
      `}</style>

      {blocks.length === 0 && (
        <div style={{ color: "#9e9e9e", fontStyle: "italic", textAlign: "center", padding: "32px 0" }}>
          No extractable résumé text.
        </div>
      )}

      {blocks.map((blk, bi) => {

        /* ── Name / contact header ── */
        if (blk.type === "header") {
          const nameLine = blk.lines[0]?.trim() || "";
          const contactLines = blk.lines.slice(1).map(l => l.trim()).filter(Boolean);
          // Flatten contact info — split on common separators into individual items
          const contactItems: string[] = [];
          for (const ln of contactLines) {
            const parts = ln.split(/[|•·,]\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);
            contactItems.push(...(parts.length > 1 ? parts : [ln]));
          }

          return (
            <div key={bi} style={{ textAlign: "center", marginBottom: 18, paddingBottom: 14, borderBottom: "1.5px solid #1a237e" }}>
              {nameLine && (
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: "#0d1b2a",
                  marginBottom: 7,
                  fontFamily: "'Georgia', serif",
                }}>
                  {renderInline(nameLine)}
                </div>
              )}
              {contactItems.length > 0 && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0 4px",
                  fontSize: 9.4,
                  color: "#455a64",
                  fontFamily: "system-ui, sans-serif",
                  lineHeight: 1.7,
                }}>
                  {contactItems.map((item, ci) => (
                    <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {ci > 0 && <span style={{ color: "#b0bec5", fontSize: 8 }}>◆</span>}
                      {renderInline(item)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

        /* ── Section heading ── */
        if (blk.type === "section") {
          return (
            <div key={bi} style={{
              marginTop: 18,
              marginBottom: 7,
              paddingBottom: 3,
              borderBottom: "1.5px solid #1a237e",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.6,
              color: "#1a237e",
              textTransform: "uppercase",
              fontFamily: "system-ui, sans-serif",
            }}>
              {blk.text}
            </div>
          );
        }

        /* ── Paragraph / entry header ── */
        if (blk.type === "paragraph") {
          return (
            <div key={bi} style={{ marginBottom: 6 }}>
              {blk.lines.map((ln, li) => {
                const t = ln.trim();
                if (!t) return null;
                if (looksLikeEntryHeader(t)) {
                  return (
                    <div key={li} style={{ marginBottom: li === 0 ? 2 : 1 }}>
                      <EntryHeaderLine line={t} />
                    </div>
                  );
                }
                // Plain paragraph text (summary, skills list, location, etc.)
                return (
                  <div key={li} style={{
                    fontSize: 10.4,
                    color: "#374151",
                    lineHeight: 1.55,
                    marginBottom: 2,
                    fontFamily: li === 0 ? "'Georgia', serif" : "system-ui, sans-serif",
                  }}>
                    {renderInline(t)}
                  </div>
                );
              })}
            </div>
          );
        }

        /* ── Bullet rows ── */
        return (
          <div key={bi} style={{ marginBottom: 10, marginTop: 4 }}>
            {blk.items.map(({ rawLine, bulletIdx }, ii) => {
              const bullet = bulletAnalysis[bulletIdx];
              if (!bullet) return null;

              const nm = normalizeForMatch(rawLine);
              const showText = previewLineOverrides[bulletIdx] ?? (nm.length >= 8 ? nm : bullet.originalBullet);
              const isHighlighted = activeCategory ? bulletMatchesAnalysisCategory(bullet, activeCategory) : false;
              const isSelected = selectedBulletIndex === bulletIdx;
              const previewLineApplied = previewLineOverrides[bulletIdx] !== undefined;
              const hasActionable = !!(bullet.improvedBullet || bullet.issues.length);
              const isPulsing = pulseBulletIndex === bulletIdx;

              const borderColor = scoreBorderColor(bullet.score);
              const bgTint = scoreBgTint(bullet.score, isHighlighted);

              return (
                <div
                  key={`${bulletIdx}-${bi}-${ii}`}
                  data-bullet-idx={bulletIdx}
                  className="az-resume-bullet"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (presentationOnly && hasActionable) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const popupTop = Math.max(8, Math.min(rect.top, window.innerHeight - 340));
                      const popupLeft = Math.max(8, rect.left - 336);
                      setPopup({ bulletIdx, top: popupTop, left: popupLeft });
                      setPopupDraft(rewriteEdits[bulletIdx] ?? bullet.improvedBullet ?? "");
                    } else if (!presentationOnly) {
                      setExpandedIdx((prev) => (prev === bulletIdx ? null : bulletIdx));
                    }
                    onBulletLinkedSelect?.(bulletIdx);
                  }}
                  style={{
                    background: bgTint,
                    borderLeft: `3px solid ${isHighlighted || !activeCategory ? borderColor : "transparent"}`,
                    boxShadow: isSelected ? "inset 0 0 0 1.5px #2196f3" : undefined,
                    cursor: hasActionable ? "pointer" : "default",
                    animation: isPulsing ? "az-mirror-pulse 0.85s ease-out 1" : undefined,
                    paddingLeft: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    {/* Score badge — visible in non-presentation mode only */}
                    {!presentationOnly && (
                      <span style={{
                        flexShrink: 0,
                        marginTop: 1,
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "1px 5px",
                        borderRadius: 8,
                        background: bullet.score >= 70 ? "rgba(52,211,153,0.14)" : bullet.score >= 55 ? "rgba(245,158,11,0.14)" : "rgba(248,113,113,0.14)",
                        color: bullet.score >= 70 ? "#2e7d32" : bullet.score >= 55 ? "#b45309" : "#c62828",
                        fontFamily: "system-ui, sans-serif",
                      }}>
                        {bullet.score}
                      </span>
                    )}

                    <span style={{ flex: 1, fontSize: 10.65, lineHeight: 1.45, color: "#1f2937" }}>
                      {highlightMetricSpans(showText)}
                      {previewLineApplied && (
                        <span
                          title={presentationOnly ? "Suggestion applied" : "Preview updated"}
                          style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: presentationOnly ? "#43a047" : "#fb8c00" }}
                        >
                          {presentationOnly ? "✓" : "●"}
                        </span>
                      )}
                      {presentationOnly && hasActionable && !previewLineApplied && (
                        <span title="Click to see AI suggestion" style={{ marginLeft: 5, fontSize: 9, color: "#90a4ae" }}>✦</span>
                      )}
                    </span>
                  </div>

                  {/* Inline detail (non-presentation mode only) */}
                  {!presentationOnly && expandedIdx === bulletIdx && bullet.issues.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, paddingLeft: 2, fontFamily: "system-ui, sans-serif" }}>
                      {bullet.issues.map((issue, ij) => (
                        <span key={ij} style={{
                          fontSize: 9, padding: "1px 6px", borderRadius: 8,
                          background: "rgba(248,113,113,0.10)", color: "#c62828", fontWeight: 500,
                        }}>
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                  {!presentationOnly && expandedIdx === bulletIdx && !!bullet.improvedBullet && (
                    <div style={{ fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
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
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ── AI suggestion popup (presentationOnly click on bullet) ── */}
      {popup && popupBullet && (
        <div
          ref={popupRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: popup.top,
            left: popup.left,
            zIndex: 9999,
            width: 320,
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
            border: "1px solid #e2e8f0",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: 12,
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px 8px", borderBottom: "1px solid #f0f4f8", background: "#f8fafc",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10,
                background: popupBullet.score >= 70 ? "rgba(52,211,153,0.15)" : popupBullet.score >= 55 ? "rgba(245,158,11,0.15)" : "rgba(248,113,113,0.15)",
                color: popupBullet.score >= 70 ? "#2e7d32" : popupBullet.score >= 55 ? "#c07000" : "#c62828",
              }}>
                {popupBullet.score}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>AI Suggestion</span>
            </div>
            <button
              type="button"
              onClick={() => setPopup(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "2px 4px", borderRadius: 4, fontSize: 15, lineHeight: 1 }}
              aria-label="Close"
            >×</button>
          </div>

          {popupBullet.issues.length > 0 && (
            <div style={{ padding: "8px 12px 6px", display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid #f0f4f8" }}>
              {popupBullet.issues.map((issue, j) => (
                <span key={j} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "rgba(248,113,113,0.10)", color: "#c62828", fontWeight: 500 }}>
                  {issue}
                </span>
              ))}
            </div>
          )}

          {popupBullet.improvedBullet ? (
            <div style={{ padding: "10px 12px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Suggested rewrite
              </div>
              <textarea
                value={popupDraft}
                onChange={(e) => { setPopupDraft(e.target.value); patchBulletRewrite(popup.bulletIdx, e.target.value); }}
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 12, lineHeight: 1.55,
                  color: "#1e293b", border: "1px solid #e2e8f0", borderRadius: 6,
                  padding: "8px 10px", resize: "vertical", fontFamily: "inherit",
                  background: "#f8fafc", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#6366f1"; e.target.style.background = "#fff"; }}
                onBlur={(e) => { e.target.style.borderColor = "#e2e8f0"; e.target.style.background = "#f8fafc"; }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                {popupDraft !== (popupBullet.improvedBullet ?? "") && (
                  <button
                    type="button"
                    onClick={() => { setPopupDraft(popupBullet.improvedBullet ?? ""); patchBulletRewrite(popup.bulletIdx, null); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#6b7280", cursor: "pointer", fontFamily: "inherit" }}
                  >Reset</button>
                )}
                <button
                  type="button"
                  onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(popupDraft); } catch { /* ignore */ } }}
                  style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.08)", color: "#2e7d32", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                >Copy</button>
                {popupPreviewApplied ? (
                  <button
                    type="button"
                    onClick={() => { patchPreviewLine(popup.bulletIdx, null); setPopup(null); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #fb8c00", background: "rgba(251,140,0,0.08)", color: "#e65100", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                  >Revert</button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { patchPreviewLine(popup.bulletIdx, popupDraft.trim()); setPopup(null); }}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "none", background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, boxShadow: "0 2px 6px rgba(79,70,229,0.3)" }}
                  >Apply to preview</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px", color: "#6b7280", fontSize: 11 }}>No rewrite suggestion available for this bullet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyTiny({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }}
      style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.08)", color: "#2e7d32", cursor: "pointer", fontFamily: "inherit" }}
    >Copy</button>
  );
}
