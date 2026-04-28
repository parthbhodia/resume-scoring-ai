"use client";

/**
 * ResumeLibrary — full-page grid view of every saved resume.
 *
 * Phase B of the app-shell rebuild — replaces the sidebar's "click to use as
 * base" flow with a Jobright-style detail view. From here:
 *   - Click a card → opens the resume in ResumeView (?view=library&resume=<folder>)
 *   - Right-side actions: Use as base · Download · Share (for items with PDF)
 *
 * Filtering + sorting happen client-side; the dataset is small (single-user app).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResumeRecord } from "@/lib/types";
import { fetchResumes } from "@/lib/supabase";
import { scoreColor } from "@/lib/utils";

type SortKey = "recent" | "score" | "company";

export default function ResumeLibrary({ onUseAsBase }: {
  /** Optional callback — if provided, the "Use as base" button will switch to
   *  the builder view with this folder pre-loaded. */
  onUseAsBase?: (folder: string) => void;
}) {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("");
  const [sort,    setSort]    = useState<SortKey>("recent");

  useEffect(() => {
    fetchResumes().then(setResumes).catch(console.error).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const scored = resumes.filter(r => r.score != null);
    return {
      total: resumes.length,
      avg:   scored.length ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length) : 0,
      best:  scored.length ? Math.max(...scored.map(r => r.score ?? 0)) : 0,
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
    } else if (sort === "company") {
      arr = [...arr].sort((a, b) => a.company.localeCompare(b.company));
    }
    return arr;
  }, [resumes, filter, sort]);

  const openResume = (folder: string) => {
    router.push(`/?view=library&resume=${encodeURIComponent(folder)}`);
  };

  const useAsBase = (folder: string) => {
    if (onUseAsBase) onUseAsBase(folder);
    router.push(`/?base=${encodeURIComponent(folder)}`);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px" }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, marginBottom: 4 }}>
          My Resumes
        </h1>
        <p style={{ fontSize: 13, color: "var(--dim)", letterSpacing: -0.1 }}>
          Every resume you&apos;ve generated. Click any card to open the editor + PDF preview.
        </p>
      </div>

      {/* Stats strip */}
      {!loading && resumes.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18,
        }}>
          <Stat label="Total saved" value={String(stats.total)} />
          <Stat label="Average score" value={stats.avg ? String(stats.avg) : "—"} color={stats.avg ? scoreColor(stats.avg) : undefined} />
          <Stat label="Best score" value={stats.best ? String(stats.best) : "—"} color={stats.best ? scoreColor(stats.best) : undefined} />
        </div>
      )}

      {/* Filter + sort */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search company or role…"
          style={{
            flex: 1, fontSize: 13, padding: "9px 12px",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 9, color: "var(--text)", fontFamily: "inherit",
          }}
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          style={{
            fontSize: 12.5, padding: "9px 12px",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 9, color: "var(--text)", fontFamily: "inherit", cursor: "pointer",
          }}
        >
          <option value="recent">Most recent</option>
          <option value="score">Highest score</option>
          <option value="company">Company A→Z</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--dim)" }}>
          <div style={{
            width: 22, height: 22, margin: "0 auto 12px",
            border: "2px solid var(--surface2)", borderTopColor: "var(--accent)",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 12 }}>Loading saved resumes…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: "56px 24px", textAlign: "center",
          background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
          <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 6, letterSpacing: -0.2 }}>
            {resumes.length === 0 ? "No resumes yet" : `No results for "${filter}"`}
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            {resumes.length === 0
              ? <>Head to the <button onClick={() => router.push("/")} style={linkBtnStyle}>Resume Builder</button> to create one.</>
              : "Try a different search."}
          </div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}>
          {filtered.map(r => (
            <ResumeCard
              key={r.id}
              record={r}
              onOpen={() => openResume(r.folder)}
              onUseAsBase={() => useAsBase(r.folder)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", padding: 0,
  color: "var(--accent)", cursor: "pointer", fontFamily: "inherit",
  fontSize: 12, textDecoration: "underline",
};

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: color ?? "var(--text)", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4, letterSpacing: -0.1 }}>{label}</div>
    </div>
  );
}

function ResumeCard({ record, onOpen, onUseAsBase }: {
  record: ResumeRecord;
  onOpen: () => void;
  onUseAsBase: () => void;
}) {
  const sc = record.score;
  const dateStr = record.created_at
    ? new Date(record.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div
      onClick={onOpen}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 16, cursor: "pointer",
        display: "flex", flexDirection: "column", gap: 10,
        transition: "border-color 0.12s, transform 0.08s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,113,227,0.35)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      {/* Top row — score + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {sc != null ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: 999,
            background: sc >= 75 ? "rgba(52,211,153,0.13)" : sc >= 55 ? "rgba(251,191,36,0.13)" : "rgba(248,113,113,0.13)",
            color: sc >= 75 ? "var(--green)" : sc >= 55 ? "var(--yellow, #fbbf24)" : "var(--red)",
            fontSize: 11, fontWeight: 700, letterSpacing: -0.2,
          }}>
            {sc} match
          </div>
        ) : <span />}
        <span style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1 }}>{dateStr}</span>
      </div>

      {/* Company + role */}
      <div style={{ minHeight: 52 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: -0.3, marginBottom: 3 }}>
          {record.company}
        </div>
        <div style={{
          fontSize: 12, color: "var(--muted)", letterSpacing: -0.1, lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {record.role}
        </div>
      </div>

      {/* Footer actions */}
      <div style={{
        display: "flex", gap: 6, marginTop: 4, paddingTop: 10,
        borderTop: "1px solid var(--border)",
      }}>
        <button
          onClick={e => { e.stopPropagation(); onOpen(); }}
          style={cardActionStyle(true)}
        >Open</button>
        <button
          onClick={e => { e.stopPropagation(); onUseAsBase(); }}
          title="Use as the base for the next generation"
          style={cardActionStyle(false)}
        >Use as base</button>
        {record.pdf_url && (
          <a
            href={record.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Download PDF"
            style={{
              ...cardActionStyle(false),
              padding: "6px 9px",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

function cardActionStyle(primary: boolean): React.CSSProperties {
  return {
    flex: primary ? 1 : "initial",
    fontSize: 11.5, padding: "6px 12px",
    background: primary ? "var(--accent)" : "var(--surface2)",
    color: primary ? "#fff" : "var(--text)",
    border: primary ? "none" : "1px solid var(--border)",
    borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
    fontWeight: primary ? 600 : 500, letterSpacing: -0.1,
    transition: "background 0.1s",
  };
}
