/**
 * Shared heuristics for plain-text / PDF résumé lines (experience headers, job titles).
 * Used by suggestion line merging and live bullet indexing so designations are not
 * lumped with bullet bodies.
 */

/** Same keyword set as AnalyzeLiveResumeBody — full trimmed line. */
const KNOWN_SECTIONS =
  /^(?:EXPERIENCE|WORK\s+HISTORY|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|PROFESSIONAL\s+HISTORY|EMPLOYMENT(?:\s+HISTORY)?|CAREER(?:\s+HISTORY|\s+OVERVIEW|\s+SUMMARY)?|EDUCATION|SKILLS|SUMMARY|PROFILE|PROJECTS|CERTIFICATIONS|AWARDS|PUBLICATIONS|LANGUAGES|VOLUNTEER|PROFESSIONAL\s+SUMMARY|TECHNICAL\s+SKILLS|ACHIEVEMENTS?|REFERENCES|OBJECTIVE|ACTIVITIES|HONORS|LEADERSHIP|INTERESTS|EXTRACURRICULAR)\s*$/iu;

const BULLET_LINE_START =
  /^[\s\uFEFF]*(?:[-*•●◦‧·・‣⁃▪►➤○⚫—–‑]|\d{1,2}[\).\]])/u;

export function normalizeResumeExtractLine(raw: string): string {
  return raw.replace(/\ufeff/g, "").trim();
}

export function lineLooksLikeBulletLead(line: string): boolean {
  return BULLET_LINE_START.test(normalizeResumeExtractLine(line));
}

/**
 * Single-line job title under an employer row (no dates, no pipes) — must not map to bullet rows
 * or merge with following bullets for suggestion highlighting.
 */
export function looksLikeLoneJobTitleLine(line: string): boolean {
  const t = normalizeResumeExtractLine(line);
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

/** Job/education entry header (title | company | date, or date ranges, etc.). */
export function looksLikeEntryHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 200) return false;
  if (t.includes("|")) return true;
  if (/\b(19|20)\d{2}\s*[–—\-]\s*((19|20)\d{2}|present|current)/i.test(t)) return true;
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(19|20)\d{2}/i.test(t)) return true;
  if (t.includes("·") && t.split("·").length >= 2) return true;
  return false;
}
