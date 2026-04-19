"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source, ChangeRationale } from "@/lib/types";
import { apiUrl } from "@/lib/utils";
import { upsertResume, getSupabaseClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

import ScoreRing    from "./ScoreRing";
import CriteriaTable from "./CriteriaTable";
import DiffView     from "./DiffView";
import SourcesPanel from "./SourcesPanel";
import ResumeSidebar from "./ResumeSidebar";

type Tab = "analysis" | "changes";

const EMPTY_RESULT: GenerationResult = {
  folder: null, texPath: null, pdfUrl: null,
  ratings: null, diff: [], adds: 0, removes: 0, rationales: [],
  sources: [], latexPreview: "", status: "",
};

export default function ResumeBuilder() {
  const [company,    setCompany]    = useState("");
  const [role,       setRole]       = useState("");
  const [jd,         setJd]         = useState("");
  const model = "gemini-2.5-flash";
  const [baseFolder, setBaseFolder] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState("");
  const [result,     setResult]     = useState<GenerationResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>("analysis");
  const [preview, setPreview] = useState("");

  const [candidateProfile,    setCandidateProfile]    = useState<string | null>(null);
  const [uploadedFileName,    setUploadedFileName]    = useState<string | null>(null);
  const [uploadingPdf,        setUploadingPdf]        = useState(false);
  const [uploadError,         setUploadError]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const handlePdfUpload = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) { setUploadError("Please upload a PDF file."); return; }
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
      setError("Please fill in company, role, and job description.");
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
            case "status":  setStatusMsg(ev.msg); break;
            case "chunk":   acc.latexPreview += ev.text; setPreview(p => p + ev.text); break;
            case "sources": acc.sources = ev.urls as Source[]; break;
            case "diff":    acc.diff = ev.data as DiffLine[]; acc.adds = ev.adds; acc.removes = ev.removes; break;
            case "rationales": acc.rationales = ev.data as ChangeRationale[]; break;
            case "ratings": acc.ratings = ev.data as RatingsData; break;
            case "saved":   acc.folder = ev.folder; acc.texPath = ev.tex_path; break;
            case "pdf":     acc.pdfUrl = apiUrl(ev.url); break;
            case "done":
              if (acc.folder) {
                upsertResume(acc.folder, company, role, model, acc.texPath ?? "", acc.pdfUrl, acc.ratings).catch(console.error);
                // Auto-set this resume as base for the next generation's diff
                setBaseFolder(acc.folder);
              }
              setResult({ ...acc });
              setGenerating(false);
              setStatusMsg("");
              break;
            case "error": throw new Error(ev.msg);
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setGenerating(false);
      setStatusMsg("");
    }
  }, [company, role, jd, baseFolder, candidateProfile]);

  const ratings = result?.ratings;
  const score   = ratings?.match_score ?? 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 288px", minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Main ── */}
      <main style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Sticky nav */}
        <header style={{
          position: "sticky", top: 0, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 48px", height: 54,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: "var(--accent)", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1.5" y="0.5" width="7" height="9" rx="1.2" stroke="white" strokeWidth="1.2"/>
                <path d="M4 4h5M4 6h3.5M4 8h4.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.5, color: "var(--text)" }}>ResumeAI</span>
          </div>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--dim)", letterSpacing: -0.2 }}>{user.email}</span>
              <button
                onClick={() => getSupabaseClient().auth.signOut()}
                style={{
                  fontSize: 12, padding: "4px 11px",
                  background: "var(--surface2)", border: "1px solid var(--border)",
                  borderRadius: 6, color: "var(--muted)", cursor: "pointer", fontFamily: "inherit",
                }}
              >Sign out</button>
            </div>
          )}
        </header>

        {/* Page content */}
        <div style={{ padding: "44px 48px 80px", maxWidth: 820, margin: "0 auto", width: "100%" }}>

          {/* ── Hero (pre-generation) ── */}
          {!result && !generating && (
            <div style={{ textAlign: "center", marginBottom: 48 }} className="fade-in">
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.15, marginBottom: 12 }}>
                Tailor your resume to<br />any job description
              </div>
              <p style={{ fontSize: 15, color: "var(--muted)", letterSpacing: -0.3, marginBottom: 28, lineHeight: 1.6 }}>
                Upload your resume, paste a job description, and get an AI-optimized<br />
                resume that speaks the company&apos;s language.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {["Upload your resume", "Paste the job description", "Get a tailored resume"].map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "6px 14px",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 20, fontSize: 12, color: "var(--muted)", letterSpacing: -0.2,
                  }}>
                    <span style={{
                      width: 17, height: 17, borderRadius: "50%",
                      background: "var(--accent)", color: "#fff",
                      fontSize: 9, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{i + 1}</span>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Resume ── */}
          <StepCard step={1} title="Your resume" subtitle="Upload your current resume as a PDF">
            <input
              ref={fileInputRef} type="file" accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }}
            />

            {candidateProfile ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px",
                background: "var(--green-bg)", border: "1px solid rgba(52,211,153,0.2)",
                borderRadius: 10,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "rgba(52,211,153,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2h7l3 3v9H3V2z" stroke="var(--green)" strokeWidth="1.3" strokeLinejoin="round"/>
                    <path d="M10 2v3h3" stroke="var(--green)" strokeWidth="1.3" strokeLinejoin="round"/>
                    <path d="M5.5 8.5l1.5 1.5 3-3" stroke="var(--green)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {uploadedFileName}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--green)", marginTop: 2 }}>Ready to use</div>
                </div>
                <button
                  onClick={() => { setCandidateProfile(null); setUploadedFileName(null); }}
                  style={{
                    background: "none", border: "none", color: "var(--dim)",
                    cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px",
                  }}
                  title="Remove"
                >×</button>
              </div>
            ) : (
              <div
                onClick={() => !uploadingPdf && fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePdfUpload(f); }}
                style={{
                  border: "1.5px dashed var(--border-h)", borderRadius: 10,
                  padding: "28px 20px", textAlign: "center",
                  cursor: uploadingPdf ? "not-allowed" : "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  background: "var(--surface2)",
                }}
                onMouseEnter={e => { if (!uploadingPdf) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-bg)"; }}}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-h)"; e.currentTarget.style.background = "var(--surface2)"; }}
              >
                {uploadingPdf ? (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Extracting text…</div>
                ) : (
                  <>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: "var(--surface3)", margin: "0 auto 12px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 3v9M6 9l3 3 3-3" stroke="var(--dim)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 14h12" stroke="var(--dim)" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 4, letterSpacing: -0.2 }}>
                      Drop your resume PDF here
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dim)" }}>or click to browse</div>
                  </>
                )}
              </div>
            )}

            {uploadError && (
              <div style={{ marginTop: 8, color: "var(--red)", fontSize: 12 }}>{uploadError}</div>
            )}

            {!candidateProfile && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)", letterSpacing: -0.1 }}>
                No resume? We&apos;ll use a default profile to generate a starting point.
              </div>
            )}
          </StepCard>

          {/* ── Step 2: Job target ── */}
          <StepCard step={2} title="Target job" subtitle="Tell us what you're applying for">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Field label="Company">
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Google" />
              </Field>
              <Field label="Role">
                <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Fullstack Engineer" />
              </Field>
            </div>
            <Field label="Job description">
              <textarea
                value={jd}
                onChange={e => setJd(e.target.value)}
                placeholder="Paste the full job description here — the more detail, the better the match…"
                style={{ minHeight: 140, lineHeight: 1.55 }}
              />
            </Field>
          </StepCard>

          {/* Base resume indicator */}
          {baseFolder && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginBottom: 12, padding: "8px 12px",
              background: "var(--surface2)", borderRadius: 8,
              fontSize: 12, letterSpacing: -0.2,
            }}>
              <span style={{ color: "var(--dim)" }}>Comparing against</span>
              <span style={{ color: "var(--text)", fontWeight: 500, flex: 1 }}>{baseFolder}</span>
              <button
                onClick={() => setBaseFolder(null)}
                style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
                title="Clear base"
              >×</button>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{
              marginBottom: 16, padding: "12px 16px",
              background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 10, color: "var(--red)", fontSize: 13, letterSpacing: -0.2,
            }}>
              {error}
            </div>
          )}

          {/* ── Generate button ── */}
          <button
            onClick={generate}
            disabled={generating}
            style={{
              width: "100%", padding: "14px 20px", marginBottom: 32,
              background: generating ? "var(--surface2)" : "var(--accent)",
              color: generating ? "var(--muted)" : "#fff",
              border: "none", borderRadius: 12,
              fontSize: 16, fontWeight: 500, fontFamily: "inherit",
              cursor: generating ? "not-allowed" : "pointer",
              letterSpacing: -0.4, transition: "background 0.2s, transform 0.1s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.background = "var(--accent-h)"; }}
            onMouseLeave={e => { if (!generating) e.currentTarget.style.background = "var(--accent)"; }}
          >
            {generating ? (
              <>
                <Spinner />
                {statusMsg || "Tailoring your resume…"}
              </>
            ) : (
              "Tailor my resume →"
            )}
          </button>

          {/* Live preview during generation */}
          {generating && preview && (
            <div style={{ marginBottom: 28 }} className="fade-in">
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: -0.1, marginBottom: 8, textTransform: "uppercase" }}>
                Live preview
              </div>
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "14px 16px",
                maxHeight: 200, overflow: "auto",
              }}>
                <pre style={{ fontSize: 11, lineHeight: 1.65, color: "var(--green)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {preview}
                </pre>
              </div>
            </div>
          )}

          {/* ── Results ── */}
          {result && ratings && (
            <div className="fade-in">

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: 11, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>Results</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>

              {/* Score hero card */}
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, padding: "28px 28px 24px",
                marginBottom: 16,
                position: "relative", overflow: "hidden",
              }}>
                {/* Subtle accent glow behind score */}
                <div style={{
                  position: "absolute", top: -40, left: -40, width: 200, height: 200,
                  background: score >= 75 ? "rgba(52,211,153,0.06)" : score >= 55 ? "rgba(251,191,36,0.06)" : "rgba(248,113,113,0.06)",
                  borderRadius: "50%", pointerEvents: "none",
                }} />

                <div style={{ display: "flex", alignItems: "flex-start", gap: 24, position: "relative" }}>
                  <ScoreRing score={score} size={130} />

                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>
                      {company} · {role}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.6, color: "var(--text)", marginBottom: 8, lineHeight: 1.3 }}>
                      {score >= 80 ? "Strong match" : score >= 65 ? "Good match" : score >= 50 ? "Moderate match" : "Needs work"}
                    </div>
                    <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, letterSpacing: -0.2, margin: 0 }}>
                      {ratings.verdict}
                    </p>
                  </div>

                  {/* PDF download */}
                  {result.pdfUrl && (
                    <a
                      href={result.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "9px 16px", flexShrink: 0,
                        background: "var(--accent)", borderRadius: 9,
                        color: "#fff", textDecoration: "none",
                        fontSize: 13, fontWeight: 500, letterSpacing: -0.3,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 11h9" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      Download PDF
                    </a>
                  )}
                </div>
              </div>

              {/* Strengths + Gaps */}
              {(ratings.whats_working?.length > 0 || ratings.gaps?.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {ratings.whats_working?.length > 0 && (
                    <div style={{
                      background: "var(--surface)", border: "1px solid rgba(52,211,153,0.18)",
                      borderRadius: 12, padding: "16px 18px",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 12 }}>
                        What&apos;s working
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ratings.whats_working.map((w, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.2 }}>
                            <span style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }}>✓</span>
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ratings.gaps?.length > 0 && (
                    <div style={{
                      background: "var(--surface)", border: "1px solid rgba(251,191,36,0.18)",
                      borderRadius: 12, padding: "16px 18px",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--orange)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 12 }}>
                        Gaps to address
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ratings.gaps.map((g, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.2 }}>
                            <span style={{ color: "var(--orange)", flexShrink: 0, marginTop: 1 }}>→</span>
                            <span>{g}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sources */}
              {result.sources.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <SourcesPanel sources={result.sources} />
                </div>
              )}

              {/* Tabs */}
              <div style={{
                display: "flex", gap: 2, marginBottom: 18,
                background: "var(--surface2)", borderRadius: 9, padding: 3,
              }}>
                {(["analysis", "changes"] as Tab[]).map(t => {
                  const labels: Record<Tab, string> = {
                    analysis: "Analysis",
                    changes:  result.diff.length ? `Changes  +${result.adds} −${result.removes}` : "Changes",
                  };
                  return (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      style={{
                        flex: 1, padding: "7px 14px", fontSize: 12,
                        fontWeight: activeTab === t ? 600 : 400,
                        background: activeTab === t ? "var(--surface)" : "transparent",
                        border: "none", borderRadius: 7,
                        color: activeTab === t ? "var(--text)" : "var(--dim)",
                        cursor: "pointer", fontFamily: "inherit",
                        letterSpacing: -0.2, transition: "all 0.15s",
                        boxShadow: activeTab === t ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>

              {activeTab === "analysis" && (
                <CriteriaTable criteria={ratings.criteria} />
              )}
              {activeTab === "changes" && (
                <DiffView diff={result.diff} adds={result.adds} removes={result.removes} rationales={result.rationales} baseFolder={baseFolder} />
              )}

              {/* Start over nudge */}
              <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--dim)", letterSpacing: -0.2 }}>Want to try a different job?</span>
                <button
                  onClick={() => { setResult(null); setJd(""); setCompany(""); setRole(""); setPreview(""); }}
                  style={{
                    fontSize: 12, padding: "6px 14px",
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    borderRadius: 7, color: "var(--muted)", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Start over
                </button>
              </div>
            </div>
          )}

          {/* Result with no ratings */}
          {result && !ratings && (
            <div style={{ textAlign: "center", color: "var(--dim)", fontSize: 13, padding: "24px 0" }}>
              Generation complete — analysis not available.
              {result.pdfUrl && (
                <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 12, color: "var(--accent)", fontSize: 13 }}>
                  Download PDF →
                </a>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ── Sidebar ── */}
      <ResumeSidebar
        activeFolder={result?.folder ?? null}
        onSelect={f => setBaseFolder(f)}
      />
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function StepCard({ step, title, subtitle, children }: {
  step: number; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "20px 22px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "var(--accent)", color: "#fff",
          fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, letterSpacing: 0,
        }}>
          {step}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.4, color: "var(--text)", lineHeight: 1 }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3, letterSpacing: -0.1 }}>
            {subtitle}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dim)", marginBottom: 6, letterSpacing: -0.1, textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
