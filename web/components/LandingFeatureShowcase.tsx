"use client";
/**
 * Animated product previews — homepage (A/B/D/E), Tailor (C), and /landing-preview showcase.
 */
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type VariantProps = { embedded?: boolean };

export function LandingPreviewStyles() {
  return <style>{CSS}</style>;
}

const A = "#2563eb", G = "#059669", AM = "#d97706", R = "#dc2626";
const INK = "#0f172a", MUT = "#64748b", BG = "#f8fafc", BG2 = "#f1f5f9";
const SUR = "#ffffff", BOR = "#e5e7eb";

/* ── animation CSS injected once ────────────────────────── */
const CSS = `
@keyframes fillBar  { from { width: 0% } }
@keyframes countUp  { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
@keyframes fadeIn   { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
@keyframes slideIn  { from { opacity:0; transform:translateX(-16px) } to { opacity:1; transform:none } }
@keyframes typeIn   { from { opacity:0; max-height:0; overflow:hidden } to { opacity:1; max-height:120px } }
@keyframes pulse    { 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }
@keyframes glow     { 0%,100%{ box-shadow:0 0 0 0 rgba(37,99,235,0) } 50%{ box-shadow:0 0 0 8px rgba(37,99,235,0.12) } }
@keyframes strikeIn { from { width:0% } to { width:100% } }
@keyframes chipIn   { from { opacity:0; transform:scale(0.8) } to { opacity:1; transform:scale(1) } }
@keyframes scanLine { 0%{ transform:translateY(-100%) } 100%{ transform:translateY(400%) } }
@keyframes appear   { from { opacity:0 } to { opacity:1 } }
@keyframes heroOrb  { 0%,100%{ transform:translate(0,0) scale(1) } 50%{ transform:translate(6px,-8px) scale(1.06) } }
@keyframes scoreArc { from { stroke-dashoffset:226 } to { stroke-dashoffset:59 } }
@keyframes barShine { 0%{ transform:translateX(-120%) } 100%{ transform:translateX(220%) } }
@keyframes chipPop  { from { opacity:0; transform:translateY(6px) scale(0.92) } to { opacity:1; transform:none } }
`;

function useInView(ref: React.RefObject<Element | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } }, { threshold: 0.2 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return seen;
}

function useCountUp(target: number, running: boolean, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setVal(Math.round(p * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [running, target, duration]);
  return val;
}

function Label({ id, name, desc }: { id: string; name: string; desc: string }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto 28px", padding: "0 40px" }}>
      <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 10px",
        background:A+"15", borderRadius:99, fontSize:11, fontWeight:800, color:A, letterSpacing:0.4 }}>
        Variant {id}
      </span>
      <div style={{ fontSize:18, fontWeight:700, color:INK, margin:"6px 0 2px" }}>{name}</div>
      <div style={{ fontSize:12, color:MUT }}>{desc}</div>
    </div>
  );
}

function VariantShell({
  embedded,
  shellRef,
  sectionStyle,
  label,
  children,
}: {
  embedded?: boolean;
  shellRef: React.RefObject<HTMLDivElement | null>;
  sectionStyle?: CSSProperties;
  label?: ReactNode;
  children: ReactNode;
}) {
  if (embedded) {
    return <div ref={shellRef}>{children}</div>;
  }
  return (
    <section ref={shellRef} style={sectionStyle}>
      {label}
      {children}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   A — Auto-scanning score reveal
   Score counts up, then bars fill one-by-one
══════════════════════════════════════════════════════════ */
const HERO_BARS = [
  { l: "Readability", v: 88, c: G },
  { l: "ATS Safety", v: 72, c: A },
  { l: "Quantification", v: 55, c: AM },
  { l: "Achievement", v: 63, c: AM },
] as const;

const SHOWCASE_BARS = [
  { l: "Readability", v: 88, c: G },
  { l: "ATS Safety", v: 72, c: A },
  { l: "Quantification", v: 55, c: AM },
  { l: "Achievement Quality", v: 63, c: AM },
  { l: "Language Quality", v: 81, c: G },
  { l: "Section Structure", v: 76, c: A },
] as const;

function VariantAHeroCard({ seen, score }: { seen: boolean; score: number }) {
  const ringSize = 92;
  const r = 36;
  const cx = ringSize / 2;
  const scoreColor = score < 30 ? R : score < 60 ? AM : G;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Ambient glow orbs */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -28,
          right: -20,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.35) 0%, transparent 70%)",
          filter: "blur(2px)",
          animation: seen ? "heroOrb 5s ease-in-out infinite" : "none",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -36,
          left: -24,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(217,119,6,0.28) 0%, transparent 70%)",
          filter: "blur(2px)",
          animation: seen ? "heroOrb 6.5s ease-in-out 1.2s infinite" : "none",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          borderRadius: 22,
          padding: 1,
          background: "linear-gradient(135deg, rgba(37,99,235,0.55) 0%, rgba(217,119,6,0.4) 45%, rgba(5,150,105,0.35) 100%)",
          boxShadow:
            "0 4px 6px rgba(15,23,42,0.04), 0 24px 48px rgba(37,99,235,0.14), 0 48px 96px rgba(13,17,23,0.1)",
        }}
      >
        <div
          style={{
            borderRadius: 21,
            overflow: "hidden",
            background: "linear-gradient(165deg, #ffffff 0%, #f8fafc 52%, #f1f5f9 100%)",
          }}
        >
          {/* Chrome */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: "11px 16px",
              background: "linear-gradient(90deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
            ))}
            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8, fontWeight: 500 }}>
              Resunova · Live analysis
            </span>
            {seen && (
              <span
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px",
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#fbbf24",
                  background: "rgba(251,191,36,0.12)",
                  border: "1px solid rgba(251,191,36,0.25)",
                  animation: "pulse 2s infinite",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#fbbf24",
                    boxShadow: "0 0 8px #fbbf24",
                  }}
                />
                Scanning
              </span>
            )}
          </div>

          {/* Mini résumé scan strip */}
          <div
            style={{
              position: "relative",
              margin: "14px 16px 0",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(15,23,42,0.04)",
              border: "1px solid rgba(15,23,42,0.06)",
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: MUT, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Extracting · PDF
            </div>
            {[
              { w: "72%", h: 7, o: 0.9 },
              { w: "88%", h: 5, o: 0.55 },
              { w: "64%", h: 5, o: 0.4 },
            ].map((line, i) => (
              <div
                key={i}
                style={{
                  height: line.h,
                  width: line.w,
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${BOR} 0%, #cbd5e1 100%)`,
                  marginBottom: i < 2 ? 6 : 0,
                  opacity: line.o,
                  animation: seen ? `fadeIn 0.5s ease ${0.1 + i * 0.08}s both` : "none",
                }}
              />
            ))}
            {seen && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.7), transparent)",
                  animation: "scanLine 2.8s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>

          <div style={{ padding: "18px 16px 20px" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {/* SVG score ring */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ position: "relative", width: ringSize, height: ringSize }}>
                  <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)" }} aria-hidden>
                    <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={7} />
                    <circle
                      cx={cx}
                      cy={cx}
                      r={r}
                      fill="none"
                      stroke="url(#heroScoreGrad)"
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeDasharray={226}
                      strokeDashoffset={seen ? 59 : 226}
                      style={{
                        animation: seen ? "scoreArc 1.4s cubic-bezier(0.34,1.2,0.64,1) 0.2s both" : "none",
                        filter: `drop-shadow(0 0 6px ${scoreColor}55)`,
                      }}
                    />
                    <defs>
                      <linearGradient id="heroScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={AM} />
                        <stop offset="55%" stopColor={A} />
                        <stop offset="100%" stopColor={G} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 800,
                        color: INK,
                        lineHeight: 1,
                        letterSpacing: "-0.04em",
                        animation: seen ? "countUp 0.3s ease both" : "none",
                      }}
                    >
                      {score}
                    </span>
                    <span style={{ fontSize: 10, color: MUT, fontWeight: 600 }}>/ 100</span>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: AM,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    padding: "3px 10px",
                    borderRadius: 99,
                    background: `${AM}14`,
                    border: `1px solid ${AM}30`,
                  }}
                >
                  Needs work
                </span>
              </div>

              {/* Bars */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, paddingTop: 2, minWidth: 0 }}>
                {HERO_BARS.map((b, i) => (
                  <div
                    key={b.l}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      animation: seen ? `fadeIn 0.45s ease ${0.35 + i * 0.1}s both` : "none",
                    }}
                  >
                    <span style={{ fontSize: 11, color: MUT, width: 96, flexShrink: 0, fontWeight: 500 }}>{b.l}</span>
                    <div style={{ flex: 1, height: 7, borderRadius: 99, background: BG2, overflow: "hidden", position: "relative" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 99,
                          background: `linear-gradient(90deg, ${b.c}cc, ${b.c})`,
                          boxShadow: `0 0 12px ${b.c}44`,
                          animation: seen ? `fillBar 0.9s cubic-bezier(0.34,1.1,0.64,1) ${0.55 + i * 0.1}s both` : "none",
                          width: seen ? `${b.v}%` : "0%",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {seen && (
                          <div
                            aria-hidden
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                              animation: `barShine 1.2s ease ${0.9 + i * 0.1}s both`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: b.c, width: 22, textAlign: "right" }}>{b.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Insight chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              {[
                { label: "Top fix", value: "Quantification", color: AM, delay: 0.95 },
                { label: "Bullets flagged", value: "5", color: R, delay: 1.05 },
                { label: "Potential gain", value: "+12 pts", color: G, delay: 1.15 },
              ].map((chip) => (
                <div
                  key={chip.label}
                  style={{
                    flex: "1 1 auto",
                    minWidth: 100,
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: SUR,
                    border: `1px solid ${chip.color}22`,
                    boxShadow: `0 2px 8px ${chip.color}10`,
                    animation: seen ? `chipPop 0.45s cubic-bezier(0.34,1.2,0.64,1) ${chip.delay}s both` : "none",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: MUT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
                    {chip.label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: chip.color }}>{chip.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VariantA({ embedded = false }: VariantProps = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const score = useCountUp(74, seen);
  const bars = embedded ? HERO_BARS : SHOWCASE_BARS;

  if (embedded) {
    return (
      <VariantShell embedded shellRef={ref}>
        <VariantAHeroCard seen={seen} score={score} />
      </VariantShell>
    );
  }

  return (
    <VariantShell
      embedded={embedded}
      shellRef={ref}
      sectionStyle={{ background:BG, padding:"80px 40px" }}
      label={<Label id="A" name="Score Reveal" desc="Score counts up from 0 on scroll-in. Progress bars fill sequentially with a stagger delay." />}
    >
      <div style={{
        maxWidth: 680,
        margin:"0 auto",
        background:SUR,
        borderRadius: 20,
        border:`1px solid ${BOR}`,
        overflow:"hidden",
        boxShadow: "0 12px 48px rgba(0,0,0,0.08)",
      }}>
        <div style={{ display:"flex", gap:6, alignItems:"center", padding:"10px 16px",
          borderBottom:`1px solid ${BOR}`, background:BG2 }}>
          {["#ff5f57","#febc2e","#28c840"].map(c=><div key={c} style={{ width:10,height:10,borderRadius:"50%",background:c }}/>)}
          <span style={{ fontSize:11, color:MUT, marginLeft:8 }}>Resunova · Improvement Plan</span>
          {seen && <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:AM,
            animation:"pulse 2s infinite" }}>● ANALYZING</span>}
        </div>
        <div style={{
          padding:"32px 36px 36px",
          display:"flex",
          gap: 32,
          alignItems:"flex-start",
          flexDirection: "row",
        }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
            <div style={{
              width: 96,
              height: 96,
              borderRadius:"50%",
              border:`6px solid ${score < 30 ? R : score < 60 ? AM : G}`,
              background:SUR, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              transition:"border-color 0.4s",
              animation: seen ? "glow 2.4s ease infinite" : "none" }}>
              <span style={{
                fontSize: 28,
                fontWeight:800,
                color:INK,
                lineHeight:1,
                animation: seen ? "countUp 0.3s ease both" : "none",
              }}>{score}</span>
              <span style={{ fontSize:11, color:MUT }}>/100</span>
            </div>
            <span style={{ fontSize:10, fontWeight:700, color:AM,
              textTransform:"uppercase", letterSpacing:0.5 }}>Needs work</span>
          </div>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12, paddingTop:4 }}>
            {bars.map((b, i) => (
              <div key={b.l} style={{ display:"flex", alignItems:"center", gap:10,
                animation: seen ? `fadeIn 0.4s ease ${0.3 + i * 0.12}s both` : "none" }}>
                <span style={{ fontSize:12, color:MUT, width: 150, flexShrink:0 }}>{b.l}</span>
                <div style={{ flex:1, height:5, borderRadius:3, background:BG2 }}>
                  <div style={{ height:"100%", borderRadius:3, background:b.c,
                    animation: seen ? `fillBar 0.8s ease ${0.5 + i * 0.12}s both` : "none",
                    width: seen ? `${b.v}%` : "0%" }} />
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:b.c, width:24 }}>{b.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </VariantShell>
  );
}

/* ══════════════════════════════════════════════════════════
   B — Bullet rewrite typewriter
   Weak bullet gets struck through, AI rewrite types in
══════════════════════════════════════════════════════════ */
export function VariantB({ embedded = false }: VariantProps = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [phase, setPhase] = useState(0);
  const GOOD = "Architected REST API serving 2M+ daily requests, cutting P95 latency 40%.";
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!seen) return;
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [seen]);

  useEffect(() => {
    if (phase !== 2) return;
    let i = 0;
    const tick = setInterval(() => {
      i++;
      setTyped(GOOD.slice(0, i));
      if (i >= GOOD.length) clearInterval(tick);
    }, 22);
    return () => clearInterval(tick);
  }, [phase]);

  return (
    <VariantShell
      embedded={embedded}
      shellRef={ref}
      sectionStyle={{ background:INK, padding:"80px 40px" }}
      label={<Label id="B" name="Typewriter Rewrite" desc="Scroll in: weak bullet gets struck through, then the AI rewrite types in character-by-character." />}
    >
      <div style={{ maxWidth: embedded ? "100%" : 680, margin:"0 auto", background:"#1e293b", borderRadius:20,
        border:"1px solid #334155", overflow:"hidden", boxShadow:"0 24px 72px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", gap:6, alignItems:"center", padding:"10px 16px",
          background:"#0f172a", borderBottom:"1px solid #1e293b" }}>
          {["#ff5f57","#febc2e","#28c840"].map(c=><div key={c} style={{ width:10,height:10,borderRadius:"50%",background:c }}/>)}
          <span style={{ fontSize:11, color:"#475569", marginLeft:8 }}>Resunova · Bullet coaching · fix 1 of 5</span>
        </div>
        <div style={{ padding:"32px 36px 36px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase",
            letterSpacing:0.8, marginBottom:20 }}>⚠ Flagged — No metrics · Weak verb</div>

          {/* Original bullet */}
          <div style={{ position:"relative", padding:"14px 16px", borderRadius:10,
            background: phase >= 1 ? R+"18" : "#334155", border:`1px solid ${phase>=1?R+"30":"#334155"}`,
            marginBottom:16, transition:"background 0.4s, border-color 0.4s" }}>
            <div style={{ fontSize:13, color: phase>=1?"#94a3b8":"#cbd5e1",
              textDecoration: phase>=1?"line-through":"none", transition:"all 0.3s",
              lineHeight:1.5 }}>
              Worked on backend API features for the product team.
            </div>
            {/* Strike line animation */}
            {phase>=1 && (
              <div style={{ position:"absolute", top:"50%", left:16, height:1.5,
                background:R, animation:"strikeIn 0.5s ease both" }} />
            )}
          </div>

          {/* AI rewrite */}
          {phase >= 2 && (
            <div style={{ padding:"14px 16px", borderRadius:10, background:G+"18",
              border:`1px solid ${G}30`, animation:"fadeIn 0.3s ease both" }}>
              <div style={{ fontSize:10, fontWeight:700, color:G, marginBottom:8,
                textTransform:"uppercase", letterSpacing:0.6 }}>✨ AI Rewrite</div>
              <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.6, minHeight:40 }}>
                {typed}<span style={{ animation:"pulse 0.8s infinite", color:G }}>|</span>
              </div>
            </div>
          )}

          {/* Apply button appears after typing */}
          {typed.length === GOOD.length && (
            <button style={{ marginTop:16, width:"100%", padding:"11px", borderRadius:10,
              background:A, border:"none", color:"white", fontSize:13, fontWeight:700,
              cursor:"pointer", animation:"fadeIn 0.4s ease both" }}>
              ↑ Apply to résumé
            </button>
          )}
        </div>
      </div>
    </VariantShell>
  );
}

/* ══════════════════════════════════════════════════════════
   C — Keyword chips appear with stagger
   Missing keywords pop in one by one, then matched ones tick green
══════════════════════════════════════════════════════════ */
const MISSING = ["TypeScript","Kubernetes","Docker","REST API","CI/CD","PostgreSQL"];
const PRESENT = ["React","Node.js","Git","Python","AWS"];

export function VariantC({ embedded = false }: VariantProps = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [showCount, setShowCount] = useState(0);
  const [greenCount, setGreenCount] = useState(0);

  useEffect(() => {
    if (!seen) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShowCount(i);
      if (i >= MISSING.length + PRESENT.length) clearInterval(t);
    }, 180);
    return () => clearInterval(t);
  }, [seen]);

  useEffect(() => {
    if (showCount < MISSING.length) return;
    const idx = showCount - MISSING.length;
    if (idx >= 0 && idx <= PRESENT.length) setGreenCount(idx);
  }, [showCount]);

  return (
    <VariantShell
      embedded={embedded}
      shellRef={ref}
      sectionStyle={{ background:BG2, padding: embedded ? "0" : "80px 40px" }}
      label={<Label id="C" name="Keyword Chip Pop" desc="Missing keywords fly in one-by-one (red), then matched ones tick in (green). Stagger delay per chip." />}
    >
      <div style={{ maxWidth: embedded ? "100%" : 680, margin:"0 auto", background:SUR, borderRadius:20,
        border:`1px solid ${BOR}`, overflow:"hidden", boxShadow:"0 12px 48px rgba(0,0,0,0.07)" }}>
        <div style={{ display:"flex", gap:6, alignItems:"center", padding:"10px 16px",
          background:BG2, borderBottom:`1px solid ${BOR}` }}>
          {["#ff5f57","#febc2e","#28c840"].map(c=><div key={c} style={{ width:10,height:10,borderRadius:"50%",background:c }}/>)}
          <span style={{ fontSize:11, color:MUT, marginLeft:8 }}>Resunova · Keyword gap analysis</span>
        </div>
        <div style={{ padding:"28px 32px 32px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:INK }}>Missing keywords</div>
            <div style={{ fontSize:12, color:MUT }}>
              <span style={{ color:R, fontWeight:700 }}>{Math.min(showCount, MISSING.length)}</span> missing ·{" "}
              <span style={{ color:G, fontWeight:700 }}>{greenCount}</span> matched
            </div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
            {MISSING.map((k, i) => showCount > i ? (
              <span key={k} style={{ padding:"5px 14px", borderRadius:99, fontSize:12, fontWeight:600,
                background:R+"10", color:R, border:`1px solid ${R}30`,
                animation:"chipIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}>−{k}</span>
            ) : null)}
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:INK, marginBottom:12 }}>Already present</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {PRESENT.map((k, i) => showCount > MISSING.length + i ? (
              <span key={k} style={{ padding:"5px 14px", borderRadius:99, fontSize:12, fontWeight:600,
                background:G+"10", color:G, border:`1px solid ${G}30`,
                animation:"chipIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}>✓{k}</span>
            ) : null)}
          </div>
        </div>
      </div>
    </VariantShell>
  );
}

/* ══════════════════════════════════════════════════════════
   D — Auto-cycling tab demo
   4 tabs auto-advance every 2.5s — score → bullets → keywords → export
══════════════════════════════════════════════════════════ */
const TABS = ["Score","Bullet fix","Keywords","Export"];

export function VariantD({ embedded = false }: VariantProps = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [tab, setTab] = useState(0);
  const score = useCountUp(74, seen && tab === 0);

  useEffect(() => {
    if (!seen) return;
    const t = setInterval(() => setTab(p => (p + 1) % TABS.length), 2800);
    return () => clearInterval(t);
  }, [seen]);

  return (
    <VariantShell
      embedded={embedded}
      shellRef={ref}
      sectionStyle={{ background:SUR, padding:"80px 40px" }}
      label={<Label id="D" name="Auto-cycling Tab Demo" desc="4 feature tabs auto-advance every 2.8s. Click to jump. Each panel has its own entrance animation." />}
    >
      <div style={{ maxWidth: embedded ? "100%" : 720, margin:"0 auto" }}>
        {/* Tab bar */}
        <div style={{ display:"flex", gap:4, marginBottom:0, background:BG2,
          borderRadius:"14px 14px 0 0", padding:"10px 10px 0", border:`1px solid ${BOR}`, borderBottom:"none" }}>
          {TABS.map((t, i) => (
            <button key={t} type="button" onClick={() => setTab(i)} style={{
              padding:"8px 18px", borderRadius:"10px 10px 0 0", border:"none",
              background: tab===i ? SUR : "transparent",
              color: tab===i ? A : MUT, fontSize:13, fontWeight: tab===i ? 700 : 500,
              cursor:"pointer", transition:"all 0.2s",
              borderBottom: tab===i ? `2px solid ${A}` : "2px solid transparent",
            }}>{t}</button>
          ))}
          {/* Progress indicator */}
          <div style={{ marginLeft:"auto", alignSelf:"center", marginRight:6 }}>
            <div style={{ display:"flex", gap:4 }}>
              {TABS.map((_,i) => (
                <div key={i} style={{ width:6, height:6, borderRadius:"50%",
                  background: i===tab ? A : BOR, transition:"background 0.3s" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Panel */}
        <div style={{ background:SUR, border:`1px solid ${BOR}`, borderTop:"none",
          borderRadius:"0 0 14px 14px", minHeight:260, overflow:"hidden" }}>
          {tab===0 && (
            <div style={{ padding:"28px 32px", display:"flex", gap:28, alignItems:"flex-start",
              animation:"slideIn 0.35s ease both" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ width:80, height:80, borderRadius:"50%", border:`5px solid ${AM}`,
                  background:SUR, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:24, fontWeight:800, color:INK }}>{score}</span>
                  <span style={{ fontSize:10, color:MUT }}>/100</span>
                </div>
                <span style={{ fontSize:9, fontWeight:700, color:AM, textTransform:"uppercase" }}>Needs work</span>
              </div>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
                {[["Readability",88,G],["ATS Safety",72,A],["Quantification",55,AM],["Achievement",63,AM]].map(([l,v,c],i) => (
                  <div key={l as string} style={{ display:"flex", gap:8, alignItems:"center",
                    animation:`fadeIn 0.3s ease ${i*0.1}s both` }}>
                    <span style={{ fontSize:11, color:MUT, width:110 }}>{l as string}</span>
                    <div style={{ flex:1, height:4, borderRadius:2, background:BG2 }}>
                      <div style={{ height:"100%", borderRadius:2, background:c as string,
                        width:`${v}%`, animation:`fillBar 0.7s ease ${0.2+i*0.1}s both` }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:c as string }}>{v as number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab===1 && (
            <div style={{ padding:"28px 32px", animation:"slideIn 0.35s ease both" }}>
              {[
                { orig:"Worked on backend API features.", fix:"Architected REST API serving 2M+ req/day, cutting P95 latency 40%." },
                { orig:"Responsible for improving system performance.", fix:"Reduced dashboard p99 latency from 1.8s to 340ms via Redis caching." },
              ].map((b,i) => (
                <div key={i} style={{ marginBottom:14, animation:`fadeIn 0.3s ease ${i*0.15}s both` }}>
                  <div style={{ padding:"10px 12px", borderRadius:8, background:R+"08",
                    border:`1px solid ${R}20`, fontSize:12, color:MUT,
                    textDecoration:"line-through", marginBottom:6 }}>{b.orig}</div>
                  <div style={{ padding:"10px 12px", borderRadius:8, background:G+"08",
                    border:`1px solid ${G}20`, fontSize:12, color:G, lineHeight:1.5 }}>✨ {b.fix}</div>
                </div>
              ))}
            </div>
          )}
          {tab===2 && (
            <div style={{ padding:"28px 32px", animation:"slideIn 0.35s ease both" }}>
              <div style={{ fontSize:12, fontWeight:600, color:R, marginBottom:12 }}>
                6 high-priority keywords missing from your résumé:
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
                {["TypeScript","Kubernetes","Docker","REST API","CI/CD","PostgreSQL"].map((k,i)=>(
                  <span key={k} style={{ padding:"5px 14px", borderRadius:99, fontSize:12,
                    fontWeight:600, background:R+"10", color:R, border:`1px solid ${R}25`,
                    animation:`chipIn 0.35s cubic-bezier(0.34,1.56,0.64,1) ${i*0.1}s both` }}>−{k}</span>
                ))}
              </div>
              <div style={{ fontSize:12, fontWeight:600, color:G, marginBottom:10 }}>Already in your résumé:</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {["React","Node.js","Git"].map((k,i)=>(
                  <span key={k} style={{ padding:"5px 14px", borderRadius:99, fontSize:12,
                    fontWeight:600, background:G+"10", color:G, border:`1px solid ${G}25`,
                    animation:`chipIn 0.35s cubic-bezier(0.34,1.56,0.64,1) ${0.7+i*0.1}s both` }}>✓{k}</span>
                ))}
              </div>
            </div>
          )}
          {tab===3 && (
            <div style={{ padding:"28px 32px", display:"flex", gap:24, alignItems:"center",
              animation:"slideIn 0.35s ease both" }}>
              <div style={{ flex:1, padding:"16px", background:BG, borderRadius:12,
                border:`1px solid ${BOR}`, fontSize:10.5, color:MUT, lineHeight:1.9 }}>
                <strong style={{ color:INK, fontSize:13 }}>Alex Johnson</strong><br/>
                Software Engineer II · Stripe<br/>
                <span style={{ color:G }}>●</span> Architected REST API 2M+ req/day...<br/>
                <span style={{ color:G }}>●</span> Reduced P99 latency 1.8s → 340ms...
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                <div style={{ fontSize:22, animation:"pulse 1.5s infinite" }}>→</div>
                <span style={{ fontSize:10, color:MUT }}>Chromium</span>
              </div>
              <div style={{ flex:1, padding:"16px", background:"#f0fdf4",
                borderRadius:12, border:"1px solid #bbf7d0",
                display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                animation:"glow 2s ease infinite" }}>
                <div style={{ fontSize:32 }}>📄</div>
                <div style={{ fontSize:12, fontWeight:700, color:G }}>alex-resume.pdf</div>
                <div style={{ fontSize:10, color:MUT }}>Pixel-perfect preview</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </VariantShell>
  );
}

/* ══════════════════════════════════════════════════════════
   E — Scanning / highlight animation on resume preview
   A scan line sweeps the resume, bullets light up red/green
══════════════════════════════════════════════════════════ */
const RESUME_LINES = [
  { text:"• Worked on backend API features for the product team.", bad:true },
  { text:"• Built webhook system handling 2M+ events/day using Go and Kafka.", bad:false },
  { text:"• Led team of 4 migrating legacy PHP to Go microservices.", bad:false },
  { text:"• Responsible for improving system performance.", bad:true },
  { text:"• Developed React component library cutting UI dev time 20%.", bad:false },
];

export function VariantE({ embedded = false }: VariantProps = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [lit, setLit] = useState<boolean[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!seen) return;
    setScanning(true);
    RESUME_LINES.forEach((_, i) => {
      setTimeout(() => setLit(prev => { const n = [...prev]; n[i] = true; return n; }), 400 + i * 350);
    });
    setTimeout(() => setScanning(false), 400 + RESUME_LINES.length * 350 + 200);
  }, [seen]);

  return (
    <VariantShell
      embedded={embedded}
      shellRef={ref}
      sectionStyle={{ background:BG, padding:"80px 40px" }}
      label={<Label id="E" name="Resume Scan Animation" desc="A scan line sweeps the preview. Bullets light up red (flagged) or green (strong) as it passes." />}
    >
      <div
        className="lp-preview-e-grid"
        style={{
          maxWidth: embedded ? "100%" : 720,
          margin:"0 auto",
        }}
      >
        {/* Resume paper */}
        <div style={{ background:SUR, borderRadius:16, border:`1px solid ${BOR}`,
          overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.08)", position:"relative" }}>
          <div style={{ display:"flex", gap:6, padding:"10px 14px",
            background:BG2, borderBottom:`1px solid ${BOR}` }}>
            {["#ff5f57","#febc2e","#28c840"].map(c=><div key={c} style={{ width:9,height:9,borderRadius:"50%",background:c }}/>)}
            <span style={{ fontSize:10, color:MUT, marginLeft:6 }}>Resume preview</span>
            {scanning && <span style={{ marginLeft:"auto", fontSize:9, color:A,
              fontWeight:700, animation:"pulse 0.8s infinite" }}>● Scanning...</span>}
          </div>
          <div style={{ padding:"16px 18px", position:"relative" }}>
            {/* Scan line */}
            {scanning && seen && (
              <div style={{ position:"absolute", left:0, right:0, height:2,
                background:`linear-gradient(to right, transparent, ${A}80, transparent)`,
                animation:"scanLine 1.8s ease both", pointerEvents:"none", zIndex:2 }} />
            )}
            <div style={{ fontSize:13, fontWeight:800, color:INK, marginBottom:2 }}>Alex Johnson</div>
            <div style={{ fontSize:10, color:MUT, marginBottom:12 }}>alex@email.com · San Francisco, CA</div>
            <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase",
              letterSpacing:1, color:"#555", borderBottom:`1px solid ${BOR}`,
              paddingBottom:4, marginBottom:8 }}>Experience</div>
            <div style={{ fontSize:10, fontWeight:600, color:INK, marginBottom:6 }}>
              Software Engineer II · Stripe · 2022–Present
            </div>
            {RESUME_LINES.map((line, i) => (
              <div key={i} style={{ padding:"3px 6px 3px 4px", borderRadius:4, marginBottom:3,
                fontSize:10, lineHeight:1.45, color:"#333",
                background: lit[i] ? (line.bad ? R+"14" : G+"10") : "transparent",
                border: lit[i] ? `1px solid ${line.bad ? R+"30" : G+"25"}` : "1px solid transparent",
                transition:"background 0.3s, border-color 0.3s",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>{line.text}</span>
                {lit[i] && <span style={{ fontSize:9, flexShrink:0, marginLeft:4,
                  color: line.bad ? R : G }}>{line.bad ? "⚠" : "✓"}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Side panel — flagged count + first fix */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ padding:"16px 18px", background:SUR, borderRadius:14,
            border:`1px solid ${BOR}`, boxShadow:"0 4px 16px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:MUT, textTransform:"uppercase",
              letterSpacing:0.6, marginBottom:8 }}>Analysis</div>
            <div style={{ display:"flex", gap:16 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:800, color:R }}>
                  {lit.filter((l,i)=>l&&RESUME_LINES[i].bad).length}
                </div>
                <div style={{ fontSize:10, color:MUT }}>flagged</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:800, color:G }}>
                  {lit.filter((l,i)=>l&&!RESUME_LINES[i].bad).length}
                </div>
                <div style={{ fontSize:10, color:MUT }}>strong</div>
              </div>
            </div>
          </div>
          {lit[0] && (
            <div style={{ padding:"16px 18px", background:SUR, borderRadius:14,
              border:`1px solid ${BOR}`, animation:"fadeIn 0.4s ease both" }}>
              <div style={{ fontSize:10, fontWeight:700, color:R, marginBottom:8,
                textTransform:"uppercase", letterSpacing:0.6 }}>⚠ First fix</div>
              <div style={{ fontSize:11, color:MUT, textDecoration:"line-through",
                marginBottom:8, lineHeight:1.4 }}>
                Worked on backend API features...
              </div>
              <div style={{ fontSize:11, color:G, lineHeight:1.4 }}>
                ✨ Architected REST API serving 2M+ daily requests, cutting P95 latency 40%.
              </div>
            </div>
          )}
        </div>
      </div>
    </VariantShell>
  );
}

/* ── Showcase ──────────────────────────────────────────── */
export function LandingFeatureShowcase() {
  return (
    <div style={{ fontFamily:"-apple-system,'DM Sans',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ background:"#0f172a", padding:"28px 40px", textAlign:"center" }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:"#fff", margin:"0 0 6px" }}>
          Feature Section — 5 Animated Variants
        </h1>
        <p style={{ fontSize:12, color:"#64748b", margin:0 }}>
          All animations trigger on scroll-into-view. Scroll through or refresh to replay.
        </p>
      </div>
      <VariantA />
      <div style={{ height:3, background:"#e2e8f0" }} />
      <VariantB />
      <div style={{ height:3, background:"#e2e8f0" }} />
      <VariantC />
      <div style={{ height:3, background:"#e2e8f0" }} />
      <VariantD />
      <div style={{ height:3, background:"#e2e8f0" }} />
      <VariantE />
    </div>
  );
}
