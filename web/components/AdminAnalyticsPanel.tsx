"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/utils";
import type { AdminAnalyticsResponse, AdminAnalyticsToolRow, AdminAnalyticsUserRow } from "@/lib/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtInt(n: number) { return new Intl.NumberFormat().format(n || 0); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}
function fmtDate(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

// ─── analyst insights ────────────────────────────────────────────────────────

interface Insight { level: "info" | "warn" | "ok"; title: string; body: string; }

function computeInsights(data: AdminAnalyticsResponse): Insight[] {
  const insights: Insight[] = [];
  const { summary, users, tools, daily, activity } = data;

  if (summary.total_runs === 0 && activity.total_analyses > 0) {
    insights.push({ level: "warn", title: "Token logging not yet active",
      body: `${fmtInt(activity.total_analyses)} analysis runs exist but no token events recorded yet. Token tracking populates once the updated backend is live and users run analyses.` });
    return insights;
  }
  if (summary.total_runs === 0) {
    insights.push({ level: "info", title: "No events in this window",
      body: "No usage events in the selected time window. Try extending the window." });
    return insights;
  }

  const sorted = [...users].sort((a, b) => b.tokens - a.tokens);
  if (sorted.length >= 3) {
    const top3Pct = Math.round((100 * sorted.slice(0, 3).reduce((s, u) => s + u.tokens, 0)) / (summary.total_tokens || 1));
    const top1Pct = Math.round((100 * sorted[0].tokens) / (summary.total_tokens || 1));
    if (top3Pct >= 80) {
      insights.push({ level: "warn", title: `Top 3 users = ${top3Pct}% of all tokens`,
        body: `Heavy concentration: ${sorted[0].user_email || sorted[0].user_id} alone is ${top1Pct}%. If these are test accounts, filter before estimating real user costs.` });
    } else if (top3Pct >= 60) {
      insights.push({ level: "info", title: `Top 3 users = ${top3Pct}% of tokens`,
        body: `Moderate concentration — typical for an early-stage product. Watch for free-tier abuse if any are unauthenticated.` });
    } else {
      insights.push({ level: "ok", title: "Well-distributed token usage",
        body: `Top 3 users account for ${top3Pct}% — usage is spread across your base.` });
    }
  }

  if (summary.failure_rate_pct > 5) {
    insights.push({ level: "warn", title: `${summary.failure_rate_pct}% failure rate`,
      body: `${fmtInt(summary.failed_runs)} of ${fmtInt(summary.total_runs)} LLM calls failed. Check provider rate limits, API key quotas, or timeouts.` });
  } else if (summary.failure_rate_pct > 0) {
    insights.push({ level: "ok", title: `${summary.failure_rate_pct}% failure rate (healthy)`,
      body: "Low error rate. The Grok → Gemini fallback chain is working as intended." });
  }

  if (tools.length > 1) {
    const byEff = [...tools].filter(t => t.runs > 0).sort((a, b) => b.tokens_per_run - a.tokens_per_run);
    const most = byEff[0], least = byEff[byEff.length - 1];
    if (most && least && most.tokens_per_run > least.tokens_per_run * 3) {
      insights.push({ level: "info",
        title: `"${most.tool_name}" costs ${Math.round(most.tokens_per_run / (least.tokens_per_run || 1))}× more per call than "${least.tool_name}"`,
        body: `${fmtK(most.tokens_per_run)} tokens/run vs ${fmtK(least.tokens_per_run)} tokens/run. Consider prompt compression or a cheaper model tier.` });
    }
  }

  if (summary.total_prompt_tokens > 0 && summary.total_completion_tokens > 0) {
    const ratio = summary.total_completion_tokens / summary.total_prompt_tokens;
    if (ratio > 1.5) {
      insights.push({ level: "info", title: `Output/input ratio: ${ratio.toFixed(2)}× (verbose completions)`,
        body: "Completions are notably longer than prompts — normal for structured JSON extraction but watch for model padding." });
    }
  }

  if (daily.length >= 6) {
    const half = Math.floor(daily.length / 2);
    const first = daily.slice(0, half).reduce((s, d) => s + d.runs, 0);
    const last = daily.slice(-half).reduce((s, d) => s + d.runs, 0);
    if (first > 0) {
      const pct = Math.round((100 * (last - first)) / first);
      if (pct > 20) insights.push({ level: "ok", title: `+${pct}% run growth over the window`,
        body: "Usage is accelerating — LLM costs will scale proportionally. Good time to model break-even pricing." });
      else if (pct < -20) insights.push({ level: "warn", title: `${pct}% run decline over the window`,
        body: "Usage fell in the second half. Could be weekend effect, a bug that blocked users, or genuine churn." });
    }
  }

  if (activity.total_analyses > summary.total_runs && summary.total_runs > 0) {
    insights.push({ level: "info",
      title: `${fmtInt(activity.total_analyses - summary.total_runs)} analysis runs lack token attribution`,
      body: "These ran before token logging was enabled. Usage totals are understated; gap shrinks as the window rolls forward." });
  }

  return insights;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KPICard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", background: "#fff", minWidth: 0 }}>
      <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const colors = { warn: { bg: "#fffbeb", border: "#fde68a", dot: "#d97706" }, ok: { bg: "#f0fdf4", border: "#bbf7d0", dot: "#16a34a" }, info: { bg: "#eff6ff", border: "#bfdbfe", dot: "#2563eb" } };
  const c = colors[insight.level];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 13px", display: "flex", gap: 9 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0, marginTop: 4 }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{insight.title}</div>
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{insight.body}</div>
      </div>
    </div>
  );
}

function MiniBar({ value, max, color = "#6366f1" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((100 * value) / max)) : 0;
  return (
    <div style={{ height: 5, borderRadius: 3, background: "#f1f5f9", overflow: "hidden", marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}

function DailySparkline({ daily }: { daily: Array<{ date: string; tokens: number; runs: number }> }) {
  if (!daily.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No daily data yet.</p>;
  const maxTok = Math.max(...daily.map(d => d.tokens), 1);
  const last14 = daily.slice(-14);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
      {last14.map(d => {
        const h = Math.max(3, Math.round((48 * d.tokens) / maxTok));
        return <div key={d.date} title={`${fmtDate(d.date)}: ${fmtK(d.tokens)} tok, ${d.runs} runs`}
          style={{ flex: 1, height: h, background: "#6366f1", borderRadius: "2px 2px 0 0", opacity: 0.8 }} />;
      })}
    </div>
  );
}

function UsersTable({ users }: { users: AdminAnalyticsUserRow[] }) {
  const [sortBy, setSortBy] = useState<"tokens" | "runs">("tokens");
  const sorted = useMemo(() => [...users].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 20), [users, sortBy]);
  const maxTok = Math.max(...sorted.map(u => u.tokens), 1);
  const maxRuns = Math.max(...sorted.map(u => u.runs), 1);
  const totalTok = users.reduce((s, u) => s + u.tokens, 0);
  if (!sorted.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No token events yet — activity table below shows analysis run counts.</p>;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["tokens", "runs"] as const).map(k => (
          <button key={k} onClick={() => setSortBy(k)}
            style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: sortBy === k ? "#6366f1" : "#fff", color: sortBy === k ? "#fff" : "#374151", cursor: "pointer" }}>
            {k}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              {["User", "Tokens", "% share", "Runs", "Top tools"].map(h => <th key={h} style={{ padding: "7px 6px", color: "#6b7280", fontWeight: 500 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((u, i) => (
              <tr key={u.user_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "7px 6px" }}>
                  <div style={{ fontWeight: i < 3 ? 600 : 400 }}>{u.user_email || u.user_id}</div>
                  {u.user_email && <div style={{ color: "#9ca3af", fontSize: 11 }}>{u.user_id.slice(0, 8)}…</div>}
                </td>
                <td style={{ padding: "7px 6px" }}><div>{fmtK(u.tokens)}</div><MiniBar value={u.tokens} max={maxTok} /></td>
                <td style={{ padding: "7px 6px", color: "#6b7280" }}>{totalTok > 0 ? `${Math.round((100 * u.tokens) / totalTok)}%` : "—"}</td>
                <td style={{ padding: "7px 6px" }}><div>{fmtInt(u.runs)}</div><MiniBar value={u.runs} max={maxRuns} color="#10b981" /></td>
                <td style={{ padding: "7px 6px", color: "#6b7280", fontSize: 12 }}>{Object.entries(u.tools).slice(0, 3).map(([t, n]) => `${t}×${n}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToolsTable({ tools }: { tools: AdminAnalyticsToolRow[] }) {
  const maxTok = Math.max(...tools.map(t => t.tokens), 1);
  if (!tools.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No tool data yet.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
          {["Endpoint", "Runs", "Total tokens", "Tokens / run", "Prompt / completion"].map(h =>
            <th key={h} style={{ padding: "7px 6px", color: "#6b7280", fontWeight: 500 }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {tools.map(t => (
          <tr key={t.tool_name} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={{ padding: "7px 6px", fontWeight: 500 }}>{t.tool_name}</td>
            <td style={{ padding: "7px 6px" }}>{fmtInt(t.runs)}</td>
            <td style={{ padding: "7px 6px" }}><div>{fmtK(t.tokens)}</div><MiniBar value={t.tokens} max={maxTok} /></td>
            <td style={{ padding: "7px 6px", color: t.tokens_per_run > 50000 ? "#dc2626" : t.tokens_per_run > 20000 ? "#d97706" : "#374151" }}>{fmtK(t.tokens_per_run)}</td>
            <td style={{ padding: "7px 6px", color: "#6b7280", fontSize: 12 }}>{fmtK(t.prompt_tokens || 0)} / {fmtK(t.completion_tokens || 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActivityTable({ byUser }: { byUser: Array<{ user_id: string; user_email: string | null; analyses: number }> }) {
  const max = Math.max(...byUser.map(u => u.analyses), 1);
  if (!byUser.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No analysis activity yet.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
          <th style={{ padding: "7px 6px", color: "#6b7280", fontWeight: 500 }}>User</th>
          <th style={{ padding: "7px 6px", color: "#6b7280", fontWeight: 500 }}>Analyses run</th>
        </tr>
      </thead>
      <tbody>
        {byUser.slice(0, 20).map((u, i) => (
          <tr key={u.user_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={{ padding: "7px 6px", fontWeight: i < 3 ? 600 : 400 }}>{u.user_email || u.user_id}</td>
            <td style={{ padding: "7px 6px" }}><div>{fmtInt(u.analyses)}</div><MiniBar value={u.analyses} max={max} color="#10b981" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── panel (exported) ────────────────────────────────────────────────────────

interface Props {
  /** Pass the caller's auth-header factory so the panel reuses existing session auth. */
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

export default function AdminAnalyticsPanel({ getAuthHeaders }: Props) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const headers = getAuthHeaders ? await getAuthHeaders() : {};
        const resp = await fetch(apiUrl(`/api/admin/analytics?days=${days}`), { headers });
        const json = await resp.json() as AdminAnalyticsResponse & { error?: string };
        if (!alive) return;
        if (json.error) { setError(json.error); setData(null); }
        else setData(json as AdminAnalyticsResponse);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [days, getAuthHeaders]);

  const insights = useMemo(() => (data ? computeInsights(data) : []), [data]);

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* toolbar */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ color: "#6b7280" }}>Window</span>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 8px", fontSize: 13 }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {loading && <p style={{ color: "#6b7280", fontSize: 14 }}>Loading analytics…</p>}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "11px 14px", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* KPI strip */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 22 }}>
            <KPICard title="LLM Runs" value={fmtInt(data.summary.total_runs)} sub="with token data" />
            <KPICard title="Total Tokens" value={fmtK(data.summary.total_tokens)}
              sub={`${fmtK(data.summary.total_prompt_tokens ?? 0)} in / ${fmtK(data.summary.total_completion_tokens ?? 0)} out`} />
            <KPICard title="Analyses" value={fmtInt(data.activity?.total_analyses ?? 0)} sub="from resume_analyses" />
            <KPICard title="Active Users" value={fmtInt(data.activity?.unique_users ?? data.summary.unique_users)} />
            <KPICard title="Failure Rate" value={`${data.summary.failure_rate_pct ?? 0}%`} sub={`${fmtInt(data.summary.failed_runs)} failed`} />
            <KPICard title="Models" value={fmtInt(data.summary.unique_models)} />
          </section>

          {/* Analyst notes */}
          {insights.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                🔎 Analyst notes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
              </div>
            </section>
          )}

          {/* Daily + Models row */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 22 }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Daily token trend (last 14 days)</div>
              <DailySparkline daily={data.daily} />
              {data.daily.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "#9ca3af" }}>
                  <span>{fmtDate(data.daily[Math.max(0, data.daily.length - 14)]?.date ?? "")}</span>
                  <span>{fmtDate(data.daily[data.daily.length - 1]?.date ?? "")}</span>
                </div>
              )}
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Models</div>
              {data.models.length === 0
                ? <p style={{ color: "#9ca3af", fontSize: 13 }}>No model data yet.</p>
                : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {data.models.map(m => (
                      <div key={m.model} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ fontWeight: 500, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.model}</span>
                        <span style={{ color: "#6b7280" }}>{fmtK(m.tokens)} tok · {fmtInt(m.runs)} runs</span>
                      </div>
                    ))}
                  </div>}
            </div>
          </section>

          {/* Endpoint cost */}
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff", marginBottom: 22 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Endpoint cost breakdown</div>
            <ToolsTable tools={data.tools} />
          </section>

          {/* Token per user */}
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff", marginBottom: 22 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Token usage per user</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>Only users with token-instrumented calls. See activity table below for full run counts.</div>
            <UsersTable users={data.users} />
          </section>

          {/* Analysis activity */}
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Analysis activity by user</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>From <code>resume_analyses</code> — populated from day one, no token data needed.</div>
            <ActivityTable byUser={data.activity?.by_user ?? []} />
          </section>
        </>
      )}
    </div>
  );
}
