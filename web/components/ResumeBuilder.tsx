"use client";
import { useState, useCallback } from "react";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source } from "@/lib/types";
import { apiUrl, scoreColor } from "@/lib/utils";
import { upsertResume } from "@/lib/supabase";

import ScoreRing    from "./ScoreRing";
import CriteriaTable from "./CriteriaTable";
import DiffView     from "./DiffView";
import InfoPanel    from "./InfoPanel";
import ModelPicker  from "./ModelPicker";
import SourcesPanel from "./SourcesPanel";
import ResumeSidebar from "./ResumeSidebar";

type Tab = "analysis" | "info" | "changes";

const EMPTY_RESULT: GenerationResult = {
  folder: null, texPath: null, pdfUrl: null,
  ratings: null, diff: [], adds: 0, removes: 0,
  sources: [], latexPreview: "", status: "",
};

export default function ResumeBuilder() {
  const [company,    setCompany]    = useState("");
  const [role,       setRole]       = useState("");
  const [jd,         setJd]         = useState("");
  const [model,      setModel]      = useState("gemini-2.5-flash");
  const [baseFolder, setBaseFolder] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState("");
  const [result,     setResult]     = useState<GenerationResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>("analysis");

  // Live LaTeX preview (accumulated chunks during streaming)
  const [preview, setPreview] = useState("");

  const generate = useCallback(async () => {
    if (!company.trim() || !role.trim() || !jd.trim()) {
      setError("Company, role, and job description are required.");
      return;
    }
    setGenerating(true);
    setError(null);
    setResult(null);
    setPreview("");
    setStatusMsg("Connecting…");

    const acc: GenerationResult = { ...EMPTY_RESULT };

    try {
      const resp = await fetch(apiUrl("/api/generate-stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, job_description: jd, model, base_folder: baseFolder }),
      });

      if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
      if (!resp.body)  throw new Error("No response body");

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let ev: SSEEvent;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }

          switch (ev.event) {
            case "status":
              setStatusMsg(ev.msg);
              break;

            case "chunk":
              acc.latexPreview += ev.text;
              setPreview(p => p + ev.text);
              break;

            case "sources":
              acc.sources = ev.urls as Source[];
              break;

            case "diff":
              acc.diff    = ev.data as DiffLine[];
              acc.adds    = ev.adds;
              acc.removes = ev.removes;
              break;

            case "ratings":
              acc.ratings = ev.data as RatingsData;
              break;

            case "saved":
              acc.folder  = ev.folder;
              acc.texPath = ev.tex_path;
              break;

            case "pdf":
              acc.pdfUrl = apiUrl(ev.url);
              break;

            case "done":
              // Persist to Supabase
              if (acc.folder) {
                upsertResume(
                  acc.folder, company, role, model,
                  acc.texPath ?? "", acc.pdfUrl,
                  acc.ratings,
                ).catch(console.error);
              }
              setResult({ ...acc });
              setGenerating(false);
              setStatusMsg("");
              break;

            case "error":
              throw new Error(ev.msg);
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setGenerating(false);
      setStatusMsg("");
    }
  }, [company, role, jd, model, baseFolder]);

  const ratings = result?.ratings;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", minHeight: "100vh" }}>
      {/* ── Main ─────────────────────────────────────────────── */}
      <main style={{ padding: "26px 34px", overflowY: "auto" }}>

        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>
            <span style={{ color: "var(--accent)" }}>R</span>esume Builder
          </div>
          <span style={{ color: "var(--dim)", fontSize: 12 }}>/</span>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            Parth Bhodia · Gemini + Search
          </span>
        </div>

        {/* ── Form ── */}
        <SectionLabel>Job target</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <Field label="Company">
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Google" />
          </Field>
          <Field label="Role">
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Fullstack Engineer" />
          </Field>
          <Field label="Job description" style={{ gridColumn: "1 / -1" }}>
            <textarea value={jd} onChange={e => setJd(e.target.value)} placeholder="Paste the job description…" style={{ minHeight: 130 }} />
          </Field>
        </div>

        {/* ── Settings ── */}
        <SectionLabel>Generation settings</SectionLabel>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 22 }}>
          <Field label="Base resume" style={{ flex: 1 }}>
            <select value={baseFolder ?? ""} onChange={e => setBaseFolder(e.target.value || null)}>
              <option value="">None (fresh generation)</option>
            </select>
          </Field>
          <Field label="Model">
            <ModelPicker value={model} onChange={setModel} />
          </Field>
        </div>

        {/* ── Generate ── */}
        {error && (
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "var(--radius)", color: "var(--red)", fontSize: 12 }}>
            {error}
          </div>
        )}
        <button
          onClick={generate}
          disabled={generating}
          style={{
            width: "100%", padding: 12, marginBottom: 32,
            background: generating ? "var(--surface2)" : "var(--accent)",
            color: generating ? "var(--muted)" : "#fff",
            border: "none", borderRadius: "var(--radius)",
            fontSize: 14, fontWeight: 500, fontFamily: "inherit",
            cursor: generating ? "not-allowed" : "pointer",
            letterSpacing: -0.2, transition: "all 0.2s",
          }}
        >
          {generating ? statusMsg || "Generating…" : "Generate resume"}
        </button>

        {/* ── Live preview during generation ── */}
        {generating && preview && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Live preview</SectionLabel>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "12px 14px",
              maxHeight: 220, overflow: "auto",
            }}>
              <pre style={{ fontSize: 10, lineHeight: 1.6, color: "var(--green)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {preview}
              </pre>
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {result && (
          <div className="fade-in">
            <div style={{ height: 1, background: "var(--border)", marginBottom: 26 }} />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--dim)" }}>Result</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>· {company} — {role}</span>
            </div>

            {/* Score row */}
            {ratings && (
              <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 26 }}>
                <ScoreRing score={ratings.match_score} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--muted)" }}>
                    {ratings.verdict}
                  </p>
                  {/* What's working + Gaps */}
                  {ratings.whats_working?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--green)", marginBottom: 6 }}>What&apos;s working</div>
                      {ratings.whats_working.map((w, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", marginBottom: 4, lineHeight: 1.5 }}>
                          <span style={{ color: "var(--green)", flexShrink: 0 }}>✓</span>{w}
                        </div>
                      ))}
                    </div>
                  )}
                  {ratings.gaps?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--orange)", marginBottom: 6 }}>Gaps to address</div>
                      {ratings.gaps.map((g, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", marginBottom: 4, lineHeight: 1.5 }}>
                          <span style={{ color: "var(--red)", flexShrink: 0 }}>→</span>{g}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sources */}
            {result.sources.length > 0 && <SourcesPanel sources={result.sources} />}

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", margin: "20px 0 18px" }}>
              {(["analysis","info","changes"] as Tab[]).map(t => {
                const labels: Record<Tab, string> = {
                  analysis: "Analysis",
                  info:     "Info",
                  changes:  result.diff.length ? `Changes  +${result.adds} −${result.removes}` : "Changes",
                };
                return (
                  <button key={t} onClick={() => setActiveTab(t)} style={{
                    padding: "9px 18px", fontSize: 12, fontWeight: 500,
                    background: "transparent", border: "none",
                    borderBottom: `2px solid ${activeTab === t ? "var(--accent)" : "transparent"}`,
                    color: activeTab === t ? "var(--accent)" : "var(--dim)",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}>
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            {activeTab === "analysis" && ratings && (
              <CriteriaTable criteria={ratings.criteria} />
            )}
            {activeTab === "analysis" && !ratings && (
              <div style={{ color: "var(--dim)", fontSize: 12, padding: "20px 0" }}>Analysis not available.</div>
            )}
            {activeTab === "info" && (
              <InfoPanel folder={result.folder} texPath={result.texPath} pdfUrl={result.pdfUrl} company={company} role={role} model={model} />
            )}
            {activeTab === "changes" && (
              <DiffView diff={result.diff} adds={result.adds} removes={result.removes} baseFolder={baseFolder} />
            )}
          </div>
        )}
      </main>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <ResumeSidebar
        activeFolder={result?.folder ?? null}
        onSelect={f => setBaseFolder(f)}
      />
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--dim)", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
