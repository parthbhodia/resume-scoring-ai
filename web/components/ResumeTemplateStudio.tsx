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
/** Same key as `ResumeBuilder` draft — keeps layout choice in sync when returning from the gallery. */
const RN_BUILDER_DRAFT_KEY = "rn_builder_draft";

function persistTemplateStyleChoice(folder: string): void {
  try {
    sessionStorage.setItem(STYLE_REF_KEY, folder);
    const prev = JSON.parse(sessionStorage.getItem(RN_BUILDER_DRAFT_KEY) ?? "{}");
    sessionStorage.setItem(
      RN_BUILDER_DRAFT_KEY,
      JSON.stringify({ ...prev, styleReferenceFolder: folder }),
    );
  } catch {
    /* quota / private mode */
  }
}

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
      <text x="12" y="21" fontSize="10.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Jennifer Jobscan</text>
      <text x="12" y="31" fontSize="5.5" fill="#475569" fontFamily="Arial, sans-serif">jennifer@example.com  ·  (555) 010-2030  ·  San Francisco, CA</text>
      <line x1="12" y1="36" x2="188" y2="36" stroke="#0f172a" strokeWidth="0.8" />

      <text x="12" y="47" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">WORK EXPERIENCE</text>
      <line x1="12" y1="50" x2="188" y2="50" stroke="#cbd5e1" strokeWidth="0.4" />
      <text x="12" y="59" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Senior Product Designer</text>
      <text x="188" y="59" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">2021 – Present</text>
      <text x="12" y="67" fontSize="6" fill="#475569" fontFamily="Arial, sans-serif">Acme Labs · San Francisco, CA</text>
      <rect x="16" y="72" width="164" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="77" width="148" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="82" width="156" height="3" rx="1" fill="#e2e8f0" />
      <text x="12" y="94" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Product Designer</text>
      <text x="188" y="94" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">2018 – 2021</text>
      <text x="12" y="102" fontSize="6" fill="#475569" fontFamily="Arial, sans-serif">Northwind · New York, NY</text>
      <rect x="16" y="107" width="150" height="3" rx="1" fill="#e2e8f0" />
      <rect x="16" y="112" width="130" height="3" rx="1" fill="#e2e8f0" />

      <text x="12" y="124" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">CORE SKILLS</text>
      <line x1="12" y1="127" x2="188" y2="127" stroke="#cbd5e1" strokeWidth="0.4" />
      <rect x="12" y="132" width="176" height="3" rx="1" fill="#e2e8f0" />
      <rect x="12" y="137" width="140" height="3" rx="1" fill="#e2e8f0" />

      <text x="12" y="149" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif" letterSpacing="1">EDUCATION</text>
      <line x1="12" y1="152" x2="188" y2="152" stroke="#cbd5e1" strokeWidth="0.4" />
      <text x="12" y="161" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">BFA, Graphic Design</text>
      <text x="188" y="161" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">2014 – 2018</text>
      <text x="12" y="169" fontSize="6" fill="#475569" fontFamily="Arial, sans-serif">State University</text>
    </svg>
  );
}

function ClassicProPreviewSvg() {
  return (
    <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="200" height="260" fill="#ffffff" />
      <text x="100" y="20" fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" textAnchor="middle" letterSpacing="1">JENNIFER JOBSCAN</text>
      <text x="100" y="29" fontSize="5.5" fill="#475569" fontFamily="Georgia, serif" textAnchor="middle">jennifer@example.com  ·  (555) 010-2030  ·  San Francisco, CA</text>
      <rect x="12" y="34" width="176" height="1.2" fill="#0f172a" />

      <text x="100" y="45" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" textAnchor="middle" letterSpacing="0.8">PROFESSIONAL SUMMARY</text>
      <rect x="12" y="49" width="176" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="54" width="160" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="59" width="170" height="3" rx="0.5" fill="#e2e8f0" />

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

      <text x="12" y="149" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" letterSpacing="0.8">CORE SKILLS</text>
      <rect x="12" y="152" width="176" height="0.8" fill="#0f172a" />
      <rect x="12" y="158" width="176" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="163" width="140" height="3" rx="0.5" fill="#e2e8f0" />

      <text x="12" y="176" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif" letterSpacing="0.8">EDUCATION</text>
      <rect x="12" y="179" width="176" height="0.8" fill="#0f172a" />
      <text x="12" y="188" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia, serif">BFA, Graphic Design</text>
      <text x="188" y="188" fontSize="5.5" fill="#64748b" fontFamily="Georgia, serif" textAnchor="end">2014 – 2018</text>
      <text x="12" y="196" fontSize="6" fill="#475569" fontFamily="Georgia, serif" fontStyle="italic">State University, Boston, MA</text>
    </svg>
  );
}

function MaltaModernPreviewSvg() {
  return (
    <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="200" height="260" fill="#ffffff" />
      {/* Name + contact */}
      <text x="12" y="20" fontSize="10.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Jennifer Jobscan</text>
      <text x="12" y="29" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif">jennifer@example.com  ·  (555) 010-2030  ·  San Francisco, CA</text>
      {/* Bio */}
      <rect x="12" y="34" width="176" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="12" y="39" width="155" height="2.8" rx="1" fill="#e2e8f0" />

      {/* WORK EXPERIENCE — accent header */}
      <text x="12" y="53" fontSize="6.5" fontWeight="700" fill="#E25822" fontFamily="Arial, sans-serif" letterSpacing="0.6">WORK EXPERIENCE</text>
      <line x1="12" y1="56" x2="188" y2="56" stroke="#E25822" strokeWidth="0.7" />
      <text x="12" y="65" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Senior Product Designer</text>
      <text x="12" y="72" fontSize="5.8" fill="#64748b" fontFamily="Arial, sans-serif" fontStyle="italic">at Acme Labs</text>
      <text x="188" y="65" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">2021 – Present</text>
      <text x="12" y="79" fontSize="5.5" fill="#94a3b8" fontFamily="Arial, sans-serif">Tags: Figma, React, Design Systems</text>
      <rect x="16" y="83" width="158" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="16" y="88" width="144" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="16" y="93" width="151" height="2.8" rx="1" fill="#e2e8f0" />
      <text x="12" y="104" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">Product Designer</text>
      <text x="12" y="111" fontSize="5.8" fill="#64748b" fontFamily="Arial, sans-serif" fontStyle="italic">at Northwind</text>
      <text x="188" y="104" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">2018 – 2021</text>
      <rect x="16" y="115" width="148" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="16" y="120" width="134" height="2.8" rx="1" fill="#e2e8f0" />

      {/* SKILLS — accent header + multi-col */}
      <text x="12" y="133" fontSize="6.5" fontWeight="700" fill="#E25822" fontFamily="Arial, sans-serif" letterSpacing="0.6">CORE SKILLS</text>
      <line x1="12" y1="136" x2="188" y2="136" stroke="#E25822" strokeWidth="0.7" />
      <rect x="12" y="140" width="52" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="72" y="140" width="52" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="132" y="140" width="52" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="12" y="145" width="52" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="72" y="145" width="52" height="2.8" rx="1" fill="#e2e8f0" />
      <rect x="132" y="145" width="52" height="2.8" rx="1" fill="#e2e8f0" />

      {/* EDUCATION — accent header */}
      <text x="12" y="158" fontSize="6.5" fontWeight="700" fill="#E25822" fontFamily="Arial, sans-serif" letterSpacing="0.6">EDUCATION</text>
      <line x1="12" y1="161" x2="188" y2="161" stroke="#E25822" strokeWidth="0.7" />
      <text x="12" y="170" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial, sans-serif">BFA, Graphic Design</text>
      <text x="188" y="170" fontSize="5.5" fill="#64748b" fontFamily="Arial, sans-serif" textAnchor="end">2014 – 2018</text>
      <text x="12" y="178" fontSize="5.8" fill="#64748b" fontFamily="Arial, sans-serif" fontStyle="italic">State University</text>
    </svg>
  );
}

function TemplatePreviewSvg({ templateId }: { templateId: string }) {
  if (templateId === "harshibar-ats") return <HarshibarPreviewSvg />;
  if (templateId === "malta-modern") return <MaltaModernPreviewSvg />;
  return <ClassicProPreviewSvg />;
}

/* ── Template card ───────────────────────────────────────────────── */

const TEMPLATE_META: Record<string, { isAts: boolean; isNew?: boolean; tag?: string; blurb?: string }> = {
  "harshibar-ats":   { isAts: true,  isNew: true, tag: "Modern",  blurb: "Sans-serif, modern layout. Great for tech and design roles." },
  "ats-professional": { isAts: true,  tag: "Classic", blurb: "Serif, traditional layout. Ideal for business and academic roles." },
  "malta-modern":    { isAts: true,  isNew: true, tag: "Colorful", blurb: "Accent-color headers, bio block, multi-column skills. Stands out while staying ATS-safe." },
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
        flexDirection: "row",
        alignItems: "stretch",
        padding: 0,
        borderRadius: 12,
        border: selected
          ? "2.5px solid var(--accent)"
          : hovered
          ? "2px solid var(--border-h, var(--border))"
          : "1.5px solid var(--border)",
        background: "var(--surface)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected
          ? "0 0 0 3px rgba(47,129,247,0.15), var(--shadow-sm)"
          : hovered
          ? "var(--shadow)"
          : "var(--shadow-sm)",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {/* Thumbnail — left column */}
      <div style={{
        flex: "0 0 110px",
        background: "#f8fafc",
        borderRight: "1px solid var(--border)",
        padding: "8px 8px 0",
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-start",
      }}>
        <div style={{
          width: "100%",
          boxShadow: "0 2px 6px rgba(15,23,42,0.10)",
          borderRadius: "2px 2px 0 0",
          overflow: "hidden",
        }}>
          <TemplatePreviewSvg templateId={template.id} />
        </div>
      </div>

      {/* Info — right column */}
      <div style={{ flex: 1, padding: "14px 14px 14px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2 }}>
            {template.label}
          </span>
          {meta.isNew && (
            <span style={{
              padding: "2px 7px", borderRadius: 99,
              background: "#f59e0b", color: "#fff",
              fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            }}>New</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {meta.tag && (
            <span style={{ fontSize: 11, color: "var(--dim)" }}>{meta.tag}</span>
          )}
          {meta.isAts && (
            <span style={{
              padding: "2px 7px", borderRadius: 99,
              border: "1px solid rgba(52,211,153,0.35)",
              background: "rgba(52,211,153,0.08)",
              color: "var(--green)",
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
            }}>ATS</span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
          {meta.blurb ?? template.description}
        </p>
      </div>

      {/* Selected checkmark */}
      {selected && (
        <div style={{
          position: "absolute", top: 10, right: 10, zIndex: 2,
          width: 22, height: 22, borderRadius: "50%",
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5l2.5 2.5L9 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  );
}

/* ── Formatted resume preview ────────────────────────────────────── */

function FormattedResumePreview({ text, lineHeight, styleFolder }: { text: string; lineHeight: number; styleFolder: string }) {
  const isHarshibar = styleFolder === "Harshibar_Template1";
  const isMalta = styleFolder === "MaltaCV_Modern";
  const font = isHarshibar || isMalta
    ? "'Inter', 'Helvetica Neue', Arial, sans-serif"
    : "'Georgia', 'Times New Roman', serif";
  const accentColor = isMalta ? "#E25822" : "#0f172a";

  const lines = text.split("\n");

  const isHeader = (line: string) => {
    const t = line.trim();
    return t.length > 2 && t === t.toUpperCase() && /[A-Z]/.test(t) && !t.startsWith("•") && !t.startsWith("-");
  };

  const isContactLine = (line: string, idx: number) => {
    if (idx === 0) return false;
    const t = line.trim();
    return idx <= 3 && !isHeader(t) && (t.includes("@") || t.includes("·") || t.includes("|") || /^\(?\d/.test(t));
  };

  const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);

  return (
    <div style={{ fontFamily: font, fontSize: 11, lineHeight, color: "#0f172a" }}>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: lineHeight * 5 }} />;

        // Name line
        if (i === firstNonEmpty) {
          if (isMalta) {
            return (
              <div key={i} style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginBottom: 2, lineHeight: 1.15, color: "#0f172a" }}>
                {t}
              </div>
            );
          }
          return isHarshibar ? (
            <div key={i} style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, marginBottom: 2, lineHeight: 1.15, color: "#0f172a" }}>
              {t}
            </div>
          ) : (
            <div key={i} style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.5, textAlign: "center", marginBottom: 2, lineHeight: 1.2, textTransform: "uppercase", color: "#0f172a" }}>
              {t}
            </div>
          );
        }

        // Contact line
        if (isContactLine(line, i - firstNonEmpty)) {
          return (
            <div key={i} style={{ fontSize: 9.5, color: "#475569", marginBottom: 2, letterSpacing: 0.1, textAlign: (!isHarshibar && !isMalta) ? "center" : "left" }}>
              {t}
            </div>
          );
        }

        // Section header
        if (isHeader(t)) {
          return (
            <div key={i} style={{ marginTop: lineHeight * 8, marginBottom: 4 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: isMalta ? 0.6 : isHarshibar ? 1.4 : 0.8, color: accentColor }}>{t}</div>
              <div style={{ height: isMalta ? 0.7 : isHarshibar ? 0.75 : 0.9, background: accentColor, marginTop: 3 }} />
            </div>
          );
        }

        // Bullet
        if (t.startsWith("•") || t.startsWith("-")) {
          return (
            <div key={i} style={{ fontSize: 10, paddingLeft: 13, position: "relative", marginBottom: 2, color: "#1e293b" }}>
              <span style={{ position: "absolute", left: 3 }}>•</span>
              {t.replace(/^[•\-]\s*/, "")}
            </div>
          );
        }

        // Body line
        return (
          <div key={i} style={{ fontSize: 10, marginBottom: 2, color: isMalta ? "#555555" : "#1e293b", fontStyle: !isHarshibar && !isMalta && t.includes("|") ? "italic" : "normal" }}>
            {t}
          </div>
        );
      })}
    </div>
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
  const fromResume = (params?.get("fromResume") ?? "").trim() === "1";

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
    // Store style prefs — profile text is collected on the next screen
    try {
      persistTemplateStyleChoice(styleFolder);
      sessionStorage.setItem(RN_LINE_SPACING_KEY, lineSpacing);
      sessionStorage.setItem(RN_MARGIN_IN_KEY, marginIn);
    } catch { /* quota */ }
    const q = new URLSearchParams();
    q.set("view", "content-source");
    if (base) q.set("base", base);
    router.push(`/?${q.toString()}`);
  }, [router, styleFolder, lineSpacing, marginIn, base]);

  const selectStyleFolder = useCallback((folder: string) => {
    setStyleFolder(folder);
    persistTemplateStyleChoice(folder);
  }, []);

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
      {fromResume ? (
        <div
          role="region"
          aria-label="How template changes apply"
          style={{
            flexShrink: 0,
            padding: "12px 24px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(59, 130, 246, 0.08)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.5, maxWidth: 720 }}>
            <strong>Layout gallery</strong> — the preview on the right shows typography for the selected layout.
            Your <strong>exported PDF</strong> updates only after you return to the résumé builder and run{" "}
            <strong>Generate PDF</strong> again with this layout selected.
          </p>
          <button
            type="button"
            onClick={() => router.push("/?view=builder&flow=tailor")}
            style={{
              flexShrink: 0,
              padding: "10px 18px",
              minHeight: 44,
              borderRadius: 10,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: -0.2,
            }}
          >
            Back to my résumé
          </button>
        </div>
      ) : null}

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

          {/* Template list — single column, stacked */}
          <div
            style={{
              flex: 1, minHeight: 0, overflowY: "auto",
              padding: "0 24px 32px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={styleFolder === t.referenceFolder}
                onClick={() => selectStyleFolder(t.referenceFolder)}
              />
            ))}
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
              }}
            >
              <FormattedResumePreview key={styleFolder} text={previewBody} lineHeight={lh} styleFolder={styleFolder} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
