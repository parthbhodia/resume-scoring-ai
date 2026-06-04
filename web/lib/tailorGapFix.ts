/**
 * Tailor gap-fix helpers: client-side "resolved by user" overlay + override remapping.
 *
 * Not the ATS truth layer — keeps UX stable when /api/analyze re-labels or re-lists gaps
 * after Apply. Backend gap IDs + resolved_by_user status are the long-term contract.
 */

import type { AddressedGapAction, DetailedRatingItem, RatingsData } from "@/lib/types";
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

/** Normalize qualification/keyword labels for token comparison (rescore may rephrase). */
/** Must match resume_gui/tailor/gap_workflow.stable_gap_id */
export function makeStableGapId(label: string, gapType: AddressedGapAction["type"]): string {
  const slug = normalizeGapKey(label).replace(/\s+/g, "-").slice(0, 80) || "unknown";
  return `${gapType}:${slug}`;
}

export function normalizeGapKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\.js\b/g, " js")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GAP_STOP_WORDS = new Set([
  "framework",
  "platform",
  "tool",
  "tools",
  "system",
  "systems",
  "experience",
  "knowledge",
  "skill",
  "skills",
  "library",
  "libraries",
]);

/** Meaningful tokens for gap identity — avoids java⊂javascript and generic "framework" matches. */
export function tokenizeGap(text: string): string[] {
  return normalizeGapKey(text)
    .split(" ")
    .filter((word) => word.length > 2)
    .filter((word) => !GAP_STOP_WORDS.has(word));
}

/**
 * True when two gap labels refer to the same requirement (label drift only).
 * Intentionally strict: session overlay must not clear unrelated missing items.
 */
export function gapKeysMatch(a: string, b: string): boolean {
  const aTokens = tokenizeGap(a);
  const bTokens = tokenizeGap(b);
  if (!aTokens.length || !bTokens.length) return false;

  const aKey = aTokens.join(" ");
  const bKey = bTokens.join(" ");
  if (aKey === bKey) return true;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const overlap = aTokens.filter((token) => bSet.has(token)).length;
  const smallerSize = Math.min(aSet.size, bSet.size);
  const largerSize = Math.max(aSet.size, bSet.size);
  const overlapRatio = overlap / smallerSize;

  // Single-token labels (e.g. "nuxt" vs "nuxt js") — allow only close pairs.
  if (smallerSize === 1) {
    return overlap === 1 && largerSize <= 2;
  }

  return overlapRatio >= 0.75;
}

export function isGapAddressed(
  gapName: string,
  addressedLabels: ReadonlySet<string>,
  actions?: readonly AddressedGapAction[],
): boolean {
  for (const g of addressedLabels) {
    if (gapKeysMatch(g, gapName)) return true;
  }
  for (const a of actions ?? []) {
    if (gapKeysMatch(a.label, gapName)) return true;
  }
  return false;
}

function dedupeDetailedItems(items: DetailedRatingItem[]): DetailedRatingItem[] {
  const seen = new Set<string>();
  const out: DetailedRatingItem[] = [];
  for (const item of items) {
    const k = normalizeGapKey(item.text);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function filterKeywordsMissing(
  kw: NonNullable<RatingsData["keywords"]>,
  gapName: string,
): RatingsData["keywords"] {
  const directMissing = (kw.direct_skills?.missing ?? []).filter((k) => !gapKeysMatch(k, gapName));
  const contextualMissing = (kw.contextual?.missing ?? []).filter((k) => !gapKeysMatch(k, gapName));
  const legacyMissing = (kw.missing ?? []).filter((k) => !gapKeysMatch(k, gapName));
  const hadMissing =
    (kw.direct_skills?.missing ?? []).some((k) => gapKeysMatch(k, gapName))
    || (kw.contextual?.missing ?? []).some((k) => gapKeysMatch(k, gapName))
    || (kw.missing ?? []).some((k) => gapKeysMatch(k, gapName));

  let found_count = kw.found_count;
  if (hadMissing) found_count = Math.min(kw.total_count, found_count + 1);

  const directHad = (kw.direct_skills?.missing ?? []).some((k) => gapKeysMatch(k, gapName));
  const contextualHad = (kw.contextual?.missing ?? []).some((k) => gapKeysMatch(k, gapName));
  const legacyHad = (kw.missing ?? []).some((k) => gapKeysMatch(k, gapName));

  let next: RatingsData["keywords"] = { ...kw, found_count };

  if (directHad && kw.direct_skills) {
    const found = [...(kw.direct_skills.found ?? [])];
    const label = (kw.direct_skills.missing ?? []).find((k) => gapKeysMatch(k, gapName)) ?? gapName;
    if (!found.some((k) => gapKeysMatch(k, label))) found.push(label);
    next = {
      ...next,
      direct_skills: { found, missing: directMissing },
    };
  } else if (kw.direct_skills) {
    next = { ...next, direct_skills: { ...kw.direct_skills, missing: directMissing } };
  }

  if (contextualHad && kw.contextual) {
    const found = [...(kw.contextual.found ?? [])];
    const label = (kw.contextual.missing ?? []).find((k) => gapKeysMatch(k, gapName)) ?? gapName;
    if (!found.some((f) => gapKeysMatch(f.keyword, label))) {
      found.push({ keyword: label, count: 1 });
    }
    next = {
      ...next,
      contextual: { found, missing: contextualMissing },
    };
  } else if (kw.contextual) {
    next = { ...next, contextual: { ...kw.contextual, missing: contextualMissing } };
  }

  if (legacyHad && kw.missing) {
    const found = [...(kw.found ?? [])];
    const label = kw.missing.find((k) => gapKeysMatch(k, gapName)) ?? gapName;
    if (!found.some((k) => gapKeysMatch(k, label))) found.push(label);
    next = { ...next, found, missing: legacyMissing };
  } else if (kw.missing) {
    next = { ...next, missing: legacyMissing };
  }

  return next;
}

/** Optimistic UI: missing → resolved_by_user (not verified covered). */
export function applyOptimisticGapAddressed(
  ratings: RatingsData,
  gapName: string,
  gapType: AddressedGapAction["type"] = "qualification",
): RatingsData {
  if (!gapName || !isDetailedRatings(ratings)) return ratings;
  const r = ratings;

  const patchCategory = (
    category: {
      score: number;
      covered: DetailedRatingItem[];
      missing: DetailedRatingItem[];
      resolved_by_user?: DetailedRatingItem[];
    },
  ) => {
    const missingItem = category.missing.find((i) => gapKeysMatch(i.text, gapName));
    const newMissing = category.missing.filter((i) => !gapKeysMatch(i.text, gapName));
    const covered = dedupeDetailedItems(category.covered);
    let resolved = dedupeDetailedItems(category.resolved_by_user ?? []);
    const alreadyCovered = covered.some((i) => gapKeysMatch(i.text, gapName));
    const alreadyResolved = resolved.some((i) => gapKeysMatch(i.text, gapName));
    if (!alreadyCovered && !alreadyResolved) {
      const text = missingItem?.text ?? gapName;
      resolved = dedupeDetailedItems([
        ...resolved,
        {
          id: missingItem?.id ?? makeStableGapId(text, gapType),
          text,
          context: "Fix applied — re-check to confirm",
          status: "resolved_by_user",
          verification: "user_applied",
        },
      ]);
    }
    return {
      ...category,
      missing: newMissing,
      covered,
      resolved_by_user: resolved,
    };
  };

  let next: RatingsData = {
    ...r,
    qualifications: patchCategory(r.qualifications),
    responsibilities: patchCategory(r.responsibilities),
  };

  if (r.keywords) {
    next = { ...next, keywords: filterKeywordsMissing(r.keywords, gapName) };
  }

  return next;
}

/** Client safety net: re-apply gaps still listed as missing after server merge. */
export function applyAddressedGapsToRatings(
  ratings: RatingsData,
  addressedLabels: ReadonlySet<string>,
  actions?: readonly AddressedGapAction[],
): RatingsData {
  const entries: Array<{ label: string; type: AddressedGapAction["type"] }> = [
    ...[...addressedLabels].map((label) => ({ label, type: "qualification" as const })),
  ];
  for (const a of actions ?? []) {
    if (!entries.some((e) => gapKeysMatch(e.label, a.label))) {
      entries.push({ label: a.label, type: a.type });
    }
  }
  if (!entries.length) return ratings;

  let merged = ratings;
  for (const { label, type } of entries) {
    if (!isDetailedRatings(merged)) break;
    const qualMiss = merged.qualifications.missing.some((i) => gapKeysMatch(i.text, label));
    const respMiss = merged.responsibilities.missing.some((i) => gapKeysMatch(i.text, label));
    const kwMiss =
      (merged.keywords?.direct_skills?.missing ?? []).some((k) => gapKeysMatch(k, label))
      || (merged.keywords?.contextual?.missing ?? []).some((k) => gapKeysMatch(k, label));
    if (qualMiss || (type === "qualification" && !respMiss && !kwMiss)) {
      merged = applyOptimisticGapAddressed(merged, label, type === "keyword" ? "qualification" : type);
    } else if (respMiss) {
      merged = applyOptimisticGapAddressed(merged, label, "responsibility");
    } else if (kwMiss || type === "keyword") {
      merged = applyOptimisticGapAddressed(merged, label, "qualification");
      if (merged.keywords) merged = { ...merged, keywords: filterKeywordsMissing(merged.keywords, label) };
    }
  }
  return merged;
}

/** After rescore — server should own state; client only patches stragglers. */
export function mergeRescorePreservingAddressedGaps(
  fresh: RatingsData,
  addressedLabels: ReadonlySet<string>,
  actions?: readonly AddressedGapAction[],
): RatingsData {
  return applyAddressedGapsToRatings(fresh, addressedLabels, actions);
}

/** Merge editable drafts into suggestions before apply. */
export function suggestionsWithDrafts<T extends { id: string; suggested: string }>(
  suggestions: T[],
  drafts: Record<string, string>,
): T[] {
  return suggestions.map((s) => {
    const draft = drafts[s.id]?.trim();
    return draft ? { ...s, suggested: draft } : s;
  });
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
