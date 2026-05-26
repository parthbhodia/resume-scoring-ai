"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PageProps } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "./PdfViewerWithHighlights.css";
import "./BuilderPdfSuggestionHighlights.css";
import { normalizeForMatch } from "@/components/AnalyzeLiveResumeBody";
import {
  normalizeSuggestionPriority,
  PRIORITY_PDF_STRIPE,
  type SuggestionPriority,
} from "@/lib/suggestionPriorityStyles";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type CustomTextRenderer = NonNullable<PageProps["customTextRenderer"]>;

export type BuilderPdfSuggestion = { id: string; original: string; priority?: SuggestionPriority };

const ACCEPTED_BG = "rgba(52, 211, 153, 0.38)";
const ACCEPTED_BORDER = "rgba(34, 197, 94, 0.85)";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Heuristic: PDF text layer span vs suggestion original.
 * Strict thresholds to avoid false-positive highlights on short/common phrases.
 *
 * Strategy: both the span text and the suggestion must be substantial (≥20 chars
 * for span, ≥30 chars for bullet). The PDF text layer splits bullets into multiple
 * short spans — the caller should also try matching with a rolling buffer of
 * accumulated spans when individual spans are too short.
 */
function spanMatchesSuggestion(spanNorm: string, bulletNorm: string): boolean {
  // Both must be substantial — skip section headers, short labels, dates
  if (bulletNorm.length < 30 || spanNorm.length < 20) return false;

  // Exact match
  if (spanNorm === bulletNorm) return true;

  // Span is fully contained in the suggestion (long span ≥ 30 chars)
  if (spanNorm.length >= 30 && bulletNorm.includes(spanNorm)) return true;

  // Suggestion is fully contained in the span (span accumulated a full bullet)
  if (bulletNorm.length >= 30 && spanNorm.includes(bulletNorm)) return true;

  // Both are long: require the first 40 chars to match (same opening phrase)
  if (spanNorm.length >= 40 && bulletNorm.length >= 40) {
    if (spanNorm.slice(0, 40) === bulletNorm.slice(0, 40)) return true;
  }

  return false;
}

interface Props {
  pdfBlobUrl: string;
  /** Separate URL used for the "Download PDF" link — when omitted falls back to pdfBlobUrl. */
  downloadUrl?: string;
  filename?: string;
  /** Override the max height of the viewer. Pass "100%" to fill a flex parent. */
  maxHeight?: number | string;
  suggestions: BuilderPdfSuggestion[];
  acceptedIds: ReadonlySet<string>;
  rejectedIds: ReadonlySet<string>;
  selectedSuggestionId: string | null;
  onSelectSuggestion: (id: string) => void;
}

export default function BuilderPdfSuggestionHighlights({
  pdfBlobUrl,
  downloadUrl,
  filename = "resume.pdf",
  maxHeight = 560,
  suggestions,
  acceptedIds,
  rejectedIds,
  selectedSuggestionId,
  onSelectSuggestion,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(640);
  // Rolling buffer: accumulate adjacent spans within a page to reconstruct full bullet text
  const spanBufferRef = useRef<string>("");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPageWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => {
      setPageWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const matchRows = useMemo(() => {
    const rows: Array<{
      id: string;
      norm: string;
      bg: string;
      border: string;
      accepted: boolean;
    }> = [];
    for (const s of suggestions) {
      if (rejectedIds.has(s.id)) continue;
      const raw = s.original.trim();
      if (!raw) continue;
      const norm = normalizeForMatch(raw).toLowerCase();
      if (norm.length < 20) continue;  // must be substantial to avoid false matches
      const accepted = acceptedIds.has(s.id);
      const pal = PRIORITY_PDF_STRIPE[normalizeSuggestionPriority(s.priority)];
      rows.push({
        id: s.id,
        norm,
        bg: accepted ? ACCEPTED_BG : pal.bg,
        border: accepted ? ACCEPTED_BORDER : pal.border,
        accepted,
      });
    }
    return rows;
  }, [suggestions, acceptedIds, rejectedIds]);

  const customTextRenderer = useCallback<CustomTextRenderer>(
    ({ str }) => {
      const trimmed = str.trim();
      if (!trimmed) return str;

      // Skip pure punctuation / bullet characters — PDF text layer emits these as
      // separate tiny spans and highlighting them produces a stray coloured dot.
      const alphaCount = (trimmed.match(/[a-zA-Z0-9]/g) ?? []).length;
      if (alphaCount < 4) return str;

      // Accumulate into rolling buffer — reset when it grows too long to avoid cross-bullet pollution
      spanBufferRef.current = (spanBufferRef.current + " " + trimmed).trim().slice(-400);
      const bufNorm = normalizeForMatch(spanBufferRef.current).toLowerCase();
      const singleNorm = normalizeForMatch(trimmed).toLowerCase();

      for (const row of matchRows) {
        if (!spanMatchesSuggestion(singleNorm, row.norm) && !spanMatchesSuggestion(bufNorm, row.norm)) continue;
        const safe = escapeHtml(str);
        return (
          `<span class="pdfv-hl pdfv-hl-builder" data-rb-sug-id="${escapeAttr(row.id)}" ` +
          `style="background:${row.bg};box-shadow:inset 0 0 0 1px ${row.border};cursor:pointer;">${safe}</span>`
        );
      }
      return str;
    },
    [matchRows],
  );

  // Reset span buffer when match rows change (new suggestions / new page set)
  useEffect(() => { spanBufferRef.current = ""; }, [matchRows]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement | null)?.closest("[data-rb-sug-id]");
      if (!t) return;
      const id = t.getAttribute("data-rb-sug-id");
      if (id) onSelectSuggestion(id);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [onSelectSuggestion, numPages]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll(".pdfv-hl-builder").forEach(el => {
      el.classList.remove("pdfv-hl-builder--selected");
    });
    if (!selectedSuggestionId) return;
    const esc =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedSuggestionId)
        : selectedSuggestionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    try {
      const matches = Array.from(root.querySelectorAll(`[data-rb-sug-id="${esc}"]`));
      matches.forEach(el => {
        el.classList.add("pdfv-hl-builder--selected");
      });
      // Scroll the first matched span into view so the user sees where it is in the PDF
      if (matches.length > 0) {
        matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch {
      /* ignore */
    }
  }, [selectedSuggestionId, numPages, matchRows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, maxHeight }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
          Tinted spans match suggestions — click a highlight to focus the card.
        </span>
        <a
          href={downloadUrl ?? pdfBlobUrl}
          download={filename}
          target={downloadUrl ? "_blank" : undefined}
          rel={downloadUrl ? "noopener noreferrer" : undefined}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {downloadUrl ? "⬇ Tailored PDF" : "Download PDF"}
        </a>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          background: "#fff",
          padding: "12px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          minHeight: 320,
        }}
      >
        {loadError ? (
          <div style={{ padding: 24, color: "var(--red)", fontSize: 12, textAlign: "center" }}>{loadError}</div>
        ) : (
          <Document
            file={pdfBlobUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={err => setLoadError(err.message ?? "Failed to load PDF")}
            loading={<div style={{ padding: 40, color: "var(--muted)", fontSize: 12 }}>Loading PDF…</div>}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={i + 1}
                style={{
                  boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <Page
                  pageNumber={i + 1}
                  width={pageWidth > 0 ? Math.min(pageWidth - 24, 720) : 600}
                  renderTextLayer
                  renderAnnotationLayer={false}
                  customTextRenderer={customTextRenderer}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
