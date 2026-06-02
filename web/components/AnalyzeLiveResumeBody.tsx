"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useResumeAnalyzeStore } from "@/store/resumeAnalyzeStore";
import type { CSSProperties, ReactNode } from "react";
import BulletImprovedEditor from "@/components/BulletImprovedEditor";
import { highlightMetricSpans } from "@/lib/highlightResumeMetrics";
import {
  bulletMatchesAnalysisCategory,
  type CategoryAssignmentOptions,
} from "@/lib/analysisCategoryMatch";
import { resumeLineMatchesSuggestionOriginal } from "@/lib/suggestionResumeMatch";
import { looksLikeStructuredEmploymentLine } from "@/lib/profileFromResumeText";
import {
  normalizeResumeExtractLine as normalizeExtractLine,
  lineLooksLikeBulletLead,
  looksLikeLoneJobTitleLine,
  looksLikeEntryHeader,
} from "@/lib/resumeEntryLineHeuristics";
import {
  findBulletIndexForLine,
  normalizeForMatch,
  type LiveBulletItem,
} from "@/lib/resumeBulletMatch";

export type { LiveBulletItem } from "@/lib/resumeBulletMatch";
export { findBulletIndexForLine, normalizeForMatch } from "@/lib/resumeBulletMatch";

export type Block =
  | { type: "header"; lines: string[] }
  | { type: "section"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "bullets"; items: Array<{ rawLine: string; bulletIdx: number }> };

/** Known resume section titles (full trimmed line). Strict mode avoids mistaking ALL-CAPS names for sections. */
const KNOWN_SECTIONS =
  /^(?:EXPERIENCE|WORK\s+HISTORY|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|PROFESSIONAL\s+HISTORY|EMPLOYMENT(?:\s+HISTORY)?|CAREER(?:\s+HISTORY|\s+OVERVIEW|\s+SUMMARY)?|EDUCATION|SKILLS|SUMMARY|PROFILE|PROJECTS|CERTIFICATIONS|AWARDS|PUBLICATIONS|LANGUAGES|VOLUNTEER|PROFESSIONAL\s+SUMMARY|TECHNICAL\s+SKILLS|ACHIEVEMENTS?|REFERENCES|OBJECTIVE|ACTIVITIES(?:\s*&\s*LEADERSHIP)?|CO-?CURRICULAR\s+ACTIVITIES|EXTRA\s+CURRICULAR\s+ACTIVITIES|EXTRACURRICULAR(?:\s+ACTIVITIES)?|HONORS|LEADERSHIP|INTERESTS)\s*$/iu;

/** Exported for AnnotatedResumePanel extract heuristics (identity line vs lone section heading). */
export function lineLooksLikeStandaloneSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 72) return false;
  return KNOWN_SECTIONS.test(t);
}

function looksLikeSectionHeading(line: string, strict = false): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  // In strict mode (used for first-line header detection), only match known section keywords.
  // This prevents "JOHN DOE" or "PARTH BHODIA" from being misidentified as section headings.
  if (strict) return KNOWN_SECTIONS.test(t);
  if (KNOWN_SECTIONS.test(t)) return true;
  // Generic ALL-CAPS fallback. Reject lines that look like degree / qualification rows
  // even though every alpha char happens to be uppercase — these contain digits, percent,
  // parens, em-/en-dashes, or slashes. E.g. "ICSE — 97.16% (2021)", "B.TECH (CGPA 9.2)",
  // "AWS / GCP CERT 2022" are NOT section headings; they're content lines that should
  // stay grouped with the preceding institution / role.
  if (/[0-9%()/–—]/.test(t)) return false;
  if (/[A-Z]/.test(t) && t === t.toUpperCase() && !/^\d/.test(t)) return true;
  return false;
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

  const isLikelyBulletContinuation = (line: string): boolean => {
    const t = normalizeForMatch(line).trim();
    if (!t || t.length > 80) return false;
    if (/^[+]/.test(t)) return false;
    if (/^[A-Z][a-z].*:$/.test(t)) return false;
    if (/^technologies\s*:/i.test(t)) return false;
    return /^[a-z0-9(]/.test(t) || /^(and|or|with|for|to|across|in|on)\b/i.test(t);
  };

  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && prev.bulletIdx === it.bulletIdx) {
      const canon = bullets[it.bulletIdx]?.originalBullet?.trim();
      prev.rawLine = canon && canon.length > 0 ? canon : `${prev.rawLine} ${it.rawLine}`.replace(/\s+/g, " ").trim();
      continue;
    }
    if (prev && isLikelyBulletContinuation(it.rawLine)) {
      prev.rawLine = `${prev.rawLine} ${normalizeForMatch(it.rawLine)}`.replace(/\s+/g, " ").trim();
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
    const blob = (first.lines ?? []).join(" ").toLowerCase();
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

function normalizeHeaderContactGlue(line: string): string {
  let out = line;
  out = out.replace(/(GitHub)(Email\s*:)/gi, "$1 | $2");
  out = out.replace(/(LinkedIn)(GitHub)/gi, "$1 | $2");
  out = out.replace(/(Email\s*:)(Mobile\s*:)/gi, "$1 | $2");
  out = out.replace(/(Mobile\s*:)(Senior\s+[A-Za-z])/gi, "$1 | $2");
  out = out.replace(/(Location\s*:)(?=[A-Za-z])/gi, "$1 ");
  return out;
}

function isLikelyHeaderContactLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > 160) return false;

  const words = t.split(/\s+/).filter(Boolean);
  const hasStrongContactAnchor = /@|linkedin|github|portfolio|website|mobile|phone|email|location|\+\d{1,3}/i.test(t);
  const hasDelimiter = /[|•◆·]/.test(t);
  const looksSentenceLike = /\b(with|building|engineered|delivered|optimized|owning|across)\b/i.test(t);

  if (hasStrongContactAnchor) return true;
  if (!hasDelimiter) {
    return words.length >= 2 && words.length <= 8 && !looksSentenceLike;
  }
  return words.length <= 14 && !looksSentenceLike;
}

function normalizeSkillsLineSpacing(line: string): string {
  return line
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function mergeWrappedSkillsLines(lines: string[]): string[] {
  const cleaned = lines
    .map((ln) => normalizeSkillsLineSpacing(softenRunOnExtractLine(ln.trim())))
    .filter((ln) => ln.length > 0);

  const out: string[] = [];
  for (const line of cleaned) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(line);
      continue;
    }

    const prevEndsWithDelimiter = /[,/:;-]$/.test(prev);
    const lineLooksContinuation =
      /^[a-z0-9]/.test(line) ||
      /^(and|or|with|plus|incl\.?|including|tools?|frameworks?|platforms?|pipelines?)\b/i.test(line);

    if (prevEndsWithDelimiter || lineLooksContinuation) {
      out[out.length - 1] = `${prev} ${line}`.replace(/\s{2,}/g, " ").trim();
      continue;
    }

    out.push(line);
  }

  return out;
}

function renderSkillsLine(text: string): ReactNode {
  const m = text.match(/^([^:]{2,42}):(\s*)(.+)$/);
  if (!m) return <>{renderInline(text)}</>;
  const label = m[1].trim();
  const value = m[3].trim();
  const labelWords = label.split(/\s+/).filter(Boolean).length;
  if (labelWords > 5) return <>{renderInline(text)}</>;
  return (
    <>
      <strong>{label}:</strong>{" "}
      {renderInline(value)}
    </>
  );
}

type ResumeSectionRole =
  | "education"
  | "experience"
  | "skills"
  | "projects"
  | "summary"
  | "activities"
  | "other";

const RESUME_HEADING_FONT = "var(--az-resume-heading-font, 'Georgia', 'Times New Roman', serif)";
const RESUME_BODY_FONT = "var(--az-resume-body-font, 'Georgia', 'Times New Roman', serif)";
const RESUME_UI_FONT = "var(--az-resume-ui-font, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)";

function roleForKnownSection(text: string): ResumeSectionRole | null {
  const t = text.trim();
  if (!KNOWN_SECTIONS.test(t)) return null;
  if (/\beducation\b/i.test(t)) return "education";
  if (/\b(skill|technical skills)\b/i.test(t)) return "skills";
  if (/\b(project|portfolio)\b/i.test(t)) return "projects";
  if (/\b(experience|work|employment|career)\b/i.test(t)) return "experience";
  if (/\b(summary|profile|objective)\b/i.test(t)) return "summary";
  if (/\b(activity|activities|leadership|honors|interest)\b/i.test(t)) return "activities";
  return "other";
}

function currentSectionRole(blocks: Block[], index: number): ResumeSectionRole | null {
  for (let j = index - 1; j >= 0; j--) {
    const block = blocks[j];
    if (block?.type !== "section") continue;
    const role = roleForKnownSection(block.text);
    if (role) return role;
  }
  return null;
}

const EDUCATION_INSTITUTION_RE =
  /\b(university|college|institute|school|academy|polytechnic|faculty|department|vidyapeeth|steinhardt|charusat)\b/i;

function looksLikeEducationInstitutionLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 180) return false;
  if (lineLooksLikeBulletLead(t)) return false;
  if (splitLeadingLabelAndValue(t)) return false;
  return EDUCATION_INSTITUTION_RE.test(t);
}

function splitLeadingLabelAndValue(text: string): { hasBullet: boolean; label: string; value: string } | null {
  const m = text.trim().match(/^([•●▪◦○–—\-]\s*)?([^:]{2,42}):\s*(.+)$/u);
  if (!m) return null;
  const label = m[2].trim();
  const value = m[3].trim();
  if (!label || !value || label.split(/\s+/).length > 5) return null;
  return { hasBullet: Boolean(m[1]), label, value };
}

function renderLabeledLine(text: string): ReactNode {
  const split = splitLeadingLabelAndValue(text);
  if (!split) return renderInline(softenRunOnExtractLine(text));
  const body = (
    <>
      <strong>{split.label}:</strong>{" "}
      {renderInline(softenRunOnExtractLine(split.value))}
    </>
  );
  if (!split.hasBullet) return body;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ color: "var(--resume-paper-dim)" }}>•</span>
      <span>{body}</span>
    </span>
  );
}

function renderMetricLineWithLabel(text: string): ReactNode {
  const split = splitLeadingLabelAndValue(text);
  if (!split) return highlightMetricSpans(text);
  return (
    <>
      <strong>{split.label}:</strong>{" "}
      {highlightMetricSpans(split.value)}
    </>
  );
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0 8px", lineHeight: 1.22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: "var(--resume-paper-ink)", fontSize: 10.8, fontFamily: RESUME_BODY_FONT }}>
            {mains[0]}
          </span>
          {mains.slice(1).map((p, i) => (
            <span key={i} style={{ color: "var(--resume-paper-muted)", fontSize: 10, fontStyle: "italic", fontFamily: RESUME_BODY_FONT }}>
              {"·"} {p}
            </span>
          ))}
        </div>
        {datePart && (
          <span style={{ color: "var(--resume-paper-muted)", fontSize: 9.5, fontFamily: RESUME_BODY_FONT, flexShrink: 0 }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 1, lineHeight: 1.22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "var(--resume-paper-ink)", fontSize: 10.8, fontFamily: RESUME_BODY_FONT }}>
            {title}
          </span>
          {metaParts.length > 0 && (
            <span style={{ color: "var(--resume-paper-muted)", fontSize: 9.5, fontFamily: RESUME_BODY_FONT, flexShrink: 0, whiteSpace: "nowrap" }}>
              {metaParts.join(" · ")}
            </span>
          )}
        </div>
        {institutionParts.length > 0 && (
          <span style={{ color: "var(--resume-paper-muted)", fontSize: 10, fontStyle: "italic", fontFamily: RESUME_BODY_FONT }}>
            {institutionParts.join(" · ")}
          </span>
        )}
      </div>
    );
  }

  // Year-range line without pipe — treat as date/location
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <span style={{ color: "var(--resume-paper-muted)", fontSize: 9.5, fontStyle: "italic", fontFamily: RESUME_BODY_FONT, lineHeight: 1.22 }}>
        {renderInline(t)}
      </span>
    </div>
  );
}

function coalesceEmploymentParagraphLines(lines: string[]): string[] {
  const out: string[] = [];
  const isLikelyMeta = (t: string): boolean => {
    const hasDate = /\b(19|20)\d{2}\b/.test(t) || /\b(?:present|current)\b/i.test(t);
    const hasRole = /\b(Engineer|Developer|Architect|Analyst|Manager|Lead|Consultant|Designer|Scientist)\b/i.test(t);
    return t.length <= 90 && (hasDate || hasRole);
  };
  const isLikelyCompany = (t: string): boolean => {
    if (!t || t.length > 90) return false;
    if (/\b(19|20)\d{2}\b/.test(t)) return false;
    if (lineLooksLikeBulletLead(t)) return false;
    if (/^[+•\-–—]/.test(t)) return false;
    return /\b(Inc|LLC|Ltd|Technologies|Solutions|Systems|Corp|Company|Remote|,\s*[A-Z]{2}|,\s*[A-Za-z]+)\b/i.test(t);
  };

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i].trim();
    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    if (cur && next && isLikelyCompany(cur) && isLikelyMeta(next)) {
      out.push(`${cur} | ${next}`);
      i++;
      continue;
    }
    out.push(lines[i]);
  }
  return out;
}

function scoreBorderColor(score: number): string {
  if (score >= 70) return "rgba(52,211,153,0.8)";
  if (score >= 55) return "rgba(245,158,11,0.85)";
  return "rgba(248,113,113,0.85)";
}

const TAILOR_GAP_HIGHLIGHT: CSSProperties = {
  background: "rgba(139,92,246,0.12)",
  borderLeft: "3px solid #8b5cf6",
  paddingLeft: 6,
  marginLeft: -9,
  borderRadius: "0 3px 3px 0",
  transition: "background 0.3s, border-color 0.3s",
};

const TAILOR_APPLIED_HIGHLIGHT: CSSProperties = {
  background: "rgba(52,211,153,0.14)",
  borderLeft: "3px solid rgb(34, 197, 94)",
  paddingLeft: 6,
  marginLeft: -9,
  borderRadius: "0 3px 3px 0",
  transition: "background 0.3s, border-color 0.3s",
};

function tailorHighlightKind(
  line: string,
  gapFixHighlights: string[],
  appliedHighlights: string[],
): "applied" | "gap" | null {
  const block = line.trim();
  if (!block) return null;
  if (appliedHighlights.some((o) => resumeLineMatchesSuggestionOriginal(block, o))) return "applied";
  if (gapFixHighlights.some((o) => resumeLineMatchesSuggestionOriginal(block, o))) return "gap";
  return null;
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
  categoryAssignmentOpts?: CategoryAssignmentOptions;
  /** Tailor gap-fix panel — purple highlight on targeted bullets. */
  tailorGapFixHighlights?: string[];
  /** Tailor gap-fix just applied — green flash on updated bullets. */
  tailorAppliedHighlights?: string[];
  /** Index-based gap targets (Analyze-style); preferred over string highlights. */
  gapFixTargetBulletIndices?: number[];
  /** Brief green flash on applied bullet indices after gap apply. */
  tailorAppliedBulletIndices?: ReadonlySet<number>;
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
  categoryAssignmentOpts,
  tailorGapFixHighlights = [],
  tailorAppliedHighlights = [],
  gapFixTargetBulletIndices = [],
  tailorAppliedBulletIndices = new Set<number>(),
}: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  // Tracks which bullets are in "edit textarea" mode (after accepting or choosing to write own)
  const [editingBullets, setEditingBullets] = useState<Record<number, boolean>>({});
  // Local edit text per bullet (pre-filled from AI rewrite or empty for "write own")
  const [editDrafts, setEditDrafts] = useState<Record<number, string>>({});

  const acceptedBullets = useResumeAnalyzeStore((s) => s.acceptedBullets);
  const acceptBullet = useResumeAnalyzeStore((s) => s.acceptBullet);
  const unacceptBullet = useResumeAnalyzeStore((s) => s.unacceptBullet);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupDraft, setPopupDraft] = useState<string>("");
  const popupRef = useRef<HTMLDivElement>(null);
  const popupDragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

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

  useEffect(() => {
    if (!popup) return;

    const onMouseMove = (e: MouseEvent) => {
      const drag = popupDragOffsetRef.current;
      if (!drag) return;

      const panelW = popupRef.current?.offsetWidth ?? 320;
      const panelH = popupRef.current?.offsetHeight ?? 360;
      const nextLeft = e.clientX - drag.dx;
      const nextTop = e.clientY - drag.dy;

      const left = Math.max(8, Math.min(nextLeft, window.innerWidth - panelW - 8));
      const top = Math.max(8, Math.min(nextTop, window.innerHeight - panelH - 8));

      setPopup((prev) => (prev ? { ...prev, left, top } : prev));
    };

    const onMouseUp = () => {
      popupDragOffsetRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [popup]);

  const popupBullet = popup != null ? bulletAnalysis[popup.bulletIdx] : null;
  const popupPreviewApplied = popup != null ? previewLineOverrides[popup.bulletIdx] !== undefined : false;

  return (
    <div style={{
      background: "var(--resume-paper-bg)",
      color: "var(--resume-paper-ink)",
      padding: "var(--az-resume-paper-padding, 32px 36px 52px)",
      fontFamily: RESUME_BODY_FONT,
      fontSize: "var(--az-resume-base-font-size, 10.8px)",
      lineHeight: "var(--az-resume-line-height, 1.45)",
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
          padding: 3px 8px 3px 12px;
          border-radius: 3px;
          margin-bottom: 2px;
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
          cursor: default !important;
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
          const contactLines = rest
            .slice(1)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && isLikelyHeaderContactLine(l));
          // Flatten contact info — split on common separators into individual items
          const contactItems: string[] = [];
          for (const ln of contactLines) {
            if (isPlaceholderIdentityLine(ln)) continue;
            const normalizedLine = normalizeHeaderContactGlue(ln);
            const parts = normalizedLine.split(/[|•·,]\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);
            const chunk = parts.length > 1 ? parts : [normalizedLine.trim()];
            for (const p of chunk) {
              if (!isPlaceholderIdentityLine(p)) contactItems.push(p);
            }
          }

          return (
            <div key={bi} style={{ textAlign: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1.5px solid var(--resume-paper-accent)" }}>
              {nameLine && (
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: "var(--resume-paper-ink)",
                  marginBottom: 5,
                  fontFamily: RESUME_HEADING_FONT,
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
                  fontFamily: RESUME_BODY_FONT,
                  lineHeight: 1.5,
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
          const isPrimarySection = Boolean(roleForKnownSection(blk.text));
          return (
            <div key={bi} style={{
              marginTop: isPrimarySection ? "var(--az-resume-section-margin-top, 13px)" : 8,
              marginBottom: isPrimarySection ? 5 : 4,
              paddingBottom: isPrimarySection ? 3 : 2,
              borderBottom: isPrimarySection
                ? "1.5px solid var(--resume-paper-accent)"
                : "1px solid color-mix(in srgb, var(--resume-paper-accent) 72%, transparent)",
              fontSize: isPrimarySection ? 9 : 10,
              fontWeight: 800,
              letterSpacing: isPrimarySection ? 1.6 : 1.25,
              color: "var(--resume-paper-accent)",
              textTransform: "uppercase",
              fontFamily: RESUME_HEADING_FONT,
            }}>
              {blk.text}
            </div>
          );
        }

        /* ── Paragraph / entry header ── */
        if (blk.type === "paragraph") {
          const sectionRole = currentSectionRole(blocks, bi);
          const inSkillsSection = sectionRole === "skills";
          const inExperienceSection = sectionRole === "experience";
          const inEducationSection = sectionRole === "education";
          const paragraphLines = inSkillsSection
            ? mergeWrappedSkillsLines(blk.lines)
            : inExperienceSection
              ? coalesceEmploymentParagraphLines(blk.lines)
              : blk.lines;

          return (
            <div key={bi} style={{ marginBottom: inEducationSection ? (presentationOnly ? 2 : 3) : presentationOnly ? 4 : 5 }}>
              {paragraphLines.map((ln, li) => {
                const t = ln.trim();
                if (!t || isPlaceholderIdentityLine(ln)) return null;
                if (looksLikeEntryHeader(t)) {
                  return (
                    <div key={li} style={{ marginBottom: inEducationSection ? 0 : li === 0 ? 2 : 1 }}>
                      <EntryHeaderLine line={t} />
                    </div>
                  );
                }
                if (inEducationSection && looksLikeEducationInstitutionLine(t)) {
                  return (
                    <div key={li} style={{
                      fontSize: 10.65,
                      fontWeight: 700,
                      color: "var(--resume-paper-ink)",
                      lineHeight: 1.22,
                      marginTop: li > 0 ? 3 : 0,
                      marginBottom: 0,
                      fontFamily: RESUME_BODY_FONT,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}>
                      {renderInline(softenRunOnExtractLine(t))}
                    </div>
                  );
                }
                // Plain paragraph text (summary, skills list, location, etc.)
                const tailorHl =
                  presentationOnly && bulletAnalysis.length === 0
                    ? tailorHighlightKind(ln, tailorGapFixHighlights, tailorAppliedHighlights)
                    : null;
                const tailorHlStyle =
                  tailorHl === "applied"
                    ? TAILOR_APPLIED_HIGHLIGHT
                    : tailorHl === "gap"
                      ? TAILOR_GAP_HIGHLIGHT
                      : undefined;
                return (
                  <div key={li} style={{
                    fontSize: inEducationSection ? 10.25 : 10.4,
                    color: "var(--resume-paper-ink)",
                    lineHeight: inEducationSection ? 1.28 : 1.48,
                    marginBottom: inEducationSection ? 0 : 2,
                    fontFamily: RESUME_BODY_FONT,
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    ...tailorHlStyle,
                  }}>
                    {inSkillsSection
                      ? renderSkillsLine(normalizeSkillsLineSpacing(t))
                      : renderLabeledLine(t)}
                  </div>
                );
              })}
            </div>
          );
        }

        /* ── Bullet rows ── */
        const bulletRows = collapseAdjacentSameBulletRows(blk.items, bulletAnalysis);
        return (
          <div key={bi} style={{ marginBottom: presentationOnly ? 7 : 10, marginTop: presentationOnly ? 2 : 4 }}>
            {bulletRows.map(({ rawLine, bulletIdx }, ii) => {
              const bullet = bulletAnalysis[bulletIdx];
              if (!bullet) return null;

              const nm = normalizeForMatch(rawLine);
              const showTextRaw = previewLineOverrides[bulletIdx] ?? (nm.length >= 8 ? nm : bullet.originalBullet);
              const showText = softenRunOnExtractLine(showTextRaw);
              const isHighlighted = activeCategory
                ? bulletMatchesAnalysisCategory(
                    bullet,
                    activeCategory,
                    bulletAnalysis,
                    bulletIdx,
                    categoryAssignmentOpts,
                  )
                : false;
              const isSelected = selectedBulletIndex === bulletIdx;
              const previewLineApplied = previewLineOverrides[bulletIdx] !== undefined;
              const issues = Array.isArray(bullet.issues) ? bullet.issues : [];
              const hasActionable = !!(bullet.improvedBullet || issues.length);
              const isPulsing = pulseBulletIndex === bulletIdx;
              const isGapFixTarget =
                presentationOnly && gapFixTargetBulletIndices.includes(bulletIdx);
              const isGapFixApplied =
                presentationOnly && tailorAppliedBulletIndices.has(bulletIdx);

              let bgTint = scoreBgTint(bullet.score, isHighlighted, presentationOnly);
              let leftBar =
                activeCategory && isHighlighted
                  ? "4px solid rgba(248, 113, 113, 0.95)"
                  : `3px solid ${scoreBorderColor(bullet.score)}`;

              if (presentationOnly && isGapFixApplied) {
                bgTint = "rgba(52,211,153,0.14)";
                leftBar = "3px solid rgb(34, 197, 94)";
              } else if (presentationOnly && isGapFixTarget) {
                bgTint = "rgba(139,92,246,0.12)";
                leftBar = "3px solid #8b5cf6";
              }

              return (
                <div
                  key={`${bulletIdx}-${bi}-${ii}`}
                  data-bullet-idx={bulletIdx}
                  className="az-resume-bullet"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Only open the "AI Suggestion" popup when there's an
                    // actual rewrite to show. After the no-op-rewrite filter
                    // landed server-side, the popup's "No rewrite suggestion
                    // available for this bullet" empty state fires often —
                    // and that empty popup duplicates the score + tag info
                    // that's already on the flagged-bullet card on the left.
                    // When no rewrite exists, just route to the card via
                    // onBulletLinkedSelect (parent scrolls / expands it).
                    const hasRewrite =
                      typeof bullet.improvedBullet === "string"
                      && bullet.improvedBullet.trim().length > 0;
                    if (presentationOnly && hasRewrite) {
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
                      <span className={`az-pdf-ignore az-score-badge az-score-badge--${bullet.score >= 70 ? "strong" : bullet.score >= 55 ? "fair" : "weak"}`} style={{ flexShrink: 0, marginTop: 1 }}>
                        {bullet.score}
                      </span>
                    )}

                    <span style={{ flex: 1, fontSize: 10.65, lineHeight: 1.45, color: "var(--resume-paper-ink)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      {renderMetricLineWithLabel(showText)}
                      {previewLineApplied && (
                        <span className="az-pdf-ignore az-preview-applied-mark"
                          title={presentationOnly ? "Suggestion applied" : "Preview updated"}
                          style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: presentationOnly ? "var(--green)" : "var(--amber)" }}
                        >
                          {presentationOnly ? "✓" : "●"}
                        </span>
                      )}
                      {presentationOnly && hasActionable && !previewLineApplied && (
                        <span className="az-pdf-ignore" title="Click to see AI suggestion" style={{ marginLeft: 5, fontSize: 9, color: "var(--resume-paper-muted)" }}>✦</span>
                      )}
                    </span>
                  </div>

                  {/* ── Inline detail panel (non-presentation mode only) ── */}
                  {!presentationOnly && expandedIdx === bulletIdx && (() => {
                    const accepted = acceptedBullets[bulletIdx];
                    const isEditing = editingBullets[bulletIdx];
                    const editDraft = editDrafts[bulletIdx] ?? "";

                    // ── State D: editing textarea ──
                    if (isEditing) {
                      return (
                        <div style={{ fontFamily: "system-ui, sans-serif", marginTop: 8 }} onClick={e => e.stopPropagation()}>
                          <textarea
                            autoFocus
                            value={editDraft}
                            onChange={e => setEditDrafts(prev => ({ ...prev, [bulletIdx]: e.target.value }))}
                            placeholder="Write your improved bullet…"
                            className="az-edit-textarea"
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button
                              onClick={() => {
                                const t = editDraft.trim();
                                if (!t) return;
                                acceptBullet(bulletIdx, t, "custom");
                                patchBulletRewrite(bulletIdx, t);
                                setEditingBullets(prev => { const n = { ...prev }; delete n[bulletIdx]; return n; });
                              }}
                              className="az-btn az-btn--primary az-btn--sm"
                            >Save</button>
                            <button
                              onClick={() => setEditingBullets(prev => { const n = { ...prev }; delete n[bulletIdx]; return n; })}
                              className="az-btn az-btn--ghost az-btn--sm"
                            >Cancel</button>
                            {editDraft.trim() && (
                              <CopyTiny text={editDraft} />
                            )}
                          </div>
                        </div>
                      );
                    }

                    // ── State C: accepted ──
                    if (accepted) {
                      const acceptedText = previewLineOverrides[bulletIdx] ?? rewriteEdits[bulletIdx] ?? bullet.improvedBullet ?? "";
                      return (
                        <div style={{ fontFamily: "system-ui, sans-serif", marginTop: 6 }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <span className={`az-score-badge az-score-badge--${accepted === "ai" ? "accepted" : "accepted"}`} style={{
                              background: accepted === "ai" ? "var(--az-accepted-ai-bg)" : "var(--az-accepted-custom-bg)",
                              borderColor: accepted === "ai" ? "var(--az-accepted-ai-border)" : "var(--az-accepted-custom-border)",
                              color: accepted === "ai" ? "var(--az-strong-text)" : "#2563eb",
                            }}>
                              {accepted === "ai" ? "✓ AI" : "✓ Custom"}
                            </span>
                            <button
                              onClick={() => {
                                setEditDrafts(prev => ({ ...prev, [bulletIdx]: acceptedText }));
                                setEditingBullets(prev => ({ ...prev, [bulletIdx]: true }));
                              }}
                              className="az-btn az-btn--ghost az-btn--sm"
                            >Edit</button>
                            <button
                              onClick={() => {
                                unacceptBullet(bulletIdx);
                                patchBulletRewrite(bulletIdx, null);
                              }}
                              className="az-btn az-btn--ghost az-btn--sm"
                            >Undo</button>
                          </div>
                          {acceptedText && (
                            <div className="az-bullet-accepted-text">{acceptedText}</div>
                          )}
                        </div>
                      );
                    }

                    // ── State B: expanded suggestion view ──
                    const MAX_CHIPS = 3;
                    const visibleIssues = bullet.issues.slice(0, MAX_CHIPS);
                    const overflowCount = bullet.issues.length - MAX_CHIPS;
                    return (
                      <div style={{ fontFamily: "system-ui, sans-serif", marginTop: 6 }} onClick={e => e.stopPropagation()}>
                        {/* Issues chips — max 3 + overflow pill */}
                        {bullet.issues.length > 0 && (
                          <div className="az-chips" style={{ marginBottom: 8, paddingLeft: 2 }}>
                            {visibleIssues.map((issue, ij) => (
                              <span key={ij} className="az-chip">{issue}</span>
                            ))}
                            {overflowCount > 0 && (
                              <span className="az-chip az-chip--overflow">+{overflowCount} more</span>
                            )}
                          </div>
                        )}

                        {/* AI suggestion card */}
                        {bullet.improvedBullet && (
                          <div className="az-suggestion-card">
                            <div className="az-suggestion-card__header">
                              <span>✦</span> AI Suggestion
                            </div>
                            <div className="az-suggestion-card__body">
                              {bullet.improvedBullet}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {bullet.improvedBullet && (
                            <button
                              className="az-btn az-btn--primary az-btn--sm"
                              onClick={() => {
                                acceptBullet(bulletIdx, bullet.improvedBullet!, "ai");
                                patchBulletRewrite(bulletIdx, bullet.improvedBullet!);
                              }}
                            >Accept AI</button>
                          )}
                          {bullet.improvedBullet && (
                            <button
                              className="az-btn az-btn--ghost az-btn--sm"
                              onClick={() => {
                                setEditDrafts(prev => ({ ...prev, [bulletIdx]: bullet.improvedBullet! }));
                                setEditingBullets(prev => ({ ...prev, [bulletIdx]: true }));
                              }}
                            >Edit draft</button>
                          )}
                          <button
                            className="az-btn az-btn--ghost az-btn--sm"
                            style={{ color: "var(--muted)" }}
                            onClick={() => {
                              setEditDrafts(prev => ({ ...prev, [bulletIdx]: "" }));
                              setEditingBullets(prev => ({ ...prev, [bulletIdx]: true }));
                            }}
                          >Write my own</button>
                        </div>
                      </div>
                    );
                  })()}
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
            cursor: "move",
          }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            popupDragOffsetRef.current = {
              dx: e.clientX - popup.left,
              dy: e.clientY - popup.top,
            };
            e.preventDefault();
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
