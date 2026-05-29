"use client";
import type { TBResumeData } from "./types";

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

const PAGE: React.CSSProperties = {
  background: "#ffffff",
  color: "#1a1a1a",
  fontFamily: "'Times New Roman', Georgia, serif",
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

const NAME: React.CSSProperties = {
  fontSize: 22, fontWeight: 700, letterSpacing: 0.3, marginBottom: 3, color: "#111",
};
const CONTACT: React.CSSProperties = {
  fontSize: 9.5, color: "#555", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 4,
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
  color: "#333", borderBottom: "0.5px solid #999", paddingBottom: 2, marginBottom: 6, marginTop: 12,
};
const JOB_ROW: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline",
};
const JOB_TITLE: React.CSSProperties = { fontWeight: 700, fontSize: 10.5 };
const META: React.CSSProperties = { fontSize: 9.5, color: "#666" };
const BULLET: React.CSSProperties = { fontSize: 9.5, marginLeft: 12, marginBottom: 2, color: "#222" };
const SUMMARY: React.CSSProperties = { fontSize: 9.5, color: "#333", lineHeight: 1.55 };

export default function ResumePreview({ data }: { data: TBResumeData }) {
  const { profile, workExperiences, educations, projects, skills } = data;
  const contactParts = [
    profile.email, profile.phone, profile.location, profile.linkedin, profile.github,
  ].filter(Boolean);

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
                {e.location && <span style={{ fontSize: 9, color: "#666" }}>{e.location}</span>}
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
                  <span style={JOB_TITLE}>{p.name}</span>
                  {p.date && <span style={META}>{p.date}</span>}
                </div>
                {bullets.map((b, i) => <div key={i} style={BULLET}>• {b}</div>)}
              </div>
            );
          })}
        </>
      )}

      {/* Skills */}
      {skills.trim() && (
        <>
          <div style={SECTION_TITLE}>Skills</div>
          <div style={{ fontSize: 9.5, color: "#333", lineHeight: 1.6 }}>{skills}</div>
        </>
      )}
    </div>
  );
}
