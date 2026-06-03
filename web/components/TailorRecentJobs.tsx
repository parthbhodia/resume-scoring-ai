"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchResumes } from "@/lib/supabase";
import type { ResumeRecord } from "@/lib/types";
import { TAILOR_PREFILL_JD, TAILOR_PREFILL_COMPANY, TAILOR_PREFILL_ROLE } from "@/lib/tailorPrefill";
import { RESUME_LIBRARY_CHANGED_EVENT } from "@/lib/resumeLibraryEvents";
import { scoreColor } from "./ratings/scoreColor";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

type Props = {
  /** Current JD/company/role values — used to detect if a history item is already active. */
  currentFolder?: string | null;
  /** Called after navigation so parent knows the user is picking up from history. */
  onPick?: () => void;
};

export default function TailorRecentJobs({ currentFolder, onPick }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ResumeRecord[] | null>(null);

  const loadRecent = () => {
    fetchResumes()
      .then((rs) => {
        const filtered = rs
          .filter((r) => r.job_description?.trim() && (r.company?.trim() || r.role?.trim()))
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
          .slice(0, 10);
        setItems(filtered);
      })
      .catch(() => setItems([]));
  };

  useEffect(() => {
    loadRecent();
    const onLibraryChanged = () => loadRecent();
    window.addEventListener(RESUME_LIBRARY_CHANGED_EVENT, onLibraryChanged);
    return () => window.removeEventListener(RESUME_LIBRARY_CHANGED_EVENT, onLibraryChanged);
  }, []);

  if (!items || items.length === 0) return null;

  function pickJob(r: ResumeRecord) {
    try {
      if (r.job_description) sessionStorage.setItem(TAILOR_PREFILL_JD, r.job_description);
      if (r.company) sessionStorage.setItem(TAILOR_PREFILL_COMPANY, r.company);
      if (r.role) sessionStorage.setItem(TAILOR_PREFILL_ROLE, r.role);
      // Restore profile text if available in resume_doc
      const profile =
        typeof r.resume_doc?.profile === "string" ? r.resume_doc.profile : null;
      if (profile) sessionStorage.setItem("rn_builder_profile_prefill", profile);
    } catch { /* ignore */ }

    onPick?.();
    const url = `/?view=builder&flow=tailor&intent=job${r.folder ? `&base=${encodeURIComponent(r.folder)}` : ""}`;
    router.push(url);
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "var(--dim)",
        textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8,
      }}>
        Recent jobs
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          /* ~3 job cards visible, scroll for the rest (matches Analyze past-runs strip). */
          maxHeight: 178,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          paddingRight: 2,
        }}
      >
        {items.map((r) => {
          const isActive = currentFolder && r.folder === currentFolder;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => pickJob(r)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                background: isActive ? "var(--accent-bg)" : "var(--surface2)",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = "var(--border-h)";
                  e.currentTarget.style.background = "var(--surface3)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "var(--surface2)";
                }
              }}
            >
              {/* Score badge */}
              {r.score != null && (
                <span style={{
                  fontSize: 11, fontWeight: 800, lineHeight: 1,
                  color: scoreColor(r.score),
                  flexShrink: 0, width: 26, textAlign: "right",
                }}>
                  {r.score}
                </span>
              )}
              {/* Company + role */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: "var(--text)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {r.role || "—"}{r.company ? ` · ${r.company}` : ""}
                </div>
                {r.job_description && (
                  <div style={{
                    fontSize: 10.5, color: "var(--dim)", marginTop: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {r.job_description.trim().slice(0, 80)}
                  </div>
                )}
              </div>
              {/* Date */}
              <span style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0 }}>
                {timeAgo(r.created_at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
