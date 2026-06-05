"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import type { AdminAnalyticsResponse, AdminAnalyticsToolRow, AdminAnalyticsUserRow } from "@/lib/types";

// ─── formatting helpers ───────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return new Intl.NumberFormat().format(n || 0);
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

// ─── analyst insights ─────────────────────────────────────────────────────────

interface Insight {
  level: "info" | "warn" | "ok";
  title: string;
  body: string;
}

function computeInsights(data: AdminAnalyticsResponse): Insight[] {
  const insights: Insight[] = [];
  const { summary, users, tools, daily, activity } = data;

  // Data freshness: if usage_events has no data, flag it
  if (summary.total_runs === 0 && activity.total_analyses > 0) {
    insights.push({
      level: "warn",
      title: "Token logging not yet active",
      body: `${fmtInt(activity.total_analyses)} analysis runs exist in the database but no token events have been recorded yet. Token tracking will populate once the updated backend is deployed and users run analyses.`,
    });
    return insights; // no point computing concentration on zeros
  }

  if (summary.total_runs === 0) {
    insights.push({
      level: "info",
      title: "No events in this window",
      body: "No usage events have been recorded in the selected time window. Try extending the window.",
    });
    return insights;
  }

  // Top-user concentration (Pareto signal)
  const sorted = [...users].sort((a, b) => b.tokens - a.tokens);
  if (sorted.length >= 3) {
    const top3Tokens = sorted.slice(0, 3).reduce((s, u) => s + u.tokens, 0);
    const top3Pct = Math.round((100 * top3Tokens) / (summary.total_tokens || 1));
    if (top3Pct >= 80) {
      insights.push({
        level: "warn",
        title: `Top 3 users = ${top3Pct}% of all tokens`,
        body: `Heavy concentration: ${sorted[0].user_email || sorted[0].user_id} alone accounts for ${Math.round((100 * sorted[0].tokens) / (summary.total_tokens || 1))}% of token spend. If these are test accounts, filter them before estimating real user costs.`,
      });
    } else if (top3Pct >= 60) {
      insights.push({
        level: "info",
        title: `Top 3 users = ${top3Pct}% of tokens`,
        body: `Moderate concentration. Healthy for an early-stage product — a few power users driving most spend. Watch for free-tier abuse if any of these are unauthenticated.`,
      });
    } else {
      insights.push({
        level: "ok",
        title: "Well-distributed token usage",
        body: `Top 3 users account for only ${top3Pct}% of tokens — usage is spread across your base. Good sign that the product has broad engagement.`,
      });
    }
  }

  // Failure rate
  if (summary.failure_rate_pct > 5) {
    insights.push({
      level: "warn",
      title: `${summary.failure_rate_pct}% failure rate`,
      body: `${fmtInt(summary.failed_runs)} of ${fmtInt(summary.total_runs)} LLM calls failed. Above 5% warrants investigation — check provider rate limits, API key quotas, or timeout settings.`,
    });
  } else if (summary.failure_rate_pct > 0) {
    insights.push({
      level: "ok",
      title: `${summary.failure_rate_pct}% failure rate (healthy)`,
      body: "Low error rate. The Grok → Gemini fallback chain is working as intended.",
    });
  }

  // Most expensive tool per run
  if (tools.length > 1) {
    const byEfficiency = [...tools].filter((t) => t.runs > 0).sort((a, b) => b.tokens_per_run - a.tokens_per_run);
    const most = byEfficiency[0];
    const least = byEfficiency[byEfficiency.length - 1];
    if (most && least && most.tokens_per_run > least.tokens_per_run * 3) {
      insights.push({
        level: "info",
        title: `"${most.tool_name}" costs ${Math.round(most.tokens_per_run / (least.tokens_per_run || 1))}× more per call than "${least.tool_name}"`,
        body: `${fmtK(most.tokens_per_run)} tokens/run vs ${fmtK(least.tokens_per_run)} tokens/run. Consider whether the expensive endpoint can be optimised with prompt compression or a cheaper model tier.`,
      });
    }
  }

  // Completion ratio (output bloat signal)
  if (summary.total_prompt_tokens > 0 && summary.total_completion_tokens > 0) {
    const ratio = summary.total_completion_tokens / summary.total_prompt_tokens;
    if (ratio > 1.5) {
      insights.push({
        level: "info",
        title: `Output/input ratio: ${ratio.toFixed(2)}× (verbose completions)`,
        body: "Completions are significantly longer than prompts. This is normal for structured JSON extraction but worth watching — unusually high output tokens often mean the model is repeating the input schema or padding responses.",
      });
    }
  }

  // Growth signal (compare last quarter vs first quarter of window)
  if (daily.length >= 6) {
    const half = Math.floor(daily.length / 2);
    const first = daily.slice(0, half).reduce((s, d) => s + d.runs, 0);
    const last = daily.slice(-half).reduce((s, d) => s + d.runs, 0);
    if (first > 0) {
      const growthPct = Math.round((100 * (last - first)) / first);
      if (growthPct > 20) {
        insights.push({
          level: "ok",
          title: `+${growthPct}% run growth over the window`,
          body: "Usage is accelerating. If this is new user growth (not a single heavy user ramping up), your LLM costs will scale proportionally — good time to model break-even pricing.",
        });
      } else if (growthPct < -20) {
        insights.push({
          level: "warn",
          title: `${growthPct}% run decline over the window`,
          body: "Usage fell in the second half of the window. Could be a weekend effect, a bug that blocked users, or genuine churn. Cross-reference with signups.",
        });
      }
    }
  }

  // Activity vs token gap: analyses without token attribution
  if (activity.total_analyses > summary.total_runs && summary.total_runs > 0) {
    const gap = activity.total_analyses - summary.total_runs;
    insights.push({
      level: "info",
      title: `${fmtInt(gap)} analysis runs have no token attribution`,
      body: "These ran before token logging was enabled. Usage totals are understated. The gap will shrink as the window rolls forward.",
    });
  }

  return insights;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KPICard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", background: "#fff", minWidth: 0 }}>
      <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const colors: Record<string, { bg: string; border: string; dot: string }> = {
    warn: { bg: "#fffbeb", border: "#fde68a", dot: "#d97706" },
    ok: { bg: "#f0fdf4", border: "#bbf7d0", dot: "#16a34a" },
    info: { bg: "#eff6ff", border: "#bfdbfe", dot: "#2563eb" },
  };
  const c = colors[insight.level];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "12px 14px", display: "flex", gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, flexShrink: 0, marginTop: 4 }} />
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
    <div style={{ height: 6, borderRadius: 3, background: "#f1f5f9", overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
}

function DailySparkline({ daily }: { daily: Array<{ date: string; runs: number; tokens: number }> }) {
  if (!daily.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No daily data yet.</p>;
  const maxTok = Math.max(...daily.map((d) => d.tokens), 1);
  const last14 = daily.slice(-14);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 50 }}>
      {last14.map((d) => {
        const h = Math.max(4, Math.round((50 * d.tokens) / maxTok));
        return (
          <div key={d.date} title={`${fmtDate(d.date)}: ${fmtK(d.tokens)} tokens, ${d.runs} runs`}
            style={{ flex: 1, height: h, background: "#6366f1", borderRadius: "2px 2px 0 0", opacity: 0.8, cursor: "default" }} />
        );
      })}
    </div>
  );
}

function UsersTable({ users }: { users: AdminAnalyticsUserRow[] }) {
  const [sortBy, setSortBy] = useState<"tokens" | "runs">("tokens");
  const sorted = useMemo(
    () => [...users].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 20),
    [users, sortBy]
  );
  const maxTok = Math.max(...sorted.map((u) => u.tokens), 1);
  const maxRuns = Math.max(...sorted.map((u) => u.runs), 1);
  const totalTok = users.reduce((s, u) => s + u.tokens, 0);

  if (!sorted.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No token events yet. Activity data below shows analysis run counts.</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {(["tokens", "runs"] as const).map((k) => (
          <button key={k} onClick={() => setSortBy(k)}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb",
              background: sortBy === k ? "#6366f1" : "#fff", color: sortBy === k ? "#fff" : "#374151", cursor: "pointer" }}>
            Sort: {k}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>User</th>
              <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Tokens</th>
              <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>% share</th>
              <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Runs</th>
              <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Top tools</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u, i) => (
              <tr key={u.user_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "8px 6px" }}>
                  <div style={{ fontWeight: i < 3 ? 600 : 400 }}>{u.user_email || u.user_id}</div>
                  {u.user_email && <div style={{ color: "#9ca3af", fontSize: 11 }}>{u.user_id.slice(0, 8)}…</div>}
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <div>{fmtK(u.tokens)}</div>
                  <MiniBar value={u.tokens} max={maxTok} color="#6366f1" />
                </td>
                <td style={{ padding: "8px 6px", color: "#6b7280" }}>
                  {totalTok > 0 ? `${Math.round((100 * u.tokens) / totalTok)}%` : "—"}
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <div>{fmtInt(u.runs)}</div>
                  <MiniBar value={u.runs} max={maxRuns} color="#10b981" />
                </td>
                <td style={{ padding: "8px 6px", color: "#6b7280" }}>
                  {Object.entries(u.tools).slice(0, 3).map(([t, n]) => `${t}×${n}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToolsTable({ tools }: { tools: AdminAnalyticsToolRow[] }) {
  const maxTok = Math.max(...tools.map((t) => t.tokens), 1);
  if (!tools.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No tool data yet.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Endpoint</th>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Runs</th>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Total tokens</th>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Tokens / run</th>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Prompt / completion</th>
        </tr>
      </thead>
      <tbody>
        {tools.map((t) => (
          <tr key={t.tool_name} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={{ padding: "8px 6px", fontWeight: 500 }}>{t.tool_name}</td>
            <td style={{ padding: "8px 6px" }}>{fmtInt(t.runs)}</td>
            <td style={{ padding: "8px 6px" }}>
              <div>{fmtK(t.tokens)}</div>
              <MiniBar value={t.tokens} max={maxTok} color="#6366f1" />
            </td>
            <td style={{ padding: "8px 6px", color: t.tokens_per_run > 50000 ? "#dc2626" : t.tokens_per_run > 20000 ? "#d97706" : "#374151" }}>
              {fmtK(t.tokens_per_run)}
            </td>
            <td style={{ padding: "8px 6px", color: "#6b7280", fontSize: 12 }}>
              {fmtK(t.prompt_tokens || 0)} / {fmtK(t.completion_tokens || 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActivityTable({ byUser }: { byUser: Array<{ user_id: string; user_email: string | null; analyses: number }> }) {
  const max = Math.max(...byUser.map((u) => u.analyses), 1);
  if (!byUser.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No analysis activity yet.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>User</th>
          <th style={{ padding: "8px 6px", color: "#6b7280", fontWeight: 500 }}>Analyses run</th>
        </tr>
      </thead>
      <tbody>
        {byUser.slice(0, 20).map((u, i) => (
          <tr key={u.user_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={{ padding: "8px 6px", fontWeight: i < 3 ? 600 : 400 }}>
              {u.user_email || u.user_id}
            </td>
            <td style={{ padding: "8px 6px" }}>
              <div>{fmtInt(u.analyses)}</div>
              <MiniBar value={u.analyses} max={max} color="#10b981" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  // undefined = not yet resolved; null = no session (unauthenticated); string = bearer token
  const [bearerToken, setBearerToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data: s }) =>
      setBearerToken(s.session?.access_token ?? null)
    );
  }, []);

  useEffect(() => {
    if (bearerToken === undefined) return; // still resolving session
    let alive = true;
    setLoading(true);
    setError(null);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    fetch(apiUrl(`/api/admin/analytics?days=${days}`), { headers })
      .then((resp) => parseJsonOrThrow<AdminAnalyticsResponse & { error?: string }>(resp))
      .then((json) => {
        if (!alive) return;
        if ((json as { error?: string }).error) {
          setError((json as { error?: string }).error ?? "Failed to load analytics.");
          setData(null);
          return;
        }
        setData(json as AdminAnalyticsResponse);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bearerToken, days]);

  const insights = useMemo(() => (data ? computeInsights(data) : []), [data]);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 16px 60px", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Admin Analytics</h1>
          <p style={{ margin: "5px 0 0", color: "#6b7280", fontSize: 14 }}>
            Token consumption, tool usage, and analyst commentary.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#6b7280" }}>Window</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 14 }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {loading && <p style={{ color: "#6b7280" }}>Loading analytics…</p>}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#b91c1c", fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* KPI strip */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
            <KPICard title="LLM Runs" value={fmtInt(data.summary.total_runs)} sub="with token data" />
            <KPICard title="Total Tokens" value={fmtK(data.summary.total_tokens)}
              sub={`${fmtK(data.summary.total_prompt_tokens ?? 0)} in / ${fmtK(data.summary.total_completion_tokens ?? 0)} out`} />
            <KPICard title="Analyses run" value={fmtInt(data.activity?.total_analyses ?? 0)} sub="from resume_analyses" />
            <KPICard title="Active Users" value={fmtInt(data.activity?.unique_users ?? data.summary.unique_users)} />
            <KPICard title="Failure Rate" value={`${data.summary.failure_rate_pct ?? 0}%`}
              sub={`${fmtInt(data.summary.failed_runs)} failed calls`} />
            <KPICard title="Models" value={fmtInt(data.summary.unique_models)} />
          </section>

          {/* Analyst insights */}
          {insights.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>🔎</span> Analyst notes
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
              </div>
            </section>
          )}

          {/* Two-column: daily sparkline + models */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 24 }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600 }}>Daily token trend (last 14 days)</h3>
              <DailySparkline daily={data.daily} />
              {data.daily.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
                  <span>{fmtDate(data.daily[Math.max(0, data.daily.length - 14)]?.date ?? "")}</span>
                  <span>{fmtDate(data.daily[data.daily.length - 1]?.date ?? "")}</span>
                </div>
              )}
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600 }}>Models</h3>
              {data.models.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13 }}>No model data yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.models.map((m) => (
                    <div key={m.model} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ fontWeight: 500, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.model}</span>
                      <span style={{ color: "#6b7280" }}>{fmtK(m.tokens)} tok · {fmtInt(m.runs)} runs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Tool cost breakdown */}
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff", marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 600 }}>Endpoint cost breakdown</h2>
            <ToolsTable tools={data.tools} />
          </section>

          {/* Token usage per user */}
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff", marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>Token usage per user</h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
              Only shows users with token-instrumented calls. Use the activity table below for full run counts.
            </p>
            <UsersTable users={data.users} />
          </section>

          {/* Analysis activity (always populated) */}
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>Analysis activity by user</h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
              Derived from <code>resume_analyses</code> — populated from day one, no token data required.
            </p>
            <ActivityTable byUser={data.activity?.by_user ?? []} />
          </section>
        </>
      )}
    </main>
  );
}
