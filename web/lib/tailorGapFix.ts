/**
 * Tailor gap-fix helpers: optimistic ratings merge after rescore, override remapping.
 */

import type { RatingsData } from "@/lib/types";
import { isDetailedRatings } from "@/lib/types";
import {
  type LiveBulletItem,
  matchOriginalToBulletIndex,
} from "@/lib/resumeBulletMatch";

function formatBulletLine(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^[•\-–*]/.test(t) || /^\u2022/.test(t) ? t : `• ${t.replace(/^•\s*/, "")}`;
}

/** Move one addressed gap from missing → covered in detailed ratings (optimistic UI). */
export function applyOptimisticGapAddressed(
  ratings: RatingsData,
  gapName: string,
): RatingsData {
  if (!gapName || !isDetailedRatings(ratings)) return ratings;
  const r = ratings;

  if (r.qualifications.missing.some((i) => i.text === gapName)) {
    const item = r.qualifications.missing.find((i) => i.text === gapName)!;
    return {
      ...r,
      qualifications: {
        ...r.qualifications,
        missing: r.qualifications.missing.filter((i) => i.text !== gapName),
        covered: [...r.qualifications.covered, { text: item.text, context: "Applied via AI fix" }],
      },
    };
  }
  if (r.responsibilities.missing.some((i) => i.text === gapName)) {
    const item = r.responsibilities.missing.find((i) => i.text === gapName)!;
    return {
      ...r,
      responsibilities: {
        ...r.responsibilities,
        missing: r.responsibilities.missing.filter((i) => i.text !== gapName),
        covered: [...r.responsibilities.covered, { text: item.text, context: "Applied via AI fix" }],
      },
    };
  }
  const kw = r.keywords;
  if (kw.direct_skills?.missing?.includes(gapName)) {
    return {
      ...r,
      keywords: {
        ...kw,
        direct_skills: {
          found: [...(kw.direct_skills?.found ?? []), gapName],
          missing: (kw.direct_skills?.missing ?? []).filter((k) => k !== gapName),
        },
        found_count: kw.found_count + 1,
      },
    };
  }
  if (kw.contextual?.missing?.includes(gapName)) {
    return {
      ...r,
      keywords: {
        ...kw,
        contextual: {
          found: [...(kw.contextual?.found ?? []), { keyword: gapName, count: 1 }],
          missing: (kw.contextual?.missing ?? []).filter((k) => k !== gapName),
        },
        found_count: kw.found_count + 1,
      },
    };
  }
  return r;
}

/** After rescore, keep user-addressed gaps from reappearing as missing. */
export function mergeRescorePreservingAddressedGaps(
  fresh: RatingsData,
  addressedGaps: ReadonlySet<string>,
): RatingsData {
  if (!addressedGaps.size) return fresh;
  let merged = fresh;
  for (const gapName of addressedGaps) {
    merged = applyOptimisticGapAddressed(merged, gapName);
  }
  return merged;
}

/** Remap index overrides when bulletAnalysis indices shift after rescore. */
export function remapLineOverrides(
  overrides: Record<number, string>,
  oldBullets: LiveBulletItem[],
  newBullets: LiveBulletItem[],
): Record<number, string> {
  const next: Record<number, string> = {};
  for (const [k, overrideText] of Object.entries(overrides)) {
    const oldIdx = Number(k);
    const oldOrig = oldBullets[oldIdx]?.originalBullet ?? "";
    let newIdx = oldOrig
      ? matchOriginalToBulletIndex(oldOrig, newBullets, "")
      : -1;
    if (newIdx < 0 && overrideText.trim()) {
      newIdx = matchOriginalToBulletIndex(overrideText, newBullets, "");
    }
    if (newIdx >= 0) next[newIdx] = overrideText;
  }
  return next;
}

export { formatBulletLine };
