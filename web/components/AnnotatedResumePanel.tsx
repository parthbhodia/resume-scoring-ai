"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import BulletImprovedEditor from "@/components/BulletImprovedEditor";
import AnalyzeLiveResumeBody, {
  lineLooksLikeStandaloneSectionHeading,
  mergeResumeHeaderSources,
} from "@/components/AnalyzeLiveResumeBody";
import { highlightMetricSpans } from "@/lib/highlightResumeMetrics";
import {
  bulletBelongsToCategory,
  bulletMatchesAnalysisCategory,
  countBulletsInCategory,
  type CategoryAssignmentOptions,
} from "@/lib/analysisCategoryMatch";
import { useHtmlPdfExport } from "@/hooks/useHtmlPdfExport";
import { useResumeAnalyzeStore } from "@/store/resumeAnalyzeStore";
import { ownerSlugFromProfile } from "@/lib/resumeFileName";

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
  /** Human label for activeCategory (e.g. "Readability") — used in preview badge copy. */
  activeCategoryLabel?: string;
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
  /** Open Résumé Builder; optional `referenceFolder` selects LaTeX layout (see resumeTemplates). */
  onOpenBuilder?: (opts?: { referenceFolder?: string }) => void;
  builderReady?: boolean;
  builderOpening?: boolean;
  /** Full plain text from the PDF / TeX — same extract the analyzer used. */
  extractedText?: string | null;
  /** Name + contact lines from backend — guaranteed header fallback. */
  resumeHeader?: string[];
  /** Right column: résumé tint only; edits and rewrites stay in the work column. */
  presentationOnly?: boolean;
  /** Brief highlight on the mirrored bullet after an override syncs from the left. */
  pulseBulletIndex?: number | null;
  /** Shown when a saved analysis was restored (no upload on this session). */
  restoredResumeNoPdfHint?: boolean;
  /** Export accepted edits to PDF via LaTeX (Harshibar) + pdflatex. */
  onExportPdf?: (opts?: { referenceFolder?: string }) => void;
  /** When false, PDF download stays visible but disabled (no structured resume yet). */
  exportPdfEnabled?: boolean;
  /** Export accepted edits to DOCX. */
  onExportDocx?: () => void;
  /** When false, DOCX control stays visible but disabled (no structured resume yet). */
  exportDocxEnabled?: boolean;
  /** True while an export is in progress. */
  exportingResume?: boolean;
  /** Server-side export error (LaTeX / DOCX). */
  exportError?: string | null;
  /** JD keywords + quant targeting for category highlights. */
  categoryAssignmentOpts?: CategoryAssignmentOptions;
  /** Tailor gap-fix panel — purple highlight on targeted bullets. */
  tailorGapFixHighlights?: string[];
  /** Tailor gap-fix just applied — green flash on updated bullets. */
  tailorAppliedHighlights?: string[];
  /** Index-based gap targets (Analyze-style); preferred over string highlights. */
  gapFixTargetBulletIndices?: number[];
  /** Brief green flash on applied bullet indices after gap apply. */
  tailorAppliedBulletIndices?: ReadonlySet<number>;
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

type PreviewStyleId = "classic" | "modern" | "compact";

const PREVIEW_STYLE_OPTIONS: Array<{
  id: PreviewStyleId;
  label: string;
  vars: Record<string, string>;
}> = [
  {
    id: "classic",
    label: "Classic",
    vars: {
      "--az-resume-heading-font": "'Georgia', 'Times New Roman', serif",
      "--az-resume-body-font": "'Georgia', 'Times New Roman', serif",
      "--az-resume-ui-font": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--az-resume-base-font-size": "10.8px",
      "--az-resume-line-height": "1.42",
      "--az-resume-paper-padding": "32px 36px 52px",
      "--az-resume-section-margin-top": "17px",
    },
  },
  {
    id: "modern",
    label: "Modern",
    vars: {
      "--az-resume-heading-font": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--az-resume-body-font": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--az-resume-ui-font": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--az-resume-base-font-size": "10.6px",
      "--az-resume-line-height": "1.4",
      "--az-resume-paper-padding": "30px 36px 50px",
      "--az-resume-section-margin-top": "16px",
    },
  },
  {
    id: "compact",
    label: "Compact",
    vars: {
      "--az-resume-heading-font": "'Georgia', 'Times New Roman', serif",
      "--az-resume-body-font": "'Georgia', 'Times New Roman', serif",
      "--az-resume-ui-font": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--az-resume-base-font-size": "10.2px",
      "--az-resume-line-height": "1.34",
      "--az-resume-paper-padding": "26px 34px 44px",
      "--az-resume-section-margin-top": "13px",
    },
  },
];

const PREVIEW_ACCENTS = [
  { label: "Blue", value: "#0969da" },
  { label: "Slate", value: "#334155" },
  { label: "Emerald", value: "#047857" },
  { label: "Amber", value: "#b45309" },
];

/** When the API omits `extractedText`, rebuild a minimal "page" from bullets + section headers.
 *  Only emits the heading for the section that has bullets — avoids empty PROJECTS/EDUCATION shells. */
function syntheticExtractFromBullets(bullets: BulletItem[], sections: SectionItem[]): string {
  if (!bullets.length) return "";
  const bulletLines = bullets.map((b) => "- " + b.originalBullet.trim()).filter(Boolean);
  if (sections.length > 0) {
    const sectionNames = sections.map((s) => s.section.toUpperCase());
    const expIdx = sectionNames.findIndex((n) => n.includes("EXPERIENCE") || n.includes("WORK"));
    const heading = expIdx >= 0 ? sectionNames[expIdx] : sectionNames[0];
    return [heading, ...bulletLines].filter(Boolean).join("\n");
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
  activeCategoryLabel = "",
  rewriteEdits,
  patchBulletRewrite,
  previewLineOverrides,
  patchPreviewLine,
  selectedBulletIndex = null,
  onBulletLinkedSelect,
  extractedText,
  resumeHeader,
  onOpenBuilder,
  builderReady = false,
  builderOpening = false,
  presentationOnly = false,
  pulseBulletIndex = null,
  restoredResumeNoPdfHint = false,
  onExportPdf,
  exportPdfEnabled = true,
  onExportDocx,
  exportDocxEnabled = true,
  exportingResume = false,
  exportError = null,
  categoryAssignmentOpts,
  tailorGapFixHighlights = [],
  tailorAppliedHighlights = [],
  gapFixTargetBulletIndices = [],
  tailorAppliedBulletIndices = new Set<number>(),
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [previewStyleId, setPreviewStyleId] = useState<PreviewStyleId>("classic");
  const [previewAccent, setPreviewAccent] = useState(PREVIEW_ACCENTS[0].value);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  // HTML→Chromium PDF export (same pipeline ResumeBuilder uses for its
  // "Download PDF rendered from HTML — WYSIWYG, no LaTeX" button). The
  // exported PDF is a literal capture of paperRef.current's outerHTML, so
  // the download matches the preview byte-for-byte instead of going through
  // the lossy LaTeX renderer.
  const { exportPdf: exportHtmlPdf, exporting: htmlPdfExporting, error: htmlPdfError } = useHtmlPdfExport();
  const candidateProfile = useResumeAnalyzeStore((s) => s.extractedText);
  const htmlPdfFilename = useMemo(() => {
    // Derive a stable filename stem from the candidate's name in the
    // preview. Falls back to "resume" if name detection misses.
    const owner = ownerSlugFromProfile(candidateProfile || extractedText || "");
    return owner === "User" ? "resume.pdf" : `${owner}_resume.pdf`;
  }, [candidateProfile, extractedText]);
  const handleHtmlPdfDownload = useCallback(() => {
    if (!paperRef.current) return;
    void exportHtmlPdf(paperRef.current, htmlPdfFilename);
  }, [exportHtmlPdf, htmlPdfFilename]);
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
   * True when `fullExtract` is document-like (two+ non-bullet rows, or one row that is
   * not only a known section title — e.g. a name line before bullets). Keeps real extract
   * so identity is not dropped in favor of bullet-only synthetic glue.
   */
  const fullExtractHasStructure = useMemo(() => {
    if (!fullExtract) return false;
    const lines = fullExtract.split("\n").map((l) => l.trim()).filter(Boolean);
    const nonBulletLines = lines.filter((l) => !/^[\s]*[-•–—*\u2022]/.test(l));
    if (nonBulletLines.length >= 2) return true;
    if (
      nonBulletLines.length === 1
      && !lineLooksLikeStandaloneSectionHeading(nonBulletLines[0])
    ) return true;
    return false;
  }, [fullExtract]);

  const previewIdentityLines = useMemo(
    () => mergeResumeHeaderSources(resumeHeader, fullExtract),
    [resumeHeader, fullExtract],
  );

  /**
   * Use the full extract when it has real structure; fall back to the synthetic
   * version (which injects sectionFeedback headings) when it is a bare bullet dump.
   * When synthetic, still prepend name/contact from the API or full extract so the
   * mirror does not start at PROFESSIONAL EXPERIENCE only.
   */
  const effectiveExtracted = useMemo(() => {
    const shell = fullExtractHasStructure
      ? fullExtract
      : (syntheticExtract || fullExtract);
    const body = shell.trim();
    if (
      !fullExtractHasStructure
      && previewIdentityLines.length > 0
      && body !== ""
    ) {
      return [...previewIdentityLines, body].join("\n");
    }
    return shell;
  }, [
    fullExtractHasStructure,
    fullExtract,
    syntheticExtract,
    previewIdentityLines,
  ]);

  const extractKind: "full" | "synthetic" | "none" = fullExtractHasStructure
    ? "full"
    : syntheticExtract
      ? "synthetic"
      : fullExtract
        ? "synthetic"
        : "none";
  const useLiveDoc = extractKind !== "none";
  const previewStyleVars = useMemo(() => {
    const preset = PREVIEW_STYLE_OPTIONS.find((option) => option.id === previewStyleId)
      ?? PREVIEW_STYLE_OPTIONS[0];
    return {
      ...preset.vars,
      "--resume-paper-accent": previewAccent,
    } as CSSProperties;
  }, [previewStyleId, previewAccent]);

  const flaggedCount = activeCategory
    ? countBulletsInCategory(bulletAnalysis, activeCategory, categoryAssignmentOpts)
    : 0;
  const totalCount = bulletAnalysis.length;
  const categoryLabel = activeCategoryLabel.trim() || "this category";

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
    const idx = bulletAnalysis.findIndex((b, i) =>
      bulletBelongsToCategory(b, activeCategory, bulletAnalysis, i, categoryAssignmentOpts),
    );
    if (idx < 0) return;
    const id = window.setTimeout(() => {
      scrollRef.current
        ?.querySelector?.(`[data-bullet-idx="${idx}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [activeCategory, bulletAnalysis, categoryAssignmentOpts]);

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
        borderLeft: presentationOnly ? "1px solid var(--border)" : "1px solid var(--border)",
        background: presentationOnly
          ? "#ffffff"
          : "linear-gradient(180deg, var(--surface2) 0%, var(--surface) 55%, var(--surface2) 100%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        ...(presentationOnly
          ? {
              flex: 1,
              minHeight: 0,
              maxHeight: "100%",
              alignSelf: "stretch",
            }
          : { maxHeight: "100vh" }),
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {!presentationOnly && (
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface2)",
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            disabled={!builderReady || builderOpening || !onOpenBuilder}
            onClick={e => { e.preventDefault(); onOpenBuilder?.(); }}
            title="Open Résumé Builder — pick a LaTeX layout and tailor to a job"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.03,
              textTransform: "uppercase",
              padding: "7px 12px",
              borderRadius: 8,
              border: "none",
              background: builderReady ? "linear-gradient(180deg, #ff9966 0%, #fb7c44 100%)" : "var(--surface3)",
              color: "#fff",
              cursor: builderReady ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              boxShadow: builderReady ? "0 2px 0 rgba(214,93,41,0.35)" : "none",
            }}
          >
            {builderOpening ? "Opening…" : "Résumé builder"}
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
              border: "1px solid var(--border-h)",
              background: "var(--surface)",
              color: "var(--text)",
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
            border: "1px dashed var(--border-h)",
            background: "var(--surface)",
            color: "var(--dim)",
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
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        flexShrink: 0,
      }}>
        <div style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--muted)",
                letterSpacing: 0.56,
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 14V3a1 1 0 011-1h8a1 1 0 011 1v11l-2.5-1.5L8 14l-2.5-1.5L3 14z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"/>
                </svg>
                {presentationOnly ? "Résumé" : useLiveDoc ? "Edit" : "Analyzed lines"}
              </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {activeCategory ? (
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: flaggedCount > 0 ? "var(--red)" : "var(--green)",
              background: flaggedCount > 0 ? "var(--red-bg)" : "var(--green-bg)",
              border: `1px solid ${flaggedCount > 0 ? "rgba(248,81,73,0.35)" : "rgba(63,185,80,0.35)"}`,
              padding: "3px 10px",
              borderRadius: 20,
            }}>
              {flaggedCount > 0
                ? `${flaggedCount}/${totalCount} need work here`
                : `No bullets flagged in ${categoryLabel}`}
            </div>
          ) : (
            <div style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--muted)",
            }}>
              {totalCount} lines scored
            </div>
          )}
          {useLiveDoc ? (
            <div
              className="az-pdf-ignore"
              aria-label="Preview style controls"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 6px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface2)",
              }}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: 0.45,
              }}>
                Style
              </span>
              <select
                value={previewStyleId}
                onChange={(event) => setPreviewStyleId(event.target.value as PreviewStyleId)}
                aria-label="Preview resume style"
                style={{
                  width: "auto",
                  minWidth: 92,
                  height: 28,
                  padding: "3px 24px 3px 8px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "var(--surface)",
                }}
              >
                {PREVIEW_STYLE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {PREVIEW_ACCENTS.map((accent) => {
                  const active = previewAccent === accent.value;
                  return (
                    <button
                      key={accent.value}
                      type="button"
                      aria-label={`${accent.label} accent`}
                      title={`${accent.label} accent`}
                      onClick={() => setPreviewAccent(accent.value)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        border: active ? "2px solid var(--text)" : "1px solid var(--border-h)",
                        background: accent.value,
                        boxShadow: active ? `0 0 0 2px ${accent.value}33` : "none",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
          {useLiveDoc ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {(() => {
                // Use the WYSIWYG HTML→Chromium pipeline. The button stays
                // enabled whenever we have something to render (paperRef is
                // populated once the preview mounts) — no dependency on the
                // backend structured-resume "canExport" flag the LaTeX path
                // needed. The legacy `onExportPdf` prop is kept in the type
                // signature for parents that still pass it but is unused
                // here; we'll drop the prop in a follow-up once nothing
                // depends on it.
                void onExportPdf;  // intentionally unused — see comment above
                const busy = htmlPdfExporting;
                const enabled = exportPdfEnabled !== false;
                return (
                  <button
                    type="button"
                    disabled={busy || !enabled}
                    onClick={handleHtmlPdfDownload}
                    title={
                      enabled
                        ? "Download PDF — WYSIWYG, what you see in the preview is what you get. Rendered via headless Chromium, no LaTeX."
                        : "PDF export needs a rendered preview — wait for analysis to finish."
                    }
                    aria-label="Download résumé PDF"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.12,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: enabled
                        ? busy ? "var(--surface3)" : "var(--accent)"
                        : "var(--surface2)",
                      color: enabled ? "#fff" : "var(--dim)",
                      cursor: busy ? "wait" : enabled ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      boxShadow: enabled && !busy ? "var(--shadow-sm)" : "none",
                      opacity: enabled ? 1 : 0.72,
                    }}
                  >
                    {busy ? "Generating PDF…" : "Download PDF"}
                  </button>
                );
              })()}
              {onExportDocx ? (
                <button
                  type="button"
                  disabled={exportingResume || !exportDocxEnabled}
                  onClick={onExportDocx}
                  title={
                    exportDocxEnabled
                      ? "Download as Word (.docx) with your edits."
                      : "DOCX export needs a structured résumé from analysis — re-upload your PDF or Word file if this stays disabled."
                  }
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-h)",
                    background: exportDocxEnabled ? "var(--surface3)" : "var(--surface2)",
                    color: exportDocxEnabled ? "var(--text)" : "var(--dim)",
                    cursor: exportingResume ? "wait" : exportDocxEnabled ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                    opacity: exportDocxEnabled ? 1 : 0.72,
                  }}
                >
                  {exportingResume ? "Exporting…" : "Export DOCX"}
                </button>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
        {exportError ? (
          <div
            role="alert"
            style={{
              padding: "8px 16px",
              borderTop: "1px solid rgba(248,113,113,0.25)",
              fontSize: 11,
              lineHeight: 1.45,
              color: "var(--red)",
              background: "var(--red-bg)",
            }}
          >
            {exportError}
          </div>
        ) : null}
        {restoredResumeNoPdfHint ? (
          <div
            role="note"
            style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--border)",
              fontSize: 11,
              lineHeight: 1.45,
              color: "var(--muted)",
              background: "var(--surface2)",
            }}
          >
            Opened from saved analysis — your original file is not stored. Use <strong style={{ color: "var(--text)" }}>Download PDF</strong> for a Harshibar LaTeX export with your edits, or re-upload to analyze a new file.
          </div>
        ) : null}
        {extractKind === "synthetic" && !presentationOnly ? (
          <div
            style={{
              padding: "0 16px 10px",
              fontSize: 10,
              color: "var(--muted)",
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
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          flexShrink: 0,
          background: "var(--surface)",
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
      <div style={{
          padding: "6px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          background: "var(--surface2)",
          flexWrap: "wrap",
        }}>
          {[
            { color: "var(--az-weak-text)", bg: "var(--az-weak-bg)", label: "Needs work" },
            { color: "var(--az-fair-text)", bg: "var(--az-fair-bg)", label: "Fair" },
            { color: "var(--az-strong-text)", bg: "var(--az-strong-bg)", label: "Strong" },
          ].map(({ color, bg, label }) => (
            <span key={label} className="az-legend-pill">
              <span className="az-legend-dot" style={{ background: color, boxShadow: `0 0 0 1px ${color}66` }} />
              {label}
            </span>
          ))}
        </div>

      {activeCategory && flaggedCount > 0 && (
        <div style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--red)",
          fontWeight: 600,
          flexShrink: 0,
          background: "var(--red-bg)",
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ marginRight: 5, verticalAlign: "middle" }}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Highlighted bullets have issues in {categoryLabel}
        </div>
      )}
      {activeCategory && flaggedCount === 0 && (
        <div style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--green-ink)",
          fontWeight: 600,
          flexShrink: 0,
          background: "var(--green-bg)",
        }}>
          No sample bullets flagged for {categoryLabel} — the category score reflects overall résumé quality.
        </div>
      )}

      {/* Document preview with score highlights */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 16px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          ref={paperRef}
          className="az-resume-paper"
          style={{
            ...previewStyleVars,
            position: "relative",
            background: "var(--resume-paper-bg)",
            borderRadius: 3,
            boxShadow: "0 1px 2px rgba(15,23,42,0.06), 0 14px 42px rgba(15,23,42,0.14)",
            border: "1px solid var(--resume-paper-border)",
            maxWidth: "100%",
            margin: "0 auto",
          }}
        >
          {presentationOnly && (
            <div
              className="az-pdf-ignore"
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
                headerInferenceText={fullExtract}
                resumeHeader={resumeHeader}
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
                categoryAssignmentOpts={categoryAssignmentOpts}
                tailorGapFixHighlights={tailorGapFixHighlights}
                tailorAppliedHighlights={tailorAppliedHighlights}
                gapFixTargetBulletIndices={gapFixTargetBulletIndices}
                tailorAppliedBulletIndices={tailorAppliedBulletIndices}
              />
          ) : (
          <>
          <div style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--resume-paper-border)",
            fontSize: 17,
            fontWeight: 700,
            color: "var(--resume-paper-ink)",
            letterSpacing: -0.3,
          }}>
            Résumé lines (no full extract)
          </div>
        {bulletAnalysis.length === 0 ? (
          <div style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--resume-paper-muted)",
            fontSize: 13,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
            No bullets analyzed yet
          </div>
        ) : (
          bulletAnalysis.map((bullet, i) => {
            const isHighlighted = activeCategory
              ? bulletMatchesAnalysisCategory(bullet, activeCategory, bulletAnalysis, i, categoryAssignmentOpts)
              : false;
            const isHovered = hoveredIdx === i;
            const isExpanded = expandedIdx === i;
            const hasIssues = bullet.issues.length > 0;
            const hasImproved = !!bullet.improvedBullet;
            const baseImproved = bullet.improvedBullet ?? "";
            const draft = rewriteEdits[i] ?? baseImproved;
            const previewLine = previewLineOverrides[i] ?? bullet.originalBullet;
            const previewLineApplied = previewLineOverrides[i] !== undefined;

            let bgColor = "var(--surface2)";

            if (activeCategory && isHighlighted) {
              bgColor = "var(--red-bg)";
            } else if (!activeCategory && hasIssues) {
              bgColor = bullet.score < 50
                ? "var(--red-bg)"
                : bullet.score < 70
                ? "var(--yellow-bg)"
                : "var(--green-bg)";
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
                  boxShadow: isSelected ? "inset 0 0 0 2px var(--resume-paper-accent)" : undefined,
                  borderLeft: "none",
                  background: isExpanded ? "var(--resume-paper-row-hover)" : isHovered ? "var(--resume-paper-row-hover)" : bgColor,
                  transition: "background 0.15s, box-shadow 0.15s",
                  cursor: hasIssues || hasImproved ? "pointer" : "default",
                  borderBottom: i < bulletAnalysis.length - 1 ? "1px solid var(--resume-paper-border)" : "none",
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
                    color: "var(--resume-paper-ink)",
                    lineHeight: 1.65,
                    fontWeight: isHighlighted || isExpanded ? 500 : 400,
                    flex: 1,
                    transition: "color 0.15s, font-weight 0.15s",
                  }}>
                    {highlightMetricSpans(previewLine)}
                    {!presentationOnly && previewLineApplied && (
                      <span title="Preview line updated for this session." style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, verticalAlign: "super", color: "var(--amber)", letterSpacing: 0.2 }}>
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
                      color: "var(--resume-paper-muted)",
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
