"use client";

/**
 * Profile — structured defaults for tailoring + optional EEO (Apply jobs, coming soon).
 * Persists to localStorage (`rn_profile_v1`) and Supabase `user_profiles` when signed in.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getSupabaseClient, fetchUserProfile, upsertUserProfile } from "@/lib/supabase";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
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

export type { ProfileFormState };

const PROFILE_PREFILL_KEY = "rn_profile_prefill";

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
  children,
}: {
  label: string;
  hint?: string;
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
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 5, lineHeight: 1.45 }}>{hint}</div>
      ) : null}
    </label>
  );
}

function Card({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section
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
      <div
        id={labelId}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: -0.2,
          marginBottom: 8,
        }}
      >
        {label}
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
  const [obUploadBusy, setObUploadBusy] = useState(false);
  const [obUploadErr, setObUploadErr] = useState<string | null>(null);
  const [obUploadOk, setObUploadOk] = useState<string | null>(null);
  const [obUploadFileName, setObUploadFileName] = useState<string | null>(null);
  const [emptyHintDismissed, setEmptyHintDismissed] = useState(false);
  const obFileRef = useRef<HTMLInputElement>(null);

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

  const patch = useCallback((p: Partial<ProfileFormState>) => {
    setForm(prev => ({ ...prev, ...p }));
  }, []);

  const save = useCallback(() => {
    saveProfile(form);
    void upsertUserProfile(form);
    const snap = JSON.stringify(form);
    setBaseline(snap);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }, [form]);

  const discard = useCallback(() => {
    try {
      const next = JSON.parse(baseline) as ProfileFormState;
      setForm({ ...EMPTY_PROFILE, ...next });
    } catch {
      const cleared = { ...EMPTY_PROFILE };
      setForm(cleared);
      setBaseline(JSON.stringify(cleared));
    }
  }, [baseline]);

  const strength = profileStrength(form);

  const handleObPdf = useCallback(async (file: File) => {
    setObUploadFileName(file.name);
    setObUploadErr(null);
    setObUploadOk(null);
    if (!file.type.includes("pdf")) {
      setObUploadErr("Please choose a PDF file.");
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
                  style={{
                    display: "block",
                    padding: "12px 16px",
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
                <input ref={obFileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleObPdf(f); e.target.value = ""; }} />
                <button
                  type="button"
                  disabled={obUploadBusy}
                  onClick={() => obFileRef.current?.click()}
                  style={{
                    width: "100%",
                    padding: "16px 14px",
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
              <input ref={obFileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleObPdf(f); e.target.value = ""; }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={obUploadBusy}
                  onClick={() => obFileRef.current?.click()}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "8px 14px",
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
                <Link href="/?view=manual-form" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", alignSelf: "center", textDecoration: "none" }}>
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
              onClick={() => setEmptyHintDismissed(true)}
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 10px",
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
              onClick={() => setImportDraft(null)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 14px",
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
              <div style={{ height: 6, borderRadius: 99, background: "var(--surface2)", overflow: "hidden", marginBottom: 8, marginTop: 14 }}>
                <div style={{ width: `${strength}%`, height: "100%", background: "var(--green)", borderRadius: 99, transition: "width 0.35s ease-out" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>Profile strength · {strength}%</div>
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
            <Card title="Contact & links">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="rn-profile-two-col">
                <Field label="Email" hint="We prefill from your account when empty.">
                  <input value={form.email} onChange={e => patch({ email: e.target.value })} style={inputStyle()} placeholder="you@email.com" />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={e => patch({ phone: e.target.value })} style={inputStyle()} placeholder="+1 …" />
                </Field>
                <Field label="LinkedIn">
                  <input value={form.linkedin} onChange={e => patch({ linkedin: e.target.value })} style={inputStyle()} placeholder="linkedin.com/in/…" />
                </Field>
                <Field label="Portfolio / GitHub">
                  <input value={form.portfolio} onChange={e => patch({ portfolio: e.target.value })} style={inputStyle()} placeholder="https://…" />
                </Field>
              </div>
            </Card>

            <Card title="Target search">
              <Field label="Headline (one line)" hint="Shown at the top of tailored résumés when you leave summary blank.">
                <input value={form.headline} onChange={e => patch({ headline: e.target.value })} style={inputStyle()} placeholder="CS student · internships · key skills" />
              </Field>
              <Field label="Roles you want">
                <input value={form.roles} onChange={e => patch({ roles: e.target.value })} style={inputStyle()} placeholder="Backend intern, Platform intern…" />
              </Field>
              <Field label="Locations">
                <input value={form.locations} onChange={e => patch({ locations: e.target.value })} style={inputStyle()} placeholder="Remote · NYC · …" />
              </Field>
            </Card>

            <Card title="Education">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }} className="rn-profile-two-col">
                <Field label="School">
                  <input value={form.school} onChange={e => patch({ school: e.target.value })} style={inputStyle()} />
                </Field>
                <Field label="Degree">
                  <input value={form.degree} onChange={e => patch({ degree: e.target.value })} style={inputStyle()} />
                </Field>
                <Field label="Graduation">
                  <input value={form.graduation} onChange={e => patch({ graduation: e.target.value })} style={inputStyle()} placeholder="May 2027" />
                </Field>
                <Field label="GPA (optional)">
                  <input value={form.gpa} onChange={e => patch({ gpa: e.target.value })} style={inputStyle()} />
                </Field>
              </div>
            </Card>

            <Card title="Tailoring defaults" badge="Preview">
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
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }} aria-hidden>
                  🏁
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
          onClick={finishOnboarding}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 12px",
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
              onClick={() => setOnboardingStep(s => s - 1)}
              disabled={obUploadBusy}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 16px",
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
              onClick={() => setOnboardingStep(s => s + 1)}
              disabled={obUploadBusy}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
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
              onClick={finishOnboarding}
              disabled={obUploadBusy}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
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
        <span style={{ fontSize: 12, color: "var(--dim)" }}>
          {savedFlash ? (
            <span style={{ color: "var(--green)", fontWeight: 600 }}>Saved</span>
          ) : dirty ? (
            "You have unsaved changes"
          ) : (
            "All changes saved"
          )}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={discard}
            disabled={!dirty}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: dirty ? "pointer" : "not-allowed",
              opacity: dirty ? 1 : 0.45,
              fontFamily: "inherit",
            }}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 20px",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: dirty ? "pointer" : "not-allowed",
              opacity: dirty ? 1 : 0.55,
              fontFamily: "inherit",
              boxShadow: dirty ? "0 1px 8px rgba(47,129,247,0.35)" : "none",
            }}
          >
            Save profile
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
      `}</style>
    </div>
  );
}
