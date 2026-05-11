/**
 * Brand constants — keep backend model ids and vendors out of user-facing copy.
 * Use MODEL_NAME / modelDisplayName wherever the product should say how work is done.
 */

/** Public site + legal pages */
export const SITE_URL       = "https://www.resunova.io";
export const CONTACT_EMAIL  = "hello@resunova.io";
export const PRIVACY_EMAIL  = "privacy@resunova.io";

export const MODEL_NAME    = "AI";
export const MODEL_TAGLINE = "Tailored resume engine";

/** Map a backend model id to the label shown in the UI (always generic). */
export function modelDisplayName(_backendId: string | null | undefined): string {
  return MODEL_NAME;
}
