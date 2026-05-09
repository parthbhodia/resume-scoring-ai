/**
 * Links sidebar analysis categories to bulletAnalysis rows.
 * Uses LLM issue strings plus lightweight heuristics so "Quantification"
 * highlights every bullet that still lacks metrics (not only rows where
 * the model happened to type "quantif…" in issues).
 */

/** Matches passive/copula patterns mirrored from backend `_PASSIVE_BULLET_RE`. */
const PASSIVE_BULLET_RE =
  /\b(?:was|were|is|are|been|being)\s+[a-z]{2,22}(?:ed|en)\b/i;

/** Opening a bullet with a date range (dates belong on role headers). */
const BULLET_DATE_LEAD_RE =
  /^[•\-–*▪▸]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[,. ]+\d{4}\b|(?:19|20)\d{2}\s*[-–/]\s*(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent)|(?:19|20)\d{2}\b\s*[,–-]\s*(?:19|20)\d{2}\b)/i;

export const CATEGORY_ISSUE_KEYWORDS: Record<string, string[]> = {
  quantification: [
    "quantif", "metric", "measur", "percent", "%",
    "scale", "figure", "statistic", "numeric",
    "lack of data", "no numbers", "add numbers", "no metrics",
    "fact-based", "demonstrat result",
  ],
  achievementQuality: [
    "weak action", "weak verb", "responsible for", "no achievement",
    "duty", "task", "vague outcome", "responsibilit", "unclear impact",
    "passive", "owned", "outcome", "impact", "narrative", "results",
  ],
  languageQuality: [
    "passive voice", "active voice", "buzzword", "first person", "filler", "cliché", "cliche",
    "wordy", "jargon", "generic", "overused", "grammar", "spelling", "tense",
    "flowery", "slang", "abbreviat", "spell",
  ],
  readability: [
    "too long", "length", "lengthy", "complex", "unclear", "run-on", "hard to read",
    "skim", "concise", "organized", "white space",
  ],
  atsCompatibility: [
    "ats", "keyword", "format", "parsing", "column", "table", "graphic",
  ],
  sectionStructure: [
    "section", "structure", "missing", "order", "heading", "summary",
    "reverse chronological", "chronolog", "references", "objective",
    "umbc", "professional experience", "additional experience", "coursework", "gpa",
    "certification", "publication", "presentation", "poster", "honors", "activities", "service",
  ],
  technicalBranding: [
    "technical", "skill", "technology", "stack", "tool", "github", "link",
  ],
  jobMatch: [
    "keyword", "match", "missing term", "requirement", "job description", "jd",
  ],
};

/** True if the bullet text already shows measurable / scale signals. */
export function hasStrongQuantification(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\b\d[\d,]*\.?\d*\s*%/.test(t)) return true;
  if (/\$\s*[\d,]+|[\d,]+\s*(USD|usd)/i.test(t)) return true;
  if (/\b\d[\d,]*\.?\d*\s*\+?\s*(k\b|m\b|million|thousand|billion)\b/i.test(t)) return true;
  if (/\b\d[\d,]*\s+(users|customers|clients|requests|rpm|rps|tps|qps)\b/i.test(t)) return true;
  if (/\d+\s*(ms|sec|hrs?|minutes?)\b/i.test(t)) return true;
  if (/\b(by|saved|cut|reduced|increased|improved|grew|decreased|boosted)[^.]{0,55}\d/i.test(t)) return true;
  if (/\b(top\s*\d+|#\s*\d+|rank(?:ed)?\s*(#?\d+|top))\b/i.test(t)) return true;
  if (/\b\d+\s*(x|times|fold)\b/i.test(t)) return true;
  return false;
}

const ACHIEVEMENT_DUTY_PATTERNS =
  /\b(responsible\s+for|helped\s+with|assisted\s+with|worked\s+on|participated\s+in|involved\s+in|supported\s+the|duties\s+included)\b/i;

/** Whether this bullet belongs to `category` for highlighting / filtering. */
export function bulletMatchesAnalysisCategory(
  bullet: { issues: string[]; originalBullet: string; score: number },
  category: string | null,
): boolean {
  if (!category) return false;
  const issueBlob = bullet.issues.join(" ").toLowerCase();
  const kws = CATEGORY_ISSUE_KEYWORDS[category] ?? [];
  if (kws.some((kw) => issueBlob.includes(kw))) return true;

  switch (category) {
    case "quantification":
      return !hasStrongQuantification(bullet.originalBullet);
    case "achievementQuality":
      if (ACHIEVEMENT_DUTY_PATTERNS.test(bullet.originalBullet)) return true;
      return /\b(achievement|outcome|impact|responsibilit|duty|weak verb|specific|measurable outcome)\b/i.test(
        issueBlob,
      );
    case "languageQuality":
      if (PASSIVE_BULLET_RE.test(bullet.originalBullet)) return true;
      return /\b(?:grammar|spelling|punctuation|tense|pronoun|passive|unclear|buzzword|wordy|weak\s+language|sentence|fluency|clarity|capitali[sz]ation|hyphen|word\s+choice|tone|flowery|slang)\b|passive\s+voice/i.test(
        issueBlob,
      );
    case "readability":
      if (BULLET_DATE_LEAD_RE.test(bullet.originalBullet.trim())) return true;
      return (
        bullet.originalBullet.trim().split(/\s+/).length > 55 ||
        bullet.originalBullet.length > 420
      );
    default:
      return false;
  }
}

/** Best sidebar category for a bullet (reverse link: preview → left rail). */
export function inferPrimaryCategoryFromBullet(bullet: {
  issues: string[];
  originalBullet: string;
  score: number;
}): string {
  const issueBlob = bullet.issues.join(" ").toLowerCase();

  // Hard-priority: explicit quantification language should always classify as Quantification,
  // even when the same issue text also contains words like "generic" that map to Language.
  if (/\b(?:quantif|metric|measur|no numbers|lack of data|specific metrics|numeric)\b/i.test(issueBlob)) {
    return "quantification";
  }

  /* Match issue-text keywords — language / structure before quantification so
   * words like “data” in “consumer data” do not classify as Quantification. */
  const keywordOrder = [
    "languageQuality",
    "readability",
    "achievementQuality",
    "atsCompatibility",
    "sectionStructure",
    "technicalBranding",
    "jobMatch",
    "quantification",
  ] as const;
  for (const cat of keywordOrder) {
    const kws = CATEGORY_ISSUE_KEYWORDS[cat] ?? [];
    if (kws.some((kw) => issueBlob.includes(kw))) return cat;
  }

  /* Issue heuristics (no keyword hit) — still before blanket “needs metrics”. */
  if (bulletMatchesAnalysisCategory(bullet, "languageQuality")) return "languageQuality";
  const text = bullet.originalBullet;
  const wc = text.trim().split(/\s+/).length;
  if (wc > 45 || text.length > 320) return "readability";
  if (ACHIEVEMENT_DUTY_PATTERNS.test(text)) return "achievementQuality";
  if (bulletMatchesAnalysisCategory(bullet, "achievementQuality")) return "achievementQuality";

  if (!hasStrongQuantification(text)) return "quantification";

  if (bullet.score < 52) return "achievementQuality";

  return "languageQuality";
}
