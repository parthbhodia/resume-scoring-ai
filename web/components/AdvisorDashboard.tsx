"use client";

import { useState, useEffect, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";
import { apiUrl } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (s >= 75) return "var(--green)";
  if (s >= 55) return "var(--amber)";
  return "var(--red)";
}

function scoreBg(s: number | null): string {
  if (s === null) return "transparent";
  if (s >= 75) return "var(--green-bg)";
  if (s >= 55) return "var(--amber-bg)";
  return "var(--red-bg)";
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

async function advisorAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await getSupabaseClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  );
}

function DimRow({ label, value }: { label: string; value: number | null }) {
  const color = scoreColor(value);
  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <div className="w-36 shrink-0 text-xs text-muted-foreground">{label}</div>
      <Progress
        value={value ?? 0}
        className="flex-1 gap-0"
        style={{ "--primary": color } as CSSProperties}
      />
      <div className="w-8 shrink-0 text-right text-xs font-semibold" style={{ color }}>
        {value !== null ? Math.round(value) : "—"}
      </div>
    </div>
  );
}

function TierRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <div className="w-24 shrink-0 text-xs text-muted-foreground">{label}</div>
      <Progress value={pct} className="flex-1 gap-0" style={{ "--primary": color } as CSSProperties} />
      <div className="w-7 shrink-0 text-right text-xs text-foreground">{count}</div>
      <div className="w-9 shrink-0 text-right text-[11px] text-muted-foreground">{Math.round(pct)}%</div>
    </div>
  );
}

function KpiCard({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return (
    <Card size="sm" className="bg-card/95">
      <CardContent>
        <div className="text-3xl font-light leading-none tracking-[-0.04em] text-foreground">{value}</div>
        <div className="mt-2 text-xs font-medium text-foreground">{label}</div>
        {note && <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}

function AdvisorCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <SectionLabel>{title}</SectionLabel>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">—</Badge>;
  return (
    <Badge variant={score >= 75 ? "secondary" : score >= 55 ? "outline" : "destructive"} style={{ color: scoreColor(score), background: scoreBg(score) }}>
      {score}
    </Badge>
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
  studentId, onBack,
}: { studentId: string; onBack: () => void }) {
  const [detail, setDetail]   = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    advisorAuthHeaders()
      .then(headers => fetch(`${apiUrl("/api/student-detail")}?student_id=${encodeURIComponent(studentId)}`, { headers }))
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? `HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setDetail(d as StudentDetail); })
      .catch(e => { if (!cancelled) setError(typeof e === "string" ? e : "Failed to load."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  return (
    <div className="mx-auto max-w-[1060px] px-8 py-10 pb-24">

      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mb-7 px-0 text-muted-foreground hover:text-foreground"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to cohort
      </Button>

      {loading && (
        <div className="grid gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: "var(--red, #991b1b)" }}>{error}</p>}

      {detail && (() => {
        const d = detail;
        const delta = d.score_delta;
        return (
          <>
            {/* Header */}
            <div className="mb-8">
              <Badge variant="outline" className="mb-3">Student profile</Badge>
              <h2 className="m-0 text-xl font-medium tracking-[-0.03em] text-foreground">
                {d.user_email ?? "Anonymous student"}
              </h2>
            </div>

            {/* KPIs */}
            <div className="mb-7 grid grid-cols-1 gap-3 md:grid-cols-4">
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
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

              <AdvisorCard title="Score history">
                <ScoreSparkline history={d.score_history} />
              </AdvisorCard>

              <AdvisorCard title="Average by dimension">
                {Object.entries(DIM_LABELS).map(([k, label]) => (
                  <DimRow key={k} label={label} value={d.dim_avgs[k as keyof DimAvgs]} />
                ))}
              </AdvisorCard>
            </div>

            {/* Issues + Strengths */}
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

              <AdvisorCard title="Recurring issues">
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
              </AdvisorCard>

              <AdvisorCard title="Latest strengths">
                {d.latest_strengths.length === 0
                  ? <p style={{ fontSize: 13, color: "var(--dim)" }}>No strengths recorded yet.</p>
                  : d.latest_strengths.map((s, i) => (
                      <div key={i} className="border-b border-border py-2 text-sm leading-relaxed text-muted-foreground last:border-b-0">
                        {s}
                      </div>
                    ))
                }
              </AdvisorCard>
            </div>

            {/* Uploaded resume text */}
            {d.latest_resume_text && (
              <AdvisorCard title="Latest uploaded résumé" className="mb-4">
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
              </AdvisorCard>
            )}

            {/* Tailored resumes */}
            {d.resumes.length > 0 && (
              <AdvisorCard title="Tailored résumés" className="mb-4">
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
                            ? <ScoreBadge score={r.score} />
                            : <Badge variant="outline">—</Badge>
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
              </AdvisorCard>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ── Cohort Overview ───────────────────────────────────────────────────────────

function CohortOverview({
  data, onRefresh, onSelectStudent,
}: {
  data: CohortStats;
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
    <div className="mx-auto max-w-[1060px] px-8 py-10 pb-24">

      {/* Header */}
      <div className="mb-9 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3">Career Center · Advisor View</Badge>
          <h1 className="m-0 text-2xl font-medium tracking-[-0.04em] text-foreground">Cohort Overview</h1>
          <div className="mt-2 text-xs text-muted-foreground">Updated {fmt(data.generated_at)}</div>
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* KPIs */}
      <div className="mb-7 grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard value={data.student_count} label="Students" note="Unique accounts" />
        <KpiCard value={data.analysis_count} label="Analyses completed" />
        <KpiCard value={data.avg_overall !== null ? Math.round(data.avg_overall) : "—"} label="Average score" note="Out of 100" />
        <KpiCard
          value={`${tierTotal > 0 ? Math.round((tiers.good + tiers.strong) / tierTotal * 100) : 0}%`}
          label="Scoring 70 or above"
        />
      </div>

      {/* Distribution + Attention areas */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdvisorCard title="Score distribution">
          <TierRow label="Strong 85-100" count={tiers.strong} total={tierTotal} color="var(--green)" />
          <TierRow label="Good 70-84"    count={tiers.good}   total={tierTotal} color="var(--accent)" />
          <TierRow label="Mid 50-69"     count={tiers.mid}    total={tierTotal} color="var(--amber)" />
          <TierRow label="Needs work <50" count={tiers.low}   total={tierTotal} color="var(--red)" />
        </AdvisorCard>

        <AdvisorCard title="Areas needing attention">
          {data.weakest_dims.map(d => (
            <div key={d.dimension} className="flex justify-between border-b border-border py-2 text-sm">
              <span style={{ color: "var(--dim)" }}>{DIM_LABELS[d.dimension] ?? d.dimension}</span>
              <span style={{ fontWeight: 500, color: scoreColor(d.avg) }}>{Math.round(d.avg)}</span>
            </div>
          ))}
          {data.top_issues.slice(0, 4).map((item, i) => (
            <div key={i} className="flex justify-between border-b border-border py-2 text-sm last:border-b-0">
              <span style={{ color: "var(--dim)" }}>{item.issue}</span>
              <Badge variant="outline">{item.count} students</Badge>
            </div>
          ))}
        </AdvisorCard>
      </div>

      {/* Dimensions */}
      <AdvisorCard title="Dimension averages — all students" className="mb-4">
        {Object.entries(DIM_LABELS).map(([k, label]) => (
          <DimRow key={k} label={label} value={data.dimension_avgs[k as keyof DimAvgs]} />
        ))}
      </AdvisorCard>

      {/* Roster */}
      <Card>
        <CardHeader>
          <SectionLabel>Student roster</SectionLabel>
          <CardDescription>Click a student to inspect their analysis history and saved tailored resumes.</CardDescription>
        </CardHeader>
        <CardContent>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
                        ? <ScoreBadge score={s.latest_score} />
                        : <Badge variant="outline">—</Badge>}
                    </td>
                    <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--dim)" }}>{s.analysis_count}</td>
                    <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--dim)" }}>{fmt(s.latest_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
        </CardContent>
      </Card>

      <div className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        Click any student to view their full profile and score history.
        Tailor/Builder job-fit scores are shown separately on each student&apos;s page.
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AdvisorDashboard() {
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data,       setData]       = useState<CohortStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data: d }) => {
      if (cancelled) return;
      setUserEmail(d.user?.email ?? null);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
      setAuthChecked(true);
      setData(null);
      setSelectedId(null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/cohort-stats"), { headers: await advisorAuthHeaders() });
      if (resp.status === 401) { setError("not_signed_in"); return; }
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
    if (!authChecked) return;
    if (userEmail) {
      void load();
    } else {
      setLoading(false);
      setData(null);
    }
  }, [authChecked, userEmail, load]);

  const signInWithGoogle = async () => {
    setOauthBusy(true);
    setError(null);
    try {
      const redirectTo = typeof window !== "undefined" ? window.location.href : undefined;
      const { error: signInError } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (signInError) setError(signInError.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Google sign-in.");
    } finally {
      setOauthBusy(false);
    }
  };

  if (loading) return (
    <div className="mx-auto grid min-h-[60vh] max-w-[760px] content-center gap-4 px-8">
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );

  if (error === "not_signed_in" || (authChecked && !userEmail)) return (
    <Card className="mx-auto mt-24 max-w-[480px]">
      <CardHeader>
        <Badge variant="outline" className="w-fit">Google sign-in required</Badge>
        <CardTitle>Sign in to open the advisor dashboard.</CardTitle>
        <CardDescription>
          UMBC advisors use their Google account so access can be checked against the institution roster.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent>
        <Button onClick={() => void signInWithGoogle()} disabled={oauthBusy}>
          {oauthBusy ? "Redirecting..." : "Sign in with Google"}
        </Button>
      </CardContent>
    </Card>
  );

  if (error === "not_authorized") return (
    <Card className="mx-auto mt-24 max-w-[520px]">
      <CardHeader>
        <Badge variant="outline" className="w-fit">Advisor access not enabled</Badge>
        <CardTitle>This account is not on the advisor roster.</CardTitle>
        <CardDescription>
          You are signed in as <span className="text-foreground">{userEmail}</span>. Advisor dashboards are only shown
          to approved institution accounts. Sign in with an approved UMBC advisor email, or ask an administrator to add
          this email to the advisor access list.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void getSupabaseClient().auth.signOut()}>
          Sign out
        </Button>
        <Button variant="ghost" onClick={() => userEmail && void load()}>
          Check again
        </Button>
      </CardContent>
    </Card>
  );

  if (error) return (
    <Card className="mx-auto mt-24 max-w-[480px]">
      <CardHeader>
        <Badge variant="destructive" className="w-fit">Could not load dashboard</Badge>
        <CardDescription>{error}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => userEmail && void load()}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );

  if (!data) return null;

  if (selectedId) {
    return (
      <StudentDetailPanel
        studentId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <CohortOverview
      data={data}
      onRefresh={() => userEmail && void load()}
      onSelectStudent={setSelectedId}
    />
  );
}
