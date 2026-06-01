/**
 * Shared bullet ↔ line matching for Analyze preview and Tailor gap-fix.
 * Single index model: `findBulletIndexForLine` maps extract lines to `bulletAnalysis[i]`.
 */

import { looksLikeStructuredEmploymentLine } from "@/lib/profileFromResumeText";
import {
  normalizeResumeExtractLine as normalizeExtractLine,
  looksLikeLoneJobTitleLine,
  looksLikeEntryHeader,
} from "@/lib/resumeEntryLineHeuristics";

export interface LiveBulletItem {
  originalBullet: string;
  score: number;
  issues: string[];
  improvedBullet: string;
}

export function normalizeForMatch(s: string): string {
  return s
    .replace(/•/g, "•")
    .replace(/^\s*[•*·\-–—]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map one extracted line to a bulletAnalysis index, or -1. Skips entry headers / job metadata. */
export function findBulletIndexForLine(
  line: string,
  bulletAnalysis: LiveBulletItem[],
): number {
  const trimmed = normalizeExtractLine(line);
  if (trimmed.length < 4) return -1;
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

function formatOverrideBullet(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^[•\-–*]/.test(t) || /^\u2022/.test(t) ? t : `• ${t.replace(/^•\s*/, "")}`;
}

/** Find a profile line index whose text best matches gap-fix `original`. */
export function findLineIndexForOriginal(original: string, lines: string[]): number {
  const origNorm = normalizeForMatch(original);
  if (origNorm.length < 6) return -1;

  let best = -1;
  let bestScore = 0;
  for (let li = 0; li < lines.length; li++) {
    const ln = normalizeForMatch(lines[li]);
    if (ln.length < 4) continue;
    if (ln === origNorm) return li;
    if (ln.includes(origNorm) || origNorm.includes(ln)) {
      const s = Math.min(ln.length, origNorm.length) / Math.max(ln.length, origNorm.length);
      if (s > bestScore) {
        bestScore = s;
        best = li;
      }
    }
  }
  return bestScore >= 0.45 ? best : -1;
}

/** Merge index-based preview overrides into plain text (Tailor rescore / gap-fix API). */
export function synthesizeProfileWithBulletOverrides(
  profileText: string,
  bullets: LiveBulletItem[],
  overrides: Record<number, string>,
): string {
  if (!Object.keys(overrides).length) return profileText;
  const lines = profileText.split("\n");
  const patched = [...lines];
  const seen = new Set<number>();

  for (let li = 0; li < lines.length; li++) {
    const idx = findBulletIndexForLine(lines[li], bullets);
    if (idx < 0 || overrides[idx] === undefined || seen.has(idx)) continue;
    const raw = overrides[idx].trim();
    if (!raw) continue;
    patched[li] = formatOverrideBullet(raw);
    seen.add(idx);
  }

  for (const [idxStr, overrideText] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    if (seen.has(idx)) continue;
    const raw = overrideText.trim();
    if (!raw) continue;
    const bullet = bullets[idx];
    const original = bullet?.originalBullet?.trim() ?? "";
    let lineIdx = original ? findLineIndexForOriginal(original, lines) : -1;
    if (lineIdx < 0 && original) {
      lineIdx = findLineIndexForOriginal(original, patched);
    }
    if (lineIdx >= 0) {
      patched[lineIdx] = formatOverrideBullet(raw);
      seen.add(idx);
      continue;
    }
    patched.push(formatOverrideBullet(raw));
    seen.add(idx);
  }

  return patched.join("\n");
}

// ── Tailor gap-fix: reverse-map suggestion `original` → bullet index ─────────

/** Match gap-fix `original` to an existing bulletAnalysis index, or -1. */
export function matchOriginalToBulletIndex(
  original: string,
  bullets: LiveBulletItem[],
  profileText: string,
): number {
  const origNorm = normalizeForMatch(original);
  if (!origNorm || origNorm.length < 8) return -1;

  for (let i = 0; i < bullets.length; i++) {
    const bNorm = normalizeForMatch(bullets[i].originalBullet);
    if (!bNorm) continue;
    if (bNorm === origNorm) return i;
    if (bNorm.length >= 20 && origNorm.length >= 20) {
      if (bNorm.includes(origNorm) || origNorm.includes(bNorm)) return i;
    }
  }

  const probe: LiveBulletItem = {
    originalBullet: original.trim(),
    score: 0,
    issues: [],
    improvedBullet: "",
  };

  for (const line of profileText.split("\n")) {
    if (findBulletIndexForLine(line, [probe]) !== 0) continue;
    const idx = findBulletIndexForLine(line, bullets);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Register a gap-fix target as a synthetic bullet when it is not in analysis output. */
export function registerGapFixBullet(
  bullets: LiveBulletItem[],
  original: string,
  suggested: string,
  profileText = "",
): { bullets: LiveBulletItem[]; index: number } {
  const existing = matchOriginalToBulletIndex(original, bullets, profileText);
  if (existing >= 0) return { bullets, index: existing };

  const next: LiveBulletItem = {
    originalBullet: original.trim(),
    score: 65,
    issues: [],
    improvedBullet: suggested.trim(),
  };
  return { bullets: [...bullets, next], index: bullets.length };
}

export function resolveBulletIndexForGapFix(
  original: string,
  suggested: string,
  bullets: LiveBulletItem[],
  profileText: string,
): { bullets: LiveBulletItem[]; index: number } {
  const idx = matchOriginalToBulletIndex(original, bullets, profileText);
  if (idx >= 0) return { bullets, index: idx };
  return registerGapFixBullet(bullets, original, suggested, profileText);
}

/** Indices to purple-highlight while a gap-fix panel is open (virtual register for display). */
export function gapFixTargetBulletIndices(
  suggestions: Array<{ original: string; suggested: string }>,
  bullets: LiveBulletItem[],
  profileText: string,
): number[] {
  const extended = [...bullets];
  const indices = new Set<number>();
  for (const s of suggestions) {
    let idx = matchOriginalToBulletIndex(s.original, extended, profileText);
    if (idx < 0) {
      const reg = registerGapFixBullet(extended, s.original, s.suggested, profileText);
      extended.splice(0, extended.length, ...reg.bullets);
      idx = reg.index;
    }
    if (idx >= 0) indices.add(idx);
  }
  return [...indices];
}
