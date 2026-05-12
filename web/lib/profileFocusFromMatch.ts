/**
 * Deep-link Profile from JD match breakdown cards: map criterion title →
 * profile section id + optional session context for a coach banner.
 */

export type ProfileFocusSection = "contact" | "headline" | "roles" | "education" | "tailoring";

export const PROFILE_FOCUS_CONTEXT_KEY = "rn_profile_focus_context";

export type ProfileFocusContext = {
  criterion: string;
  notes: string;
  section: ProfileFocusSection;
};

/** DOM id on ProfilePage — must match `Card` `domId` props there. */
export function profileSectionDomId(section: ProfileFocusSection): string {
  switch (section) {
    case "contact":
      return "rn-profile-contact";
    case "headline":
      return "rn-profile-headline";
    case "roles":
      return "rn-profile-roles";
    case "education":
      return "rn-profile-education";
    case "tailoring":
      return "rn-profile-tailoring";
    default:
      return "rn-profile-headline";
  }
}

/** Guess which profile block best matches a JD criterion label from the model. */
export function inferProfileSectionFromCriterionName(name: string): ProfileFocusSection {
  const n = name.toLowerCase();
  if (/(education|degree|gpa|school|academic|university|college)/.test(n)) return "education";
  if (/(contact|email|phone|linkedin|portfolio|link)/.test(n)) return "contact";
  if (/(summary|headline|objective|tagline|statement|elevator)/.test(n)) return "headline";
  if (/(section order|tone|tailor default|format)/.test(n)) return "tailoring";
  if (/(role|location|job pref|target|keyword|skill|stack|tech|tool)/.test(n)) return "roles";
  if (/(experience|project|work history|employment|internship|impact|metric|measurable|bullet|achievement)/.test(n))
    return "roles";
  return "headline";
}

export function storeProfileFocusContext(ctx: ProfileFocusContext): void {
  try {
    sessionStorage.setItem(PROFILE_FOCUS_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* quota / private mode */
  }
}

export function readProfileFocusContext(): ProfileFocusContext | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_FOCUS_CONTEXT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ProfileFocusContext>;
    if (typeof o.criterion !== "string" || typeof o.notes !== "string" || typeof o.section !== "string") return null;
    const section = o.section as ProfileFocusSection;
    if (!["contact", "headline", "roles", "education", "tailoring"].includes(section)) return null;
    return { criterion: o.criterion, notes: o.notes, section };
  } catch {
    return null;
  }
}

export function clearProfileFocusContext(): void {
  try {
    sessionStorage.removeItem(PROFILE_FOCUS_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}
