"use client";

/**
 * ResumeView — Library detail: read-only metadata + PDF (product mockup).
 * No bullet editor, ATS, or analysis tabs — PDF opens beside metadata (iframe).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { ResumeRecord } from "@/lib/types";
import { apiUrl } from "@/lib/utils";
import { fetchResumes, getSupabaseClient } from "@/lib/supabase";
import ShareButton from "./ShareButton";
import { stashTailorPrefillFromLibrary } from "@/lib/tailorPrefill";

function scoreBand(score: number): "strong" | "mid" | "weak" {
  if (score >= 70) return "strong";
  if (score >= 55) return "mid";
  return "weak";
}

export default function ResumeView({ folder }: { folder: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<ResumeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

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
        setPdfUrl(m?.pdf_url ?? null);
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
    router.push(`/?view=builder&flow=tailor&base=${encodeURIComponent(folder)}`);
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
    <div
      className="rv-library-detail"
      style={{
        flex: "1 1 0%",
        width: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <style>{`
        .rv-grid {
          flex: 1 1 0%;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(280px, 380px) 1fr;
          gap: 0;
          align-items: stretch;
        }
        @media (max-width: 900px) {
          .rv-grid { grid-template-columns: 1fr; }
          .rv-pdf-wrap { min-height: 62vh !important; border-left: none !important; border-top: 1px solid var(--border); }
        }
      `}</style>

      {/* Top bar */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
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
          <div
            style={{
              fontSize: 10,
              color: "var(--dim)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Saved résumé
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meta?.company ?? (loading ? "…" : "—")}
            {meta?.role ? (
              <span style={{ color: "var(--muted)", fontWeight: 500 }}> · {meta.role}</span>
            ) : null}
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}>
          <div className="skeleton" style={{ width: "min(400px, 90%)", height: 200, borderRadius: "var(--radius-lg)" }} />
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 32, textAlign: "center", color: "var(--red)", fontSize: 14 }}>{error}</div>
      )}

      {!loading && !error && meta && (
        <div className="rv-grid" style={{ flex: "1 1 0%", minHeight: 0, overflow: "hidden" }}>
          {/* Left: metadata (mockup) */}
          <aside
            style={{
              padding: "24px 22px 28px",
              borderRight: "1px solid var(--border)",
              background: "var(--surface)",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {dateStr && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16, letterSpacing: "-0.02em" }}>
                Generated{" "}
                <time dateTime={meta.created_at} style={{ color: "var(--text)", fontWeight: 600 }}>
                  {dateStr}
                </time>
              </div>
            )}

            {sc != null && (
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
                  Match score
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: 6,
                    padding: "10px 14px",
                    borderRadius: "var(--radius-lg, 12px)",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: "-0.04em",
                      color:
                        scoreBand(sc) === "strong"
                          ? "var(--green)"
                          : scoreBand(sc) === "mid"
                            ? "var(--amber)"
                            : "var(--red)",
                    }}
                  >
                    {sc}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>/100</span>
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
      )}
    </div>
  );
}
