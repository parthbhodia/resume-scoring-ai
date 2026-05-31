"use client";
import { useEffect, useState, useCallback } from "react";
import { useTemplateBuilderStore } from "@/store/templateBuilderStore";
import type { TemplateBuilderStore } from "@/store/templateBuilderStore";
import ResumePreview from "./ResumePreview";
import type { TBFont } from "./types";
import { apiUrl } from "@/lib/utils";

/* ── Shared style helpers ──────────────────────────────────────── */
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
  outline: "none",
  transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 4,
};

const textareaBase: React.CSSProperties = {
  ...inputBase,
  resize: "vertical",
  minHeight: 84,
  lineHeight: 1.5,
};

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: half ? "1 1 0" : "none" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>{children}</div>;
}

function FieldWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}>{children}</div>;
}

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
  marginTop: 6,
  transition: "border-color 0.15s, background 0.15s",
};

const removeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--muted)",
  fontSize: 11,
  cursor: "pointer",
  padding: "2px 4px",
  borderRadius: 4,
};

const dividerStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--border)",
  margin: "14px 0",
};

const ENTRY_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text)",
  letterSpacing: 0.1,
};

/* ── AI-enhanced textarea ──────────────────────────────────────── */
function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

interface AITextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  type: "bullets" | "summary";
  context?: { role?: string; company?: string };
  onEnhanced: (text: string) => void;
}

function AITextarea({ type, context, onEnhanced, value, style, ...rest }: AITextareaProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoVal, setUndoVal] = useState<string | null>(null);
  const wordCount = countWords(String(value ?? ""));
  const showBtn = wordCount >= 8;

  const enhance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/tb-enhance"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(value ?? ""), type, context: context ?? {} }),
      });
      const data = await res.json();
      if (!res.ok || !data.enhanced) throw new Error(data.error || "AI error");
      setUndoVal(String(value ?? ""));
      onEnhanced(data.enhanced);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [value, type, context, onEnhanced]);

  const undo = useCallback(() => {
    if (undoVal !== null) {
      onEnhanced(undoVal);
      setUndoVal(null);
    }
  }, [undoVal, onEnhanced]);

  return (
    <div style={{ position: "relative" }}>
      <textarea
        value={value}
        style={{ ...textareaBase, ...style as React.CSSProperties, paddingBottom: showBtn ? 36 : undefined }}
        {...rest}
      />
      {showBtn && (
        <div style={{
          position: "absolute",
          bottom: 7,
          right: 8,
          display: "flex",
          gap: 5,
          alignItems: "center",
        }}>
          {error && (
            <span style={{ fontSize: 10, color: "var(--red, #ef4444)", maxWidth: 140, textAlign: "right" }}>{error}</span>
          )}
          {undoVal !== null && !loading && (
            <button
              type="button"
              onClick={undo}
              title="Undo AI enhancement"
              style={{
                fontSize: 10, color: "var(--muted)", background: "var(--surface2)",
                border: "1px solid var(--border)", borderRadius: 5, padding: "3px 7px",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >↩ Undo</button>
          )}
          <button
            type="button"
            onClick={enhance}
            disabled={loading}
            title="Enhance with AI (ATS-optimized)"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600,
              color: loading ? "var(--muted)" : "#fff",
              background: loading ? "var(--surface2)" : "var(--accent)",
              border: "none", borderRadius: 5,
              padding: "4px 9px", cursor: loading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", transition: "background 0.15s",
            }}
          >
            {loading
              ? <><span style={{ width: 10, height: 10, border: "1.5px solid var(--border)", borderTopColor: "var(--muted)", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Enhancing…</>
              : <>✦ AI Enhance</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Customization constants ───────────────────────────────────── */
const ACCENT_PRESETS = [
  { label: "Charcoal", value: "#1a1a1a" },
  { label: "Navy",     value: "#1e3a5f" },
  { label: "Forest",   value: "#1a4731" },
  { label: "Burgundy", value: "#6b2737" },
  { label: "Steel",    value: "#2d5986" },
  { label: "Slate",    value: "#475569" },
  { label: "Plum",     value: "#5b2d8e" },
  { label: "Teal",     value: "#0f5561" },
];

const FONT_OPTIONS: { label: string; value: TBFont; sub: string }[] = [
  { label: "Helvetica", value: "Helvetica",   sub: "Modern & clean" },
  { label: "Times Roman", value: "Times-Roman", sub: "Classic serif" },
  { label: "Courier", value: "Courier",     sub: "Technical / developer" },
];

type SectionKey = "profile" | "experience" | "education" | "projects" | "skills" | "customize";

const TABS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "profile",    label: "Profile",    icon: "👤" },
  { key: "experience", label: "Experience", icon: "💼" },
  { key: "education",  label: "Education",  icon: "🎓" },
  { key: "projects",   label: "Projects",   icon: "🚀" },
  { key: "skills",     label: "Skills",     icon: "⚡" },
  { key: "customize",  label: "Style",      icon: "🎨" },
];

export default function TemplateBuilderClient() {
  const store = useTemplateBuilderStore();
  const { data, loaded } = store;
  const [activeTab, setActiveTab] = useState<SectionKey>("profile");
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    store.loadFromStorage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setDownloadError(null);
    try {
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
        <div style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const c = data.customization;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        height: 52,
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        flexShrink: 0,
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: -0.3 }}>
            Resume Builder
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", padding: "2px 7px", border: "1px solid var(--border)", borderRadius: 10 }}>
            Free
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={store.reset}
            title="Restore example resume"
            style={{ fontSize: 12, color: "var(--muted)", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 11px", cursor: "pointer" }}
          >
            Load Example
          </button>
          {downloadError && (
            <span style={{ fontSize: 11, color: "var(--red, #ef4444)", maxWidth: 200 }}>{downloadError}</span>
          )}
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            style={{
              background: isGenerating ? "var(--surface3)" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: isGenerating ? "not-allowed" : "pointer",
              opacity: isGenerating ? 0.7 : 1,
              transition: "opacity 0.15s",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {isGenerating ? (
              <>
                <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                Generating…
              </>
            ) : "↓ Download PDF"}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* ── Left: Form Panel ──────────────────────────────── */}
        <div style={{
          width: 340,
          minWidth: 300,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          overflow: "hidden",
        }}>
          {/* Section Tabs */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0,
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: activeTab === tab.key ? "var(--bg)" : "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                  borderRight: "1px solid var(--border)",
                  padding: "10px 4px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  transition: "background 0.12s",
                  color: activeTab === tab.key ? "var(--accent)" : "var(--muted)",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 15 }}>{tab.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Section Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 32px" }}>
            {activeTab === "profile" && (
              <ProfileSection store={store} data={data} />
            )}
            {activeTab === "experience" && (
              <ExperienceSection store={store} data={data} />
            )}
            {activeTab === "education" && (
              <EducationSection store={store} data={data} />
            )}
            {activeTab === "projects" && (
              <ProjectsSection store={store} data={data} />
            )}
            {activeTab === "skills" && (
              <SkillsSection store={store} data={data} />
            )}
            {activeTab === "customize" && (
              <CustomizeSection store={store} data={data} c={c} />
            )}
          </div>
        </div>

        {/* ── Right: Preview Panel ──────────────────────────── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "var(--surface2)",
          overflow: "hidden",
        }}>
          <div style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "auto",
            padding: "28px 20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}>
            <div style={{ transform: "scale(0.82)", transformOrigin: "top center", minWidth: "8.5in" }}>
              <ResumePreview data={data} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section sub-components ────────────────────────────────────── */

type StoreType = TemplateBuilderStore;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 14px", letterSpacing: -0.1 }}>
      {children}
    </h3>
  );
}

function ProfileSection({ store, data }: { store: StoreType; data: StoreType["data"] }) {
  const p = data.profile;
  return (
    <>
      <SectionHeading>Personal Info</SectionHeading>
      <FieldWrap>
        <Field label="Full Name">
          <input style={inputBase} value={p.name}
            onChange={(e) => store.setProfile("name", e.target.value)} placeholder="Jane Smith" />
        </Field>
      </FieldWrap>
      <Row>
        <Field label="Email" half>
          <input style={inputBase} value={p.email} type="email"
            onChange={(e) => store.setProfile("email", e.target.value)} placeholder="jane@example.com" />
        </Field>
        <Field label="Phone" half>
          <input style={inputBase} value={p.phone}
            onChange={(e) => store.setProfile("phone", e.target.value)} placeholder="(555) 000-0000" />
        </Field>
      </Row>
      <Row>
        <Field label="Location" half>
          <input style={inputBase} value={p.location}
            onChange={(e) => store.setProfile("location", e.target.value)} placeholder="San Francisco, CA" />
        </Field>
        <Field label="Website" half>
          <input style={inputBase} value={p.website}
            onChange={(e) => store.setProfile("website", e.target.value)} placeholder="yoursite.dev" />
        </Field>
      </Row>
      <Row>
        <Field label="LinkedIn" half>
          <input style={inputBase} value={p.linkedin}
            onChange={(e) => store.setProfile("linkedin", e.target.value)} placeholder="linkedin.com/in/jane" />
        </Field>
        <Field label="GitHub" half>
          <input style={inputBase} value={p.github}
            onChange={(e) => store.setProfile("github", e.target.value)} placeholder="github.com/jane" />
        </Field>
      </Row>
      <FieldWrap>
        <Field label="Professional Summary">
          <AITextarea
            type="summary"
            value={p.summary}
            onChange={(e) => store.setProfile("summary", e.target.value)}
            onEnhanced={(v) => store.setProfile("summary", v)}
            placeholder="Brief 2–3 sentence summary of your experience and goals..."
          />
        </Field>
      </FieldWrap>
    </>
  );
}

function ExperienceSection({ store, data }: { store: StoreType; data: StoreType["data"] }) {
  return (
    <>
      <SectionHeading>Work Experience</SectionHeading>
      {data.workExperiences.map((w, idx) => (
        <div key={w.id}>
          {idx > 0 && <hr style={dividerStyle} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={ENTRY_LABEL_STYLE}>{w.company || w.jobTitle || `Position ${idx + 1}`}</span>
            {data.workExperiences.length > 1 && (
              <button style={removeBtnStyle} onClick={() => store.removeWork(w.id)}>✕ Remove</button>
            )}
          </div>
          <Row>
            <Field label="Job Title" half>
              <input style={inputBase} value={w.jobTitle}
                onChange={(e) => store.setWork(w.id, "jobTitle", e.target.value)} placeholder="Software Engineer" />
            </Field>
            <Field label="Company" half>
              <input style={inputBase} value={w.company}
                onChange={(e) => store.setWork(w.id, "company", e.target.value)} placeholder="Acme Inc." />
            </Field>
          </Row>
          <FieldWrap>
            <Field label="Location">
              <input style={inputBase} value={w.location}
                onChange={(e) => store.setWork(w.id, "location", e.target.value)} placeholder="New York, NY" />
            </Field>
          </FieldWrap>
          <Row>
            <Field label="Start Date" half>
              <input style={inputBase} value={w.startDate}
                onChange={(e) => store.setWork(w.id, "startDate", e.target.value)} placeholder="Jan 2022" />
            </Field>
            <Field label="End Date" half>
              <input style={{ ...inputBase, opacity: w.current ? 0.45 : 1 }} value={w.endDate} disabled={w.current}
                onChange={(e) => store.setWork(w.id, "endDate", e.target.value)} placeholder="Dec 2023" />
            </Field>
          </Row>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <input type="checkbox" checked={w.current} id={`cur-${w.id}`}
              onChange={(e) => store.setWork(w.id, "current", e.target.checked)}
              style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
            <label htmlFor={`cur-${w.id}`} style={{ fontSize: 12, color: "var(--dim)", cursor: "pointer" }}>
              Currently working here
            </label>
          </div>
          <FieldWrap>
            <Field label="Key Achievements (one bullet per line)">
              <AITextarea
                type="bullets"
                context={{ role: w.jobTitle, company: w.company }}
                value={w.bullets}
                onChange={(e) => store.setWork(w.id, "bullets", e.target.value)}
                onEnhanced={(v) => store.setWork(w.id, "bullets", v)}
                placeholder={"• Led team of 5 engineers to ship feature X\n• Reduced latency by 40% via caching"}
              />
            </Field>
          </FieldWrap>
        </div>
      ))}
      <button style={addBtnStyle} onClick={store.addWork}>+ Add Position</button>
    </>
  );
}

function EducationSection({ store, data }: { store: StoreType; data: StoreType["data"] }) {
  return (
    <>
      <SectionHeading>Education</SectionHeading>
      {data.educations.map((e, idx) => (
        <div key={e.id}>
          {idx > 0 && <hr style={dividerStyle} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={ENTRY_LABEL_STYLE}>{e.school || `School ${idx + 1}`}</span>
            {data.educations.length > 1 && (
              <button style={removeBtnStyle} onClick={() => store.removeEducation(e.id)}>✕ Remove</button>
            )}
          </div>
          <FieldWrap>
            <Field label="School / University">
              <input style={inputBase} value={e.school}
                onChange={(ev) => store.setEducation(e.id, "school", ev.target.value)} placeholder="Stanford University" />
            </Field>
          </FieldWrap>
          <FieldWrap>
            <Field label="Degree">
              <input style={inputBase} value={e.degree}
                onChange={(ev) => store.setEducation(e.id, "degree", ev.target.value)} placeholder="B.S. Computer Science" />
            </Field>
          </FieldWrap>
          <Row>
            <Field label="Start Date" half>
              <input style={inputBase} value={e.startDate}
                onChange={(ev) => store.setEducation(e.id, "startDate", ev.target.value)} placeholder="Sep 2018" />
            </Field>
            <Field label="End Date" half>
              <input style={inputBase} value={e.endDate}
                onChange={(ev) => store.setEducation(e.id, "endDate", ev.target.value)} placeholder="Jun 2022" />
            </Field>
          </Row>
          <Row>
            <Field label="Location" half>
              <input style={inputBase} value={e.location}
                onChange={(ev) => store.setEducation(e.id, "location", ev.target.value)} placeholder="Stanford, CA" />
            </Field>
            <Field label="GPA" half>
              <input style={inputBase} value={e.gpa}
                onChange={(ev) => store.setEducation(e.id, "gpa", ev.target.value)} placeholder="3.8" />
            </Field>
          </Row>
          <FieldWrap>
            <Field label="Relevant Coursework">
              <input style={inputBase} value={e.coursework}
                onChange={(ev) => store.setEducation(e.id, "coursework", ev.target.value)}
                placeholder="Algorithms, Distributed Systems, ML" />
            </Field>
          </FieldWrap>
        </div>
      ))}
      <button style={addBtnStyle} onClick={store.addEducation}>+ Add Education</button>
    </>
  );
}

function ProjectsSection({ store, data }: { store: StoreType; data: StoreType["data"] }) {
  return (
    <>
      <SectionHeading>Projects</SectionHeading>
      {data.projects.map((p, idx) => (
        <div key={p.id}>
          {idx > 0 && <hr style={dividerStyle} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={ENTRY_LABEL_STYLE}>{p.name || `Project ${idx + 1}`}</span>
            {data.projects.length > 1 && (
              <button style={removeBtnStyle} onClick={() => store.removeProject(p.id)}>✕ Remove</button>
            )}
          </div>
          <Row>
            <Field label="Project Name" half>
              <input style={inputBase} value={p.name}
                onChange={(e) => store.setProject(p.id, "name", e.target.value)} placeholder="My SaaS Tool" />
            </Field>
            <Field label="Year / Date" half>
              <input style={inputBase} value={p.date}
                onChange={(e) => store.setProject(p.id, "date", e.target.value)} placeholder="2024" />
            </Field>
          </Row>
          <FieldWrap>
            <Field label="Tech Stack">
              <input style={inputBase} value={p.tech}
                onChange={(e) => store.setProject(p.id, "tech", e.target.value)} placeholder="React, Python, PostgreSQL" />
            </Field>
          </FieldWrap>
          <FieldWrap>
            <Field label="Link">
              <input style={inputBase} value={p.link}
                onChange={(e) => store.setProject(p.id, "link", e.target.value)} placeholder="github.com/you/project" />
            </Field>
          </FieldWrap>
          <FieldWrap>
            <Field label="Description (one bullet per line)">
              <AITextarea
                type="bullets"
                context={{ role: p.name }}
                value={p.bullets}
                onChange={(e) => store.setProject(p.id, "bullets", e.target.value)}
                onEnhanced={(v) => store.setProject(p.id, "bullets", v)}
                placeholder={"• Built a tool that...\n• Achieved X by doing Y..."}
              />
            </Field>
          </FieldWrap>
        </div>
      ))}
      <button style={addBtnStyle} onClick={store.addProject}>+ Add Project</button>
    </>
  );
}

function SkillsSection({ store, data }: { store: StoreType; data: StoreType["data"] }) {
  const { featuredSkills, descriptions } = data.skills;
  return (
    <>
      <SectionHeading>Skills</SectionHeading>

      {/* Featured skills with proficiency circles */}
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
        Featured skills — shown with proficiency dots in the résumé.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 20 }}>
        {featuredSkills.map((fs, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              style={{ ...inputBase, flex: 1, fontSize: 12 }}
              placeholder={`Skill ${idx + 1}`}
              value={fs.skill}
              onChange={(e) => store.setFeaturedSkill(idx, e.target.value, fs.rating)}
            />
            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              {Array.from({ length: 5 }, (_, ci) => (
                <button
                  key={ci}
                  title={`${ci + 1} / 5`}
                  onClick={() => store.setFeaturedSkill(idx, fs.skill, ci + 1 === fs.rating ? 0 : ci + 1)}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    flexShrink: 0,
                    background: ci < fs.rating ? "var(--accent)" : "var(--border)",
                    transition: "background 0.1s",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Category description lines */}
      <label style={labelStyle}>Skill categories</label>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
        One category per line, e.g. "Languages: Python, Go"
      </p>
      <textarea
        style={{ ...textareaBase, minHeight: 120 }}
        value={descriptions}
        onChange={(e) => store.setSkillDescriptions(e.target.value)}
        placeholder={"Languages: Python, TypeScript, Go\nFrontend: React, Next.js, Tailwind\nBackend: Node.js, FastAPI, PostgreSQL\nCloud: AWS, Docker, Kubernetes"}
      />
    </>
  );
}

function CustomizeSection({ store, c, data }: { store: StoreType; c: StoreType["data"]["customization"]; data: StoreType["data"] }) {
  return (
    <>
      <SectionHeading>Style & Customization</SectionHeading>

      {/* Font */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Font</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.value}
              onClick={() => store.setCustomization("font", f.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 13px",
                borderRadius: 7,
                border: c.font === f.value ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: c.font === f.value ? "color-mix(in srgb, var(--accent) 8%, var(--bg))" : "var(--bg)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 6,
                background: "var(--surface2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, flexShrink: 0,
                fontFamily: f.value === "Times-Roman" ? "'Times New Roman', serif" : f.value === "Courier" ? "'Courier New', monospace" : "Helvetica, Arial, sans-serif",
                color: c.font === f.value ? "var(--accent)" : "var(--text)",
              }}>Aa</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{f.label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{f.sub}</div>
              </div>
              {c.font === f.value && (
                <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Accent Color</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.value}
              title={p.label}
              onClick={() => store.setCustomization("accentColor", p.value)}
              style={{
                width: 32, height: 32,
                borderRadius: 8,
                background: p.value,
                border: c.accentColor === p.value ? "3px solid var(--text)" : "2px solid transparent",
                boxShadow: c.accentColor === p.value ? "0 0 0 2px var(--bg)" : "none",
                cursor: "pointer",
                padding: 0,
                transition: "border 0.12s, box-shadow 0.12s",
                position: "relative",
              }}
            >
              {c.accentColor === p.value && (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>✓</span>
              )}
            </button>
          ))}
          {/* Custom color picker */}
          <label title="Custom color" style={{ position: "relative", cursor: "pointer", display: "block" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              border: "2px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "#fff", fontWeight: 700, lineHeight: 1,
            }}>+</div>
            <input
              type="color"
              value={c.accentColor}
              onChange={(e) => store.setCustomization("accentColor", e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: c.accentColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{c.accentColor}</span>
        </div>
      </div>

      {/* Preview hint */}
      <div style={{ fontSize: 11, color: "var(--muted)", padding: "10px 12px", background: "var(--surface2)", borderRadius: 7, lineHeight: 1.5 }}>
        Changes appear live in the preview. Download PDF preserves all styling.
      </div>
    </>
  );
}
