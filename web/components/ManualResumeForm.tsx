"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

const PROFILE_KEY = "rn_builder_profile_prefill";

/* ── Types ──────────────────────────────────────────────────────────── */

interface WorkEntry {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string;
}

interface EducationEntry {
  id: string;
  degree: string;
  school: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

type Step = "personal" | "experience" | "education" | "skills" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "experience", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "skills", label: "Skills" },
  { key: "review", label: "Review" },
];

/* ── Shared input styles ────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--dim)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 5,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children, cols }: { children: React.ReactNode; cols?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols ?? "1fr 1fr", gap: 14 }}>
      {children}
    </div>
  );
}

/* ── Step components ─────────────────────────────────────────────────── */

function PersonalStep({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  const f = (k: string) => data[k] ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Row>
        <Field label="First name">
          <input style={inputStyle} value={f("firstName")} placeholder="Jane"
            onChange={e => onChange("firstName", e.target.value)} />
        </Field>
        <Field label="Last name">
          <input style={inputStyle} value={f("lastName")} placeholder="Smith"
            onChange={e => onChange("lastName", e.target.value)} />
        </Field>
      </Row>
      <Field label="Professional headline / title">
        <input style={inputStyle} value={f("headline")} placeholder="Software Engineer · React · TypeScript"
          onChange={e => onChange("headline", e.target.value)} />
      </Field>
      <Row>
        <Field label="Email">
          <input style={inputStyle} type="email" value={f("email")} placeholder="jane@example.com"
            onChange={e => onChange("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input style={inputStyle} type="tel" value={f("phone")} placeholder="(555) 123-4567"
            onChange={e => onChange("phone", e.target.value)} />
        </Field>
      </Row>
      <Row>
        <Field label="Location">
          <input style={inputStyle} value={f("location")} placeholder="San Francisco, CA"
            onChange={e => onChange("location", e.target.value)} />
        </Field>
        <Field label="LinkedIn (optional)">
          <input style={inputStyle} value={f("linkedin")} placeholder="linkedin.com/in/janesmith"
            onChange={e => onChange("linkedin", e.target.value)} />
        </Field>
      </Row>
      <Field label="Website / GitHub (optional)">
        <input style={inputStyle} value={f("website")} placeholder="github.com/janesmith"
          onChange={e => onChange("website", e.target.value)} />
      </Field>
      <Field label="Professional summary (optional)">
        <textarea
          style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
          value={f("summary")}
          placeholder="Brief 2–3 sentence overview of your background and key strengths…"
          onChange={e => onChange("summary", e.target.value)}
        />
      </Field>
    </div>
  );
}

function newWork(): WorkEntry {
  return { id: crypto.randomUUID(), title: "", company: "", location: "", startDate: "", endDate: "", current: false, bullets: "" };
}

function ExperienceStep({
  entries,
  onChange,
  onAdd,
  onRemove,
}: {
  entries: WorkEntry[];
  onChange: (id: string, key: keyof WorkEntry, val: string | boolean) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {entries.map((e, i) => (
        <div
          key={e.id}
          style={{
            borderRadius: 12, border: "1px solid var(--border)",
            padding: "18px 18px 14px", background: "var(--surface)",
            display: "flex", flexDirection: "column", gap: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Position {i + 1}
            </span>
            {entries.length > 1 && (
              <button type="button" onClick={() => onRemove(e.id)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted)", fontFamily: "inherit" }}>
                Remove
              </button>
            )}
          </div>
          <Row>
            <Field label="Job title">
              <input style={inputStyle} value={e.title} placeholder="Software Engineer"
                onChange={ev => onChange(e.id, "title", ev.target.value)} />
            </Field>
            <Field label="Company">
              <input style={inputStyle} value={e.company} placeholder="Acme Corp"
                onChange={ev => onChange(e.id, "company", ev.target.value)} />
            </Field>
          </Row>
          <Field label="Location">
            <input style={inputStyle} value={e.location} placeholder="San Francisco, CA (or Remote)"
              onChange={ev => onChange(e.id, "location", ev.target.value)} />
          </Field>
          <Row>
            <Field label="Start date">
              <input style={inputStyle} value={e.startDate} placeholder="Jan 2022"
                onChange={ev => onChange(e.id, "startDate", ev.target.value)} />
            </Field>
            <Field label={e.current ? "End date" : "End date"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input style={inputStyle} value={e.endDate} placeholder={e.current ? "Present" : "Dec 2024"}
                  disabled={e.current}
                  onChange={ev => onChange(e.id, "endDate", ev.target.value)} />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                  <input type="checkbox" checked={e.current} onChange={ev => { onChange(e.id, "current", ev.target.checked); onChange(e.id, "endDate", ev.target.checked ? "Present" : ""); }} />
                  Currently working here
                </label>
              </div>
            </Field>
          </Row>
          <Field label="Key responsibilities & achievements (one per line)">
            <textarea
              style={{ ...inputStyle, minHeight: 110, resize: "vertical", lineHeight: 1.65 }}
              value={e.bullets}
              placeholder={"• Led redesign of checkout flow, reducing drop-off by 18%\n• Mentored 3 junior engineers and ran weekly code reviews\n• Built a CI/CD pipeline cutting deploy time from 40 min to 8 min"}
              onChange={ev => onChange(e.id, "bullets", ev.target.value)}
            />
          </Field>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 18px", borderRadius: 8,
          border: "1.5px dashed var(--border)",
          background: "none", color: "var(--muted)",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Add another position
      </button>
    </div>
  );
}

function newEdu(): EducationEntry {
  return { id: crypto.randomUUID(), degree: "", school: "", location: "", startDate: "", endDate: "", gpa: "" };
}

function EducationStep({
  entries,
  onChange,
  onAdd,
  onRemove,
}: {
  entries: EducationEntry[];
  onChange: (id: string, key: keyof EducationEntry, val: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {entries.map((e, i) => (
        <div
          key={e.id}
          style={{
            borderRadius: 12, border: "1px solid var(--border)",
            padding: "18px 18px 14px", background: "var(--surface)",
            display: "flex", flexDirection: "column", gap: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              School {i + 1}
            </span>
            {entries.length > 1 && (
              <button type="button" onClick={() => onRemove(e.id)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted)", fontFamily: "inherit" }}>
                Remove
              </button>
            )}
          </div>
          <Field label="Degree & field of study">
            <input style={inputStyle} value={e.degree} placeholder="B.S. Computer Science"
              onChange={ev => onChange(e.id, "degree", ev.target.value)} />
          </Field>
          <Row>
            <Field label="School">
              <input style={inputStyle} value={e.school} placeholder="Stanford University"
                onChange={ev => onChange(e.id, "school", ev.target.value)} />
            </Field>
            <Field label="Location">
              <input style={inputStyle} value={e.location} placeholder="Stanford, CA"
                onChange={ev => onChange(e.id, "location", ev.target.value)} />
            </Field>
          </Row>
          <Row>
            <Field label="Start year">
              <input style={inputStyle} value={e.startDate} placeholder="2018"
                onChange={ev => onChange(e.id, "startDate", ev.target.value)} />
            </Field>
            <Field label="End year">
              <input style={inputStyle} value={e.endDate} placeholder="2022"
                onChange={ev => onChange(e.id, "endDate", ev.target.value)} />
            </Field>
          </Row>
          <Field label="GPA (optional)">
            <input style={{ ...inputStyle, maxWidth: 160 }} value={e.gpa} placeholder="3.85 / 4.0"
              onChange={ev => onChange(e.id, "gpa", ev.target.value)} />
          </Field>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 18px", borderRadius: 8,
          border: "1.5px dashed var(--border)",
          background: "none", color: "var(--muted)",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Add another school
      </button>
    </div>
  );
}

function SkillsStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>
        List your skills, tools, and technologies. Separate them with commas — we&apos;ll group and format them for you.
      </p>
      <Field label="Skills">
        <textarea
          style={{ ...inputStyle, minHeight: 140, resize: "vertical", lineHeight: 1.7 }}
          value={value}
          placeholder={"TypeScript, React, Node.js, PostgreSQL, Docker, AWS, Figma, Python…"}
          onChange={e => onChange(e.target.value)}
        />
      </Field>
      <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>
        Tip: include both technical skills and relevant soft skills for better ATS matching.
      </p>
    </div>
  );
}

/* ── Profile text compiler ──────────────────────────────────────────── */

function compileProfile(
  personal: Record<string, string>,
  work: WorkEntry[],
  education: EducationEntry[],
  skills: string,
): string {
  const lines: string[] = [];

  // Header
  const name = [personal.firstName, personal.lastName].filter(Boolean).join(" ");
  if (name) lines.push(name);
  if (personal.headline) lines.push(personal.headline);
  const contact = [personal.email, personal.phone, personal.location, personal.linkedin, personal.website]
    .filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  lines.push("");

  if (personal.summary) {
    lines.push("PROFESSIONAL SUMMARY");
    lines.push(personal.summary.trim());
    lines.push("");
  }

  const validWork = work.filter(e => e.title || e.company);
  if (validWork.length > 0) {
    lines.push("WORK EXPERIENCE");
    for (const e of validWork) {
      const dates = [e.startDate, (e.current ? "Present" : e.endDate)].filter(Boolean).join(" – ");
      lines.push(`${e.title}${e.company ? ` | ${e.company}` : ""}${dates ? ` | ${dates}` : ""}`);
      if (e.location) lines.push(e.location);
      const bLines = e.bullets.trim().split("\n").map(l => l.trim()).filter(Boolean);
      for (const b of bLines) {
        lines.push(b.startsWith("•") || b.startsWith("-") ? b : `• ${b}`);
      }
      lines.push("");
    }
  }

  const validEdu = education.filter(e => e.degree || e.school);
  if (validEdu.length > 0) {
    lines.push("EDUCATION");
    for (const e of validEdu) {
      const dates = [e.startDate, e.endDate].filter(Boolean).join(" – ");
      lines.push(`${e.degree}${e.school ? ` — ${e.school}` : ""}${dates ? `, ${dates}` : ""}`);
      if (e.location) lines.push(e.location);
      if (e.gpa) lines.push(`GPA: ${e.gpa}`);
      lines.push("");
    }
  }

  const skillList = skills.trim();
  if (skillList) {
    lines.push("SKILLS");
    lines.push(skillList);
    lines.push("");
  }

  return lines.join("\n").trim();
}

/* ── Review pane ────────────────────────────────────────────────────── */

function ReviewStep({ profileText }: { profileText: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>
        Here&apos;s a preview of the profile text the AI will use. You can go back to edit any section.
      </p>
      <pre
        style={{
          margin: 0,
          padding: "16px 18px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          fontSize: 12,
          lineHeight: 1.65,
          color: "var(--text)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 380,
          overflowY: "auto",
        }}
      >
        {profileText || "(Nothing filled in yet — go back and add some content)"}
      </pre>
    </div>
  );
}

/* ── Step progress bar ──────────────────────────────────────────────── */

function StepBar({ current, onGoto }: { current: Step; onGoto: (s: Step) => void }) {
  const ci = STEPS.findIndex(s => s.key === current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 36 }}>
      {STEPS.map((s, i) => {
        const done = i < ci;
        const active = i === ci;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? "1 1 0%" : undefined }}>
            <button
              type="button"
              onClick={() => (done || active) && onGoto(s.key)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                background: "none", border: "none", cursor: done ? "pointer" : "default", fontFamily: "inherit",
                padding: "0 2px",
              }}
            >
              <div
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: active ? "var(--accent)" : done ? "var(--accent-bg)" : "var(--surface)",
                  border: `2px solid ${active ? "var(--accent)" : done ? "var(--accent)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: active ? "#fff" : done ? "var(--accent)" : "var(--dim)",
                  transition: "background 0.15s",
                }}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? "var(--accent)" : "var(--dim)", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? "var(--accent)" : "var(--border)", margin: "0 4px", marginBottom: 20, transition: "background 0.15s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export default function ManualResumeForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("personal");
  const [personal, setPersonal] = useState<Record<string, string>>({});
  const [work, setWork] = useState<WorkEntry[]>([newWork()]);
  const [education, setEducation] = useState<EducationEntry[]>([newEdu()]);
  const [skills, setSkills] = useState("");

  const profileText = compileProfile(personal, work, education, skills);

  const updatePersonal = useCallback((k: string, v: string) => setPersonal(prev => ({ ...prev, [k]: v })), []);

  const updateWork = useCallback((id: string, k: keyof WorkEntry, v: string | boolean) => {
    setWork(prev => prev.map(e => e.id === id ? { ...e, [k]: v } : e));
  }, []);

  const updateEdu = useCallback((id: string, k: keyof EducationEntry, v: string) => {
    setEducation(prev => prev.map(e => e.id === id ? { ...e, [k]: v } : e));
  }, []);

  const currentIdx = STEPS.findIndex(s => s.key === step);

  const goNext = useCallback(() => {
    if (currentIdx < STEPS.length - 1) setStep(STEPS[currentIdx + 1].key);
  }, [currentIdx]);

  const goBack = useCallback(() => {
    if (currentIdx > 0) setStep(STEPS[currentIdx - 1].key);
  }, [currentIdx]);

  const handleSubmit = useCallback(() => {
    try { sessionStorage.setItem(PROFILE_KEY, profileText.trim()); } catch { /* quota */ }
    const q = new URLSearchParams();
    q.set("view", "builder");
    q.set("flow", "tailor");
    q.set("fromTemplateStudio", "1");
    router.push(`/?${q.toString()}`);
  }, [router, profileText]);

  const isLast = step === "review";

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 80px",
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            Step 3 of 3 — Write Manually
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: 0 }}>
            Tell us about yourself
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
            Fill in what you have — the AI will polish and format everything.
          </p>
        </div>

        <StepBar current={step} onGoto={s => setStep(s)} />

        {/* Step content */}
        <div
          style={{
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "24px 24px 20px",
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            {STEPS.find(s => s.key === step)?.label}
          </h2>
          {step === "personal" && <PersonalStep data={personal} onChange={updatePersonal} />}
          {step === "experience" && (
            <ExperienceStep
              entries={work}
              onChange={updateWork}
              onAdd={() => setWork(prev => [...prev, newWork()])}
              onRemove={id => setWork(prev => prev.filter(e => e.id !== id))}
            />
          )}
          {step === "education" && (
            <EducationStep
              entries={education}
              onChange={updateEdu}
              onAdd={() => setEducation(prev => [...prev, newEdu()])}
              onRemove={id => setEducation(prev => prev.filter(e => e.id !== id))}
            />
          )}
          {step === "skills" && <SkillsStep value={skills} onChange={setSkills} />}
          {step === "review" && <ReviewStep profileText={profileText} />}
        </div>

        {/* Nav buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={currentIdx === 0 ? () => router.back() : goBack}
            style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: 8, padding: "9px 18px",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
              cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            {currentIdx === 0 ? "← Back" : "← Previous"}
          </button>

          <button
            type="button"
            onClick={isLast ? handleSubmit : goNext}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: -0.2,
              display: "flex", alignItems: "center", gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-h)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; }}
          >
            {isLast ? (
              <>Build my resume<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5h8M7 3l3.5 3.5L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></>
            ) : (
              <>Next<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5h8M7 3l3.5 3.5L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
