/**
 * Links sidebar analysis categories to bulletAnalysis rows.
 * Achievement vs quantification are distinct. Quantification flags only
 * high-impact opportunities (~50% target), not every bullet without numbers.
 */

/** Matches passive/copula patterns mirrored from backend `_PASSIVE_BULLET_RE`. */
const PASSIVE_BULLET_RE =
  /\b(?:was|were|is|are|been|being)\s+[a-z]{2,22}(?:ed|en)\b/i;

/** Opening a bullet with a date range (dates belong on role headers). */
const BULLET_DATE_LEAD_RE =
  /^[•\-–*▪▸]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[,. ]+\d{4}\b|(?:19|20)\d{2}\s*[-–/]\s*(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent)|(?:19|20)\d{2}\b\s*[,–-]\s*(?:19|20)\d{2}\b)/i;

const QUANT_ISSUE_RE =
  /\b(?:quantif|metric|measur|no numbers|lack of data|specific metrics|numeric|no metrics|percent|%|scale|figure)\b/i;

const ACHIEVEMENT_ISSUE_RE =
  /\b(?:weak action|weak verb|responsible for|duty-only|task-focused|vague outcome|helped with|assisted with|no achievement|duty list|passive)\b/i;

const IMPACT_VERB_RE =
  /\b(led|managed|developed|built|designed|implemented|delivered|achieved|increased|reduced|improved|launched|optimized|streamlined|grew|saved|generated)\b/i;

/** Recruiter-style target: roughly half of experience bullets benefit from metrics. */
export const TARGET_QUANTIFIED_BULLET_SHARE = 0.5;

export const CATEGORY_ISSUE_KEYWORDS: Record<string, string[]> = {
  quantification: [
    "quantif", "metric", "measur", "percent", "%",
    "scale", "figure", "statistic", "numeric",
    "lack of data", "no numbers", "add numbers", "no metrics",
    "fact-based", "demonstrat result",
  ],
  achievementQuality: [
    "weak action", "weak verb", "responsible for", "no achievement",
    "duty", "task-focused", "vague outcome", "responsibilit",
    "passive", "owned", "narrative", "accomplishment", "outcome-focused",
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
    "github", "gitlab", "portfolio",
    "tech stack", "technology stack", "full stack", "technical stack",
    "stack depth", "technical branding", "developer portfolio",
    "writing sample", "work sample", "teaching portfolio",
    "clinical credential", "licensure", "board certified",
    "creative reel", "publications section", "domain expertise", "field-specific",
  ],
  jobMatch: [
    "keyword", "match", "missing term", "requirement", "job description", "jd",
  ],
};

export type CategoryRewriteBullet = {
  originalBullet: string;
  improvedBullet?: string;
  categoryRewrites?: Partial<Record<string, string>>;
  issues?: string[];
  score: number;
  /**
   * Backend-supplied category bucketing (since the structured-fields change).
   * When present and valid these are authoritative — the heuristics below are
   * only a fallback for restored-history payloads that predate the fields.
   * `_normalize_analysis` guarantees primaryCategory ∈ CATEGORY_SCORE_KEYS,
   * issueCategories ⊆ keys ∪ {primaryCategory}, and that "quantification" only
   * appears when a surviving rewrite actually adds a numeral.
   */
  primaryCategory?: string;
  issueCategories?: string[];
};

/** Canonical categoryScores keys — mirror of backend `_CATEGORY_SCORE_KEYS`. */
export const CATEGORY_SCORE_KEYS = [
  "readability", "atsCompatibility", "jobMatch", "achievementQuality",
  "quantification", "sectionStructure", "languageQuality", "technicalBranding",
] as const;

const CATEGORY_KEY_SET = new Set<string>(CATEGORY_SCORE_KEYS);

/** Authoritative primary category from the backend, if it supplied a valid one. */
function explicitPrimaryCategory(bullet: CategoryRewriteBullet): string | null {
  const p = bullet.primaryCategory;
  return typeof p === "string" && CATEGORY_KEY_SET.has(p) ? p : null;
}

/** API / restored history rows may omit `issues`; treat as empty. */
export function bulletIssueList(bullet: CategoryRewriteBullet): string[] {
  return Array.isArray(bullet.issues) ? bullet.issues : [];
}

export type CategoryAssignmentOptions = {
  /** JD / keyword overlap boosts quant priority on relevant bullets. */
  jdKeywords?: string[];
  /** Target share of sample bullets to flag for metrics (default 0.5). */
  targetQuantShare?: number;
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

function issueMatchesCategoryKeywords(issueBlob: string, category: string): boolean {
  const kws = CATEGORY_ISSUE_KEYWORDS[category] ?? [];
  return kws.some((kw) => issueBlob.includes(kw));
}

function bulletSignalsAchievementWeakness(bullet: CategoryRewriteBullet): boolean {
  const issueBlob = bulletIssueList(bullet).join(" ").toLowerCase();
  if (ACHIEVEMENT_DUTY_PATTERNS.test(bullet.originalBullet)) return true;
  if (ACHIEVEMENT_ISSUE_RE.test(issueBlob)) return true;
  return issueMatchesCategoryKeywords(issueBlob, "achievementQuality");
}

function bulletSignalsExplicitQuantIssue(bullet: CategoryRewriteBullet): boolean {
  const issueBlob = bulletIssueList(bullet).join(" ").toLowerCase();
  if (QUANT_ISSUE_RE.test(issueBlob)) return true;
  return issueMatchesCategoryKeywords(issueBlob, "quantification");
}

function normalizeForRewriteDiff(value: string): string {
  return value
    .trim()
    .replace(/^[\s•\-*▪▸●◦‧·・‣⁃►➤○⚫—–‑]+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[ .,:;]+$/g, "");
}

function wordJaccard(a: string, b: string): number {
  const aw = new Set(a.toLowerCase().match(/\b\w+\b/g) ?? []);
  const bw = new Set(b.toLowerCase().match(/\b\w+\b/g) ?? []);
  if (aw.size === 0 && bw.size === 0) return 1;
  if (aw.size === 0 || bw.size === 0) return 0;
  let overlap = 0;
  for (const word of aw) {
    if (bw.has(word)) overlap += 1;
  }
  return overlap / new Set([...aw, ...bw]).size;
}

function tokenMorphVariants(token: string): Set<string> {
  const t = token.toLowerCase();
  const variants = new Set([t]);
  if (t.length >= 5 && t.endsWith("ed")) {
    const root = t.slice(0, -2);
    variants.add(root);
    variants.add(`${root}e`);
  }
  if (t.length >= 6 && t.endsWith("ing")) {
    const root = t.slice(0, -3);
    variants.add(root);
    variants.add(`${root}e`);
  }
  if (t.length >= 4 && t.endsWith("s") && !t.endsWith("ss")) {
    variants.add(t.slice(0, -1));
  }
  return variants;
}

function isMorphologyOnlyRewrite(original: string, rewrite: string): boolean {
  const originalWords = original.toLowerCase().match(/\b[a-zA-Z]+\b/g) ?? [];
  const rewriteWords = rewrite.toLowerCase().match(/\b[a-zA-Z]+\b/g) ?? [];
  if (originalWords.length === 0 || originalWords.length !== rewriteWords.length) return false;

  let changed = 0;
  for (let i = 0; i < originalWords.length; i += 1) {
    const originalWord = originalWords[i];
    const rewriteWord = rewriteWords[i];
    if (originalWord === rewriteWord) continue;

    const originalVariants = tokenMorphVariants(originalWord);
    const rewriteVariants = tokenMorphVariants(rewriteWord);
    if (![...originalVariants].some((variant) => rewriteVariants.has(variant))) {
      return false;
    }
    changed += 1;
  }

  return changed > 0 && changed <= 2;
}

export function isTrivialRewrite(original: string, rewrite?: string | null): boolean {
  const text = rewrite?.trim() ?? "";
  if (!text) return true;
  if (normalizeForRewriteDiff(original) === normalizeForRewriteDiff(text)) return true;
  if (wordJaccard(original, text) >= 0.88) return true;
  return isMorphologyOnlyRewrite(original, text);
}

/** Priority score for adding metrics (higher = flag under Quantification first). */
export function quantificationImpactScore(
  bullet: CategoryRewriteBullet,
  jdKeywords: string[] = [],
): number {
  if (hasStrongQuantification(bullet.originalBullet)) return 0;

  let score = 0;
  const text = bullet.originalBullet.toLowerCase();
  const issueBlob = bulletIssueList(bullet).join(" ").toLowerCase();

  if (bulletSignalsExplicitQuantIssue(bullet)) score += 45;
  score += Math.max(0, 88 - bullet.score);
  if (IMPACT_VERB_RE.test(text)) score += 18;
  if (ACHIEVEMENT_DUTY_PATTERNS.test(text)) score -= 30;

  for (const kw of jdKeywords) {
    const k = kw.toLowerCase().trim();
    if (k.length >= 3 && text.includes(k)) score += 14;
  }

  const wc = text.split(/\s+/).filter(Boolean).length;
  if (wc >= 10 && wc <= 40) score += 6;

  return Math.max(0, score);
}

/** Base category from issues/heuristics — never assigns quantification just for missing numbers. */
function inferBaseCategory(bullet: CategoryRewriteBullet): string {
  const issueBlob = bulletIssueList(bullet).join(" ").toLowerCase();
  const text = bullet.originalBullet;

  if (bulletSignalsExplicitQuantIssue(bullet) && !bulletSignalsAchievementWeakness(bullet)) {
    return "quantification";
  }
  if (bulletSignalsAchievementWeakness(bullet) && !bulletSignalsExplicitQuantIssue(bullet)) {
    return "achievementQuality";
  }
  if (bulletSignalsAchievementWeakness(bullet) && bulletSignalsExplicitQuantIssue(bullet)) {
    if (ACHIEVEMENT_DUTY_PATTERNS.test(text) || ACHIEVEMENT_ISSUE_RE.test(issueBlob)) {
      return "achievementQuality";
    }
    return "quantification";
  }

  const keywordOrder = [
    "languageQuality",
    "readability",
    "atsCompatibility",
    "sectionStructure",
    "technicalBranding",
    "jobMatch",
  ] as const;
  for (const cat of keywordOrder) {
    if (issueMatchesCategoryKeywords(issueBlob, cat)) return cat;
  }

  if (PASSIVE_BULLET_RE.test(text) || /\b(?:grammar|spelling|passive|buzzword)\b/i.test(issueBlob)) {
    return "languageQuality";
  }
  const wc = text.trim().split(/\s+/).length;
  if (wc > 45 || text.length > 320 || BULLET_DATE_LEAD_RE.test(text.trim())) {
    return "readability";
  }

  if (bullet.score < 52) return "achievementQuality";
  return "languageQuality";
}

/**
 * One primary pillar per bullet. Quantification is capped (~50% of sample) and
 * prefers JD-relevant, high-impact lines — not every unquantified bullet.
 */
export function buildBulletPrimaryCategories(
  bullets: CategoryRewriteBullet[],
  opts: CategoryAssignmentOptions = {},
): string[] {
  if (!bullets.length) return [];

  // Fast path: if the backend supplied a valid primaryCategory for EVERY
  // bullet, trust it verbatim. This is the post-structured-fields contract —
  // no guessing, no quant-share rebalancing that can disagree with the
  // backend's own tagging. Mixed/missing (legacy restored payloads) falls
  // through to the heuristic for the whole list so its global quant capping
  // stays coherent.
  if (bullets.every((b) => explicitPrimaryCategory(b) !== null)) {
    return bullets.map((b) => explicitPrimaryCategory(b) as string);
  }

  const jdKeywords = opts.jdKeywords ?? [];
  const targetShare = opts.targetQuantShare ?? TARGET_QUANTIFIED_BULLET_SHARE;
  const categories = bullets.map((b) => inferBaseCategory(b));

  const targetQuantCount = Math.max(
    categories.filter((c) => c === "quantification").length,
    Math.min(
      bullets.length,
      Math.max(1, Math.ceil(bullets.length * targetShare)),
    ),
  );

  const explicitQuant = new Set<number>();
  categories.forEach((cat, i) => {
    if (cat === "quantification") explicitQuant.add(i);
  });

  const candidates = bullets
    .map((b, i) => ({ b, i, score: quantificationImpactScore(b, jdKeywords) }))
    .filter(
      ({ b, i, score }) =>
        score > 0
        && !explicitQuant.has(i)
        && !hasStrongQuantification(b.originalBullet)
        && categories[i] !== "achievementQuality",
    )
    .sort((a, b) => b.score - a.score);

  let quantAssigned = explicitQuant.size;
  for (const { i } of candidates) {
    if (quantAssigned >= targetQuantCount) break;
    categories[i] = "quantification";
    quantAssigned += 1;
  }

  return categories;
}

/** @deprecated Prefer buildBulletPrimaryCategories for lists; kept for single-bullet fallback. */
export function inferPrimaryCategoryFromBullet(
  bullet: CategoryRewriteBullet,
  allBullets?: CategoryRewriteBullet[],
  index?: number,
  opts?: CategoryAssignmentOptions,
): string {
  const explicit = explicitPrimaryCategory(bullet);
  if (explicit) return explicit;
  if (allBullets?.length) {
    const idx = index ?? allBullets.indexOf(bullet);
    if (idx >= 0) return buildBulletPrimaryCategories(allBullets, opts)[idx] ?? inferBaseCategory(bullet);
  }
  return inferBaseCategory(bullet);
}

/** Whether this bullet belongs to `category` for highlighting / filtering. */
export function bulletMatchesAnalysisCategory(
  bullet: CategoryRewriteBullet,
  category: string | null,
  allBullets?: CategoryRewriteBullet[],
  bulletIndex?: number,
  opts?: CategoryAssignmentOptions,
): boolean {
  if (!category) return false;
  const explicit = explicitPrimaryCategory(bullet);
  if (explicit) return explicit === category;
  if (allBullets?.length) {
    const idx = bulletIndex ?? allBullets.indexOf(bullet);
    if (idx >= 0) {
      return buildBulletPrimaryCategories(allBullets, opts)[idx] === category;
    }
  }
  return inferBaseCategory(bullet) === category;
}

export function countBulletsInCategory(
  primaryCategories: string[],
  category: string,
): number {
  return primaryCategories.filter((c) => c === category).length;
}

/** Issue tags relevant to the active category. */
export function filterIssuesForCategory(issues: string[] | undefined | null, category: string): string[] {
  const list = Array.isArray(issues) ? issues : [];
  if (!list.length) return list;
  const kws = CATEGORY_ISSUE_KEYWORDS[category] ?? [];
  const filtered = list.filter((iss) => {
    const low = iss.toLowerCase();
    return kws.some((kw) => low.includes(kw));
  });
  return filtered.length > 0 ? filtered : list;
}

/** Rewrite text for the active category. */
export function getRewriteForCategory(
  bullet: CategoryRewriteBullet,
  category: string,
  userDraft?: string | null,
  allBullets?: CategoryRewriteBullet[],
  bulletIndex?: number,
  opts?: CategoryAssignmentOptions,
): string {
  if (userDraft != null && userDraft.trim() !== "") return userDraft.trim();
  const focused = bullet.categoryRewrites?.[category]?.trim();
  if (focused && !isTrivialRewrite(bullet.originalBullet, focused)) return focused;

  const primary = explicitPrimaryCategory(bullet)
    ?? (allBullets?.length
      ? buildBulletPrimaryCategories(allBullets, opts)[bulletIndex ?? allBullets.indexOf(bullet)]
      : inferBaseCategory(bullet));

  if (
    primary === category
    && bullet.improvedBullet?.trim()
    && !isTrivialRewrite(bullet.originalBullet, bullet.improvedBullet)
  ) {
    return bullet.improvedBullet.trim();
  }
  return "";
}

export const CATEGORY_REWRITE_HINTS: Record<string, string> = {
  quantification:
    "Add a number where it helps—%, $, scale, or time saved. Not every bullet needs one; use [X%] if unknown.",
  achievementQuality: "Start with a strong verb and what you delivered—not duties.",
};
