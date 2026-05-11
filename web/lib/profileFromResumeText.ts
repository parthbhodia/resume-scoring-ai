/**
 * Best-effort extraction of Profile fields from plain resume text (PDF extract).
 * Conservative: only patterns we can trust; never overwrites in merge (see mergeProfilePreferEmpty).
 */

import type { ProfileFormState } from "./profileStorage";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub)\/[\w-]+\/?/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+(?:\/[\w-]+)?\/?/i;
const URL_RE = /https?:\/\/[^\s\])"'<>]+/gi;

const EDU_INST_RE = /(university|college|institute|school of)\b/i;

/** Month + day + year then dash — typical employment dates, not degree lines. */
const EMPLOYMENT_DATE_TAIL_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s.,]+\d{1,2},?\s*\d{4}\s*[-–]/i;

function firstUrl(text: string, exclude: Set<string>): string | null {
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const u = m[0].replace(/[.,;]+$/, "");
    const low = u.toLowerCase();
    if (low.includes("linkedin.com")) continue;
    if (exclude.has(low)) continue;
    return u;
  }
  return null;
}

function cleanLine(s: string): string {
  return s.replace(/^[\s•\-–*]+/, "").trim();
}

function pipeCount(line: string): number {
  return (line.match(/\|/g) ?? []).length;
}

/**
 * Heuristic: structured résumé job/experience rows (title | org | place | dates).
 * Avoid using these for headline, school, degree, or loose graduation.
 */
function looksLikeStructuredEmploymentLine(line: string): boolean {
  const pipes = pipeCount(line);
  if (pipes >= 2) return true;
  if (pipes >= 1 && /\b(20\d{2}|19\d{2})\s*[-–]\s*(present|current|now)\b/i.test(line)) return true;
  if (pipes >= 1 && EMPLOYMENT_DATE_TAIL_RE.test(line)) return true;
  return false;
}

/**
 * From a piped line, return the segment that names a school (e.g. middle part of a job row at a university).
 */
function schoolSegmentFromPipedLine(line: string): string | null {
  if (!line.includes("|") || !EDU_INST_RE.test(line)) return null;
  const parts = line
    .split("|")
    .map(p => p.trim())
    .filter(Boolean);
  const seg = parts.find(p => EDU_INST_RE.test(p) && p.length <= 110);
  if (!seg) return null;
  if (/\b(20\d{2}|19\d{2})\s*[-–]\s*(present|current|now)\b/i.test(seg)) return null;
  return seg.replace(/^[-•*]\s*/, "").trim();
}

/**
 * School: prefer clean one-line education rows; else extract school-named segment from piped experience lines.
 */
function pickSchoolFromLines(lines: string[]): string | null {
  for (const line of lines) {
    if (!EDU_INST_RE.test(line) || line.length > 130) continue;
    if (line.includes("|")) continue;
    if (looksLikeStructuredEmploymentLine(line)) continue;
    return line.replace(/^[-•*]\s*/, "").trim();
  }
  for (const line of lines) {
    const fromPipe = schoolSegmentFromPipedLine(line);
    if (fromPipe) return fromPipe;
  }
  return null;
}

/** ATS / PDF lines like "Location:JerseyCity,NJ…" — not a résumé headline. */
function looksLikeLocationOrAddressLine(line: string): boolean {
  const t = line.trim();
  if (/^(location|address|based\s+in|residing|citizenship|visa\s*status)\s*:/i.test(t)) return true;
  if (/^location\s*[|]/i.test(t)) return true;
  // Collapsed geo after "Location:" (few spaces, commas, run-on words)
  if (/location\s*:/i.test(t) && (t.match(/\s/g) ?? []).length <= 4 && (t.match(/,/g) ?? []).length >= 1) return true;
  return false;
}

/**
 * A line starting with a résumé action verb is a bullet point, not a
 * headline. Catches the common offenders: "Collaborated on…", "Built…",
 * "Designed…", etc. — these would otherwise sneak through the 14-line
 * window and overwrite the headline field with a paragraph of body copy.
 */
const BULLET_VERB_PREFIX_RE =
  /^(collaborat|built|designed|develop|creat|implement|led|manag|architect|engineer|work|spearhead|drove|improv|increas|reduc|optimiz|coordinat|deliver|launch|maintain|owned?|shipp|refactor|migrat|achiev|establish|construct|integrat|deploy|configur|test|wrote|setup|set\s+up|analyz|research|present|orchestrat|enhanc|automat|debugg|trained|mentor|drafted|authored|composed|produced|prepared|conducted|overseen|oversaw|reviewed|prototyped|streamlin)\w*\s/i;

function firstHeadlineCandidate(lines: string[], displayName: string | undefined): string | null {
  if (!displayName?.trim()) return null;
  let seenNameLine = false;
  for (const line of lines.slice(0, 14)) {
    // Resume taglines are short by design — anything > 90 chars is almost
    // certainly a bullet that wrapped onto a single line during PDF extract.
    if (line.length < 12 || line.length > 90) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line) || /https?:/i.test(line)) continue;
    if (line === displayName) {
      seenNameLine = true;
      continue;
    }
    if (!seenNameLine) continue;
    if (looksLikeLocationOrAddressLine(line)) continue;
    if (looksLikeStructuredEmploymentLine(line)) continue;
    if (BULLET_VERB_PREFIX_RE.test(line)) continue;
    if (/^(experience|education|skills|projects|summary|objective|work|employment|publications)/i.test(line)) continue;
    if (/^\d{4}\s*[-–]\s*/.test(line)) continue;
    if (EDU_INST_RE.test(line) && /\b(20\d{2}|19\d{2})\b/.test(line)) continue;
    return line;
  }
  return null;
}

/**
 * Graduation year only when the line clearly talks about completing a program — not job dates ("January 2022").
 */
function graduationYearFromLine(line: string): string | null {
  if (looksLikeStructuredEmploymentLine(line)) return null;
  const low = line.toLowerCase();
  if (!/\b(20\d{2}|19\d{2})\b/.test(line)) return null;
  const programWords = /\b(graduat|graduation|graduating|expected|class\s+of|completed|degree|diploma|bachelor|master|associate|ph\.?\s*d\.?|mba|b\.?\s*s\.?|m\.?\s*s\.?|b\.?\s*a\.?|m\.?\s*a\.?)\b/i.test(
    low,
  );
  const schoolAndMonthYear =
    EDU_INST_RE.test(line) &&
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b.*\b(20\d{2}|19\d{2})\b/i.test(
      low,
    );
  if (!programWords && !schoolAndMonthYear) return null;
  const ym = line.match(/\b(20\d{2}|19\d{2})\b/);
  return ym ? ym[0] : null;
}

/**
 * Pull obvious contact / headline hints. Education is best-effort from common résumé lines.
 */
export function extractProfileHintsFromResumeText(raw: string): Partial<ProfileFormState> {
  const hints: Partial<ProfileFormState> = {};
  if (!raw || typeof raw !== "string") return hints;

  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n").map(cleanLine).filter(Boolean);

  const em = text.match(EMAIL_RE);
  if (em) hints.email = em[0].trim();

  const ph = text.match(PHONE_RE);
  if (ph) hints.phone = ph[0].trim();

  const li = text.match(LINKEDIN_RE);
  if (li) hints.linkedin = li[0].trim().replace(/^https?:\/\//i, "");

  const gh = text.match(GITHUB_RE);
  const exclude = new Set<string>();
  if (li) exclude.add(li[0].toLowerCase());
  if (gh) {
    hints.portfolio = gh[0].trim();
    exclude.add(gh[0].toLowerCase());
  }
  const other = firstUrl(text, exclude);
  if (other && !hints.portfolio) hints.portfolio = other;

  // First short line as possible display name (avoid section headers)
  for (const line of lines.slice(0, 8)) {
    if (line.length > 50 || line.length < 3) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line) || /https?:/i.test(line)) continue;
    if (/^(experience|education|skills|projects|summary|objective|work|employment)/i.test(line)) continue;
    if (/^\d{4}\s*[-–]\s*/.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 && /^[A-Za-z.'\s-]+$/i.test(line)) {
      hints.displayName = line;
      break;
    }
  }

  const hl = firstHeadlineCandidate(lines, hints.displayName);
  if (hl) hints.headline = hl;

  const school = pickSchoolFromLines(lines);
  if (school) hints.school = school;

  for (const line of lines) {
    if (looksLikeStructuredEmploymentLine(line)) continue;
    if (
      !hints.degree &&
      /\b(B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Ph\.?D\.?|MBA|Bachelor|Master|Associate)\b/i.test(line) &&
      line.length < 140
    ) {
      hints.degree = line.replace(/^[-•*]\s*/, "").trim();
    }
    if (!hints.graduation) {
      const gy = graduationYearFromLine(line);
      if (gy) hints.graduation = gy;
    }
  }

  return hints;
}
