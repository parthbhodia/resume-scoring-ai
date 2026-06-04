"use client";

import { useEffect, useMemo, useState } from "react";
import { suggestionsWithDrafts } from "@/lib/tailorGapFix";
import { GapFixSuggestionCard, type GapFixSuggestion } from "@/components/ratings/GapFixSuggestionCard";

export type GapFixPanelState = {
  gapName: string;
  gapNotes: string;
  suggestions: GapFixSuggestion[];
};

type Props = {
  gapFixPanel: GapFixPanelState;
  gapFixError?: string | null;
  onApplyFix?: (s: GapFixSuggestion) => void | Promise<void>;
  onApplyAllFixes?: (suggestions: GapFixSuggestion[]) => void | Promise<void>;
  onDismissFix?: () => void;
  gapFixDrafts?: Record<string, string>;
  onGapFixDraftChange?: (id: string, text: string) => void;
  applyBusy?: boolean;
};

export default function GapFixTabPanel({
  gapFixPanel,
  gapFixError,
  onApplyFix,
  onApplyAllFixes,
  onDismissFix,
  gapFixDrafts = {},
  onGapFixDraftChange,
  applyBusy = false,
}: Props) {
  const panelSuggestions = useMemo(
    () => (gapFixPanel.suggestions ?? []).filter((s) => s.original?.trim() && s.suggested?.trim()),
    [gapFixPanel.suggestions],
  );

  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(panelSuggestions.map((s) => s.id)));

  useEffect(() => {
    setCheckedIds(new Set(panelSuggestions.map((s) => s.id)));
  }, [gapFixPanel.gapName, panelSuggestions.length]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const effectiveChecked = checkedIds;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.06) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>⚡ AI gap fixes</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Targeted rewrites for: <strong style={{ color: "var(--text)", fontWeight: 600 }}>{gapFixPanel.gapName}</strong>
          </div>
        </div>
        {onDismissFix && (
          <button
            type="button"
            onClick={onDismissFix}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--muted)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
        {gapFixError ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--error, #ef4444)" }}>{gapFixError}</p>
        ) : panelSuggestions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            No targeted rewrites found for this gap. Try &quot;Get suggestions&quot; on the Interview tab for a broader pass.
          </p>
        ) : (
          <>
            {onApplyFix && panelSuggestions.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button
                  type="button"
                  disabled={applyBusy || effectiveChecked.size === 0}
                  onClick={() => {
                    const toApply = suggestionsWithDrafts(
                      panelSuggestions.filter((s) => effectiveChecked.has(s.id)),
                      gapFixDrafts,
                    );
                    if (toApply.length === 0) return;
                    if (onApplyAllFixes) void onApplyAllFixes(toApply);
                    else toApply.forEach((s) => { void onApplyFix!(s); });
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    border: "none",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: applyBusy || effectiveChecked.size === 0 ? "not-allowed" : "pointer",
                    opacity: applyBusy || effectiveChecked.size === 0 ? 0.55 : 1,
                  }}
                >
                  {applyBusy ? "Applying…" : `Apply selected (${effectiveChecked.size})`}
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {panelSuggestions.map((s, i) => (
                <GapFixSuggestionCard
                  key={s.id}
                  suggestion={s}
                  index={i}
                  checked={effectiveChecked.has(s.id)}
                  onToggleCheck={() => toggleCheck(s.id)}
                  draftText={gapFixDrafts[s.id] ?? s.suggested}
                  onDraftChange={(text) => onGapFixDraftChange?.(s.id, text)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
