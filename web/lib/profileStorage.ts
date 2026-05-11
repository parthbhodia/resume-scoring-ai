/**
 * Saved Profile (structured defaults + EEO) — localStorage plus optional Supabase
 * `user_profiles` when signed in (see `fetchUserProfile` / `upsertUserProfile` in `supabase.ts`).
 */

export type ProfileFormState = {
  displayName: string;
  tagline: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  headline: string;
  roles: string;
  locations: string;
  school: string;
  degree: string;
  graduation: string;
  gpa: string;
  tone: string;
  sectionOrder: string;
  eeoWorkUs: string;
  eeoSponsor: string;
  eeoDisability: string;
  eeoVeteran: string;
  eeoGender: string;
  eeoLgbtq: string;
};

export const PROFILE_STORAGE_KEY = "rn_profile_v1";

export const EMPTY_PROFILE: ProfileFormState = {
  displayName: "",
  tagline: "",
  email: "",
  phone: "",
  linkedin: "",
  portfolio: "",
  headline: "",
  roles: "",
  locations: "",
  school: "",
  degree: "",
  graduation: "",
  gpa: "",
  tone: "confident",
  sectionOrder: "summary-exp-proj-edu",
  eeoWorkUs: "",
  eeoSponsor: "",
  eeoDisability: "",
  eeoVeteran: "",
  eeoGender: "",
  eeoLgbtq: "",
};

export function loadProfile(): ProfileFormState {
  if (typeof window === "undefined") return { ...EMPTY_PROFILE };
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    const p = JSON.parse(raw) as Partial<ProfileFormState>;
    return { ...EMPTY_PROFILE, ...p };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function saveProfile(s: ProfileFormState) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

/** For each key in `hints`, set on `base` only when base value is empty/whitespace. */
export function mergeProfilePreferEmpty(
  base: ProfileFormState,
  hints: Partial<ProfileFormState>,
): { next: ProfileFormState; filled: (keyof ProfileFormState)[] } {
  const next = { ...base };
  const filled: (keyof ProfileFormState)[] = [];
  (Object.keys(hints) as (keyof ProfileFormState)[]).forEach(k => {
    const v = hints[k];
    if (v == null || String(v).trim() === "") return;
    if (String(next[k]).trim() !== "") return;
    (next as Record<string, string>)[k as string] = String(v).trim();
    filled.push(k);
  });
  return { next, filled };
}

/** Merge local with remote: if both have a value for a field, keep `local`. Otherwise use whichever is set. */
export function mergeProfileBidirectional(local: ProfileFormState, remote: ProfileFormState): ProfileFormState {
  const keys = Object.keys(EMPTY_PROFILE) as (keyof ProfileFormState)[];
  const out: ProfileFormState = { ...EMPTY_PROFILE };
  for (const k of keys) {
    const a = String(local[k] ?? "").trim();
    const b = String(remote[k] ?? "").trim();
    if (a && b) out[k] = a;
    else out[k] = a || b;
  }
  return out;
}

export const PROFILE_AUTOFILL_UPLOAD_KEY = "rn_profile_autofill_from_upload";

export function getProfileAutofillFromUpload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PROFILE_AUTOFILL_UPLOAD_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProfileAutofillFromUpload(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(PROFILE_AUTOFILL_UPLOAD_KEY, "1");
    else localStorage.removeItem(PROFILE_AUTOFILL_UPLOAD_KEY);
  } catch {
    /* ignore */
  }
}

/** First-run Profile intro — until user finishes onboarding or skips */
export const PROFILE_ONBOARDING_KEY = "rn_profile_onboarding_v1";

export function isProfileOnboardingComplete(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PROFILE_ONBOARDING_KEY) === "done";
  } catch {
    return false;
  }
}

export function setProfileOnboardingComplete() {
  try {
    localStorage.setItem(PROFILE_ONBOARDING_KEY, "done");
  } catch {
    /* ignore */
  }
}

/** True if user has filled anything beyond sign-in email (used to skip intro for returning users). */
export function profileHasMeaningfulData(s: ProfileFormState): boolean {
  const keys: (keyof ProfileFormState)[] = [
    "displayName", "headline", "phone", "linkedin", "school", "degree", "roles", "locations", "portfolio", "tagline", "graduation", "gpa",
  ];
  return keys.some(k => String(s[k] ?? "").trim().length > 0);
}

/** Few structured fields filled — show “upload résumé” hint on Profile form. */
export function profileLooksSparse(s: ProfileFormState): boolean {
  const important: (keyof ProfileFormState)[] = [
    "displayName", "headline", "phone", "linkedin", "roles", "school", "degree", "locations", "portfolio",
  ];
  const n = important.filter(k => String(s[k] ?? "").trim()).length;
  return n < 2;
}
