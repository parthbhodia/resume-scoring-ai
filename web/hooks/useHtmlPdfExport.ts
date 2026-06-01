"use client";
import { useCallback, useState } from "react";
import { apiUrl } from "@/lib/utils";

/**
 * Strip Analyze annotation chrome from a cloned DOM before PDF export.
 *
 * Strategy:
 *  1. Remove .az-pdf-ignore elements (score badges, ✦ markers, etc. — all
 *     already marked at the render site).
 *  2. Add .az-clean-export to the root so the inline <style> in
 *     AnalyzeLiveResumeBody activates its own clean-export rules (strips
 *     bullet backgrounds, pulse animations, preview marks).
 *  3. Strip the paper-card chrome (shadow, border, radius) from the root —
 *     looks fine in the browser but wrong in a flat PDF page.
 *  4. Inject the full set of --resume-paper-* CSS custom properties so
 *     headless Chromium (which has no globals.css) resolves them correctly.
 *  5. Strip [data-bullet-idx] annotation backgrounds — defense-in-depth for
 *     the non-live-doc fallback path.
 */
function cleanForExport(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;

  // 1. Remove all explicitly marked UI chrome
  clone.querySelectorAll(".az-pdf-ignore").forEach((el) => el.remove());

  // 2. Activate the component's own clean-export CSS rules
  clone.classList.add("az-clean-export");

  // 3. Strip paper-card presentation chrome
  clone.style.boxShadow = "none";
  clone.style.border = "none";
  clone.style.borderRadius = "0";

  // 4. Strip [data-bullet-idx] annotation backgrounds (fallback non-live path)
  clone.querySelectorAll<HTMLElement>("[data-bullet-idx]").forEach((row) => {
    row.style.background = "transparent";
    row.style.boxShadow = "none";
    row.style.borderLeft = "none";
    row.style.cursor = "default";
  });

  // 5. Inject complete CSS variable definitions + export overrides.
  //    Headless Chromium has no globals.css so every var must be spelled out.
  const style = clone.ownerDocument?.createElement("style") ?? document.createElement("style");
  style.textContent = `
    :root {
      /* Light-mode resume paper palette — mirrors globals.css */
      --resume-paper-bg:       #ffffff;
      --resume-paper-ink:      #0f172a;
      --resume-paper-muted:    #475569;
      --resume-paper-dim:      #64748b;
      --resume-paper-accent:   #0969da;
      --resume-paper-border:   rgba(15,23,42,0.10);
      --resume-paper-row:      #f8fafc;
      --resume-paper-row-hover:transparent;

      /* Annotation colour vars — all transparent in PDF */
      --red-bg:   transparent;
      --yellow-bg:transparent;
      --green-bg: transparent;
      --surface2: transparent;
    }

    /* Ensure annotation backgrounds never bleed through */
    [data-bullet-idx]            { background: transparent !important; border-left: none !important; }
    .az-pdf-ignore               { display: none !important; }

    /* Disable all animations and transitions — prevents Chromium capturing
       a mid-animation frame (e.g. the mirror-pulse outline) */
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
  `;
  clone.prepend(style);

  return clone;
}

export function useHtmlPdfExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPdf = useCallback(async (containerEl: HTMLElement, filename = "resume.pdf") => {
    setExporting(true);
    setError(null);
    try {
      const cleaned = cleanForExport(containerEl);

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #ffffff; }
  @page { size: Letter; margin: 0; }
</style>
</head>
<body>${cleaned.outerHTML}</body>
</html>`;

      const resp = await fetch(apiUrl("/api/export-pdf-html"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Export failed" })) as { error?: string; detail?: string };
        const msg = err.error || `HTTP ${resp.status}`;
        const detail = typeof err.detail === "string" ? err.detail.trim() : "";
        throw new Error(detail && !msg.includes("playwright") ? `${msg} (${detail.slice(0, 120)})` : msg);
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
