"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PageProps } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "./PdfViewerWithHighlights.css";
import "./BuilderPdfSuggestionHighlights.css";
import { normalizeForMatch } from "@/components/AnalyzeLiveResumeBody";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type CustomTextRenderer = NonNullable<PageProps["customTextRenderer"]>;

export type BuilderPdfSuggestion = { id: string; original: string };

const STRIPE_PALETTE: ReadonlyArray<{ bg: string; border: string }> = [
  { bg: "rgba(217, 119, 6, 0.32)", border: "rgba(217, 119, 6, 0.75)" },
  { bg: "rgba(124, 58, 237, 0.28)", border: "rgba(124, 58, 237, 0.75)" },
  { bg: "rgba(37, 99, 235, 0.28)", border: "rgba(37, 99, 235, 0.75)" },
  { bg: "rgba(219, 39, 119, 0.26)", border: "rgba(219, 39, 119, 0.72)" },
  { bg: "rgba(13, 148, 136, 0.30)", border: "rgba(13, 148, 136, 0.72)" },
  { bg: "rgba(194, 65, 12, 0.30)", border: "rgba(194, 65, 12, 0.75)" },
  { bg: "rgba(79, 70, 229, 0.28)", border: "rgba(79, 70, 229, 0.75)" },
  { bg: "rgba(202, 138, 4, 0.32)", border: "rgba(202, 138, 4, 0.75)" },
];

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

/** Heuristic: PDF text layer span vs suggestion original (same family as PdfViewerWithHighlights). */
function spanMatchesSuggestion(spanNorm: string, bulletNorm: string): boolean {
  if (spanNorm.length < 8 || bulletNorm.length < 8) return false;
  if (bulletNorm.includes(spanNorm) && spanNorm.length >= 10) return true;
  if (spanNorm.length >= 15 && bulletNorm.startsWith(spanNorm.slice(0, Math.min(25, spanNorm.length)))) return true;
  if (bulletNorm.length >= 12 && spanNorm.includes(bulletNorm.slice(0, Math.min(40, bulletNorm.length)))) return true;
  return false;
}

interface Props {
  pdfBlobUrl: string;
  filename?: string;
  suggestions: BuilderPdfSuggestion[];
  acceptedIds: ReadonlySet<string>;
  rejectedIds: ReadonlySet<string>;
  selectedSuggestionId: string | null;
  onSelectSuggestion: (id: string) => void;
}

export default function BuilderPdfSuggestionHighlights({
  pdfBlobUrl,
  filename = "resume.pdf",
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
    let visualIdx = 0;
    for (const s of suggestions) {
      if (rejectedIds.has(s.id)) continue;
      const raw = s.original.trim();
      if (!raw) continue;
      const norm = normalizeForMatch(raw).toLowerCase();
      if (norm.length < 12) continue;
      const accepted = acceptedIds.has(s.id);
      const pal = STRIPE_PALETTE[visualIdx % STRIPE_PALETTE.length];
      visualIdx += 1;
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
      if (trimmed.length < 6) return str;
      const norm = normalizeForMatch(trimmed).toLowerCase();
      for (const row of matchRows) {
        if (!spanMatchesSuggestion(norm, row.norm)) continue;
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
      root.querySelectorAll(`[data-rb-sug-id="${esc}"]`).forEach(el => {
        el.classList.add("pdfv-hl-builder--selected");
      });
    } catch {
      /* ignore */
    }
  }, [selectedSuggestionId, numPages, matchRows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, maxHeight: 560 }}>
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
          href={pdfBlobUrl}
          download={filename}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Download PDF
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
