"use client";

import { useRef, useState } from "react";
import type { TemplateBuilderStore } from "@/store/templateBuilderStore";
import {
  CUSTOM_SECTION_PRESETS,
  TB_SECTION_LABELS,
  isCoreSectionSlot,
  parseCustomSectionId,
  sectionSlotLabel,
  type TBCustomSection,
  type TBContentSection,
  type TBSectionSlot,
} from "./types";

type EditTab = "profile" | "experience" | "education" | "projects" | "skills";

const SECTION_EDIT_TAB: Record<TBContentSection, EditTab> = {
  summary: "profile",
  experience: "experience",
  education: "education",
  projects: "projects",
  skills: "skills",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "22px 1fr auto auto auto",
  alignItems: "center",
  gap: 6,
  padding: "10px 11px",
  borderRadius: 8,
  border: "1.5px solid var(--border)",
  background: "var(--bg)",
  cursor: "grab",
  fontFamily: "inherit",
};

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--muted)",
  fontSize: 14,
  cursor: "pointer",
  padding: "2px 5px",
  borderRadius: 4,
  lineHeight: 1,
};

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  borderRadius: 6,
  border: "1.5px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const textareaBase: React.CSSProperties = {
  ...inputBase,
  resize: "vertical",
  minHeight: 72,
  lineHeight: 1.5,
};

const addBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "none",
  border: "1.5px dashed var(--border)",
  borderRadius: 7,
  color: "var(--accent)",
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  cursor: "pointer",
  width: "100%",
  marginTop: 10,
  fontFamily: "inherit",
};

export default function TemplateBuilderSectionsPanel({
  store,
  sectionOrder,
  hiddenSections,
  customSections,
  onEditSection,
  editingCustomId,
  onEditCustomSection,
}: {
  store: TemplateBuilderStore;
  sectionOrder: TBSectionSlot[];
  hiddenSections: TBSectionSlot[];
  customSections: TBCustomSection[];
  onEditSection: (tab: EditTab) => void;
  editingCustomId: string | null;
  onEditCustomSection: (id: string | null) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const hidden = new Set(hiddenSections);

  const editingCustom = editingCustomId
    ? customSections.find((c) => c.id === editingCustomId) ?? null
    : null;

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>
        Section order
      </h3>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
        Drag to reorder. Add certifications, awards, volunteering, and more. Name + contact stay at the top.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sectionOrder.map((slot, idx) => {
          const isHidden = hidden.has(slot);
          const over = dragOver === idx;
          const customId = parseCustomSectionId(slot);
          const isCustom = !!customId;
          return (
            <div
              key={slot}
              draggable
              onDragStart={() => { dragFrom.current = idx; }}
              onDragEnd={() => {
                dragFrom.current = null;
                setDragOver(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(idx);
              }}
              onDragLeave={() => {
                if (dragOver === idx) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFrom.current;
                if (from !== null && from !== idx) store.reorderSection(from, idx);
                dragFrom.current = null;
                setDragOver(null);
              }}
              style={{
                ...rowStyle,
                opacity: isHidden ? 0.55 : 1,
                borderColor: over ? "var(--accent)" : editingCustomId === customId ? "var(--accent)" : "var(--border)",
                background: over ? "color-mix(in srgb, var(--accent) 6%, var(--bg))" : "var(--bg)",
              }}
            >
              <span
                title="Drag to reorder"
                style={{ color: "var(--dim)", fontSize: 15, letterSpacing: -2, userSelect: "none" }}
                aria-hidden
              >
                ⋮⋮
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", minWidth: 0 }}>
                {sectionSlotLabel(slot, customSections)}
              </span>
              <button
                type="button"
                style={iconBtn}
                title={isHidden ? "Show in preview" : "Hide from preview"}
                onClick={() => store.toggleSectionHidden(slot)}
              >
                {isHidden ? "👁‍🗨" : "👁"}
              </button>
              <button
                type="button"
                style={iconBtn}
                title="Edit section"
                onClick={() => {
                  if (isCustom && customId) {
                    onEditCustomSection(editingCustomId === customId ? null : customId);
                  } else if (isCoreSectionSlot(slot)) {
                    onEditCustomSection(null);
                    onEditSection(SECTION_EDIT_TAB[slot]);
                  }
                }}
              >
                ✎
              </button>
              {isCustom && customId ? (
                <button
                  type="button"
                  style={{ ...iconBtn, color: "var(--red, #ef4444)" }}
                  title="Remove section"
                  onClick={() => {
                    store.removeCustomSection(customId);
                    if (editingCustomId === customId) onEditCustomSection(null);
                  }}
                >
                  ✕
                </button>
              ) : (
                <span style={{ width: 22 }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {CUSTOM_SECTION_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              const id = store.addCustomSection(preset);
              onEditCustomSection(id);
            }}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 9px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              color: "var(--text)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + {preset}
          </button>
        ))}
      </div>
      <button
        type="button"
        style={addBtnStyle}
        onClick={() => {
          const id = store.addCustomSection("Custom Section");
          onEditCustomSection(id);
        }}
      >
        + Add custom section
      </button>

      {editingCustom ? (
        <div style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
            Edit: {editingCustom.title || "Custom section"}
          </div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
            Section title
          </label>
          <input
            style={{ ...inputBase, marginBottom: 10 }}
            value={editingCustom.title}
            onChange={(e) => store.setCustomSection(editingCustom.id, "title", e.target.value)}
            placeholder="Certifications"
          />
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>
            Content (one line per bullet)
          </label>
          <textarea
            style={textareaBase}
            value={editingCustom.lines}
            onChange={(e) => store.setCustomSection(editingCustom.id, "lines", e.target.value)}
            placeholder={"AWS Solutions Architect — 2024\nPMP — Project Management Institute"}
          />
        </div>
      ) : null}

      <p style={{ fontSize: 11, color: "var(--dim)", margin: "14px 0 0", lineHeight: 1.45 }}>
        Built-in sections: {Object.values(TB_SECTION_LABELS).join(", ")}. Custom sections import from Analyze when present on your résumé.
      </p>
    </>
  );
}
