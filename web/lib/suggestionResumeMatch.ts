/**
 * Fuzzy match between a plain-text résumé line and a suggestion's `original`
 * (AI quotes often differ slightly on bullets / spaces / smart quotes).
 */

import { isPlaceholderResumeHeaderLine } from "./resumePreviewNameLine";
import { looksLikeStructuredEmploymentLine } from "./profileFromResumeText";
import {
  looksLikeLoneJobTitleLine,
  looksLikeEntryHeader,
} from "./resumeEntryLineHeuristics";

function isAllCapsSectionLine(t: string): boolean {
  const s = t.trim();
  return s.length > 2 && s === s.toUpperCase() && /[A-Z]/.test(s) && !/^[•\-–*\u2022\u00b7]/.test(s);
}

function isBulletLine(t: string): boolean {
  const s = t.trim();
  return /^[•\-–*|\u2022\u00b7]/.test(s) || /^\.\s+\S/.test(s);
}

function endsWithSentenceBoundary(t: string): boolean {
  return /[.!?]["']?\s*$/.test(t.trim());
}

/** Avoid merging “(555) …” onto an email line as one fake bullet. */
function isPhoneOrStructuredAfterEmail(prev: string, u: string): boolean {
  if (!/@/.test(prev)) return false;
  const x = u.trim();
  return /^[\(\[]?\d/.test(x) || /^\+?\d/.test(x);
}

/**
 * PDF/plain extract often splits one bullet across multiple newline-separated rows.
 * Returns, for each physical line index, the same joined string for every row in that bullet/run
 * so suggestion matching highlights all wrapped lines together.
 */
export function computeCombinedMatchTextByLineIndex(lines: string[]): string[] {
  const out: string[] = new Array(lines.length).fill("");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      out[i] = "";
      i++;
      continue;
    }
    if (isPlaceholderResumeHeaderLine(raw) || isAllCapsSectionLine(t)) {
      out[i] = t;
      i++;
      continue;
    }

    if (
      looksLikeStructuredEmploymentLine(t) ||
      looksLikeEntryHeader(t) ||
      looksLikeLoneJobTitleLine(t)
    ) {
      out[i] = t;
      i++;
      continue;
    }

    if (isBulletLine(t)) {
      const parts: string[] = [t];
      let j = i + 1;
      while (j < lines.length) {
        const uRaw = lines[j];
        const u = uRaw.trim();
        if (!u) break;
        if (isBulletLine(u) || isAllCapsSectionLine(u) || isPlaceholderResumeHeaderLine(uRaw)) break;
        if (looksLikeLoneJobTitleLine(u) || looksLikeEntryHeader(u) || looksLikeStructuredEmploymentLine(u)) {
          break;
        }
        parts.push(u);
        j++;
      }
      const merged = parts.join(" ");
      for (let k = i; k < j; k++) {
        if (lines[k].trim()) out[k] = merged;
      }
      i = j;
      continue;
    }

    // Wrapped paragraph where the first physical line lost the bullet marker (common in extracts)
    const parts: string[] = [t];
    let j = i;
    const maxUnmarkedWrap = 6;
    while (j + 1 < lines.length && parts.length < maxUnmarkedWrap) {
      const prev = lines[j].trim();
      const uRaw = lines[j + 1];
      const u = uRaw.trim();
      if (!u) break;
      if (isBulletLine(u) || isAllCapsSectionLine(u) || isPlaceholderResumeHeaderLine(uRaw)) break;
      if (looksLikeLoneJobTitleLine(u) || looksLikeEntryHeader(u) || looksLikeStructuredEmploymentLine(u)) {
        break;
      }
      if (isPhoneOrStructuredAfterEmail(prev, u)) break;

      const fc = u.charAt(0);
      if (/[a-z]/.test(fc)) {
        parts.push(u);
        j++;
        continue;
      }
      if (endsWithSentenceBoundary(prev) && /[A-Z]/.test(fc) && !/^[\(\[\d]/.test(u)) break;

      parts.push(u);
      j++;
    }
    const merged = parts.join(" ");
    for (let k = i; k <= j; k++) {
      if (lines[k].trim()) out[k] = merged;
    }
    i = j + 1;
  }

  /* PDF extracts sometimes drop the bullet on wrapped lines — a lowercase continuation
     sits in its own merge group and loses suggestion / bullet styling (orphan line).
     Attach those rows to the merged block of the nearest preceding bullet line. */
  for (let i = 0; i < lines.length - 1; i++) {
    const prevOut = (out[i] ?? "").trim();
    const nextOut = (out[i + 1] ?? "").trim();
    if (!prevOut || prevOut === nextOut) continue;
    const rawNext = lines[i + 1];
    const nextT = rawNext.trim();
    if (!nextT) continue;
    if (isBulletLine(rawNext) || isAllCapsSectionLine(nextT) || isPlaceholderResumeHeaderLine(rawNext)) continue;
    if (!/^[a-z]/.test(nextT)) continue;
    const rawCur = lines[i];
    const prevIsBulletRow = isBulletLine(rawCur) || isBulletLine(prevOut);
    if (prevIsBulletRow) out[i + 1] = out[i];
  }

  return out;
}

export function normalizeResumeLineForSuggestion(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d\u2032\u2033]/g, "'")
    .replace(/^[\s\u2022\u00b7\u2023\u2024\u2043\u2219\-\u2013\u2014*‧·.]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a plain-text résumé line corresponds to a suggestion's quoted `original`. */
export function resumeLineMatchesSuggestionOriginal(line: string, original: string): boolean {
  const no = normalizeResumeLineForSuggestion(original);
  const nl = normalizeResumeLineForSuggestion(line);
  if (!no || !nl) return false;
  if (nl === no) return true;

  const rawLine = line.trim().toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'");
  const rawOrig = original.trim().toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'");
  if (rawLine === rawOrig) return true;

  const minContains = 8;
  if (no.length >= minContains && nl.length >= minContains) {
    if (nl.includes(no) || no.includes(nl)) return true;
  }

  const prefLen = 55;
  const prefA = nl.slice(0, prefLen);
  const prefB = no.slice(0, prefLen);
  if (prefA.length >= 12 && prefB.length >= 12) {
    if (prefA.startsWith(prefB) || prefB.startsWith(prefA)) return true;
  }

  if (no.length >= 14 && nl.length >= 14) {
    const shorter = nl.length <= no.length ? nl : no;
    const longer = nl.length > no.length ? nl : no;
    if (longer.slice(0, shorter.length + 8).includes(shorter)) return true;
  }

  return false;
}

/**
 * Like {@link resumeLineMatchesSuggestionOriginal}, but avoids false positives when `line`
 * is a long merged block (several bullets concatenated): a short accepted `original` must
 * not match the whole paragraph just because it appears as a substring once.
 */
export function resumeLineMatchesAcceptedSuggestionHighlight(line: string, original: string): boolean {
  const no = normalizeResumeLineForSuggestion(original);
  const nl = normalizeResumeLineForSuggestion(line);
  if (!no || !nl) return false;
  if (nl === no) return true;
  const rawLine = line.trim().toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'");
  const rawOrig = original.trim().toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'");
  if (rawLine === rawOrig) return true;

  const minContains = 8;
  if (no.length >= minContains && nl.length >= minContains && nl.includes(no)) {
    const density = no.length / Math.max(nl.length, 1);
    if (nl.length > 180 && no.length < 120 && density < 0.12) return false;
  }

  return resumeLineMatchesSuggestionOriginal(line, original);
}
