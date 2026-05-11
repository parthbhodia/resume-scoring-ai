"use client";

/**
 * ResumeLibrary — grid of saved résumés (product design: Library view).
 *
 * - 2–3 columns desktop, 1 column mobile; score badge by threshold; paper-style preview.
 * - Hover (desktop): overlay with View + Use as base; touch: actions always visible.
 * - Card click → full detail (?view=library&resume=<folder>).
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { stashTailorPrefillFromLibrary } from "@/lib/tailorPrefill";
import type { ResumeRecord } from "@/lib/types";
import { fetchResumes } from "@/lib/supabase";

type SortKey = "recent" | "score" | "company";

/** Aligns with Analyze bullet bands: strong ≥70, improvable 55–69, weak &lt;55 */
function matchScoreBand(score: number): "strong" | "mid" | "weak" {
  if (score >= 70) return "strong";
  if (score >= 55) return "mid";
  return "weak";
}

export default function ResumeLibrary({ onUseAsBase }: {
  onUseAsBase?: (folder: string) => void;
}) {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    fetchResumes().then(setResumes).catch(console.error).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const scored = resumes.filter(r => r.score != null);
    return {
      total: resumes.length,
      scoredCount: scored.length,
      avg: scored.length ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length) : 0,
      best: scored.length ? Math.max(...scored.map(r => r.score ?? 0)) : 0,
    };
  }, [resumes]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let arr = resumes.filter(r =>
      !f || r.company.toLowerCase().includes(f) || r.role.toLowerCase().includes(f),
    );
    if (sort === "recent") {
      arr = [...arr].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    } else if (sort === "score") {
      arr = [...arr].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    } else {
      arr = [...arr].sort((a, b) => a.company.localeCompare(b.company));
    }
    return arr;
  }, [resumes, filter, sort]);

  const openResume = (folder: string) => {
    router.push(`/?view=library&resume=${encodeURIComponent(folder)}`);
  };

  const useAsBase = (r: ResumeRecord) => {
    onUseAsBase?.(r.folder);
    stashTailorPrefillFromLibrary(r);
    router.push(`/?view=builder&flow=tailor&base=${encodeURIComponent(r.folder)}`);
  };

  return (
    <div
      className="library-page fade-in"
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        padding: "24px 20px 32px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
          gap: 16px;
        }
        @media (min-width: 1024px) {
          .library-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .library-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .library-card {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl, 14px);
          box-shadow: var(--shadow-card, 0 1px 4px rgba(0,0,0,0.08));
          overflow: hidden;
          cursor: pointer;
          transition: border-color 0.14s ease, box-shadow 0.14s ease, transform 0.1s ease;
          display: flex;
          flex-direction: column;
          min-height: 280px;
        }
        .library-card:hover {
          border-color: rgba(47, 129, 247, 0.35);
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
        }
        [data-theme="dark"] .library-card:hover {
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        }
        .library-card:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .library-card-preview {
          flex-shrink: 0;
          aspect-ratio: 8.5 / 11;
          max-height: 148px;
          background: linear-gradient(180deg, var(--resume-paper-bg, #fff) 0%, var(--surface2) 100%);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        [data-theme="dark"] .library-card-preview {
          background: linear-gradient(180deg, #1e293b 0%, var(--surface2) 100%);
        }
        .library-card-body { padding: 14px 16px 16px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .library-card-actions {
          display: flex;
          gap: 8px;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        @media (min-width: 768px) {
          .library-card-actions--hover {
            position: absolute;
            left: 0; right: 0; bottom: 0;
            z-index: 2;
            padding: 14px 16px 16px;
            background: linear-gradient(to top, var(--surface) 72%, rgba(255,255,255,0) 100%);
            border-top: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.12s ease, transform 0.12s ease;
          }
          [data-theme="dark"] .library-card-actions--hover {
            background: linear-gradient(to top, var(--surface) 72%, rgba(22,27,34,0) 100%);
          }
          .library-card:hover .library-card-actions--hover {
            opacity: 1;
            transform: translateY(0);
          }
          .library-card .library-card-actions--static { display: none; }
        }
        @media (max-width: 767px) {
          .library-card-actions--hover { display: none !important; }
          .library-card .library-card-actions--static { display: flex; }
        }
        @media (min-width: 768px) {
          .library-stats-row { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>

      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text)",
            marginBottom: 6,
            lineHeight: 1.15,
          }}
        >
          Library
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", letterSpacing: "-0.02em", lineHeight: 1.55, maxWidth: 520 }}>
          Saved résumés and tailored versions. Open any card for the full viewer, or use one as the starting point for a new job.
        </p>
      </header>

      {!loading && resumes.length > 0 && (
        <div
          className="fade-in-up library-stats-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <Stat label="Saved" value={String(stats.total)} tone="none" />
          <Stat
            label="Avg match"
            value={stats.scoredCount ? String(stats.avg) : "—"}
            tone={stats.scoredCount ? matchScoreBand(stats.avg) : "none"}
          />
          <Stat
            label="Best match"
            value={stats.scoredCount ? String(stats.best) : "—"}
            tone={stats.scoredCount ? matchScoreBand(stats.best) : "none"}
          />
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, alignItems: "center" }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search company or role…"
          aria-label="Filter resumes"
          style={{ flex: "1 1 220px", minWidth: 0 }}
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          aria-label="Sort resumes"
          style={{ width: "auto", minWidth: 150, flexShrink: 0 }}
        >
          <option value="recent">Most recent</option>
          <option value="score">Highest match</option>
          <option value="company">Company A–Z</option>
        </select>
      </div>

      {loading ? (
        <div className="library-grid" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`skeleton stagger-${Math.min(i + 1, 4)}`}
              style={{ height: 300, borderRadius: "var(--radius-xl, 14px)" }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyLibrary hasAny={resumes.length > 0} filter={filter} onGoBuilder={() => router.push("/?view=builder&flow=tailor")} />
      ) : (
        <div className="library-grid">
          {filtered.map((r, i) => (
            <ResumeCard
              key={r.id}
              record={r}
              stagger={Math.min(i % 5, 4)}
              onOpen={() => openResume(r.folder)}
              onUseAsBase={() => useAsBase(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyLibrary({
  hasAny,
  filter,
  onGoBuilder,
}: {
  hasAny: boolean;
  filter: string;
  onGoBuilder: () => void;
}) {
  return (
    <div
      className="scale-in fade-in-up"
      style={{
        padding: "48px 28px",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-xl, 14px)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1 }} aria-hidden>📋</div>
      <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 8 }}>
        {hasAny ? "No matches" : "No résumés yet"}
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px" }}>
        {hasAny
          ? `Nothing matches “${filter}”. Try another search or clear the filter.`
          : "Tailor a résumé to a job posting — we’ll save each version here with match scores so you can compare and reuse."}
      </p>
      {!hasAny && (
        <button
          type="button"
          onClick={onGoBuilder}
          style={{
            padding: "11px 22px",
            borderRadius: "var(--radius-lg, 12px)",
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "-0.02em",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Open Résumé Builder
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "strong" | "mid" | "weak" | "none" }) {
  const color =
    tone === "strong" ? "var(--green)"
      : tone === "mid" ? "var(--amber)"
        : tone === "weak" ? "var(--red)"
          : "var(--text)";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "12px 14px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", color, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function ResumeCard({
  record,
  stagger,
  onOpen,
  onUseAsBase,
}: {
  record: ResumeRecord;
  stagger: number;
  onOpen: () => void;
  onUseAsBase: () => void;
}) {
  const sc = record.score;
  const dateStr = record.created_at
    ? new Date(record.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const band = sc != null ? matchScoreBand(sc) : null;

  const scoreBadge =
    sc != null ? (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 10px",
          borderRadius: "var(--radius-pill, 99px)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          background:
            band === "strong" ? "var(--green-bg)"
              : band === "mid" ? "var(--amber-bg)"
                : "var(--red-bg)",
          color: band === "strong" ? "var(--green)" : band === "mid" ? "var(--amber)" : "var(--red)",
        }}
      >
        {sc} match
      </span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>No score</span>
    );

  const actions = (className: string) => (
    <div className={className} style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onOpen();
        }}
        style={actionBtnPrimary}
      >
        View
      </button>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onUseAsBase();
        }}
        title="Start the builder with this version as the base"
        style={actionBtnGhost}
      >
        Use as base
      </button>
      {record.pdf_url && (
        <a
          href={record.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Download PDF"
          style={{ ...actionBtnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          PDF
        </a>
      )}
    </div>
  );

  return (
    <article
      role="button"
      tabIndex={0}
      className={`library-card fade-in-up stagger-${stagger + 1}`}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${record.company}, ${record.role}. Open resume.`}
    >
      <div className="library-card-preview">
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 12,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.4 }}>
            <path d="M7 3h8l4 4v14H7V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {record.pdf_url ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "4px 10px",
                borderRadius: "var(--radius-pill, 99px)",
                background: "var(--accent-bg)",
              }}
            >
              PDF ready
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              No PDF yet
            </span>
          )}
        </div>
      </div>

      <div className="library-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          {scoreBadge}
          <time dateTime={record.created_at} style={{ fontSize: 11, color: "var(--dim)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {dateStr}
          </time>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              lineHeight: 1.25,
              marginBottom: 4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {record.company}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              letterSpacing: "-0.02em",
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {record.role}
          </p>
        </div>

        {actions("library-card-actions library-card-actions--static")}
      </div>

      {actions("library-card-actions library-card-actions--hover")}
    </article>
  );
}

const actionBtnPrimary: CSSProperties = {
  flex: 1,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: "var(--radius, 8px)",
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.02em",
};

const actionBtnGhost: CSSProperties = {
  flex: 1,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: "var(--radius, 8px)",
  border: "1px solid var(--border)",
  background: "var(--surface2)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.02em",
};
