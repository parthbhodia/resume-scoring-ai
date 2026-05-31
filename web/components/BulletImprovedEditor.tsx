"use client";

import type { CSSProperties, FocusEvent, ReactNode } from "react";

export type BulletImprovedEditorLayout = "panel" | "card" | "plain";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onReset: () => void;
  canReset: boolean;
  eyebrow?: string;
  helperText?: string;
  resetLabel?: string;
  accentColor?: string;
  /** Shown next to "AI Improved" — typically a Copy control */
  toolbarRight?: ReactNode;
  /** Textarea min height in px */
  minHeight?: number;
  /** panel: indented under badge (resume preview); card: full-width in detail cards; plain: accordion body */
  layout?: BulletImprovedEditorLayout;
  /** Update the main “resume line” in Analyze’s preview to match the draft (not a real PDF write). */
  onReplaceInPreview?: () => void;
  /** Clear preview override and show the scanned line again */
  onRevertPreviewLine?: () => void;
  /** True when the preview line is showing an applied draft */
  previewLineApplied?: boolean;
  /** Optional: link textarea focus to preview mirror highlight (Analyze split layout). */
  onTextareaFocus?: () => void;
  /** Optional: blur — parent can delay-clear selection if focus left the bullet workspace. */
  onTextareaBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
};

const layoutStyle = (layout: BulletImprovedEditorLayout): CSSProperties => {
  if (layout === "panel") {
    return {
      marginTop: 10,
      paddingLeft: 32,
      paddingTop: 10,
      borderTop: "1px dashed var(--border)",
    };
  }
  if (layout === "card") {
    return {
      marginTop: 10,
      paddingLeft: 0,
      paddingTop: 10,
      borderTop: "1px dashed var(--border)",
    };
  }
  return {
    marginTop: 8,
    paddingLeft: 0,
    paddingTop: 0,
    borderTop: "none",
  };
};

/**
 * Editable AI bullet suggestion with stopPropagation so parent row clicks don’t toggle.
 */
export default function BulletImprovedEditor({
  value,
  onChange,
  onReset,
  canReset,
  eyebrow = "AI Improved",
  helperText = "Edit below",
  resetLabel = "Reset to AI",
  accentColor = "var(--green)",
  toolbarRight,
  minHeight = 72,
  layout = "card",
  onReplaceInPreview,
  onRevertPreviewLine,
  previewLineApplied = false,
  onTextareaFocus,
  onTextareaBlur,
}: Props) {
  const canApply = !!onReplaceInPreview && value.trim().length > 0;
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={layoutStyle(layout)}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 7,
        flexWrap: "wrap",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: accentColor,
            display: "flex",
            alignItems: "center",
            gap: 4,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {eyebrow}
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--dim)",
            letterSpacing: 0.2,
          }}>
            {helperText}
          </span>
          {canReset && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onReset();
              }}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--muted)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {resetLabel}
            </button>
          )}
        </div>
        {toolbarRight}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onTextareaFocus}
        onBlur={onTextareaBlur}
        spellCheck
        aria-label="Edit AI improved bullet"
        className="az-edit-textarea"
        style={{ minHeight }}
      />
      {(onReplaceInPreview || (previewLineApplied && onRevertPreviewLine)) && (
        <div style={{
          marginTop: 9,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}>
          {onReplaceInPreview && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onReplaceInPreview();
              }}
              disabled={!canApply}
              title="Replace the bullet line in the Analyze resume preview column with the text above"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 7,
                border: `1px solid ${canApply ? "rgba(251,191,36,0.45)" : "var(--border)"}`,
                background: canApply ? "rgba(251,191,36,0.14)" : "var(--surface2)",
                color: canApply ? "var(--amber)" : "var(--dim)",
                cursor: canApply ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              Replace line in preview
            </button>
          )}
          {previewLineApplied && onRevertPreviewLine && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onRevertPreviewLine();
              }}
              title="Restore the scanned bullet text in this preview column"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--muted)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Show original scan
            </button>
          )}
          <span style={{
            fontSize: 10,
            color: "var(--dim)",
            lineHeight: 1.45,
          }}>
            Preview column only—not your uploaded PDF file. Use Résumé Builder for full edits.
          </span>
        </div>
      )}
    </div>
  );
}
