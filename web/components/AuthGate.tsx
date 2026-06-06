"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import {
  clearForceLandingAfterSignOut,
  readForceLandingAfterSignOut,
} from "@/lib/authSignOut";
import LandingPage from "./LandingPage";

// Routes that intentionally bypass auth — design-system / preview pages.
const PUBLIC_ROUTES = new Set<string>([
  "/editor-preview",
  "/profile-mockup",
  "/landing-preview",
  "/terms",
  "/privacy",
  "/contact",
  "/blog",
  "/template-builder",
]);
// Path prefixes that bypass auth — recipient share pages live at /r/<shortid>.
const PUBLIC_PREFIXES = ["/r/", "/blog/"];

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const trimmed = pathname.replace(/\/$/, "");
  if (PUBLIC_ROUTES.has(trimmed)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** App shell lives at `/` (query params only). Marketing must render without waiting on auth. */
function isHomePath(pathname: string | null): boolean {
  if (!pathname) return true;
  const trimmed = pathname.replace(/\/$/, "");
  return trimmed === "" || trimmed === "/";
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublicPath(pathname);

  // IMPORTANT: initial state is `null` (signed-out) so the static HTML contains
  // the full landing page — crawlable by Google. The effect below swaps in the
  // dashboard once we confirm the user is signed in on the client.
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [forceLanding, setForceLanding] = useState(false);

  useEffect(() => {
    setForceLanding(readForceLandingAfterSignOut());
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        clearForceLandingAfterSignOut();
        setForceLanding(false);
      }
      setChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s);
      if (s) {
        clearForceLandingAfterSignOut();
        setForceLanding(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (publicRoute) return <>{children}</>;

  const isHome = isHomePath(pathname);

  // Local dev: allow the app without login, unless the user explicitly signed out.
  if (DEV_BYPASS && !forceLanding) {
    if (!isHome || checked) {
      if (!session) return <>{children}</>;
    }
  }

  // Homepage: always ship marketing HTML first (Google OAuth reviewers, bots, signed-out users).
  // Do not show an auth spinner on `/` — static export would contain only the spinner otherwise.
  if (isHome) {
    if (forceLanding || !session) return <LandingPage />;
    return <>{children}</>;
  }

  if (!checked) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
        <div style={{ width: 20, height: 20, border: "2px solid var(--surface2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!session) return <LandingPage />;

  return <>{children}</>;
}
