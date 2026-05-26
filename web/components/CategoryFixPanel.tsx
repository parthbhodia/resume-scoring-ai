"use client";

import { useState, useEffect, useRef } from "react";
import {
  useSuggestionsStore,
  CATEGORY_META,
  CATEGORY_ORDER,
  type SuggestionCategory,
  type Suggestion,
} from "@/store/suggestionsStore";

// ─── BulletCard ───────────────────────────────────────────────────────────────

function BulletCard({
  suggestion,
  accepted,
  rejected,
  selected,
  onAccept,
  onReject,
  onUndo,
  onSelect,
}: {
  suggestion: Suggestion;
  accepted: boolean;
  rejected: boolean;
  selected: boolean;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  onSelect: () => void;
}) {
  const [editedSuggestion, setEditedSuggestion] = useState(suggestion.suggested);
  const [editing, setEditing] = useState(false);
  const meta = CATEGORY_META[suggestion.category ?? "strengthen_impact"];
  const status = accepted ? "accepted" : rejected ? "rejected" : "pending";

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 12,
        border: `1px solid ${selected ? "rgba(139,92,246,0.6)" : accepted ? "rgba(52,211,153,0.3)" : rejected ? "rgba(248,113,113,0.2)" : "var(--border)"}`,
        background: selected ? "rgba(139,92,246,0.06)" : accepted ? "rgba(52,211,153,0.04)" : rejected ? "rgba(248,113,113,0.03)" : "var(--surface2)",
        overflow: "hidden",
        opacity: rejected ? 0.55 : 1,
        transition: "opacity 0.15s, border-color 0.15s, background 0.15s",
        cursor: "pointer",
        boxShadow: selected ? "0 0 0 2px rgba(139,92,246,0.25)" : undefined,
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Checkbox */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); accepted ? onUndo() : onAccept(); }}
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              border: `2px solid ${accepted ? "#34d399" : "var(--border)"}`,
              background: accepted ? "#34d399" : "var(--surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.12s",
            }}
          >
            {accepted && <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</span>}
          </button>
          <span style={{ fontSize: 11, color: "var(--dim)" }}>
            {suggestion.section}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Priority badge */}
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 5,
            background: suggestion.priority === "high" ? "rgba(239,68,68,0.1)" : suggestion.priority === "medium" ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.1)",
            color: suggestion.priority === "high" ? "#ef4444" : suggestion.priority === "medium" ? "#f59e0b" : "#64748b",
            textTransform: "uppercase" as const,
            letterSpacing: 0.3,
          }}>
            {suggestion.priority}
          </span>
          {/* Reject / undo */}
          {!accepted && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); rejected ? onUndo() : onReject(); }}
              title={rejected ? "Undo skip" : "Skip this fix"}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: rejected ? "var(--accent)" : "var(--dim)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {rejected ? "Undo" : "Skip"}
            </button>
          )}
          {accepted && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUndo(); }}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--dim)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Undo
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Original */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Original bullet
          </div>
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--muted)",
            lineHeight: 1.6,
          }}>
            {suggestion.original}
          </div>
        </div>

        {/* Suggested */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Suggested correction
            </div>
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              style={{ fontSize: 11, color: "var(--dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              title="Edit suggestion"
            >
              ✏️
            </button>
          </div>
          {editing ? (
            <textarea
              value={editedSuggestion}
              onChange={(e) => setEditedSuggestion(e.target.value)}
              onBlur={() => setEditing(false)}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(52,211,153,0.06)",
                border: "1px solid rgba(52,211,153,0.3)",
                fontSize: 13,
                color: "#34d399",
                lineHeight: 1.6,
                resize: "vertical",
                minHeight: 80,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <div style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(52,211,153,0.06)",
              border: "1px solid rgba(52,211,153,0.3)",
              fontSize: 13,
              color: "#34d399",
              lineHeight: 1.6,
            }}>
              {editedSuggestion}
            </div>
          )}
        </div>

        {/* Reason */}
        {suggestion.reason && (
          <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>
            <span style={{ fontWeight: 600, color: "var(--muted)" }}>Fix explanation: </span>
            {suggestion.reason}
          </div>
        )}

        {/* Category chip */}
        <div>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 6,
            background: meta.bg,
            color: meta.color,
            letterSpacing: 0.3,
          }}>
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── CategoryNav ──────────────────────────────────────────────────────────────

function CategoryNav({
  categories,
  activeCategory,
  onSelect,
}: {
  categories: SuggestionCategory[];
  activeCategory: SuggestionCategory | null;
  onSelect: (cat: SuggestionCategory) => void;
}) {
  const { suggestions, acceptedIds, rejectedIds, categoryStatus } = useSuggestionsStore();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
      {categories.map((cat) => {
        const meta = CATEGORY_META[cat];
        const catSuggestions = suggestions.filter((s) => s.category === cat);
        const acceptedCount = catSuggestions.filter((s) => acceptedIds.has(s.id)).length;
        const status = categoryStatus.get(cat);
        const isActive = activeCategory === cat;
        const isDone = status === "done";
        const isSkipped = status === "skipped";

        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 20,
              border: `1px solid ${isActive ? meta.color : isDone ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
              background: isActive ? meta.bg : isDone ? "rgba(52,211,153,0.06)" : "var(--surface2)",
              color: isActive ? meta.color : isDone ? "#34d399" : isSkipped ? "var(--dim)" : "var(--muted)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "all 0.12s",
              opacity: isSkipped ? 0.55 : 1,
            }}
          >
            <span>{isDone ? "✓" : meta.emoji}</span>
            <span>{meta.label}</span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 8,
              background: isActive ? "rgba(0,0,0,0.1)" : "rgba(148,163,184,0.15)",
            }}>
              {isDone ? `${acceptedCount}/${catSuggestions.length}` : catSuggestions.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── SuggestionsPanel ─────────────────────────────────────────────────────────

export default function SuggestionsPanel({
  onApplyAll,
  applyBusy,
}: {
  onApplyAll: () => void;
  applyBusy?: boolean;
}) {
  const {
    suggestions,
    summary,
    activeCategory,
    categoryStatus,
    acceptedIds,
    rejectedIds,
    selectedId,
    accept,
    reject,
    undoAccept,
    undoReject,
    select,
    setActiveCategory,
    markCategoryDone,
    markCategorySkipped,
    categoriesPresent,
  } = useSuggestionsStore();

  const categories = categoriesPresent();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // When selectedId changes (e.g. user clicked a line in the paper view):
  // 1. Switch to the category that contains the selected suggestion
  // 2. Scroll the matching card into view
  useEffect(() => {
    if (!selectedId) return;
    const sug = suggestions.find(s => s.id === selectedId);
    if (!sug) return;
    if (sug.category && sug.category !== activeCategory) {
      setActiveCategory(sug.category);
    }
    // Small delay so the category panel re-renders before we scroll
    const t = setTimeout(() => {
      const el = cardRefs.current.get(selectedId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => clearTimeout(t);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null;

  const totalAccepted = acceptedIds.size;
  const allCatsDone = categories.every(
    (c) => categoryStatus.get(c) === "done" || categoryStatus.get(c) === "skipped",
  );

  const activeSuggestions = activeCategory
    ? suggestions.filter((s) => s.category === activeCategory)
    : [];

  const activeAccepted = activeSuggestions.filter((s) => acceptedIds.has(s.id)).length;
  const activeMeta = activeCategory ? CATEGORY_META[activeCategory] : null;
  const activeCatStatus = activeCategory ? categoryStatus.get(activeCategory) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Summary banner ─────────────────────────────────── */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          border: "1px solid rgba(139,92,246,0.25)",
          background: "linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(59,130,246,0.04) 100%)",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "rgba(139,92,246,0.15)",
            border: "1px solid rgba(139,92,246,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ⚡
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
            AI Suggested Improvements
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            {suggestions.length} fix{suggestions.length !== 1 ? "es" : ""} across {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
            {summary ? ` · ${summary}` : ""}
          </div>
        </div>
        {/* Only show the top-level apply button once all categories are reviewed */}
        {allCatsDone ? (
          <button
            type="button"
            onClick={onApplyAll}
            disabled={applyBusy || totalAccepted === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: totalAccepted > 0 && !applyBusy ? "#8b5cf6" : "var(--border)",
              color: totalAccepted > 0 && !applyBusy ? "#fff" : "var(--dim)",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: totalAccepted > 0 && !applyBusy ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            {applyBusy ? (
              <>
                <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Applying…
              </>
            ) : (
              <>✓ Apply Selected ({totalAccepted})</>
            )}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: "var(--dim)", flexShrink: 0 }}>
            Review each category below ↓
          </span>
        )}
      </div>

      {/* ── Category nav ───────────────────────────────────── */}
      <CategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
      />

      {/* ── Active category panel ──────────────────────────── */}
      {activeCategory && activeMeta && (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          {/* Category header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 18px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface2)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: activeMeta.bg,
                  color: activeMeta.color,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {activeMeta.emoji} {activeMeta.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--dim)" }}>
                {activeSuggestions.length} fix{activeSuggestions.length !== 1 ? "es" : ""}
                {activeAccepted > 0 ? ` · ${activeAccepted} selected` : ""}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Select all / Deselect */}
              <button
                type="button"
                onClick={() => activeSuggestions.forEach((s) => accept(s.id))}
                style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 4px" }}
              >
                Select All
              </button>
              <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>
              <button
                type="button"
                onClick={() => activeSuggestions.forEach((s) => { undoAccept(s.id); undoReject(s.id); })}
                style={{ fontSize: 12, color: "var(--dim)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 4px" }}
              >
                Deselect
              </button>
              {/* Done / Skip */}
              {activeCatStatus !== "done" && (
                <>
                  <button
                    type="button"
                    onClick={() => markCategorySkipped(activeCategory)}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--dim)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => markCategoryDone(activeCategory)}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "none",
                      background: activeMeta.color,
                      color: "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontWeight: 600,
                    }}
                  >
                    Done →
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bullet cards */}
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {activeSuggestions.map((s) => (
              <div key={s.id} ref={(el) => { if (el) cardRefs.current.set(s.id, el); else cardRefs.current.delete(s.id); }}>
                <BulletCard
                  suggestion={s}
                  accepted={acceptedIds.has(s.id)}
                  rejected={rejectedIds.has(s.id)}
                  selected={selectedId === s.id}
                  onAccept={() => accept(s.id)}
                  onReject={() => reject(s.id)}
                  onUndo={() => { undoAccept(s.id); undoReject(s.id); }}
                  onSelect={() => select(s.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All done state ─────────────────────────────────── */}
      {allCatsDone && totalAccepted > 0 && (
        <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 12, border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399", marginBottom: 2 }}>
              ✓ All categories reviewed
            </div>
            <div style={{ fontSize: 12, color: "var(--dim)" }}>
              {totalAccepted} selected fix{totalAccepted !== 1 ? "es" : ""} will be applied · skipped ones are ignored.
            </div>
          </div>
          <button
            type="button"
            onClick={onApplyAll}
            disabled={applyBusy}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#34d399",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: applyBusy ? "wait" : "pointer",
            }}
          >
            {applyBusy ? "Applying…" : `Apply Selected (${totalAccepted}) & Rebuild PDF →`}
          </button>
        </div>
      )}
    </div>
  );
}
