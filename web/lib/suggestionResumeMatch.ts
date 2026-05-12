/**
 * Fuzzy match between a plain-text résumé line and a suggestion's `original`
 * (AI quotes often differ slightly on bullets / spaces / smart quotes).
 */

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
