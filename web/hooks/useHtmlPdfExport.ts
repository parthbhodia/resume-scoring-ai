"use client";
import { useCallback, useState } from "react";
import { apiUrl } from "@/lib/utils";

/**
 * Strip Analyze annotation chrome from a cloned DOM before PDF export.
 * The live preview shows colored bullet backgrounds, score badges, chevrons,
 * issue chips, and improved-bullet editors. None of those belong in the PDF.
 */
function cleanForExport(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;

  // Remove elements explicitly marked as PDF-only UI chrome
  clone.querySelectorAll(".az-pdf-ignore").forEach((el) => el.remove());

  // Strip analysis annotation chrome from bullet rows
  clone.querySelectorAll<HTMLElement>("[data-bullet-idx]").forEach((row) => {
    // Reset colored row backgrounds to transparent
    row.style.background = "transparent";
    row.style.boxShadow = "none";
    row.style.borderLeft = "none";
    row.style.cursor = "default";

    // Remove every child element that is NOT the bullet text span:
    // score badge (first flex child span), chevron SVG, issue chip wrapper,
    // improved-bullet editor wrapper, preview-applied marker.
    // Keep only <span> children that contain the actual bullet text
    // (identified by having flex: 1 or containing text content).
    const directChildren = Array.from(row.children);
    directChildren.forEach((child) => {
      const el = child as HTMLElement;
      // The outer flex row that contains score badge + text + chevron
      if (el.style.display === "flex" || getComputedStyle(el).display === "flex") {
        // Inside this row: remove score badge (short span with numeric text)
        // and chevron SVG; keep the text span
        Array.from(el.children).forEach((gc) => {
          const gcel = gc as HTMLElement;
          // Score badge: short text content that is a number
          if (gcel.tagName === "SPAN" && /^\d+$/.test(gcel.textContent?.trim() ?? "")) {
            gcel.remove();
            return;
          }
          // Chevron SVG
          if (gcel.tagName === "SVG" || gcel.tagName === "svg") {
            gcel.remove();
            return;
          }
          // Session-applied marker dot (tiny ● span)
          if (gcel.tagName === "SPAN" && (gcel.textContent?.trim() === "●" || gcel.textContent?.trim() === "✦")) {
            gcel.remove();
          }
        });
      } else {
        // Issue chips div, BulletImprovedEditor, or any other non-text block
        // — remove everything that isn't the main flex bullet row
        el.remove();
      }
    });
  });

  // Neutralize CSS custom properties that might bleed in (dark mode vars, etc.)
  // by adding an inline override block
  const style = clone.ownerDocument?.createElement("style") ?? document.createElement("style");
  style.textContent = `
    :root {
      --resume-paper-bg: #ffffff;
      --resume-paper-ink: #111111;
      --resume-paper-muted: #555555;
      --resume-paper-border: #e5e7eb;
      --resume-paper-row-hover: transparent;
      --red-bg: transparent;
      --yellow-bg: transparent;
      --green-bg: transparent;
      --surface2: transparent;
    }
    [data-bullet-idx] { background: transparent !important; border-left: none !important; }
    .az-pdf-ignore { display: none !important; }
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: white; }
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
