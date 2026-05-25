"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PageProps } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { normalizeForMatch } from "@/components/AnalyzeLiveResumeBody";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type CustomTextRenderer = NonNullable<PageProps["customTextRenderer"]>;

export type HighlightSuggestion = {
  id: string;
  original: string;
  suggested: string;
};

interface Props {
  pdfUrl: string;
  filename?: string;
  maxHeight?: string;
  /** Accepted suggestion IDs — used to decide which suggestions to highlight */
  acceptedIds?: ReadonlySet<string>;
  /** All suggestions (original + suggested text) — used for diff highlight */
  suggestions?: HighlightSuggestion[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spanMatchesSuggestion(spanNorm: string, bulletNorm: string): boolean {
  if (bulletNorm.length < 6 || spanNorm.length < 4) return false;
  if (spanNorm === bulletNorm) return true;
  if (bulletNorm.includes(spanNorm) && spanNorm.length >= 8) return true;
  if (spanNorm.length >= 10 && bulletNorm.startsWith(spanNorm.slice(0, Math.min(30, spanNorm.length)))) return true;
  if (bulletNorm.length >= 10 && spanNorm.includes(bulletNorm.slice(0, Math.min(45, bulletNorm.length)))) return true;
  if (spanNorm.length >= 12 && bulletNorm.length >= 12) {
    const a = spanNorm.slice(0, 40);
    const b = bulletNorm.slice(0, 40);
    if (a.startsWith(b.slice(0, 14)) || b.startsWith(a.slice(0, 14))) return true;
  }
  return false;
}

export default function TailoredPdfPreview({
  pdfUrl,
  filename = "resume.pdf",
  maxHeight = "min(78vh, 880px)",
  acceptedIds,
  suggestions,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(640);
  const [showDiff, setShowDiff] = useState(false);

  const hasAccepted = (acceptedIds?.size ?? 0) > 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPageWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setPageWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Normalised "suggested" text for all accepted suggestions → highlight green in compiled PDF
  // Normalised "original" text for accepted suggestions → highlight orange-red (was replaced)
  const highlightRows = useMemo(() => {
    if (!suggestions || !acceptedIds || acceptedIds.size === 0) return [];
    const rows: Array<{ norm: string; isSuggested: boolean }> = [];
    for (const s of suggestions) {
      if (!acceptedIds.has(s.id)) continue;
      const sugNorm = normalizeForMatch(s.suggested.trim()).toLowerCase();
      if (sugNorm.length >= 6) rows.push({ norm: sugNorm, isSuggested: true });
    }
    return rows;
  }, [suggestions, acceptedIds]);

  const customTextRenderer = useCallback<CustomTextRenderer>(
    ({ str }) => {
      const trimmed = str.trim();
      if (trimmed.length < 6 || highlightRows.length === 0) return escapeHtml(str);
      const spanNorm = normalizeForMatch(trimmed).toLowerCase();
      const match = highlightRows.find((r) => spanMatchesSuggestion(spanNorm, r.norm));
      if (!match) return escapeHtml(str);
      // Green highlight = new/improved text now in the compiled PDF
      return `<mark style="background:rgba(52,211,153,0.35);border-radius:3px;padding:1px 0;outline:1.5px solid rgba(34,197,94,0.5);outline-offset:1px;">${escapeHtml(str)}</mark>`;
    },
    [highlightRows],
  );

  const pageRenderWidth = pageWidth > 0 ? Math.min(pageWidth - 28, 720) : 600;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        maxHeight,
        minHeight: 280,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "#fff",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface2)",
          flexShrink: 0,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
            Scroll for all pages.
          </span>
          {/* Diff toggle — only shown when there are accepted suggestions */}
          {hasAccepted && (
            <button
              type="button"
              onClick={() => setShowDiff((v) => !v)}
              title={showDiff ? "Hide change highlights" : "Highlight accepted changes in the PDF"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 6,
                border: showDiff
                  ? "1px solid rgba(52,211,153,0.6)"
                  : "1px solid var(--border)",
                background: showDiff
                  ? "rgba(52,211,153,0.12)"
                  : "var(--surface)",
                color: showDiff ? "var(--green, #34d399)" : "var(--muted)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 13 }}>✦</span>
              {showDiff ? "Changes on" : "Show changes"}
            </button>
          )}
        </div>
        <a
          href={pdfUrl}
          download={filename}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Open / download PDF
        </a>
      </div>

      {/* Legend when diff is on */}
      {showDiff && hasAccepted && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "6px 12px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(52,211,153,0.05)",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(52,211,153,0.35)", border: "1px solid rgba(34,197,94,0.5)", display: "inline-block" }} />
            <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Improved bullet (accepted change)</span>
          </div>
          <span style={{ fontSize: 10, color: "var(--dim)" }}>
            {(acceptedIds?.size ?? 0)} change{(acceptedIds?.size ?? 0) !== 1 ? "s" : ""} highlighted
          </span>
        </div>
      )}

      {/* ── PDF content ── */}
      <div
        ref={containerRef}
        className="rb-pdf-preview-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          background: "#f1f5f9",
          padding: "14px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        {loadError ? (
          <div style={{ padding: 24, color: "var(--red)", fontSize: 12, textAlign: "center" }}>
            {loadError}
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(err) => setLoadError(err.message ?? "Failed to load PDF")}
            loading={
              <div style={{ padding: 40, color: "var(--muted)", fontSize: 12 }}>Loading PDF…</div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={i + 1}
                style={{
                  boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
                  borderRadius: 4,
                  overflow: "hidden",
                  background: "#fff",
                  position: "relative",
                }}
              >
                <Page
                  pageNumber={i + 1}
                  width={pageRenderWidth}
                  renderTextLayer={showDiff}
                  renderAnnotationLayer={false}
                  customTextRenderer={showDiff ? customTextRenderer : undefined}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
