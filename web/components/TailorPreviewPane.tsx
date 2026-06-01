"use client";

import { useCallback } from "react";
import AnnotatedResumePanel from "@/components/AnnotatedResumePanel";

interface Props {
  extractedText: string;
  resumeHeader?: string[];
  company?: string;
  role?: string;
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
  onExportDocx,
  exportDocxEnabled = false,
  docxExportBusy = false,
}: Props) {
  const handleExportDocx = useCallback(() => {
    onExportDocx?.();
  }, [onExportDocx]);

  return (
    <AnnotatedResumePanel
      bulletAnalysis={[]}
      sectionFeedback={[]}
      activeCategory={null}
      rewriteEdits={{}}
      patchBulletRewrite={noopPatch}
      previewLineOverrides={{}}
      patchPreviewLine={noopPatch}
      extractedText={extractedText.trim() || null}
      resumeHeader={resumeHeader}
      presentationOnly
      exportPdfEnabled
      onExportDocx={exportDocxEnabled ? handleExportDocx : undefined}
      exportDocxEnabled={exportDocxEnabled && !docxExportBusy}
      exportingResume={docxExportBusy}
    />
  );
}
