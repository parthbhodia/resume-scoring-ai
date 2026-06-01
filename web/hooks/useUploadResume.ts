"use client";

import { useState, useCallback } from "react";
import { apiErrorFromUnknown } from "@/lib/userFriendlyError";
import { mergeAnalyzeApiJson } from "@/lib/mergeAnalyzeApiJson";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
import type { StructuredResume } from "@/store/resumeAnalyzeStore";

export interface UploadResumeResult {
  /** Builder-friendly plain text (prefers vision-synthesized extract when available). */
  text: string;
  /** Clean synthesized preview text — same source Analyze uses for WYSIWYG preview. */
  extractedText: string;
  /** Candidate name/contact lines detected by the backend. */
  resumeHeader: string[];
  /** Original filename as returned by the backend. */
  filename?: string;
  /** Structured resume JSON produced by the backend extraction pipeline. */
  structuredResume: StructuredResume | null;
}

export interface UseUploadResumeReturn {
  upload: (file: File, jd?: string) => Promise<UploadResumeResult>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Shared hook for /api/upload-resume — used by ResumeBuilder,
 * ContentSourcePicker, and ProfilePage. Eliminates duplicate fetch() calls.
 */
export function useUploadResume(): UseUploadResumeReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File, jd = ""): Promise<UploadResumeResult> => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (jd.trim()) fd.append("jd", jd.trim());

      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: fd });
      const raw = await parseJsonOrThrow<Record<string, unknown>>(resp);
      const json = mergeAnalyzeApiJson(raw) as {
        error?: string;
        text?: string;
        extractedText?: string;
        resumeHeader?: string[];
        filename?: string;
        structuredResume?: StructuredResume | null;
        structured?: StructuredResume | null;
      };

      if (!resp.ok) throw new Error(json.error ?? "Could not extract text from your PDF.");

      const extracted =
        (typeof json.extractedText === "string" && json.extractedText.trim())
        || (typeof json.text === "string" && json.text.trim())
        || "";
      const structured =
        json.structuredResume ?? json.structured ?? null;

      return {
        text: extracted,
        extractedText: extracted,
        resumeHeader: Array.isArray(json.resumeHeader)
          ? json.resumeHeader.filter((x): x is string => typeof x === "string")
          : [],
        filename: typeof json.filename === "string" ? json.filename : undefined,
        structuredResume: structured,
      };
    } catch (e: unknown) {
      const msg = apiErrorFromUnknown(e);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { upload, loading, error, clearError };
}
