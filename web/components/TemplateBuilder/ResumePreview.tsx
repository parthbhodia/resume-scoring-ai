"use client";
import type { TBResumeData, TBFont } from "./types";

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

const FONT_STACK: Record<TBFont, string> = {
  "Helvetica": "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "Times-Roman": "'Times New Roman', Georgia, serif",
  "Courier": "'Courier New', Courier, monospace",
};

export default function ResumePreview({ data }: { data: TBResumeData }) {
  const { profile, workExperiences, educations, projects, skills, customization } = data;
  const font = customization?.font ?? "Helvetica";
  const accent = customization?.accentColor ?? "#1a1a1a";
  const fontStack = FONT_STACK[font] ?? FONT_STACK["Helvetica"];

  const PAGE: React.CSSProperties = {
    background: "#ffffff",
    color: "#1a1a1a",
    fontFamily: fontStack,
    fontSize: 10.5,
    lineHeight: 1.45,
    padding: "36px 48px",
    minHeight: "11in",
    width: "8.5in",
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: "0 2px 16px rgba(0,0,0,0.18)",
    margin: "0 auto",
  };

  const SECTION_TITLE: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: accent,
    borderBottom: `0.5px solid ${accent}`,
    paddingBottom: 2,
    marginBottom: 6,
    marginTop: 12,
  };

  const JOB_ROW: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
  };
  const NAME: React.CSSProperties = {
    fontSize: 22, fontWeight: 700, letterSpacing: 0.3, marginBottom: 3, color: "#111",
  };
  const CONTACT: React.CSSProperties = {
    fontSize: 9.5, color: "#555", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 4,
  };
  const JOB_TITLE: React.CSSProperties = { fontWeight: 700, fontSize: 10.5 };
  const META: React.CSSProperties = { fontSize: 9.5, color: "#666" };
  const BULLET: React.CSSProperties = { fontSize: 9.5, marginLeft: 12, marginBottom: 2, color: "#222" };
  const SUMMARY: React.CSSProperties = { fontSize: 9.5, color: "#333", lineHeight: 1.55, margin: 0 };
  const META_SMALL: React.CSSProperties = { fontSize: 9, color: "#666" };

  const contactParts = [
    profile.email, profile.phone, profile.location,
    profile.website, profile.linkedin, profile.github,
  ].filter(Boolean);

  const featuredWithSkill = skills.featuredSkills.filter((f) => f.skill.trim());

  return (
    <div style={PAGE}>
      {/* Header */}
      <div style={NAME}>{profile.name || <span style={{ color: "#bbb" }}>Your Name</span>}</div>
      <div style={CONTACT}>
        {contactParts.map((c, i) => (
          <span key={i}>{c}{i < contactParts.length - 1 ? " | " : ""}</span>
        ))}
      </div>

      {/* Summary */}
      {profile.summary && (
        <>
          <div style={SECTION_TITLE}>Summary</div>
          <p style={SUMMARY}>{profile.summary}</p>
        </>
      )}

      {/* Experience */}
      {workExperiences.some((w) => w.company || w.jobTitle) && (
        <>
          <div style={SECTION_TITLE}>Experience</div>
          {workExperiences.filter((w) => w.company || w.jobTitle).map((w) => {
            const dateStr = [w.startDate, w.current ? "Present" : w.endDate].filter(Boolean).join(" – ");
            const bullets = parseBullets(w.bullets);
            return (
              <div key={w.id} style={{ marginBottom: 8 }}>
                <div style={JOB_ROW}>
                  <span style={JOB_TITLE}>{w.jobTitle || "Job Title"}</span>
                  <span style={META}>{dateStr}</span>
                </div>
                <div style={JOB_ROW}>
                  <span style={{ fontSize: 10, color: "#333" }}>{w.company}</span>
                  {w.location && <span style={META}>{w.location}</span>}
                </div>
                {bullets.map((b, i) => <div key={i} style={BULLET}>• {b}</div>)}
              </div>
            );
          })}
        </>
      )}

      {/* Education */}
      {educations.some((e) => e.school || e.degree) && (
        <>
          <div style={SECTION_TITLE}>Education</div>
          {educations.filter((e) => e.school || e.degree).map((e) => {
            const dateStr = [e.startDate, e.endDate].filter(Boolean).join(" – ");
            return (
              <div key={e.id} style={{ marginBottom: 6 }}>
                <div style={JOB_ROW}>
                  <span style={JOB_TITLE}>{e.school || "School"}</span>
                  <span style={META}>{dateStr}</span>
                </div>
                <div style={JOB_ROW}>
                  <span style={{ fontSize: 10, color: "#333" }}>{e.degree}</span>
                  {e.gpa && <span style={META}>GPA: {e.gpa}</span>}
                </div>
                {e.location && <div style={META_SMALL}>{e.location}</div>}
                {e.coursework && <div style={META_SMALL}>Coursework: {e.coursework}</div>}
              </div>
            );
          })}
        </>
      )}

      {/* Projects */}
      {projects.some((p) => p.name) && (
        <>
          <div style={SECTION_TITLE}>Projects</div>
          {projects.filter((p) => p.name).map((p) => {
            const bullets = parseBullets(p.bullets);
            return (
              <div key={p.id} style={{ marginBottom: 6 }}>
                <div style={JOB_ROW}>
                  <span style={JOB_TITLE}>
                    {p.name}{p.tech ? <span style={{ fontWeight: 400, color: "#444" }}> | {p.tech}</span> : ""}
                  </span>
                  {p.date && <span style={META}>{p.date}</span>}
                </div>
                {p.link && <div style={META_SMALL}>{p.link}</div>}
                {bullets.map((b, i) => <div key={i} style={BULLET}>• {b}</div>)}
              </div>
            );
          })}
        </>
      )}

      {/* Skills */}
      {(featuredWithSkill.length > 0 || skills.descriptions.trim()) && (
        <>
          <div style={SECTION_TITLE}>Skills</div>

          {/* Featured skills — 3-column grid */}
          {featuredWithSkill.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px 16px", marginBottom: 6 }}>
              {featuredWithSkill.map((fs, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: "#222" }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fs.skill}
                  </span>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {Array.from({ length: 5 }, (_, ci) => (
                      <div key={ci} style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: ci < fs.rating ? accent : "#d9d9d9",
                        flexShrink: 0,
                      }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Category description lines */}
          {skills.descriptions.trim() && (
            <div style={{ fontSize: 9.5, color: "#333", lineHeight: 1.6 }}>
              {skills.descriptions.split("\n").filter(Boolean).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
