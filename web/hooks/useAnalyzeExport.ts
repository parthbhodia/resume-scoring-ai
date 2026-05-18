"use client";

import { useState, useCallback } from "react";
import { apiUrl } from "@/lib/utils";
import { DEFAULT_REFERENCE_FOLDER } from "@/lib/resumeTemplates";
import { useResumeAnalyzeStore } from "@/store/resumeAnalyzeStore";

export interface UseAnalyzeExportOptions {
  /** Optional JD text — if provided, the PDF export tailors bullets to the JD. */
  jd?: string;
}

export interface UseAnalyzeExportReturn {
  exportPdf: (opts?: { referenceFolder?: string }) => Promise<void>;
  exportDocx: () => Promise<void>;
  exporting: boolean;
  error: string | null;
  clearError: () => void;
  /** True when structuredResume is available (export is possible). */
  canExport: boolean;
}

/** Builds the acceptedEdits map from Analyze store state for API transport. */
function buildAcceptedEdits(): Record<string, Record<string, string>> {
  const { bulletMap, acceptedBullets, rewriteEdits, lineOverrides, analysisBullets } =
    useResumeAnalyzeStore.getState();
  const out: Record<string, Record<string, string>> = {};
  const indices = new Set<number>();
  for (const k of Object.keys(acceptedBullets)) indices.add(Number(k));
  for (const k of Object.keys(rewriteEdits)) indices.add(Number(k));
  for (const k of Object.keys(lineOverrides)) indices.add(Number(k));
  for (const flatIdx of indices) {
    const entry = bulletMap[flatIdx];
    if (!entry) continue;
    const text = (
      lineOverrides[flatIdx] ??
      rewriteEdits[flatIdx] ??
      (acceptedBullets[flatIdx] ? analysisBullets[flatIdx]?.improvedBullet : "") ??
      ""
    ).trim();
    if (!text) continue;
    const ei = String(entry.experienceIdx);
    const bi = String(entry.bulletIdx);
    if (!out[ei]) out[ei] = {};
    out[ei][bi] = text;
  }
  return out;
}

async function downloadBlob(resp: Response, fallbackFilename: string) {
  const disposition = resp.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useAnalyzeExport({ jd = "" }: UseAnalyzeExportOptions = {}): UseAnalyzeExportReturn {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const structuredResume = useResumeAnalyzeStore((s) => s.structuredResume);
  const canExport = structuredResume !== null;

  const exportPdf = useCallback(async (opts?: { referenceFolder?: string }) => {
    const sr = useResumeAnalyzeStore.getState().structuredResume;
    if (!sr) { setError("No structured resume available — re-upload your file to enable PDF export."); return; }
    const referenceFolder = (opts?.referenceFolder || DEFAULT_REFERENCE_FOLDER).trim() || DEFAULT_REFERENCE_FOLDER;
    setExporting(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/analyze-export-pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredResume: sr,
          acceptedEdits: buildAcceptedEdits(),
          referenceFolder,
          jd: jd.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? "PDF export failed");
      }
      await downloadBlob(resp, "resume_export.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }, [jd]);

  const exportDocx = useCallback(async () => {
    const sr = useResumeAnalyzeStore.getState().structuredResume;
    if (!sr) { setError("No structured resume available — re-upload your file to enable DOCX export."); return; }
    setExporting(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/export-docx"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredResume: sr,
          acceptedEdits: buildAcceptedEdits(),
        }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? "DOCX export failed");
      }
      await downloadBlob(resp, "resume_export.docx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "DOCX export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  return { exportPdf, exportDocx, exporting, error, clearError: () => setError(null), canExport };
}
