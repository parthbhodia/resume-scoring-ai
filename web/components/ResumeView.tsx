"use client";

/**
 * Legacy full-page library detail (metadata + PDF). The main app now uses
 * `ResumeLibrary` + `LibraryResumeDetailPanel` for `?view=library&resume=…`.
 * Kept for reference or future routes.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { ResumeRecord } from "@/lib/types";
import { apiUrl } from "@/lib/utils";
import { displayPdfUrlForResume } from "@/lib/displayResumePdfUrl";
import { fetchResumes, getSupabaseClient } from "@/lib/supabase";
import ShareButton from "./ShareButton";
import { stashTailorPrefillFromLibrary } from "@/lib/tailorPrefill";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";

type Tab = "pdf" | "edit" | "ats" | "analysis";

interface ResumeAnalysisResult {
  overall: { score: number; summary: string };
  sections: Array<{ name: string; score: number; summary: string }>;
  tips: Array<{ severity: "urgent" | "critical" | "optional"; title: string; detail: string }>;
  counts: { urgent: number; critical: number; optional: number };
}

export default function ResumeView({ folder }: { folder: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<ResumeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [activeTab,  setActiveTab]  = useState<Tab>("pdf");
  const [atsJd,      setAtsJd]      = useState("");
  const [atsResult,  setAtsResult]  = useState<AtsResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError,   setAtsError]   = useState<string | null>(null);
  const [doctorIssues, setDoctorIssues] = useState<Record<string, { id: string; severity: "warn" | "info"; msg: string }[]>>({});
  const [analysis, setAnalysis] = useState<ResumeAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisAt, setAnalysisAt] = useState<number | null>(null);

  // Pull current user
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeta(null);
    setPdfUrl(null);

    fetchResumes()
      .then((rows) => {
        if (cancelled) return;
        const m = rows.find((r) => r.folder === folder) ?? null;
        setMeta(m);
        setPdfUrl(m ? displayPdfUrlForResume(m) : null);
        if (!m) setError("This résumé wasn’t found in your library.");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your library.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folder]);

  const useAsBase = () => {
    if (meta) stashTailorPrefillFromLibrary(meta);
    try {
      sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
    } catch { /* ignore */ }
    router.push(`/?view=builder&flow=tailor&base=${encodeURIComponent(folder)}&intent=job`);
  };

  const pdfSrc = pdfUrl
    ? pdfUrl.startsWith("http")
      ? pdfUrl
      : apiUrl(pdfUrl.startsWith("/") ? pdfUrl : `/${pdfUrl}`)
    : null;

  const dateStr = meta?.created_at
    ? new Date(meta.created_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const sc = meta?.score;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
    }}>
      {/* Top bar */}
      <div style={{
        padding: "16px 28px",
        display: "flex", alignItems: "center", gap: 14,
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => router.push("/?view=library")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            padding: "7px 12px",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius, 8px)",
            color: "var(--text)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <path d="M7 2L3 5.5L7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Library
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}>
            Resume
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5, color: "var(--text)", marginTop: 2 }}>
            {meta?.company ?? "—"}{meta?.role ? <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {meta.role}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <button
            onClick={runAnalysis}
            disabled={analysisLoading || !tree}
            style={{
              fontSize: 12, padding: "8px 14px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text)", cursor: analysisLoading ? "wait" : "pointer", fontFamily: "inherit",
              fontWeight: 500, opacity: analysisLoading || !tree ? 0.65 : 1,
            }}
          >{analysisLoading ? "Analyzing..." : "Analyze"}</button>
          <button
            onClick={useAsBase}
            title="Start a new generation using this resume as the base"
            style={{
              fontSize: 12, padding: "8px 14px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
              fontWeight: 500, letterSpacing: -0.1,
            }}
          >Use as base</button>
          {meta?.folder && <ShareButton folder={meta.folder} pdfUrl={pdfUrl} userId={user?.id ?? null} />}
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, padding: "8px 14px",
                background: "var(--accent)", color: "#fff",
                borderRadius: 8, textDecoration: "none", letterSpacing: -0.1,
                fontWeight: 600,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11h9" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        padding: "8px 28px 0",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex", gap: 0,
      }}>
        {([...(pdfUrl ? ["pdf"] : []), "edit", "ats", "analysis"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => {
              setActiveTab(t);
              if (t === "ats" && !atsResult && !atsLoading) runAts();
            }}
            style={{
              padding: "9px 20px", fontSize: 12,
              fontWeight: activeTab === t ? 600 : 400,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === t ? "var(--accent)" : "var(--dim)",
              cursor: "pointer", fontFamily: "inherit",
              letterSpacing: -0.2,
              transition: "color 0.15s, border-color 0.15s",
              marginBottom: -1,
            }}
          >
            {t === "pdf"
              ? "PDF"
              : t === "edit"
                ? "Edit"
                : t === "ats"
                  ? (atsResult ? `ATS  ${atsResult.score}` : "ATS check")
                  : (analysis ? `Analysis  ${analysis.overall.score}/10` : "Analysis")}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)", fontSize: 13 }}>
          Loading resume…
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 32, textAlign: "center", color: "var(--red)", fontSize: 14 }}>{error}</div>
      )}

      {/* PDF tab — full-height iframe preview */}
      {activeTab === "pdf" && pdfUrl && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <iframe
            src={pdfUrl}
            title="Resume PDF"
            style={{ flex: 1, border: "none", background: "#f5f5f5", minHeight: "70vh" }}
          />
        </div>
      )}

      {!loading && !error && tree && activeTab === "edit" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px 48px" }}>
          <ResumeEditor
            initial={tree}
            folder={folder}
            saving={saving}
            saveError={saveErr}
            onSave={onSave}
            onAIEdit={onAIEdit}
            doctorIssues={doctorIssues}
            pdfUrl={pdfUrl}
          />
        </div>
      )}

      {!loading && !error && tree && activeTab === "ats" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
              Job description (optional)
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8, letterSpacing: -0.1 }}>
              Paste the JD to get keyword-coverage analysis on top of the structural ATS checks.
            </div>
            <textarea
              value={atsJd}
              onChange={e => setAtsJd(e.target.value)}
              placeholder="Paste the job description here to score keyword coverage…"
              rows={4}
              style={{
                width: "100%", fontSize: 12, padding: "8px 10px",
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 7, color: "var(--text)", fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <button
              onClick={runAts}
              disabled={atsLoading}
              style={{
                marginTop: 8, fontSize: 12, padding: "7px 14px",
                background: "var(--accent)", color: "#fff",
                border: "none", borderRadius: 7,
                cursor: atsLoading ? "wait" : "pointer", fontFamily: "inherit",
                fontWeight: 600, letterSpacing: -0.1,
              }}
            >{atsLoading ? "Re-checking…" : atsResult ? "Re-run ATS check" : "Run ATS check"}</button>
          </div>

          {atsLoading && (
            <div style={{ padding: 28, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
              Running ATS check…
            </div>
          )}
          {atsError && !atsLoading && (
            <div style={{ padding: 16, color: "var(--red)", fontSize: 12 }}>{atsError}</div>
          )}
          {atsResult && !atsLoading && (
            <AtsPanel result={atsResult} rechecking={atsLoading} onRecheck={runAts} />
          )}
        </div>
        </div>
      )}

      {!loading && !error && tree && activeTab === "analysis" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!analysis && !analysisLoading && !analysisError && (
            <div style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", color: "var(--dim)", fontSize: 13 }}>
              Click <strong style={{ color: "var(--text)" }}>Analyze resume</strong> to generate section scores and prioritized fixes.
            </div>
          )}
          {analysisError && (
            <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, color: "var(--red)", fontSize: 12, background: "var(--surface)" }}>
              Couldn&apos;t analyze resume: {analysisError}
            </div>
          )}
          {analysis && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
                <div style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", marginBottom: 5 }}>Overall</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{analysis.overall.score}/10</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>{analysis.overall.summary}</div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>
                  {analysis.counts.urgent} urgent · {analysis.counts.critical} critical · {analysis.counts.optional} optional fixes
                  {analysisAt ? ` · analyzed ${new Date(analysisAt).toLocaleTimeString()}` : ""}
                </div>
              </div>
            )}

            {meta.verdict && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 8,
                  }}
                >
                  Verdict
                </div>
                <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55, margin: 0 }}>{meta.verdict}</p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={useAsBase}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  borderRadius: "var(--radius-lg, 12px)",
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Tailor again
              </button>
              {pdfSrc && (
                <a
                  href={pdfSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: "var(--radius-lg, 12px)",
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                    color: "var(--text)",
                    textDecoration: "none",
                    fontFamily: "inherit",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path
                      d="M6.5 2v7M3.5 6.5l3 3 3-3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Download PDF
                </a>
              )}
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                <ShareButton folder={meta.folder} pdfUrl={pdfUrl} userId={user?.id ?? null} />
              </div>
            </div>
          </aside>

          {/* Right: PDF (sidebar / main preview per mockup) */}
          <section
            className="rv-pdf-wrap"
            style={{
              flex: 1,
              minHeight: 0,
              background: "var(--surface2)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            {pdfSrc ? (
              <iframe
                title={`PDF — ${meta.company}`}
                src={pdfSrc}
                style={{
                  flex: 1,
                  width: "100%",
                  minHeight: "min(720px, 85vh)",
                  border: "none",
                  background: "#525659",
                }}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 40,
                  textAlign: "center",
                  color: "var(--muted)",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 40, opacity: 0.5 }} aria-hidden>📄</div>
                <p style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 320, margin: 0 }}>
                  No PDF is stored for this version. Use <strong style={{ color: "var(--text)" }}>Tailor again</strong> to
                  regenerate from the builder.
                </p>
              </div>
            )}
          </section>
        </div>
        </div>
      )}
    </div>
  );
}
