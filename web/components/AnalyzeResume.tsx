"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScoreRing from "./ScoreRing";
import { apiUrl } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface AnalysisResult {
  overallScore: number;
  categoryScores: {
    readability: number;
    atsCompatibility: number;
    jobMatch: number | null;
    achievementQuality: number;
    quantification: number;
    sectionStructure: number;
    languageQuality: number;
    technicalBranding: number;
  };
  summary: string;
  topStrengths: string[];
  topIssues: Array<{
    issue: string;
    severity: "low" | "medium" | "high";
    whyItMatters: string;
    suggestion: string;
  }>;
  atsWarnings: Array<{ warning: string; suggestion: string }>;
  keywordAnalysis: {
    matchedKeywords: string[];
    missingKeywords: string[];
    keywordScore: number | null;
    suggestions: string[];
  };
  bulletAnalysis: Array<{
    originalBullet: string;
    score: number;
    issues: string[];
    improvedBullet: string;
  }>;
  sectionFeedback: Array<{ section: string; score: number; feedback: string }>;
  rewriteSuggestions: Array<{ before: string; after: string; reason: string }>;
  finalRecommendations: string[];
}

interface StoredResume {
  folder: string;
  company: string;
  role: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFolder(folder: string): { company: string; role: string } {
  const parts = folder.split("_");
  if (parts.length >= 2) {
    return { company: parts[0], role: parts.slice(1, -1).join(" ") || parts[1] };
  }
  return { company: folder, role: "" };
}

function scoreColor(score: number | null): string {
  if (score === null) return "var(--border)";
  if (score >= 80) return "var(--green)";
  if (score >= 60) return "var(--yellow)";
  return "var(--red)";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Good";
  return "Needs Work";
}

function severityColor(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "var(--red)";
  if (severity === "medium") return "#f59e0b";
  return "var(--accent)";
}

function severityBg(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "rgba(248,113,113,0.12)";
  if (severity === "medium") return "rgba(245,158,11,0.12)";
  return "rgba(99,102,241,0.12)";
}

const LOADING_MESSAGES = [
  "Extracting resume text…",
  "Running structural checks…",
  "AI is analyzing bullets…",
  "Generating suggestions…",
];

const CATEGORY_LABELS: Array<{ key: keyof AnalysisResult["categoryScores"]; label: string }> = [
  { key: "readability", label: "Readability" },
  { key: "atsCompatibility", label: "ATS Safety" },
  { key: "jobMatch", label: "Job Match" },
  { key: "achievementQuality", label: "Achievement" },
  { key: "quantification", label: "Quantification" },
  { key: "sectionStructure", label: "Structure" },
  { key: "languageQuality", label: "Language" },
  { key: "technicalBranding", label: "Tech Brand" },
];

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
    >
      <circle cx="9" cy="9" r="7" stroke="var(--border)" strokeWidth="2.5" />
      <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyzeResume() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [jd, setJd] = useState("");
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [storedResumes, setStoredResumes] = useState<StoredResume[]>([]);
  const [loadingStored, setLoadingStored] = useState(false);
  const [expandedBullets, setExpandedBullets] = useState<Record<number, boolean>>({});
  // History sidebar — hidden by default on mobile, visible on desktop
  const [historyOpen, setHistoryOpen] = useState(false);

  // Cycle loading messages every 3s
  useEffect(() => {
    if (!loading) { setLoadingMsg(0); return; }
    const iv = setInterval(() => setLoadingMsg(m => (m + 1) % LOADING_MESSAGES.length), 3000);
    return () => clearInterval(iv);
  }, [loading]);

  // Fetch stored resumes — always scoped to the signed-in user
  useEffect(() => {
    setLoadingStored(true);
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.id) { setLoadingStored(false); return; }
      try {
        const resp = await fetch(apiUrl(`/api/resumes?user_id=${encodeURIComponent(user.id)}`));
        const data = await resp.json();
        // DB returns [{folder, company, role, score, ...}]; local fallback [{folder,...}]
        const records: StoredResume[] = Array.isArray(data)
          ? data.map((r: { folder: string; company?: string; role?: string }) => ({
              folder:  r.folder,
              company: r.company || parseFolder(r.folder).company,
              role:    r.role    || parseFolder(r.folder).role,
            }))
          : [];
        setStoredResumes(records);
      } catch { /* silently ignore */ }
      setLoadingStored(false);
    });
  }, []);

  const run = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedBullets({});
    const fd = new FormData();
    fd.append("file", file);
    if (jd.trim()) fd.append("jd", jd);
    try {
      const resp = await fetch(apiUrl("/api/analyze-upload"), { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      setResult(json as AnalysisResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jd]);

  const runFolder = useCallback(async (folder: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedBullets({});
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const resp = await fetch(apiUrl(`/api/analyze-folder/${encodeURIComponent(folder)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id ?? "", jd }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      setResult(json as AnalysisResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jd]);

  const onFile = (f: File | null | undefined) => {
    if (!f || !f.name.endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    run(f);
  };

  // Sort issues high → medium → low
  const sortedIssues = result?.topIssues
    ? [...result.topIssues].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  /* ── Shared sidebar content ─────────────────── */
  const sidebarContent = (
    <>
      {result ? (
        <>
          {/* Score ring */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, fontFamily: "'Cormorant Garant', Georgia, serif" }}>
              Resume Score
            </div>
            <ScoreRing score={result.overallScore} size={100} label="" />
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: scoreColor(result.overallScore) }}>
              {scoreLabel(result.overallScore)}
            </div>
          </div>

          {/* Analyze another button */}
          <button
            onClick={() => { setResult(null); setError(null); setExpandedBullets({}); setHistoryOpen(false); }}
            style={{
              width: "100%", padding: "9px 14px", borderRadius: 8,
              background: "var(--amber)", border: "none", color: "#fff",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 20,
              transition: "opacity var(--transition)",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          >
            ↑ Analyze another
          </button>

          {/* Category score bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CATEGORY_LABELS.map(({ key, label }) => {
              const score = result.categoryScores[key];
              const color = scoreColor(score);
              const pct = score !== null ? score : 0;
              return (
                <div key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted)" }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: score === null ? "var(--dim)" : color }}>
                      {score === null ? "N/A" : score}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--surface2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: score === null ? "var(--border)" : color, transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Pre-result: history of saved resumes */
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14, fontFamily: "'Cormorant Garant', Georgia, serif" }}>
            My Resumes
          </div>

          {loadingStored ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                  <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div className="skeleton" style={{ height: 11, borderRadius: 3, width: "75%" }} />
                    <div className="skeleton" style={{ height: 10, borderRadius: 3, width: "55%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : storedResumes.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--dim)", textAlign: "center", paddingTop: 24, lineHeight: 1.7 }}>
              No saved résumés yet.<br />
              <span style={{ fontSize: 12 }}>Generate one in the Builder tab<br />or upload a PDF below.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {storedResumes.map(r => (
                <button
                  key={r.folder}
                  onClick={() => { runFolder(r.folder); setHistoryOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "transparent",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "background var(--transition), border-color var(--transition)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--amber-bg)"; e.currentTarget.style.borderColor = "rgba(196,121,58,0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: "var(--surface2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: "var(--dim)" }}>
                      <path d="M3 2h7l3 3v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.company}
                    </div>
                    {r.role && (
                      <div style={{ fontSize: 11, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                        {r.role}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)", position: "relative" }}>

      {/* ── Mobile backdrop (close history panel) ─── */}
      {historyOpen && (
        <div
          onClick={() => setHistoryOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 29,
            background: "rgba(0,0,0,0.28)",
          }}
        />
      )}

      {/* ── Sidebar — desktop static; mobile slide-in via CSS class ── */}
      <style>{`
        .az-sidebar {
          width: 260px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          padding: 20px 14px;
          transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
        }
        @media (max-width: 767px) {
          .az-sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            z-index: 30;
            width: 280px;
            box-shadow: 4px 0 24px rgba(0,0,0,0.18);
            transform: translateX(-100%);
          }
          .az-sidebar.open {
            transform: translateX(0);
          }
          .az-main { padding: 20px 16px 60px !important; }
        }
      `}</style>
      <aside className={`az-sidebar${historyOpen ? " open" : ""}`}>
        {/* Sidebar header with close button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            History
          </span>
          <button
            onClick={() => setHistoryOpen(false)}
            title="Hide history"
            style={{
              width: 24, height: 24, borderRadius: 6,
              border: "none", background: "var(--surface2)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--dim)", transition: "background var(--transition)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* ── Main panel ────────────────────────────────── */}
      <main className="az-main" style={{ flex: 1, overflowY: "auto", padding: "28px 36px", minWidth: 0 }}>

        <style>{`
          @media (max-width: 767px) {
            .az-history-bar     { display: flex !important; }
            .az-mobile-score    { display: block !important; }
            .az-main            { padding: 16px 14px 60px !important; }
          }
        `}</style>

        {/* ── Mobile-only score card (shown when result exists) ── */}
        {result && (
          <div className="az-mobile-score" style={{ display: "none", marginBottom: 20 }}>
            {/* Score row */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "18px 16px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ScoreRing score={result.overallScore} size={80} label="" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Cormorant Garant', Georgia, serif", marginBottom: 4 }}>
                    Resume Score
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor(result.overallScore), lineHeight: 1 }}>
                    {result.overallScore}
                    <span style={{ fontSize: 14, fontWeight: 400, color: "var(--dim)" }}>/100</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: scoreColor(result.overallScore), marginTop: 2 }}>
                    {scoreLabel(result.overallScore)}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => { setResult(null); setError(null); setExpandedBullets({}); }}
                  style={{
                    padding: "8px 14px", borderRadius: 8, border: "none",
                    background: "var(--amber)", color: "#fff",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >New ↑</button>
              </div>
            </div>

            {/* Category bars */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "14px 16px",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px",
            }}>
              {CATEGORY_LABELS.map(({ key, label }) => {
                const score = result.categoryScores[key];
                const color = scoreColor(score);
                const pct = score !== null ? score : 0;
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: score === null ? "var(--dim)" : color }}>
                        {score === null ? "–" : score}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: "var(--surface2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: score === null ? "var(--border)" : color, transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile history toggle bar (pre-result only) */}
        {!result && (
          <div className="az-history-bar" style={{ display: "none", marginBottom: 16 }}>
            <button
              onClick={() => setHistoryOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--surface)",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, color: "var(--muted)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {storedResumes.length > 0 ? `My Résumés (${storedResumes.length})` : "My Résumés"}
            </button>
          </div>
        )}

        {/* Pre-result upload state */}
        {!result && !loading && (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            {/* JD textarea */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Paste job description (optional — unlocks keyword analysis)
              </label>
              <textarea
                value={jd}
                onChange={e => setJd(e.target.value)}
                placeholder="Paste the job description here to get tailored keyword matching and job fit scoring…"
                rows={5}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: "vertical",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 16,
                padding: "56px 32px",
                cursor: "pointer",
                background: dragging ? "rgba(99,102,241,0.04)" : "var(--surface)",
                transition: "border-color 0.15s, background 0.15s",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                Drop your resume PDF here
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                or click to browse — we&apos;ll give you a full AI-powered report
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 12, fontSize: 13, color: "var(--red)" }}>{error}</div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 100 }}>
            <Spinner size={28} />
            <span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500, transition: "opacity 0.3s" }}>
              {LOADING_MESSAGES[loadingMsg]}
            </span>
          </div>
        )}

        {/* Result state */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 760 }}>

            {/* 1. Summary banner */}
            <section>
              <div style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "20px 24px",
              }}>
                <p style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.7, margin: "0 0 16px" }}>
                  {result.summary}
                </p>
                {result.topStrengths.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {result.topStrengths.slice(0, 3).map((s, i) => (
                      <span key={i} style={{
                        fontSize: 12, fontWeight: 600, padding: "4px 12px",
                        borderRadius: 20, background: "rgba(52,211,153,0.12)", color: "var(--green)",
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 2. Top Issues */}
            {sortedIssues.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Top Issues
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedIssues.map((issue, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "16px 18px",
                      background: "var(--surface)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px",
                          borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.4,
                          background: severityBg(issue.severity),
                          color: severityColor(issue.severity),
                        }}>
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                          {issue.issue}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                        {issue.whyItMatters}
                      </p>
                      <div style={{
                        background: "var(--surface2)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontSize: 13,
                        color: "var(--text)",
                        lineHeight: 1.6,
                        borderLeft: "3px solid var(--accent)",
                      }}>
                        {issue.suggestion}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. ATS Warnings */}
            {result.atsWarnings.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  ATS Warnings
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.atsWarnings.map((w, i) => (
                    <div key={i} style={{
                      border: "1px solid rgba(245,158,11,0.3)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      background: "rgba(245,158,11,0.06)",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>⚠️</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#f59e0b", marginBottom: 4 }}>
                            {w.warning}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                            {w.suggestion}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Keyword Analysis */}
            {result.keywordAnalysis.keywordScore !== null && (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                    Keyword Analysis
                  </h2>
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: "3px 12px",
                    borderRadius: 20,
                    background: scoreColor(result.keywordAnalysis.keywordScore) === "var(--green)"
                      ? "rgba(52,211,153,0.12)"
                      : scoreColor(result.keywordAnalysis.keywordScore) === "var(--yellow)"
                      ? "rgba(245,158,11,0.12)"
                      : "rgba(248,113,113,0.12)",
                    color: scoreColor(result.keywordAnalysis.keywordScore),
                  }}>
                    {result.keywordAnalysis.keywordScore}/100
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {/* Matched */}
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 12,
                    padding: "14px 16px", background: "var(--surface)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                      Matched Keywords
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.keywordAnalysis.matchedKeywords.length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>None found</span>
                      ) : result.keywordAnalysis.matchedKeywords.map((kw, i) => (
                        <span key={i} style={{
                          fontSize: 11, fontWeight: 500, padding: "3px 9px",
                          borderRadius: 20, background: "rgba(52,211,153,0.12)", color: "var(--green)",
                        }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Missing */}
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 12,
                    padding: "14px 16px", background: "var(--surface)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                      Missing Keywords
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.keywordAnalysis.missingKeywords.length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>None — great coverage!</span>
                      ) : result.keywordAnalysis.missingKeywords.map((kw, i) => (
                        <span key={i} style={{
                          fontSize: 11, fontWeight: 500, padding: "3px 9px",
                          borderRadius: 20, background: "rgba(248,113,113,0.12)", color: "var(--red)",
                        }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {result.keywordAnalysis.suggestions.length > 0 && (
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 10,
                    padding: "14px 16px", background: "var(--surface2)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                      Suggestions
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {result.keywordAnalysis.suggestions.map((s, i) => (
                        <li key={i} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* 5. Bullet Analysis */}
            {result.bulletAnalysis.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Weakest Bullets — AI Rewrites
                </h2>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  {result.bulletAnalysis.map((bullet, i) => {
                    const isExpanded = !!expandedBullets[i];
                    const bColor = bullet.score < 50
                      ? "var(--red)"
                      : bullet.score < 70
                      ? "#f59e0b"
                      : "var(--green)";
                    const bBg = bullet.score < 50
                      ? "rgba(248,113,113,0.12)"
                      : bullet.score < 70
                      ? "rgba(245,158,11,0.12)"
                      : "rgba(52,211,153,0.12)";
                    return (
                      <div
                        key={i}
                        style={{ borderBottom: i === result.bulletAnalysis.length - 1 ? "none" : "1px solid var(--border)" }}
                      >
                        {/* Accordion header */}
                        <div
                          onClick={() => setExpandedBullets(e => ({ ...e, [i]: !e[i] }))}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "14px 18px", cursor: "pointer",
                            background: isExpanded ? "var(--surface2)" : "var(--surface)",
                            transition: "background 0.1s",
                          }}
                        >
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 20, background: bBg, color: bColor, flexShrink: 0,
                          }}>
                            {bullet.score}
                          </span>
                          <span style={{
                            fontSize: 13, color: "var(--muted)", flex: 1, minWidth: 0,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {bullet.originalBullet}
                          </span>
                          <svg
                            width="16" height="16" viewBox="0 0 16 16" fill="none"
                            style={{
                              flexShrink: 0,
                              transition: "transform 0.2s",
                              transform: isExpanded ? "rotate(180deg)" : "none",
                            }}
                          >
                            <path d="M4 6l4 4 4-4" stroke="var(--dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>

                        {/* Accordion body */}
                        {isExpanded && (
                          <div style={{ padding: "12px 18px 16px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10 }}>
                            {bullet.issues.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {bullet.issues.map((issue, j) => (
                                  <span key={j} style={{
                                    fontSize: 11, fontWeight: 500, padding: "2px 8px",
                                    borderRadius: 20, background: "rgba(248,113,113,0.10)", color: "var(--red)",
                                  }}>
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div style={{
                              fontSize: 13, color: "var(--muted)", fontStyle: "italic",
                              borderLeft: "3px solid var(--border)", paddingLeft: 12,
                              lineHeight: 1.6,
                            }}>
                              {bullet.originalBullet}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--dim)", fontSize: 12, fontWeight: 600 }}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M6 1v10M1 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              AI improved version
                            </div>
                            <div style={{
                              fontSize: 13, color: "var(--green)",
                              borderLeft: "3px solid var(--green)", paddingLeft: 12,
                              lineHeight: 1.6,
                            }}>
                              {bullet.improvedBullet}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 6. Section Feedback */}
            {result.sectionFeedback.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Section Feedback
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {result.sectionFeedback.map((sf, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)", borderRadius: 12,
                      padding: "14px 16px", background: "var(--surface)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{sf.section}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(sf.score) }}>{sf.score}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "var(--surface2)", overflow: "hidden", marginBottom: 8 }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          width: `${sf.score}%`,
                          background: scoreColor(sf.score),
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>{sf.feedback}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 7. Rewrite Suggestions */}
            {result.rewriteSuggestions.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Suggested Rewrites
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {result.rewriteSuggestions.map((rw, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)", borderRadius: 12,
                      padding: "16px 18px", background: "var(--surface)",
                    }}>
                      <div style={{
                        fontSize: 13, color: "var(--muted)", fontStyle: "italic",
                        borderLeft: "3px solid var(--border)", paddingLeft: 12,
                        lineHeight: 1.6, marginBottom: 10,
                      }}>
                        {rw.before}
                      </div>
                      <div style={{
                        fontSize: 13, color: "var(--green)",
                        borderLeft: "3px solid var(--green)", paddingLeft: 12,
                        lineHeight: 1.6, marginBottom: 10,
                      }}>
                        {rw.after}
                      </div>
                      <div style={{
                        fontSize: 11, color: "var(--dim)", fontStyle: "italic",
                        paddingLeft: 15,
                      }}>
                        {rw.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 8. Final Recommendations */}
            {result.finalRecommendations.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Final Recommendations
                </h2>
                <div style={{
                  border: "1px solid var(--border)", borderRadius: 12,
                  padding: "18px 20px", background: "var(--surface2)",
                }}>
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.finalRecommendations.map((rec, i) => (
                      <li key={i} style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
                        {rec}
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            )}

          </div>
        )}
      </main>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={e => onFile(e.target.files?.[0])}
      />
    </div>
  );
}
