"use client";
import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const redirectTo =
      typeof window !== "undefined"
        ? window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
        : undefined;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (err) { setError(err.message); setLoading(false); }
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>

      {/* ── Sticky Nav ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        height: 60, padding: "0 36px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <LogoMark size={28} />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.5 }}>Resunova</span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {[
            { lbl: "Features",    id: "features" },
            { lbl: "How it works", id: "how" },
            { lbl: "Reviews",     id: "reviews" },
          ].map(l => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              style={{
                background: "none", border: "none", color: "var(--muted)",
                fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                letterSpacing: -0.2, padding: 0,
              }}
            >{l.lbl}</button>
          ))}
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            style={{
              fontSize: 13, padding: "7px 16px",
              background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
              letterSpacing: -0.2, fontWeight: 500,
            }}
          >
            {loading ? "Loading…" : "Sign in"}
          </button>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{
        position: "relative", padding: "90px 24px 80px",
        textAlign: "center", overflow: "hidden",
      }}>
        {/* Glow */}
        <div style={{
          position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)",
          width: 800, height: 600,
          background: "radial-gradient(ellipse, rgba(0,113,227,0.18) 0%, rgba(0,113,227,0.04) 35%, transparent 65%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
          {/* Top pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "5px 14px", marginBottom: 28,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 100, fontSize: 12, color: "var(--muted)", letterSpacing: -0.2,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />
            Powered by proprietary AI + live job research
          </div>

          <h1 style={{
            fontSize: 56, fontWeight: 700, letterSpacing: -2.2,
            lineHeight: 1.05, marginBottom: 22,
          }}>
            Stop getting ghosted.<br />
            <span style={{
              background: "linear-gradient(90deg, #0071e3, #34d399)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>Start landing interviews.</span>
          </h1>

          <p style={{
            fontSize: 18, color: "var(--muted)", letterSpacing: -0.3,
            lineHeight: 1.55, marginBottom: 36, maxWidth: 580, margin: "0 auto 36px",
          }}>
            Your resume isn&apos;t bad — it just isn&apos;t speaking the company&apos;s language.
            Paste any job description and get an AI-tailored resume that matches
            what they&apos;re actually looking for.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
            <button
              onClick={signInWithGoogle}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "13px 22px",
                background: "#ffffff", color: "#1d1d1f",
                border: "none", borderRadius: 11,
                fontSize: 15, fontWeight: 500, fontFamily: "inherit",
                cursor: loading ? "wait" : "pointer",
                letterSpacing: -0.3,
                boxShadow: "0 4px 24px rgba(0,113,227,0.25)",
              }}
            >
              {loading ? <Spinner /> : <GoogleIcon />}
              {loading ? "Redirecting…" : "Get started — it's free"}
            </button>
            <button
              onClick={() => scrollTo("how")}
              style={{
                padding: "13px 22px",
                background: "var(--surface)", color: "var(--text)",
                border: "1px solid var(--border)", borderRadius: 11,
                fontSize: 15, fontWeight: 500, fontFamily: "inherit",
                cursor: "pointer", letterSpacing: -0.3,
              }}
            >
              See how it works
            </button>
          </div>

          {error && (
            <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          {/* Avatar social proof */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ display: "flex" }}>
              {[
                { bg: "linear-gradient(135deg,#f87171,#fb923c)", l: "S" },
                { bg: "linear-gradient(135deg,#0071e3,#34d399)", l: "M" },
                { bg: "linear-gradient(135deg,#fbbf24,#f87171)", l: "J" },
                { bg: "linear-gradient(135deg,#34d399,#0071e3)", l: "A" },
                { bg: "linear-gradient(135deg,#fb923c,#fbbf24)", l: "K" },
              ].map((a, i) => (
                <div key={i} style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: a.bg, border: "2px solid var(--bg)",
                  marginLeft: i === 0 ? 0 : -10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, color: "#fff",
                }}>{a.l}</div>
              ))}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ display: "flex", gap: 1, marginBottom: 2 }}>
                {Array(5).fill(0).map((_, i) => <Star key={i} />)}
              </div>
              <div style={{ fontSize: 12, color: "var(--dim)", letterSpacing: -0.2 }}>
                <strong style={{ color: "var(--text)" }}>4.8 / 5</strong> from 2,400+ job seekers
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Logo bar ── */}
      <section style={{ padding: "0 24px 60px", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--dim)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 22, fontWeight: 600 }}>
          Our users have landed roles at
        </div>
        <div style={{
          display: "flex", justifyContent: "center", flexWrap: "wrap",
          gap: "30px 56px", maxWidth: 880, margin: "0 auto",
          fontSize: 17, fontWeight: 600, letterSpacing: -0.4,
          color: "rgba(255,255,255,0.42)",
        }}>
          {["Google", "Meta", "Stripe", "Airbnb", "Amazon", "Microsoft", "Shopify", "Notion"].map(c => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </section>

      {/* ── The problem ── */}
      <section style={{ padding: "60px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <SectionTag>The problem</SectionTag>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.4, marginTop: 12, lineHeight: 1.2 }}>
            You&apos;re sending the same resume to<br />every job. That&apos;s why you&apos;re not hearing back.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { stat: "75%", label: "of resumes get filtered out by ATS bots before a human ever reads them.", color: "var(--red)" },
            { stat: "6 sec", label: "is all a recruiter spends scanning your resume on the first pass.", color: "var(--orange)" },
            { stat: "3×",   label: "more interviews when your resume mirrors the job description's keywords.", color: "var(--green)" },
          ].map(s => (
            <div key={s.stat} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "26px 24px",
            }}>
              <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.3, color: s.color, lineHeight: 1, marginBottom: 12 }}>
                {s.stat}
              </div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ padding: "80px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <SectionTag>Features</SectionTag>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.4, marginTop: 12, lineHeight: 1.2 }}>
            Built to get you noticed.
          </h2>
          <p style={{ fontSize: 16, color: "var(--muted)", letterSpacing: -0.3, marginTop: 14, maxWidth: 540, margin: "14px auto 0", lineHeight: 1.6 }}>
            Every feature is designed around one goal: turning &quot;application sent&quot; into &quot;interview booked.&quot;
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            {
              icon: <FeatureIcon><path d="M5 7h14M5 12h14M5 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></FeatureIcon>,
              title: "Tailored to the job description",
              body: "Paste the JD. We rewrite every bullet to mirror the language, skills, and priorities the company actually cares about.",
              color: "var(--accent)",
            },
            {
              icon: <FeatureIcon><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></FeatureIcon>,
              title: "ATS-friendly PDF output",
              body: "Clean, single-column PDF that extracts cleanly — no tables, images, or multi-column layouts that confuse resume parsers.",
              color: "var(--green)",
            },
            {
              icon: <FeatureIcon><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></FeatureIcon>,
              title: "Match score + gap analysis",
              body: "See exactly where your resume scores 0–100 against the role, and which gaps to address before you hit submit.",
              color: "var(--yellow)",
            },
            {
              icon: <FeatureIcon><path d="M4 4h12l4 4v12H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M16 4v4h4M8 12h8M8 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></FeatureIcon>,
              title: "Live company research",
              body: "We pull recent news, blog posts, and engineering writeups to tailor your resume to the company's actual stack and culture — not just the JD.",
              color: "var(--orange)",
            },
          ].map(f => (
            <div key={f.title} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 16, padding: "26px 24px",
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11,
                background: "var(--surface2)", color: f.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16,
              }}>{f.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.4, marginBottom: 8 }}>
                {f.title}
              </div>
              <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, letterSpacing: -0.2, margin: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ padding: "80px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <SectionTag>How it works</SectionTag>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.4, marginTop: 12, lineHeight: 1.2 }}>
            Three steps. Sixty seconds.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, position: "relative" }}>
          {[
            { n: "1", title: "Upload your resume", body: "Drop your existing PDF — we extract every detail, no formatting needed." },
            { n: "2", title: "Paste the job description", body: "Add the company name, role, and full JD from LinkedIn, Greenhouse, or anywhere." },
            { n: "3", title: "Get your tailored resume", body: "Download a ready-to-submit PDF, plus a match score and a list of gaps to address." },
          ].map(s => (
            <div key={s.n} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "26px 24px",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "var(--accent)", color: "#fff",
                fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16,
              }}>{s.n}</div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.4, marginBottom: 8 }}>
                {s.title}
              </div>
              <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, letterSpacing: -0.2, margin: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live stats strip ── */}
      <section style={{ padding: "60px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 18, padding: "36px 32px",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, textAlign: "center",
        }}>
          {[
            { val: "12,840+",  lbl: "Resumes tailored" },
            { val: "+34 pts",   lbl: "Avg score boost" },
            { val: "3.2×",      lbl: "More callbacks" },
            { val: "60 sec",    lbl: "Avg generation time" },
          ].map(s => (
            <div key={s.lbl}>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.2, color: "var(--text)", lineHeight: 1, marginBottom: 8 }}>
                {s.val}
              </div>
              <div style={{ fontSize: 13, color: "var(--dim)", letterSpacing: -0.2 }}>
                {s.lbl}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Reviews ── */}
      <section id="reviews" style={{ padding: "80px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <SectionTag>Loved by job seekers</SectionTag>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.4, marginTop: 12, lineHeight: 1.2 }}>
            From rejection to offer letter.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            {
              quote: "I'd applied to 80 roles with zero callbacks. Tailored my resume with this for a Stripe role and got an interview the same week. Score went from 51 to 87.",
              name:  "Sarah K.",
              role:  "Now: Product Designer @ Stripe",
              avatar: "linear-gradient(135deg,#f87171,#fb923c)",
              letter: "S",
            },
            {
              quote: "I'm a career switcher with no formal CS degree. Every resume I sent felt like shouting into the void. After tailoring 4 versions with this, I got 3 callbacks.",
              name:  "Marcus T.",
              role:  "Now: Software Engineer @ Shopify",
              avatar: "linear-gradient(135deg,#0071e3,#34d399)",
              letter: "M",
            },
            {
              quote: "The gap analysis is the killer feature. It told me exactly which keywords I was missing for each role. My match scores went from yellow to green across the board.",
              name:  "Jenna R.",
              role:  "Now: Data Scientist @ Airbnb",
              avatar: "linear-gradient(135deg,#fbbf24,#f87171)",
              letter: "J",
            },
          ].map(t => (
            <div key={t.name} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 16, padding: "24px",
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ display: "flex", gap: 1, marginBottom: 14 }}>
                {Array(5).fill(0).map((_, i) => <Star key={i} />)}
              </div>
              <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.65, letterSpacing: -0.2, margin: 0, marginBottom: 18, flex: 1 }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: t.avatar,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 600, color: "#fff",
                }}>{t.letter}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, marginTop: 2 }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: "60px 24px 80px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <SectionTag>Common questions</SectionTag>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { q: "Is it really free?",               a: "Yes — generate as many tailored resumes as you want. No credit card, no trial, no paywall." },
            { q: "Will an ATS read my resume?",      a: "The output is a clean, single-column PDF with no tables or images — the format resume parsers handle best." },
            { q: "Do you store my resume?",          a: "Your resume is saved privately to your account so you can revisit past tailorings. Nothing is shared or sold." },
            { q: "What AI powers it?",               a: "A proprietary AI pipeline with live web research — so it pulls fresh context about the company you're applying to, not just static training data." },
            { q: "How is this different from ChatGPT?", a: "ChatGPT gives you a wall of text. We give you a polished PDF, an objective match score, a side-by-side diff against your original, and a gap-analysis you can act on." },
          ].map((f, i) => (
            <details key={i} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 11, padding: "14px 18px",
            }}>
              <summary style={{
                fontSize: 14, fontWeight: 500, color: "var(--text)",
                letterSpacing: -0.2, cursor: "pointer", listStyle: "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                {f.q}
                <span style={{ color: "var(--dim)", fontSize: 14, marginLeft: 16 }}>+</span>
              </summary>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, letterSpacing: -0.2, margin: "12px 0 0", paddingRight: 24 }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ padding: "0 24px 100px" }}>
        <div style={{
          maxWidth: 800, margin: "0 auto",
          background: "linear-gradient(135deg, rgba(0,113,227,0.12), rgba(52,211,153,0.08))",
          border: "1px solid rgba(0,113,227,0.25)",
          borderRadius: 22, padding: "52px 40px",
          textAlign: "center", position: "relative", overflow: "hidden",
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.2, marginBottom: 14 }}>
            Stop applying. Start landing.
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted)", letterSpacing: -0.2, lineHeight: 1.6, marginBottom: 28, maxWidth: 480, margin: "0 auto 28px" }}>
            Your next interview is one tailored resume away. It takes 60 seconds.
          </p>
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "13px 24px",
              background: "#ffffff", color: "#1d1d1f",
              border: "none", borderRadius: 11,
              fontSize: 15, fontWeight: 500, fontFamily: "inherit",
              cursor: loading ? "wait" : "pointer", letterSpacing: -0.3,
              boxShadow: "0 8px 32px rgba(0,113,227,0.3)",
            }}
          >
            {loading ? <Spinner /> : <GoogleIcon />}
            {loading ? "Redirecting…" : "Sign in with Google"}
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--dim)", letterSpacing: -0.1 }}>
            Free forever · No credit card required
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: "32px 36px", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: "var(--dim)", fontSize: 12, letterSpacing: -0.1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LogoMark size={20} />
          <span>Resunova · Built for job seekers, by job seekers</span>
        </div>
        <div>© {new Date().getFullYear()} Resunova</div>
      </footer>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.27,
      background: "var(--accent)", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 13 13" fill="none">
        <rect x="1.5" y="0.5" width="7" height="9" rx="1.2" stroke="white" strokeWidth="1.2"/>
        <path d="M4 4h5M4 6h3.5M4 8h4.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-block",
      fontSize: 11, fontWeight: 700, color: "var(--accent)",
      letterSpacing: 1.2, textTransform: "uppercase",
      padding: "5px 12px", background: "var(--accent-bg)",
      borderRadius: 100,
    }}>{children}</div>
  );
}

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      {children}
    </svg>
  );
}

function Star() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--yellow)">
      <path d="M7 1l1.8 3.6 4 .6-2.9 2.8.7 4L7 10.1l-3.6 1.9.7-4-2.9-2.8 4-.6L7 1z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="7" cy="7" r="5.5" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5"/>
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#1d1d1f" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
