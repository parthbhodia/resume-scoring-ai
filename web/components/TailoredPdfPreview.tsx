"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  pdfUrl: string;
  filename?: string;
  maxHeight?: string;
}

export default function TailoredPdfPreview({
  pdfUrl,
  filename = "resume.pdf",
  maxHeight = "min(78vh, 880px)",
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(640);

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
        <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
          Scroll to see all pages — content is not clipped at page breaks.
        </span>
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
                }}
              >
                <Page
                  pageNumber={i + 1}
                  width={pageRenderWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
