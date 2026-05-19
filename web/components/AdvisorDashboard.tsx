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
  if (s >= 75) return "rgba(22,163,74,0.08)";
  if (s >= 55) return "rgba(146,64,14,0.08)";
  return "rgba(153,27,27,0.08)";
}

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return (
    <div style={{
      padding: "28px 24px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 32, fontWeight: 300, letterSpacing: -1.5, color: "var(--text)", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", marginTop: 10, letterSpacing: 0.2 }}>
        {label}
      </div>
      {note && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>{note}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "var(--dim)",
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function DimRow({ label, value }: { label: string; value: number | null }) {
  const pct   = value ?? 0;
  const color = scoreColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 152, fontSize: 12, color: "var(--dim)", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
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
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
      <div style={{ width: 28, textAlign: "right", fontSize: 12, color: "var(--text)", flexShrink: 0 }}>{count}</div>
      <div style={{ width: 34, textAlign: "right", fontSize: 11, color: "var(--dim)", flexShrink: 0 }}>{Math.round(pct)}%</div>
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

  // ── Loading ──
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, color: "var(--dim)", fontSize: 13 }}>
      <div style={{ width: 16, height: 16, border: "1.5px solid var(--border)", borderTopColor: "var(--dim)", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
      Loading
    </div>
  );

  // ── Not authorized ──
  if (error === "not_authorized") return (
    <div style={{ maxWidth: 480, margin: "96px auto", padding: "0 28px" }}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 6 }}>Access restricted</div>
      <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: -0.5, marginBottom: 12 }}>
        This view is for career advisors only.
      </h2>
      <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7 }}>
        Your account <span style={{ color: "var(--text)" }}>{userEmail}</span> does not have advisor access.
        Contact your administrator to be added.
      </p>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div style={{ maxWidth: 480, margin: "96px auto", padding: "0 28px" }}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>Something went wrong</div>
      <p style={{ fontSize: 13, color: "var(--dim)" }}>{error}</p>
      <button onClick={() => userEmail && void load(userEmail)} style={{ marginTop: 16, padding: "8px 18px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--text)", cursor: "pointer" }}>
        Try again
      </button>
    </div>
  );

  if (!data) return null;

  const { score_tiers: tiers } = data;
  const tierTotal = tiers.low + tiers.mid + tiers.good + tiers.strong;
  const filteredRoster = data.student_roster.filter(s =>
    !search || (s.user_email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "40px 32px 100px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
            Career Center · Advisor View
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 400, letterSpacing: -0.5, margin: 0, color: "var(--text)" }}>
            Cohort Overview
          </h1>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>
            Updated {fmt(data.generated_at)}
          </div>
        </div>
        <button
          onClick={() => userEmail && void load(userEmail)}
          style={{ padding: "7px 16px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--dim)", cursor: "pointer", letterSpacing: 0.2 }}
        >
          Refresh
        </button>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        <KpiCard value={data.student_count} label="Students" note="Unique accounts" />
        <KpiCard value={data.analysis_count} label="Analyses completed" />
        <KpiCard
          value={data.avg_overall !== null ? Math.round(data.avg_overall) : "—"}
          label="Average score"
          note="Out of 100"
        />
        <KpiCard
          value={`${tierTotal > 0 ? Math.round((tiers.good + tiers.strong) / tierTotal * 100) : 0}%`}
          label="Scoring 70 or above"
        />
      </div>

      {/* ── Score distribution + Dimensions ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Distribution */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
          <SectionTitle>Score distribution</SectionTitle>
          <TierRow label="Strong  85–100" count={tiers.strong} total={tierTotal} color="#16a34a" />
          <TierRow label="Good  70–84"    count={tiers.good}   total={tierTotal} color="#2563eb" />
          <TierRow label="Mid  50–69"     count={tiers.mid}    total={tierTotal} color="#92400e" />
          <TierRow label="Needs work <50" count={tiers.low}    total={tierTotal} color="#991b1b" />
        </div>

        {/* Weakest areas */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
          <SectionTitle>Areas needing attention</SectionTitle>
          {data.weakest_dims.length === 0
            ? <p style={{ fontSize: 13, color: "var(--dim)" }}>Not enough data yet.</p>
            : data.weakest_dims.map(d => (
                <div key={d.dimension} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ color: "var(--dim)" }}>{DIM_LABELS[d.dimension] ?? d.dimension}</span>
                  <span style={{ fontWeight: 500, color: scoreColor(d.avg) }}>{Math.round(d.avg)}</span>
                </div>
              ))
          }
          {data.top_issues.slice(0, 4).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--dim)" }}>{item.issue}</span>
              <span style={{ color: "var(--dim)", fontSize: 11 }}>{item.count} students</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dimension breakdown ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <SectionTitle>Dimension averages — all students</SectionTitle>
        {Object.entries(DIM_LABELS).map(([k, label]) => (
          <DimRow key={k} label={label} value={data.dimension_avgs[k as keyof DimAvgs]} />
        ))}
      </div>

      {/* ── Student roster ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <SectionTitle>Student roster</SectionTitle>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email"
            style={{
              padding: "6px 12px", fontSize: 12, border: "1px solid var(--border)",
              borderRadius: 6, background: "var(--bg)", color: "var(--text)",
              outline: "none", width: 220,
            }}
          />
        </div>

        {filteredRoster.length === 0
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
                {filteredRoster.map(s => {
                  const sc = s.latest_score;
                  return (
                    <tr key={s.user_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 12px", fontSize: 13, color: "var(--text)" }}>
                        {s.user_email ?? <span style={{ color: "var(--dim)", fontStyle: "italic" }}>anonymous</span>}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        {sc !== null
                          ? (
                            <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500, color: scoreColor(sc), background: scoreBg(sc) }}>
                              {sc}
                            </span>
                          )
                          : <span style={{ color: "var(--dim)", fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--dim)" }}>{s.analysis_count}</td>
                      <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--dim)" }}>{fmt(s.latest_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
      </div>

      {/* ── Footer note ── */}
      <div style={{ marginTop: 24, fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
        Scores reflect the Analyze tool only. Tailor/Builder job-fit scores are tracked separately per résumé in the library.
      </div>

    </div>
  );
}
