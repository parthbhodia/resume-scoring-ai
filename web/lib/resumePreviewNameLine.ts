/**
 * Live HTML résumé previews treat the first non-empty line as the name row.
 * Structured extracts sometimes prefix placeholders (N/A, —) before the real name.
 */

export function isPlaceholderResumeHeaderLine(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  const compact = s
    .replace(/\s+/g, "")
    .replace(/\u2044/g, "/")
    .replace(/\u2215/g, "/");
  if (/^n\/?a\.?$/i.test(compact)) return true;
  if (/^(tbd|none|null|unknown|n\/a)$/i.test(s)) return true;
  if (/^[-–—…\.]+$/.test(s)) return true;
  return false;
}

/** First meaningful name line + following line for subtitle/contact styling (original line indices). */
export function nameAndSubtitleLineIndices(lines: string[]): { nameLineIndex: number; subtitleLineIndex: number } {
  const nonEmptyIndices = lines.reduce<number[]>((acc, line, i) => {
    if (line.trim()) acc.push(i);
    return acc;
  }, []);
  if (nonEmptyIndices.length === 0) return { nameLineIndex: 0, subtitleLineIndex: -1 };
  const namePos = nonEmptyIndices.findIndex(i => !isPlaceholderResumeHeaderLine(lines[i]));
  const nameLineIndex = namePos >= 0 ? nonEmptyIndices[namePos] : nonEmptyIndices[0];
  const posInList = nonEmptyIndices.indexOf(nameLineIndex);
  const subtitleLineIndex =
    posInList >= 0 && posInList + 1 < nonEmptyIndices.length ? nonEmptyIndices[posInList + 1] : -1;
  return { nameLineIndex, subtitleLineIndex };
}
