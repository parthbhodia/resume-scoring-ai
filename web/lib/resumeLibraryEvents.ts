/** Fired after a résumé row is written to Supabase so Library / sidebar can refetch. */
export const RESUME_LIBRARY_CHANGED_EVENT = "rn-resume-library-changed";

export function dispatchResumeLibraryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RESUME_LIBRARY_CHANGED_EVENT));
}
