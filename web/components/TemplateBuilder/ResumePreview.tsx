"use client";
import { forwardRef } from "react";
import type { TBResumeData } from "./types";
import {
  resolveResumeLayout,
  resumeBulletStyle,
  resumeCompanyLineStyle,
  resumeContactStyle,
  resumeEntryBlockStyle,
  resumeJobRowStyle,
  resumeJobTitleStyle,
  resumeMetaSmallStyle,
  resumeMetaStyle,
  resumeNameStyle,
  resumePageRootStyle,
  resumeSecondaryEntryBlockStyle,
  resumeSectionTitleStyle,
  resumeSkillsGridStyle,
  resumeSkillsTextStyle,
  resumeSummaryStyle,
} from "@/lib/resumeLayout";

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

const ResumePreview = forwardRef<HTMLDivElement, { data: TBResumeData }>(function ResumePreview({ data }, ref) {
  const { profile, workExperiences, educations, projects, skills, customization } = data;
  const ctx = resolveResumeLayout({
    stylePreset: customization?.stylePreset,
    pageWidth: customization?.pageWidth,
    font: customization?.font,
    accentColor: customization?.accentColor,
  });
  const { preset } = ctx;

  const contactParts = [
    profile.email, profile.phone, profile.location,
    profile.website, profile.linkedin, profile.github,
  ].filter(Boolean);

  const featuredWithSkill = skills.featuredSkills.filter((f) => f.skill.trim());

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

      {profile.summary && (
        <>
          <div style={resumeSectionTitleStyle(ctx)}>Summary</div>
          <p style={resumeSummaryStyle(ctx)}>{profile.summary}</p>
        </>
      )}

      {workExperiences.some((w) => w.company || w.jobTitle) && (
        <>
          <div style={resumeSectionTitleStyle(ctx)}>Experience</div>
          {workExperiences.filter((w) => w.company || w.jobTitle).map((w) => {
            const dateStr = [w.startDate, w.current ? "Present" : w.endDate].filter(Boolean).join(" – ");
            const bullets = parseBullets(w.bullets);
            return (
              <div key={w.id} style={resumeEntryBlockStyle(ctx)}>
                <div style={resumeJobRowStyle()}>
                  <span style={resumeJobTitleStyle(ctx)}>{w.jobTitle || "Job Title"}</span>
                  <span style={resumeMetaStyle(ctx)}>{dateStr}</span>
                </div>
                <div style={resumeJobRowStyle()}>
                  <span style={resumeCompanyLineStyle(ctx)}>{w.company}</span>
                  {w.location && <span style={resumeMetaStyle(ctx)}>{w.location}</span>}
                </div>
                {bullets.map((b, i) => <div key={i} style={resumeBulletStyle(ctx)}>• {b}</div>)}
              </div>
            );
          })}
        </>
      )}

      {educations.some((e) => e.school || e.degree) && (
        <>
          <div style={resumeSectionTitleStyle(ctx)}>Education</div>
          {educations.filter((e) => e.school || e.degree).map((e) => {
            const dateStr = [e.startDate, e.endDate].filter(Boolean).join(" – ");
            return (
              <div key={e.id} style={resumeSecondaryEntryBlockStyle(ctx)}>
                <div style={resumeJobRowStyle()}>
                  <span style={resumeJobTitleStyle(ctx)}>{e.school || "School"}</span>
                  <span style={resumeMetaStyle(ctx)}>{dateStr}</span>
                </div>
                <div style={resumeJobRowStyle()}>
                  <span style={resumeCompanyLineStyle(ctx)}>{e.degree}</span>
                  {e.gpa && <span style={resumeMetaStyle(ctx)}>GPA: {e.gpa}</span>}
                </div>
                {e.location && <div style={resumeMetaSmallStyle(ctx)}>{e.location}</div>}
                {e.coursework && <div style={resumeMetaSmallStyle(ctx)}>Coursework: {e.coursework}</div>}
              </div>
            );
          })}
        </>
      )}

      {projects.some((p) => p.name) && (
        <>
          <div style={resumeSectionTitleStyle(ctx)}>Projects</div>
          {projects.filter((p) => p.name).map((p) => {
            const bullets = parseBullets(p.bullets);
            return (
              <div key={p.id} style={resumeSecondaryEntryBlockStyle(ctx)}>
                <div style={resumeJobRowStyle()}>
                  <span style={resumeJobTitleStyle(ctx)}>
                    {p.name}{p.tech ? <span style={{ fontWeight: 400, color: "#444" }}> | {p.tech}</span> : ""}
                  </span>
                  {p.date && <span style={resumeMetaStyle(ctx)}>{p.date}</span>}
                </div>
                {p.link && <div style={resumeMetaSmallStyle(ctx)}>{p.link}</div>}
                {bullets.map((b, i) => <div key={i} style={resumeBulletStyle(ctx)}>• {b}</div>)}
              </div>
            );
          })}
        </>
      )}

      {(featuredWithSkill.length > 0 || skills.descriptions.trim()) && (
        <>
          <div style={resumeSectionTitleStyle(ctx)}>Skills</div>
          {featuredWithSkill.length > 0 && (
            <div style={resumeSkillsGridStyle()}>
              {featuredWithSkill.map((fs, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: preset.bodyFont, color: "#222" }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fs.skill}
                  </span>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {Array.from({ length: 5 }, (_, ci) => (
                      <div key={ci} style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: ci < fs.rating ? ctx.accent : "#d9d9d9",
                        flexShrink: 0,
                      }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {skills.descriptions.trim() && (
            <div style={resumeSkillsTextStyle(ctx)}>
              {skills.descriptions.split("\n").filter(Boolean).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default ResumePreview;
