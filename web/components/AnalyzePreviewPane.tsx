"use client";

import { useEffect } from "react";
import AnnotatedResumePanel from "@/components/AnnotatedResumePanel";
import { useResumeAnalyzeStore } from "@/store/resumeAnalyzeStore";

const PULSE_MS = 850;

interface SectionFeedbackItem {
  section: string;
  score: number;
  feedback: string;
}

interface Props {
  sectionFeedback: SectionFeedbackItem[];
  activeCategory: string | null;
  rewriteEdits: Record<number, string>;
  patchBulletRewrite: (bulletIndex: number, value: string | null) => void;
  patchPreviewLine: (bulletIndex: number, value: string | null) => void;
  selectedBulletIndex?: number | null;
  onBulletLinkedSelect?: (index: number) => void;
  presentationOnly?: boolean;
  onOpenBuilder?: () => void;
  builderReady?: boolean;
  builderOpening?: boolean;
}

/**
 * Right-column résumé mirror: reads canonical preview state from {@link useResumeAnalyzeStore}
 * so the document stays in sync with session overrides without prop-drilling extracted text + bullets everywhere.
 */
export default function AnalyzePreviewPane({
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
}: Props) {
  const extractedText = useResumeAnalyzeStore((s) => s.extractedText);
  const analysisBullets = useResumeAnalyzeStore((s) => s.analysisBullets);
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
      extractedText={extractedText || null}
      selectedBulletIndex={selectedBulletIndex}
      onBulletLinkedSelect={onBulletLinkedSelect}
      presentationOnly={presentationOnly}
      onOpenBuilder={onOpenBuilder}
      builderReady={builderReady}
      builderOpening={builderOpening}
      pulseBulletIndex={pulseBulletIndex}
    />
  );
}
