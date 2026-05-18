"use client";

import { useState, useCallback } from "react";
import { apiUrl } from "@/lib/utils";

export interface UploadResumeResult {
  /** Extracted plain text from the PDF. */
  text: string;
  /** Candidate name/contact lines detected by the backend. */
  resumeHeader?: string[];
  /** Original filename as returned by the backend. */
  filename?: string;
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
      const json = await resp.json() as { error?: string; text?: string; resumeHeader?: string[]; filename?: string };

      if (!resp.ok) throw new Error(json.error ?? "Could not extract text from your PDF.");
      return {
        text: json.text ?? "",
        resumeHeader: json.resumeHeader,
        filename: json.filename,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { upload, loading, error, clearError };
}
