"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import type { AdminAnalyticsResponse } from "@/lib/types";

function fmtInt(n: number): string {
  return new Intl.NumberFormat().format(n || 0);
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data: s }) => setUserId(s.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/admin/analytics?user_id=${encodeURIComponent(userId)}&days=${days}`))
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
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, days]);

  const topUsers = useMemo(() => (data?.users ?? []).slice(0, 15), [data]);

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Admin Analytics</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>User activity, tool usage, and token consumption.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#6b7280" }}>Window</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {loading && <p style={{ marginTop: 18 }}>Loading analytics...</p>}
      {error && <p style={{ marginTop: 18, color: "#b91c1c" }}>{error}</p>}

      {!loading && !error && data && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 18 }}>
            <Metric title="Runs" value={fmtInt(data.summary.total_runs)} />
            <Metric title="Tokens" value={fmtInt(data.summary.total_tokens)} />
            <Metric title="Users" value={fmtInt(data.summary.unique_users)} />
            <Metric title="Tools" value={fmtInt(data.summary.unique_tools)} />
            <Metric title="Models" value={fmtInt(data.summary.unique_models)} />
            <Metric title="Failures" value={fmtInt(data.summary.failed_runs)} />
          </section>

          <section style={{ marginTop: 22 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Top Users</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "8px 6px" }}>User</th>
                  <th style={{ padding: "8px 6px" }}>Runs</th>
                  <th style={{ padding: "8px 6px" }}>Tokens</th>
                  <th style={{ padding: "8px 6px" }}>Top Tools</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.user_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 6px" }}>
                      <div>{u.user_email || u.user_id}</div>
                      {u.user_email && <div style={{ color: "#64748b", fontSize: 12 }}>{u.user_id}</div>}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{fmtInt(u.runs)}</td>
                    <td style={{ padding: "8px 6px" }}>{fmtInt(u.tokens)}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {Object.entries(u.tools)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([tool, count]) => `${tool} (${count})`)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 22 }}>
            <SimpleList title="Tool Usage" rows={(data.tools ?? []).map((t) => `${t.tool_name}: ${fmtInt(t.runs)} runs, ${fmtInt(t.tokens)} tokens`)} />
            <SimpleList title="Model Usage" rows={(data.models ?? []).map((m) => `${m.model}: ${fmtInt(m.runs)} runs, ${fmtInt(m.tokens)} tokens`)} />
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
      <div style={{ color: "#64748b", fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SimpleList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {rows.slice(0, 12).map((r) => (
          <li key={r} style={{ marginBottom: 4 }}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
