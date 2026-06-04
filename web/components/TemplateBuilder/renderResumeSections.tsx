import type { ReactNode } from "react";
import type { TBResumeData, TBContentSection } from "./types";
import type { ResumeLayoutContext } from "@/lib/resumeLayout";
import {
  resumeBulletStyle,
  resumeCompanyLineStyle,
  resumeEntryBlockStyle,
  resumeJobRowStyle,
  resumeJobTitleStyle,
  resumeMetaSmallStyle,
  resumeMetaStyle,
  resumeSectionTitleStyle,
  resumeSecondaryEntryBlockStyle,
  resumeSkillsGridStyle,
  resumeSkillsTextStyle,
  resumeSummaryStyle,
} from "@/lib/resumeLayout";

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

export function renderTbContentSection(
  section: TBContentSection,
  data: TBResumeData,
  ctx: ResumeLayoutContext,
): ReactNode {
  const { profile, workExperiences, educations, projects, skills } = data;
  const { preset } = ctx;

  switch (section) {
    case "summary":
      if (!profile.summary.trim()) return null;
      return (
        <>
          <div style={resumeSectionTitleStyle(ctx)}>Summary</div>
          <p style={resumeSummaryStyle(ctx)}>{profile.summary}</p>
        </>
      );
    case "experience":
      if (!workExperiences.some((w) => w.company || w.jobTitle)) return null;
      return (
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
      );
    case "education":
      if (!educations.some((e) => e.school || e.degree)) return null;
      return (
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
      );
    case "projects":
      if (!projects.some((p) => p.name)) return null;
      return (
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
      );
    case "skills": {
      const featuredWithSkill = skills.featuredSkills.filter((f) => f.skill.trim());
      if (!featuredWithSkill.length && !skills.descriptions.trim()) return null;
      return (
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
      );
    }
    default:
      return null;
  }
}
