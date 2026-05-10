"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_REFERENCE_FOLDER,
  distinctStyleTemplates,
  isValidResumeStyleFolder,
} from "@/lib/resumeTemplates";
import {
  RN_LINE_SPACING_KEY,
  RN_MARGIN_IN_KEY,
  type LineSpacingChoice,
  type MarginInchesChoice,
} from "@/lib/resumeTemplateStudioPrefs";

const PROFILE_KEY = "rn_builder_profile_prefill";
const STYLE_REF_KEY = "rn_builder_style_ref";

const SAMPLE_PREVIEW = `Jennifer Jobscan
Product Designer · jennifer@example.com · (555) 010-2030 · San Francisco, CA

PROFESSIONAL SUMMARY
Results-driven designer with 6+ years shipping web and mobile products in fintech and SaaS. Leads end-to-end UX, design systems, and cross-functional delivery.

WORK EXPERIENCE
Senior Product Designer | Acme Labs | 2021 – Present
• Redesigned onboarding, lifting activation 22% and reducing support tickets 18%.
• Built a Figma → React token pipeline adopted by 12 squads.

Product Designer | Northwind | 2018 – 2021
• Shipped dashboard v2 used by 40k monthly active analysts.

CORE SKILLS
Figma · Design systems · Prototyping · User research · HTML/CSS literacy

EDUCATION
BFA, Graphic Design — State University, 2014 – 2018

LANGUAGES
English (Native)`;

function marginToPaddingPx(inches: MarginInchesChoice): number {
  const n = parseFloat(inches);
  return Math.round(n * 96);
}

function lineHeightFromChoice(sp: LineSpacingChoice): number {
  if (sp === "1") return 1.35;
  if (sp === "1.5") return 1.65;
  return 1.48;
}

function TemplateThumb({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 8,
        padding: 10,
        borderRadius: 10,
        border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
        background: selected ? "var(--accent-bg)" : "var(--surface)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? "0 0 0 1px rgba(9,105,218,0.12)" : "none",
      }}
    >
      <div
        style={{
          height: 72,
          borderRadius: 6,
          background: "#fff",
          border: "1px solid rgba(15,23,42,0.12)",
          padding: "6px 7px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div style={{ height: 3, width: "42%", background: "rgba(15,23,42,0.78)", borderRadius: 1 }} />
        <div style={{ height: 2, width: "28%", background: "rgba(15,23,42,0.35)", borderRadius: 1 }} />
        <div style={{ flex: 1 }} />
        <div style={{ height: 2, width: "100%", background: "rgba(9,105,218,0.35)", borderRadius: 1 }} />
        <div style={{ height: 2, width: "88%", background: "rgba(15,23,42,0.2)", borderRadius: 1 }} />
        <div style={{ height: 2, width: "92%", background: "rgba(15,23,42,0.2)", borderRadius: 1 }} />
        <div style={{ height: 2, width: "70%", background: "rgba(15,23,42,0.2)", borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2, lineHeight: 1.3 }}>
        {label}
      </span>
    </button>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  formatLabel,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  formatLabel: (v: T) => string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.55, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                padding: "6px 11px",
                borderRadius: 8,
                border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: active ? "var(--accent-bg)" : "var(--surface2)",
                color: active ? "var(--accent)" : "var(--muted)",
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {formatLabel(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ResumeTemplateStudio({ initialBaseFolder }: { initialBaseFolder?: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const base = (initialBaseFolder ?? params?.get("base") ?? "").trim();

  const templates = useMemo(() => distinctStyleTemplates(), []);
  const [styleFolder, setStyleFolder] = useState(() => {
    try {
      const s = sessionStorage.getItem(STYLE_REF_KEY);
      if (s && isValidResumeStyleFolder(s)) return s;
    } catch { /* ignore */ }
    return DEFAULT_REFERENCE_FOLDER;
  });
  const [lineSpacing, setLineSpacing] = useState<LineSpacingChoice>("1.15");
  const [marginIn, setMarginIn] = useState<MarginInchesChoice>("0.75");
  const [profileText, setProfileText] = useState<string | null>(null);
  const [useSample, setUseSample] = useState(false);

  useEffect(() => {
    try {
      const p = sessionStorage.getItem(PROFILE_KEY);
      if (p && p.trim()) {
        setProfileText(p);
        setUseSample(false);
      } else {
        setProfileText(null);
        setUseSample(true);
      }
    } catch {
      setProfileText(null);
      setUseSample(true);
    }
  }, []);

  const hasExtract = !!profileText?.trim();
  const previewBody = !hasExtract || useSample ? SAMPLE_PREVIEW : profileText!;
  const pad = marginToPaddingPx(marginIn);
  const lh = lineHeightFromChoice(lineSpacing);

  const onReset = useCallback(() => {
    try {
      sessionStorage.removeItem(PROFILE_KEY);
      sessionStorage.removeItem(STYLE_REF_KEY);
      sessionStorage.removeItem(RN_LINE_SPACING_KEY);
      sessionStorage.removeItem(RN_MARGIN_IN_KEY);
    } catch { /* ignore */ }
    router.push("/?view=analyze");
  }, [router]);

  const onContinue = useCallback(() => {
    try {
      sessionStorage.setItem(STYLE_REF_KEY, styleFolder);
      sessionStorage.setItem(RN_LINE_SPACING_KEY, lineSpacing);
      sessionStorage.setItem(RN_MARGIN_IN_KEY, marginIn);
      sessionStorage.setItem(PROFILE_KEY, previewBody.trim());
    } catch { /* quota */ }
    const q = new URLSearchParams();
    q.set("view", "builder");
    q.set("flow", "tailor");
    q.set("fromTemplateStudio", "1");
    if (base) q.set("base", base);
    router.push(`/?${q.toString()}`);
  }, [router, styleFolder, lineSpacing, marginIn, previewBody, base]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "row",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* ── Left: controls ───────────────────────────────── */}
      <aside
        style={{
          flex: "0 0 min(400px, 38vw)",
          minWidth: 280,
          maxWidth: 440,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "var(--surface)",
        }}
      >
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4, color: "var(--text)", margin: "0 0 6px", lineHeight: 1.25 }}>
            Choose an ATS-friendly résumé template
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            Pick layout and spacing here first. On Continue we open the compile step only — no giant job-description wizard.
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px 20px" }}>
          <Segmented<LineSpacingChoice>
            label="Line spacing"
            options={["1", "1.15", "1.5"] as const}
            value={lineSpacing}
            onChange={setLineSpacing}
            formatLabel={(v) => (v === "1" ? "1.0 Single" : v === "1.15" ? "1.15 Default" : "1.5 More space")}
          />
          <Segmented<MarginInchesChoice>
            label="Margins (page)"
            options={["0.5", "0.75", "1"] as const}
            value={marginIn}
            onChange={setMarginIn}
            formatLabel={(v) => `${v}" ${v === "0.5" ? "Narrow" : v === "0.75" ? "Normal" : "Wide"}`}
          />

          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.55, marginBottom: 8 }}>
            Templates
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {templates.map((t) => (
              <TemplateThumb
                key={t.id}
                label={t.label}
                selected={styleFolder === t.referenceFolder}
                onClick={() => setStyleFolder(t.referenceFolder)}
              />
            ))}
          </div>
          <p style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.45, marginTop: 12 }}>
            Final PDF uses your LaTeX reference on the server ({styleFolder}). More layouts can be registered in{" "}
            <code style={{ fontSize: 10 }}>web/lib/resumeTemplates.ts</code>.
          </p>
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: "14px 20px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            background: "var(--surface2)",
          }}
        >
          <button
            type="button"
            onClick={onReset}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            Reset résumé &amp; start over
          </button>
          <button
            type="button"
            onClick={onContinue}
            style={{
              padding: "10px 22px",
              borderRadius: 9,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            Continue
          </button>
        </div>
      </aside>

      {/* ── Right: live preview ─────────────────────────── */}
      <section
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--surface2)",
          minHeight: 0,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} aria-hidden />
            Preview updates live
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: hasExtract ? "var(--muted)" : "var(--dim)",
              cursor: hasExtract ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={!hasExtract || useSample}
              onChange={(e) => setUseSample(e.target.checked)}
              disabled={!hasExtract}
            />
            Sample text
            {!hasExtract ? <span style={{ fontSize: 10, color: "var(--dim)" }}>(upload or analyze first)</span> : null}
          </label>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px 40px", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "100%",
              maxWidth: 640,
              background: "#ffffff",
              color: "#0f172a",
              boxShadow: "0 2px 6px rgba(15,23,42,0.06), 0 24px 48px rgba(15,23,42,0.12)",
              borderRadius: 2,
              border: "1px solid rgba(15,23,42,0.08)",
              padding: pad,
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: 11,
              lineHeight: lh,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {previewBody}
          </div>
        </div>
      </section>
    </div>
  );
}
