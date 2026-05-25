"use client";

import { useState, useCallback } from "react";
import { apiErrorFromUnknown } from "@/lib/userFriendlyError";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
import type { StructuredResume } from "@/store/resumeAnalyzeStore";

export interface UploadResumeResult {
  /** Extracted plain text from the PDF. */
  text: string;
  /** Candidate name/contact lines detected by the backend. */
  resumeHeader?: string[];
  /** Original filename as returned by the backend. */
  filename?: string;
  /** Structured resume JSON produced by the backend extraction pipeline. */
  structuredResume?: StructuredResume | null;
}

export interface UseUploadResumeReturn {
  upload: (file: File, jd?: string) => Promise<UploadResumeResult>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Shared hook for /api/upload-resume — used by AnalyzeResume, ResumeBuilder,
 * ContentSourcePicker, and ProfilePage. Eliminates 4 duplicate fetch() calls.
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
      const json = await parseJsonOrThrow<{ error?: string; text?: string; resumeHeader?: string[]; filename?: string; structuredResume?: StructuredResume | null }>(resp);

      if (!resp.ok) throw new Error(json.error ?? "Could not extract text from your PDF.");
      return {
        text: json.text ?? "",
        resumeHeader: json.resumeHeader,
        filename: json.filename,
        structuredResume: json.structuredResume ?? null,
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
