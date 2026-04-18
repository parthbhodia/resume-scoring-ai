"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Still loading
  if (session === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
        <div style={{ color: "var(--dim)", fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  // Not signed in → show login
  if (!session) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const redirectTo =
      typeof window !== "undefined"
        ? window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
        : undefined;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (err) { setError(err.message); setLoading(false); }
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "var(--bg)",
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "40px 48px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        minWidth: 320,
      }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4 }}>
          <span style={{ color: "var(--accent)" }}>R</span>esume Builder
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          Sign in to generate and save tailored resumes.
        </p>

        {error && (
          <div style={{ color: "var(--red)", fontSize: 12, background: "var(--red-bg)", padding: "8px 12px", borderRadius: "var(--radius)", width: "100%", textAlign: "center" }}>
            {error}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 20px", width: "100%", justifyContent: "center",
            background: loading ? "var(--surface2)" : "#fff",
            color: "#1a1a1a", border: "none", borderRadius: "var(--radius)",
            fontSize: 14, fontWeight: 500, fontFamily: "inherit",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          <GoogleIcon />
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
