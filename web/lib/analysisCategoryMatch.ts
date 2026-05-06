/**
 * Links sidebar analysis categories to bulletAnalysis rows.
 * Uses LLM issue strings plus lightweight heuristics so "Quantification"
 * highlights every bullet that still lacks metrics (not only rows where
 * the model happened to type "quantif…" in issues).
 */

export const CATEGORY_ISSUE_KEYWORDS: Record<string, string[]> = {
  quantification: [
    "quantif", "metric", "measur", "number", "percent", "%", "data",
    "scale", "figure", "statistic", "numeric", "lack of data", "no numbers",
  ],
  achievementQuality: [
    "weak action", "weak verb", "passive", "responsible for", "no achievement",
    "duty", "task", "vague outcome", "responsibilit", "collaborat", "unclear impact",
  ],
  languageQuality: [
    "passive voice", "buzzword", "first person", "filler", "cliché", "cliche",
    "wordy", "jargon", "generic", "overused", "grammar", "spelling", "tense",
  ],
  readability: [
    "too long", "length", "lengthy", "complex", "unclear", "run-on", "hard to read",
  ],
  atsCompatibility: [
    "ats", "keyword", "format", "parsing", "column", "table", "graphic",
  ],
  sectionStructure: [
    "section", "structure", "missing", "order", "heading", "summary",
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
  /\b(responsible\s+for|helped\s+with|assisted\s+with|worked\s+on|participated\s+in|involved\s+in|supported\s+the|handled\s+|managed\s+the\s+team|duties\s+included)\b/i;

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
      return /\b(grammar|spelling|punctuation|tense|pronoun|passive|unclear|buzzword|wordy)\b/i.test(
        issueBlob,
      );
    case "readability":
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
  const ordered = [
    "quantification",
    "achievementQuality",
    "languageQuality",
    "readability",
    "atsCompatibility",
    "sectionStructure",
    "technicalBranding",
    "jobMatch",
  ] as const;

  const issueBlob = bullet.issues.join(" ").toLowerCase();
  for (const cat of ordered) {
    const kws = CATEGORY_ISSUE_KEYWORDS[cat] ?? [];
    if (kws.some((kw) => issueBlob.includes(kw))) return cat;
  }

  if (!hasStrongQuantification(bullet.originalBullet)) return "quantification";
  if (ACHIEVEMENT_DUTY_PATTERNS.test(bullet.originalBullet)) return "achievementQuality";

  const text = bullet.originalBullet;
  const wc = text.trim().split(/\s+/).length;
  if (wc > 45 || text.length > 320) return "readability";

  if (bullet.score < 52) return "achievementQuality";

  return "languageQuality";
}
