"use client";
import { useEffect, useState, useCallback } from "react";
import { useTemplateBuilderStore } from "@/store/templateBuilderStore";
import ResumePreview from "./ResumePreview";

/* ── Shared style helpers (match ManualResumeForm.tsx) ─── */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--dim)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 80,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {children}
    </div>
  );
}

const sectionHeaderStyle = (open: boolean): React.CSSProperties => ({
  width: "100%",
  background: open ? "var(--surface2)" : "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: open ? 0 : 6,
  borderBottomLeftRadius: open ? 0 : 8,
  borderBottomRightRadius: open ? 0 : 8,
});

const sectionBodyStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderTop: "none",
  borderBottomLeftRadius: 8,
  borderBottomRightRadius: 8,
  background: "var(--surface)",
  padding: "14px 14px 6px",
  marginBottom: 6,
};

const addBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px dashed var(--border)",
  borderRadius: 6,
  color: "var(--accent)",
  fontSize: 12,
  padding: "6px 12px",
  cursor: "pointer",
  width: "100%",
  marginTop: 4,
};

const removeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--red, #ef4444)",
  fontSize: 11,
  cursor: "pointer",
  padding: "2px 6px",
  marginLeft: "auto",
  display: "block",
};

type SectionKey = "profile" | "experience" | "education" | "projects" | "skills";

export default function TemplateBuilderClient() {
  const store = useTemplateBuilderStore();
  const { data, loaded } = store;
  const [openSection, setOpenSection] = useState<SectionKey>("profile");
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Load localStorage on mount (no persist middleware = no SSR issues)
  useEffect(() => {
    store.loadFromStorage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (s: SectionKey) => setOpenSection((prev) => (prev === s ? "profile" : s));

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setDownloadError(null);
    try {
      // Dynamic import — never at module level (prevents build-time Node.js module issues)
      const [{ pdf }, { default: ResumePDFTemplate }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ResumePDFTemplate"),
      ]);
      const blob = await pdf(<ResumePDFTemplate data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.profile.name.replace(/\s+/g, "_") || "resume"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  }, [data]);

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {/* ── Left: Form Panel ─────────────────────────────────────── */}
      <div style={{
        width: 360,
        minWidth: 320,
        flexShrink: 0,
        overflowY: "auto",
        padding: "16px 14px",
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Resume Builder</h2>
          <button
            onClick={store.reset}
            style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            Reset
          </button>
        </div>

        {/* Profile Section */}
        <button style={sectionHeaderStyle(openSection === "profile")} onClick={() => toggle("profile")}>
          <span>Profile</span>
          <span>{openSection === "profile" ? "▲" : "▼"}</span>
        </button>
        {openSection === "profile" && (
          <div style={sectionBodyStyle}>
            <Field label="Full Name">
              <input style={inputStyle} value={data.profile.name}
                onChange={(e) => store.setProfile("name", e.target.value)} placeholder="Jane Smith" />
            </Field>
            <Row>
              <Field label="Email">
                <input style={inputStyle} value={data.profile.email}
                  onChange={(e) => store.setProfile("email", e.target.value)} placeholder="jane@example.com" />
              </Field>
              <Field label="Phone">
                <input style={inputStyle} value={data.profile.phone}
                  onChange={(e) => store.setProfile("phone", e.target.value)} placeholder="(555) 000-0000" />
              </Field>
            </Row>
            <Field label="Location">
              <input style={inputStyle} value={data.profile.location}
                onChange={(e) => store.setProfile("location", e.target.value)} placeholder="San Francisco, CA" />
            </Field>
            <Row>
              <Field label="LinkedIn">
                <input style={inputStyle} value={data.profile.linkedin}
                  onChange={(e) => store.setProfile("linkedin", e.target.value)} placeholder="linkedin.com/in/jane" />
              </Field>
              <Field label="GitHub">
                <input style={inputStyle} value={data.profile.github}
                  onChange={(e) => store.setProfile("github", e.target.value)} placeholder="github.com/jane" />
              </Field>
            </Row>
            <Field label="Professional Summary">
              <textarea style={textareaStyle} value={data.profile.summary}
                onChange={(e) => store.setProfile("summary", e.target.value)}
                placeholder="Brief 2-3 sentence summary..." />
            </Field>
          </div>
        )}

        {/* Experience Section */}
        <button style={sectionHeaderStyle(openSection === "experience")} onClick={() => toggle("experience")}>
          <span>Experience ({data.workExperiences.length})</span>
          <span>{openSection === "experience" ? "▲" : "▼"}</span>
        </button>
        {openSection === "experience" && (
          <div style={sectionBodyStyle}>
            {data.workExperiences.map((w, idx) => (
              <div key={w.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < data.workExperiences.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                    {w.company || `Position ${idx + 1}`}
                  </span>
                  {data.workExperiences.length > 1 && (
                    <button style={removeBtnStyle} onClick={() => store.removeWork(w.id)}>Remove</button>
                  )}
                </div>
                <Row>
                  <Field label="Job Title">
                    <input style={inputStyle} value={w.jobTitle}
                      onChange={(e) => store.setWork(w.id, "jobTitle", e.target.value)} placeholder="Software Engineer" />
                  </Field>
                  <Field label="Company">
                    <input style={inputStyle} value={w.company}
                      onChange={(e) => store.setWork(w.id, "company", e.target.value)} placeholder="Acme Inc." />
                  </Field>
                </Row>
                <Field label="Location">
                  <input style={inputStyle} value={w.location}
                    onChange={(e) => store.setWork(w.id, "location", e.target.value)} placeholder="New York, NY" />
                </Field>
                <Row>
                  <Field label="Start Date">
                    <input style={inputStyle} value={w.startDate}
                      onChange={(e) => store.setWork(w.id, "startDate", e.target.value)} placeholder="Jan 2022" />
                  </Field>
                  <Field label="End Date">
                    <input style={inputStyle} value={w.endDate} disabled={w.current}
                      onChange={(e) => store.setWork(w.id, "endDate", e.target.value)} placeholder="Dec 2023" />
                  </Field>
                </Row>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <input type="checkbox" checked={w.current} id={`current-${w.id}`}
                    onChange={(e) => store.setWork(w.id, "current", e.target.checked)} />
                  <label htmlFor={`current-${w.id}`} style={{ fontSize: 12, color: "var(--dim)" }}>Currently working here</label>
                </div>
                <Field label="Bullet Points (one per line)">
                  <textarea style={textareaStyle} value={w.bullets}
                    onChange={(e) => store.setWork(w.id, "bullets", e.target.value)}
                    placeholder={"• Led team of 5 engineers...\n• Reduced latency by 40%..."} />
                </Field>
              </div>
            ))}
            <button style={addBtnStyle} onClick={store.addWork}>+ Add Position</button>
          </div>
        )}

        {/* Education Section */}
        <button style={sectionHeaderStyle(openSection === "education")} onClick={() => toggle("education")}>
          <span>Education ({data.educations.length})</span>
          <span>{openSection === "education" ? "▲" : "▼"}</span>
        </button>
        {openSection === "education" && (
          <div style={sectionBodyStyle}>
            {data.educations.map((e, idx) => (
              <div key={e.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < data.educations.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{e.school || `School ${idx + 1}`}</span>
                  {data.educations.length > 1 && (
                    <button style={removeBtnStyle} onClick={() => store.removeEducation(e.id)}>Remove</button>
                  )}
                </div>
                <Field label="School / University">
                  <input style={inputStyle} value={e.school}
                    onChange={(ev) => store.setEducation(e.id, "school", ev.target.value)} placeholder="Stanford University" />
                </Field>
                <Field label="Degree">
                  <input style={inputStyle} value={e.degree}
                    onChange={(ev) => store.setEducation(e.id, "degree", ev.target.value)} placeholder="B.S. Computer Science" />
                </Field>
                <Row>
                  <Field label="Start Date">
                    <input style={inputStyle} value={e.startDate}
                      onChange={(ev) => store.setEducation(e.id, "startDate", ev.target.value)} placeholder="Sep 2018" />
                  </Field>
                  <Field label="End Date">
                    <input style={inputStyle} value={e.endDate}
                      onChange={(ev) => store.setEducation(e.id, "endDate", ev.target.value)} placeholder="Jun 2022" />
                  </Field>
                </Row>
                <Row>
                  <Field label="Location">
                    <input style={inputStyle} value={e.location}
                      onChange={(ev) => store.setEducation(e.id, "location", ev.target.value)} placeholder="Stanford, CA" />
                  </Field>
                  <Field label="GPA (optional)">
                    <input style={inputStyle} value={e.gpa}
                      onChange={(ev) => store.setEducation(e.id, "gpa", ev.target.value)} placeholder="3.8" />
                  </Field>
                </Row>
              </div>
            ))}
            <button style={addBtnStyle} onClick={store.addEducation}>+ Add Education</button>
          </div>
        )}

        {/* Projects Section */}
        <button style={sectionHeaderStyle(openSection === "projects")} onClick={() => toggle("projects")}>
          <span>Projects ({data.projects.length})</span>
          <span>{openSection === "projects" ? "▲" : "▼"}</span>
        </button>
        {openSection === "projects" && (
          <div style={sectionBodyStyle}>
            {data.projects.map((p, idx) => (
              <div key={p.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: idx < data.projects.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name || `Project ${idx + 1}`}</span>
                  {data.projects.length > 1 && (
                    <button style={removeBtnStyle} onClick={() => store.removeProject(p.id)}>Remove</button>
                  )}
                </div>
                <Row>
                  <Field label="Project Name">
                    <input style={inputStyle} value={p.name}
                      onChange={(e) => store.setProject(p.id, "name", e.target.value)} placeholder="Open Source Tool" />
                  </Field>
                  <Field label="Date / Period">
                    <input style={inputStyle} value={p.date}
                      onChange={(e) => store.setProject(p.id, "date", e.target.value)} placeholder="2023" />
                  </Field>
                </Row>
                <Field label="Description (one bullet per line)">
                  <textarea style={textareaStyle} value={p.bullets}
                    onChange={(e) => store.setProject(p.id, "bullets", e.target.value)}
                    placeholder={"• Built a tool that...\n• Used React, Node.js..."} />
                </Field>
              </div>
            ))}
            <button style={addBtnStyle} onClick={store.addProject}>+ Add Project</button>
          </div>
        )}

        {/* Skills Section */}
        <button style={sectionHeaderStyle(openSection === "skills")} onClick={() => toggle("skills")}>
          <span>Skills</span>
          <span>{openSection === "skills" ? "▲" : "▼"}</span>
        </button>
        {openSection === "skills" && (
          <div style={sectionBodyStyle}>
            <Field label="Skills (comma-separated or one per line)">
              <textarea style={{ ...textareaStyle, minHeight: 100 }} value={data.skills}
                onChange={(e) => store.setSkills(e.target.value)}
                placeholder={"Languages: Python, TypeScript, Go\nFrameworks: React, FastAPI\nTools: Docker, Postgres"} />
            </Field>
          </div>
        )}
      </div>

      {/* ── Right: Preview Panel ──────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
          gap: 10,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Live preview — updates as you type
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {downloadError && (
              <span style={{ fontSize: 11, color: "var(--red, #ef4444)" }}>{downloadError}</span>
            )}
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              style={{
                background: isGenerating ? "var(--surface3)" : "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.7 : 1,
                transition: "var(--transition)",
              }}
            >
              {isGenerating ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>

        {/* Preview scroll area */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "auto",
          padding: "24px 16px",
          display: "flex",
          justifyContent: "center",
        }}>
          <div style={{ transform: "scale(0.85)", transformOrigin: "top center", minWidth: "8.5in" }}>
            <ResumePreview data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
