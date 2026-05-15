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

export function isBareLocationLabelLine(raw: string): boolean {
  const s = raw.trim();
  return /^location\s*:\s*$/i.test(s);
}

/** "Jane Doe Location:" with nothing after the colon — strip for display. */
export function stripBareLocationSuffixFromNameLine(raw: string): string {
  return raw.replace(/\s+Location:\s*$/i, "").trim();
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
  let subtitleLineIndex = -1;
  if (posInList >= 0) {
    for (let k = posInList + 1; k < nonEmptyIndices.length; k++) {
      const idx = nonEmptyIndices[k];
      if (isBareLocationLabelLine(lines[idx])) continue;
      subtitleLineIndex = idx;
      break;
    }
  }
  return { nameLineIndex, subtitleLineIndex };
}

function isLikelySectionTitleLine(t: string): boolean {
  const s = t.trim();
  if (s.length < 3 || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return false;
  if (/^[•\-–*\u2022\u00b7]/.test(s)) return false;
  return true;
}

function isBulletLine(t: string): boolean {
  return /^[•\-–*\u2022\u00b7]/.test(t.trim());
}

/**
 * PDF / paste profiles sometimes repeat the full name + contact block twice at the top.
 * Live paper preview should show that cluster only once so the name is not rendered twice.
 */
export function dedupeRepeatedLeadingResumeHeader(lines: string[]): string[] {
  if (lines.length < 2) return lines;
  const { nameLineIndex } = nameAndSubtitleLineIndices(lines);
  const nameNorm = lines[nameLineIndex]?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (!nameNorm) return lines;

  let firstHeaderEnd = nameLineIndex;
  const scanLimit = Math.min(lines.length, nameLineIndex + 28);
  for (let i = nameLineIndex + 1; i < scanLimit; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isBulletLine(t)) break;
    if (isLikelySectionTitleLine(t)) break;
    firstHeaderEnd = i;
  }

  let dupStart = -1;
  const searchHi = Math.min(lines.length, firstHeaderEnd + 14);
  for (let i = firstHeaderEnd + 1; i < searchHi; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (t.replace(/\s+/g, " ").toLowerCase() === nameNorm) {
      dupStart = i;
      break;
    }
  }
  if (dupStart < 0) return lines;

  let dupEnd = dupStart;
  const dupScan = Math.min(lines.length, dupStart + 28);
  for (let i = dupStart + 1; i < dupScan; i++) {
    const t = lines[i].trim();
    if (!t) {
      dupEnd = i;
      continue;
    }
    if (isBulletLine(t)) break;
    if (isLikelySectionTitleLine(t)) break;
    dupEnd = i;
  }

  return [...lines.slice(0, dupStart), ...lines.slice(dupEnd + 1)];
}
