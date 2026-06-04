"use client";

import { useRef, useState } from "react";
import type { TemplateBuilderStore } from "@/store/templateBuilderStore";
import {
  TB_SECTION_LABELS,
  type TBContentSection,
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
  gridTemplateColumns: "22px 1fr auto auto",
  alignItems: "center",
  gap: 8,
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

export default function TemplateBuilderSectionsPanel({
  store,
  sectionOrder,
  hiddenSections,
  onEditSection,
}: {
  store: TemplateBuilderStore;
  sectionOrder: TBContentSection[];
  hiddenSections: TBContentSection[];
  onEditSection: (tab: EditTab) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const hidden = new Set(hiddenSections);

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>
        Section order
      </h3>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
        Drag rows to reorder sections in the preview and PDF. Name and contact always stay at the top.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sectionOrder.map((section, idx) => {
          const isHidden = hidden.has(section);
          const over = dragOver === idx;
          return (
            <div
              key={section}
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
                borderColor: over ? "var(--accent)" : "var(--border)",
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
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {TB_SECTION_LABELS[section]}
              </span>
              <button
                type="button"
                style={iconBtn}
                title={isHidden ? "Show in preview" : "Hide from preview"}
                onClick={() => store.toggleSectionHidden(section)}
              >
                {isHidden ? "👁‍🗨" : "👁"}
              </button>
              <button
                type="button"
                style={iconBtn}
                title="Edit section fields"
                onClick={() => onEditSection(SECTION_EDIT_TAB[section])}
              >
                ✎
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--dim)", margin: "14px 0 0", lineHeight: 1.45 }}>
        Hidden sections keep your data — turn them back on anytime.
      </p>
    </>
  );
}
