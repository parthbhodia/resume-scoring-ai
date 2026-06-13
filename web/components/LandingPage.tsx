"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase";
import { SITE_URL } from "@/lib/brand";
import { LogoFull, LogoMark } from "./BrandLogo";
import { Button } from "@/components/ui/button";
import {
  LandingPreviewStyles,
  VariantA,
  VariantB,
  VariantD,
  VariantE,
} from "@/components/LandingFeatureShowcase";

// ── Design tokens ──────────────────────────────────────────────────────────
// Cool slate palette — professional SaaS, not warm editorial
const T = {
  // Brand mark (logo R only — amber stays here)
  brand:       "#c4793a",
  brandGlow:   "rgba(196,121,58,0.20)",

  // Primary action — consistent with app accent
  blue:        "#2563eb",
  blueHover:   "#1d4ed8",
  blueGlow:    "rgba(37,99,235,0.14)",

  // Semantic
  green:       "#059669",
  amber:       "#d97706",   // score bars only (not CTA)
  teal:        "#0d9488",

  // Light-mode neutrals
  bg:          "#f6f8fa",
  bg2:         "#eef0f3",
  ink:         "#0d1117",
  muted:       "#57606a",
  border:      "#d0d7de",
  surface:     "#ffffff",

  // Dark-mode neutrals
  dBg:         "#0d1117",
  dBg2:        "#161b22",
  dInk:        "#e6edf3",
  dMuted:      "#8b949e",
  dBorder:     "#30363d",
  dSurface:    "#21262d",
};

type Theme = "dark" | "light";

function useLandingTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = (localStorage.getItem("rn-theme") as Theme | null) || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);
  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("rn-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

// ── Data ────────────────────────────────────────────────────────────────────
/** Toggle "Three steps…" / How it works block on the landing page. */
const SHOW_HOW_SECTION = false;
/** Text card grids (features, platform, research pillars) — previews carry the story. */
const SHOW_LANDING_CARDS = false;

const FEATURES = [
  {
    num: "01",
    title: "Achievement",
    desc: "Flags duty-list bullets and surfaces rewrites that show outcomes, ownership, and impact — not just what you were assigned.",
  },
  {
    num: "02",
    title: "Quantification",
    desc: "Spots missing metrics and nudges you to add numbers where they strengthen credibility — without inventing data.",
  },
  {
    num: "03",
    title: "Job Match",
    desc: "Scores keyword and requirement fit against the posting so you know what’s covered, what’s missing, and what to add.",
  },
  {
    num: "04",
    title: "ATS Safety",
    desc: "Checks parsing risk — tables, columns, odd headings — before an ATS silently drops your application.",
  },
  {
    num: "05",
    title: "Readability",
    desc: "Rates skim-ability: bullet length, density, and layout so a recruiter grasps your story in a six-second pass.",
  },
  {
    num: "06",
    title: "Language",
    desc: "Catches weak verbs, passive voice, and tense drift — with proofreading-level fixes where the meaning stays yours.",
  },
];

const STEPS = [
  { title: "Upload your résumé",      desc: "Drop any existing PDF. We extract every bullet, section, and keyword — no re-typing required." },
  { title: "Paste the job posting",   desc: "URL or raw text. Our AI reads the role like a recruiter: extracting what they're actually screening for." },
  { title: "Get more callbacks",      desc: "Match score, gap analysis, rewritten bullets, and a tailored PDF — tuned so your application is more likely to earn a recruiter screen, not sit in silence." },
];

const PLATFORM_HIGHLIGHTS = [
  {
    title: "Résumé templating",
    desc: "Open the template gallery, pick a LaTeX layout (e.g. Harshibar ATS), customize accents, and compile a polished PDF — reuse the same structure for every role without rebuilding from scratch.",
    accent: T.blue,
  },
  {
    title: "Public share link",
    desc: "Mint a memorable URL like resunova.io/r/?id=your-name. Recruiters open your résumé in the browser; photo-enabled layouts keep your profile picture on the PDF they view.",
    accent: T.teal,
  },
  {
    title: "ATS scoring",
    desc: "Run an ATS best-practices checklist: parsing-safe structure, headings, dates, and formatting scored 0–100 with a clear pass/fail list — so you know what to fix before you apply.",
    accent: T.green,
  },
];

const RESEARCH_PILLARS = [
  {
    title: "MIT & Harvard-style guidance",
    desc: "Templates and coaching follow elite campus career-center conventions — including MIT-style ATS layouts (Harshibar) and Harvard-tier structuring: tight section headers, achievement bullets with metrics, and keyword discipline that reads well to humans and parsers.",
    accent: T.blue,
  },
  {
    title: "Transparent scoring mechanism",
    desc: "A headline ATS best-practices score (checklist passed ÷ total) plus JD match dimensions — readability, keyword fit, achievement quality, ATS safety — so you see which checks moved the number, not a mystery percentage.",
    accent: T.teal,
    href: "/blog/optimizing-resumes-for-ats",
    linkLabel: "How scoring works",
  },
  {
    title: "FERPA-informed data privacy",
    desc: "Built for students and campus communities: we apply FERPA-informed practices for education-related data — limited use, no sale of personal information, and training calibrated on anonymized top-company résumé corpora (Google, Figma, Meta, Amazon, Adobe). See our Privacy Policy.",
    accent: T.green,
    href: "/privacy",
    linkLabel: "Privacy Policy",
  },
];


// ── Root ────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [theme, toggleTheme]  = useLandingTheme();
  const dark = theme === "dark";
  const [showBanner, setShowBanner] = useState(false);
  useEffect(() => {
    const dismissed = localStorage.getItem("rn-banner-v2");
    if (!dismissed) setShowBanner(true);
  }, []);
  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem("rn-banner-v2", "1");
  }, []);

  const C = {
    bg:      dark ? T.dBg      : T.bg,
    bg2:     dark ? T.dBg2     : T.bg2,
    ink:     dark ? T.dInk     : T.ink,
    muted:   dark ? T.dMuted   : T.muted,
    border:  dark ? T.dBorder  : T.border,
    surface: dark ? T.dSurface : T.surface,
    glow:    dark ? "rgba(37,99,235,0.10)" : T.blueGlow,
    shadow:  dark ? "0 28px 72px rgba(0,0,0,0.60)" : "0 28px 72px rgba(13,17,23,0.10)",
  };

  async function signIn() {
    setLoading(true); setError(null);
    const sb = getSupabaseClient();
    const redirectTo = typeof window !== "undefined"
      ? window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
      : undefined;
    const { error: err } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (err) { setError(err.message); setLoading(false); }
  }

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector(".lp-header");
    const offset =
      header instanceof HTMLElement ? header.getBoundingClientRect().height + 10 : 72;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const primaryBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 10,
    padding: "13px 26px",
    background: T.blue, color: "#fff",
    border: "none", borderRadius: 10,
    fontSize: "var(--font-size-lg)", fontWeight: 600, letterSpacing: -0.2,
    cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
    transition: "background 0.15s, box-shadow 0.15s",
    opacity: loading ? 0.7 : 1,
    boxShadow: `0 4px 16px ${T.blueGlow}`,
    whiteSpace: "nowrap" as const,
  };

  const ghostBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 10,
    padding: "13px 22px",
    background: "transparent", color: C.muted,
    border: `1px solid ${C.border}`, borderRadius: 10,
    fontSize: "var(--font-size-lg)", fontWeight: 500, letterSpacing: -0.2,
    cursor: "pointer", fontFamily: "inherit",
    transition: "border-color 0.15s, color 0.15s",
    whiteSpace: "nowrap" as const,
  };

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: "'DM Sans', -apple-system, sans-serif", minHeight: "100vh" }}>

      {/* ───────────── Announcement banner ──────────────────── */}
      {showBanner && (
        <div style={{
          position: "relative", zIndex: 101,
          background: "linear-gradient(90deg, #1e40af 0%, #2563eb 50%, #0ea5e9 100%)",
          padding: "11px 48px 11px 20px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          textAlign: "center",
        }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#fff", lineHeight: 1.4 }}>
            <span style={{ marginRight: 8, fontSize: 15 }}>✨</span>
            <strong style={{ fontWeight: 700 }}>New:</strong>
            {" "}AI bullet rewrites + ATS scoring — scan your résumé free, no account needed.
            {" "}
            <button
              onClick={() => { window.location.href = "/?view=analyze"; }}
              style={{
                background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)",
                color: "#fff", borderRadius: 6, padding: "2px 10px",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                marginLeft: 6, transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.28)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.18)"; }}
            >Try it free →</button>
          </span>
          <button
            onClick={dismissBanner}
            aria-label="Dismiss banner"
            style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "rgba(255,255,255,0.6)",
              cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
          >×</button>
        </div>
      )}

      {/* ───────────── Header ───────────────────────────────── */}
      <header className="lp-header" style={{
        position: "sticky", top: 0, zIndex: 100, width: "100%",
        height: 60, padding: "0 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: dark ? "rgba(13,17,23,0.92)" : "rgba(246,248,250,0.93)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Logo — shared SVG mark + wordmark */}
        <Link href="/" prefetch={false} style={{ textDecoration: "none", color: "inherit" }} aria-label="Resunova home">
          <LogoFull markSize={28} textColor={C.ink} />
        </Link>

        {/* Nav */}
        <nav className="lp-nav" style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* Analyze link — always visible, including on mobile */}
          <button
            type="button"
            onClick={signIn}
            disabled={loading}
            style={{
              background: "none", border: "none", color: T.blue,
              fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
              fontWeight: 700, letterSpacing: -0.2, padding: 0, transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = T.blueHover; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = T.blue; }}
          >Analyze Resume</button>

          {[
            ...(SHOW_LANDING_CARDS ? [["Features", "features"]] as const : []),
            ...(SHOW_LANDING_CARDS ? [["Platform", "platform"]] as const : []),
            ["Approach", "approach"],
            ...(SHOW_HOW_SECTION ? [["How it works", "how"]] as const : []),
            ["Reviews", "reviews"],
            ["Privacy", "privacy-nav"],
          ].map(([lbl, id]) => (
            id === "privacy-nav" ? (
              <Link
                key={id}
                href="/privacy/"
                prefetch={false}
                className="lp-nav-section"
                style={{
                  color: C.muted,
                  fontSize: 13.5,
                  fontFamily: "inherit",
                  fontWeight: 500,
                  letterSpacing: -0.2,
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.ink; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
              >
                {lbl}
              </Link>
            ) : (
              <button
                key={id}
                type="button"
                className="lp-nav-section"
                onClick={() => scrollTo(id)}
                style={{
                  background: "none", border: "none", color: C.muted,
                  fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 500, letterSpacing: -0.2, padding: 0, transition: "color 0.15s",
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = C.ink; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = C.muted; }}
              >{lbl}</button>
            )
          ))}

          {/* Theme toggle */}
          <button onClick={toggleTheme} title={dark ? "Light mode" : "Dark mode"} style={{
            width: 32, height: 32, borderRadius: 8,
            background: dark ? T.dBg2 : T.bg2,
            border: `1px solid ${C.border}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: C.muted, transition: "color 0.15s",
          }}>
            {dark
              ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 000 11 6 6 0 008-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            }
          </button>

          <Button onClick={signIn} disabled={loading}
            className="inline-flex items-center gap-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold shadow-[0_4px_16px_rgba(37,99,235,0.22)] border-0 px-5 py-2.5 text-[15px]"
          >
            <GoogleG /> {loading ? "Loading…" : "Sign in"}
          </Button>
        </nav>
      </header>

      {/* overflow-x only below header — overflow on a sticky ancestor breaks position:sticky */}
      <div className="lp-main" style={{ overflowX: "hidden", minWidth: 0 }}>
      {/* ───────────── Hero ─────────────────────────────────── */}
      <section className="lp-hero-grid" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 40px 80px", display: "grid", gridTemplateColumns: "1fr 460px", gap: 56, alignItems: "center", minHeight: "88vh" }}>

        {/* Left */}
        <div style={{ animation: "lpFadeUp 0.7s ease both" }}>
          {/* Pill badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 14px", marginBottom: 36,
            background: C.glow, border: `1px solid ${T.blue}28`,
            borderRadius: 100, fontSize: "var(--font-size-sm)", color: T.blue,
            fontWeight: 600, letterSpacing: 0.2,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue, display: "inline-block" }} />
            Completely free · For students &amp; the community · AI-powered · ATS-safe
          </div>

          {/* Headline — DM Sans 800, not serif */}
          <h1 className="lp-hero-h1" style={{
            fontSize: "clamp(48px, 5.5vw, 72px)",
            fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em",
            color: C.ink, margin: "0 0 28px",
          }}>
            Your résumé,<br />
            <span style={{ color: T.blue }}>finally fluent</span><br />
            in the language<br />of opportunity.
          </h1>

          <p style={{ fontSize: "var(--font-size-xl)", color: C.muted, lineHeight: 1.72, maxWidth: 480, margin: "0 0 44px", letterSpacing: -0.15 }}>
            Upload your résumé and get an 8-dimension score, bullet-by-bullet AI rewrites, and a tailored PDF — in under 60 seconds.{" "}
            <strong style={{ color: C.ink, fontWeight: 600 }}>No account needed. Completely free.</strong>
          </p>

          {/* CTA row */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40, alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {/* Primary — frictionless scan, no OAuth required */}
              <button
                onClick={() => { window.location.href = "/?view=analyze"; }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "18px 36px",
                  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "#fff", border: "none", borderRadius: 14,
                  fontSize: 18, fontWeight: 800, letterSpacing: -0.3,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 8px 32px rgba(37,99,235,0.45), 0 2px 8px rgba(37,99,235,0.20)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-2px)";
                  el.style.boxShadow = "0 12px 40px rgba(37,99,235,0.55), 0 2px 8px rgba(37,99,235,0.20)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "";
                  el.style.boxShadow = "0 8px 32px rgba(37,99,235,0.45), 0 2px 8px rgba(37,99,235,0.20)";
                }}
              >
                Score my résumé free
                <span style={{ fontSize: 20, lineHeight: 1 }}>→</span>
              </button>

              {/* Secondary — sign in to save */}
              <button
                onClick={signIn}
                disabled={loading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 9,
                  padding: "17px 28px",
                  background: dark ? "rgba(255,255,255,0.06)" : "#fff",
                  color: dark ? "#e6edf3" : "#0d1117",
                  border: `1.5px solid ${dark ? "rgba(255,255,255,0.14)" : "#d0d7de"}`,
                  borderRadius: 14,
                  fontSize: 16, fontWeight: 600, letterSpacing: -0.2,
                  cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
                  boxShadow: dark ? "none" : "0 2px 8px rgba(13,17,23,0.06)",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  opacity: loading ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = T.blue;
                  el.style.boxShadow = `0 0 0 3px ${T.blueGlow}`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = dark ? "rgba(255,255,255,0.14)" : "#d0d7de";
                  el.style.boxShadow = dark ? "none" : "0 2px 8px rgba(13,17,23,0.06)";
                }}
              >
                <GoogleG /> {loading ? "Loading…" : "Sign in with Google"}
              </button>
            </div>

            {/* Trust micro-copy */}
            <p style={{ fontSize: 13, color: C.muted, margin: 0, letterSpacing: -0.1 }}>
              No account needed to score &nbsp;·&nbsp; Sign in to save your analysis &nbsp;·&nbsp; Always free
            </p>
          </div>

          {error && <p style={{ fontSize: "var(--font-size-base)", color: "#f85149", marginBottom: 16 }}>{error}</p>}

          {/* Social proof */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex" }}>
              {[["P","#4285f4"],["R","#ff9900"],["V","#276ef1"],["A","#7c3aed"],["M","#0d9488"],["N","#2563eb"]].map(([l,bg], i) => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: bg, border: `2px solid ${C.bg}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: "var(--font-size-sm)",
                  marginLeft: i > 0 ? -9 : 0, zIndex: 5 - i, position: "relative",
                }}>{l}</div>
              ))}
            </div>
            <span style={{ fontSize: "var(--font-size-base)", color: C.muted }}>
              <b style={{ color: C.ink, fontWeight: 600 }}>400+</b> early users · more interview callbacks reported
            </span>
          </div>
        </div>

        {/* Right: animated score preview */}
        <div
          className="lp-hero-preview"
          style={{
            transform: "rotate(1.5deg)",
            animation: "cardSlide 0.8s cubic-bezier(0.34,1.36,0.64,1) 0.3s both, heroFloat 6s ease-in-out 1.1s infinite",
            transformOrigin: "center top",
            position: "relative",
          }}
        >
          <div style={{
            position: "absolute", top: -14, right: 18, zIndex: 2,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            color: "#fff",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            padding: "5px 12px", borderRadius: 20, textTransform: "uppercase",
            boxShadow: "0 4px 16px rgba(37,99,235,0.35), 0 0 0 1px rgba(255,255,255,0.15) inset",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#4ade80", boxShadow: "0 0 8px #4ade80",
              animation: "pulse 2s infinite",
            }} />
            Live analysis
          </div>
          <VariantA embedded />
        </div>
      </section>

      <LandingPreviewStyles />

      {/* ───────────── Stats ticker ─────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bg2, overflow: "hidden", padding: "18px 0" }}>
        <div style={{ display: "flex", gap: 0, width: "max-content", animation: "ticker 36s linear infinite" }}>
          {[...Array(4)].flatMap(() => [
            ["$0",      "Completely free — always"],
            ["400+",    "Job seekers so far"],
            ["60s",     "Typical tailoring time"],
            ["4.7 ★",   "Early user rating"],
            ["ATS",     "Best-practices checklist"],
            ["Callbacks", "Recruiter & phone screens"],
            ["FERPA",   "FERPA-informed student privacy"],
          ]).map(([stat, lbl], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 40px", flexShrink: 0 }}>
              <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: T.blue, letterSpacing: -0.5 }}>{stat}</span>
              <span style={{ fontSize: "var(--font-size-base)", color: C.muted, whiteSpace: "nowrap" }}>{lbl}</span>
              <span style={{ color: C.border, marginLeft: 12, fontSize: "var(--font-size-xl)" }}>·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ───────────── AI rewrite preview (B) ─────────────── */}
      <LandingPreviewSection
        id="product-rewrite"
        eyebrow="Bullet rewrites"
        title="Vague lines become interview-ready achievements."
        desc="Resunova flags duty-list bullets and suggests rewrites with stronger verbs and real metrics — using only facts already on your résumé."
        dark
        C={C}
        wide
        animationOnly={!SHOW_LANDING_CARDS}
        ctaLabel="Fix my bullets free"
        ctaHref="/?view=analyze"
      >
        <VariantB embedded />
      </LandingPreviewSection>

      {SHOW_LANDING_CARDS && (
      <section id="features" style={{ padding: "120px 40px", maxWidth: 1200, margin: "0 auto", scrollMarginTop: 76 }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
            What we analyze
          </p>
          <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0, maxWidth: 540 }}>
            Every dimension of<br />a recruiter&apos;s decision.
          </h2>
          <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, lineHeight: 1.65, maxWidth: 520, margin: "16px 0 0" }}>
            Six scores from the Analyze flow — the ones that matter most in a first-pass screen.
          </p>
        </div>

        {/* Grid */}
        <div className="lp-feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          {FEATURES.map((f, i) => <FeatureCell key={i} f={f} dark={dark} C={C} />)}
        </div>
      </section>
      )}

      <LandingPreviewSection
        id="product-scan"
        eyebrow="Line-by-line analysis"
        title="See what a recruiter would flag — before you apply."
        desc="Upload a PDF and get flagged weaknesses, strong bullets, and a first fix you can accept in one click."
        C={C}
        wide
        animationOnly={!SHOW_LANDING_CARDS}
        ctaLabel="Scan my résumé free"
        ctaHref="/?view=analyze"
      >
        <VariantE embedded />
      </LandingPreviewSection>

      {SHOW_LANDING_CARDS && (
      <section id="platform" style={{ background: C.bg2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, scrollMarginTop: 76 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
              Built into Resunova
            </p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
              Templating, sharing &amp; ATS scoring.
            </h2>
            <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, lineHeight: 1.65, maxWidth: 560, margin: "18px auto 0" }}>
              Beyond JD tailoring — publish, score, and format your résumé in one place.
            </p>
          </div>
          <div className="lp-platform-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {PLATFORM_HIGHLIGHTS.map((h, i) => (
              <PlatformHighlightCard key={i} h={h} dark={dark} C={C} />
            ))}
          </div>
        </div>
      </section>
      )}

      <LandingPreviewSection
        id="product-tour"
        eyebrow="Tailor to the role"
        title="Match the job, close keyword gaps, export."
        desc="Paste a posting, score your fit, apply fixes across bullets and keywords, then download a PDF that matches the preview."
        C={C}
        bg={C.surface}
        wide
        animationOnly={!SHOW_LANDING_CARDS}
        ctaLabel="Tailor my résumé now"
        ctaHref="/?view=analyze"
      >
        <VariantD embedded />
      </LandingPreviewSection>

      {/* ───────────── Jobs section ──────────────────────────── */}
      <section style={{ padding: "100px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }} className="lp-jobs-grid">

          {/* Left — copy + features */}
          <div>
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
              Your job search, upgraded
            </p>
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: -1, margin: "0 0 20px", color: C.ink }}>
              Find jobs that fit —<br />before you apply.
            </h2>
            <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, lineHeight: 1.7, margin: "0 0 40px" }}>
              A scored, profile-aware feed so you spend time on the roles most likely to call you back.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
              {([
                {
                  svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
                  bg: "rgba(37,99,235,0.10)", color: T.blue, title: "Role-matched feed", desc: "Postings scored against your saved target roles and preferred locations.",
                },
                {
                  svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>,
                  bg: "rgba(22,163,74,0.10)", color: "#16a34a", title: "Résumé match score", desc: "See exactly how well your résumé fits each job before you write a word.",
                },
                {
                  svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>,
                  bg: "rgba(217,119,6,0.10)", color: "#d97706", title: "One-click tailor", desc: "Paste the posting, close keyword gaps, and download a tailored PDF.",
                },
                {
                  svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
                  bg: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: C.muted, title: "Track applications", desc: "Save jobs, track your status, never lose a follow-up.",
                },
              ] as Array<{ svg: React.ReactNode; bg: string; color: string; title: string; desc: string }>).map(({ svg, bg, color, title, desc }) => (
                <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, color }}>
                    {svg}
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-size-base)", fontWeight: 700, color: C.ink, marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: C.muted, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { window.location.href = "/?view=jobs"; }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 28px",
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#fff", border: "none", borderRadius: 12,
                fontSize: "var(--font-size-base)", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 28px rgba(37,99,235,0.45)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = ""; el.style.boxShadow = "0 4px 20px rgba(37,99,235,0.35)"; }}
            >
              Browse matched jobs <span style={{ fontSize: 18 }}>→</span>
            </button>
          </div>

          {/* Right — job card stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Top card — featured / target role */}
            {[
              { logo: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>, title: "Software Engineer II", company: "Google · Remote · Full-time", match: 91, target: true, featured: true, opacity: 1 },
              { logo: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" fill="#635BFF"/></svg>, title: "Backend Engineer", company: "Stripe · New York · Full-time", match: 78, target: false, featured: false, opacity: 0.78 },
              { logo: <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/></svg>, title: "Product Manager", company: "Meta · Menlo Park · Full-time", match: 44, target: false, featured: false, opacity: 0.38 },
            ].map(({ logo, title, company, match, target, featured, opacity }) => (
              <div key={title} style={{
                background: C.surface,
                border: featured ? `2px solid ${T.blue}` : `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "16px 18px",
                display: "flex", alignItems: "center", gap: 14,
                opacity,
                transition: "opacity 0.2s",
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {logo}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: "var(--font-size-base)", fontWeight: 700, color: C.ink }}>{title}</span>
                    {target && (
                      <span style={{ background: "rgba(37,99,235,0.10)", color: T.blue, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <i className="ti ti-target" style={{ fontSize: 11 }} aria-hidden="true" /> Target role
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "var(--font-size-sm)", color: C.muted, margin: "0 0 8px" }}>{company}</p>
                  <div style={{ height: 4, background: C.bg2, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${match}%`, background: match >= 70 ? "#16a34a" : match >= 50 ? "#d97706" : C.muted, borderRadius: 99, transition: "width 0.6s ease" }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: match >= 70 ? "#16a34a" : match >= 50 ? "#d97706" : C.muted, lineHeight: 1 }}>{match}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>match</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Research & data approach ─────────────── */}
      <section id="approach" style={{ padding: "100px 40px", maxWidth: 1200, margin: "0 auto", scrollMarginTop: 76 }}>
        <div style={{ display: "grid", gridTemplateColumns: SHOW_LANDING_CARDS ? "1fr 1fr" : "1fr", gap: 56, alignItems: "start", maxWidth: SHOW_LANDING_CARDS ? undefined : 640 }} className="lp-approach-grid">
          <div>
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
              How we build
            </p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.03em", color: C.ink, margin: "0 0 20px" }}>
              MIT &amp; Harvard guidance. Top-company training.
            </h2>
            <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, lineHeight: 1.72, margin: "0 0 16px" }}>
              Our scoring mechanism blends campus career-center playbooks (MIT- and Harvard-style structure) with recruiter-informed match dimensions. Models and checklists are trained and calibrated on résumés and job descriptions from Google, Figma, Meta, Amazon, Adobe, and other top tech roles in our library — then improved responsibly with product data.
            </p>
            <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, lineHeight: 1.68, margin: 0 }}>
              Student data is handled with <strong style={{ color: C.ink, fontWeight: 600 }}>FERPA-informed privacy</strong>
              {" "}— we do not sell personal data. Training and quality work use only what our{" "}
              <Link href="/privacy" prefetch={false} style={{ color: T.blue, textDecoration: "none", fontWeight: 600 }}>Privacy Policy</Link>
              {" "}allows: operating the service, analytics, and internal model improvement for the community.
            </p>
          </div>
          {SHOW_LANDING_CARDS && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {RESEARCH_PILLARS.map((p, i) => (
              <PlatformHighlightCard key={i} h={p} dark={dark} C={C} compact />
            ))}
          </div>
          )}
        </div>
      </section>

      {/* How it works — hidden via SHOW_HOW_SECTION */}
      {SHOW_HOW_SECTION && (
      <section id="how" style={{ borderBottom: `1px solid ${C.border}`, scrollMarginTop: 76 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>The process</p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
              Three steps to your next interview callback.
            </h2>
          </div>
          <div className="lp-step-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
            {STEPS.map((s, i) => (
              <div key={i}>
                {/* Step number — large bold DM Sans, blue */}
                <div style={{ fontSize: "var(--font-size-4xl)", fontWeight: 800, color: T.blue, opacity: 0.18, lineHeight: 1, marginBottom: 20, letterSpacing: -3 }}>
                  0{i + 1}
                </div>
                <h3 style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: C.ink, margin: "0 0 12px", letterSpacing: -0.4 }}>{s.title}</h3>
                <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, lineHeight: 1.72, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ───────────── Company logos ────────────────────────── */}
      <section id="reviews" style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bg2, padding: "72px 40px", scrollMarginTop: 76 }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: "var(--font-size-sm)", fontWeight: 600, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 48px" }}>
            Where our users are interviewing
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 56, flexWrap: "wrap" }}>
            {/* Google */}
            <svg height="24" viewBox="0 0 74 24" fill="none" aria-label="Google" style={{ opacity: dark ? 0.55 : 0.5 }}>
              <path d="M9.24 8.19v2.46h5.88c-.26 1.57-1.67 4.22-5.88 4.22-3.54 0-6.43-2.93-6.43-6.54S5.7 1.79 9.24 1.79c2.03 0 3.39.86 4.16 1.61l2.84-2.73C14.45.5 12.03-.5 9.24-.5 4.13-.5.01 3.63.01 8.73s4.12 9.23 9.23 9.23c5.33 0 8.86-3.75 8.86-9.03 0-.6-.07-1.07-.16-1.53L9.24 8.19z" fill="currentColor" transform="translate(0,6)" style={{ color: dark ? "#e6edf3" : "#57606a" }} />
              <text x="22" y="19" fontFamily="-apple-system,sans-serif" fontSize="18" fontWeight="500" fill={dark ? "#8b949e" : "#57606a"}>Google</text>
            </svg>
            {/* Meta */}
            <svg height="22" viewBox="0 0 80 22" aria-label="Meta" style={{ opacity: dark ? 0.55 : 0.5 }}>
              <text x="0" y="17" fontFamily="-apple-system,sans-serif" fontSize="20" fontWeight="700" letterSpacing="-0.5" fill={dark ? "#8b949e" : "#57606a"}>Meta</text>
            </svg>
            {/* Amazon */}
            <svg height="26" viewBox="0 0 90 26" aria-label="Amazon" style={{ opacity: dark ? 0.55 : 0.5 }}>
              <text x="0" y="18" fontFamily="-apple-system,sans-serif" fontSize="18" fontWeight="500" fill={dark ? "#8b949e" : "#57606a"}>amazon</text>
              <path d="M2 23 Q22 29 46 23" stroke={dark ? "#8b949e" : "#57606a"} strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            {/* Microsoft */}
            <svg height="22" viewBox="0 0 110 22" aria-label="Microsoft" style={{ opacity: dark ? 0.55 : 0.5 }}>
              <rect x="0" y="1" width="9" height="9" fill={dark ? "#8b949e" : "#57606a"} />
              <rect x="10" y="1" width="9" height="9" fill={dark ? "#8b949e" : "#57606a"} />
              <rect x="0" y="11" width="9" height="9" fill={dark ? "#8b949e" : "#57606a"} />
              <rect x="10" y="11" width="9" height="9" fill={dark ? "#8b949e" : "#57606a"} />
              <text x="24" y="16" fontFamily="-apple-system,sans-serif" fontSize="15" fontWeight="400" fill={dark ? "#8b949e" : "#57606a"}>Microsoft</text>
            </svg>
            {/* Apple */}
            <svg height="24" viewBox="0 0 60 24" aria-label="Apple" style={{ opacity: dark ? 0.55 : 0.5 }}>
              <path d="M11.5 0C10.2 0 8.7.8 7.9 1.9 7.2 2.9 6.6 4.4 6.8 5.9c1.4.1 2.9-.7 3.7-1.8C11.3 3 11.9 1.5 11.5 0zm3.4 6c-1.9 0-3.5 1.1-4.4 1.1-.9 0-2.4-1-4-1-2 0-4 1.2-5 3-2.2 3.8-.6 9.4 1.6 12.5 1 1.5 2.3 3.1 3.9 3.1 1.6 0 2.2-1 4.1-1 1.9 0 2.4 1 4.1 1 1.7 0 2.8-1.5 3.9-3 1.2-1.7 1.7-3.4 1.7-3.5-.1 0-3.2-1.2-3.2-4.7 0-3 2.4-4.4 2.5-4.5C18.7 6.5 16.6 6 14.9 6z" fill={dark ? "#8b949e" : "#57606a"} />
            </svg>
            {/* Stripe */}
            <svg height="22" viewBox="0 0 52 22" aria-label="Stripe" style={{ opacity: dark ? 0.55 : 0.5 }}>
              <text x="0" y="17" fontFamily="-apple-system,sans-serif" fontSize="20" fontWeight="600" fill={dark ? "#8b949e" : "#57606a"}>Stripe</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ───────────── Post-logos CTA nudge ─────────────────── */}
      <div style={{ background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: "36px 40px", textAlign: "center" }}>
        <p style={{ fontSize: "var(--font-size-lg)", color: C.muted, margin: "0 0 18px", fontWeight: 500 }}>
          Is your résumé ready for these companies?
        </p>
        <button
          onClick={() => { window.location.href = "/?view=analyze"; }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "14px 32px",
            background: T.blue, color: "#fff",
            border: "none", borderRadius: 12,
            fontSize: 16, fontWeight: 700, letterSpacing: -0.2,
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = "translateY(-2px)";
            el.style.boxShadow = "0 8px 28px rgba(37,99,235,0.5)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = "";
            el.style.boxShadow = "0 4px 20px rgba(37,99,235,0.35)";
          }}
        >
          Check my résumé score — it&apos;s free <span style={{ fontSize: 18 }}>→</span>
        </button>
      </div>

      {/* ───────────── Final CTA ────────────────────────────── */}
      <section style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #0ea5e9 100%)", padding: "100px 40px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.04em", color: "#fff", margin: "0 0 20px" }}>
          Your next interview<br />starts here.
        </h2>
        <p style={{ fontSize: "var(--font-size-xl)", color: "rgba(255,255,255,0.82)", margin: "0 0 44px", lineHeight: 1.65, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          <strong style={{ color: "#fff", fontWeight: 700 }}>Completely free</strong>
          {" "}— for students, lifelong learners, and anyone in the job-seeking community. No credit card, no hidden tiers. Tailor in 60 seconds and apply with a résumé built to earn callbacks.
        </p>

        {/* Dual CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <button
            onClick={() => { window.location.href = "/?view=analyze"; }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "18px 40px",
              background: "#fff", color: T.blue,
              border: "none", borderRadius: 14,
              fontSize: 18, fontWeight: 800, letterSpacing: -0.3,
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 8px 32px rgba(0,0,0,0.20)",
              transition: "transform 0.15s, box-shadow 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 12px 40px rgba(0,0,0,0.28)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "";
              el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.20)";
            }}
          >
            Score my résumé free <span style={{ fontSize: 20 }}>→</span>
          </button>

          <button
            onClick={signIn}
            disabled={loading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              padding: "17px 30px",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              border: "1.5px solid rgba(255,255,255,0.30)",
              borderRadius: 14,
              fontSize: 16, fontWeight: 600, letterSpacing: -0.2,
              cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
              transition: "background 0.15s, border-color 0.15s",
              whiteSpace: "nowrap",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "rgba(255,255,255,0.22)";
              el.style.borderColor = "rgba(255,255,255,0.50)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "rgba(255,255,255,0.12)";
              el.style.borderColor = "rgba(255,255,255,0.30)";
            }}
          >
            <GoogleG /> {loading ? "Loading…" : "Sign in with Google"}
          </button>
        </div>

        {/* Micro-copy */}
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0 }}>
          No credit card &nbsp;·&nbsp; No paywall &nbsp;·&nbsp; Cancel-nothing
        </p>
      </section>

      {/* ───────────── Footer ───────────────────────────────── */}
      <footer className="lp-footer" style={{
        borderTop: `1px solid ${C.border}`,
        background: C.bg2,
      }}>
        <div className="lp-footer-inner" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px 28px" }}>
          <div className="lp-footer-top" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 40,
            flexWrap: "wrap",
            marginBottom: 32,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, maxWidth: 320 }}>
              <Link href="/" prefetch={false} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", width: "fit-content" }}>
                <LogoMark size={24} />
                <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>Resunova</span>
              </Link>
              <p style={{ fontSize: "var(--font-size-sm)", color: C.muted, margin: 0, lineHeight: 1.55 }}>
                Résumé scoring and tailoring — free for students and job seekers.
              </p>
            </div>

            <nav className="lp-footer-nav" aria-label="Footer" style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              {[
                ["Blog", "/blog"],
                ["Contact", "/contact"],
                ["Privacy", "/privacy"],
                ["Terms", "/terms"],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  className="lp-footer-link"
                  style={{ fontSize: "var(--font-size-sm)", color: C.muted, textDecoration: "none", fontWeight: 500, transition: "color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.ink; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="lp-footer-bottom" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            paddingTop: 24,
            borderTop: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: C.muted }}>© 2026 Resunova. All rights reserved.</span>
            <a
              href={SITE_URL}
              className="lp-footer-link"
              style={{ fontSize: "var(--font-size-xs)", color: C.muted, textDecoration: "none", fontWeight: 500, transition: "color 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.blue; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
            >
              {SITE_URL.replace(/^https:\/\//, "")}
            </a>
          </div>
        </div>
      </footer>

      {/* ── Global keyframes ────────────────────────────────── */}
      <style>{`
        @keyframes lpFadeUp  { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        @keyframes ticker    { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes barFill   { from { width: 0; } to { width: var(--w); } }
        @keyframes ringDraw  { from { stroke-dashoffset: var(--full); } to { stroke-dashoffset: var(--off); } }
        @keyframes cardSlide { from { opacity: 0; transform: translateY(32px) rotate(1.5deg); } to { opacity: 1; transform: rotate(1.5deg); } }
        @keyframes heroFloat { 0%, 100% { transform: rotate(1.5deg) translateY(0); } 50% { transform: rotate(1.5deg) translateY(-6px); } }
        @media (max-width: 860px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-hero-preview { transform: none !important; max-width: 420px; margin: 0 auto; }
          .lp-feat-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-step-grid { grid-template-columns: 1fr !important; }
          .lp-rev-grid  { grid-template-columns: 1fr !important; }
          .lp-platform-grid { grid-template-columns: 1fr !important; }
          .lp-approach-grid { grid-template-columns: 1fr !important; }
          .lp-jobs-grid { grid-template-columns: 1fr !important; }
          .lp-hero-h1   { font-size: 48px !important; }
        }
        @media (max-width: 640px) {
          .lp-footer-top { flex-direction: column !important; gap: 24px !important; }
          .lp-footer-nav { width: 100%; gap: 16px !important; }
          .lp-footer-bottom { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
        }
        @media (max-width: 600px) {
          .lp-header { padding: 0 16px !important; }
          .lp-nav { gap: 10px !important; }
          .lp-nav-section { display: none !important; }
        }
        @media (max-width: 540px) {
          .lp-feat-grid { grid-template-columns: 1fr !important; }
          .lp-hero-h1   { font-size: 38px !important; }
        }
        .lp-preview-e-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 720px) {
          .lp-preview-e-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      </div>
    </div>
  );
}

// ── Product preview section wrapper ─────────────────────────────────────────
function LandingPreviewSection({
  id,
  eyebrow,
  title,
  desc,
  dark = false,
  wide = false,
  bg,
  animationOnly = false,
  ctaLabel,
  ctaHref,
  C,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  desc?: string;
  dark?: boolean;
  wide?: boolean;
  bg?: string;
  animationOnly?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  C: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        padding: animationOnly ? "80px 40px" : "100px 40px",
        background: bg ?? (dark ? "#0f172a" : C.bg2),
        borderTop: dark ? undefined : `1px solid ${C.border}`,
        scrollMarginTop: 76,
      }}
    >
      <div style={{ maxWidth: wide ? 960 : 800, margin: "0 auto", textAlign: animationOnly ? "center" : undefined }}>
        <p style={{
          fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.15em",
          color: T.blue, textTransform: "uppercase", margin: "0 0 12px",
        }}>{eyebrow}</p>
        <h2 className="lp-h2" style={{
          fontSize: animationOnly ? "clamp(24px, 3vw, 36px)" : "clamp(28px, 3.5vw, 44px)",
          fontWeight: 800, lineHeight: 1.12,
          letterSpacing: "-0.03em", color: dark ? "#f8fafc" : C.ink,
          margin: "0 0 10px",
          maxWidth: animationOnly ? 640 : undefined,
          marginLeft: animationOnly ? "auto" : undefined,
          marginRight: animationOnly ? "auto" : undefined,
        }}>{title}</h2>
        {desc ? (
          <p style={{
            fontSize: animationOnly ? "var(--font-size-base)" : "var(--font-size-lg)",
            color: dark ? "#94a3b8" : C.muted,
            lineHeight: 1.6,
            margin: animationOnly ? "0 auto 32px" : "0 0 40px",
            maxWidth: animationOnly ? 520 : 560,
          }}>{desc}</p>
        ) : null}
        {children}
        {ctaLabel && ctaHref && (
          <div style={{ marginTop: 36, textAlign: animationOnly ? "center" : undefined }}>
            <button
              onClick={() => { window.location.href = ctaHref; }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px",
                background: dark ? "rgba(255,255,255,0.10)" : T.blue,
                color: "#fff",
                border: dark ? "1.5px solid rgba(255,255,255,0.20)" : "none",
                borderRadius: 12,
                fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: dark ? "none" : "0 4px 20px rgba(37,99,235,0.35)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-1px)";
                el.style.boxShadow = dark ? "none" : "0 8px 28px rgba(37,99,235,0.45)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.boxShadow = dark ? "none" : "0 4px 20px rgba(37,99,235,0.35)";
              }}
            >
              {ctaLabel} <span style={{ fontSize: 17 }}>→</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Feature cell ────────────────────────────────────────────────────────────
type HighlightCardContent = {
  title: string;
  desc: string;
  accent: string;
  href?: string;
  linkLabel?: string;
};

function PlatformHighlightCard({
  h,
  dark,
  C,
  compact = false,
}: {
  h: HighlightCardContent;
  dark: boolean;
  C: Record<string, string>;
  compact?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const icon =
    h.title === "Résumé templating" ? "T"
    : h.title === "Public share link" ? "↗"
    : h.title === "ATS scoring" ? "✓"
    : h.title.startsWith("MIT") ? "M"
    : h.title.startsWith("Transparent") ? "%"
    : h.title.startsWith("FERPA") ? "F"
    : h.title.startsWith("Top-company") ? "G"
    : "◎";
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: compact ? "20px 22px" : "32px 28px",
        background: C.surface,
        border: `1px solid ${hover ? (dark ? T.dBorder : "#c8d1da") : C.border}`,
        borderRadius: 16,
        boxShadow: hover
          ? (dark ? "0 8px 32px rgba(0,0,0,0.35)" : "0 8px 32px rgba(13,17,23,0.08)")
          : "none",
        transition: "box-shadow 0.2s, border-color 0.2s",
        display: compact ? "flex" : "block",
        gap: compact ? 14 : undefined,
        alignItems: compact ? "flex-start" : undefined,
      }}
    >
      <div
        style={{
          width: compact ? 36 : 40,
          height: compact ? 36 : 40,
          flexShrink: 0,
          borderRadius: 10,
          background: `${h.accent}18`,
          border: `1px solid ${h.accent}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: compact ? 0 : 18,
          fontSize: compact ? 15 : 18,
          fontWeight: 800,
          color: h.accent,
          letterSpacing: -0.5,
        }}
        aria-hidden
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: compact ? 16 : 18, fontWeight: 700, color: C.ink, margin: "0 0 8px", letterSpacing: -0.35 }}>
          {h.title}
        </h3>
        <p style={{ fontSize: compact ? 13.5 : 14, color: C.muted, lineHeight: 1.68, margin: 0 }}>{h.desc}</p>
        {h.href && h.linkLabel ? (
          <Link
            href={h.href}
            prefetch={false}
            style={{
              display: "inline-block",
              marginTop: 10,
              fontSize: "var(--font-size-base)",
              fontWeight: 600,
              color: T.blue,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            {h.linkLabel} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// ── Feature grid cell ────────────────────────────────────────────────────────
function FeatureCell({ f, dark, C }: { f: typeof FEATURES[0]; dark: boolean; C: Record<string,string> }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "36px 32px",
        background: hover ? (dark ? "#1e2329" : "#f0f3f7") : C.surface,
        transition: "background 0.2s",
      }}
    >
      {/* Feature number — bold blue DM Sans, no serif */}
      <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, color: T.blue, letterSpacing: "0.08em", marginBottom: 14 }}>{f.num}</div>
      <h3 style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: C.ink, margin: "0 0 10px", letterSpacing: -0.4 }}>{f.title}</h3>
      <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.72, margin: 0 }}>{f.desc}</p>
    </div>
  );
}

// ── Google G icon ─────────────────────────────────────────────────────────────
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/>
    </svg>
  );
}
