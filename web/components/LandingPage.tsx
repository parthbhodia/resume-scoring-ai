"use client";
import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase";

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
  { num: "01", title: "Match Score",          desc: "0–100 breakdown across 8 dimensions: readability, ATS safety, achievement quality, keyword density, and more." },
  { num: "02", title: "Keyword Intelligence", desc: "Extract every keyword the JD demands. See which ones you're missing — and get precise suggestions on where to add them." },
  { num: "03", title: "AI Bullet Rewrites",   desc: "Turn vague duty-lists into achievement narratives with metrics. Your voice, amplified. Truthfulness preserved." },
  { num: "04", title: "ATS Compatibility",    desc: "Detect tables, columns, and formatting that breaks applicant tracking systems before they reject you silently." },
  { num: "05", title: "Language Quality",     desc: "Passive voice, weak verbs, pronouns, tense drift — flagged and fixed. Precise, confident, recruiter-ready." },
  { num: "06", title: "Instant PDF Export",   desc: "Every tailored version compiled to a clean, ATS-safe PDF in seconds. No templates. No design work." },
];

const STEPS = [
  { title: "Upload your résumé",      desc: "Drop any existing PDF. We extract every bullet, section, and keyword — no re-typing required." },
  { title: "Paste the job posting",   desc: "URL or raw text. Our AI reads the role like a recruiter: extracting what they're actually screening for." },
  { title: "Receive your edge",       desc: "Match score, gap analysis, rewritten bullets, and a tailored PDF. Ready to submit in under 60 seconds." },
];

const REVIEWS = [
  { quote: "The AI identified exactly what the recruiters were looking for. I went from zero interviews to three in one week.", name: "Sarah M.", role: "Software Engineer · hired at Meta",    avatar: "S", col: "#2563eb" },
  { quote: "I didn't know my résumé was being rejected by ATS before anyone even read it. Resunova fixed that overnight.",    name: "James K.", role: "Product Manager · hired at Stripe",  avatar: "J", col: "#059669" },
  { quote: "The bullet rewrites made my experience sound 10× more impactful. Completely changed my results.",                 name: "Aisha P.", role: "Data Analyst · hired at Airbnb",    avatar: "A", col: "#7c3aed" },
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

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

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
    <div style={{ background: C.bg, color: C.ink, fontFamily: "'DM Sans', -apple-system, sans-serif", minHeight: "100vh", overflowX: "hidden" }}>

      {/* ───────────── Header ───────────────────────────────── */}
      <header className="lp-header" style={{
        position: "sticky", top: 0, zIndex: 100,
        height: 60, padding: "0 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: dark ? "rgba(13,17,23,0.92)" : "rgba(246,248,250,0.93)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Logo — amber R mark + DM Sans wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: T.brand,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 14,
            boxShadow: `0 2px 8px ${T.brandGlow}`,
          }}>R</div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: C.ink }}>
            Resunova
          </span>
        </div>

        {/* Nav */}
        <nav className="lp-nav" style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {[["Features","features"],["How it works","how"],["Reviews","reviews"]].map(([lbl,id]) => (
            <button key={id} onClick={() => scrollTo(id)} style={{
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
            AI-powered · Instant · ATS-safe
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

          <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.72, maxWidth: 440, margin: "0 0 44px", letterSpacing: -0.15 }}>
            Paste any job description and get an AI-tailored resume in 60 seconds — with a match score, gap analysis, and ATS-safe PDF.
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
              {[["S","#2563eb"],["M","#059669"],["J","#d97706"],["A","#7c3aed"],["K","#0d9488"]].map(([l,bg], i) => (
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
              <b style={{ color: C.ink, fontWeight: 600 }}>4.8/5</b> from 2,400+ job seekers
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
            ["2,400+",  "Résumés tailored"],
            ["89%",     "Interview rate lift"],
            ["60s",     "Average tailoring time"],
            ["50+",     "ATS systems tested"],
            ["4.8 ★",   "Average user rating"],
            ["100%",    "Privacy guaranteed"],
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
      <section id="features" style={{ padding: "120px 40px", maxWidth: 1200, margin: "0 auto" }}>
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

      {/* ───────────── How it works ─────────────────────────── */}
      <section id="how" style={{ background: C.bg2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>The process</p>
            <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
              Three steps to a winning application.
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
      <section id="reviews" style={{ padding: "120px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: T.blue, textTransform: "uppercase", margin: "0 0 16px" }}>Testimonials</p>
          <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, margin: 0 }}>
            From the people who got hired.
          </h2>
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
                  <div style={{ fontSize: 11, color: C.muted }}>{r.role}</div>
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
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.78)", margin: "0 0 44px", lineHeight: 1.6 }}>
          Free to start. No templates required. Results in 60 seconds.
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
      <footer className="lp-footer" style={{ padding: "28px 40px", borderTop: `1px solid ${C.border}`, background: C.bg, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: T.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>R</div>
          <span style={{ fontSize: 13, color: C.muted }}>© 2026 Resunova</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {["Privacy", "Terms", "Contact"].map(l => (
            <span key={l} style={{ fontSize: 13, color: C.muted, cursor: "pointer", transition: "color 0.15s" }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = C.ink; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = C.muted; }}
            >{l}</span>
          ))}
        </div>
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
          .lp-hero-h1   { font-size: 48px !important; }
        }
        @media (max-width: 540px) {
          .lp-feat-grid { grid-template-columns: 1fr !important; }
          .lp-hero-h1   { font-size: 38px !important; }
        }
      `}</style>
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
