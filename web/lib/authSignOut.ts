import { getSupabaseClient } from "@/lib/supabase";

const FORCE_LANDING_KEY = "rn-force-landing";

/** Dev bypass keeps the app open with no session — set when user explicitly signs out. */
export function readForceLandingAfterSignOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FORCE_LANDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearForceLandingAfterSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(FORCE_LANDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Sign out of Supabase and hard-navigate home so AuthGate re-evaluates. */
export async function signOutAndReturnHome(): Promise<void> {
  const devBypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
  try {
    await getSupabaseClient().auth.signOut({ scope: "global" });
  } catch {
    /* still leave the app */
  }
  if (devBypass) {
    try {
      sessionStorage.setItem(FORCE_LANDING_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  window.location.assign("/");
}
