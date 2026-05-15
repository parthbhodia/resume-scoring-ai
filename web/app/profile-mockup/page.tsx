"use client";

/**
 * High-fidelity Profile view mock — design reference only (no backend).
 * Open /profile-mockup while signed out; screenshot or port frames to Figma.
 * Product tokens: globals.css · tone: docs/PRODUCT_DESIGN.md
 */

import Link from "next/link";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: -0.2,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 5, lineHeight: 1.45 }}>{hint}</div>
      ) : null}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "var(--surface2)",
    color: "var(--text)",
    outline: "none",
    fontFamily: "inherit",
    letterSpacing: -0.15,
  };
}

function EeoRadioGroup({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue: string;
}) {
  const labelId = `${name}-label`;
  return (
    <div role="group" aria-labelledby={labelId} style={{ marginBottom: 22 }}>
      <div
        id={labelId}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: -0.2,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "center" }}>
        {options.map((opt) => (
          <label
            key={opt}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13,
              color: "var(--text)",
              letterSpacing: -0.15,
              cursor: "default",
            }}
          >
            <input type="radio" name={name} value={opt} defaultChecked={opt === defaultValue} disabled />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function Card({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        padding: "20px 22px 22px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.35, color: "var(--text)" }}>{title}</h2>
        {badge ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.08,
              color: "var(--amber)",
              background: "var(--amber-bg)",
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function ProfileMockupPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Top strip */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, letterSpacing: -0.6, fontSize: 15 }}>Resunova</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.1,
              color: "var(--accent)",
              background: "var(--accent-bg)",
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
            }}
          >
            Visual mock · not saved
          </span>
        </div>
        <Link
          href="/"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          ← Back to app
        </Link>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 49px)" }}>
        {/* Fake compact sidebar */}
        <aside
          style={{
            width: 72,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "14px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
          aria-hidden
        >
          {["A", "R", "L", "J", "P"].map((letter, i) => {
            const active = i === 4;
            return (
              <div
                key={letter}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: active ? "var(--accent)" : "var(--muted)",
                  background: active ? "var(--accent-bg)" : "transparent",
                  border: active ? "1px solid rgba(47,129,247,0.25)" : "1px solid transparent",
                  position: "relative",
                }}
              >
                {active ? (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: "0 3px 3px 0",
                      background: "var(--accent)",
                    }}
                  />
                ) : null}
                {letter}
              </div>
            );
          })}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: "auto", padding: "28px 24px 100px" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            <header style={{ marginBottom: 26 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, marginBottom: 8 }}>Profile</h1>
              <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, maxWidth: 560 }}>
                Defaults used when tailoring résumés and cover letters. Keep this accurate — we never sell your data.
              </p>
            </header>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 300px) minmax(0, 1fr)",
                gap: 22,
                alignItems: "start",
              }}
              className="profile-mock-grid"
            >
              {/* Left column — identity */}
              <div>
                <div
                  style={{
                    borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    boxShadow: "var(--shadow-card)",
                    padding: 22,
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Alex Rivera</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Early-career software · NYC</div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--surface2)", overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ width: "68%", height: "100%", background: "var(--green)", borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>Profile strength · 68%</div>
                </div>

                <Card title="Visibility" badge="Soon">
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginBottom: 12 }}>
                    Control what appears on exported PDFs and shared links. Placeholder for future toggles.
                  </p>
                  <div style={{ opacity: 0.45, pointerEvents: "none" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
                      <input type="checkbox" defaultChecked readOnly /> Show phone on résumé PDFs
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <input type="checkbox" readOnly /> Hide full address (city only)
                    </label>
                  </div>
                </Card>
              </div>

              {/* Right column — forms */}
              <div>
                <Card title="Contact & links">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="profile-mock-two-col">
                    <Field label="Email" hint="Sign-in email; used for exports.">
                      <input readOnly style={inputStyle()} defaultValue="alex.rivera@university.edu" />
                    </Field>
                    <Field label="Phone">
                      <input readOnly style={inputStyle()} defaultValue="+1 (555) 201-8844" />
                    </Field>
                    <Field label="LinkedIn">
                      <input readOnly style={inputStyle()} defaultValue="linkedin.com/in/alexrivera" />
                    </Field>
                    <Field label="Portfolio / GitHub">
                      <input readOnly style={inputStyle()} defaultValue="github.com/arivera" />
                    </Field>
                  </div>
                </Card>

                <Card title="Target search">
                  <Field label="Headline (one line)" hint="Shown at the top of tailored résumés when you leave summary blank.">
                    <input
                      readOnly
                      style={inputStyle()}
                      defaultValue="CS student · backend & infra internships · Python, Go, distributed systems"
                    />
                  </Field>
                  <Field label="Roles you want">
                    <input readOnly style={inputStyle()} defaultValue="Backend intern, Platform intern, SRE intern" />
                  </Field>
                  <Field label="Locations">
                    <input readOnly style={inputStyle()} defaultValue="Remote · NYC · SF Bay Area" />
                  </Field>
                </Card>

                <Card title="Education">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="profile-mock-two-col">
                    <Field label="School">
                      <input readOnly style={inputStyle()} defaultValue="State University" />
                    </Field>
                    <Field label="Degree">
                      <input readOnly style={inputStyle()} defaultValue="B.S. Computer Science" />
                    </Field>
                    <Field label="Graduation">
                      <input readOnly style={inputStyle()} defaultValue="May 2027" />
                    </Field>
                    <Field label="GPA (optional)">
                      <input readOnly style={inputStyle()} defaultValue="3.72 / 4.0" />
                    </Field>
                  </div>
                </Card>

                <Card title="Tailoring defaults" badge="Preview">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="profile-mock-two-col">
                    <Field label="Default tone">
                      <select disabled style={{ ...inputStyle(), cursor: "not-allowed", opacity: 0.85 }}>
                        <option>Confident & concise</option>
                        <option>Formal</option>
                        <option>Friendly</option>
                      </select>
                    </Field>
                    <Field label="Default section order">
                      <select disabled style={{ ...inputStyle(), cursor: "not-allowed", opacity: 0.85 }}>
                        <option>Summary → Experience → Projects → Education</option>
                      </select>
                    </Field>
                  </div>
                </Card>

                <Card title="Equal employment" badge="Optional">
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: "14px 16px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border)",
                      background: "var(--surface2)",
                      marginBottom: 20,
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }} aria-hidden>
                      🏁
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.3, color: "var(--text)", marginBottom: 6 }}>
                        Optional — save time on applications later
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
                        Many job boards ask the same EEO-style questions on every apply. If you choose to store answers here, our{" "}
                        <strong style={{ color: "var(--text)", fontWeight: 600 }}>Apply jobs</strong> experience{" "}
                        <span style={{ color: "var(--amber)", fontWeight: 600 }}>(coming soon)</span> can suggest matching options on
                        supported forms so you move faster. Skip this entire block if you prefer — it is not used for résumé scoring or
                        tailoring unless you explicitly use Apply jobs when it ships.
                      </p>
                    </div>
                  </div>

                  <EeoRadioGroup
                    label="Are you authorized to work in the U.S.?"
                    name="mock-eeo-work-auth"
                    options={["Yes", "No"]}
                    defaultValue="Yes"
                  />
                  <EeoRadioGroup
                    label="Will you now or in the future require sponsorship for an employment visa?"
                    name="mock-eeo-sponsorship"
                    options={["Yes", "No"]}
                    defaultValue="No"
                  />
                  <EeoRadioGroup
                    label="Do you have a disability?"
                    name="mock-eeo-disability"
                    options={["Yes", "No", "Decline to state"]}
                    defaultValue="Decline to state"
                  />
                  <EeoRadioGroup
                    label="Are you a veteran?"
                    name="mock-eeo-veteran"
                    options={["Yes", "No", "Decline to state"]}
                    defaultValue="Decline to state"
                  />
                  <EeoRadioGroup
                    label="What is your gender?"
                    name="mock-eeo-gender"
                    options={["Male", "Female", "Non-Binary", "Decline to state"]}
                    defaultValue="Decline to state"
                  />
                  <EeoRadioGroup
                    label="Do you identify as LGBTQ+?"
                    name="mock-eeo-lgbtq"
                    options={["Yes", "No", "Decline to state"]}
                    defaultValue="Decline to state"
                  />
                  <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5, margin: 0, marginTop: 4 }}>
                    Employers collect this for compliance and diversity reporting; exact wording on external sites may differ. You can edit
                    or clear these answers anytime.
                  </p>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Sticky action bar */}
      <div
        style={{
          position: "fixed",
          left: 72,
          right: 0,
          bottom: 0,
          borderTop: "1px solid var(--border)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(10px)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
        className="profile-mock-footer"
      >
        <span style={{ fontSize: 12, color: "var(--dim)" }}>Unsaved changes · mock only</span>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "default",
            }}
          >
            Discard
          </button>
          <button
            type="button"
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 20px",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: "default",
              boxShadow: "0 1px 8px rgba(47,129,247,0.35)",
            }}
          >
            Save profile
          </button>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 900px) {
          .profile-mock-grid {
            grid-template-columns: 1fr !important;
          }
          .profile-mock-two-col {
            grid-template-columns: 1fr !important;
          }
          .profile-mock-footer {
            left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
