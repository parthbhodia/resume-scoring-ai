"use client";

import { useCallback } from "react";
import AnnotatedResumePanel from "@/components/AnnotatedResumePanel";
import type { LiveBulletItem } from "@/lib/resumeBulletMatch";
import type { StructuredResume } from "@/store/resumeAnalyzeStore";

interface Props {
  extractedText: string;
  resumeHeader?: string[];
  company?: string;
  role?: string;
  /** Analyze-style bullet index map for preview highlights. */
  bulletAnalysis?: LiveBulletItem[];
  /** Structured resume (from /api/upload-resume) — renders the preview from typed fields. */
  structuredResume?: StructuredResume | null;
  previewLineOverrides?: Record<number, string>;
  gapFixTargetBulletIndices?: number[];
  tailorGapFixHighlights?: string[];
  tailorAppliedBulletIndices?: ReadonlySet<number>;
  /** Optional DOCX export when a tailored folder exists. */
  onExportDocx?: () => void;
  exportDocxEnabled?: boolean;
  docxExportBusy?: boolean;
}

const noopPatch = () => {};

/**
 * Tailor results preview — same AnnotatedResumePanel + WYSIWYG HTML export as Analyze.
 */
export default function TailorPreviewPane({
  extractedText,
  resumeHeader = [],
  company = "",
  role = "",
  bulletAnalysis = [],
  structuredResume = null,
  previewLineOverrides = {},
  gapFixTargetBulletIndices = [],
  tailorGapFixHighlights = [],
  tailorAppliedBulletIndices = new Set<number>(),
  onExportDocx,
  exportDocxEnabled = false,
  docxExportBusy = false,
}: Props) {
  const handleExportDocx = useCallback(() => {
    onExportDocx?.();
  }, [onExportDocx]);

  return (
    <AnnotatedResumePanel
      bulletAnalysis={bulletAnalysis}
      sectionFeedback={[]}
      activeCategory={null}
      rewriteEdits={{}}
      patchBulletRewrite={noopPatch}
      previewLineOverrides={previewLineOverrides}
      patchPreviewLine={noopPatch}
      extractedText={extractedText.trim() || null}
      structuredResume={structuredResume}
      structuredResumeAuthoritative
      resumeHeader={resumeHeader}
      presentationOnly
      exportPdfEnabled
      gapFixTargetBulletIndices={gapFixTargetBulletIndices}
      tailorGapFixHighlights={tailorGapFixHighlights}
      tailorAppliedBulletIndices={tailorAppliedBulletIndices}
      onExportDocx={exportDocxEnabled ? handleExportDocx : undefined}
      exportDocxEnabled={exportDocxEnabled && !docxExportBusy}
      exportingResume={docxExportBusy}
    />
  );
}
