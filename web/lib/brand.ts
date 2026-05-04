/**
 * Brand constants — keep model / provider names hidden behind a single
 * proprietary identity surfaced to users.
 *
 * Backend providers (Gemini, Grok, etc.) are an implementation detail and
 * shouldn't leak into UI copy. Anywhere we need to refer to "the model"
 * or "the engine doing the work", use these constants instead.
 */

/** Public site + legal pages */
export const SITE_URL       = "https://www.resunova.io";
export const CONTACT_EMAIL  = "hello@resunova.io";
export const PRIVACY_EMAIL  = "privacy@resunova.io";

export const MODEL_NAME    = "Resunova Atlas";
export const MODEL_TAGLINE = "Tailored resume engine";

/** Map a backend model id (e.g. `gemini-2.5-flash`) to what the user sees.
 *  Today everything maps to MODEL_NAME — gives us a single hook to flip
 *  later if we ever want tier-aware display ("Atlas Pro" etc.). */
export function modelDisplayName(_backendId: string | null | undefined): string {
  return MODEL_NAME;
}
