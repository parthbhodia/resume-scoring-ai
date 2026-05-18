"use client";

import { useEffect } from "react";
import AnnotatedResumePanel from "@/components/AnnotatedResumePanel";
import { useResumeAnalyzeStore, type AnalyzeBulletSnapshot } from "@/store/resumeAnalyzeStore";
import { useAnalyzeExport } from "@/hooks/useAnalyzeExport";

const PULSE_MS = 850;

interface SectionFeedbackItem {
  section: string;
  score: number;
  feedback: string;
}

/** Snapshot from POST /analyze (same render as API — avoids stale Zustand before layout-effect hydrate). */
export interface AnalyzePreviewSnapshot {
  extractedText?: string | null;
  resumeHeader?: string[] | null;
  bulletAnalysis?: AnalyzeBulletSnapshot[] | null;
}

interface Props {
  sectionFeedback: SectionFeedbackItem[];
  /** Prefer over store for `extractedText` / `resumeHeader` on the painting pass right after POST /analyze. */
  analyzeSnapshot?: AnalyzePreviewSnapshot | null;
  activeCategory: string | null;
  rewriteEdits: Record<number, string>;
  patchBulletRewrite: (bulletIndex: number, value: string | null) => void;
  patchPreviewLine: (bulletIndex: number, value: string | null) => void;
  selectedBulletIndex?: number | null;
  onBulletLinkedSelect?: (index: number) => void;
  presentationOnly?: boolean;
  onOpenBuilder?: (opts?: { referenceFolder?: string }) => void;
  builderReady?: boolean;
  builderOpening?: boolean;
  /** Original upload as blob URL (PDF upload flow). */
  sourcePdfUrl?: string | null;
  sourcePdfFileName?: string | null;
  /** Shown when a saved analysis was restored — PDF bytes are not in storage. */
  restoredResumeNoPdfHint?: boolean;
  /** Optional JD text — enables JD-tailored PDF export. */
  jd?: string;
}

/**
 * Right-column résumé mirror: reads canonical preview state from {@link useResumeAnalyzeStore}
 * so the document stays in sync with session overrides without prop-drilling extracted text + bullets everywhere.
 */
export default function AnalyzePreviewPane({
  analyzeSnapshot = null,
  sectionFeedback,
  activeCategory,
  rewriteEdits,
  patchBulletRewrite,
  patchPreviewLine,
  selectedBulletIndex,
  onBulletLinkedSelect,
  presentationOnly,
  onOpenBuilder,
  builderReady,
  builderOpening,
  sourcePdfUrl = null,
  sourcePdfFileName = null,
  restoredResumeNoPdfHint = false,
  jd = "",
}: Props) {
  const { exportPdf, exportDocx, exporting, canExport } = useAnalyzeExport({ jd });
  const extractedTextStore = useResumeAnalyzeStore((s) => s.extractedText);
  const resumeHeaderStore = useResumeAnalyzeStore((s) => s.resumeHeader);
  const bulletsStore = useResumeAnalyzeStore((s) => s.analysisBullets);
  const snapExtract = analyzeSnapshot?.extractedText ?? "";
  const snapHeader = analyzeSnapshot?.resumeHeader ?? null;
  const snapBullets = analyzeSnapshot?.bulletAnalysis ?? null;
  const extractedText =
    typeof snapExtract === "string" && snapExtract.trim() !== ""
      ? snapExtract.trim()
      : extractedTextStore;
  const resumeHeader =
    snapHeader != null && snapHeader.length > 0 ? snapHeader : resumeHeaderStore;
  const analysisBullets =
    snapBullets != null && snapBullets.length > 0 ? snapBullets : bulletsStore;
  const lineOverrides = useResumeAnalyzeStore((s) => s.lineOverrides);
  const pulseToken = useResumeAnalyzeStore((s) => s.pulseToken);
  const pulseBulletIndex = useResumeAnalyzeStore((s) => s.pulseBulletIndex);
  const clearPulse = useResumeAnalyzeStore((s) => s.clearPulse);

  useEffect(() => {
    if (pulseBulletIndex === null) return;
    const id = window.setTimeout(() => clearPulse(), PULSE_MS);
    return () => window.clearTimeout(id);
  }, [pulseToken, pulseBulletIndex, clearPulse]);

  return (
    <AnnotatedResumePanel
      bulletAnalysis={analysisBullets}
      sectionFeedback={sectionFeedback}
      activeCategory={activeCategory}
      rewriteEdits={rewriteEdits}
      patchBulletRewrite={patchBulletRewrite}
      previewLineOverrides={lineOverrides}
      patchPreviewLine={patchPreviewLine}
      extractedText={extractedText ? extractedText : null}
      resumeHeader={resumeHeader}
      selectedBulletIndex={selectedBulletIndex}
      onBulletLinkedSelect={onBulletLinkedSelect}
      presentationOnly={presentationOnly}
      onOpenBuilder={onOpenBuilder}
      builderReady={builderReady}
      builderOpening={builderOpening}
      pulseBulletIndex={pulseBulletIndex}
      sourcePdfUrl={sourcePdfUrl}
      sourcePdfFileName={sourcePdfFileName}
      restoredResumeNoPdfHint={restoredResumeNoPdfHint}
      onExportPdf={canExport ? exportPdf : undefined}
      onExportDocx={canExport ? exportDocx : undefined}
      exportingResume={exporting}
    />
  );
}
