"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_REFERENCE_FOLDER,
  distinctStyleTemplates,
  isValidResumeStyleFolder,
  type ResumeStyleTemplate,
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

/* ── SVG resume previews ─────────────────────────────────────────── */

function HarshibarPreviewSvg() {
  return (
    <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="200" height="260" fill="#ffffff" />
      {/* Name */}
      <text x="12" y="21" fontSize="10.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">John A. Smith</text>
      {/* Contact row */}
      <text x="12" y="31" fontSize="5.5" fill="#475569" fontFamily="Arial, sans-serif">john@email.com  ·  (555) 123-4567  ·  github.com/jsmith  ·  linkedin.com/in/jsmith</text>
      {/* Rule */}
      <line x1="12" y1="36" x2="188" y2="36" stroke="#0f172a" strokeWidth="0.8" />

      {/* EXPERIENCE */}
      <text x="12" y="47" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">EXPERIENCE</text>
      <line x1="12" y1="50" x2="188" y2="50" stroke="#cbd5e1" strokeWidth="0.4" />
      {/* Job 1 */}
      <text x="12" y="59" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Software Engineer</text>
      <text x="188" y="59" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">Jan 2022 – Present</text>
      <text x="12" y="67" fontSize="6" fill="#475569" fontFamily="Arial, sans-serif">Google, Inc. · Mountain View, CA</text>
      <rect x="16" y="72" width="164" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="77" width="148" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="82" width="156" height="3" rx="1" fill="#e2e8f0" />
      {/* Job 2 */}
      <text x="12" y="94" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Software Engineer Intern</text>
      <text x="188" y="94" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">May 2021 – Aug 2021</text>
      <text x="12" y="102" fontSize="6" fill="#475569" fontFamily="Arial, sans-serif">Meta Platforms · Menlo Park, CA</text>
      <rect x="16" y="107" width="150" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="112" width="130" height="3" rx="1" fill="#e2e8f0" />

      {/* EDUCATION */}
      <text x="12" y="124" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">EDUCATION</text>
      <line x1="12" y1="127" x2="188" y2="127" stroke="#cbd5e1" strokeWidth="0.4" />
      <text x="12" y="136" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">B.S. Computer Science</text>
      <text x="188" y="136" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">Sep 2018 – May 2022</text>
      <text x="12" y="144" fontSize="6" fill="#475569" fontFamily="Arial, sans-serif">Stanford University · GPA: 3.92 / 4.0</text>

      {/* PROJECTS */}
      <text x="12" y="156" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">PROJECTS</text>
      <line x1="12" y1="159" x2="188" y2="159" stroke="#cbd5e1" strokeWidth="0.4" />
      <text x="12" y="168" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">ResumAI  |  </text>
      <text x="52" y="168" fontSize="6" fill="#2f81f7" fontFamily="Arial, sans-serif">github.com/jsmith/resumai</text>
      <rect x="16" y="173" width="145" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="178" width="120" height="3" rx="1" fill="#e2e8f0" />

      {/* SKILLS */}
      <text x="12" y="190" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">TECHNICAL SKILLS</text>
      <line x1="12" y1="193" x2="188" y2="193" stroke="#cbd5e1" strokeWidth="0.4" />
      <text x="12" y="202" fontSize="6" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Languages:</text>
      <rect x="52" y="198" width="120" height="3" rx="1" fill="#e2e8f0" />
      <text x="12" y="210" fontSize="6" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Frameworks:</text>
      <rect x="55" y="206" width="100" height="3" rx="1" fill="#e2e8f0" />
      <text x="12" y="218" fontSize="6" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Tools:</text>
      <rect x="33" y="214" width="80" height="3" rx="1" fill="#e2e8f0" />
    </svg>
  );
}

function ClassicProPreviewSvg() {
  return (
    <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="200" height="260" fill="#ffffff" />
      {/* Name centered */}
      <text x="100" y="20" fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" textAnchor="middle" letterSpacing="1">JENNIFER SMITH</text>
      {/* Contact centered */}
      <text x="100" y="29" fontSize="5.5" fill="#475569" fontFamily="Georgia, serif" textAnchor="middle">jennifer@email.com  ·  (555) 010-2030  ·  New York, NY</text>
      {/* Thick rule */}
      <rect x="12" y="34" width="176" height="1.2" fill="#0f172a" />

      {/* PROFESSIONAL SUMMARY */}
      <text x="100" y="45" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" textAnchor="middle" letterSpacing="0.8">PROFESSIONAL SUMMARY</text>
      <rect x="12" y="49" width="176" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="54" width="160" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="59" width="170" height="3" rx="0.5" fill="#e2e8f0" />

      {/* WORK EXPERIENCE */}
      <text x="12" y="72" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" letterSpacing="0.8">WORK EXPERIENCE</text>
      <rect x="12" y="75" width="176" height="0.8" fill="#0f172a" />
      <text x="12" y="84" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif">Senior Product Designer</text>
      <text x="188" y="84" fontSize="5.5" fill="#64748b" fontFamily="Georgia, serif" textAnchor="end">2021 – Present</text>
      <text x="12" y="92" fontSize="6" fill="#475569" fontFamily="Georgia, serif" fontStyle="italic">Acme Labs, San Francisco, CA</text>
      <rect x="16" y="97" width="160" height="2.8" rx="0.5" fill="#e2e8f0" />
      <rect x="16" y="102" width="148" height="2.8" rx="0.5" fill="#e2e8f0" />
      <rect x="16" y="107" width="154" height="2.8" rx="0.5" fill="#e2e8f0" />

      <text x="12" y="118" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif">Product Designer</text>
      <text x="188" y="118" fontSize="5.5" fill="#64748b" fontFamily="Georgia, serif" textAnchor="end">2018 – 2021</text>
      <text x="12" y="126" fontSize="6" fill="#475569" fontFamily="Georgia, serif" fontStyle="italic">Northwind, New York, NY</text>
      <rect x="16" y="131" width="155" height="2.8" rx="0.5" fill="#e2e8f0" />
      <rect x="16" y="136" width="140" height="2.8" rx="0.5" fill="#e2e8f0" />

      {/* CORE SKILLS */}
      <text x="12" y="149" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" letterSpacing="0.8">CORE SKILLS</text>
      <rect x="12" y="152" width="176" height="0.8" fill="#0f172a" />
      <rect x="12" y="158" width="176" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="163" width="140" height="3" rx="0.5" fill="#e2e8f0" />

      {/* EDUCATION */}
      <text x="12" y="176" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" letterSpacing="0.8">EDUCATION</text>
      <rect x="12" y="179" width="176" height="0.8" fill="#0f172a" />
      <text x="12" y="188" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif">BFA, Graphic Design</text>
      <text x="188" y="188" fontSize="5.5" fill="#64748b" fontFamily="Georgia, serif" textAnchor="end">2014 – 2018</text>
      <text x="12" y="196" fontSize="6" fill="#475569" fontFamily="Georgia, serif" fontStyle="italic">State University, Boston, MA</text>

      {/* LANGUAGES */}
      <text x="12" y="208" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" letterSpacing="0.8">LANGUAGES</text>
      <rect x="12" y="211" width="176" height="0.8" fill="#0f172a" />
      <text x="12" y="220" fontSize="6" fill="#475569" fontFamily="Georgia, serif">English (Native)  ·  French (Professional)</text>
    </svg>
  );
}

function TemplatePreviewSvg({ templateId }: { templateId: string }) {
  if (templateId === "harshibar-ats") return <HarshibarPreviewSvg />;
  return <ClassicProPreviewSvg />;
}

/* ── Template card ───────────────────────────────────────────────── */

const TEMPLATE_META: Record<string, { isAts: boolean; isNew?: boolean; tag?: string }> = {
  "harshibar-ats":   { isAts: true,  isNew: true, tag: "Modern" },
  "ats-professional": { isAts: true,  tag: "Classic" },
};

function TemplateCard({
  template,
  selected,
  onClick,
}: {
  template: ResumeStyleTemplate;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = TEMPLATE_META[template.id] ?? {};
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: 0,
        borderRadius: 12,
        border: selected
          ? "2.5px solid var(--accent)"
          : hovered
          ? "2px solid var(--border-h)"
          : "1.5px solid var(--border)",
        background: "var(--surface)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        boxShadow: selected
          ? "0 0 0 3px rgba(47,129,247,0.15), var(--shadow-sm)"
          : hovered
          ? "var(--shadow)"
          : "var(--shadow-sm)",
        transform: hovered && !selected ? "translateY(-1px)" : "none",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Badges */}
      <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 5, zIndex: 2 }}>
        {meta.isNew && (
          <span style={{
            padding: "2px 7px", borderRadius: 99,
            background: "#f59e0b", color: "#fff",
            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
          }}>New</span>
        )}
      </div>

      {/* Selected checkmark */}
      {selected && (
        <div style={{
          position: "absolute", top: 8, right: 8, zIndex: 2,
          width: 20, height: 20, borderRadius: "50%",
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Preview area */}
      <div style={{
        background: "#f8fafc",
        borderBottom: "1px solid var(--border)",
        padding: "10px 10px 0",
        overflow: "hidden",
      }}>
        <div style={{
          boxShadow: "0 2px 8px rgba(15,23,42,0.10), 0 1px 2px rgba(15,23,42,0.08)",
          borderRadius: "2px 2px 0 0",
          overflow: "hidden",
        }}>
          <TemplatePreviewSvg templateId={template.id} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 12px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--text)",
            letterSpacing: -0.2, lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {template.label}
          </div>
          {meta.tag && (
            <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{meta.tag}</div>
          )}
        </div>
        {meta.isAts && (
          <span style={{
            flexShrink: 0,
            padding: "2px 7px", borderRadius: 99,
            border: "1px solid rgba(52,211,153,0.35)",
            background: "rgba(52,211,153,0.08)",
            color: "var(--green)",
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
          }}>
            ATS
          </span>
        )}
      </div>
    </button>
  );
}

/* ── Segmented control ───────────────────────────────────────────── */

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
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: -0.1, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{
        display: "flex",
        background: "var(--surface2)",
        borderRadius: 8,
        padding: 2,
        gap: 2,
      }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: active ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--accent)" : "var(--muted)",
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: -0.2,
                transition: "all 0.12s",
                whiteSpace: "nowrap",
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

/* ── Main component ──────────────────────────────────────────────── */

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
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexWrap: "wrap",
        }}
      >
        <Segmented<LineSpacingChoice>
          label="Line spacing"
          options={["1", "1.15", "1.5"] as const}
          value={lineSpacing}
          onChange={setLineSpacing}
          formatLabel={(v) => v === "1" ? "1.0 Single" : v === "1.15" ? "1.15 Default" : "1.5 More space"}
        />
        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
        <Segmented<MarginInchesChoice>
          label="Margins"
          options={["0.5", "0.75", "1"] as const}
          value={marginIn}
          onChange={setMarginIn}
          formatLabel={(v) => `${v}" ${v === "0.5" ? "Narrow" : v === "0.75" ? "Normal" : "Wide"}`}
        />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onReset}
          style={{
            background: "none", border: "none",
            color: "var(--muted)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", textDecoration: "underline",
            fontFamily: "inherit", textUnderlineOffset: 2,
          }}
        >
          Reset &amp; start over
        </button>
        <button
          type="button"
          onClick={onContinue}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: -0.2,
            display: "flex", alignItems: "center", gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-h)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; }}
        >
          Continue
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2.5 6.5h8M7 3l3.5 3.5L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Body: template grid + live preview ──────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}>

        {/* Template gallery */}
        <div
          style={{
            flex: "0 0 min(520px, 52vw)",
            minWidth: 300,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {/* Gallery header */}
          <div style={{ padding: "20px 24px 16px", flexShrink: 0 }}>
            <h1 style={{
              fontSize: 20, fontWeight: 700, letterSpacing: -0.5,
              color: "var(--text)", margin: "0 0 4px", lineHeight: 1.25,
            }}>
              Select a template
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              Pick a layout — preview updates live on the right. Spacing and margins apply to the final PDF.
            </p>
          </div>

          {/* Template grid */}
          <div
            style={{
              flex: 1, minHeight: 0, overflowY: "auto",
              padding: "0 24px 32px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 16,
              }}
            >
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={styleFolder === t.referenceFolder}
                  onClick={() => setStyleFolder(t.referenceFolder)}
                />
              ))}
            </div>

            <p style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.5, marginTop: 20 }}>
              Final PDF uses your LaTeX reference on the server ({styleFolder}). More layouts can be registered in{" "}
              <code style={{ fontSize: 10 }}>web/lib/resumeTemplates.ts</code>.
            </p>
          </div>
        </div>

        {/* Live resume preview */}
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
          {/* Preview header */}
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
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} aria-hidden />
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

          {/* Paper preview */}
          <div style={{
            flex: 1, minHeight: 0, overflowY: "auto",
            padding: "28px 32px 48px",
            display: "flex",
            justifyContent: "center",
          }}>
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
    </div>
  );
}
