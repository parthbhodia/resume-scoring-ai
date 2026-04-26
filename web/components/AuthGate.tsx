"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import LandingPage from "./LandingPage";

// Routes that intentionally bypass auth — design-system / preview pages.
const PUBLIC_ROUTES = new Set<string>(["/editor-preview"]);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && PUBLIC_ROUTES.has(pathname.replace(/\/$/, ""))) {
    return <>{children}</>;
  }
  // IMPORTANT: initial state is `null` (signed-out) so the static HTML contains
  // the full landing page — crawlable by Google. The effect below swaps in the
  // dashboard once we confirm the user is signed in on the client.
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // While we haven't yet confirmed session status AND there's no session,
  // show the landing page — which is also what SSG renders for crawlers.
  if (!session) return <LandingPage />;

  // Brief loading state only for returning authenticated users
  if (!checked) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
        <div style={{ width: 20, height: 20, border: "2px solid var(--surface2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return <>{children}</>;
}
