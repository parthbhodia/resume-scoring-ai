"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { ResumeRecord } from "@/lib/types";
import { apiUrl } from "@/lib/utils";
import { displayPdfUrlForResume } from "@/lib/displayResumePdfUrl";
import { getSupabaseClient, type LibraryItem } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ShareButton from "./ShareButton";
import ResumePublicLinkSettings from "./ResumePublicLinkSettings";

function scoreBand(score: number): "strong" | "mid" | "weak" {
  if (score >= 70) return "strong";
  if (score >= 55) return "mid";
  return "weak";
}

/** Map stored criterion score (typically 1–10) to a 0–100 style display. */
function criterionDisplayScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score <= 10 && score >= 0) return Math.round((score / 10) * 100);
  return Math.round(Math.min(100, Math.max(0, score)));
}

function templateLabelFromTexPath(tex: string | null | undefined): string {
  if (!tex?.trim()) return "—";
  const lower = tex.toLowerCase().replace(/\\/g, "/");
  if (lower.includes("harshibar")) return "Harshibar";
  if (lower.includes("malta-modern") || lower.includes("malta")) return "Malta Modern";
  if (lower.includes("ats-professional") || lower.includes("classic")) return "Classic Pro";
  const parts = tex.replace(/\\/g, "/").split("/").filter(Boolean);
  const seg = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "";
  if (!seg || seg.endsWith(".tex")) return "—";
  return seg.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function jobPostedLine(meta: ResumeRecord): string {
  const jd = meta.job_description?.trim();
  if (!jd) return `${meta.company || "Company"} careers`;
  const first = jd.split("\n")[0]?.trim() ?? "";
  if (/^https?:\/\//i.test(first)) {
    try {
      return new URL(first).hostname.replace(/^www\./, "");
    } catch {
      return first.slice(0, 48);
    }
  }
  return first.length > 56 ? `${first.slice(0, 53)}…` : first;
}

export default function LibraryResumeDetailPanel({
  item,
  loading,
  notFound,
  onClose,
  onTailorNewJob,
  onOpenAnalysis,
  onTailorAnalysis,
}: {
  item: LibraryItem | null;
  loading: boolean;
  notFound: boolean;
  onClose: () => void;
  onTailorNewJob: () => void;
  onOpenAnalysis: () => void;
  onTailorAnalysis: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const meta = item?.kind === "tailored" ? item.record : null;
  const analysis = item?.kind === "analyzed" ? item.analysis : null;
  const analysisJson = analysis?.result && typeof analysis.result === "object"
    ? analysis.result as Record<string, unknown>
    : {};

  const pdfUrl = useMemo(() => (meta ? displayPdfUrlForResume(meta) : null), [meta]);
  const pdfSrc = pdfUrl
    ? pdfUrl.startsWith("http")
      ? pdfUrl
      : apiUrl(pdfUrl.startsWith("/") ? pdfUrl : `/${pdfUrl}`)
    : null;

  const createdAt = item?.createdAt ?? null;
  const dateShort = createdAt
    ? new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const titleShort = item?.kind === "analyzed"
    ? item.title
    : meta
    ? `${meta.company}${meta.role ? ` · ${abbrevRole(meta.role)}` : ""}`
    : "";

  return (
    <aside
      className="library-detail-panel"
      style={{
        flexShrink: 0,
        width: "min(100%, 400px)",
        maxWidth: "100%",
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {item?.kind === "analyzed" ? "Analysis details" : "Résumé details"}
          </div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {loading ? "…" : notFound ? "Not found" : titleShort || "—"}
          </h2>
        </div>
        <Button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          variant="outline"
          size="icon"
          style={{
            flexShrink: 0,
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </Button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "18px 18px 24px" }}>
        {loading && (
          <Skeleton className="mb-4 h-40 rounded-lg" />
        )}

        {!loading && notFound && (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            This résumé is not in your library. It may have been removed or the link is outdated.
          </p>
        )}

        {!loading && !notFound && item?.kind === "analyzed" && analysis && (
          <AnalyzedDetails
            title={item.title}
            score={item.score}
            createdAt={dateShort}
            result={analysisJson}
            onOpenAnalysis={onOpenAnalysis}
            onTailorAnalysis={onTailorAnalysis}
          />
        )}

        {!loading && !notFound && item?.kind === "tailored" && meta && (
          <>
            {/* Thumbnail preview */}
            <div
              style={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                overflow: "hidden",
                background: "var(--surface2)",
                marginBottom: 18,
                height: 200,
                position: "relative",
              }}
            >
              {pdfSrc ? (
                <iframe
                  title={`Preview — ${meta.company}`}
                  src={pdfSrc}
                  style={{
                    width: "100%",
                    height: "680px",
                    border: "none",
                    transform: "scale(0.28)",
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--dim)",
                    fontSize: 13,
                  }}
                >
                  No PDF preview
                </div>
              )}
            </div>

            <div style={{ margin: "0 0 18px", display: "grid", gap: 12 }}>
              {meta.score != null && (
                <MetaRow label="Match score" value={`${meta.score}/100`} valueTone={scoreBand(meta.score)} />
              )}
              <MetaRow label="Template" value={templateLabelFromTexPath(meta.tex_path)} />
              <MetaRow label="Generated" value={dateShort} />
              <MetaRow label="Job posted" value={jobPostedLine(meta)} />
            </div>

            {meta.criteria && meta.criteria.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 10,
                  }}
                >
                  Score breakdown
                </div>
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                    overflow: "hidden",
                  }}
                >
                  {meta.criteria.map((c, i) => (
                    <div
                      key={`${c.name}-${i}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderTop: i ? "1px solid var(--border)" : "none",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>{c.name}</span>
                      <span style={{ fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
                        {criterionDisplayScore(c.score)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {pdfSrc ? (
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
                    padding: "11px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: "var(--radius-lg, 12px)",
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    textDecoration: "none",
                    fontFamily: "inherit",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Download PDF
                </a>
              ) : null}
              <Button
                type="button"
                onClick={onTailorNewJob}
                variant="outline"
                size="lg"
                style={{
                  width: "100%",
                }}
              >
                Tailor for a new job
              </Button>
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                <ShareButton folder={meta.folder} pdfUrl={pdfUrl} userId={user?.id ?? null} />
              </div>
            </div>

            <ResumePublicLinkSettings folder={meta.folder} userId={user?.id ?? null} />
          </>
        )}
      </div>
    </aside>
  );
}

function AnalyzedDetails({
  title,
  score,
  createdAt,
  result,
  onOpenAnalysis,
  onTailorAnalysis,
}: {
  title: string;
  score: number | null;
  createdAt: string;
  result: Record<string, unknown>;
  onOpenAnalysis: () => void;
  onTailorAnalysis: () => void;
}) {
  const topIssues = listFromJson(result.topIssues).slice(0, 3);
  const topStrengths = listFromJson(result.topStrengths).slice(0, 3);
  const categoryScores =
    result.categoryScores && typeof result.categoryScores === "object"
      ? result.categoryScores as Record<string, unknown>
      : {};
  const extractedText = typeof result.extractedText === "string" ? result.extractedText.trim() : "";
  const previewLines = extractedText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12);

  return (
    <>
      <div
        style={{
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Badge variant="secondary">Analyzed</Badge>
          {score != null && (
            <Badge variant={score >= 70 ? "secondary" : score >= 55 ? "outline" : "destructive"}>
              {score}/100
            </Badge>
          )}
        </div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{title}</h3>
        <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--muted)" }}>Saved {createdAt}</p>
      </div>

      {Object.keys(categoryScores).length > 0 && (
        <SectionBlock title="Category scores">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(categoryScores).slice(0, 8).map(([key, raw]) => {
              const n = typeof raw === "number" ? raw : Number(raw);
              return (
                <div key={key} style={{ borderRadius: 10, border: "1px solid var(--border)", padding: "8px 9px", background: "var(--surface2)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{categoryLabel(key)}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: Number.isFinite(n) ? scoreTone(n) : "var(--text)" }}>
                    {Number.isFinite(n) ? Math.round(n) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionBlock>
      )}

      {topIssues.length > 0 && (
        <SectionBlock title="Top issues">
          <div style={{ display: "grid", gap: 8 }}>
            {topIssues.map((issue, i) => (
              <div key={`${issue}-${i}`} style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.45, display: "flex", gap: 8 }}>
                <span style={{ color: "var(--amber)", fontWeight: 800 }}>•</span>
                <span>{issue}</span>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {topStrengths.length > 0 && (
        <SectionBlock title="Strengths">
          <div style={{ display: "grid", gap: 8 }}>
            {topStrengths.map((strength, i) => (
              <div key={`${strength}-${i}`} style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.45, display: "flex", gap: 8 }}>
                <span style={{ color: "var(--green)", fontWeight: 800 }}>•</span>
                <span>{strength}</span>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      <SectionBlock title="Live resume preview">
        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--resume-paper-bg, #fff)",
            color: "var(--resume-ink, #111827)",
            padding: "14px 16px",
            fontSize: 11,
            lineHeight: 1.45,
            maxHeight: 220,
            overflow: "hidden",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {previewLines.length ? previewLines.map((line, i) => (
            <p key={`${line}-${i}`} style={{ margin: i ? "5px 0 0" : 0 }}>{line}</p>
          )) : (
            <p style={{ margin: 0, color: "var(--muted)" }}>No extracted text snapshot stored for this analysis.</p>
          )}
        </div>
      </SectionBlock>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <Button type="button" onClick={onOpenAnalysis} size="lg" style={{ width: "100%" }}>
          Open analysis
        </Button>
        <Button type="button" onClick={onOpenAnalysis} variant="outline" size="lg" style={{ width: "100%" }}>
          Continue edits
        </Button>
        <Button type="button" onClick={onTailorAnalysis} variant="outline" size="lg" style={{ width: "100%" }}>
          Tailor to a job
        </Button>
        <Button type="button" onClick={onOpenAnalysis} variant="outline" size="lg" style={{ width: "100%" }}>
          Export PDF
        </Button>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        Export opens the saved analysis first because the PDF is rendered from the live Analyze preview.
      </p>
    </>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function listFromJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    const obj = item as Record<string, unknown>;
    for (const key of ["issue", "title", "description", "whyItMatters", "suggestion"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }).filter(Boolean);
}

function categoryLabel(key: string): string {
  const labels: Record<string, string> = {
    readability: "Readability",
    atsCompatibility: "ATS",
    jobMatch: "Job match",
    achievementQuality: "Achievement",
    quantification: "Metrics",
    sectionStructure: "Structure",
    languageQuality: "Language",
    technicalBranding: "Field signals",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}

function scoreTone(score: number): string {
  if (score >= 70) return "var(--green)";
  if (score >= 55) return "var(--amber)";
  return "var(--red)";
}

function abbrevRole(role: string): string {
  const t = role.trim();
  if (t.length <= 24) return t;
  const words = t.split(/\s+/);
  if (words.length >= 2 && words[0].length <= 12) {
    return `${words[0]} ${words[1]}`.length <= 26 ? `${words[0]} ${words[1]}` : words[0];
  }
  return `${t.slice(0, 21)}…`;
}

function MetaRow({
  label,
  value,
  valueTone,
}: {
  label: string;
  value: string;
  valueTone?: "strong" | "mid" | "weak";
}) {
  const color =
    valueTone === "strong" ? "var(--green)"
      : valueTone === "mid" ? "var(--amber)"
        : valueTone === "weak" ? "var(--red)"
          : "var(--text)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color, textAlign: "right", maxWidth: "62%", lineHeight: 1.35 }}>
        {value}
      </span>
    </div>
  );
}
