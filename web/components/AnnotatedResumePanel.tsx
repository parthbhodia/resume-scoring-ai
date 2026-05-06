"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BulletImprovedEditor from "@/components/BulletImprovedEditor";
import AnalyzeLiveResumeBody from "@/components/AnalyzeLiveResumeBody";
import { highlightMetricSpans } from "@/lib/highlightResumeMetrics";
import {
  bulletMatchesAnalysisCategory,
} from "@/lib/analysisCategoryMatch";

// Re-export for legacy imports from this file path
export { CATEGORY_ISSUE_KEYWORDS } from "@/lib/analysisCategoryMatch";

interface BulletItem {
  originalBullet: string;
  score: number;
  issues: string[];
  improvedBullet: string;
}

interface SectionItem {
  section: string;
  score: number;
  feedback: string;
}

interface Props {
  bulletAnalysis: BulletItem[];
  sectionFeedback: SectionItem[];
  activeCategory: string | null;
  /** Per-bullet edited text for AI suggestions (key = index in bulletAnalysis). */
  rewriteEdits: Record<number, string>;
  /** Set edited text, or pass null to clear and show the model suggestion again. */
  patchBulletRewrite: (bulletIndex: number, value: string | null) => void;
  /** Replaces the scanned bullet shown in this column only (Analyze preview, not PDF). */
  previewLineOverrides: Record<number, string>;
  patchPreviewLine: (bulletIndex: number, value: string | null) => void;
  /** Bidirectional sync: visually emphasize this row */
  selectedBulletIndex?: number | null;
  /** Clicking a bullet syncs sidebar category */
  onBulletLinkedSelect?: (index: number) => void;
  /** Open full editor / builder (Résumé Builder path from Analyze). */
  onOpenBuilder?: () => void;
  builderReady?: boolean;
  builderOpening?: boolean;
  /** Full plain text from the PDF / TeX — same extract the analyzer used. */
  extractedText?: string | null;
  /** Right column: résumé tint only; edits and rewrites stay in the work column. */
  presentationOnly?: boolean;
  /** Brief highlight on the mirrored bullet after an override syncs from the left. */
  pulseBulletIndex?: number | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--green)";
  if (score >= 60) return "#f59e0b";
  return "var(--red)";
}

function scoreBg(score: number): string {
  if (score >= 80) return "rgba(52,211,153,0.12)";
  if (score >= 60) return "rgba(245,158,11,0.12)";
  return "rgba(248,113,113,0.12)";
}

/** Thick left callout on the preview mirror — aligned with score tier (strong / fair / weak). */
function mirrorToneStyles(score: number): { bar: string; bg: string; shadow: string } {
  if (score >= 75) {
    return {
      bar: "rgba(52, 211, 153, 0.92)",
      bg: "rgba(52, 211, 153, 0.12)",
      shadow: "0 0 20px rgba(52, 211, 153, 0.18)",
    };
  }
  if (score >= 55) {
    return {
      bar: "rgba(245, 158, 11, 0.95)",
      bg: "rgba(245, 158, 11, 0.1)",
      shadow: "0 0 18px rgba(245, 158, 11, 0.16)",
    };
  }
  return {
    bar: "rgba(248, 113, 113, 0.95)",
    bg: "rgba(248, 113, 113, 0.11)",
    shadow: "0 0 20px rgba(248, 113, 113, 0.18)",
  };
}

/** When the API omits `extractedText`, rebuild a minimal "page" from bullets + section headers. */
function syntheticExtractFromBullets(bullets: BulletItem[], sections: SectionItem[]): string {
  if (!bullets.length) return "";
  const bulletLines = bullets.map((b) => "- " + b.originalBullet.trim()).filter(Boolean);
  if (sections.length > 0) {
    const sectionNames = sections.map((s) => s.section.toUpperCase());
    const expIdx = sectionNames.findIndex((n) => n.includes("EXPERIENCE") || n.includes("WORK"));
    if (expIdx >= 0) {
      const before = sectionNames.slice(0, expIdx + 1).join("\n");
      const after = sectionNames.slice(expIdx + 1).join("\n");
      return [before, ...bulletLines, after].filter(Boolean).join("\n");
    }
    return [sectionNames[0], ...bulletLines, ...sectionNames.slice(1)].filter(Boolean).join("\n");
  }
  return bulletLines.join("\n");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={copy}
      title="Copy improved bullet to clipboard"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 7,
        border: `1px solid ${copied ? "rgba(52,211,153,0.5)" : "rgba(52,211,153,0.3)"}`,
        background: copied ? "rgba(52,211,153,0.15)" : "rgba(52,211,153,0.08)",
        color: "var(--green)",
        fontSize: 10.5,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: "inherit",
        letterSpacing: 0.2,
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!copied) { e.currentTarget.style.background = "rgba(52,211,153,0.18)"; } }}
      onMouseLeave={e => { if (!copied) { e.currentTarget.style.background = "rgba(52,211,153,0.08)"; } }}
    >
      {copied ? (
        <>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export default function AnnotatedResumePanel({
  bulletAnalysis,
  sectionFeedback,
  activeCategory,
  rewriteEdits,
  patchBulletRewrite,
  previewLineOverrides,
  patchPreviewLine,
  selectedBulletIndex = null,
  onBulletLinkedSelect,
  extractedText,
  onOpenBuilder,
  builderReady = false,
  builderOpening = false,
  presentationOnly = false,
  pulseBulletIndex = null,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [mirrorBox, setMirrorBox] = useState<{
    top: number;
    height: number;
    opacity: number;
    bar: string;
    bg: string;
    shadow: string;
  }>({
    top: 0,
    height: 0,
    opacity: 0,
    bar: "transparent",
    bg: "transparent",
    shadow: "none",
  });

  const fullExtract = (extractedText ?? "").trim();
  const syntheticExtract = useMemo(
    () => syntheticExtractFromBullets(bulletAnalysis, sectionFeedback).trim(),
    [bulletAnalysis, sectionFeedback],
  );

  /**
   * True when the full extract has at least 2 non-bullet lines (name, contact,
   * section headings, etc.) — meaning it is a real resume document rather than
   * just a flat list of bullet strings returned by the API.
   */
  const fullExtractHasStructure = useMemo(() => {
    if (!fullExtract) return false;
    const lines = fullExtract.split("\n").map((l) => l.trim()).filter(Boolean);
    const nonBulletLines = lines.filter((l) => !/^[-•–—*]/.test(l));
    return nonBulletLines.length >= 2;
  }, [fullExtract]);

  /**
   * Use the full extract when it has real structure; fall back to the synthetic
   * version (which injects sectionFeedback headings) when it is a bare bullet dump.
   */
  const effectiveExtracted = fullExtractHasStructure
    ? fullExtract
    : syntheticExtract || fullExtract;

  const extractKind: "full" | "synthetic" | "none" = fullExtractHasStructure
    ? "full"
    : syntheticExtract
      ? "synthetic"
      : fullExtract
        ? "synthetic"
        : "none";
  const useLiveDoc = extractKind !== "none";

  const flaggedCount = activeCategory
    ? bulletAnalysis.filter(b => bulletMatchesAnalysisCategory(b, activeCategory)).length
    : 0;
  const totalCount = bulletAnalysis.length;

  /** Maps `data-bullet-idx` on the preview page to a thick, score-colored frame (split / presentation column). */
  const updateMirrorPosition = useCallback(() => {
    if (!presentationOnly) {
      setMirrorBox((b) => (b.opacity === 0 ? b : { ...b, opacity: 0 }));
      return;
    }
    const idx = selectedBulletIndex;
    const paper = paperRef.current;
    if (idx == null || !paper) {
      setMirrorBox((b) => ({ ...b, opacity: 0 }));
      return;
    }
    const el = paper.querySelector(`[data-bullet-idx="${idx}"]`) as HTMLElement | null;
    if (!el) {
      setMirrorBox((b) => ({ ...b, opacity: 0 }));
      return;
    }
    const paperRect = paper.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const pad = 6;
    const top = elRect.top - paperRect.top - pad * 0.35;
    const height = elRect.height + pad;
    const bullet = bulletAnalysis[idx];
    const score = bullet?.score ?? 60;
    const tone = mirrorToneStyles(score);
    setMirrorBox({ top, height, opacity: 1, ...tone });
  }, [presentationOnly, selectedBulletIndex, bulletAnalysis, effectiveExtracted, previewLineOverrides]);

  useLayoutEffect(() => {
    updateMirrorPosition();
    const id = requestAnimationFrame(() => updateMirrorPosition());
    return () => cancelAnimationFrame(id);
  }, [updateMirrorPosition]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateMirrorPosition();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [updateMirrorPosition]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateMirrorPosition());
    ro.observe(paper);
    return () => ro.disconnect();
  }, [updateMirrorPosition]);

  useEffect(() => {
    const onResize = () => updateMirrorPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateMirrorPosition]);

  // Scroll first highlighted bullet when category changes (sidebar drives preview).
  useEffect(() => {
    if (!activeCategory) return;
    const idx = bulletAnalysis.findIndex(b =>
      bulletMatchesAnalysisCategory(b, activeCategory)
    );
    if (idx < 0) return;
    const id = window.setTimeout(() => {
      scrollRef.current
        ?.querySelector?.(`[data-bullet-idx="${idx}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [activeCategory, bulletAnalysis]);

  // Scroll selected bullet into view (preview drives sidebar).
  useEffect(() => {
    if (selectedBulletIndex == null) return;
    const idx = selectedBulletIndex;
    const id = window.setTimeout(() => {
      scrollRef.current
        ?.querySelector?.(`[data-bullet-idx="${idx}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: presentationOnly ? "center" : "nearest" });
    }, 40);
    return () => window.clearTimeout(id);
  }, [selectedBulletIndex, presentationOnly]);

  return (
    <div
      className="rw-annotated-panel"
      style={{
        width: presentationOnly ? "100%" : 460,
        minWidth: presentationOnly ? 0 : undefined,
        flexShrink: 0,
        borderLeft: presentationOnly ? "1px solid var(--border)" : "1px solid #dfe3ea",
        background: presentationOnly
          ? "var(--bg, #f4f5f7)"
          : "linear-gradient(180deg, #e8ecf2 0%, #e4e8ef 40%, #dfe4ec 100%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        ...(presentationOnly ? { flex: 1, minHeight: 0, maxHeight: "none", alignSelf: "stretch" } : { maxHeight: "100vh" }),
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {!presentationOnly && (
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid #cfd8e6",
        background: "#f6f8fc",
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            disabled={!builderReady || builderOpening || !onOpenBuilder}
            onClick={e => { e.preventDefault(); onOpenBuilder?.(); }}
            title="Open Résumé Builder to edit structured bullets"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.03,
              textTransform: "uppercase",
              padding: "7px 12px",
              borderRadius: 8,
              border: "none",
              background: builderReady ? "linear-gradient(180deg, #ff9966 0%, #fb7c44 100%)" : "#ccc",
              color: "#fff",
              cursor: builderReady ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              boxShadow: builderReady ? "0 2px 0 rgba(214,93,41,0.35)" : "none",
            }}
          >
            {builderOpening ? "Opening…" : "Résumé rewriter"}
          </button>
          <button
            type="button"
            disabled={!builderReady || !onOpenBuilder}
            onClick={e => { e.preventDefault(); onOpenBuilder?.(); }}
            title="Tune suggestions and apply drafts in Résumé Builder"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid #c5d0e0",
              background: "#fff",
              color: "#3d4f6e",
              cursor: builderReady ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ fontSize: 12 }}>✨</span>
            Magic write
          </button>
        </div>
        <button
          type="button"
          disabled
          title="Re-run analysis after you change the source file"
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px dashed #b0bec5",
            background: "#fff",
            color: "#90a4ae",
            cursor: "not-allowed",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 2v2M6 8v2M3 4l-1.2 1.2M10.2 6.8L9 8M3 8l-1.2-1.2M10.2 5.2L9 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <rect x="4" y="5" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Re-score
        </button>
      </div>
      )}

      {/* Panel sub-header */}
      <div style={{
        borderBottom: "1px solid #d5dde8",
        background: "#fff",
        flexShrink: 0,
      }}>
        <div style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 800,
            color: "#546e7a",
            letterSpacing: 0.56,
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 14V3a1 1 0 011-1h8a1 1 0 011 1v11l-2.5-1.5L8 14l-2.5-1.5L3 14z" stroke="#546e7a" strokeWidth="1.35" strokeLinejoin="round"/>
            </svg>
            {presentationOnly ? "Résumé preview" : useLiveDoc ? "Live résumé" : "Analyzed lines"}
          </div>
          {activeCategory ? (
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: flaggedCount > 0 ? "#c62828" : "#2e7d32",
              background: flaggedCount > 0 ? "#ffebee" : "#e8f5e9",
              padding: "3px 10px",
              borderRadius: 20,
            }}>
              {flaggedCount}/{totalCount} need work here
            </div>
          ) : (
            <div style={{
              fontSize: 11,
              color: "#78909c",
            }}>
              {totalCount} lines scored
            </div>
          )}
        </div>
        {extractKind === "synthetic" && !presentationOnly ? (
          <div
            style={{
              padding: "0 16px 10px",
              fontSize: 10,
              color: "#78909c",
              lineHeight: 1.45,
            }}
          >
            Full document text wasn&apos;t returned (re‑analyze after updating the API for name, contact, and sections). Showing bullets as a printable preview.
          </div>
        ) : null}
      </div>

      {/* Section score pills */}
      {!presentationOnly && sectionFeedback.length > 0 && (
        <div style={{
          padding: "8px 14px 10px",
          borderBottom: "1px solid #d5dde8",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          flexShrink: 0,
          background: "#fff",
        }}>
          {sectionFeedback.map((sf) => (
            <div
              key={sf.section}
              title={sf.feedback}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 20,
                background: scoreBg(sf.score),
                border: `1px solid ${scoreColor(sf.score)}33`,
                cursor: "default",
              }}
            >
              <span style={{ color: "var(--muted)", fontWeight: 500 }}>{sf.section}</span>
              <span style={{ color: scoreColor(sf.score) }}>{sf.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {!activeCategory && (
        <div style={{
          padding: "7px 14px",
          borderBottom: "1px solid #d5dde8",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
          background: "#fdfdfe",
          fontSize: 10,
          color: "#607d8b",
        }}>
          {[
            { bg: "#ffcdd2", label: "Weak line", border: "#ef5350" },
            { bg: "#fff9c4", label: "Fair", border: "#fbc02d" },
            { bg: "#c8e6c9", label: "Strong / metrics", border: "#66bb6a" },
          ].map(({ bg, label, border }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 14, height: 6, borderRadius: 2, background: bg, boxShadow: `inset 0 0 0 1px ${border}55` }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      {activeCategory && !presentationOnly && (
        <div style={{
          padding: "8px 14px",
          borderBottom: "1px solid #d5dde8",
          fontSize: 11,
          color: "#b71c1c",
          fontWeight: 600,
          flexShrink: 0,
          background: "#ffebee",
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ marginRight: 5, verticalAlign: "middle" }}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Highlighted bullets have issues in the selected category
        </div>
      )}

      {/* Document card + bullets */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>
        <div
          ref={paperRef}
          style={{
            position: "relative",
            background: "#fefefe",
            borderRadius: 3,
            boxShadow: "0 1px 3px rgba(45,55,72,0.06), 0 16px 48px rgba(45,55,72,0.08)",
            border: "1px solid #e2e8f0",
            maxWidth: "100%",
            margin: "0 auto",
          }}
        >
          {presentationOnly && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: mirrorBox.top,
                height: Math.max(mirrorBox.height, 0),
                opacity: mirrorBox.opacity,
                pointerEvents: "none",
                borderLeft: `8px solid ${mirrorBox.bar}`,
                background: mirrorBox.bg,
                boxShadow: mirrorBox.shadow,
                borderRadius: 6,
                transition:
                  "top 0.28s cubic-bezier(0.4, 0, 0.2, 1), height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, background 0.2s ease, border-color 0.2s ease",
                zIndex: 2,
              }}
            />
          )}
          {useLiveDoc ? (
              <AnalyzeLiveResumeBody
                extractedText={effectiveExtracted}
                bulletAnalysis={bulletAnalysis}
                activeCategory={activeCategory}
                rewriteEdits={rewriteEdits}
                patchBulletRewrite={patchBulletRewrite}
                previewLineOverrides={previewLineOverrides}
                patchPreviewLine={patchPreviewLine}
                selectedBulletIndex={selectedBulletIndex}
                onBulletLinkedSelect={onBulletLinkedSelect}
                presentationOnly={presentationOnly}
                pulseBulletIndex={pulseBulletIndex}
              />
          ) : (
          <>
          <div style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid #eef2f7",
            fontSize: 17,
            fontWeight: 700,
            color: "#1a237e",
            letterSpacing: -0.3,
          }}>
            Résumé lines (no full extract)
          </div>
        {bulletAnalysis.length === 0 ? (
          <div style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#90a4ae",
            fontSize: 13,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
            No bullets analyzed yet
          </div>
        ) : (
          bulletAnalysis.map((bullet, i) => {
            const isHighlighted = activeCategory
              ? bulletMatchesAnalysisCategory(bullet, activeCategory)
              : false;
            const isHovered = hoveredIdx === i;
            const isExpanded = expandedIdx === i;
            const hasIssues = bullet.issues.length > 0;
            const hasImproved = !!bullet.improvedBullet;
            const baseImproved = bullet.improvedBullet ?? "";
            const draft = rewriteEdits[i] ?? baseImproved;
            const previewLine = previewLineOverrides[i] ?? bullet.originalBullet;
            const previewLineApplied = previewLineOverrides[i] !== undefined;

            let bgColor = "#fafbfc";

            if (activeCategory && isHighlighted) {
              bgColor = "rgba(255, 227, 222, 0.65)";
            } else if (!activeCategory && hasIssues) {
              bgColor = bullet.score < 50
                ? "rgba(255, 205, 210, 0.35)"
                : bullet.score < 70
                ? "rgba(255, 249, 196, 0.5)"
                : "rgba(232, 245, 233, 0.4)";
            }

            const showDetail = presentationOnly ? false : (isExpanded || isHovered);

            const isSelected = selectedBulletIndex === i;

            return (
              <div
                key={i}
                data-bullet-idx={i}
                onMouseEnter={() => { if (!presentationOnly) setHoveredIdx(i); }}
                onMouseLeave={() => { if (!presentationOnly) setHoveredIdx(null); }}
                onClick={() => {
                  if (!presentationOnly) setExpandedIdx(isExpanded ? null : i);
                  onBulletLinkedSelect?.(i);
                }}
                style={{
                  padding: "11px 18px 11px 16px",
                  margin: 0,
                  borderRadius: 0,
                  boxShadow: isSelected ? "inset 0 0 0 2px #2196f3" : undefined,
                  borderLeft: "none",
                  background: isExpanded ? "#f5f7fa" : isHovered ? "#f0f4f8" : bgColor,
                  transition: "background 0.15s, box-shadow 0.15s",
                  cursor: hasIssues || hasImproved ? "pointer" : "default",
                  borderBottom: i < bulletAnalysis.length - 1 ? "1px solid #eceff1" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: presentationOnly ? 0 : 10 }}>
                  {!presentationOnly && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 7px",
                    borderRadius: 10,
                    background: scoreBg(bullet.score),
                    color: scoreColor(bullet.score),
                    flexShrink: 0,
                    marginTop: 1,
                    lineHeight: 1.5,
                    fontFamily: "system-ui, sans-serif",
                  }}>
                    {bullet.score}
                  </span>
                  )}
                  <span style={{
                    fontSize: 13,
                    color: "#263238",
                    lineHeight: 1.65,
                    fontWeight: isHighlighted || isExpanded ? 500 : 400,
                    flex: 1,
                    transition: "color 0.15s, font-weight 0.15s",
                  }}>
                    {highlightMetricSpans(previewLine)}
                    {!presentationOnly && previewLineApplied && (
                      <span title="Preview line updated for this session." style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, verticalAlign: "super", color: "#fb8c00", letterSpacing: 0.2 }}>
                        ●
                      </span>
                    )}
                  </span>
                  {!presentationOnly && (hasIssues || hasImproved) && (
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{
                      flexShrink: 0,
                      marginTop: 4,
                      color: "#78909c",
                      transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(180deg)" : "none",
                    }}
                  >
                    <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  )}
                </div>

                {/* Issue chips — shown when highlighted or expanded/hovered */}
                {showDetail && hasIssues && (
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 7,
                    paddingLeft: 32,
                  }}>
                    {bullet.issues.map((issue, j) => (
                      <span key={j} style={{
                        fontSize: 10,
                        fontWeight: 500,
                        padding: "2px 7px",
                        borderRadius: 10,
                        background: "rgba(248,113,113,0.10)",
                        color: "var(--red)",
                      }}>
                        {issue}
                      </span>
                    ))}
                  </div>
                )}

                {/* Improved version — shown when expanded or hovered */}
                {showDetail && hasImproved && (
                  <BulletImprovedEditor
                    layout="panel"
                    value={draft}
                    onChange={v => patchBulletRewrite(i, v)}
                    onReset={() => patchBulletRewrite(i, null)}
                    canReset={rewriteEdits[i] !== undefined}
                    toolbarRight={<CopyButton text={draft} />}
                    previewLineApplied={previewLineApplied}
                    onReplaceInPreview={() => patchPreviewLine(i, draft.trim())}
                    onRevertPreviewLine={() => patchPreviewLine(i, null)}
                  />
                )}
              </div>
            );
          })
        )}
        </>
          )}
        </div>
      </div>
    </div>
  );
}
