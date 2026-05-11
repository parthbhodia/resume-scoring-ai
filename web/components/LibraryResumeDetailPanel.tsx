"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ResumeRecord } from "@/lib/types";
import { apiUrl } from "@/lib/utils";
import { displayPdfUrlForResume } from "@/lib/displayResumePdfUrl";
import { getSupabaseClient } from "@/lib/supabase";
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
  meta,
  loading,
  notFound,
  onClose,
  onTailorNewJob,
}: {
  meta: ResumeRecord | null;
  loading: boolean;
  notFound: boolean;
  onClose: () => void;
  onTailorNewJob: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const pdfUrl = useMemo(() => (meta ? displayPdfUrlForResume(meta) : null), [meta]);
  const pdfSrc = pdfUrl
    ? pdfUrl.startsWith("http")
      ? pdfUrl
      : apiUrl(pdfUrl.startsWith("/") ? pdfUrl : `/${pdfUrl}`)
    : null;

  const dateShort = meta?.created_at
    ? new Date(meta.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const titleShort = meta
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
            Résumé details
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            flexShrink: 0,
            width: 34,
            height: 34,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "18px 18px 24px" }}>
        {loading && (
          <div className="skeleton" style={{ height: 160, borderRadius: 10, marginBottom: 16 }} />
        )}

        {!loading && notFound && (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            This résumé is not in your library. It may have been removed or the link is outdated.
          </p>
        )}

        {!loading && !notFound && meta && (
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
              <button
                type="button"
                onClick={onTailorNewJob}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  borderRadius: "var(--radius-lg, 12px)",
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Tailor for a new job
              </button>
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
