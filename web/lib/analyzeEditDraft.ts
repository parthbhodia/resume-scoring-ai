/**
 * Browser-local draft of Analyze preview edits (line overrides + rewrite drafts).
 * For testing “persisted text” UX before Supabase/schema changes.
 */

const PREFIX = "rn_az_edit_v1_";

export interface AnalyzeEditDraftV1 {
  version: 1;
  lineOverrides: Record<string, string>;
  rewriteEdits: Record<string, string>;
  savedAt: string;
}

function key(id: string): string {
  return `${PREFIX}${id}`;
}

export function loadAnalyzeEditDraft(analysisId: string): AnalyzeEditDraftV1 | null {
  if (typeof window === "undefined" || !analysisId) return null;
  try {
    const raw = localStorage.getItem(key(analysisId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnalyzeEditDraftV1;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAnalyzeEditDraft(
  analysisId: string,
  lineOverrides: Record<number, string>,
  rewriteEdits: Record<number, string>,
): void {
  if (typeof window === "undefined" || !analysisId) return;
  const lo: Record<string, string> = {};
  for (const [k, v] of Object.entries(lineOverrides)) {
    if (typeof v === "string" && v.trim()) lo[k] = v;
  }
  const rw: Record<string, string> = {};
  for (const [k, v] of Object.entries(rewriteEdits)) {
    if (typeof v === "string" && v.trim()) rw[k] = v;
  }
  const payload: AnalyzeEditDraftV1 = {
    version: 1,
    lineOverrides: lo,
    rewriteEdits: rw,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(key(analysisId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearAnalyzeEditDraft(analysisId: string): void {
  if (typeof window === "undefined" || !analysisId) return;
  try {
    localStorage.removeItem(key(analysisId));
  } catch {
    /* ignore */
  }
}

/** After Supabase replaces `local_*` id, move draft blob to the new key. */
export function migrateAnalyzeEditDraft(oldId: string, newId: string): void {
  if (typeof window === "undefined" || !oldId || !newId || oldId === newId) return;
  try {
    const raw = localStorage.getItem(key(oldId));
    if (!raw) return;
    localStorage.setItem(key(newId), raw);
    localStorage.removeItem(key(oldId));
  } catch {
    /* ignore */
  }
}
