"use client";

import { useState, useEffect, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";
import { apiUrl } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  tailored_resume_count?: number;
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

function fmtRelative(d: string | null): string {
  if (!d) return "—";
  try {
    const now = Date.now();
    const then = new Date(d).getTime();
    const diffMs = Math.max(0, now - then);
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.floor(diffMs / dayMs);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return fmt(d);
  } catch {
    return d;
  }
}

type StudentStatus = "Needs Work" | "Improving" | "Ready" | "No Analysis Yet";

function studentStatus(student: Student): StudentStatus {
  if ((student.analysis_count ?? 0) <= 0 || student.latest_score === null) return "No Analysis Yet";
  if (student.latest_score < 65) return "Needs Work";
  if (student.latest_score < 80) return "Improving";
  return "Ready";
}

function studentPriority(student: Student): number {
  const status = studentStatus(student);
  if (status === "Needs Work") return 0;
  if (status === "No Analysis Yet") return 1;
  if (status === "Improving") return 2;
  return 3;
}

function reviewReason(student: Student): string {
  const status = studentStatus(student);
  if (status === "No Analysis Yet") return "No completed analysis yet";
  if (status === "Needs Work") return "Low latest score";
  if (status === "Improving") return "Moderate score, coaching can lift results";
  return "Strong profile, periodic check only";
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Job-fit Score</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.resumes.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-foreground">{r.role || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.company || "—"}</TableCell>
                        <TableCell>{r.score !== null ? <ScoreBadge score={r.score} /> : <Badge variant="outline">—</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(r.created_at)}</TableCell>
                        <TableCell className="text-right">
                          {r.pdf_url ? (
                            <a
                              href={r.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              Download PDF
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">No PDF</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
  const needAttentionCount = data.student_roster.filter(s => {
    const status = studentStatus(s);
    return status === "Needs Work" || status === "No Analysis Yet";
  }).length;
  const topImprovementAreas = data.top_issues.slice(0, 5);
  const studentsNeedingReview = [...data.student_roster]
    .sort((a, b) => {
      const p = studentPriority(a) - studentPriority(b);
      if (p !== 0) return p;
      const as = a.latest_score ?? -1;
      const bs = b.latest_score ?? -1;
      if (as !== bs) return as - bs;
      return (new Date(a.latest_at || 0).getTime()) - (new Date(b.latest_at || 0).getTime());
    })
    .filter(s => {
      const status = studentStatus(s);
      return status === "Needs Work" || status === "No Analysis Yet" || status === "Improving";
    })
    .slice(0, 6);
  const filtered = data.student_roster.filter(s =>
    !search || (s.user_email ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const isEmpty = data.student_count === 0 && data.analysis_count === 0;

  return (
    <div className="mx-auto max-w-[1060px] px-8 py-10 pb-24">
      <div className="mb-9 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3">UMBC Advisor View</Badge>
          <h1 className="m-0 text-2xl font-medium tracking-[-0.04em] text-foreground">Advisor Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Resume insights based on UMBC Career Center guidelines.
          </p>
          <div className="mt-2 text-xs text-muted-foreground">Updated {fmt(data.generated_at)}</div>
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-3 md:grid-cols-5">
        <KpiCard value={data.student_count} label="Total Students" note="Unique accounts" />
        <KpiCard value={data.analysis_count} label="Analyzed Resumes" />
        <KpiCard value={data.avg_overall !== null ? Math.round(data.avg_overall) : "—"} label="Average Resume Score" note="Out of 100" />
        <KpiCard value={needAttentionCount} label="Students Needing Attention" />
        <KpiCard value={data.tailored_resume_count ?? 0} label="Tailored Resumes Created" />
      </div>

      {isEmpty && (
        <Card className="mb-4 border-dashed">
          <CardHeader>
            <SectionLabel>No student data yet</SectionLabel>
            <CardDescription>
              Once students analyze resumes, this dashboard will show readiness, common improvement areas, review queue, and student roster actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>Check again</Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdvisorCard title="Resume readiness" description="Strong visual distribution across score tiers.">
          <TierRow label="Strong (85-100)" count={tiers.strong} total={tierTotal} color="var(--green)" />
          <TierRow label="Good (70-84)" count={tiers.good} total={tierTotal} color="var(--accent)" />
          <TierRow label="Mid (50-69)" count={tiers.mid} total={tierTotal} color="var(--amber)" />
          <TierRow label="Needs work (<50)" count={tiers.low} total={tierTotal} color="var(--red)" />
          {tierTotal === 0 ? (
            <p className="pt-3 text-sm text-muted-foreground">
              No student data yet. Invite students or wait for their first resume analysis.
            </p>
          ) : null}
        </AdvisorCard>

        <AdvisorCard title="Top improvement areas" description="Most frequent weaknesses across students.">
          {topImprovementAreas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough data yet.</p>
          ) : (
            topImprovementAreas.map((item, idx) => {
              const max = topImprovementAreas[0]?.count || 1;
              const width = Math.max(8, Math.round((item.count / max) * 100));
              return (
                <div key={idx} className="border-b border-border py-2 last:border-b-0">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-foreground">{item.issue}</span>
                    <Badge variant="outline">{item.count} students</Badge>
                  </div>
                  <div className="h-1.5 rounded bg-muted">
                    <div className="h-full rounded bg-foreground/70" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </AdvisorCard>
      </div>

      <AdvisorCard title="Students needing review" description="Prioritized queue for advisor follow-up." className="mb-4">
        {studentsNeedingReview.length === 0 ? (
          <p className="text-sm text-muted-foreground">No urgent reviews right now.</p>
        ) : (
          studentsNeedingReview.map((s) => {
            const status = studentStatus(s);
            return (
              <div
                key={s.user_id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{s.user_email ?? "Anonymous student"}</div>
                  <div className="text-xs text-muted-foreground">{reviewReason(s)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge score={s.latest_score} />
                  <Badge variant={status === "Needs Work" ? "destructive" : status === "Improving" ? "outline" : "secondary"}>
                    {status}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => onSelectStudent(s.user_id)}>
                    {status === "Needs Work" ? "Review" : "View"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </AdvisorCard>

      <AdvisorCard title="Dimension averages" description="Cohort-level category health snapshot." className="mb-4">
        {Object.entries(DIM_LABELS).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0">
            <span className="text-muted-foreground">{label}</span>
            <Badge variant="outline" style={{ color: scoreColor(data.dimension_avgs[k as keyof DimAvgs]) }}>
              {data.dimension_avgs[k as keyof DimAvgs] !== null ? Math.round(data.dimension_avgs[k as keyof DimAvgs] as number) : "—"}
            </Badge>
          </div>
        ))}
      </AdvisorCard>

      <Card>
        <CardHeader>
          <SectionLabel>Student roster</SectionLabel>
          <CardDescription>Search and open student detail quickly.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by email"
              className="w-[240px]"
            />
            <div className="text-xs text-muted-foreground">{filtered.length} students</div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No students found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Latest Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Analyses</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const status = studentStatus(s);
                  return (
                    <TableRow key={s.user_id}>
                      <TableCell className="text-sm text-foreground">
                        {s.user_email ?? <span className="italic text-muted-foreground">anonymous</span>}
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={s.latest_score} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={status === "Needs Work" ? "destructive" : status === "Improving" ? "outline" : status === "Ready" ? "secondary" : "outline"}>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtRelative(s.latest_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.analysis_count}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => onSelectStudent(s.user_id)}>
                          {status === "Needs Work" ? "Review" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        Dashboard flow: overview → trend hotspots → students needing review → student roster lookup.
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
