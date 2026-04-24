"use client";
import { useEffect, useState } from "react";
import type { ResumeRecord } from "@/lib/types";
import { fetchResumes } from "@/lib/supabase";
import { scoreColor } from "@/lib/utils";

interface Props {
  activeFolder: string | null;
  onSelect: (folder: string) => void;
}

export default function ResumeSidebar({ activeFolder, onSelect }: Props) {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [filter,  setFilter]  = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResumes()
      .then(setResumes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const scored   = resumes.filter(r => r.score != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length)
    : 0;
  const best = scored.length
    ? Math.max(...scored.map(r => r.score ?? 0))
    : 0;

  const filtered = resumes.filter(r =>
    !filter ||
    r.company.toLowerCase().includes(filter.toLowerCase()) ||
    r.role.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <aside className="rb-sidebar" style={{
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 14 }}>
          History
        </div>

        {/* Stats row */}
        {resumes.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
            {[
              { val: String(resumes.length), lbl: "Saved" },
              { val: avgScore ? String(avgScore) : "—", lbl: "Avg", color: avgScore ? scoreColor(avgScore) : undefined },
              { val: best ? String(best) : "—", lbl: "Best", color: best ? scoreColor(best) : undefined },
            ].map(s => (
              <div key={s.lbl} style={{
                background: "var(--surface2)", borderRadius: 8,
                padding: "9px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5, color: s.color ?? "var(--text)", lineHeight: 1 }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 3, letterSpacing: -0.1 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search…"
          style={{ background: "var(--surface2)", fontSize: 12 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 20px" }}>
        {loading ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <div style={{ width: 16, height: 16, border: "2px solid var(--surface2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "24px 8px", textAlign: "center" }}>
            {resumes.length === 0 ? (
              <>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5, letterSpacing: -0.1 }}>
                  No saved resumes yet.<br />Generate one to see it here.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--dim)" }}>No results for &quot;{filter}&quot;</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map(r => {
              const sc = r.score;
              const isActive = r.folder === activeFolder;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 6px 4px 10px", borderRadius: 8, width: "100%",
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    border: isActive ? "1px solid rgba(0,113,227,0.25)" : "1px solid transparent",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface2)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Main row — click to use as base */}
                  <button
                    onClick={() => onSelect(r.folder)}
                    title="Use as base for next generation"
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      flex: 1, minWidth: 0, padding: "5px 0",
                      background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    {/* Score badge */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: sc != null
                        ? (sc >= 75 ? "rgba(52,211,153,0.12)" : sc >= 55 ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)")
                        : "var(--surface3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {sc != null ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: -0.2,
                          color: sc >= 75 ? "var(--green)" : sc >= 55 ? "var(--yellow)" : "var(--red)",
                        }}>
                          {sc}
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, color: "var(--dim)" }}>—</span>
                      )}
                    </div>

                    {/* Label */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 500,
                        color: isActive ? "var(--accent)" : "var(--text)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        letterSpacing: -0.2,
                      }}>
                        {r.company}
                      </div>
                      <div style={{
                        fontSize: 11, color: "var(--dim)", letterSpacing: -0.1,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {r.role}
                      </div>
                    </div>
                  </button>

                  {/* Download PDF */}
                  {r.pdf_url ? (
                    <a
                      href={r.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      onClick={e => e.stopPropagation()}
                      title="Download tailored PDF"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        color: "var(--dim)", textDecoration: "none",
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--accent)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dim)"; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </a>
                  ) : (
                    <div
                      title="PDF not available (generated before Supabase Storage was wired up)"
                      style={{
                        width: 28, height: 28, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "rgba(255,255,255,0.14)",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {resumes.length > 0 && !loading && (
        <div style={{
          padding: "10px 16px", borderTop: "1px solid var(--border)", flexShrink: 0,
          fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, lineHeight: 1.5,
        }}>
          Click a row to use it as a base — or tap the ↓ icon to download.
        </div>
      )}
    </aside>
  );
}
