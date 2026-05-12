"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import BulletImprovedEditor from "@/components/BulletImprovedEditor";
import { highlightMetricSpans } from "@/lib/highlightResumeMetrics";
import {
  bulletMatchesAnalysisCategory,
} from "@/lib/analysisCategoryMatch";
import { looksLikeStructuredEmploymentLine } from "@/lib/profileFromResumeText";

export interface LiveBulletItem {
  originalBullet: string;
  score: number;
  issues: string[];
  improvedBullet: string;
}

export type Block =
  | { type: "header"; lines: string[] }
  | { type: "section"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "bullets"; items: Array<{ rawLine: string; bulletIdx: number }> };

/** Known resume section titles (full trimmed line). Strict mode avoids mistaking ALL-CAPS names for sections. */
const KNOWN_SECTIONS =
  /^(?:EXPERIENCE|WORK\s+HISTORY|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|PROFESSIONAL\s+HISTORY|EMPLOYMENT(?:\s+HISTORY)?|CAREER(?:\s+HISTORY|\s+OVERVIEW|\s+SUMMARY)?|EDUCATION|SKILLS|SUMMARY|PROFILE|PROJECTS|CERTIFICATIONS|AWARDS|PUBLICATIONS|LANGUAGES|VOLUNTEER|PROFESSIONAL\s+SUMMARY|TECHNICAL\s+SKILLS|ACHIEVEMENTS?|REFERENCES|OBJECTIVE|ACTIVITIES|HONORS|LEADERSHIP|INTERESTS|EXTRACURRICULAR)\s*$/iu;

/** Exported for AnnotatedResumePanel extract heuristics (identity line vs lone section heading). */
export function lineLooksLikeStandaloneSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 72) return false;
  return KNOWN_SECTIONS.test(t);
}

/** PDF / editor noise + unicode bullets that should end the name block. */
function normalizeExtractLine(raw: string): string {
  return raw.replace(/\ufeff/g, "").trim();
}

const BULLET_LINE_START =
  /^[\s\uFEFF]*(?:[-*•●◦‧·・‣⁃▪►➤○⚫—–‑]|\d{1,2}[\).\]])/u;

function lineLooksLikeBulletLead(line: string): boolean {
  return BULLET_LINE_START.test(normalizeExtractLine(line));
}

function looksLikeSectionHeading(line: string, strict = false): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  // In strict mode (used for first-line header detection), only match known section keywords.
  // This prevents "JOHN DOE" or "PARTH BHODIA" from being misidentified as section headings.
  if (strict) return KNOWN_SECTIONS.test(t);
  if (/[A-Z]/.test(t) && t === t.toUpperCase() && !/^\d/.test(t)) return true;
  if (KNOWN_SECTIONS.test(t)) return true;
  return false;
}

export function normalizeForMatch(s: string): string {
  return s
    .replace(/•/g, "•")
    .replace(/^\s*[•*·\-–—]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * PDF text sometimes loses spaces between words. Display-only heuristic: split camelCase
 * and add a space after punctuation when missing (does not change stored bullets).
 */
export function softenRunOnExtractLine(s: string): string {
  const t0 = s.trim();
  const glueFix = (u: string) => {
    let y = u;
    y = y.replace(
      /([a-z])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=\d|[\s,;–—]|$)/gi,
      "$1 $2",
    );
    y = y.replace(
      /([A-Z])(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=\d|[\s,;–—]|$)/g,
      "$1 $2",
    );
    y = y.replace(/([A-Za-z])(May)(?=\d)/g, "$1 $2");
    y = y.replace(/\|(?=[A-Za-z])/g, "| ");
    return y;
  };
  let t = glueFix(t0);
  if (t.length < 36) {
    return t !== t0 ? (s.includes(t0) ? s.replace(t0, t) : t) : s;
  }
  const spaceCount = (t.match(/\s/g) ?? []).length;
  if (spaceCount / t.length > 0.035) {
    return t !== t0 ? (s.includes(t0) ? s.replace(t0, t) : t) : s;
  }
  let x = t;
  x = x.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  x = x.replace(/([,;:])([^\s\d])/g, "$1 $2");
  x = x.replace(/\s{2,}/g, " ");
  if (x !== t0) {
    return s.includes(t0) ? s.replace(t0, x) : x;
  }
  return s;
}

export function findBulletIndexForLine(
  line: string,
  bulletAnalysis: LiveBulletItem[],
): number {
  const trimmed = normalizeExtractLine(line);
  if (trimmed.length < 4) return -1;
  /* Experience metadata must stay in paragraph / EntryHeader rows — not bulletAnalysis rows. */
  if (looksLikeEntryHeader(trimmed)) return -1;
  if (looksLikeStructuredEmploymentLine(trimmed)) return -1;
  if (looksLikeLoneJobTitleLine(trimmed)) return -1;

  const ln = normalizeForMatch(line);
  if (ln.length < 4) return -1;

  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < bulletAnalysis.length; i++) {
    const b = normalizeForMatch(bulletAnalysis[i].originalBullet);
    if (!b || b.length < 4) continue;
    let s = 0;
    if (ln === b) s = 100;
    else if (ln.includes(b) || b.includes(ln)) {
      s = Math.min(80, (Math.min(ln.length, b.length) / Math.max(ln.length, b.length)) * 90);
      // Short tail fragments score poorly on length ratio — upgrade if the
      // line is a true suffix of the bullet (wrapped continuation line).
      if (s < 55 && ln.length >= 6 && b.endsWith(ln)) s = 60;
    } else {
      const p = Math.min(24, b.length - 1);
      if (ln.slice(0, p) === b.slice(0, p) && p >= 12) s = 55;
      else if (ln.length >= 6 && b.endsWith(ln)) s = 60;
    }
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return bestScore >= 55 ? best : -1;
}

export function buildBlocks(lines: string[], bulletAnalysis: LiveBulletItem[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  const header: string[] = [];
  while (i < lines.length && header.length < 12) {
    const line = lines[i];
    if (findBulletIndexForLine(line, bulletAnalysis) >= 0) break;
    const t = line.trim();
    if (t === "") {
      if (header.length >= 2) { i++; break; }
      i++;
      continue;
    }
    // Stop at any known section keyword — strict so names like "PARTH BHODIA" aren't mistaken.
    if (looksLikeSectionHeading(t, true)) break;
    if (lineLooksLikeBulletLead(line)) break;
    if (!isPlaceholderIdentityLine(line)) header.push(line);
    i++;
  }
  if (header.length) blocks.push({ type: "header", lines: header });

  while (i < lines.length) {
    const idx = findBulletIndexForLine(lines[i], bulletAnalysis);
    if (idx >= 0) {
      const items: Array<{ rawLine: string; bulletIdx: number }> = [];
      while (i < lines.length) {
        const ti = lines[i].trim();
        if (ti === "") { i++; continue; }
        const j = findBulletIndexForLine(lines[i], bulletAnalysis);
        if (j < 0) break;
        if (isPlaceholderIdentityLine(lines[i])) {
          i++;
          continue;
        }
        items.push({ rawLine: lines[i], bulletIdx: j });
        i++;
      }
      if (items.length) blocks.push({ type: "bullets", items });
    } else {
      const t = lines[i].trim();
      if (!t) { i++; continue; }
      if (looksLikeSectionHeading(t)) {
        if (!isPlaceholderIdentityLine(lines[i])) {
          blocks.push({ type: "section", text: t });
        }
        i++;
        continue;
      }
      const para: string[] = [];
      while (i < lines.length) {
        const ti = lines[i].trim();
        if (!ti) break;
        if (findBulletIndexForLine(lines[i], bulletAnalysis) >= 0) break;
        if (looksLikeSectionHeading(ti)) break;
        if (isPlaceholderIdentityLine(lines[i])) {
          i++;
          continue;
        }
        para.push(lines[i]);
        i++;
      }
      if (para.length) blocks.push({ type: "paragraph", lines: para });
    }
  }

  if (!blocks.length) {
    const nonempty = lines.map(l => l.trimEnd()).filter(l => l.trim());
    if (nonempty.length) blocks.push({ type: "paragraph", lines: nonempty });
  }
  return blocks;
}

/** Mirrors backend `_CONTACT_ANCHOR` — find identity block when PDF line order is wrong. */
const HEADER_CONTACT_ANCHOR =
  /@|linkedin\.com\/|www\.linkedin\.com\/|github\.com\/|www\.github\.com\/|\bportfolio\b|\bsite\b|\bmobile\b|\bphone\b|[\[(]?\d{3}[\])]?[\s.-]?\d{3}[\s.-]?\d{4}/i;

const HEADER_JOB_ROLE =
  /\b(Engineer|Developer|Architect|Scientist|Analyst|Designer|Consultant|Specialist|Manager|Director|Lead|Intern|Associate|Executive)\b/i;

function stripHeaderCandidateLines(lines: string[], start: number, end: number): string[] {
  const out: string[] = [];
  const lo = Math.max(0, start);
  const hi = Math.min(lines.length, end);
  for (let j = lo; j < hi; j++) {
    const line = normalizeExtractLine(lines[j]);
    if (!line) {
      if (out.length >= 2) break;
      continue;
    }
    if (KNOWN_SECTIONS.test(line)) continue;
    if (lineLooksLikeBulletLead(line)) continue;
    if (line.length > 180) continue;
    if (/%|↑|€|\$\d/.test(line)) continue;
    out.push(line);
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}

function headerWindow(lines: string[], centerIdx: number, before: number, after: number): string[] {
  return stripHeaderCandidateLines(lines, centerIdx - before, centerIdx + after);
}

function looksLikeAllCapsPersonName(line: string): boolean {
  const t = line.trim();
  const words = t.split(/\s+/).filter(Boolean).map((w) => w.replace(/[''-]/g, ""));
  if (words.length < 2 || words.length > 5 || t.length > 48) return false;
  if (!/^[A-Za-z]/.test(words[0])) return false;
  const capsWords = words.filter((w) => w.length > 1 && w === w.toUpperCase());
  if (capsWords.length < 2) return false;
  return !KNOWN_SECTIONS.test(t);
}

function looksLikeTitlePersonName(line: string): boolean {
  const t = line.trim();
  if (t.length < 5 || t.length > 44) return false;
  if (HEADER_JOB_ROLE.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  const tokenOk = (w: string) => /^[A-Z][a-z]+(?:-[A-Z][a-z]+)*$/.test(w.replace(/[''.,]/g, ""));
  if (!words.every(tokenOk)) return false;
  return !KNOWN_SECTIONS.test(t);
}

/** Collapse odd spaces / unicode so “N ⁄ A” and NBSP variants match N/A heuristics. */
function collapseForPlaceholderMatch(raw: string): string {
  const s = (raw.normalize?.("NFKC") ?? raw)
    .replace(/\ufeff/g, "")
    .replace(/[\u00a0\u2000-\u200b\u202f\u2060]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** PDF / model sometimes emits a bogus first “name” line — never treat as display title. */
export function isPlaceholderIdentityLine(line: string): boolean {
  const t = collapseForPlaceholderMatch(normalizeExtractLine(line));
  if (!t) return true;
  // N/A with ASCII slash, fraction slash (U+2044), division slash, thin spaces, etc.
  if (/^(?:n[\s./\u2044\u2215\u2013-]*a\.?|not\s+applicable|tbd|none|null|—|--|\.\.\.|unknown|undefined|\?)$/i.test(t)) return true;
  // Lines that are only punctuation / separators (common PDF junk)
  if (/^[\s\-–—_.\/\\|]+$/i.test(t)) return true;
  return false;
}

/** Drop placeholder tokens anywhere in API/inferred header arrays (not only first line). */
function sanitizeHeaderLineArray(lines: string[]): string[] {
  return lines
    .map((s) => normalizeExtractLine(s))
    .filter((l) => l.length > 0 && !isPlaceholderIdentityLine(l));
}

/** PDF extract often wraps one logical bullet across lines; keep a single row per bullet index. */
function collapseAdjacentSameBulletRows(
  items: Array<{ rawLine: string; bulletIdx: number }>,
  bullets: LiveBulletItem[],
): Array<{ rawLine: string; bulletIdx: number }> {
  const out: Array<{ rawLine: string; bulletIdx: number }> = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && prev.bulletIdx === it.bulletIdx) {
      const canon = bullets[it.bulletIdx]?.originalBullet?.trim();
      prev.rawLine = canon && canon.length > 0 ? canon : `${prev.rawLine} ${it.rawLine}`.replace(/\s+/g, " ").trim();
      continue;
    }
    out.push({ rawLine: it.rawLine, bulletIdx: it.bulletIdx });
  }
  return out;
}

/** Client replay of `_extract_resume_header` when API `resumeHeader` is missing or stale. */
function inferResumeHeaderFromExtract(text: string): string[] {
  if (!text?.trim()) return [];
  const lines = text.split(/\r?\n/).map(normalizeExtractLine);

  const primary: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (primary.length >= 2) break;
      continue;
    }
    if (KNOWN_SECTIONS.test(line)) break;
    if (lineLooksLikeBulletLead(line)) break;
    if (primary.length === 0 && isPlaceholderIdentityLine(line)) continue;
    if (!isPlaceholderIdentityLine(line)) primary.push(line);
    if (primary.length >= 6) break;
  }
  if (primary.length > 0) return sanitizeHeaderLineArray(primary).slice(0, 6);

  const limit = Math.min(220, lines.length);
  let best: string[] = [];
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line || line.length > 200) continue;
    if (HEADER_CONTACT_ANCHOR.test(line)) {
      const chunk = headerWindow(lines, i, 10, 6);
      if (chunk.length > best.length) best = chunk;
    }
  }
  if (!best.length) {
    for (let i = 0; i < Math.min(360, lines.length); i++) {
      const line = lines[i];
      if (looksLikeAllCapsPersonName(line) || looksLikeTitlePersonName(line)) {
        best = headerWindow(lines, i, 2, 6);
        break;
      }
    }
  }
  if (!best.length) {
    const emailRe = /\S+@\S+\.\S+/;
    for (let i = 0; i < Math.min(400, lines.length); i++) {
      const line = lines[i];
      if (line && emailRe.test(line)) {
        best = headerWindow(lines, i, 10, 6);
        break;
      }
    }
  }
  return sanitizeHeaderLineArray(best).slice(0, 6);
}

/** Shared with AnnotatedResumePanel to prepend identity onto synthetic extracts. */
export function mergeResumeHeaderSources(apiHeader: string[] | undefined, inferBasisFull: string): string[] {
  let api = sanitizeHeaderLineArray(apiHeader ?? []);
  /* One line exactly matching a résumé section is not identity (mis-parsed extracts). */
  if (api.length === 1 && KNOWN_SECTIONS.test(api[0])) {
    api = [];
  }
  if (api.length >= 1) return api.slice(0, 8);
  const inferred = inferResumeHeaderFromExtract(inferBasisFull);
  if (inferred.length) return inferred.slice(0, 8);
  return [];
}

/** Inject centered name/contact when blocks start with EXPERIENCE (or bogus header missing API lines). */
function shouldPrependIdentityHeader(blocks: Block[], headerLines: string[]): boolean {
  if (!headerLines.length) return false;
  const first = blocks[0];
  if (!first) return true;
  if (first.type === "section" || first.type === "bullets" || first.type === "paragraph") return true;
  if (first.type === "header") {
    const blob = first.lines.join(" ").toLowerCase();
    return !headerLines.some(
      (h) => h.trim().length >= 3 && blob.includes(h.trim().toLowerCase()),
    );
  }
  return false;
}

function renderInline(text: string): ReactNode[] {
  const normalized = text.replace(/\\textbf\{([^}]*)\}/g, "**$1**");
  const parts = normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, k) => {
    if (/^\*\*.+\*\*$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
    return <span key={k}>{p}</span>;
  });
}

/**
 * Single-line job title under an employer row (no dates, no pipes) — must not map to bulletAnalysis
 * or it is rendered as a scored bullet (e.g. "Financial Analyst" after "Morgan Stanley …").
 */
function looksLikeLoneJobTitleLine(line: string): boolean {
  const t = normalizeExtractLine(line);
  if (t.length < 4 || t.length > 96) return false;
  if (lineLooksLikeBulletLead(line)) return false;
  if (t.includes("|") || /@/.test(t) || /\d{4}/.test(t)) return false;
  if (KNOWN_SECTIONS.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 10) return false;
  const roleTail =
    /\b(Analyst|Engineer|Developer|Architect|Scientist|Designer|Consultant|Specialist|Manager|Director|Lead|Intern|Associate|Executive|Coordinator|Representative|Officer|Administrator|Planner|Strategist|Researcher|Partner)\b/i;
  const execAbbr = /\b(VP|SVP|EVP|CEO|CTO|CFO|COO|PM|SDE)\b/i;
  if (!roleTail.test(t) && !execAbbr.test(t)) return false;
  const lowerSmall = new Set(["and", "of", "the", "in", "for", "to", "at", "ii", "iii", "iv", "i", "v"]);
  for (const w of words) {
    const lw = w.toLowerCase().replace(/[^a-z]/g, "");
    if (!lw || lowerSmall.has(lw)) continue;
    if (!/^[A-Z]/.test(w)) return false;
  }
  return true;
}

/** True if a line looks like a job/education entry header (title | company | date). */
function looksLikeEntryHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 200) return false;
  if (t.includes("|")) return true;
  if (/\b(19|20)\d{2}\s*[–—\-]\s*((19|20)\d{2}|present|current)/i.test(t)) return true;
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(19|20)\d{2}/i.test(t)) return true;
  // Mid-dot separated entry: "Degree · Institution · Location · Year"
  if (t.includes("·") && t.split("·").length >= 2) return true;
  return false;
}

function EntryHeaderLine({ line }: { line: string }) {
  const t = line.trim();

  if (t.includes("|")) {
    const parts = t.split("|").map(p => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    const isLastDate = /\b(19|20)\d{2}\b/.test(last) || /present|current/i.test(last);
    const mains = isLastDate ? parts.slice(0, -1) : parts;
    const datePart = isLastDate ? last : null;

    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0 8px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: "var(--resume-paper-ink)", fontSize: 10.8, fontFamily: "system-ui, sans-serif" }}>
            {mains[0]}
          </span>
          {mains.slice(1).map((p, i) => (
            <span key={i} style={{ color: "var(--resume-paper-muted)", fontSize: 10, fontStyle: "italic", fontFamily: "system-ui, sans-serif" }}>
              {"·"} {p}
            </span>
          ))}
        </div>
        {datePart && (
          <span style={{ color: "var(--resume-paper-muted)", fontSize: 9.5, fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>
            {datePart}
          </span>
        )}
      </div>
    );
  }

  // Mid-dot separated entry: degree (bold) on line 1, rest (muted/italic) on line 2
  if (t.includes("·")) {
    const parts = t.split("·").map(p => p.trim()).filter(Boolean);
    const title = parts[0];
    const rest = parts.slice(1);
    // Separate trailing year/GPA tokens from the institution/location
    const dateGpaRe = /^(\d{4}|\d\.\d{1,2})$/;
    let metaStart = rest.length;
    for (let i = rest.length - 1; i >= 1; i--) {
      if (dateGpaRe.test(rest[i])) metaStart = i;
      else break;
    }
    const institutionParts = rest.slice(0, metaStart);
    const metaParts = rest.slice(metaStart);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "var(--resume-paper-ink)", fontSize: 10.8, fontFamily: "system-ui, sans-serif" }}>
            {title}
          </span>
          {metaParts.length > 0 && (
            <span style={{ color: "var(--resume-paper-muted)", fontSize: 9.5, fontFamily: "system-ui, sans-serif", flexShrink: 0, whiteSpace: "nowrap" }}>
              {metaParts.join(" · ")}
            </span>
          )}
        </div>
        {institutionParts.length > 0 && (
          <span style={{ color: "var(--resume-paper-muted)", fontSize: 10, fontStyle: "italic", fontFamily: "system-ui, sans-serif" }}>
            {institutionParts.join(" · ")}
          </span>
        )}
      </div>
    );
  }

  // Year-range line without pipe — treat as date/location
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <span style={{ color: "var(--resume-paper-muted)", fontSize: 9.5, fontStyle: "italic", fontFamily: "system-ui, sans-serif" }}>
        {renderInline(t)}
      </span>
    </div>
  );
}

function scoreBorderColor(score: number): string {
  if (score >= 70) return "rgba(52,211,153,0.8)";
  if (score >= 55) return "rgba(245,158,11,0.85)";
  return "rgba(248,113,113,0.85)";
}

function scoreBgTint(score: number, highlighted: boolean, presentationOnly: boolean): string {
  if (presentationOnly) {
    if (highlighted) return "rgba(239,68,68,0.16)";
    if (score >= 70) return "rgba(52,211,153,0.15)";
    if (score >= 55) return "rgba(245,158,11,0.18)";
    return "rgba(248,113,113,0.16)";
  }
  if (highlighted) return "rgba(239,68,68,0.06)";
  if (score >= 70) return "rgba(52,211,153,0.04)";
  if (score >= 55) return "rgba(245,158,11,0.05)";
  return "rgba(248,113,113,0.06)";
}

interface PopupState {
  bulletIdx: number;
  top: number;
  left: number;
}

interface Props {
  extractedText: string;
  /** Prefer full PDF/plain extract for guessing name/contact when the visible doc uses synthetic bullets. */
  headerInferenceText?: string | null;
  resumeHeader?: string[];
  bulletAnalysis: LiveBulletItem[];
  activeCategory: string | null;
  rewriteEdits: Record<number, string>;
  patchBulletRewrite: (bulletIndex: number, value: string | null) => void;
  previewLineOverrides: Record<number, string>;
  patchPreviewLine: (bulletIndex: number, value: string | null) => void;
  selectedBulletIndex?: number | null;
  onBulletLinkedSelect?: (index: number) => void;
  pulseBulletIndex?: number | null;
  presentationOnly?: boolean;
}

export default function AnalyzeLiveResumeBody({
  extractedText,
  headerInferenceText = null,
  resumeHeader,
  bulletAnalysis,
  activeCategory,
  rewriteEdits,
  patchBulletRewrite,
  previewLineOverrides,
  patchPreviewLine,
  selectedBulletIndex = null,
  onBulletLinkedSelect,
  presentationOnly = false,
  pulseBulletIndex = null,
}: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupDraft, setPopupDraft] = useState<string>("");
  const popupRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => {
    const lines = extractedText.split(/\r?\n/).map(normalizeExtractLine);
    const result = buildBlocks(lines, bulletAnalysis);
    const inferBasis = (headerInferenceText ?? "").trim() || extractedText.trim();
    const headerLines = mergeResumeHeaderSources(resumeHeader, inferBasis);
    if (shouldPrependIdentityHeader(result, headerLines)) {
      result.unshift({ type: "header", lines: [...headerLines] });
    }
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      const trimmed8 = lines.slice(0, 8).map((l) => l.trim());
      const firstNonEmpty = lines.map((l) => l.trim()).find((t) => t.length > 0) ?? "";
      const firstLineBulletIdx = firstNonEmpty
        ? findBulletIndexForLine(firstNonEmpty, bulletAnalysis)
        : -1;
      console.log("[ResumePreview] first 8 lines (trimmed):", trimmed8);
      console.log("[ResumePreview] first non-empty line bullet match index:", firstLineBulletIdx);
      console.log("[ResumePreview] blocks[0] (after header fallback):", result[0] ?? null);
    }
    return result;
  }, [extractedText, bulletAnalysis, resumeHeader, headerInferenceText]);

  useEffect(() => {
    if (popup == null) return;
    const bullet = bulletAnalysis[popup.bulletIdx];
    if (!bullet) return;
    setPopupDraft(rewriteEdits[popup.bulletIdx] ?? bullet.improvedBullet ?? "");
  }, [popup, rewriteEdits, bulletAnalysis]);

  useEffect(() => {
    if (!popup) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
    };
    window.addEventListener("mousedown", handler, true);
    return () => window.removeEventListener("mousedown", handler, true);
  }, [popup]);

  useEffect(() => {
    if (!popup) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [popup]);

  const popupBullet = popup != null ? bulletAnalysis[popup.bulletIdx] : null;
  const popupPreviewApplied = popup != null ? previewLineOverrides[popup.bulletIdx] !== undefined : false;

  return (
    <div style={{
      background: "var(--resume-paper-bg)",
      color: "var(--resume-paper-ink)",
      padding: "32px 36px 52px",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: 10.8,
      lineHeight: 1.45,
      minHeight: 120,
      overflowWrap: "anywhere",
      wordBreak: "break-word",
    }}>
      <style>{`
        @keyframes az-mirror-pulse {
          0%   { outline: 2px solid rgba(234,179,8,0.95); outline-offset: 1px; }
          100% { outline: 2px solid transparent; outline-offset: 8px; }
        }
        .az-resume-bullet {
          position: relative;
          padding: 4px 8px 4px 12px;
          border-radius: 3px;
          margin-bottom: 3px;
          cursor: default;
          transition: background 0.12s;
        }
        .az-resume-bullet::before {
          content: "•";
          position: absolute;
          left: 1px;
          top: 4px;
          color: var(--resume-paper-dim);
          font-size: 10px;
          line-height: 1.45;
        }
        /* Clean PDF export — strip all annotation chrome */
        .az-clean-export .az-resume-bullet {
          border-left-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
          animation: none !important;
        }
        .az-clean-export .az-score-badge,
        .az-clean-export .az-preview-applied-mark {
          display: none !important;
        }
      `}</style>

      {blocks.length === 0 && (
        <div style={{ color: "var(--resume-paper-muted)", fontStyle: "italic", textAlign: "center", padding: "32px 0" }}>
          No extractable résumé text.
        </div>
      )}

      {blocks.map((blk, bi) => {

        /* ── Name / contact header ── */
        if (blk.type === "header") {
          const rest = [...blk.lines];
          while (rest.length > 0 && isPlaceholderIdentityLine(rest[0])) {
            rest.shift();
          }
          const nameLine = rest[0]?.trim() || "";
          const contactLines = rest.slice(1).map((l) => l.trim()).filter(Boolean);
          // Flatten contact info — split on common separators into individual items
          const contactItems: string[] = [];
          for (const ln of contactLines) {
            if (isPlaceholderIdentityLine(ln)) continue;
            const parts = ln.split(/[|•·,]\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);
            const chunk = parts.length > 1 ? parts : [ln];
            for (const p of chunk) {
              if (!isPlaceholderIdentityLine(p)) contactItems.push(p);
            }
          }

          return (
            <div key={bi} style={{ textAlign: "center", marginBottom: 18, paddingBottom: 14, borderBottom: "1.5px solid var(--resume-paper-accent)" }}>
              {nameLine && (
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: "var(--resume-paper-ink)",
                  marginBottom: 7,
                  fontFamily: "'Georgia', serif",
                }}>
                  {renderInline(nameLine)}
                </div>
              )}
              {contactItems.length > 0 && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0 4px",
                  fontSize: 9.4,
                  color: "var(--resume-paper-muted)",
                  fontFamily: "system-ui, sans-serif",
                  lineHeight: 1.7,
                }}>
                  {contactItems.map((item, ci) => (
                    <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {ci > 0 && <span style={{ color: "var(--resume-paper-dim)", fontSize: 8 }}>◆</span>}
                      {renderInline(item)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

        /* ── Section heading ── */
        if (blk.type === "section") {
          return (
            <div key={bi} style={{
              marginTop: 18,
              marginBottom: 7,
              paddingBottom: 3,
              borderBottom: "1.5px solid var(--resume-paper-accent)",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.6,
              color: "var(--resume-paper-accent)",
              textTransform: "uppercase",
              fontFamily: "system-ui, sans-serif",
            }}>
              {blk.text}
            </div>
          );
        }

        /* ── Paragraph / entry header ── */
        if (blk.type === "paragraph") {
          return (
            <div key={bi} style={{ marginBottom: 6 }}>
              {blk.lines.map((ln, li) => {
                const t = ln.trim();
                if (!t || isPlaceholderIdentityLine(ln)) return null;
                if (looksLikeEntryHeader(t)) {
                  return (
                    <div key={li} style={{ marginBottom: li === 0 ? 2 : 1 }}>
                      <EntryHeaderLine line={t} />
                    </div>
                  );
                }
                // Plain paragraph text (summary, skills list, location, etc.)
                return (
                  <div key={li} style={{
                    fontSize: 10.4,
                    color: "var(--resume-paper-ink)",
                    lineHeight: 1.55,
                    marginBottom: 2,
                    fontFamily: li === 0 ? "'Georgia', serif" : "system-ui, sans-serif",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}>
                    {renderInline(softenRunOnExtractLine(t))}
                  </div>
                );
              })}
            </div>
          );
        }

        /* ── Bullet rows ── */
        const bulletRows = collapseAdjacentSameBulletRows(blk.items, bulletAnalysis);
        return (
          <div key={bi} style={{ marginBottom: 10, marginTop: 4 }}>
            {bulletRows.map(({ rawLine, bulletIdx }, ii) => {
              const bullet = bulletAnalysis[bulletIdx];
              if (!bullet) return null;

              const nm = normalizeForMatch(rawLine);
              const showTextRaw = previewLineOverrides[bulletIdx] ?? (nm.length >= 8 ? nm : bullet.originalBullet);
              const showText = softenRunOnExtractLine(showTextRaw);
              const isHighlighted = activeCategory ? bulletMatchesAnalysisCategory(bullet, activeCategory) : false;
              const isSelected = selectedBulletIndex === bulletIdx;
              const previewLineApplied = previewLineOverrides[bulletIdx] !== undefined;
              const hasActionable = !!(bullet.improvedBullet || bullet.issues.length);
              const isPulsing = pulseBulletIndex === bulletIdx;

              const borderColor = scoreBorderColor(bullet.score);
              const bgTint = scoreBgTint(bullet.score, isHighlighted, presentationOnly);
              const leftBar =
                activeCategory && isHighlighted
                  ? "4px solid rgba(248, 113, 113, 0.95)"
                  : `3px solid ${borderColor}`;

              return (
                <div
                  key={`${bulletIdx}-${bi}-${ii}`}
                  data-bullet-idx={bulletIdx}
                  className="az-resume-bullet"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (presentationOnly && hasActionable) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const popupTop = Math.max(8, Math.min(rect.top, window.innerHeight - 340));
                      const popupLeft = Math.max(8, rect.left - 336);
                      setPopup({ bulletIdx, top: popupTop, left: popupLeft });
                      setPopupDraft(rewriteEdits[bulletIdx] ?? bullet.improvedBullet ?? "");
                    } else if (!presentationOnly) {
                      setExpandedIdx((prev) => (prev === bulletIdx ? null : bulletIdx));
                    }
                    onBulletLinkedSelect?.(bulletIdx);
                  }}
                  style={{
                    marginBottom: 4,
                    marginLeft: 2,
                    lineHeight: 1.42,
                    padding: presentationOnly ? "5px 7px 6px 14px" : "6px 8px 8px 14px",
                    borderRadius: 4,
                    background: bgTint,
                    borderLeft: leftBar,
                    boxShadow: isSelected ? "inset 0 0 0 1.5px var(--resume-paper-accent)" : undefined,
                    cursor: hasActionable ? "pointer" : "default",
                    animation: isPulsing ? "az-mirror-pulse 0.85s ease-out 1" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    {/* Score badge — visible in non-presentation mode only */}
                    {!presentationOnly && (
                      <span className="az-score-badge" style={{
                        flexShrink: 0,
                        marginTop: 1,
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "1px 5px",
                        borderRadius: 8,
                        background: bullet.score >= 70 ? "rgba(52,211,153,0.14)" : bullet.score >= 55 ? "rgba(245,158,11,0.14)" : "rgba(248,113,113,0.14)",
                        color: bullet.score >= 70 ? "var(--green)" : bullet.score >= 55 ? "var(--yellow)" : "var(--red)",
                        fontFamily: "system-ui, sans-serif",
                      }}>
                        {bullet.score}
                      </span>
                    )}

                    <span style={{ flex: 1, fontSize: 10.65, lineHeight: 1.45, color: "var(--resume-paper-ink)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      {highlightMetricSpans(showText)}
                      {previewLineApplied && (
                        <span className="az-preview-applied-mark"
                          title={presentationOnly ? "Suggestion applied" : "Preview updated"}
                          style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: presentationOnly ? "var(--green)" : "var(--amber)" }}
                        >
                          {presentationOnly ? "✓" : "●"}
                        </span>
                      )}
                      {presentationOnly && hasActionable && !previewLineApplied && (
                        <span title="Click to see AI suggestion" style={{ marginLeft: 5, fontSize: 9, color: "var(--resume-paper-muted)" }}>✦</span>
                      )}
                    </span>
                  </div>

                  {/* Inline detail (non-presentation mode only) */}
                  {!presentationOnly && expandedIdx === bulletIdx && bullet.issues.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, paddingLeft: 2, fontFamily: "system-ui, sans-serif" }}>
                      {bullet.issues.map((issue, ij) => (
                        <span key={ij} style={{
                          fontSize: 9, padding: "1px 6px", borderRadius: 8,
                          background: "var(--red-bg)", color: "var(--red)", fontWeight: 500,
                        }}>
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                  {!presentationOnly && expandedIdx === bulletIdx && !!bullet.improvedBullet && (
                    <div style={{ fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
                      <BulletImprovedEditor
                        layout="plain"
                        minHeight={56}
                        value={rewriteEdits[bulletIdx] ?? (bullet.improvedBullet ?? "")}
                        onChange={v => patchBulletRewrite(bulletIdx, v)}
                        onReset={() => patchBulletRewrite(bulletIdx, null)}
                        canReset={rewriteEdits[bulletIdx] !== undefined}
                        toolbarRight={<CopyTiny text={rewriteEdits[bulletIdx] ?? (bullet.improvedBullet ?? "")} />}
                        previewLineApplied={previewLineApplied}
                        onReplaceInPreview={() => patchPreviewLine(bulletIdx, (rewriteEdits[bulletIdx] ?? bullet.improvedBullet ?? "").trim())}
                        onRevertPreviewLine={() => patchPreviewLine(bulletIdx, null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ── AI suggestion popup (presentationOnly click on bullet) ── */}
      {popup && popupBullet && (
        <div
          ref={popupRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: popup.top,
            left: popup.left,
            zIndex: 9999,
            width: 320,
            background: "var(--surface)",
            borderRadius: 10,
            boxShadow: "var(--shadow)",
            border: "1px solid var(--border)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: 12,
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px 8px", borderBottom: "1px solid var(--border)", background: "var(--surface2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10,
                background: popupBullet.score >= 70 ? "rgba(52,211,153,0.15)" : popupBullet.score >= 55 ? "rgba(245,158,11,0.15)" : "rgba(248,113,113,0.15)",
                color: popupBullet.score >= 70 ? "var(--green)" : popupBullet.score >= 55 ? "var(--yellow)" : "var(--red)",
              }}>
                {popupBullet.score}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>AI Suggestion</span>
            </div>
            <button
              type="button"
              onClick={() => setPopup(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: "2px 4px", borderRadius: 4, fontSize: 15, lineHeight: 1 }}
              aria-label="Close"
            >×</button>
          </div>

          {popupBullet.issues.length > 0 && (
            <div style={{ padding: "8px 12px 6px", display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid var(--border)" }}>
              {popupBullet.issues.map((issue, j) => (
                <span key={j} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontWeight: 500 }}>
                  {issue}
                </span>
              ))}
            </div>
          )}

          {popupBullet.improvedBullet ? (
            <div style={{ padding: "10px 12px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Suggested rewrite
              </div>
              <textarea
                value={popupDraft}
                onChange={(e) => { setPopupDraft(e.target.value); patchBulletRewrite(popup.bulletIdx, e.target.value); }}
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 12, lineHeight: 1.55,
                  color: "var(--text)", border: "1px solid var(--border-h)", borderRadius: 6,
                  padding: "8px 10px", resize: "vertical", fontFamily: "inherit",
                  background: "var(--bg)", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.background = "var(--surface2)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border-h)"; e.target.style.background = "var(--bg)"; }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                {popupDraft !== (popupBullet.improvedBullet ?? "") && (
                  <button
                    type="button"
                    onClick={() => { setPopupDraft(popupBullet.improvedBullet ?? ""); patchBulletRewrite(popup.bulletIdx, null); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border-h)", background: "var(--surface2)", color: "var(--muted)", cursor: "pointer", fontFamily: "inherit" }}
                  >Reset</button>
                )}
                <button
                  type="button"
                  onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(popupDraft); } catch { /* ignore */ } }}
                  style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(63,185,80,0.45)", background: "var(--green-bg)", color: "var(--green)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                >Copy</button>
                {popupPreviewApplied ? (
                  <button
                    type="button"
                    onClick={() => { patchPreviewLine(popup.bulletIdx, null); setPopup(null); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--amber)", background: "var(--amber-bg)", color: "var(--amber-h)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                  >Revert</button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { patchPreviewLine(popup.bulletIdx, popupDraft.trim()); setPopup(null); }}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, boxShadow: "var(--shadow-sm)" }}
                  >Apply to preview</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px", color: "var(--muted)", fontSize: 11 }}>No rewrite suggestion available for this bullet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyTiny({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }}
      style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(63,185,80,0.4)", background: "var(--green-bg)", color: "var(--green)", cursor: "pointer", fontFamily: "inherit" }}
    >Copy</button>
  );
}
