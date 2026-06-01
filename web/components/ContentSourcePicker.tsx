"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorBanner } from "@/components/ApiErrorBanner";
import { apiErrorFromUnknown } from "@/lib/userFriendlyError";
import { apiUrl, isResumeUploadFile, parseJsonOrThrow } from "@/lib/utils";
import { fetchResumes } from "@/lib/supabase";
import type { ResumeRecord } from "@/lib/types";

const PROFILE_KEY = "rn_builder_profile_prefill";
const STYLE_REF_KEY = "rn_builder_style_ref";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

/* ── Upload card state ──────────────────────────────────────────────── */

/** PDF / Word → `/api/upload-resume`; reusable from Template Studio without leaving the page. */
export function UploadResumePdfPanel({ onDone }: { onDone: (profileText: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!isResumeUploadFile(file)) { setError("Please upload a PDF or Word (.doc/.docx) file."); return; }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: fd });
      const json = await parseJsonOrThrow<{ error?: string; text?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "Upload failed");
      onDone(json.text ?? "");
    } catch (e: unknown) {
      setError(apiErrorFromUnknown(e));
    } finally {
      setUploading(false);
    }
  }, [onDone]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && fileRef.current?.click()}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "32px 20px",
          textAlign: "center",
          cursor: uploading ? "not-allowed" : "pointer",
          background: dragging ? "var(--accent-bg)" : "var(--bg)",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        {uploading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <SpinnerIcon />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Parsing your resume…</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--accent-bg)" />
              <path d="M16 10v12M10 16l6-6 6 6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Drop your PDF here</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>or click to browse</span>
          </div>
        )}
      </div>
      <ApiErrorBanner error={error} onDismiss={() => setError(null)} style={{ marginBottom: 0 }} />
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

/* ── History option ─────────────────────────────────────────────────── */

function HistoryOption({ onSelectFolder }: { onSelectFolder: (folder: string) => void }) {
  const [resumes, setResumes] = useState<ResumeRecord[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResumes().then(r => { setResumes(r); setLoading(false); }).catch(() => { setResumes([]); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
        <SpinnerIcon />
      </div>
    );
  }

  if (!resumes || resumes.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No resumes in your history yet.</p>
        <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>Generate one first from the builder.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
      {resumes.map(r => (
        <button
          key={r.folder}
          type="button"
          onClick={() => onSelectFolder(r.folder)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
            transition: "border-color 0.12s, background 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-bg)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: "var(--surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="1" width="10" height="14" rx="1.5" fill="var(--accent-bg)" stroke="var(--accent)" strokeWidth="1.2" />
              <line x1="4.5" y1="5" x2="9.5" y2="5" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
              <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
              <line x1="4.5" y1="10" x2="7.5" y2="10" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.role || "Resume"}{r.company ? ` · ${r.company}` : ""}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{formatDate(r.created_at)}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--muted)" }}>
            <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/* ── Manual write teaser ────────────────────────────────────────────── */

function ManualOption({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {["Personal", "Experience", "Education", "Skills"].map((s, i) => (
          <div
            key={s}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: i === 0 ? "var(--accent)" : "var(--surface)",
              color: i === 0 ? "#fff" : "var(--text)",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid var(--border)",
            }}
          >
            {s}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: 0, lineHeight: 1.6 }}>
        Fill in a step-by-step form and we&apos;ll build your resume from scratch.
      </p>
      <button
        type="button"
        onClick={onStart}
        style={{
          padding: "10px 24px",
          borderRadius: 8,
          border: "none",
          background: "var(--accent)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: -0.2,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-h)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; }}
      >
        Start writing
      </button>
    </div>
  );
}

/* ── Spinner ────────────────────────────────────────────────────────── */

function SpinnerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="10" cy="10" r="8" stroke="var(--border)" strokeWidth="2.5" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Option card ────────────────────────────────────────────────────── */

type OptionKey = "upload" | "history" | "manual";

const OPTIONS: { key: OptionKey; icon: React.ReactNode; title: string; description: string }[] = [
  {
    key: "upload",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M4 14v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M11 4v10M7 8l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Upload PDF",
    description: "Import your existing resume — we'll extract the content and reformat it.",
  },
  {
    key: "history",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 4a7 7 0 1 1-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 8v3.5l2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    title: "From History",
    description: "Reuse a resume you've already generated as the starting point.",
  },
  {
    key: "manual",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="3" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 8h8M7 11h8M7 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Write Manually",
    description: "Answer a few quick questions and we'll build your resume from your answers.",
  },
];

/* ── Main component ─────────────────────────────────────────────────── */

export default function ContentSourcePicker() {
  const router = useRouter();
  const [active, setActive] = useState<OptionKey | null>(null);

  const goToBuilder = useCallback((profileText?: string, baseFolder?: string) => {
    if (profileText !== undefined) {
      try { sessionStorage.setItem(PROFILE_KEY, profileText.trim()); } catch { /* quota */ }
    }
    void baseFolder;
    router.push("/template-builder/");
  }, [router]);

  const handleSelectFolder = useCallback((folder: string) => {
    // Use existing resume as base — no profile text override needed
    goToBuilder(undefined, folder);
  }, [goToBuilder]);

  const handleManualStart = useCallback(() => {
    // Style prefs already in sessionStorage from template studio
    const styleRef = (() => { try { return sessionStorage.getItem(STYLE_REF_KEY) ?? ""; } catch { return ""; } })();
    const q = new URLSearchParams();
    q.set("view", "manual-form");
    if (styleRef) q.set("styleRef", styleRef);
    router.push(`/?${q.toString()}`);
  }, [router]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 80px",
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 680 }}>
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            Step 2 of 3
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: 0 }}>
            Where is your content coming from?
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 10, lineHeight: 1.6 }}>
            Choose how you want to fill in your new resume.
          </p>
        </div>

        {/* Option cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {OPTIONS.map(opt => {
            const isActive = active === opt.key;
            return (
              <div
                key={opt.key}
                style={{
                  borderRadius: 14,
                  border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  background: isActive ? "var(--accent-bg)" : "var(--surface)",
                  overflow: "hidden",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Card header — always visible, click to expand */}
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : opt.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "18px 20px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: isActive ? "var(--accent)" : "var(--bg)",
                      color: isActive ? "#fff" : "var(--text)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${isActive ? "transparent" : "var(--border)"}`,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {opt.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{opt.title}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{opt.description}</div>
                  </div>
                  <ChevronIcon open={isActive} />
                </button>

                {/* Expanded content */}
                {isActive && (
                  <div style={{ padding: "0 20px 20px" }}>
                    <div style={{ height: 1, background: "var(--border)", marginBottom: 16 }} />
                    {opt.key === "upload" && <UploadResumePdfPanel onDone={text => goToBuilder(text)} />}
                    {opt.key === "history" && <HistoryOption onSelectFolder={handleSelectFolder} />}
                    {opt.key === "manual" && <ManualOption onStart={handleManualStart} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, color: "var(--muted)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
