"use client";

import type { DragEvent } from "react";
import { ApiErrorBanner } from "@/components/ApiErrorBanner";

export const ANALYZE_LOADER_STEPS = [
  "Reading your résumé text",
  "Running ATS & structure checks",
  "Scoring bullets with AI",
  "Building your improvement plan",
] as const;

export const ANALYZE_COACH_TIPS = [
  "Recruiters skim for 6–8 seconds — lead each bullet with a strong verb and one clear outcome.",
  "Numbers beat adjectives: “cut reporting time 40%” lands harder than “improved efficiency.”",
  "Mirror keywords from the job description in your bullets — ATS filters before a human reads you.",
  "One page is usually enough for under ~10 years of experience; tighten before you add sections.",
  "Skills lists should match tools you actually used in the roles below — not a wish list.",
  "Past tense for prior jobs, present only for current role — small detail, big polish signal.",
  "Replace “responsible for” with what you delivered: built, shipped, reduced, grew, automated.",
  "Group achievements under the right employer — mismatched dates are an instant trust hit.",
  "A short summary works when it names your level + domain; skip generic “hard-working team player.”",
  "After you fix bullets here, tailor the same story to a specific posting in Résumé Builder.",
] as const;

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
      <circle cx="9" cy="9" r="7" stroke="var(--border)" strokeWidth="2.5" />
      <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

/* ── Combined Score + Resume Preview mockup ─────────────────── */

const CATS = [
  { label: "Readability",        score: 88, color: "#34d399" },
  { label: "ATS Safety",         score: 72, color: "#2f81f7" },
  { label: "Quantification",     score: 55, color: "#f59e0b" },
  { label: "Achievement Quality",score: 63, color: "#f59e0b" },
  { label: "Language Quality",   score: 81, color: "#34d399" },
  { label: "Section Structure",  score: 76, color: "#2f81f7" },
];

const RESUME_LINES = [
  { text: "Alex Johnson", type: "name" },
  { text: "alex@email.com · github.com/alexj · San Francisco, CA", type: "contact" },
  { text: "EXPERIENCE", type: "section" },
  { text: "Software Engineer II · Stripe · 2022–Present", type: "role" },
  { text: "• Worked on backend API features for the product team.", type: "bad" },
  { text: "• Built webhook system handling 2M+ events/day using Go and Kafka.", type: "ok" },
  { text: "• Led team of 4 migrating legacy PHP to Go microservices.", type: "ok" },
  { text: "• Responsible for improving system performance.", type: "bad" },
  { text: "Software Engineer Intern · Airbnb · 2021", type: "role" },
  { text: "• Developed React component library cutting UI dev time 20%.", type: "ok" },
];

function MiniScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ height: 4, borderRadius: 3, background: "var(--surface2)", overflow: "hidden", flex: 1 }}>
      <div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: color }} />
    </div>
  );
}

function AnalyzePreviewMockup() {
  return (
    <div className="az-preview-mockup fade-in-up stagger-1">
      {/* Mac-style chrome bar */}
      <div className="az-preview-chrome">
        <span className="az-preview-dot" style={{ background: "#ff5f57" }} />
        <span className="az-preview-dot" style={{ background: "#febc2e" }} />
        <span className="az-preview-dot" style={{ background: "#28c840" }} />
        <span className="az-preview-chrome-label">Resunova · Improvement Plan · Quantification</span>
        <span className="az-preview-tag az-preview-tag--red">5 flagged</span>
        <span className="az-preview-tag az-preview-tag--amber">Score 55</span>
      </div>

      <div className="az-preview-body">
        {/* Left — Score + bars */}
        <div className="az-preview-score-col">
          {/* Score circle */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 16 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              border: "5px solid #f59e0b",
              boxShadow: "0 0 0 3px rgba(245,158,11,0.15)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: "var(--surface2)",
            }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -1, color: "var(--text)", lineHeight: 1 }}>74</span>
              <span style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1 }}>/100</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 }}>Needs work</span>
          </div>
          {/* Category bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%" }}>
            {CATS.map(c => (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10.5, color: "var(--muted)", width: 100, flexShrink: 0, lineHeight: 1.2 }}>{c.label}</span>
                <MiniScoreBar score={c.score} color={c.color} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: c.color, width: 22, textAlign: "right", flexShrink: 0 }}>{c.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="az-preview-divider" />

        {/* Right — Resume preview + apply card */}
        <div className="az-preview-right-col">
          {/* Mini resume paper */}
          <div className="az-preview-resume-paper">
            {RESUME_LINES.map((line, i) => {
              const isName    = line.type === "name";
              const isContact = line.type === "contact";
              const isSec     = line.type === "section";
              const isRole    = line.type === "role";
              const isBad     = line.type === "bad";
              const isOk      = line.type === "ok";
              return (
                <div key={i} style={{
                  fontSize: isName ? 12 : isSec ? 8.5 : isContact ? 9 : 9.5,
                  fontWeight: isName ? 800 : isSec ? 800 : isRole ? 600 : 400,
                  color: isName ? "#111" : isSec ? "#555" : isContact ? "#888" : "#222",
                  textTransform: isSec ? "uppercase" : "none",
                  letterSpacing: isSec ? 0.6 : 0,
                  marginTop: isSec ? 8 : isName ? 0 : 2,
                  marginBottom: isSec ? 3 : 0,
                  padding: (isBad || isOk) ? "2px 18px 2px 4px" : 0,
                  borderRadius: (isBad || isOk) ? 3 : 0,
                  background: isBad ? "rgba(248,113,113,0.13)" : isOk ? "rgba(52,211,153,0.1)" : "transparent",
                  border: isBad ? "1px solid rgba(248,113,113,0.3)" : isOk ? "1px solid rgba(52,211,153,0.25)" : "none",
                  lineHeight: 1.4,
                  position: "relative" as const,
                }}>
                  {line.text}
                  {isBad && <span style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "#f87171", fontWeight: 700 }}>⚠</span>}
                  {isOk  && <span style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "#34d399", fontWeight: 700 }}>✓</span>}
                </div>
              );
            })}
          </div>

          {/* Apply card */}
          <div className="az-preview-apply-card">
            <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>⚠ Selected · fix 1 of 5</div>
            <div style={{ fontSize: 10, color: "#888", lineHeight: 1.4, textDecoration: "line-through", marginBottom: 6, opacity: 0.7 }}>
              Worked on backend API features for the product team.
            </div>
            <div style={{ fontSize: 10, color: "var(--text)", lineHeight: 1.4, padding: "6px 8px", borderRadius: 6, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)", marginBottom: 7 }}>
              ✨ Architected REST API serving 2M+ daily requests, cutting P95 latency 40%.
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <button style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#2f81f7", color: "white", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                ↑ Apply
              </button>
              <button style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: 10, cursor: "pointer" }}>
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="az-preview-footer">
        Sample output · your results appear here ~60 seconds after upload
      </div>
    </div>
  );
}

/** Pre-upload landing: hero, preview mockup, drop zone (primary), JD (optional). */
export function AnalyzeUploadLanding({
  jd,
  onJdChange,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowseClick,
  error,
}: {
  jd: string;
  onJdChange: (v: string) => void;
  dragging: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onBrowseClick: () => void;
  error: string | null;
}) {
  return (
    <div className="az-upload-landing">
      {/* Hero */}
      <div className="fade-in" style={{ textAlign: "center", marginBottom: 24 }}>
        <div className="az-analyze-hero-badge">Free résumé audit</div>
        <h1 className="az-analyze-hero-title">See your résumé the way recruiters do</h1>
        <p className="az-analyze-hero-sub">
          Upload a PDF — get a score, 8-dimension breakdown, and bullet-by-bullet rewrites you can apply in one click.
        </p>
      </div>

      {/* Combined score + resume preview mockup */}
      <AnalyzePreviewMockup />

      {/* Drop zone — PRIMARY action, above JD */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onBrowseClick();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onBrowseClick}
        className={`az-analyze-dropzone fade-in stagger-2${dragging ? " is-dragging" : ""}`}
      >
        <div className="az-analyze-dropzone-glow" aria-hidden />
        <div className="az-analyze-dropzone-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="az-analyze-dropzone-title">Drop your résumé PDF here</div>
        <p className="az-analyze-dropzone-hint">or click to browse</p>
        <span className="az-analyze-dropzone-cta">
          Start analysis
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="az-analyze-dropzone-privacy">
          🔒 Privacy guaranteed · text is saved to your account, not the file
        </p>
      </div>

      <ApiErrorBanner error={error} className="az-analyze-upload-error" style={{ marginTop: 14, marginBottom: 0 }} />

      {/* JD — optional, below drop zone */}
      <div className="az-analyze-jd-card fade-in stagger-3">
        <label htmlFor="az-jd-input" className="az-analyze-jd-label">
          <span>Target job description</span>
          <span className="az-analyze-jd-badge">Optional — unlocks keyword fit</span>
        </label>
        <textarea
          id="az-jd-input"
          value={jd}
          onChange={(e) => onJdChange(e.target.value)}
          placeholder="Paste the role you care about — we'll flag missing keywords and score job match…"
          rows={3}
          className="az-analyze-jd-textarea"
        />
      </div>
    </div>
  );
}

function SkeletonResumeMock() {
  const line = (w: string, h = 8, mb = 8) => (
    <div className="az-analyze-skeleton-line" style={{ width: w, height: h, borderRadius: 4, marginBottom: mb }} aria-hidden />
  );
  return (
    <div className="az-analyze-skeleton-paper" aria-hidden>
      {line("55%", 14, 10)}
      {line("70%", 6, 14)}
      {line("40%", 6, 16)}
      <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />
      {line("35%", 10, 10)}
      {line("92%", 6)}
      {line("88%", 6)}
      {line("76%", 6, 12)}
      {line("92%", 6)}
      {line("64%", 6)}
    </div>
  );
}

/** Full-width loader while analysis API runs. */
export function AnalyzeCoachLoader({
  stepIndex,
  tipIndex,
  hasJd,
}: {
  stepIndex: number;
  tipIndex: number;
  hasJd: boolean;
}) {
  const steps = hasJd
    ? [...ANALYZE_LOADER_STEPS, "Matching keywords to the job posting"]
    : [...ANALYZE_LOADER_STEPS];
  const activeStep = stepIndex % steps.length;
  const tip = ANALYZE_COACH_TIPS[tipIndex % ANALYZE_COACH_TIPS.length];

  const stepRow = (label: string, index: number, isLast: boolean) => {
    const done = activeStep > index;
    const active = activeStep === index;
    return (
      <div
        key={label}
        className="az-analyze-loader-step"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 0",
          borderBottom: isLast ? "none" : "1px solid var(--border)",
          color: done || active ? "var(--text)" : "var(--dim)",
        }}
      >
        <span style={{ width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="rgba(52,211,153,0.2)" stroke="rgb(34,197,94)" strokeWidth="1.5" />
              <path d="M6 10l2.5 2.5L14 7" stroke="rgb(22,101,52)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : active ? (
            <Spinner size={18} />
          ) : (
            <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--border)", background: "var(--surface2)" }} />
          )}
        </span>
        <span style={{ fontSize: 13, fontWeight: active || done ? 600 : 500, letterSpacing: -0.2, flex: 1 }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="fade-in az-analyze-loader-wrap" role="status" aria-live="polite" aria-busy="true">
      <div className="az-analyze-loader-grid">
        <div className="rb-suggest-loader-card az-analyze-loader-card">
          <div className="rb-suggest-loader-topshine" aria-hidden />
          <div style={{ padding: "20px 20px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 6 }}>
              Analyzing
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, letterSpacing: -0.45, color: "var(--text)" }}>
              Building your improvement plan
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
              Usually under a minute. Stay on this tab — your score and bullet fixes appear here automatically.
            </p>
            <div style={{ marginBottom: 16 }}>{steps.map((label, i) => stepRow(label, i, i === steps.length - 1))}</div>
            <div key={tipIndex} className="fade-in az-analyze-coach-tip">
              <div className="az-analyze-coach-tip-label">Coach tip while you wait</div>
              {tip}
            </div>
          </div>
        </div>
        <div className="az-analyze-loader-side">
          <SkeletonResumeMock />
          <div className="az-analyze-loader-next">
            <strong>What&apos;s next:</strong> click any category in the sidebar to jump to weak bullets, then copy
            improved lines or continue in Résumé Builder.
          </div>
        </div>
      </div>
    </div>
  );
}
