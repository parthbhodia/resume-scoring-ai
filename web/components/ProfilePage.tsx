"use client";

/**
 * Profile — structured defaults for tailoring + optional EEO (Apply jobs, coming soon).
 * Persists to localStorage (`rn_profile_v1`) and Supabase `user_profiles` when signed in.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getSupabaseClient, fetchUserProfile, upsertUserProfile } from "@/lib/supabase";
import { apiUrl, isResumeUploadFile, parseJsonOrThrow } from "@/lib/utils";
import { extractProfileHintsFromResumeText } from "@/lib/profileFromResumeText";
import {
  type ProfileFormState,
  EMPTY_PROFILE,
  loadProfile,
  saveProfile,
  mergeProfilePreferEmpty,
  mergeProfileBidirectional,
  isProfileOnboardingComplete,
  setProfileOnboardingComplete,
  profileHasMeaningfulData,
  profileLooksSparse,
} from "@/lib/profileStorage";
import {
  clearProfileFocusContext,
  profileSectionDomId,
  readProfileFocusContext,
  type ProfileFocusContext,
} from "@/lib/profileFocusFromMatch";

export type { ProfileFormState };

const PROFILE_PREFILL_KEY = "rn_profile_prefill";
const EMPTY_HINT_DISMISSED_KEY = "rn_profile_empty_hint_dismissed";
const AUTO_SAVE_DEBOUNCE_MS = 1500;

/** Lightweight validators — show inline hints on blur, never block saves. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINKEDIN_RE = /^(https?:\/\/)?([\w.-]+\.)?linkedin\.com\/(in|pub|company)\/[\w%\-./]+/i;

function validateEmail(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return EMAIL_RE.test(v) ? "" : "Use a valid email like you@email.com";
}

function validateLinkedIn(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return LINKEDIN_RE.test(v) ? "" : "Looks off — try linkedin.com/in/your-handle";
}

function validateUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  try {
    new URL(v.startsWith("http://") || v.startsWith("https://") ? v : `https://${v}`);
    return "";
  } catch {
    return "Use a valid URL like https://github.com/you";
  }
}

/** Keeps extension visible for long résumé filenames in tight UI. */
function truncateFileName(name: string, max = 48): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const budget = max - ext.length - 1;
  if (budget < 6) return `…${ext || name.slice(-8)}`;
  return `${stem.slice(0, budget - 1)}…${ext}`;
}

function ProfilePdfUploadFeedback({
  busy,
  fileName,
  ok,
  err,
  compact,
}: {
  busy: boolean;
  fileName: string | null;
  ok: string | null;
  err: string | null;
  compact?: boolean;
}) {
  const fs = compact ? 11 : 12;
  const showReading = Boolean(busy && fileName);
  const showResult = !busy && Boolean(ok || err);
  if (!showReading && !showResult) return null;
  return (
    <div style={{ marginTop: compact ? 6 : 8 }}>
      {showReading && fileName ? (
        <div style={{ fontSize: fs, color: "var(--muted)", lineHeight: 1.45, wordBreak: "break-word" }}>
          Reading <strong style={{ color: "var(--text)" }} title={fileName}>{truncateFileName(fileName)}</strong>…
        </div>
      ) : null}
      {showResult ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            border: err ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(34,197,94,0.3)",
            background: err ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.07)",
          }}
        >
          {fileName ? (
            <div
              title={fileName}
              style={{
                fontSize: fs - 1,
                fontWeight: 600,
                color: "var(--dim)",
                marginBottom: ok || err ? 6 : 0,
                wordBreak: "break-word",
              }}
            >
              {truncateFileName(fileName, 56)}
            </div>
          ) : null}
          {ok ? (
            <div style={{ fontSize: fs, color: "var(--green)", lineHeight: 1.45 }}>
              {ok}
            </div>
          ) : null}
          {err ? (
            <div style={{ fontSize: fs, color: "var(--red)", lineHeight: 1.45 }}>
              {err}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function profileStrength(s: ProfileFormState): number {
  const keys: (keyof ProfileFormState)[] = [
    "displayName", "tagline", "email", "phone", "linkedin", "portfolio",
    "headline", "roles", "locations", "school", "degree", "graduation", "gpa",
    "eeoWorkUs", "eeoSponsor", "eeoDisability", "eeoVeteran", "eeoGender", "eeoLgbtq",
  ];
  const filled = keys.filter(k => String(s[k] ?? "").trim()).length;
  return Math.min(96, Math.max(8, Math.round((filled / keys.length) * 100)));
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "var(--surface2)",
    color: "var(--text)",
    outline: "none",
    fontFamily: "inherit",
    letterSpacing: -0.15,
  };
}

function Field({
  label,
  hint,
  error,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: -0.2,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {error ? (
        <div
          id={errorId}
          aria-live="polite"
          style={{ fontSize: 11, color: "var(--red)", marginTop: 5, lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 5 }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="5.5" cy="5.5" r="4.8" stroke="currentColor" strokeWidth="1" fill="none" />
            <path d="M5.5 3.1v3.3M5.5 7.7v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 5, lineHeight: 1.45 }}>{hint}</div>
      ) : null}
    </label>
  );
}

function Card({
  title,
  badge,
  children,
  domId,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  /** Stable anchor for deep-links from match breakdown → profile. */
  domId?: string;
}) {
  return (
    <section
      id={domId}
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        padding: "20px 22px 22px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.35, color: "var(--text)" }}>{title}</h2>
        {badge ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.08,
              color: "var(--amber)",
              background: "var(--amber-bg)",
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EeoRadioGroup({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const labelId = `${name}-label`;
  return (
    <div role="radiogroup" aria-labelledby={labelId} style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div
          id={labelId}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: -0.2,
          }}
        >
          {label}
        </div>
        {value ? (
          <button
            type="button"
            className="rn-profile-link-btn"
            onClick={() => onChange("")}
            aria-label={`Clear answer for: ${label}`}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--dim)",
              background: "transparent",
              border: "none",
              padding: "6px 8px",
              cursor: "pointer",
              borderRadius: "var(--radius)",
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "center" }}>
        {options.map(opt => (
          <label
            key={opt}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13,
              color: "var(--text)",
              letterSpacing: -0.15,
              cursor: "pointer",
              minHeight: 32,
            }}
          >
            <input
              type="radio"
              name={name}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

type InitPhase = "loading" | "onboarding" | "form";

export default function ProfilePage({ prefill }: { prefill: boolean }) {
  const [form, setForm] = useState<ProfileFormState>(EMPTY_PROFILE);
  const [baseline, setBaseline] = useState<string>("");
  const [initPhase, setInitPhase] = useState<InitPhase>("loading");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [importDraft, setImportDraft] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [obUploadBusy, setObUploadBusy] = useState(false);
  const [obUploadErr, setObUploadErr] = useState<string | null>(null);
  const [obUploadOk, setObUploadOk] = useState<string | null>(null);
  const [obUploadFileName, setObUploadFileName] = useState<string | null>(null);
  const [emptyHintDismissed, setEmptyHintDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(EMPTY_HINT_DISMISSED_KEY) === "1"; } catch { return false; }
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"email" | "linkedin" | "portfolio", string>>>({});
  const obFileRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const [matchCoach, setMatchCoach] = useState<ProfileFocusContext | null>(null);

  const dismissEmptyHint = useCallback(() => {
    setEmptyHintDismissed(true);
    if (typeof window === "undefined") return;
    try { localStorage.setItem(EMPTY_HINT_DISMISSED_KEY, "1"); } catch { /* ignore quota */ }
  }, []);

  const dirty = useMemo(() => JSON.stringify(form) !== baseline, [form, baseline]);

  const finishOnboarding = useCallback(() => {
    setProfileOnboardingComplete();
    setInitPhase("form");
    setOnboardingStep(0);
    setObUploadErr(null);
    setObUploadOk(null);
    setObUploadFileName(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = loadProfile();
      let merged = { ...next };
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();
        const em = data.user?.email?.trim();
        if (em && !merged.email.trim()) merged = { ...merged, email: em };
        if (data.user?.id) {
          const remote = await fetchUserProfile();
          if (remote) merged = mergeProfileBidirectional(merged, remote);
        }
      } catch {
        /* offline / no client / table not migrated yet */
      }
      if (cancelled) return;

      let obDone = isProfileOnboardingComplete();
      if (!obDone && profileHasMeaningfulData(merged)) {
        setProfileOnboardingComplete();
        obDone = true;
      }

      const skipIntro =
        typeof window !== "undefined" && new URLSearchParams(window.location.search).get("prefill") === "1";

      saveProfile(merged);
      setForm(merged);
      setBaseline(JSON.stringify(merged));
      setInitPhase(!obDone && !skipIntro ? "onboarding" : "form");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefill || typeof window === "undefined") return;
    try {
      const t = sessionStorage.getItem(PROFILE_PREFILL_KEY);
      if (t) setImportDraft(t);
      sessionStorage.removeItem(PROFILE_PREFILL_KEY);
    } catch {
      setImportDraft(null);
    }
  }, [prefill]);

  /** Match breakdown → profile deep-link: show coach banner + scroll to section. */
  useEffect(() => {
    if (initPhase !== "form") return;
    setMatchCoach(readProfileFocusContext());
  }, [initPhase]);

  useEffect(() => {
    if (initPhase !== "form" || typeof window === "undefined") return;
    const fromHash = window.location.hash.replace(/^#/, "").trim();
    const targetId =
      fromHash.startsWith("rn-profile-") ? fromHash : matchCoach ? profileSectionDomId(matchCoach.section) : "";
    if (!targetId) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(targetId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el?.querySelector<HTMLElement>("input, textarea, select");
      focusable?.focus({ preventScroll: true });
    }, 160);
    return () => window.clearTimeout(t);
  }, [initPhase, matchCoach]);

  const patch = useCallback((p: Partial<ProfileFormState>) => {
    setForm(prev => ({ ...prev, ...p }));
  }, []);

  const dismissMatchCoach = useCallback(() => {
    clearProfileFocusContext();
    setMatchCoach(null);
    if (typeof window !== "undefined" && window.location.hash.startsWith("#rn-profile-")) {
      try {
        const u = new URL(window.location.href);
        u.hash = "";
        window.history.replaceState(null, "", u.pathname + u.search);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const applyNoteToHeadline = useCallback(() => {
    if (!matchCoach?.notes.trim()) return;
    const next = matchCoach.notes.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!next) return;
    if (typeof window !== "undefined" && !window.confirm("Replace your one-line headline with this analyst note? You can undo with Discard until you leave the page.")) return;
    patch({ headline: next });
  }, [matchCoach, patch]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const snap = JSON.stringify(form);
    saveProfile(form);
    setBaseline(snap);
    try {
      await upsertUserProfile(form);
    } catch {
      /* remote save best-effort — local copy is canonical */
    }
    setSaving(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }, [form, saving]);

  const discard = useCallback(() => {
    if (typeof window !== "undefined" && dirty && !window.confirm("Discard unsaved profile changes?")) return;
    try {
      const next = JSON.parse(baseline) as ProfileFormState;
      setForm({ ...EMPTY_PROFILE, ...next });
    } catch {
      const cleared = { ...EMPTY_PROFILE };
      setForm(cleared);
      setBaseline(JSON.stringify(cleared));
    }
  }, [baseline, dirty]);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        if (!dirty || saving) return;
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save]);

  /**
   * Debounced auto-save: persist locally + push to Supabase 1.5s after the
   * user stops typing. We only schedule when there's something to save and no
   * save is already in flight. Each keystroke resets the timer (debounce
   * behaviour), and we tear the timer down on unmount or onboarding handoff.
   */
  useEffect(() => {
    if (initPhase !== "form") return;
    if (!dirty || saving) return;
    if (typeof window === "undefined") return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void save();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [form, dirty, saving, save, initPhase]);

  const strength = profileStrength(form);

  const handleObPdf = useCallback(async (file: File) => {
    setObUploadFileName(file.name);
    setObUploadErr(null);
    setObUploadOk(null);
    if (!isResumeUploadFile(file)) {
      setObUploadErr("Please choose a PDF or Word (.doc/.docx) file.");
      return;
    }
    setObUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: formData });
      const json = await parseJsonOrThrow<{ error?: string; text?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "Upload failed");
      const text = json.text ?? "";
      const hints = extractProfileHintsFromResumeText(text);
      const { next, filled } = mergeProfilePreferEmpty(form, hints);
      saveProfile(next);
      void upsertUserProfile(next);
      setForm(next);
      setBaseline(JSON.stringify(next));
      setObUploadOk(
        filled.length
          ? initPhase === "onboarding"
            ? `Filled ${filled.length} empty field${filled.length === 1 ? "" : "s"} from your PDF. Use “Open Profile form” below to review.`
            : `Filled ${filled.length} empty field${filled.length === 1 ? "" : "s"} from your PDF. Review the updated fields below.`
          : "No new fields — those values were already filled or we couldn’t read them from this PDF.",
      );
    } catch (e: unknown) {
      setObUploadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setObUploadBusy(false);
    }
  }, [form, initPhase]);

  if (initPhase === "loading") {
    return (
      <div
        className="rn-profile-root"
        style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <div style={{ flex: 1, padding: 48, textAlign: "center", color: "var(--muted)", fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <span>Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rn-profile-root"
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      {initPhase === "onboarding" && (
        <div style={{ flex: 1, padding: "32px 20px 100px", maxWidth: 560, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 20, display: "flex", gap: 8, justifyContent: "center" }}>
            {[0, 1].map(i => (
              <span
                key={i}
                style={{
                  width: i === onboardingStep ? 22 : 8,
                  height: 8,
                  borderRadius: 99,
                  background: i === onboardingStep ? "var(--accent)" : "var(--surface3)",
                  transition: "width 0.2s, background 0.2s",
                }}
              />
            ))}
          </div>

          <div
            style={{
              position: "relative",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-card)",
              padding: "28px 26px 26px",
            }}
          >
            {initPhase === "onboarding" && obUploadBusy ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 4,
                  borderRadius: "inherit",
                  background: "var(--glass-bg)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  padding: 24,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: "3px solid var(--border)",
                    borderTopColor: "var(--accent)",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", textAlign: "center" }}>Building profile from PDF…</div>
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", maxWidth: 280 }}>
                  Extracting text and filling empty fields only.
                </div>
              </div>
            ) : null}
            {onboardingStep === 0 && (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.7, marginBottom: 12, color: "var(--text)" }}>
                  Welcome to your Profile
                </h1>
                <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, marginBottom: 0 }}>
                  This is where you keep career defaults — contact info, target roles, education, and optional equal-employment answers for
                  future <strong style={{ color: "var(--text)" }}>Apply jobs</strong>. Tailoring can reuse these fields so you type less.
                </p>
              </>
            )}

            {onboardingStep === 1 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, marginBottom: 12, color: "var(--text)" }}>
                  Fill your Profile (pick one path)
                </h1>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 18 }}>
                  You don&apos;t need every field here first — upload a PDF or use the guided form (same as{" "}
                  <strong style={{ color: "var(--text)" }}>From scratch</strong>).
                </p>

                <Link
                  href="/?view=manual-form"
                  className="rn-profile-cta-card"
                  style={{
                    display: "block",
                    padding: "14px 16px",
                    minHeight: 44,
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                    color: "var(--accent)",
                    fontWeight: 600,
                    fontSize: 13,
                    textDecoration: "none",
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  Manual wizard →
                </Link>

                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Or upload a PDF</p>
                <input ref={obFileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleObPdf(f); e.target.value = ""; }} />
                <button
                  type="button"
                  className="rn-profile-dropzone"
                  disabled={obUploadBusy}
                  onClick={() => obFileRef.current?.click()}
                  style={{
                    width: "100%",
                    padding: "16px 14px",
                    minHeight: 56,
                    borderRadius: "var(--radius-lg)",
                    border: "1.5px dashed var(--border-h)",
                    background: "var(--surface2)",
                    color: "var(--muted)",
                    fontSize: 13,
                    cursor: obUploadBusy ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    marginBottom: 10,
                  }}
                >
                  {obUploadBusy ? "Extracting…" : "Choose PDF — we fill empty fields only"}
                </button>
                <ProfilePdfUploadFeedback
                  busy={obUploadBusy}
                  fileName={obUploadFileName}
                  ok={obUploadOk}
                  err={obUploadErr}
                />

                {importDraft ? (
                  <p style={{ fontSize: 12, color: "var(--amber)", lineHeight: 1.5, margin: 0 }}>
                    You have <strong>imported text</strong> from another flow — it will appear on the Profile form after this intro.
                  </p>
                ) : null}
              </>
            )}

          </div>
        </div>
      )}

      {initPhase === "form" && (
      <div style={{ flex: 1, padding: "28px 20px 100px", maxWidth: 1040, margin: "0 auto", width: "100%" }}>
        <header style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, marginBottom: 8 }}>Profile</h1>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, maxWidth: 560 }}>
            Defaults used when tailoring résumés and cover letters. When you&apos;re signed in we also save to your account; a
            local copy stays on this device — we never sell your data.
          </p>
        </header>

        {matchCoach ? (
          <div
            role="region"
            aria-label="Match criterion context"
            style={{
              marginBottom: 22,
              padding: "16px 18px",
              borderRadius: "var(--radius-xl)",
              border: "1px solid rgba(47,129,247,0.28)",
              background: "var(--accent-bg)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8, letterSpacing: 0.02 }}>
              From match breakdown: <span style={{ color: "var(--accent)" }}>{matchCoach.criterion}</span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {matchCoach.notes.trim() || "—"}
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--dim)", lineHeight: 1.45 }}>
              The section below is scrolled into view — edit those fields so your <strong style={{ color: "var(--text)" }}>next</strong> tailor run picks up the changes.
              Experience and project bullets still come from your uploaded résumé; update the PDF on Analyze or re-upload here when you change jobs.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {matchCoach.section === "headline" && matchCoach.notes.trim() ? (
                <button
                  type="button"
                  className="rn-btn-secondary"
                  onClick={applyNoteToHeadline}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "10px 16px",
                    minHeight: 40,
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Replace headline with this note
                </button>
              ) : null}
              <button
                type="button"
                className="rn-btn-secondary"
                onClick={dismissMatchCoach}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "10px 16px",
                  minHeight: 40,
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {profileLooksSparse(form) && !emptyHintDismissed && (
          <div
            style={{
              marginBottom: 20,
              padding: "16px 18px",
              borderRadius: "var(--radius-xl)",
              border: "1px solid rgba(47,129,247,0.28)",
              background: "var(--accent-bg)",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Profile is still sparse</div>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
                Upload a <strong style={{ color: "var(--text)" }}>PDF</strong> below or use the <strong style={{ color: "var(--text)" }}>manual wizard</strong> — we only fill empty fields.
              </p>
              <input ref={obFileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleObPdf(f); e.target.value = ""; }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="rn-btn-primary"
                  disabled={obUploadBusy}
                  onClick={() => obFileRef.current?.click()}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "10px 16px",
                    minHeight: 40,
                    borderRadius: "var(--radius)",
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: obUploadBusy ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {obUploadBusy ? "Extracting…" : "Upload PDF here"}
                </button>
                <Link
                  href="/?view=manual-form"
                  className="rn-profile-link"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", alignSelf: "center", textDecoration: "none", padding: "8px 4px", borderRadius: "var(--radius)" }}
                >
                  Manual wizard →
                </Link>
              </div>
              <ProfilePdfUploadFeedback
                busy={obUploadBusy}
                fileName={obUploadFileName}
                ok={obUploadOk}
                err={obUploadErr}
                compact
              />
            </div>
            <button
              type="button"
              className="rn-btn-secondary"
              onClick={dismissEmptyHint}
              aria-label="Dismiss sparse-profile hint"
              style={{
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 14px",
                minHeight: 36,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--dim)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {importDraft ? (
          <Card title="Text from your last flow" badge="Reference">
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginBottom: 12 }}>
              Pasted from Analyze or the template builder. Copy into structured fields below, then clear when you are done.
            </p>
            <pre
              style={{
                margin: "0 0 12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.55,
                color: "var(--text)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                maxHeight: 220,
                overflowY: "auto",
                padding: 12,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface2)",
              }}
            >
              {importDraft}
            </pre>
            <button
              type="button"
              className="rn-btn-secondary"
              onClick={() => setImportDraft(null)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "10px 14px",
                minHeight: 40,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear import
            </button>
          </Card>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 300px) minmax(0, 1fr)",
            gap: 22,
            alignItems: "start",
          }}
          className="rn-profile-grid"
        >
          <div>
            <div
              style={{
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                boxShadow: "var(--shadow-card)",
                padding: 22,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)", marginBottom: 8 }}>Display name</div>
              <input
                value={form.displayName}
                onChange={e => patch({ displayName: e.target.value })}
                placeholder="Your name"
                autoComplete="name"
                style={{
                  ...inputStyle(),
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 16,
                  marginBottom: 10,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", marginBottom: 6 }}>Subtitle (optional)</div>
              <input
                value={form.tagline}
                onChange={e => patch({ tagline: e.target.value })}
                placeholder="Early-career software · NYC"
                style={{ ...inputStyle(), textAlign: "center", fontSize: 12 }}
              />
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={strength}
                aria-label={`Profile strength ${strength}%`}
                style={{ height: 6, borderRadius: 99, background: "var(--surface2)", overflow: "hidden", marginBottom: 8, marginTop: 14 }}
              >
                <div
                  style={{
                    width: `${strength}%`,
                    height: "100%",
                    background: strength < 40 ? "var(--red)" : strength < 70 ? "var(--amber)" : "var(--green)",
                    borderRadius: 99,
                    transition: "width 0.35s ease-out, background 0.35s ease-out",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>
                Profile strength · <span style={{ color: "var(--text)", fontWeight: 600 }}>{strength}%</span>
                {strength < 40 ? " · just getting started" : strength < 70 ? " · keep going" : " · looking great"}
              </div>
            </div>

            <Card title="Visibility" badge="Soon">
              <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginBottom: 12 }}>
                Control what appears on exported PDFs and shared links.
              </p>
              <div style={{ opacity: 0.45, pointerEvents: "none" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
                  <input type="checkbox" defaultChecked readOnly /> Show phone on résumé PDFs
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <input type="checkbox" readOnly /> Hide full address (city only)
                </label>
              </div>
            </Card>
          </div>

          <div>
            <Card title="Contact & links" domId="rn-profile-contact">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="rn-profile-two-col">
                <Field
                  label="Email"
                  hint="We prefill from your account when empty."
                  error={fieldErrors.email}
                  errorId="rn-prof-email-err"
                >
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={form.email}
                    onChange={e => patch({ email: e.target.value })}
                    onFocus={() => setFieldErrors(prev => ({ ...prev, email: undefined }))}
                    onBlur={e => setFieldErrors(prev => ({ ...prev, email: validateEmail(e.target.value) || undefined }))}
                    aria-invalid={Boolean(fieldErrors.email) || undefined}
                    aria-describedby={fieldErrors.email ? "rn-prof-email-err" : undefined}
                    style={inputStyle()}
                    placeholder="you@email.com"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={e => patch({ phone: e.target.value })}
                    style={inputStyle()}
                    placeholder="+1 …"
                  />
                </Field>
                <Field
                  label="LinkedIn"
                  error={fieldErrors.linkedin}
                  errorId="rn-prof-linkedin-err"
                >
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    value={form.linkedin}
                    onChange={e => patch({ linkedin: e.target.value })}
                    onFocus={() => setFieldErrors(prev => ({ ...prev, linkedin: undefined }))}
                    onBlur={e => setFieldErrors(prev => ({ ...prev, linkedin: validateLinkedIn(e.target.value) || undefined }))}
                    aria-invalid={Boolean(fieldErrors.linkedin) || undefined}
                    aria-describedby={fieldErrors.linkedin ? "rn-prof-linkedin-err" : undefined}
                    style={inputStyle()}
                    placeholder="linkedin.com/in/…"
                  />
                </Field>
                <Field
                  label="Portfolio / GitHub"
                  error={fieldErrors.portfolio}
                  errorId="rn-prof-portfolio-err"
                >
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    value={form.portfolio}
                    onChange={e => patch({ portfolio: e.target.value })}
                    onFocus={() => setFieldErrors(prev => ({ ...prev, portfolio: undefined }))}
                    onBlur={e => setFieldErrors(prev => ({ ...prev, portfolio: validateUrl(e.target.value) || undefined }))}
                    aria-invalid={Boolean(fieldErrors.portfolio) || undefined}
                    aria-describedby={fieldErrors.portfolio ? "rn-prof-portfolio-err" : undefined}
                    style={inputStyle()}
                    placeholder="https://…"
                  />
                </Field>
              </div>
            </Card>

            <Card title="Résumé tagline" domId="rn-profile-headline">
              <label style={{ display: "block", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2, marginBottom: 6 }}>
                  One-line headline
                </div>
                <input
                  value={form.headline}
                  onChange={e => patch({ headline: e.target.value })}
                  style={inputStyle()}
                  placeholder="CS student · ML internships · Python & Rust"
                  maxLength={140}
                  aria-describedby="rn-prof-headline-meta"
                />
                <div
                  id="rn-prof-headline-meta"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                    marginTop: 6,
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: "var(--dim)",
                  }}
                >
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    Used at the top of a tailored résumé when no custom summary is written. Aim for a short, scannable tagline — not a sentence.
                  </span>
                  <span
                    aria-live="polite"
                    style={{
                      flexShrink: 0,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: form.headline.length > 90 ? "var(--amber)" : "var(--dim)",
                    }}
                  >
                    {form.headline.length}/90
                  </span>
                </div>
              </label>
            </Card>

            <Card title="Job preferences" domId="rn-profile-roles">
              <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: "-4px 0 14px" }}>
                What kinds of roles and locations you&apos;re searching for. Used to focus tailoring and (soon) auto-apply.
              </p>
              <Field label="Roles you want" hint="Comma-separated — these guide which JD keywords get emphasised.">
                <input value={form.roles} onChange={e => patch({ roles: e.target.value })} style={inputStyle()} placeholder="Backend intern, Platform intern…" />
              </Field>
              <Field label="Locations" hint="Cities, regions, or “Remote”. Separators are fine — we keep it as written.">
                <input value={form.locations} onChange={e => patch({ locations: e.target.value })} style={inputStyle()} placeholder="Remote · NYC · …" />
              </Field>
            </Card>

            <Card title="Education" domId="rn-profile-education">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="rn-profile-two-col">
                <Field label="School">
                  <input
                    autoComplete="organization"
                    value={form.school}
                    onChange={e => patch({ school: e.target.value })}
                    style={inputStyle()}
                  />
                </Field>
                <Field label="Degree">
                  <input value={form.degree} onChange={e => patch({ degree: e.target.value })} style={inputStyle()} />
                </Field>
                <Field label="Graduation">
                  <input value={form.graduation} onChange={e => patch({ graduation: e.target.value })} style={inputStyle()} placeholder="May 2027" />
                </Field>
                <Field label="GPA (optional)">
                  <input
                    inputMode="decimal"
                    value={form.gpa}
                    onChange={e => patch({ gpa: e.target.value })}
                    style={inputStyle()}
                  />
                </Field>
              </div>
            </Card>

            <Card title="Tailoring defaults" badge="Preview" domId="rn-profile-tailoring">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="rn-profile-two-col">
                <Field label="Default tone">
                  <select
                    value={form.tone}
                    onChange={e => patch({ tone: e.target.value })}
                    style={{ ...inputStyle(), cursor: "pointer" }}
                  >
                    <option value="confident">Confident & concise</option>
                    <option value="formal">Formal</option>
                    <option value="friendly">Friendly</option>
                  </select>
                </Field>
                <Field label="Default section order">
                  <select
                    value={form.sectionOrder}
                    onChange={e => patch({ sectionOrder: e.target.value })}
                    style={{ ...inputStyle(), cursor: "pointer" }}
                  >
                    <option value="summary-exp-proj-edu">Summary → Experience → Projects → Education</option>
                    <option value="exp-summary-edu">Experience → Summary → Education</option>
                    <option value="edu-exp">Education → Experience → …</option>
                  </select>
                </Field>
              </div>
            </Card>

            <Card title="Equal employment" badge="Optional">
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "14px 16px",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  marginBottom: 20,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    borderRadius: "var(--radius)",
                    background: "var(--amber-bg)",
                    color: "var(--amber)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3.25" y="2.5" width="9.5" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5.75 1.5h4.5v2h-4.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="m6 8.5 1.5 1.5 2.5-2.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.3, color: "var(--text)", marginBottom: 6 }}>
                    Optional — save time on applications later
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
                    Many job boards ask the same EEO-style questions on every apply. If you store answers here, our{" "}
                    <strong style={{ color: "var(--text)", fontWeight: 600 }}>Apply jobs</strong> experience{" "}
                    <span style={{ color: "var(--amber)", fontWeight: 600 }}>(coming soon)</span> can suggest matching options on supported
                    forms. Not used for résumé scoring or tailoring unless you use Apply jobs when it ships.
                  </p>
                </div>
              </div>

              <EeoRadioGroup
                label="Are you authorized to work in the U.S.?"
                name="eeo-work"
                options={["Yes", "No"]}
                value={form.eeoWorkUs}
                onChange={v => patch({ eeoWorkUs: v })}
              />
              <EeoRadioGroup
                label="Will you now or in the future require sponsorship for an employment visa?"
                name="eeo-sponsor"
                options={["Yes", "No"]}
                value={form.eeoSponsor}
                onChange={v => patch({ eeoSponsor: v })}
              />
              <EeoRadioGroup
                label="Do you have a disability?"
                name="eeo-disability"
                options={["Yes", "No", "Decline to state"]}
                value={form.eeoDisability}
                onChange={v => patch({ eeoDisability: v })}
              />
              <EeoRadioGroup
                label="Are you a veteran?"
                name="eeo-veteran"
                options={["Yes", "No", "Decline to state"]}
                value={form.eeoVeteran}
                onChange={v => patch({ eeoVeteran: v })}
              />
              <EeoRadioGroup
                label="What is your gender?"
                name="eeo-gender"
                options={["Male", "Female", "Non-Binary", "Decline to state"]}
                value={form.eeoGender}
                onChange={v => patch({ eeoGender: v })}
              />
              <EeoRadioGroup
                label="Do you identify as LGBTQ+?"
                name="eeo-lgbtq"
                options={["Yes", "No", "Decline to state"]}
                value={form.eeoLgbtq}
                onChange={v => patch({ eeoLgbtq: v })}
              />
              <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5, margin: 0, marginTop: 4 }}>
                Employers use this for compliance and diversity reporting; wording on external sites may differ. You can clear answers anytime.
              </p>
            </Card>
          </div>
        </div>
      </div>
      )}

      {initPhase === "onboarding" && (
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 6,
          borderTop: "1px solid var(--border)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(10px)",
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="rn-btn-ghost"
          onClick={finishOnboarding}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 14px",
            minHeight: 44,
            borderRadius: "var(--radius)",
            border: "none",
            background: "transparent",
            color: "var(--dim)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Skip intro
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {onboardingStep > 0 && (
            <button
              type="button"
              className="rn-btn-secondary"
              onClick={() => setOnboardingStep(s => s - 1)}
              disabled={obUploadBusy}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 16px",
                minHeight: 44,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                cursor: obUploadBusy ? "not-allowed" : "pointer",
                opacity: obUploadBusy ? 0.45 : 1,
                fontFamily: "inherit",
              }}
            >
              Back
            </button>
          )}
          {onboardingStep < 1 ? (
            <button
              type="button"
              className="rn-btn-primary"
              onClick={() => setOnboardingStep(s => s + 1)}
              disabled={obUploadBusy}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
                minHeight: 44,
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: obUploadBusy ? "not-allowed" : "pointer",
                opacity: obUploadBusy ? 0.55 : 1,
                fontFamily: "inherit",
                boxShadow: "0 1px 8px rgba(47,129,247,0.35)",
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="rn-btn-primary"
              onClick={finishOnboarding}
              disabled={obUploadBusy}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
                minHeight: 44,
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: obUploadBusy ? "not-allowed" : "pointer",
                opacity: obUploadBusy ? 0.55 : 1,
                fontFamily: "inherit",
                boxShadow: "0 1px 8px rgba(47,129,247,0.35)",
              }}
            >
              Open Profile form
            </button>
          )}
        </div>
      </div>
      )}

      {initPhase === "form" && (
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 6,
          borderTop: "1px solid var(--border)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(10px)",
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          role="status"
          aria-live="polite"
          style={{ fontSize: 12, color: "var(--dim)", display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}
        >
          {saving ? (
            <>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
              Saving…
            </>
          ) : savedFlash ? (
            <span style={{ color: "var(--green)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6.5 4.5 9 10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Saved
            </span>
          ) : dirty ? (
            <>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", display: "inline-block", flexShrink: 0 }} />
              Auto-saving shortly…
            </>
          ) : (
            <>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block", flexShrink: 0 }} />
              All changes saved · auto-save on
            </>
          )}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="rn-btn-secondary"
            onClick={discard}
            disabled={!dirty || saving}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 16px",
              minHeight: 40,
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: dirty && !saving ? "pointer" : "not-allowed",
              opacity: dirty && !saving ? 1 : 0.45,
              fontFamily: "inherit",
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className="rn-btn-primary"
            onClick={() => { void save(); }}
            disabled={!dirty || saving}
            aria-keyshortcuts="Control+S Meta+S"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 20px",
              minHeight: 40,
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: dirty && !saving ? "pointer" : "not-allowed",
              opacity: dirty && !saving ? 1 : 0.55,
              fontFamily: "inherit",
              boxShadow: dirty && !saving ? "0 1px 8px rgba(47,129,247,0.35)" : "none",
            }}
          >
            {saving ? (
              <>
                <span aria-hidden style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.45)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                Saving…
              </>
            ) : (
              "Save now"
            )}
          </button>
        </div>
      </div>
      )}

      <style jsx global>{`
        @media (max-width: 900px) {
          .rn-profile-grid {
            grid-template-columns: 1fr !important;
          }
          .rn-profile-two-col {
            grid-template-columns: 1fr !important;
          }
        }

        /* Visible focus ring for keyboard users across all interactive
           elements inside the profile page. The native input ring already
           lives in globals.css; this fills the gap for buttons + links. */
        .rn-profile-root button:focus-visible,
        .rn-profile-root a:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          border-radius: var(--radius);
        }

        /* Inline validation visual — turns the input red when aria-invalid is
           set on blur. Clears as soon as the user re-focuses to give them a
           clean slate (focus handler resets the error state). */
        .rn-profile-root input[aria-invalid="true"] {
          border-color: var(--red) !important;
        }
        .rn-profile-root input[aria-invalid="true"]:focus {
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.22) !important;
        }

        /* Subtle press feedback so every tap/click has a visual response. */
        .rn-profile-root .rn-btn-primary:not(:disabled):hover {
          background: var(--accent-h) !important;
        }
        .rn-profile-root .rn-btn-primary:not(:disabled):active {
          transform: translateY(1px);
        }

        .rn-profile-root .rn-btn-secondary:not(:disabled):hover {
          background: var(--surface2) !important;
          border-color: var(--border-h) !important;
        }
        .rn-profile-root .rn-btn-secondary:not(:disabled):active {
          transform: translateY(1px);
        }

        .rn-profile-root .rn-btn-ghost:hover {
          background: var(--surface2) !important;
          color: var(--text) !important;
        }

        .rn-profile-root .rn-profile-link-btn:hover {
          background: var(--surface2);
          color: var(--text);
        }

        .rn-profile-root .rn-profile-link:hover {
          text-decoration: underline;
        }

        .rn-profile-root .rn-profile-cta-card:hover {
          background: var(--surface3) !important;
          border-color: var(--accent) !important;
        }

        .rn-profile-root .rn-profile-dropzone:not(:disabled):hover {
          border-color: var(--accent) !important;
          background: var(--accent-bg) !important;
          color: var(--text) !important;
        }
      `}</style>
    </div>
  );
}
