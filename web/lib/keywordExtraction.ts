/**
 * Lightweight client-side ATS keyword extraction.
 *
 * The backend's authoritative keyword analysis is LLM-driven and only runs in
 * the full analyze pipeline. There was no reusable frontend extractor, so this
 * provides a fast, dependency-free approximation for surfacing the keywords a
 * job description emphasizes (used by the Interview Prep Job Description card).
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "will", "have",
  "has", "this", "that", "from", "they", "their", "them", "but", "not", "all",
  "any", "can", "who", "what", "when", "where", "which", "how", "why", "into",
  "out", "use", "using", "used", "able", "work", "working", "team", "teams",
  "role", "roles", "job", "jobs", "must", "should", "would", "could", "etc",
  "per", "via", "across", "within", "including", "include", "includes", "plus",
  "years", "year", "experience", "experiences", "strong", "good", "great",
  "excellent", "ability", "abilities", "skills", "skill", "knowledge", "new",
  "well", "high", "highly", "ideal", "candidate", "candidates", "requirements",
  "requirement", "responsibilities", "responsibility", "preferred", "required",
  "plus", "min", "max", "etc", "such", "more", "most", "other", "others",
]);

/** Keep recognizable tech tokens like "c++", "ci/cd", "node.js". */
const TOKEN_RE = /[a-z][a-z0-9.+#/-]*[a-z0-9+#]|[a-z]/gi;

/**
 * Extract a frequency-ordered, de-duplicated list of candidate keywords.
 *
 * @param text Job description (or any free text).
 * @param limit Max keywords to return.
 */
export function extractKeywords(text: string, limit = 20): string[] {
  if (!text.trim()) return [];

  const counts = new Map<string, number>();
  const order: string[] = [];

  const matches = text.toLowerCase().match(TOKEN_RE) ?? [];
  for (const raw of matches) {
    const token = raw.replace(/^[.+#/-]+|[.+#/-]+$/g, "");
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    if (!counts.has(token)) order.push(token);
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return order
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, limit);
}
