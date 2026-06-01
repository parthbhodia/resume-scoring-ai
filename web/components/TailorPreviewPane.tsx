"use client";

import { useCallback } from "react";
import AnnotatedResumePanel from "@/components/AnnotatedResumePanel";
import type { LiveBulletItem } from "@/lib/resumeBulletMatch";

interface Props {
  extractedText: string;
  resumeHeader?: string[];
  company?: string;
  role?: string;
  /** Analyze-style bullet index map for preview highlights. */
  bulletAnalysis?: LiveBulletItem[];
  previewLineOverrides?: Record<number, string>;
  gapFixTargetBulletIndices?: number[];
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
  previewLineOverrides = {},
  gapFixTargetBulletIndices = [],
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
      resumeHeader={resumeHeader}
      presentationOnly
      exportPdfEnabled
      gapFixTargetBulletIndices={gapFixTargetBulletIndices}
      tailorAppliedBulletIndices={tailorAppliedBulletIndices}
      onExportDocx={exportDocxEnabled ? handleExportDocx : undefined}
      exportDocxEnabled={exportDocxEnabled && !docxExportBusy}
      exportingResume={docxExportBusy}
    />
  );
}
