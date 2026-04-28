"use client";

/**
 * AppShell — sidebar + content layout for the signed-in app.
 *
 * Structure:
 *   ┌──────────┬────────────────────────────────────────────┐
 *   │  Logo    │                                            │
 *   ├──────────┤                                            │
 *   │ Resume   │                                            │
 *   │ Builder  │              children                      │
 *   │ Library  │              (the active view)             │
 *   │ Profile  │                                            │
 *   │ Jobs     │                                            │
 *   ├──────────┤                                            │
 *   │ User     │                                            │
 *   └──────────┴────────────────────────────────────────────┘
 *
 * Routing:
 *   - View state is a query param (?view=builder|library|profile|jobs)
 *     because GH Pages serves the static `output: "export"` build, and
 *     dynamic per-view subroutes would require generateStaticParams().
 *   - Defaults to "builder" when absent.
 *   - Selecting a specific resume from the library uses ?view=library&resume=<folder>.
 *
 * The sidebar is sticky, full-height, and 220px wide on desktop. Mobile
 * collapses to icons-only via the `rb-shell-compact` CSS rule (added below).
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export type AppView = "builder" | "library" | "profile" | "jobs";

const VIEW_LABELS: Record<AppView, string> = {
  builder:  "Resume Builder",
  library:  "My Resumes",
  profile:  "Profile",
  jobs:     "Jobs",
};

const VIEW_ICONS: Record<AppView, ReactNode> = {
  builder: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  library: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="3.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="6.5" y="2.5" width="3.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="10.5" y="2.5" width="3" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2.5 13.5c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  jobs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 4.5V3.5a1 1 0 011-1h3a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 8h12" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
};

const BADGES: Partial<Record<AppView, string>> = {
  jobs: "Soon",
};

export function useAppView(): AppView {
  const params = useSearchParams();
  const raw = (params?.get("view") || "builder").toLowerCase();
  return (Object.keys(VIEW_LABELS) as AppView[]).includes(raw as AppView)
    ? (raw as AppView)
    : "builder";
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router  = useRouter();
  const params  = useSearchParams();
  const active  = useAppView();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // Close the user-menu popover on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement;
      if (!tgt.closest("[data-user-menu]")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const switchView = (next: AppView) => {
    // Preserve auth state but drop view-scoped params (like ?resume=) when
    // navigating between top-level views — they won't make sense in the new view.
    const url = next === "builder" ? "/" : `/?view=${next}`;
    router.push(url);
  };

  const onSignOut = async () => {
    await getSupabaseClient().auth.signOut();
    setMenuOpen(false);
  };

  const initial = (user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="rb-app-shell" style={{
      display: "grid",
      gridTemplateColumns: "220px 1fr",
      minHeight: "100vh", background: "var(--bg)",
    }}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
      }}>
        {/* Brand */}
        <div
          onClick={() => switchView("builder")}
          style={{
            padding: "20px 18px 16px",
            display: "flex", alignItems: "center", gap: 9,
            cursor: "pointer", borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, var(--accent), #4ca0ff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: -0.4,
          }}>R</div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: "var(--text)" }}>
            Resunova
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {(Object.keys(VIEW_LABELS) as AppView[]).map(v => {
            const isActive = v === active;
            const badge    = BADGES[v];
            return (
              <button
                key={v}
                onClick={() => switchView(v)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8,
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  fontSize: 13, fontWeight: isActive ? 600 : 500, letterSpacing: -0.2,
                  textAlign: "left", transition: "background 0.12s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  display: "inline-flex", color: isActive ? "var(--accent)" : "var(--dim)", flexShrink: 0,
                }}>
                  {VIEW_ICONS[v]}
                </span>
                <span style={{ flex: 1 }}>{VIEW_LABELS[v]}</span>
                {badge && (
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    background: "var(--surface2)", color: "var(--dim)",
                    letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 700,
                  }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User chip */}
        <div data-user-menu style={{ position: "relative", borderTop: "1px solid var(--border)", padding: 10 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 8, background: menuOpen ? "var(--surface2)" : "transparent",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              color: "var(--text)", textAlign: "left",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--surface3)", color: "var(--text)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 600, fontSize: 12, letterSpacing: -0.2, flexShrink: 0,
            }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11.5, color: "var(--text)", fontWeight: 600, letterSpacing: -0.1,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{user?.email || "Loading…"}</div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>{menuOpen ? "Tap to close" : "Tap for menu"}</div>
            </div>
          </button>

          {menuOpen && (
            <div style={{
              position: "absolute", left: 10, right: 10, bottom: "calc(100% - 4px)",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
              padding: 6, zIndex: 50,
            }}>
              <button
                onClick={() => { switchView("profile"); setMenuOpen(false); }}
                style={{
                  width: "100%", padding: "8px 10px", textAlign: "left",
                  fontSize: 12, color: "var(--text)", letterSpacing: -0.1,
                  background: "transparent", border: "none", borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >Profile settings</button>
              <button
                onClick={onSignOut}
                style={{
                  width: "100%", padding: "8px 10px", textAlign: "left",
                  fontSize: 12, color: "var(--red)", letterSpacing: -0.1,
                  background: "transparent", border: "none", borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >Sign out</button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────── */}
      <main style={{ minWidth: 0, position: "relative" }}>
        {children}
      </main>
    </div>
  );
}
