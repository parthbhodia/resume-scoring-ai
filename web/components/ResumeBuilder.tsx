"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source } from "@/lib/types";
import { apiUrl } from "@/lib/utils";
import { upsertResume, getSupabaseClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

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

  // PDF upload state
  const [candidateProfile,    setCandidateProfile]    = useState<string | null>(null);
  const [uploadedFileName,    setUploadedFileName]    = useState<string | null>(null);
  const [uploadingPdf,        setUploadingPdf]        = useState(false);
  const [uploadError,         setUploadError]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signed-in user
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const handlePdfUpload = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) {
      setUploadError("Please upload a PDF file.");
      return;
    }
    setUploadingPdf(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: formData });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Upload failed");
      setCandidateProfile(json.text);
      setUploadedFileName(file.name);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingPdf(false);
    }
  }, []);

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
        body: JSON.stringify({
          company, role, job_description: jd, model, base_folder: baseFolder,
          candidate_profile: candidateProfile,
        }),
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
  }, [company, role, jd, model, baseFolder, candidateProfile]);

  const ratings = result?.ratings;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", minHeight: "100vh" }}>
      {/* ── Main ─────────────────────────────────────────────── */}
      <main style={{ padding: "26px 34px", overflowY: "auto" }}>

        {/* Nav — glass bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 32,
          padding: "12px 0", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4 }}>
            Resume Builder
          </div>
          <span style={{ color: "var(--dim)", fontSize: 13 }}>·</span>
          <span style={{ color: "var(--muted)", fontSize: 13, letterSpacing: -0.2 }}>
            Gemini + Search
          </span>
          {/* User info */}
          {user && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--dim)", letterSpacing: -0.2 }}>{user.email}</span>
              <button
                onClick={() => getSupabaseClient().auth.signOut()}
                style={{
                  fontSize: 13, padding: "6px 14px",
                  background: "var(--surface2)", border: "none",
                  borderRadius: 980, color: "var(--muted)",
                  cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.2,
                }}
              >
                Sign out
              </button>
            </div>
          )}
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

        {/* ── PDF Upload ── */}
        <SectionLabel>Candidate profile</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          {candidateProfile ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px",
              background: "var(--green-bg)",
              borderRadius: "var(--radius)", fontSize: 13, letterSpacing: -0.2,
            }}>
              <span style={{ color: "var(--green)" }}>✓</span>
              <span style={{ color: "var(--text)", flex: 1 }}>
                Custom profile loaded — <strong>{uploadedFileName}</strong>
              </span>
              <button
                onClick={() => { setCandidateProfile(null); setUploadedFileName(null); }}
                style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                title="Remove uploaded profile"
              >
                ×
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePdfUpload(f); }}
              style={{
                background: "var(--surface2)",
                borderRadius: "var(--radius-lg)",
                padding: "20px 16px", textAlign: "center",
                cursor: uploadingPdf ? "not-allowed" : "pointer",
                letterSpacing: -0.2, lineHeight: 1.6,
                transition: "background 0.15s",
              }}
            >
              {uploadingPdf ? (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>Extracting text from PDF…</span>
              ) : (
                <>
                  <span style={{ display: "block", color: "var(--muted)", fontSize: 14, marginBottom: 4 }}>
                    Upload a PDF resume
                  </span>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>
                    Click or drag &amp; drop · Replaces default profile
                  </span>
                </>
              )}
            </div>
          )}
          {uploadError && (
            <div style={{ marginTop: 6, color: "var(--red)", fontSize: 11 }}>{uploadError}</div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }}
          />
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
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--red-bg)", borderRadius: "var(--radius)", color: "var(--red)", fontSize: 13, letterSpacing: -0.2 }}>
            {error}
          </div>
        )}
        <button
          onClick={generate}
          disabled={generating}
          style={{
            width: "100%", padding: "12px 15px", marginBottom: 32,
            background: generating ? "var(--surface2)" : "var(--accent)",
            color: generating ? "var(--muted)" : "#fff",
            border: "none", borderRadius: "var(--radius)",
            fontSize: 17, fontWeight: 400, fontFamily: "inherit",
            cursor: generating ? "not-allowed" : "pointer",
            letterSpacing: -0.3, transition: "background 0.2s",
          }}
        >
          {generating ? statusMsg || "Generating…" : "Generate resume"}
        </button>

        {/* ── Live preview during generation ── */}
        {generating && preview && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Live preview</SectionLabel>
            <div style={{
              background: "var(--surface2)",
              borderRadius: "var(--radius-lg)", padding: "12px 14px",
              maxHeight: 220, overflow: "auto",
              boxShadow: "var(--shadow)",
            }}>
              <pre style={{ fontSize: 11, lineHeight: 1.6, color: "var(--green)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
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
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2 }}>Result</span>
              <span style={{ fontSize: 13, color: "var(--dim)" }}>· {company} — {role}</span>
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
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", marginBottom: 6, letterSpacing: -0.2 }}>What&apos;s working</div>
                      {ratings.whats_working.map((w, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 4, lineHeight: 1.5, letterSpacing: -0.2 }}>
                          <span style={{ color: "var(--green)", flexShrink: 0 }}>✓</span>{w}
                        </div>
                      ))}
                    </div>
                  )}
                  {ratings.gaps?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--orange)", marginBottom: 6, letterSpacing: -0.2 }}>Gaps to address</div>
                      {ratings.gaps.map((g, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 4, lineHeight: 1.5, letterSpacing: -0.2 }}>
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
                    padding: "9px 18px", fontSize: 13, fontWeight: activeTab === t ? 500 : 400,
                    background: "transparent", border: "none",
                    borderBottom: `2px solid ${activeTab === t ? "var(--accent)" : "transparent"}`,
                    color: activeTab === t ? "var(--accent)" : "var(--dim)",
                    cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.2, transition: "all 0.15s",
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
    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)", marginBottom: 10, letterSpacing: -0.1 }}>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--muted)", marginBottom: 6, letterSpacing: -0.1 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
