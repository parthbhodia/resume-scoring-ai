"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/brand";
import { LogoFull, LogoMark } from "./BrandLogo";

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
const FEATURES = [
  { num: "01", title: "Match Score",          desc: "0–100 breakdown across eight dimensions—readability, ATS safety, achievement quality, keyword fit, field signals, and more—tuned for any major or career path." },
  { num: "02", title: "Keyword Intelligence", desc: "Extract every keyword the JD demands. See which ones you're missing — and get precise suggestions on where to add them." },
  { num: "03", title: "AI Bullet Rewrites",   desc: "Turn vague duty-lists into achievement narratives with metrics. Your voice, amplified. Truthfulness preserved." },
  { num: "04", title: "ATS Compatibility",    desc: "Detect tables, columns, and formatting that breaks applicant tracking systems before they reject you silently." },
  { num: "05", title: "Language Quality",     desc: "Passive voice, weak verbs, pronouns, tense drift — flagged and fixed. Precise, confident, recruiter-ready." },
  { num: "06", title: "Instant PDF Export",   desc: "Every tailored version compiled to a clean, ATS-safe PDF in seconds. No templates. No design work." },
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
    title: "Top-company training corpus",
    desc: "Prompts and rubrics are calibrated on anonymized résumés and job descriptions from Google, Figma, Meta, Amazon, Adobe, and similar tech roles in our library — then refined with product analytics and permitted user content per our Privacy Policy.",
    accent: T.green,
    href: "/privacy",
    linkLabel: "Privacy Policy",
  },
];

type Review = {
  quote: string;
  name: string;
  role: string;
  company?: string;
  avatar: string;
  col: string;
};

const REVIEWS: Review[] = [
  {
    quote: "Months of applying to Google with no reply. After tailoring here, I got my first recruiter screen in two weeks — that callback was the win.",
    name: "Priya S.",
    role: "SWE applicant",
    company: "Google",
    avatar: "P",
    col: "#4285f4",
  },
  {
    quote: "Amazon’s JD was keyword-heavy. Resunova showed gaps I could honestly fix — I submitted on a Friday and had a phone screen invite the next week.",
    name: "Rohan K.",
    role: "SDE applicant",
    company: "Amazon",
    avatar: "R",
    col: "#ff9900",
  },
  {
    quote: "Uber roles were going quiet for me. Cleaner bullets and a stronger ATS score — then two interview requests in the same month.",
    name: "Vikram M.",
    role: "Ops applicant",
    company: "Uber",
    avatar: "V",
    col: "#276ef1",
  },
  {
    quote: "Campus hiring — I tailored one base résumé to five JDs in an afternoon. Three companies scheduled interviews; before that it was mostly automated rejections.",
    name: "Ananya R.",
    role: "New grad · CS",
    company: "Hyderabad",
    avatar: "A",
    col: "#7c3aed",
  },
  {
    quote: "Weeks of silence on applications. The ATS checklist fixed date formats and section headers — interview requests picked up again within a few applies.",
    name: "Meera N.",
    role: "Data analyst",
    company: "Bengaluru",
    avatar: "M",
    col: "#0d9488",
  },
  {
    quote: "Free, no card upfront. Our batch uses it before every apply — we compare notes on who got recruiter screens and phone interviews.",
    name: "Arjun D.",
    role: "Backend dev",
    company: "Pune",
    avatar: "J",
    col: "#2563eb",
  },
];

// ── Root ────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [theme, toggleTheme]  = useLandingTheme();
  const dark = theme === "dark";

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
    fontSize: 14, fontWeight: 600, letterSpacing: -0.2,
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
    fontSize: 14, fontWeight: 500, letterSpacing: -0.2,
    cursor: "pointer", fontFamily: "inherit",
    transition: "border-color 0.15s, color 0.15s",
    whiteSpace: "nowrap" as const,
  };

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: "'DM Sans', -apple-system, sans-serif", minHeight: "100vh" }}>

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
          {[["Features","features"],["Platform","platform"],["Approach","approach"],["How it works","how"],["Reviews","reviews"]].map(([lbl,id]) => (
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

          <button onClick={signIn} disabled={loading} style={primaryBtn}>
            <GoogleG /> {loading ? "Loading…" : "Sign in"}
          </button>
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
            borderRadius: 100, fontSize: 12, color: T.blue,
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

          <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.72, maxWidth: 480, margin: "0 0 44px", letterSpacing: -0.15 }}>
            Paste any job description and get an AI-tailored resume in 60 seconds — with a match score, gap analysis, and ATS-safe PDF.
            {" "}
            <strong style={{ color: C.ink, fontWeight: 600 }}>Built to get you interview callbacks</strong>
            {" "}— recruiter screens and phone screens that get you in the door.
            {" "}
            <strong style={{ color: C.ink, fontWeight: 600 }}>Completely free</strong>
            {" "}for students and the community, without paywalls or surprise charges.
          </p>

          {/* CTA row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 40 }}>
            <button onClick={signIn} disabled={loading} style={primaryBtn}
              onMouseEnter={e => { if (!loading) (e.currentTarget).style.background = T.blueHover; }}
              onMouseLeave={e => { if (!loading) (e.currentTarget).style.background = T.blue; }}
            >
              <GoogleG /> Get started — it&apos;s free
            </button>
            <button onClick={() => scrollTo("how")} style={ghostBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.blue; (e.currentTarget as HTMLElement).style.color = T.blue; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}
            >See how it works</button>
          </div>

          {error && <p style={{ fontSize: 13, color: "#f85149", marginBottom: 16 }}>{error}</p>}

          {/* Social proof */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex" }}>
              {[["P","#4285f4"],["R","#ff9900"],["V","#276ef1"],["A","#7c3aed"],["M","#0d9488"],["N","#2563eb"]].map(([l,bg], i) => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: bg, border: `2px solid ${C.bg}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 11,
                  marginLeft: i > 0 ? -9 : 0, zIndex: 5 - i, position: "relative",
                }}>{l}</div>
              ))}
            </div>
            <span style={{ fontSize: 13, color: C.muted }}>
              <b style={{ color: C.ink, fontWeight: 600 }}>400+</b> early users · more interview callbacks reported
            </span>
          </div>
        </div>

        {/* Right: animated demo card */}
        <DemoCard dark={dark} C={C} />
      </section>

      {/* ───────────── Stats ticker ─────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bg2, overflow: "hidden", padding: "18px 0" }}>
        <div style={{ display: "flex", gap: 0, width: "max-content", animation: "ticker 36s linear infinite" }}>
          {[...Array(4)].flatMap(() => [
            ["$0",      "Completely free — always"],
            ["400+",    "Job seekers so far"],
            ["60s",     "Typical tailoring time"],
            ["4.7 ★",   "Early user rating"],
            ["ATS",     "Best-practices checklist"],
            ["India",   "Students & early community"],
            ["Callbacks", "Recruiter & phone screens"],
            ["Privacy", "We don’t sell your data"],
          ]).map(([stat, lbl], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 40px", flexShrink: 0 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: T.blue, letterSpacing: -0.5 }}>{stat}</span>
              <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>{lbl}</span>
              <span style={{ color: C.border, marginLeft: 12, fontSize: 18 }}>·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ───────────── Features ─────────────────────────────── */}
      <section id="features" style={{ padding: "120px 40px", maxWidth: 1200, margin: "0 auto", scrollMarginTop: 76 }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
            What we analyze
          </p>
          <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0, maxWidth: 540 }}>
            Every dimension of<br />a recruiter&apos;s decision.
          </h2>
        </div>

        {/* Grid */}
        <div className="lp-feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          {FEATURES.map((f, i) => <FeatureCell key={i} f={f} dark={dark} C={C} />)}
        </div>
      </section>

      {/* ───────────── Platform highlights ──────────────────── */}
      <section id="platform" style={{ background: C.bg2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, scrollMarginTop: 76 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
              Built into Resunova
            </p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
              Templating, sharing &amp; ATS scoring.
            </h2>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, maxWidth: 560, margin: "18px auto 0" }}>
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

      {/* ───────────── Research & data approach ─────────────── */}
      <section id="approach" style={{ padding: "100px 40px", maxWidth: 1200, margin: "0 auto", scrollMarginTop: 76 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "start" }} className="lp-approach-grid">
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>
              How we build
            </p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.03em", color: C.ink, margin: "0 0 20px" }}>
              MIT &amp; Harvard guidance. Top-company training.
            </h2>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.72, margin: "0 0 16px" }}>
              Our scoring mechanism blends campus career-center playbooks (MIT- and Harvard-style structure) with recruiter-informed match dimensions. Models and checklists are trained and calibrated on résumés and job descriptions from Google, Figma, Meta, Amazon, Adobe, and other top tech roles in our library — then improved responsibly with product data.
            </p>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.68, margin: 0 }}>
              We do <strong style={{ color: C.ink, fontWeight: 600 }}>not</strong> sell your personal data. Training and quality work use only what our{" "}
              <Link href="/privacy" prefetch={false} style={{ color: T.blue, textDecoration: "none", fontWeight: 600 }}>Privacy Policy</Link>
              {" "}allows — operating the service, analytics, and internal model improvement for the community.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {RESEARCH_PILLARS.map((p, i) => (
              <PlatformHighlightCard key={i} h={p} dark={dark} C={C} compact />
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── How it works ─────────────────────────── */}
      <section id="how" style={{ borderBottom: `1px solid ${C.border}`, scrollMarginTop: 76 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>The process</p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
              Three steps to your next interview callback.
            </h2>
          </div>
          <div className="lp-step-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
            {STEPS.map((s, i) => (
              <div key={i}>
                {/* Step number — large bold DM Sans, blue */}
                <div style={{ fontSize: 64, fontWeight: 800, color: T.blue, opacity: 0.18, lineHeight: 1, marginBottom: 20, letterSpacing: -3 }}>
                  0{i + 1}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: "0 0 12px", letterSpacing: -0.4 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.72, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Reviews ──────────────────────────────── */}
      <section id="reviews" style={{ padding: "120px 40px", maxWidth: 1200, margin: "0 auto", scrollMarginTop: 76 }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>Testimonials</p>
          <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
            More interview callbacks.
          </h2>
          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, maxWidth: 560, margin: "20px auto 0" }}>
            About 400 people have used Resunova so far. What we hear most: recruiter screens and phone interviews. Paraphrased early-user notes, not paid endorsements.
          </p>
        </div>
        <div className="lp-rev-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {REVIEWS.map((r, i) => (
            <div key={i} style={{
              padding: "30px 28px", background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 16,
              transition: "box-shadow 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${dark ? "rgba(0,0,0,0.4)" : "rgba(13,17,23,0.10)"}`;
              (e.currentTarget as HTMLElement).style.borderColor = dark ? T.dBorder : "#c8d1da";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
              (e.currentTarget as HTMLElement).style.borderColor = C.border;
            }}
            >
              <div style={{ fontSize: 15, color: "#f59e0b", marginBottom: 16, letterSpacing: 2 }}>★★★★★</div>
              <p style={{ fontSize: 15, fontStyle: "italic", color: C.ink, lineHeight: 1.68, margin: "0 0 22px", fontWeight: 400, letterSpacing: -0.1 }}>
                &ldquo;{r.quote}&rdquo;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: r.col, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{r.avatar}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {r.role}
                    {r.company ? ` · ${r.company}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── Final CTA ────────────────────────────── */}
      <section style={{ background: T.blue, padding: "100px 40px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.04em", color: "#fff", margin: "0 0 20px" }}>
          Your next interview<br />starts here.
        </h2>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.78)", margin: "0 0 44px", lineHeight: 1.65, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          <strong style={{ color: "#fff", fontWeight: 600 }}>Completely free</strong>
          {" "}— for students, lifelong learners, and anyone in the job-seeking community. No credit card, no hidden tiers. Tailor in 60 seconds and apply with a résumé built to earn interview callbacks.
        </p>
        <button onClick={signIn} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "16px 36px", background: "#fff", color: T.blue,
          border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700,
          cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
          letterSpacing: -0.3, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget).style.opacity = "0.92"; }}
        onMouseLeave={e => { (e.currentTarget).style.opacity = "1"; }}
        >
          <GoogleG /> {loading ? "Loading…" : "Get started — it's free"}
        </button>
      </section>

      {/* ───────────── Footer ───────────────────────────────── */}
      <footer className="lp-footer" style={{
        padding: "32px 40px 36px",
        borderTop: `1px solid ${C.border}`,
        background: C.bg,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 24,
        alignItems: "start",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoMark size={22} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>Resunova</span>
          </div>
          <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.65, maxWidth: 440 }}>
            Offered <strong style={{ color: C.ink, fontWeight: 600 }}>completely free</strong> for students and the wider community — because strong tools should help everyone, not only those who can pay.
            {" "}
            We <strong style={{ color: C.ink, fontWeight: 600 }}>never sell your data</strong>
            {" "}— we keep it only to run the product, understand usage through analytics, and improve quality so we can serve you better (
            <Link href="/privacy" prefetch={false} style={{ color: T.blue, textDecoration: "none", fontWeight: 600 }}>Privacy Policy</Link>
            ).
            {" "}
            Questions or feedback? Reach us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: T.blue, textDecoration: "none", fontWeight: 600 }}>{CONTACT_EMAIL}</a>
            {" "}— we typically reply within two business days.
          </p>
          <span style={{ fontSize: 12, color: C.muted }}>© 2026 Resunova. All rights reserved.</span>
        </div>
        <nav className="lp-footer-nav" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }} aria-label="Legal">
          {[
            ["Blog", "/blog"],
            ["Contact", "/contact"],
            ["Privacy Policy", "/privacy"],
            ["Terms of Service", "/terms"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              style={{ fontSize: 13, color: C.muted, textDecoration: "none", fontWeight: 500, transition: "color 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.ink; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
            >
              {label}
            </Link>
          ))}
          <a
            href={SITE_URL}
            style={{ fontSize: 12, color: C.muted, textDecoration: "none", marginTop: 4 }}
          >
            {SITE_URL.replace(/^https:\/\//, "")}
          </a>
        </nav>
      </footer>

      {/* ── Global keyframes ────────────────────────────────── */}
      <style>{`
        @keyframes lpFadeUp  { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        @keyframes ticker    { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes barFill   { from { width: 0; } to { width: var(--w); } }
        @keyframes ringDraw  { from { stroke-dashoffset: var(--full); } to { stroke-dashoffset: var(--off); } }
        @keyframes cardSlide { from { opacity: 0; transform: translateY(32px) rotate(1.5deg); } to { opacity: 1; transform: rotate(1.5deg); } }
        @media (max-width: 860px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-demo-card { display: none !important; }
          .lp-feat-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-step-grid { grid-template-columns: 1fr !important; }
          .lp-rev-grid  { grid-template-columns: 1fr !important; }
          .lp-platform-grid { grid-template-columns: 1fr !important; }
          .lp-approach-grid { grid-template-columns: 1fr !important; }
          .lp-hero-h1   { font-size: 48px !important; }
        }
        @media (max-width: 640px) {
          .lp-footer { grid-template-columns: 1fr !important; }
          .lp-footer-nav { align-items: flex-start !important; }
        }
        @media (max-width: 540px) {
          .lp-feat-grid { grid-template-columns: 1fr !important; }
          .lp-hero-h1   { font-size: 38px !important; }
        }
      `}</style>
      </div>
    </div>
  );
}

// ── Demo Card ───────────────────────────────────────────────────────────────
function DemoCard({ dark, C }: { dark: boolean; C: Record<string,string> }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 700);
    return () => clearTimeout(t);
  }, []);

  const BARS = [
    { label: "Job Match",           val: 78, col: T.blue },
    { label: "Keywords",            val: 91, col: T.green },
    { label: "Achievement Quality", val: 64, col: T.amber },
    { label: "ATS Compatibility",   val: 96, col: T.teal },
  ];

  const r = 30, circ = 2 * Math.PI * r;

  return (
    <div className="lp-demo-card" style={{
      background:    C.surface,
      border:        `1px solid ${C.border}`,
      borderRadius:  20,
      padding:       28,
      boxShadow:     dark ? "0 32px 80px rgba(0,0,0,0.60)" : "0 32px 80px rgba(13,17,23,0.12)",
      transform:     "rotate(1.5deg)",
      animation:     "cardSlide 0.8s cubic-bezier(0.34,1.36,0.64,1) 0.3s both",
      transformOrigin: "center top",
      position:      "relative",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Overall Match</div>
          {/* Score number — DM Sans bold, blue */}
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: T.blue }}>
            78<span style={{ fontSize: 20, color: C.muted, fontWeight: 400, letterSpacing: 0 }}>/100</span>
          </div>
        </div>
        {/* Mini ring */}
        <svg width={76} height={76} viewBox="0 0 76 76" style={{ flexShrink: 0 }}>
          <circle cx={38} cy={38} r={r} fill="none" stroke={dark ? T.dBg : T.bg2} strokeWidth={6.5} />
          <circle cx={38} cy={38} r={r} fill="none"
            stroke={T.blue} strokeWidth={6.5} strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={filled ? circ * (1 - 0.78) : circ}
            transform="rotate(-90 38 38)"
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1) 0.5s" }}
          />
          <text x={38} y={43} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily="DM Sans, sans-serif" fontWeight="600">STRONG</text>
        </svg>
      </div>

      {/* Category bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 20 }}>
        {BARS.map((b, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: C.muted }}>{b.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: b.col }}>{b.val}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: dark ? T.dBg : T.bg2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, background: b.col,
                width: filled ? `${b.val}%` : "0%",
                transition: `width 0.95s cubic-bezier(0.4,0,0.2,1) ${0.6 + i * 0.1}s`,
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: C.border, margin: "18px 0" }} />

      {/* Bullet rewrite */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", marginBottom: 10 }}>AI Rewrite</div>
      <div style={{ padding: "10px 12px", borderRadius: 8, background: dark ? "rgba(248,81,73,0.09)" : "rgba(207,34,46,0.07)", borderLeft: "3px solid #f85149", fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 8, textDecoration: "line-through", opacity: 0.65 }}>
        &ldquo;Worked on backend API features&rdquo;
      </div>
      <div style={{ padding: "10px 12px", borderRadius: 8, background: dark ? "rgba(63,185,80,0.08)" : "rgba(26,127,55,0.08)", borderLeft: `3px solid ${T.green}`, fontSize: 12, color: C.ink, lineHeight: 1.6 }}>
        &ldquo;Architected REST API serving 2M+ daily requests, cutting P95 latency 40%&rdquo;
      </div>

      {/* Badge */}
      <div style={{
        position: "absolute", top: -12, right: 20,
        background: T.blue, color: "#fff",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
        padding: "4px 10px", borderRadius: 20, textTransform: "uppercase",
        boxShadow: `0 2px 8px ${T.blueGlow}`,
      }}>Live Preview</div>
    </div>
  );
}

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
              fontSize: 13,
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
      <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, letterSpacing: "0.08em", marginBottom: 14 }}>{f.num}</div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: "0 0 10px", letterSpacing: -0.4 }}>{f.title}</h3>
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
