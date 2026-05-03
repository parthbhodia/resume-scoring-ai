"use client";

/**
 * AppShell — persistent top navbar + collapsible left drawer for signed-in app.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  [R] Resunova                                  ☀  [◧]  [avatar] │  ← sticky top bar
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                  │
 *   │                        children                                  │
 *   │                        (the active view, full width)             │
 *   │                                                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Navigation drawer (hidden by default, opens on panel-icon click):
 *   Slides in from the left as an overlay, closes on backdrop click.
 *
 * Routing:
 *   ?view=builder|library|analyze|profile|jobs  (defaults: builder)
 *   ?view=library&resume=<folder>               (specific resume)
 */

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import ResumeSidebar from "./ResumeSidebar";

export type AppView = "builder" | "library" | "analyze" | "profile" | "jobs";

type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("rn-theme") as Theme | null) || "light";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("rn-theme", next);
      applyTheme(next);
      return next;
    });
  }, []);

  return [theme, toggle];
}

const VIEW_LABELS: Record<AppView, string> = {
  builder:  "Resume Builder",
  library:  "My Resumes",
  analyze:  "Analyze Resume",
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
  analyze: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
  const valid: AppView[] = ["builder", "library", "analyze", "profile", "jobs"];
  return valid.includes(raw as AppView) ? (raw as AppView) : "builder";
}

const HEADER_H = 56;

export default function AppShell({ children }: { children: ReactNode }) {
  const router  = useRouter();
  const active  = useAppView();
  const [user, setUser]             = useState<User | null>(null);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [theme, toggleTheme]        = useTheme();
  const [navOpen, setNavOpen]       = useState(false);     // left nav drawer
  const [historyOpen, setHistoryOpen] = useState(false);   // right history drawer

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // Close user-menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-user-menu]")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const switchView = (next: AppView) => {
    router.push(`/?view=${next}`);
    setNavOpen(false);
    setHistoryOpen(false);
  };

  const onSignOut = async () => {
    await getSupabaseClient().auth.signOut();
    setMenuOpen(false);
  };

  const initial = (user?.email || "?").charAt(0).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Persistent top navbar ──────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        height: HEADER_H, padding: "0 20px",
        display: "flex", alignItems: "center", gap: 4,
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        borderBottom: "1px solid var(--border)",
      }}>

        {/* Logo — Cormorant Garant wordmark matching landing page */}
        <div
          onClick={() => switchView("builder")}
          style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none", flexShrink: 0 }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: "var(--amber)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 13,
            fontFamily: "'Cormorant Garant', Georgia, serif",
            letterSpacing: 0.2,
            boxShadow: "0 1px 4px rgba(196,121,58,0.35)",
          }}>R</div>
          <span style={{
            fontSize: 18, fontWeight: 600, letterSpacing: -0.3,
            fontFamily: "'Cormorant Garant', Georgia, serif",
            color: "var(--text)",
            lineHeight: 1,
          }}>
            Resunova
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 8px", flexShrink: 0 }} />

        {/* Inline nav links (hidden on mobile via .app-nav-links) */}
        <nav className="app-nav-links" style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {(["builder", "library", "analyze"] as AppView[]).map(v => {
            const isActive = v === active;
            return (
              <button
                key={v}
                onClick={() => switchView(v)}
                style={{
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  padding: "5px 11px", borderRadius: 7,
                  border: "none", fontFamily: "inherit",
                  background: isActive ? "var(--amber-bg)" : "transparent",
                  color: isActive ? "var(--amber)" : "var(--muted)",
                  cursor: "pointer",
                  transition: "background var(--transition), color var(--transition)",
                  letterSpacing: -0.1,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {VIEW_LABELS[v]}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <NavIconBtn
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 000 11 6 6 0 008-3z"
                stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          )}
        </NavIconBtn>

        {/* History drawer toggle */}
        <NavIconBtn
          onClick={() => { setHistoryOpen(o => !o); setNavOpen(false); }}
          title={historyOpen ? "Hide history" : "Resume history"}
          active={historyOpen}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </NavIconBtn>

        {/* Nav drawer toggle (hamburger) */}
        <NavIconBtn
          onClick={() => { setNavOpen(o => !o); setHistoryOpen(false); }}
          title={navOpen ? "Hide menu" : "Menu"}
          active={navOpen}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </NavIconBtn>

        {/* User avatar + dropdown */}
        <div data-user-menu style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: menuOpen ? "var(--accent-bg)" : "var(--surface2)",
              border: `1px solid ${menuOpen ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer", fontFamily: "inherit",
              color: menuOpen ? "var(--accent)" : "var(--text)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 600, fontSize: 12.5, letterSpacing: -0.2,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >{initial}</button>

          {menuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              minWidth: 180, background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
              padding: 6, zIndex: 60,
            }}>
              <div style={{
                padding: "7px 10px 6px", fontSize: 11,
                color: "var(--dim)", letterSpacing: -0.1,
                borderBottom: "1px solid var(--border)", marginBottom: 4,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{user?.email || "…"}</div>
              <MenuBtn onClick={() => { switchView("profile"); setMenuOpen(false); }}>
                Profile settings
              </MenuBtn>
              <MenuBtn onClick={onSignOut} danger>
                Sign out
              </MenuBtn>
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────── */}
      <main style={{ minWidth: 0 }}>
        {children}
      </main>

      {/* ── Backdrop (shared — click to close whichever drawer is open) ── */}
      <div
        onClick={() => { setNavOpen(false); setHistoryOpen(false); }}
        style={{
          position: "fixed", inset: 0, top: HEADER_H, zIndex: 39,
          background: "rgba(0,0,0,0.28)",
          opacity: (navOpen || historyOpen) ? 1 : 0,
          pointerEvents: (navOpen || historyOpen) ? "auto" : "none",
          transition: "opacity 0.22s",
        }}
      />

      {/* ── Navigation drawer (left) ──────────────────────── */}
      <aside style={{
        position: "fixed", top: HEADER_H, left: 0, bottom: 0, zIndex: 40,
        width: 220,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        transform: navOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: navOpen ? "4px 0 24px rgba(0,0,0,0.18)" : "none",
      }}>
        {/* Nav items */}
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          {(Object.keys(VIEW_LABELS) as AppView[]).map(v => {
            const isActive = v === active;
            const badge    = BADGES[v];
            return (
              <button
                key={v}
                onClick={() => switchView(v)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 11px", borderRadius: 8,
                  background: isActive ? "var(--amber-bg)" : "transparent",
                  border: isActive ? "1px solid rgba(196,121,58,0.2)" : "1px solid transparent",
                  cursor: "pointer", fontFamily: "inherit",
                  color: isActive ? "var(--amber)" : "var(--muted)",
                  fontSize: 13, fontWeight: isActive ? 600 : 500, letterSpacing: -0.15,
                  textAlign: "left", transition: "background var(--transition), color var(--transition), border-color var(--transition)",
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.color = "var(--text)"; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; } }}
              >
                <span style={{ display: "inline-flex", color: isActive ? "var(--amber)" : "var(--dim)", flexShrink: 0, transition: "color var(--transition)" }}>
                  {VIEW_ICONS[v]}
                </span>
                <span style={{ flex: 1 }}>{VIEW_LABELS[v]}</span>
                {badge && (
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    background: "var(--surface3)", color: "var(--dim)",
                    letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
                  }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User section at bottom */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 10px" }}>
          <div style={{
            fontSize: 11.5, color: "var(--muted)", fontWeight: 500,
            letterSpacing: -0.1, padding: "4px 6px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{user?.email || "Loading…"}</div>
        </div>
      </aside>

      {/* ── History drawer (right) ───────────────────────── */}
      <div style={{
        position: "fixed", top: HEADER_H, right: 0, bottom: 0, zIndex: 40,
        width: 260,
        transform: historyOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: historyOpen ? "-4px 0 24px rgba(0,0,0,0.18)" : "none",
      }}>
        <ResumeSidebar
          activeFolder={null}
          onSelect={folder => {
            router.push(`/?base=${encodeURIComponent(folder)}`);
            setHistoryOpen(false);
          }}
        />
      </div>
    </div>
  );
}

/* ── Small icon button for the top nav ────────────────── */
function NavIconBtn({
  children, onClick, title, active = false,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: active
          ? "var(--amber-bg)"
          : hover ? "var(--surface2)" : "transparent",
        border: active ? "1px solid rgba(196,121,58,0.25)" : "1px solid transparent",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: active ? "var(--amber)" : hover ? "var(--text)" : "var(--dim)",
        transition: "background var(--transition), color var(--transition), border-color var(--transition)",
      }}
    >
      {children}
    </button>
  );
}

/* ── Dropdown menu item ────────────────────────────────── */
function MenuBtn({
  children, onClick, danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", padding: "8px 10px", textAlign: "left",
        fontSize: 12.5, color: danger ? "var(--red)" : "var(--text)",
        letterSpacing: -0.1,
        background: hover ? "var(--surface2)" : "transparent",
        border: "none", borderRadius: 6,
        cursor: "pointer", fontFamily: "inherit",
        transition: "background 0.1s",
      }}
    >
      {children}
    </button>
  );
}
