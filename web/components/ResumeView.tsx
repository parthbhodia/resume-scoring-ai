"use client";

/**
 * ResumeView — full-page detail view for a single saved resume.
 *
 * Loads the parsed bullet tree from /api/resume/{folder} and surfaces
 * everything the user might want to do with an existing resume:
 *   - Edit bullets / contact / sections (uses the existing ResumeEditor)
 *   - View ATS readiness (uses AtsPanel)
 *   - Download PDF / share / use as base for a new generation
 *
 * Lighter than the main ResumeBuilder because there's no "generation" flow
 * — we're operating on something already produced. JD context is missing,
 * so the ATS check runs against an empty JD (structural-only score) unless
 * the user uploads / pastes one.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { ParsedResume, ParsedBullet, ResumeRecord } from "@/lib/types";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
import { fetchResumes, getSupabaseClient } from "@/lib/supabase";

import ResumeEditor from "./ResumeEditor";
import AtsPanel, { type AtsResult } from "./AtsPanel";
import ShareButton from "./ShareButton";

type Tab = "edit" | "ats";

export default function ResumeView({ folder }: { folder: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  const [meta,    setMeta]    = useState<ResumeRecord | null>(null);
  const [tree,    setTree]    = useState<ParsedResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pdfUrl,  setPdfUrl]  = useState<string | null>(null);

  const [activeTab,  setActiveTab]  = useState<Tab>("edit");
  const [atsJd,      setAtsJd]      = useState("");
  const [atsResult,  setAtsResult]  = useState<AtsResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError,   setAtsError]   = useState<string | null>(null);
  const [doctorIssues, setDoctorIssues] = useState<Record<string, { id: string; severity: "warn" | "info"; msg: string }[]>>({});

  // Pull current user
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  // Load resume metadata (company, role, score, pdf_url) AND the parsed tree.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    setTree(null); setMeta(null); setAtsResult(null); setDoctorIssues({});

    (async () => {
      try {
        // Metadata for the header (parallel — small DB read)
        const allMeta = await fetchResumes().catch(() => [] as ResumeRecord[]);
        const m = allMeta.find(r => r.folder === folder) ?? null;
        if (cancelled) return;
        setMeta(m);
        setPdfUrl(m?.pdf_url ?? null);

        // Parsed tree
        const uid = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
        const resp = await fetch(apiUrl(`/api/resume/${encodeURIComponent(folder)}${uid}`));
        const json = await parseJsonOrThrow<ParsedResume & { error?: string }>(resp);
        if (!resp.ok) throw new Error(json.error ?? "Could not load resume.");
        if (cancelled) return;
        setTree(json);
        runDoctor(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, user?.id]);

  const runDoctor = useCallback(async (parsed: ParsedResume) => {
    try {
      const resp = await fetch(apiUrl("/api/doctor-check"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed }),
      });
      const json = await parseJsonOrThrow<{ issues?: Record<string, { id: string; severity: "warn" | "info"; msg: string }[]> }>(resp);
      if (resp.ok && json.issues) setDoctorIssues(json.issues);
    } catch { /* doctor is best-effort */ }
  }, []);

  const onSave = useCallback(async (next: ParsedResume) => {
    setSaving(true); setSaveErr(null);
    try {
      const resp = await fetch(apiUrl(`/api/resume/${encodeURIComponent(folder)}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id ?? "local", parsed: next }),
      });
      const json = await parseJsonOrThrow<{ error?: string; pdf_url?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "Save failed.");
      setTree(next);
      if (json.pdf_url) setPdfUrl(json.pdf_url);
      runDoctor(next);
      // Stale ATS — clear so the next visit re-runs.
      setAtsResult(null);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [folder, user?.id, runDoctor]);

  const onAIEdit = useCallback(async (b: ParsedBullet, instruction: string): Promise<string> => {
    const resp = await fetch(apiUrl("/api/ai-edit-bullet"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bullet_text: b.text, instruction, jd: atsJd.slice(0, 1500) }),
    });
    const json = await parseJsonOrThrow<{ error?: string; text?: string }>(resp);
    if (!resp.ok || !json.text) throw new Error(json.error ?? "AI rewrite failed");
    return json.text;
  }, [atsJd]);

  const runAts = useCallback(async () => {
    setAtsLoading(true); setAtsError(null);
    try {
      const resp = await fetch(apiUrl(`/api/ats-check/${encodeURIComponent(folder)}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd: atsJd.slice(0, 8000), user_id: user?.id ?? "local" }),
      });
      const json = await parseJsonOrThrow<AtsResult & { error?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "ATS check failed.");
      setAtsResult(json);
    } catch (e: unknown) {
      setAtsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAtsLoading(false);
    }
  }, [folder, user?.id, atsJd]);

  const useAsBase = () => {
    router.push(`/?base=${encodeURIComponent(folder)}`);
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 28px 48px" }}>
      {/* Top bar */}
      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={() => router.push("/?view=library")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, padding: "7px 12px",
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M7 2L3 5.5L7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}>
            Resume
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: "var(--text)", marginTop: 2 }}>
            {meta?.company ?? "—"}{meta?.role ? <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {meta.role}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
        display: "flex", gap: 2, marginBottom: 18,
        background: "var(--surface2)", borderRadius: 9, padding: 3,
        width: "fit-content",
      }}>
        {(["edit", "ats"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => {
              setActiveTab(t);
              if (t === "ats" && !atsResult && !atsLoading) runAts();
            }}
            style={{
              padding: "7px 18px", fontSize: 12,
              fontWeight: activeTab === t ? 600 : 400,
              background: activeTab === t ? "var(--surface)" : "transparent",
              border: "none", borderRadius: 7,
              color: activeTab === t ? "var(--text)" : "var(--dim)",
              cursor: "pointer", fontFamily: "inherit",
              letterSpacing: -0.2,
              boxShadow: activeTab === t ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {t === "edit" ? "Edit & Preview" : atsResult ? `ATS  ${atsResult.score}` : "ATS check"}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading && (
        <div style={{ padding: 60, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
          Loading resume…
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: 24, color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && tree && activeTab === "edit" && (
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
      )}

      {!loading && !error && tree && activeTab === "ats" && (
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
      )}
    </div>
  );
}
