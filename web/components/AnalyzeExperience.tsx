"use client";

import type { DragEvent, ReactNode } from "react";
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

function FeatureCard({ icon, title, body, accent, delayClass }: { icon: ReactNode; title: string; body: string; accent: string; delayClass?: string }) {
  return (
    <div className={`az-analyze-feature-card fade-in-up ${delayClass ?? ""}`.trim()} style={{ padding: "16px 16px 14px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 10, minHeight: 132 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: accent, color: "var(--accent)", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: -0.25, marginBottom: 4 }}>{title}</div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{body}</p>
      </div>
    </div>
  );
}

/** Pre-upload landing: hero, value cards, JD, drop zone. */
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
    <div className="az-upload-landing" style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <div className="fade-in" style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="az-analyze-hero-badge">Free résumé audit</div>
        <h1 className="az-analyze-hero-title">See your résumé the way recruiters do</h1>
        <p className="az-analyze-hero-sub">
          Upload a PDF and get an overall score, category breakdown, and bullet-level rewrites — in about a minute.
        </p>
      </div>

      <div className="az-analyze-feature-grid">
        <FeatureCard
          delayClass="stagger-1"
          accent="rgba(47,129,247,0.12)"
          title="8-dimension scorecard"
          body="Readability, ATS safety, quantification, achievements, and more — so you know what to fix first."
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
        <FeatureCard
          delayClass="stagger-2"
          accent="rgba(52,211,153,0.12)"
          title="Bullet-level coaching"
          body="Each weak line gets a score, issues called out, and a stronger rewrite you can copy in one click."
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M4 5h12M4 10h8M4 15h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
        <FeatureCard
          delayClass="stagger-3"
          accent="rgba(245,158,11,0.12)"
          title="JD keyword match"
          body="Paste a job description to unlock keyword gaps and job-fit scoring before you tailor in Builder."
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M6 3h8l3 3v11H6V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M14 3v3h3M8 11h4M8 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
      </div>

      <div className="az-analyze-jd-card fade-in stagger-2">
        <label htmlFor="az-jd-input" className="az-analyze-jd-label">
          <span>Target job description</span>
          <span className="az-analyze-jd-badge">Optional — unlocks keyword fit</span>
        </label>
        <textarea
          id="az-jd-input"
          value={jd}
          onChange={(e) => onJdChange(e.target.value)}
          placeholder="Paste the role you care about — we'll flag missing keywords and score job match…"
          rows={4}
          className="az-analyze-jd-textarea"
        />
      </div>

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
        className={`az-analyze-dropzone fade-in stagger-3${dragging ? " is-dragging" : ""}`}
      >
        <div className="az-analyze-dropzone-glow" aria-hidden />
        <div className="az-analyze-dropzone-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="az-analyze-dropzone-title">Drop your résumé PDF here</div>
        <p className="az-analyze-dropzone-hint">
          or click to browse · we analyze in your browser session (text is saved to your account, not the file)
        </p>
        <span className="az-analyze-dropzone-cta">
          Start analysis
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      <ApiErrorBanner error={error} className="az-analyze-upload-error" style={{ marginTop: 14, marginBottom: 0 }} />
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
