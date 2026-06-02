"use client";

/**
 * Score preview mockup showcase — 5 variants for user approval.
 * Temporary component; delete after variant is picked and integrated.
 */

const ACCENT = "#2f81f7";
const GREEN = "#34d399";
const AMBER = "#f59e0b";
const RED = "#f87171";
const DIM = "var(--muted)";
const TEXT = "var(--text)";
const SURFACE = "var(--surface)";
const BORDER = "var(--border)";

const CATS = [
  { label: "Readability",       score: 88, color: GREEN },
  { label: "ATS Safety",        score: 72, color: ACCENT },
  { label: "Quantification",    score: 55, color: AMBER },
  { label: "Achievement Quality", score: 63, color: AMBER },
  { label: "Language Quality",  score: 81, color: GREEN },
  { label: "Section Structure", score: 76, color: ACCENT },
];

const WEAK_BULLET  = "Worked on backend API features for the product team.";
const GOOD_BULLET  = "Architected REST API serving 2M+ daily requests, cutting P95 latency 40%.";
const TOP_ISSUES   = ["Add metrics to 3 bullets", "Weak opening verbs", "Missing skills section"];

/* ── shared helpers ───────────────────────────────────────── */

function ScoreBadge({ score, size = 72 }: { score: number; size?: number }) {
  const color = score >= 80 ? GREEN : score >= 65 ? AMBER : RED;
  const label = score >= 80 ? "Strong" : score >= 65 ? "Needs work" : "Weak";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        border: `${size / 14}px solid ${color}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "var(--surface2)",
        boxShadow: `0 0 0 ${size / 22}px ${color}22`,
      }}>
        <span style={{ fontSize: size * 0.31, fontWeight: 800, letterSpacing: -1, color: TEXT, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: size * 0.14, color: DIM, lineHeight: 1 }}>/100</span>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
    </div>
  );
}

function Bar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: "var(--surface2)", overflow: "hidden", flex: 1 }}>
      <div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.6s" }} />
    </div>
  );
}

function Tag({ text, color = ACCENT }: { text: string; color?: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: color + "18", color, border: `1px solid ${color}30`, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function MockLabel() {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
      <span style={{ fontSize: 10, color: DIM, background: "var(--surface2)", padding: "2px 10px",
        borderRadius: 99, border: `1px solid ${BORDER}` }}>
        Sample output · your results appear here after upload
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant A — Score + Category Bars (Kickresume-style)        */
/* ─────────────────────────────────────────────────────────── */
export function VariantA() {
  return (
    <Card style={{ maxWidth: 460, margin: "0 auto" }}>
      <div style={{ padding: "20px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
          <ScoreBadge score={74} size={80} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
              Needs improvement
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, letterSpacing: -0.3 }}>
              Your résumé scored 74/100
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>
              Beating 48% of similar profiles
            </div>
          </div>
        </div>
        {CATS.map(c => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <span style={{ fontSize: 11.5, color: DIM, width: 145, flexShrink: 0 }}>{c.label}</span>
            <Bar score={c.score} color={c.color} />
            <span style={{ fontSize: 11, fontWeight: 700, color: c.color, width: 26, textAlign: "right" }}>{c.score}</span>
          </div>
        ))}
      </div>
      <MockLabel />
      <div style={{ height: 12 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant B — Score + Flagged Bullet with AI Rewrite          */
/* ─────────────────────────────────────────────────────────── */
export function VariantB() {
  return (
    <Card style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ padding: "20px 22px 18px" }}>
        {/* Top row: score + issue count */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <ScoreBadge score={74} size={68} />
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Readability", val: 88, c: GREEN },
              { label: "ATS Safety",  val: 72, c: ACCENT },
              { label: "Quant.",      val: 55, c: AMBER },
            ].map(x => (
              <div key={x.label} style={{ textAlign: "center", padding: "8px 12px",
                borderRadius: 10, background: "var(--surface2)", border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: x.c }}>{x.val}</div>
                <div style={{ fontSize: 9.5, color: DIM, marginTop: 1 }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Flagged bullet */}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Bullet coaching · 1 of 5 flagged
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 8, background: RED + "0d",
          border: `1px solid ${RED}30`, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ fontSize: 14, marginTop: 1 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.45, marginBottom: 5,
                textDecoration: "line-through", opacity: 0.6 }}>{WEAK_BULLET}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <Tag text="Weak verb" color={AMBER} />
                <Tag text="No metrics" color={RED} />
              </div>
            </div>
          </div>
        </div>

        {/* AI rewrite */}
        <div style={{ padding: "10px 12px", borderRadius: 8, background: GREEN + "0d",
          border: `1px solid ${GREEN}30` }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: GREEN, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 5 }}>✨ AI rewrite</div>
          <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{GOOD_BULLET}</div>
        </div>
      </div>
      <MockLabel />
      <div style={{ height: 12 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant C — Split: Score Panel Left + Annotated Bullets Right */
/* ─────────────────────────────────────────────────────────── */
export function VariantC() {
  const bullets = [
    { text: "Worked on backend API features for the product team.", bad: true },
    { text: "Architected REST API serving 2M+ daily requests, cutting P95 latency 40%.", bad: false },
    { text: "Led migration of legacy services to microservices architecture.", bad: false },
    { text: "Responsible for improving system performance.", bad: true },
  ];
  return (
    <Card style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr" }}>
        {/* Left: score panel */}
        <div style={{ padding: "20px 16px", borderRight: `1px solid ${BORDER}`,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <ScoreBadge score={74} size={72} />
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
            {CATS.slice(0, 4).map(c => (
              <div key={c.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: DIM }}>{c.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.color }}>{c.score}</span>
                </div>
                <Bar score={c.score} color={c.color} />
              </div>
            ))}
          </div>
          <div style={{ padding: "6px 10px", borderRadius: 8, background: AMBER + "12",
            border: `1px solid ${AMBER}30`, width: "100%" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: AMBER, marginBottom: 3 }}>Top fixes</div>
            {TOP_ISSUES.map(i => (
              <div key={i} style={{ fontSize: 10, color: DIM, marginBottom: 1 }}>· {i}</div>
            ))}
          </div>
        </div>

        {/* Right: annotated bullets */}
        <div style={{ padding: "18px 18px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 10 }}>Bullet-by-bullet analysis</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start",
                padding: "8px 10px", borderRadius: 8,
                background: b.bad ? RED + "08" : GREEN + "08",
                border: `1px solid ${b.bad ? RED : GREEN}25` }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{b.bad ? "⚠️" : "✓"}</span>
                <span style={{ fontSize: 11.5, color: TEXT, lineHeight: 1.4 }}>{b.text}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: DIM }}>
            2 of 4 bullets need rewrites · <span style={{ color: ACCENT, fontWeight: 600 }}>see all 12</span>
          </div>
        </div>
      </div>
      <MockLabel />
      <div style={{ height: 12 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant D — Before / After Transformation                   */
/* ─────────────────────────────────────────────────────────── */
export function VariantD() {
  return (
    <Card style={{ maxWidth: 580, margin: "0 auto" }}>
      <div style={{ padding: "18px 20px" }}>
        {/* Score strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
          padding: "10px 14px", borderRadius: 10, background: "var(--surface2)", border: `1px solid ${BORDER}` }}>
          <ScoreBadge score={74} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>Before Resunova · 5 bullets need rewrites</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <Tag text="Missing metrics" color={RED} />
              <Tag text="Weak verbs" color={AMBER} />
              <Tag text="Duty-focused" color={AMBER} />
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: DIM, marginBottom: 2 }}>After fixes</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: GREEN }}>91</div>
            <div style={{ fontSize: 9, color: DIM }}>/100</div>
          </div>
        </div>

        {/* Before / After */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: RED, textTransform: "uppercase",
              letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <span>✗</span> Before
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: RED + "08",
              border: `1px solid ${RED}30`, fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
              {WEAK_BULLET}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Tag text="No metrics" color={RED} />
              <Tag text="Vague verb" color={AMBER} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, textTransform: "uppercase",
              letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <span>✓</span> After AI rewrite
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: GREEN + "08",
              border: `1px solid ${GREEN}30`, fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
              {GOOD_BULLET}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Tag text="2M+ metric" color={GREEN} />
              <Tag text="Strong verb" color={GREEN} />
            </div>
          </div>
        </div>
      </div>
      <MockLabel />
      <div style={{ height: 12 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant E — Full Mini Dashboard (most realistic preview)    */
/* ─────────────────────────────────────────────────────────── */
export function VariantE() {
  const cats = [
    { label: "Achievement Quality", score: 63, flagged: 3 },
    { label: "Quantification",      score: 55, flagged: 5 },
    { label: "Section Structure",   score: 76, flagged: 1 },
    { label: "Readability",         score: 88, flagged: 0 },
  ];
  return (
    <Card style={{ maxWidth: 640, margin: "0 auto", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        borderBottom: `1px solid ${BORDER}`, background: "var(--surface2)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ fontSize: 11, color: DIM, marginLeft: 8 }}>Resunova · Improvement Plan</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr" }}>
        {/* Sidebar */}
        <div style={{ borderRight: `1px solid ${BORDER}`, padding: "14px 12px" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 8 }}>Top fixes</div>
          {cats.filter(c => c.flagged > 0).map(c => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 8px", borderRadius: 7, marginBottom: 4,
              background: c.score < 70 ? AMBER + "10" : "transparent",
              border: `1px solid ${c.score < 70 ? AMBER + "30" : "transparent"}` }}>
              <span style={{ fontSize: 10.5, color: TEXT }}>{c.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 10, color: RED, fontWeight: 700 }}>{c.flagged}✗</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: c.score < 70 ? AMBER : GREEN }}>{c.score}</span>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 9.5, fontWeight: 700, color: DIM,
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Completed</div>
          {cats.filter(c => c.flagged === 0).map(c => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "5px 8px", borderRadius: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 10.5, color: DIM }}>{c.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN }}>✓ {c.score}</span>
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
            padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", border: `1px solid ${BORDER}` }}>
            <ScoreBadge score={74} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, marginBottom: 2 }}>Overall: 74/100</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <Tag text="9 bullets need rewrites" color={AMBER} />
                <Tag text="3 top issues" color={RED} />
              </div>
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 7 }}>Quantification · 5 bullets flagged</div>

          {[WEAK_BULLET, "Managed the data pipeline for reporting."].map((b, i) => (
            <div key={i} style={{ padding: "9px 11px", borderRadius: 8, marginBottom: 6,
              background: RED + "08", border: `1px solid ${RED}25` }}>
              <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.4, marginBottom: 5 }}>{b}</div>
              <div style={{ padding: "7px 9px", borderRadius: 6, background: GREEN + "0d",
                border: `1px solid ${GREEN}25`, fontSize: 11, color: TEXT, lineHeight: 1.4 }}>
                {i === 0 ? GOOD_BULLET : "Automated ETL pipeline processing 500K records/day, reducing report lag 62%."}
              </div>
            </div>
          ))}
        </div>
      </div>
      <MockLabel />
      <div style={{ height: 10 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant F — Highlighted Resume Preview + Apply Flow         */
/* ─────────────────────────────────────────────────────────── */
export function VariantF() {
  const resumeLines = [
    { text: "Alex Johnson", type: "name" },
    { text: "alex@email.com · github.com/alexj · San Francisco, CA", type: "contact" },
    { text: "EXPERIENCE", type: "section" },
    { text: "Software Engineer II · Stripe · Jun 2022 – Present", type: "role" },
    { text: "• Worked on backend API features for the product team.", type: "bullet-bad", idx: 0 },
    { text: "• Built a real-time webhook replay system handling 2M+ events/day using Go and Kafka.", type: "bullet-ok", idx: 1 },
    { text: "• Led a team of 4 engineers to migrate legacy PHP services to Go microservices.", type: "bullet-ok", idx: 2 },
    { text: "• Responsible for improving system performance.", type: "bullet-bad", idx: 3 },
    { text: "Software Engineer Intern · Airbnb · May–Aug 2021", type: "role" },
    { text: "• Developed a React component library used by 12 product teams, cutting UI dev time 20%.", type: "bullet-ok", idx: 4 },
  ];

  const bulletColor = (type: string) =>
    type === "bullet-bad" ? { bg: RED + "14", border: `1px solid ${RED}35`, cursor: "pointer" } :
    type === "bullet-ok"  ? { bg: GREEN + "10", border: `1px solid ${GREEN}30`, cursor: "default" } :
    { bg: "transparent", border: "none", cursor: "default" };

  return (
    <Card style={{ maxWidth: 700, margin: "0 auto", overflow: "hidden" }}>
      {/* Chrome bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderBottom: `1px solid ${BORDER}`, background: "var(--surface2)" }}>
        {["#ff5f57","#febc2e","#28c840"].map(c => (
          <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>Resunova · Improvement Plan · Quantification</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          <Tag text="5 flagged" color={RED} />
          <Tag text="Score 55" color={AMBER} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* LEFT — resume preview with highlights */}
        <div style={{ borderRight: `1px solid ${BORDER}`, padding: "14px 16px" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 10 }}>
            📄 Live preview — click any red bullet
          </div>
          <div style={{ background: "white", borderRadius: 8, padding: "12px 14px",
            border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            {resumeLines.map((line, i) => {
              const s = bulletColor(line.type);
              const isSec = line.type === "section";
              const isName = line.type === "name";
              const isContact = line.type === "contact";
              return (
                <div key={i} style={{
                  fontSize: isName ? 13 : isSec ? 9 : isContact ? 9 : 10,
                  fontWeight: isName ? 800 : isSec ? 800 : line.type === "role" ? 600 : 400,
                  color: isName ? "#111" : isSec ? "#444" : isContact ? "#666" : "#222",
                  letterSpacing: isSec ? 0.8 : 0,
                  textTransform: isSec ? "uppercase" : "none",
                  marginTop: isSec ? 10 : isName ? 0 : 3,
                  marginBottom: isSec ? 4 : 0,
                  padding: line.type.startsWith("bullet") ? "3px 5px" : "0",
                  borderRadius: line.type.startsWith("bullet") ? 4 : 0,
                  background: s.bg,
                  border: s.border,
                  lineHeight: 1.45,
                  position: "relative" as const,
                }}>
                  {line.text}
                  {line.type === "bullet-bad" && (
                    <span style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
                      fontSize: 9, color: RED, fontWeight: 700 }}>⚠</span>
                  )}
                  {line.type === "bullet-ok" && (
                    <span style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
                      fontSize: 9, color: GREEN, fontWeight: 700 }}>✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — suggestion card with apply flow */}
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5 }}>Selected bullet · fix 1 of 2</div>

          {/* Flagged bullet */}
          <div style={{ padding: "10px 12px", borderRadius: 8, background: RED + "0a",
            border: `1px solid ${RED}30` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: RED, marginBottom: 4 }}>⚠ Flagged</div>
            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.45, textDecoration: "line-through",
              opacity: 0.7 }}>{WEAK_BULLET}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <Tag text="No metrics" color={RED} />
              <Tag text="Weak verb" color={AMBER} />
            </div>
          </div>

          {/* AI rewrite */}
          <div style={{ padding: "10px 12px", borderRadius: 8, background: GREEN + "0a",
            border: `1px solid ${GREEN}35` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, marginBottom: 4 }}>✨ AI rewrite</div>
            <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.5 }}>{GOOD_BULLET}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <Tag text="2M+ metric added" color={GREEN} />
              <Tag text="Strong verb" color={GREEN} />
            </div>
          </div>

          {/* Apply button */}
          <div style={{ display: "flex", gap: 7 }}>
            <button style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
              background: ACCENT, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span>↑</span> Apply to résumé
            </button>
            <button style={{ padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "var(--surface2)",
              color: DIM, fontSize: 11, cursor: "pointer" }}>
              Copy
            </button>
          </div>

          {/* Applied state preview */}
          <div style={{ padding: "9px 12px", borderRadius: 8, background: GREEN + "08",
            border: `1px solid ${GREEN}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Applied — preview updated</div>
              <div style={{ fontSize: 10, color: DIM }}>Bullet replaced · score recalculated</div>
            </div>
          </div>

          <div style={{ fontSize: 10, color: DIM, textAlign: "center" }}>
            Next: <span style={{ color: ACCENT, fontWeight: 600 }}>Responsible for improving… →</span>
          </div>
        </div>
      </div>
      <MockLabel />
      <div style={{ height: 10 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Variant G — Full 3-Panel: Score + Resume + Apply           */
/* ─────────────────────────────────────────────────────────── */
export function VariantG() {
  return (
    <Card style={{ maxWidth: 760, margin: "0 auto", overflow: "hidden" }}>
      {/* Chrome */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderBottom: `1px solid ${BORDER}`, background: "var(--surface2)" }}>
        {["#ff5f57","#febc2e","#28c840"].map(c => (
          <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>Resunova · Improvement Plan</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 200px" }}>
        {/* Col 1 — Sidebar scores */}
        <div style={{ borderRight: `1px solid ${BORDER}`, padding: "12px 10px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
            <ScoreBadge score={74} size={56} />
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: RED, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6 }}>Top fixes</div>
          {[
            { label: "Quantification", score: 55, flagged: 5, active: true },
            { label: "Achievement",    score: 63, flagged: 3, active: false },
            { label: "Sect. Structure",score: 76, flagged: 1, active: false },
          ].map(c => (
            <div key={c.label} style={{ padding: "5px 7px", borderRadius: 7, marginBottom: 3,
              background: c.active ? ACCENT + "14" : "transparent",
              border: `1px solid ${c.active ? ACCENT + "40" : "transparent"}`,
              boxShadow: c.active ? `inset 2px 0 0 ${ACCENT}` : "none" }}>
              <div style={{ fontSize: 9.5, fontWeight: c.active ? 700 : 500,
                color: c.active ? TEXT : DIM }}>{c.label}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 1 }}>
                <span style={{ fontSize: 9, color: RED }}>{c.flagged}✗</span>
                <span style={{ fontSize: 9, color: c.score < 70 ? AMBER : GREEN,
                  fontWeight: 700 }}>{c.score}</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 9, fontWeight: 700, color: GREEN, textTransform: "uppercase",
            letterSpacing: 0.5, margin: "10px 0 6px" }}>Completed</div>
          {[{ label: "Readability", score: 88 }, { label: "Language", score: 81 }].map(c => (
            <div key={c.label} style={{ padding: "4px 7px", display: "flex",
              justifyContent: "space-between" }}>
              <span style={{ fontSize: 9.5, color: DIM }}>{c.label}</span>
              <span style={{ fontSize: 9.5, color: GREEN, fontWeight: 700 }}>✓{c.score}</span>
            </div>
          ))}
        </div>

        {/* Col 2 — Annotated resume preview */}
        <div style={{ padding: "12px 14px", borderRight: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 8 }}>📄 Resume preview · red = flagged</div>
          <div style={{ background: "white", borderRadius: 6, padding: "10px 12px",
            border: `1px solid ${BORDER}`, fontSize: 9.5, lineHeight: 1.5,
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: "#111", marginBottom: 1 }}>Alex Johnson</div>
            <div style={{ fontSize: 8.5, color: "#888", marginBottom: 8 }}>alex@email.com · San Francisco</div>

            <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", color: "#444",
              letterSpacing: 0.8, borderBottom: "1px solid #e0e0e0", marginBottom: 5, paddingBottom: 2 }}>
              Experience
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#333", marginBottom: 4 }}>
              Software Engineer II · Stripe
            </div>
            {[
              { text: "• Worked on backend API features for the product.", bad: true, selected: true },
              { text: "• Built webhook system handling 2M+ events/day using Go.", bad: false },
              { text: "• Led team of 4 migrating PHP to Go microservices.", bad: false },
              { text: "• Responsible for improving system performance.", bad: true },
            ].map((b, i) => (
              <div key={i} style={{ padding: "2px 4px", borderRadius: 3, marginBottom: 2,
                background: b.bad ? (b.selected ? RED + "22" : RED + "12") : GREEN + "10",
                border: b.selected ? `1.5px solid ${RED}60` : `1px solid ${b.bad ? RED + "30" : GREEN + "25"}`,
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#333" }}>{b.text}</span>
                <span style={{ fontSize: 8, marginLeft: 4, flexShrink: 0,
                  color: b.bad ? RED : GREEN, fontWeight: 700 }}>{b.bad ? "⚠" : "✓"}</span>
              </div>
            ))}

            <div style={{ marginTop: 8, fontSize: 8, fontWeight: 800, textTransform: "uppercase",
              color: "#444", letterSpacing: 0.8, borderBottom: "1px solid #e0e0e0",
              marginBottom: 5, paddingBottom: 2 }}>Education</div>
            <div style={{ fontSize: 9, color: "#555" }}>UC Berkeley · B.S. Computer Science · 2022</div>
          </div>
        </div>

        {/* Col 3 — Apply panel */}
        <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DIM, textTransform: "uppercase",
            letterSpacing: 0.5 }}>Fix 1 of 5</div>

          <div style={{ padding: "8px 10px", borderRadius: 7, background: RED + "0a",
            border: `1px solid ${RED}30` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: RED, marginBottom: 3 }}>⚠ Original</div>
            <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4,
              textDecoration: "line-through", opacity: 0.65 }}>
              Worked on backend API features for the product team.
            </div>
          </div>

          <div style={{ padding: "8px 10px", borderRadius: 7, background: GREEN + "0a",
            border: `1px solid ${GREEN}35` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: GREEN, marginBottom: 3 }}>✨ AI rewrite</div>
            <div style={{ fontSize: 10, color: TEXT, lineHeight: 1.4 }}>{GOOD_BULLET}</div>
          </div>

          <button style={{ width: "100%", padding: "8px 0", borderRadius: 7, border: "none",
            background: ACCENT, color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            ↑ Apply to résumé
          </button>
          <button style={{ width: "100%", padding: "6px 0", borderRadius: 7,
            border: `1px solid ${BORDER}`, background: "transparent",
            color: DIM, fontSize: 10, cursor: "pointer" }}>
            Copy text
          </button>

          <div style={{ padding: "7px 9px", borderRadius: 7, background: GREEN + "10",
            border: `1px solid ${GREEN}30`, display: "flex", gap: 6, alignItems: "center" }}>
            <span>✅</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: GREEN }}>Applied!</div>
              <div style={{ fontSize: 9, color: DIM }}>Preview updated live</div>
            </div>
          </div>

          <div style={{ fontSize: 9.5, color: DIM, textAlign: "center", marginTop: 2 }}>
            Next → <span style={{ color: ACCENT, fontWeight: 600 }}>Responsible for…</span>
          </div>
        </div>
      </div>
      <MockLabel />
      <div style={{ height: 10 }} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Showcase wrapper                                            */
/* ─────────────────────────────────────────────────────────── */
export function ScorePreviewShowcase() {
  const variants = [
    { id: "A", name: "Score + Category Bars",       desc: "Kickresume-style. Clean score circle with progress bars per dimension.", Component: VariantA },
    { id: "B", name: "Score + Bullet Coach",        desc: "Shows score AND a flagged bullet with AI rewrite side-by-side.", Component: VariantB },
    { id: "C", name: "Split Panel",                 desc: "Two-column: score/categories left, annotated bullet list right.", Component: VariantC },
    { id: "D", name: "Before / After",              desc: "Transformation focus: weak bullet vs. AI-improved with outcome tags.", Component: VariantD },
    { id: "E", name: "Mini Dashboard",              desc: "Full miniature of the actual results UI — sidebar + bullet cards.", Component: VariantE },
    { id: "F", name: "Resume Preview + Apply Flow", desc: "Left: live resume with red/green bullet highlights. Right: suggestion card with Apply button + applied state.", Component: VariantF },
    { id: "G", name: "Full 3-Panel (most complete)", desc: "Score sidebar + annotated resume preview + apply panel — shows the entire workflow in one view.", Component: VariantG },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>
        Score Preview — 5 Variants for Approval
      </h1>
      <p style={{ fontSize: 13, color: DIM, marginBottom: 32 }}>
        These replace the 3 feature cards on the Analyze upload page. Pick one and I'll integrate it.
      </p>
      {variants.map(({ id, name, desc, Component }) => (
        <div key={id} style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT,
              background: ACCENT + "18", padding: "2px 9px", borderRadius: 99, letterSpacing: 0.5 }}>
              Variant {id}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{name}</span>
          </div>
          <p style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>{desc}</p>
          <Component />
        </div>
      ))}
    </div>
  );
}
