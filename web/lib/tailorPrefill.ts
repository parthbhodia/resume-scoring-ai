/**
 * When opening Résumé Builder → Tailor from Library, we stash company / role /
 * JD in sessionStorage so the builder can prefill fields (same pattern as
 * Analyze → Builder for JD).
 */
export const TAILOR_PREFILL_JD = "rn_builder_jd_prefill";
export const TAILOR_PREFILL_COMPANY = "rn_builder_company_prefill";
export const TAILOR_PREFILL_ROLE = "rn_builder_role_prefill";

export function stashTailorPrefillFromLibrary(meta: {
  company?: string | null;
  role?: string | null;
  job_description?: string | null;
}): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const jd = meta.job_description?.trim();
    if (jd) sessionStorage.setItem(TAILOR_PREFILL_JD, jd);
    const c = meta.company?.trim();
    if (c) sessionStorage.setItem(TAILOR_PREFILL_COMPANY, c);
    const r = meta.role?.trim();
    if (r) sessionStorage.setItem(TAILOR_PREFILL_ROLE, r);
  } catch {
    /* quota / private mode */
  }
}
