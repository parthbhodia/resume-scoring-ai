"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PageProps } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "./PdfViewerWithHighlights.css";
import { normalizeForMatch } from "@/lib/resumeBulletMatch";

// Must match pdfjs-dist in package.json (npm overrides dedupe react-pdf's nested copy).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type CustomTextRenderer = NonNullable<PageProps["customTextRenderer"]>;

interface BulletItem {
  originalBullet: string;
  score: number;
}

interface Props {
  pdfBlobUrl: string;
  bulletAnalysis: BulletItem[];
  filename?: string;
}

function scoreHighlightColor(score: number): string {
  if (score >= 75) return "rgba(52,211,153,0.40)";
  if (score >= 55) return "rgba(245,158,11,0.40)";
  return "rgba(248,113,113,0.40)";
}

function scoreBorderColor(score: number): string {
  if (score >= 75) return "rgba(52,211,153,0.70)";
  if (score >= 55) return "rgba(245,158,11,0.70)";
  return "rgba(248,113,113,0.70)";
}

function scoreLabel(score: number): string {
  if (score >= 75) return "Strong";
  if (score >= 55) return "Fair";
  return "Weak";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHighlightHtml(safeInner: string, color: string): string {
  // See PdfViewerWithHighlights.css: nested spans must not use .textLayer's position:absolute.
  return `<span class="pdfv-hl" style="background:${color};">${safeInner}</span>`;
}

/**
 * Match a PDF text layer span (or rolling buffer) against a bullet's normalised text.
 * Keeps the same strict thresholds used in BuilderPdfSuggestionHighlights to avoid
 * false positives on short / common phrases.
 */
function spanMatchesBullet(spanNorm: string, bulletNorm: string): boolean {
  // Both must be substantial
  if (bulletNorm.length < 20 || spanNorm.length < 15) return false;
  // Exact match
  if (spanNorm === bulletNorm) return true;
  // Span contained in bullet (span must be long enough to be meaningful)
  if (spanNorm.length >= 15 && bulletNorm.includes(spanNorm)) return true;
  // Bullet contained in span (buffer has accumulated the full bullet)
  if (bulletNorm.length >= 20 && spanNorm.includes(bulletNorm)) return true;
  // Both long — opening phrase match
  if (spanNorm.length >= 25 && bulletNorm.startsWith(spanNorm.slice(0, Math.min(25, spanNorm.length)))) return true;
  return false;
}

export default function PdfViewerWithHighlights({
  pdfBlobUrl,
  bulletAnalysis,
  filename = "resume.pdf",
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(640);
  // Rolling buffer: accumulate adjacent spans so split bullets can still be matched
  const spanBufferRef = useRef<string>("");

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

  const bulletData = useMemo(() => {
    return bulletAnalysis
      .filter((b) => normalizeForMatch(b.originalBullet).length >= 15)
      .map((b) => {
        const raw = b.originalBullet.trim();
        return {
          raw,
          norm: normalizeForMatch(raw).toLowerCase(),
          score: b.score,
          color: scoreHighlightColor(b.score),
        };
      });
  }, [bulletAnalysis]);

  // Reset buffer when bullet data changes (new analysis result)
  useEffect(() => { spanBufferRef.current = ""; }, [bulletData]);

  const customTextRenderer = useCallback<CustomTextRenderer>(
    ({ str }) => {
      const trimmed = str.trim();
      if (!trimmed) return str;

      // Skip pure punctuation / bullet chars — avoids highlighting just the "•" dot
      const alphaCount = (trimmed.match(/[a-zA-Z0-9]/g) ?? []).length;
      if (alphaCount < 4) return str;

      // Accumulate into rolling buffer — limit to 400 chars to avoid cross-bullet pollution
      spanBufferRef.current = (spanBufferRef.current + " " + trimmed).trim().slice(-400);
      const bufNorm = normalizeForMatch(spanBufferRef.current).toLowerCase();
      const singleNorm = normalizeForMatch(trimmed).toLowerCase();

      for (const { norm: bulletNorm, color } of bulletData) {
        if (spanMatchesBullet(singleNorm, bulletNorm) || spanMatchesBullet(bufNorm, bulletNorm)) {
          return wrapHighlightHtml(escapeHtml(str), color);
        }
      }
      return str;
    },
    [bulletData],
  );

  const counts = useMemo(() => {
    const strong = bulletAnalysis.filter((b) => b.score >= 75).length;
    const fair = bulletAnalysis.filter((b) => b.score >= 55 && b.score < 75).length;
    const weak = bulletAnalysis.filter((b) => b.score < 55).length;
    return { strong, fair, weak };
  }, [bulletAnalysis]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {(
            [
              { label: "Strong", score: 80 },
              { label: "Fair", score: 60 },
              { label: "Weak", score: 40 },
            ] as const
          ).map(({ label, score }) => (
            <span
              key={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--muted)",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: scoreHighlightColor(score),
                  border: `1px solid ${scoreBorderColor(score)}`,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {label}{" "}
              <span style={{ color: "var(--dim)", fontWeight: 400 }}>
                (
                {scoreLabel(score) === "Strong"
                  ? counts.strong
                  : scoreLabel(score) === "Fair"
                    ? counts.fair
                    : counts.weak}
                )
              </span>
            </span>
          ))}
        </div>

        <a
          href={pdfBlobUrl}
          download={filename}
          title="Your uploaded file — same bytes and layout as when you analyzed it."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            cursor: "pointer",
            transition: "opacity 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M6 1v6M3.5 5l2.5 2.5L8.5 5M2 9.5h8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Original PDF
        </a>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          /* Always bright canvas behind PDF pages (matches Edit preview paper). */
          background: "#ffffff",
          padding: "16px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          minHeight: 0,
        }}
      >
        {loadError ? (
          <div
            style={{
              padding: 32,
              color: "var(--red)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            {loadError}
          </div>
        ) : (
          <Document
            file={pdfBlobUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(err) => setLoadError(err.message ?? "Failed to load PDF")}
            loading={
              <div
                style={{
                  padding: 48,
                  color: "var(--muted)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                Loading PDF…
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={i + 1}
                style={{
                  boxShadow: "var(--shadow, 0 1px 8px rgba(0,0,0,0.08))",
                  borderRadius: 4,
                  overflow: "hidden",
                  marginBottom: 0,
                }}
              >
                <Page
                  pageNumber={i + 1}
                  width={pageWidth > 0 ? Math.min(pageWidth - 32, 820) : 640}
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
