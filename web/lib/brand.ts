/**
 * Brand constants — keep backend model ids and vendors out of user-facing copy.
 * Use MODEL_NAME / modelDisplayName wherever the product should say how work is done.
 */

export type BrandVariant = "resunova" | "umbc";

/** UMBC institutional colors — https://styleguide.umbc.edu/umbc-colors/ */
export const UMBC_BRAND = {
  gold: "#fdb515",
  black: "#000000",
  white: "#ffffff",
  /** Slightly deeper gold for gradients only (still on-brand family). */
  goldDeep: "#e5a000",
} as const;

/** Public site + legal pages */
export const SITE_URL       = "https://www.resunova.io";
export const CONTACT_EMAIL  = "contact@resunova.io";
export const PRIVACY_EMAIL  = "contact@resunova.io";

export const MODEL_NAME    = "AI";
export const MODEL_TAGLINE = "Tailored resume engine";

export const BRAND_DISPLAY_NAME: Record<BrandVariant, string> = {
  resunova: "Resunova",
  umbc: "UMBC Resume Scorer",
};

export function getBrandVariant(userEmail: string | null | undefined): BrandVariant {
  return userEmail?.toLowerCase().endsWith("@umbc.edu") ? "umbc" : "resunova";
}

/** Map a backend model id to the label shown in the UI (always generic). */
export function modelDisplayName(_backendId: string | null | undefined): string {
  return MODEL_NAME;
}
