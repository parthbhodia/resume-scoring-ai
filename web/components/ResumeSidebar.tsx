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
  const [resumes, setResumes]   = useState<ResumeRecord[]>([]);
  const [filter,  setFilter]    = useState("");
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchResumes()
      .then(setResumes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const scored  = resumes.filter(r => r.score != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length)
    : 0;

  const filtered = resumes.filter(r =>
    r.folder.toLowerCase().includes(filter.toLowerCase()) ||
    r.company.toLowerCase().includes(filter.toLowerCase()) ||
    r.role.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <aside style={{
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      padding: "22px 16px",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>
      {/* Label */}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--dim)", marginBottom: 14 }}>
        Resume library
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { val: String(resumes.length), lbl: "Resumes" },
          { val: String(avgScore || "—"), lbl: "Avg score", color: avgScore ? scoreColor(avgScore) : undefined },
        ].map(s => (
          <div key={s.lbl} style={{ background: "var(--surface2)", borderRadius: "var(--radius)", padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", marginBottom: 14 }} />

      {/* Search */}
      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Search resumes…"
        style={{ marginBottom: 12, background: "var(--surface2)" }}
      />

      {/* List */}
      {loading ? (
        <div style={{ color: "var(--dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.map(r => {
            const sc = r.score;
            const isActive = r.folder === activeFolder;
            return (
              <div
                key={r.id}
                onClick={() => onSelect(r.folder)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 10px", borderRadius: 6, cursor: "pointer",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 12, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                  {r.folder}
                </span>
                {sc != null && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                    background: sc >= 75 ? "var(--green-bg)" : sc >= 55 ? "var(--yellow-bg)" : "var(--red-bg)",
                    color:      sc >= 75 ? "var(--green)"    : sc >= 55 ? "var(--yellow)"    : "var(--red)",
                  }}>
                    {sc}
                  </span>
                )}
              </div>
            );
          })}
          {!filtered.length && (
            <div style={{ color: "var(--dim)", fontSize: 12, textAlign: "center", padding: "12px 0" }}>
              No resumes yet
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
