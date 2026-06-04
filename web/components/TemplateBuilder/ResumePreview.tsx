"use client";
import { forwardRef } from "react";
import type { TBResumeData } from "./types";
import { renderSectionSlot } from "./renderResumeSections";
import {
  resolveResumeLayout,
  resumeContactStyle,
  resumeNameStyle,
  resumePageRootStyle,
} from "@/lib/resumeLayout";

const ResumePreview = forwardRef<HTMLDivElement, { data: TBResumeData }>(function ResumePreview({ data }, ref) {
  const { profile, customization, sectionOrder, hiddenSections } = data;
  const ctx = resolveResumeLayout({
    stylePreset: customization?.stylePreset,
    pageWidth: customization?.pageWidth,
    font: customization?.font,
    accentColor: customization?.accentColor,
    fontSize: customization?.fontSize,
  });
  const hidden = new Set(hiddenSections ?? []);

  const contactParts = [
    profile.email, profile.phone, profile.location,
    profile.website, profile.linkedin, profile.github,
  ].filter(Boolean);

  return (
    <div ref={ref} style={resumePageRootStyle(ctx)}>
      <div style={resumeNameStyle(ctx)}>
        {profile.name || <span style={{ color: "#bbb" }}>Your Name</span>}
      </div>
      <div style={resumeContactStyle(ctx)}>
        {contactParts.map((c, i) => (
          <span key={i}>{c}{i < contactParts.length - 1 ? " | " : ""}</span>
        ))}
      </div>

      {sectionOrder.map((slot) => {
        if (hidden.has(slot)) return null;
        return <div key={slot}>{renderSectionSlot(slot, data, ctx)}</div>;
      })}
    </div>
  );
});

export default ResumePreview;
