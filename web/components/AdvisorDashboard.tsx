"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DimAvgs {
  readability: number | null;
  atsCompatibility: number | null;
  jobMatch: number | null;
  achievementQuality: number | null;
  quantification: number | null;
  sectionStructure: number | null;
  languageQuality: number | null;
  technicalBranding: number | null;
}

interface ScoreTiers { low: number; mid: number; good: number; strong: number; }
interface WeakDim    { dimension: string; avg: number; }
interface TopIssue   { issue: string; count: number; }

interface Student {
  user_id: string;
  user_email?: string;
  latest_score: number | null;
  latest_at: string | null;
  analysis_count: number;
}

interface CohortStats {
  student_count: number;
  analysis_count: number;
  avg_overall: number | null;
  score_tiers: ScoreTiers;
  dimension_avgs: DimAvgs;
  weakest_dims: WeakDim[];
  top_issues: TopIssue[];
  student_roster: Student[];
  generated_at: string;
}

interface ScorePoint { date: string | null; score: number | null; label: string | null; }

interface ResumeEntry { folder: string; company: string; role: string; score: number | null; pdf_url: string | null; created_at: string | null; }

interface StudentDetail {
  student_id: string;
  user_email: string | null;
  analysis_count: number;
  first_score: number | null;
  latest_score: number | null;
  score_delta: number | null;
  score_history: ScorePoint[];
  dim_avgs: DimAvgs;
  top_issues: TopIssue[];
  latest_strengths: string[];
  latest_category_scores: Record<string, number | null>;
  resumes: ResumeEntry[];
  latest_resume_text: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIM_LABELS: Record<string, string> = {
  readability:        "Readability",
  atsCompatibility:   "ATS Compatibility",
  jobMatch:           "Job Match",
  achievementQuality: "Achievement Quality",
  quantification:     "Quantification",
  sectionStructure:   "Section Structure",
  languageQuality:    "Language Quality",
  technicalBranding:  "Field Branding",
};

function scoreColor(s: number | null): string {
  if (s === null) return "var(--dim)";
  if (s >= 75) return "#16a34a";
  if (s >= 55) return "#92400e";
  return "#991b1b";
}

function scoreBg(s: number | null): string {
  if (s === null) return "transparent";
  if (s >= 75) return "rgba(22,163,74,0.09)";
  if (s >= 55) return "rgba(146,64,14,0.09)";
  return "rgba(153,27,27,0.09)";
}

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function fmtShort(d: string | null): string {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return d; }
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 14 }}>
      {children}
    </div>
  );
}

function DimRow({ label, value }: { label: string; value: number | null }) {
  const color = scoreColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 148, fontSize: 12, color: "var(--dim)", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value ?? 0}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.9s ease" }} />
      </div>
      <div style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 500, color, flexShrink: 0 }}>
        {value !== null ? Math.round(value) : "—"}
      </div>
    </div>
  );
}

function TierRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 90, fontSize: 12, color: "var(--dim)", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.9s ease" }} />
      </div>
      <div style={{ width: 28, textAlign: "right", fontSize: 12, color: "var(--text)", flexShrink: 0 }}>{count}</div>
      <div style={{ width: 34, textAlign: "right", fontSize: 11, color: "var(--dim)", flexShrink: 0 }}>{Math.round(pct)}%</div>
    </div>
  );
}

function KpiCard({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return (
    <div style={{ padding: "24px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: -1, color: "var(--text)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", marginTop: 10 }}>{label}</div>
      {note && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>{note}</div>}
    </div>
  );
}

// ── Score Sparkline ───────────────────────────────────────────────────────────

function ScoreSparkline({ history }: { history: ScorePoint[] }) {
  const valid = history.filter(p => p.score !== null);
  if (valid.length === 0) return <p style={{ fontSize: 12, color: "var(--dim)" }}>No data yet.</p>;

  const max = Math.max(...valid.map(p => p.score!));
  const min = Math.min(...valid.map(p => p.score!));
  const range = Math.max(max - min, 10);
  const h = 80;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: h, marginBottom: 8 }}>
        {valid.map((p, i) => {
          const pct = (p.score! - min) / range;
          const barH = Math.max(6, Math.round(pct * (h - 10)) + 10);
          const color = scoreColor(p.score);
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}
              title={`${p.score} — ${fmtShort(p.date)}`}
            >
              <div style={{ fontSize: 10, color: "var(--dim)" }}>{p.score}</div>
              <div style={{ width: "100%", height: barH, background: color, borderRadius: "3px 3px 0 0", opacity: i === valid.length - 1 ? 1 : 0.55 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)" }}>
        <span>{fmtShort(valid[0].date)}</span>
        <span>{fmtShort(valid[valid.length - 1].date)}</span>
      </div>
    </div>
  );
}

// ── Student Detail Panel ──────────────────────────────────────────────────────

function StudentDetailPanel({
  studentId, advisorEmail, onBack,
}: { studentId: string; advisorEmail: string; onBack: () => void }) {
  const [detail, setDetail]   = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl("/api/student-detail")}?student_id=${encodeURIComponent(studentId)}`, {
      headers: { "X-User-Email": advisorEmail },
    })
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? `HTTP ${r.status}`)))
      .then(d => setDetail(d as StudentDetail))
      .catch(e => setError(typeof e === "string" ? e : "Failed to load."))
      .finally(() => setLoading(false));
  }, [studentId, advisorEmail]);

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "40px 32px 100px" }}>

      {/* Back */}
      <button
        onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 28 }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to cohort
      </button>

      {loading && (
        <div style={{ display: "flex", gap: 10, color: "var(--dim)", fontSize: 13, alignItems: "center" }}>
          <div style={{ width: 16, height: 16, border: "1.5px solid var(--border)", borderTopColor: "var(--dim)", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
          Loading student data…
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: "var(--red, #991b1b)" }}>{error}</p>}

      {detail && (() => {
        const d = detail;
        const delta = d.score_delta;
        return (
          <>
            {/* Header */}
            <div style={{ marginBottom: 30 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
                Student profile
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 400, letterSpacing: -0.4, margin: 0 }}>
                {d.user_email ?? "Anonymous student"}
              </h2>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
              <KpiCard value={d.analysis_count} label="Analyses run" />
              <KpiCard value={d.first_score ?? "—"} label="Starting score" />
              <KpiCard value={d.latest_score ?? "—"} label="Current score" />
              <KpiCard
                value={delta !== null ? `${delta > 0 ? "+" : ""}${delta}` : "—"}
                label="Improvement"
                note={delta !== null && delta > 0 ? "Trending up" : delta !== null && delta < 0 ? "Trending down" : "No change yet"}
              />
            </div>

            {/* Score history + Dimensions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
                <SectionLabel>Score history</SectionLabel>
                <ScoreSparkline history={d.score_history} />
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
                <SectionLabel>Average by dimension</SectionLabel>
                {Object.entries(DIM_LABELS).map(([k, label]) => (
                  <DimRow key={k} label={label} value={d.dim_avgs[k as keyof DimAvgs]} />
                ))}
              </div>
            </div>

            {/* Issues + Strengths */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
                <SectionLabel>Recurring issues</SectionLabel>
                {d.top_issues.length === 0
                  ? <p style={{ fontSize: 13, color: "var(--dim)" }}>None detected.</p>
                  : d.top_issues.map((item, i) => {
                      const max = d.top_issues[0]?.count || 1;
                      return (
                        <div key={i} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: "var(--text)" }}>{item.issue}</span>
                            <span style={{ color: "var(--dim)" }}>{item.count}×</span>
                          </div>
                          <div style={{ height: 3, background: "var(--border)", borderRadius: 2 }}>
                            <div style={{ width: `${(item.count / max) * 100}%`, height: "100%", background: "var(--dim)", borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })
                }
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
                <SectionLabel>Latest strengths</SectionLabel>
                {d.latest_strengths.length === 0
                  ? <p style={{ fontSize: 13, color: "var(--dim)" }}>No strengths recorded yet.</p>
                  : d.latest_strengths.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, color: "var(--dim)", padding: "8px 0", borderBottom: "1px solid var(--border)", lineHeight: 1.5 }}>
                        {s}
                      </div>
                    ))
                }
              </div>
            </div>

            {/* Uploaded resume text */}
            {d.latest_resume_text && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, marginBottom: 16 }}>
                <SectionLabel>Latest uploaded résumé</SectionLabel>
                <pre style={{
                  margin: 0,
                  fontSize: 11.5,
                  lineHeight: 1.7,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 320,
                  overflowY: "auto",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "12px 14px",
                }}>
                  {d.latest_resume_text}
                </pre>
              </div>
            )}

            {/* Tailored resumes */}
            {d.resumes.length > 0 && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, marginBottom: 16 }}>
                <SectionLabel>Tailored résumés</SectionLabel>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Role", "Company", "Job-fit Score", "Date", ""].map(h => (
                        <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.resumes.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "11px 12px", fontSize: 13, color: "var(--text)" }}>{r.role || "—"}</td>
                        <td style={{ padding: "11px 12px", fontSize: 13, color: "var(--dim)" }}>{r.company || "—"}</td>
                        <td style={{ padding: "11px 12px" }}>
                          {r.score !== null
                            ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500, color: scoreColor(r.score), background: scoreBg(r.score) }}>{r.score}</span>
                            : <span style={{ color: "var(--dim)", fontSize: 12 }}>—</span>
                          }
                        </td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: "var(--dim)" }}>{fmt(r.created_at)}</td>
                        <td style={{ padding: "11px 12px", textAlign: "right" }}>
                          {r.pdf_url
                            ? <a
                                href={r.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                style={{
                                  fontSize: 11, fontWeight: 600, color: "var(--text)",
                                  textDecoration: "none", padding: "4px 10px",
                                  border: "1px solid var(--border)", borderRadius: 6,
                                  background: "var(--surface2)",
                                  letterSpacing: "0.02em",
                                  whiteSpace: "nowrap",
                                }}
                              >Download PDF</a>
                            : <span style={{ fontSize: 11, color: "var(--dim)" }}>No PDF</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ── Cohort Overview ───────────────────────────────────────────────────────────

function CohortOverview({
  data, advisorEmail, onRefresh, onSelectStudent,
}: {
  data: CohortStats;
  advisorEmail: string;
  onRefresh: () => void;
  onSelectStudent: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { score_tiers: tiers } = data;
  const tierTotal = tiers.low + tiers.mid + tiers.good + tiers.strong;
  const filtered = data.student_roster.filter(s =>
    !search || (s.user_email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "40px 32px 100px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>Career Center · Advisor View</div>
          <h1 style={{ fontSize: 22, fontWeight: 400, letterSpacing: -0.5, margin: 0, color: "var(--text)" }}>Cohort Overview</h1>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>Updated {fmt(data.generated_at)}</div>
        </div>
        <button onClick={onRefresh} style={{ padding: "7px 16px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--dim)", cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        <KpiCard value={data.student_count} label="Students" note="Unique accounts" />
        <KpiCard value={data.analysis_count} label="Analyses completed" />
        <KpiCard value={data.avg_overall !== null ? Math.round(data.avg_overall) : "—"} label="Average score" note="Out of 100" />
        <KpiCard
          value={`${tierTotal > 0 ? Math.round((tiers.good + tiers.strong) / tierTotal * 100) : 0}%`}
          label="Scoring 70 or above"
        />
      </div>

      {/* Distribution + Attention areas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
          <SectionLabel>Score distribution</SectionLabel>
          <TierRow label="Strong  85–100" count={tiers.strong} total={tierTotal} color="#16a34a" />
          <TierRow label="Good  70–84"    count={tiers.good}   total={tierTotal} color="#2563eb" />
          <TierRow label="Mid  50–69"     count={tiers.mid}    total={tierTotal} color="#92400e" />
          <TierRow label="Needs work <50" count={tiers.low}    total={tierTotal} color="#991b1b" />
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
          <SectionLabel>Areas needing attention</SectionLabel>
          {data.weakest_dims.map(d => (
            <div key={d.dimension} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--dim)" }}>{DIM_LABELS[d.dimension] ?? d.dimension}</span>
              <span style={{ fontWeight: 500, color: scoreColor(d.avg) }}>{Math.round(d.avg)}</span>
            </div>
          ))}
          {data.top_issues.slice(0, 4).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--dim)" }}>{item.issue}</span>
              <span style={{ fontSize: 11, color: "var(--dim)" }}>{item.count} students</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <SectionLabel>Dimension averages — all students</SectionLabel>
        {Object.entries(DIM_LABELS).map(([k, label]) => (
          <DimRow key={k} label={label} value={data.dimension_avgs[k as keyof DimAvgs]} />
        ))}
      </div>

      {/* Roster */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <SectionLabel>Student roster</SectionLabel>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email"
            style={{ padding: "6px 12px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", outline: "none", width: 220 }}
          />
        </div>

        {filtered.length === 0
          ? <p style={{ fontSize: 13, color: "var(--dim)", padding: "16px 0" }}>No students found.</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Student", "Latest Score", "Analyses", "Last Active"].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.user_id}
                    onClick={() => onSelectStudent(s.user_id)}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2, rgba(255,255,255,0.03))")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 12px", fontSize: 13, color: "var(--text)" }}>
                      {s.user_email
                        ? <span style={{ textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>{s.user_email}</span>
                        : <span style={{ color: "var(--dim)", fontStyle: "italic" }}>anonymous</span>}
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      {s.latest_score !== null
                        ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500, color: scoreColor(s.latest_score), background: scoreBg(s.latest_score) }}>{s.latest_score}</span>
                        : <span style={{ color: "var(--dim)", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--dim)" }}>{s.analysis_count}</td>
                    <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--dim)" }}>{fmt(s.latest_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
        Click any student to view their full profile and score history.
        Tailor/Builder job-fit scores are shown separately on each student&apos;s page.
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AdvisorDashboard() {
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [data,       setData]       = useState<CohortStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data: d }) => setUserEmail(d.user?.email ?? null));
  }, []);

  const load = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/cohort-stats"), { headers: { "X-User-Email": email } });
      if (resp.status === 403) { setError("not_authorized"); return; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData(await resp.json() as CohortStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userEmail) void load(userEmail);
    else if (userEmail === null) setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, color: "var(--dim)", fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: "1.5px solid var(--border)", borderTopColor: "var(--dim)", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
      Loading
    </div>
  );

  if (error === "not_authorized") return (
    <div style={{ maxWidth: 480, margin: "96px auto", padding: "0 28px" }}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 6 }}>Access restricted</div>
      <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: -0.5, marginBottom: 12 }}>This view is for career advisors only.</h2>
      <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7 }}>
        Your account <span style={{ color: "var(--text)" }}>{userEmail}</span> does not have advisor access.
      </p>
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 480, margin: "96px auto", padding: "0 28px" }}>
      <p style={{ fontSize: 13, color: "var(--dim)" }}>{error}</p>
      <button onClick={() => userEmail && void load(userEmail)} style={{ marginTop: 12, padding: "7px 16px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--text)", cursor: "pointer" }}>
        Try again
      </button>
    </div>
  );

  if (!data) return null;

  if (selectedId) {
    return (
      <StudentDetailPanel
        studentId={selectedId}
        advisorEmail={userEmail ?? ""}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <CohortOverview
      data={data}
      advisorEmail={userEmail ?? ""}
      onRefresh={() => userEmail && void load(userEmail)}
      onSelectStudent={setSelectedId}
    />
  );
}
