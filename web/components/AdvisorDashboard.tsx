"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import ScoreRing from "@/components/ScoreRing";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (s === null) return "var(--dim)";
  if (s >= 75) return "var(--green)";
  if (s >= 55) return "var(--yellow, #eab308)";
  return "var(--red)";
}

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

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "22px 24px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--dim)" }}>{sub}</div>}
    </div>
  );
}

function DimBar({ label, value }: { label: string; value: number | null }) {
  const pct   = value ?? 0;
  const color = scoreColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 160, fontSize: 12, color: "var(--dim)", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
      </div>
      <div style={{ width: 36, textAlign: "right", fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>
        {value !== null ? Math.round(value) : "—"}
      </div>
    </div>
  );
}

function TierBar({ tiers }: { tiers: ScoreTiers }) {
  const total = tiers.low + tiers.mid + tiers.good + tiers.strong || 1;
  const segments = [
    { label: "Strong (85+)", count: tiers.strong, color: "var(--green)" },
    { label: "Good (70–84)", count: tiers.good,   color: "var(--accent2, #a78bfa)" },
    { label: "Mid (50–69)",  count: tiers.mid,    color: "var(--yellow, #eab308)" },
    { label: "Low (<50)",    count: tiers.low,    color: "var(--red)" },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", gap: 2, marginBottom: 14 }}>
        {segments.map(s => s.count > 0 && (
          <div key={s.label} style={{ flex: s.count / total, background: s.color, minWidth: 4 }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--dim)" }}>{s.label}</span>
            <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--text)" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AdvisorDashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [data,      setData]      = useState<CohortStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState("");

  // Resolve the logged-in user's email from Supabase
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data: d }) => {
      setUserEmail(d.user?.email ?? null);
    });
  }, []);

  const load = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/cohort-stats"), {
        headers: { "X-User-Email": email },
      });
      if (resp.status === 403) {
        setError("Your account doesn't have advisor access.");
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData(await resp.json() as CohortStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userEmail) void load(userEmail);
    else if (userEmail === null && !loading) setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12, color: "var(--dim)", fontSize: 14 }}>
      <div style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      Loading cohort data…
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 400, margin: "80px auto", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Access restricted</h2>
      <p style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.6 }}>{error}</p>
      <p style={{ color: "var(--dim)", fontSize: 12, marginTop: 12 }}>Signed in as <strong>{userEmail}</strong></p>
    </div>
  );

  if (!data) return null;

  const dims = data.dimension_avgs;
  const filteredRoster = data.student_roster.filter(s =>
    !search || (s.user_email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px 80px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent2, #a78bfa)", marginBottom: 6 }}>
            Career Center · Advisor Dashboard
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, margin: 0 }}>Cohort Analytics</h1>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
            Last updated {fmt(data.generated_at)} · {userEmail}
          </p>
        </div>
        <button
          onClick={() => userEmail && void load(userEmail)}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 600, alignSelf: "flex-start" }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard icon="🎓" value={data.student_count} label="Students" sub="Unique accounts" />
        <StatCard icon="📊" value={data.analysis_count} label="Analyses run" sub="Total across all students" />
        <StatCard
          icon="⭐"
          value={data.avg_overall !== null ? Math.round(data.avg_overall) : "—"}
          label="Avg overall score"
          sub="Cohort average / 100"
        />
        <StatCard
          icon="📈"
          value={`${Math.round((data.score_tiers.good + data.score_tiers.strong) / (data.student_count || 1) * 100)}%`}
          label="Score 70+"
          sub="Students in good/strong tier"
        />
      </div>

      {/* ── Score ring + tiers ── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, marginBottom: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, alignItems: "center" }}>
        <div style={{ textAlign: "center", paddingRight: 16, borderRight: "1px solid var(--border)" }}>
          <ScoreRing score={data.avg_overall ?? 0} size={110} label="Cohort avg" />
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>Cohort average</div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Score distribution</div>
          <TierBar tiers={data.score_tiers} />
        </div>
      </div>

      {/* ── Dimension scores + Issues ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Dimension averages
            <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 400 }}>All students · 0–100</span>
          </div>
          {Object.entries(DIM_LABELS).map(([k, label]) => (
            <DimBar key={k} label={label} value={dims[k as keyof DimAvgs]} />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {data.weakest_dims.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius)", padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--red)" }}>⚠ Weakest areas cohort-wide</div>
              {data.weakest_dims.map(d => (
                <div key={d.dimension} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(239,68,68,0.1)", fontSize: 13 }}>
                  <span style={{ color: "var(--dim)" }}>{DIM_LABELS[d.dimension] ?? d.dimension}</span>
                  <span style={{ fontWeight: 700, color: "var(--red)" }}>{Math.round(d.avg)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Most common issues</div>
            {data.top_issues.length === 0
              ? <p style={{ fontSize: 13, color: "var(--dim)" }}>No issues recorded yet.</p>
              : data.top_issues.map((item, i) => {
                  const maxCount = data.top_issues[0]?.count || 1;
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: "var(--text)" }}>{item.issue}</span>
                        <span style={{ color: "var(--dim)", flexShrink: 0, marginLeft: 8 }}>{item.count}×</span>
                      </div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${(item.count / maxCount) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      {/* ── Student roster ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Student roster
            <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 400, marginLeft: 8 }}>sorted by score · lowest first</span>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by email…"
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, width: 200, outline: "none" }}
          />
        </div>

        {filteredRoster.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--dim)", textAlign: "center", padding: "24px 0" }}>No students yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Student", "Latest Score", "Analyses", "Last Active"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--dim)", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map((s, i) => {
                  const sc    = s.latest_score;
                  const color = scoreColor(sc);
                  return (
                    <tr key={s.user_id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      <td style={{ padding: "11px 12px", color: "var(--text)" }}>
                        {s.user_email
                          ? <><span style={{ fontWeight: 600 }}>{s.user_email.split("@")[0]}</span><span style={{ color: "var(--dim)" }}>@{s.user_email.split("@")[1]}</span></>
                          : <span style={{ color: "var(--dim)", fontStyle: "italic" }}>anonymous</span>}
                      </td>
                      <td style={{ padding: "11px 12px" }}>
                        {sc !== null
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14, color }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                              {sc}
                            </span>
                          : <span style={{ color: "var(--dim)" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 12px", color: "var(--dim)" }}>{s.analysis_count}</td>
                      <td style={{ padding: "11px 12px", color: "var(--dim)" }}>{fmt(s.latest_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
