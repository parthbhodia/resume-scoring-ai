"use client";
import { useCallback, useState } from "react";
import { apiUrl } from "@/lib/utils";

export function useHtmlPdfExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPdf = useCallback(async (containerEl: HTMLElement, filename = "resume.pdf") => {
    setExporting(true);
    setError(null);
    try {
      // Build a self-contained HTML document from the container's outerHTML
      // Include all inline styles (they're already inline in ResumeDocumentView)
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: white; }
  @page { size: Letter; margin: 0; }
</style>
</head>
<body>${containerEl.outerHTML}</body>
</html>`;

      const resp = await fetch(apiUrl("/api/export-pdf-html"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  return { exportPdf, exporting, error };
}
