"use client";

/**
 * AppShell — persistent left sidebar (desktop / tablet) + mobile bottom tab bar.
 * Design reference: docs/PRODUCT_DESIGN.md (Linear × Notion × career coach).
 *
 * Routing (static export):
 *   ?view=builder|library|analyze|profile|jobs|cover-letter  (default: analyze)
 *   ?view=builder&flow=tailor|template
 *   Template customize may keep flow=tailor; session rn_builder_layout_only=1 → highlight Template gallery.
 *   ?view=library&resume=<folder>
 */

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { AppShellSidebarContext } from "@/contexts/AppShellSidebarContext";
import { UmbcProvider } from "@/contexts/UmbcContext";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { CONTACT_EMAIL } from "@/lib/brand";
import { isUmbcUser } from "@/lib/userDomainDetection";
import { LogoFull, LogoMark } from "./BrandLogo";
import { UmbcWelcomeBanner } from "./UmbcWelcomeBanner";
import ResumeSidebar from "./ResumeSidebar";
import { useAppBreakpoints } from "@/hooks/useAppBreakpoints";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";

export type AppView = "builder" | "library" | "analyze" | "profile" | "jobs" | "cover-letter" | "advisor";

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
  library:  "Library",
  analyze:  "Analyze",
  profile:  "Profile",
  jobs:          "Jobs",
  "cover-letter": "Cover letter",
  advisor:  "Advisor",
};

const VIEW_ICONS: Record<AppView, ReactNode> = {
  advisor: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11.5 7.5l1 1 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  builder: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 2h7l3 3v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  library: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="3.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="6.5" y="2.5" width="3.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="10.5" y="2.5" width="3" height="11" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  analyze: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  profile: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2.5 13.5c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  jobs: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 4.5V3.5a1 1 0 011-1h3a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 8h12" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  "cover-letter": (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 2.5h10l2 2v9.5H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10 2.5v2.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
};

const BADGES: Partial<Record<AppView, string>> = {
  jobs: "Soon",
  "cover-letter": "Soon",
};

const SIDEBAR_COLLAPSED_KEY = "rn-app-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function NavMenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      {open ? (
        <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <>
          <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function readBuilderLayoutOnlyFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(RN_BUILDER_LAYOUT_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export function useAppView(): AppView {
  const params = useSearchParams();
  const raw = (params?.get("view") || "analyze").toLowerCase();
  const valid: AppView[] = ["builder", "library", "analyze", "profile", "jobs", "cover-letter", "advisor"];
  return valid.includes(raw as AppView) ? (raw as AppView) : "analyze";
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = useAppView();
  const { isTablet } = useAppBreakpoints();
  const flowRaw = (searchParams?.get("flow") || "tailor").toLowerCase();
  const builderFlow: "tailor" | "template" =
    flowRaw === "template" ? "template" : "tailor";
  const [layoutOnlyForNav, setLayoutOnlyForNav] = useState(readBuilderLayoutOnlyFlag);
  const [user, setUser] = useState<User | null>(null);
  const [isUmbc, setIsUmbc] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(readSidebarCollapsed());
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      if (next) {
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(".app-shell-sidebar-reopen")?.focus();
        });
      }
      return next;
    });
  }, []);

  const collapseSidebar = useCallback(() => {
    setSidebarCollapsed(true);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    } catch { /* ignore */ }
  }, []);

  const sidebarContextValue = useMemo(
    () => ({ collapseSidebar }),
    [collapseSidebar],
  );

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data.user ?? null;
      setUser(currentUser);
      setIsUmbc(isUmbcUser(currentUser?.email));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => {
      const currentUser = s?.user ?? null;
      setUser(currentUser);
      setIsUmbc(isUmbcUser(currentUser?.email));
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-user-menu]")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    setBuilderOpen(active === "builder");
  }, [active]);

  useEffect(() => {
    setLayoutOnlyForNav(readBuilderLayoutOnlyFlag());
  }, [searchParams?.toString(), active]);

  const switchView = (next: AppView) => {
    router.push(`/?view=${next}`);
    setHistoryOpen(false);
    setBuilderOpen(false);
  };

  const goBuilderFlow = (flow: "tailor" | "template") => {
    if (flow === "tailor") {
      try {
        sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
      } catch { /* ignore */ }
    }
    const intent = flow === "tailor" ? "&intent=job" : "";
    router.push(`/?view=builder&flow=${flow}${intent}`);
    setHistoryOpen(false);
    setBuilderOpen(false);
  };

  const onSignOut = async () => {
    await getSupabaseClient().auth.signOut();
    setMenuOpen(false);
  };

  const initial = (user?.email || "?").charAt(0).toUpperCase();
  const builderActive = active === "builder";
  const navBuilderSubflow: "tailor" | "template" =
    builderActive && builderFlow === "tailor" && layoutOnlyForNav
      ? "template"
      : builderFlow;

  const NavRow = ({
    view,
    onClick,
    extraActive,
  }: {
    view: AppView;
    onClick?: () => void;
    extraActive?: boolean;
  }) => {
    const isActive = extraActive ?? (view === active);
    return (
      <button
        type="button"
        className="app-nav-row"
        data-active={isActive}
        onClick={onClick ?? (() => switchView(view))}
      >
        <span className="app-nav-icon" aria-hidden>{VIEW_ICONS[view]}</span>
        <span className="app-sidebar-label" style={{ flex: 1, minWidth: 0 }}>
          {VIEW_LABELS[view]}
          {BADGES[view] && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                background: "var(--surface3)",
                color: "var(--dim)",
                letterSpacing: 0.04,
                textTransform: "uppercase",
                fontWeight: 700,
                verticalAlign: "middle",
              }}
            >
              {BADGES[view]}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <UmbcProvider isUmbc={isUmbc}>
      <AppShellSidebarContext.Provider value={sidebarContextValue}>
      <div
        className="app-shell-root"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      >
      {/* ── Persistent sidebar (tablet + desktop) ───────────────── */}
      <aside
        className="app-shell-sidebar"
        data-compact={isTablet ? "true" : "false"}
        data-collapsed={sidebarCollapsed ? "true" : "false"}
        aria-label="Primary navigation"
      >
        <div style={{ padding: "18px 14px 14px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              flexDirection: isTablet ? "column" : "row",
              alignItems: "center",
              gap: 8,
              justifyContent: isTablet ? "center" : "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => switchView("analyze")}
              aria-label="Resunova — go to Analyze"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                flex: isTablet ? undefined : 1,
                minWidth: 0,
                justifyContent: isTablet ? "center" : "flex-start",
              }}
            >
              {isTablet || sidebarCollapsed ? (
                <LogoMark size={28} variant={isUmbc ? "umbc" : "resunova"} />
              ) : (
                <LogoFull markSize={26} textColor="var(--text)" variant={isUmbc ? "umbc" : "resunova"} />
              )}
            </button>
            <button
              type="button"
              className="app-shell-sidebar-toggle"
              onClick={toggleSidebarCollapsed}
              aria-label="Hide navigation"
              title="Hide navigation"
            >
              <NavMenuIcon open={!sidebarCollapsed} />
            </button>
          </div>
        </div>

        <nav style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <NavRow view="analyze" />

          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              className="app-nav-row"
              data-active={builderActive}
              data-expanded={builderOpen}
              onClick={() => setBuilderOpen(o => !o)}
              aria-expanded={builderOpen}
              style={{ marginBottom: builderOpen ? 4 : 0 }}
            >
              <span className="app-nav-icon" aria-hidden>{VIEW_ICONS.builder}</span>
              <span className="app-sidebar-label" style={{ flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                {VIEW_LABELS.builder}
                <svg className="app-nav-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden style={{ opacity: 0.6, marginLeft: "auto" }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </button>
            <div className="app-nav-builder-drawer" data-open={builderOpen}>
              <div className="app-nav-builder-drawer-inner" inert={builderOpen ? undefined : true}>
                <div className="app-sidebar-sublabel" style={{ paddingLeft: isTablet ? 0 : 4, display: "flex", flexDirection: "column", gap: 3 }}>
                  {[
                    { flow: "tailor" as const, label: "Tailor to a job" },
                  ].map(({ flow, label }) => {
                    const subActive = builderActive && navBuilderSubflow === flow;
                    return (
                      <button
                        key={flow}
                        type="button"
                        className="app-nav-sublink"
                        data-active={subActive}
                        aria-current={subActive ? "page" : undefined}
                        onClick={() => goBuilderFlow(flow)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <NavRow view="library" />
          <NavRow view="cover-letter" />
          <NavRow view="jobs" />
          <NavRow view="profile" />
          <NavRow view="advisor" />
        </nav>

        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 10px 12px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className="app-nav-row"
            data-active={historyOpen}
            onClick={() => setHistoryOpen(o => !o)}
            title="Resume history"
            style={{ marginBottom: 0 }}
          >
            <span className="app-nav-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="app-sidebar-label" style={{ flex: 1 }}>History</span>
          </button>

          <div className="app-sidebar-footer-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 000 11 6 6 0 008-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              )}
            </button>

            <div data-user-menu style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: "var(--radius)",
                  border: `1px solid ${menuOpen ? "var(--accent)" : "var(--border)"}`,
                  background: menuOpen ? "var(--accent-bg)" : "var(--surface2)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "0 8px",
                }}
              >
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                  {initial}
                </span>
                <span className="app-sidebar-label" style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                  {user?.email || "…"}
                </span>
              </button>
              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    minWidth: 160,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-sm)",
                    padding: 6,
                    zIndex: 80,
                  }}
                >
                  <MenuBtn onClick={() => { switchView("profile"); setMenuOpen(false); }}>Profile settings</MenuBtn>
                  <MenuBtn onClick={onSignOut} danger>Sign out</MenuBtn>
                </div>
              )}
            </div>
          </div>

          <nav className="app-sidebar-legal" style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, paddingTop: 4 }}>
            <Link href="/contact" prefetch={false} style={{ color: "var(--dim)", textDecoration: "none" }}>Contact</Link>
            <Link href="/terms" prefetch={false} style={{ color: "var(--dim)", textDecoration: "none" }}>Terms</Link>
            <Link href="/privacy" prefetch={false} style={{ color: "var(--dim)", textDecoration: "none" }}>Privacy</Link>
          </nav>
          <div className="app-sidebar-legal" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 0.02 }}>
            © 2026 Resunova
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────── */}
      <div className="app-shell-main">
        <button
          type="button"
          className="app-shell-sidebar-reopen"
          onClick={toggleSidebarCollapsed}
          aria-label="Show navigation"
          title="Show navigation"
        >
          <NavMenuIcon open={false} />
        </button>
        <UmbcWelcomeBanner />
        <main
          key={active}
          className="app-shell-view-pane"
          style={{ flex: "1 1 0%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation ──────────────────────────── */}
      <nav className="app-bottom-nav" aria-label="Primary">
        {(["analyze", "builder", "library", "jobs", "profile"] as AppView[]).map(v => {
          const isAct = v === "builder" ? builderActive : v === active;
          return (
            <button
              key={v}
              type="button"
              data-active={isAct}
              onClick={() => {
                if (v === "builder") goBuilderFlow("tailor");
                else switchView(v);
              }}
            >
              {VIEW_ICONS[v]}
              <span style={{ maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {VIEW_LABELS[v]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── History drawer (right) ───────────────────────────── */}
      <div
        onClick={() => setHistoryOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 45,
          background: "rgba(15,23,42,0.32)",
          opacity: historyOpen ? 1 : 0,
          pointerEvents: historyOpen ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
        aria-hidden={!historyOpen}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          width: "min(300px, 92vw)",
          transform: historyOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.24s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: historyOpen ? "-8px 0 32px rgba(0,0,0,0.18)" : "none",
          pointerEvents: historyOpen ? "auto" : "none",
        }}
      >
        <ResumeSidebar
          activeFolder={null}
          onSelect={folder => {
            try {
              sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
            } catch { /* ignore */ }
            router.push(`/?view=builder&flow=tailor&base=${encodeURIComponent(folder)}&intent=job`);
            setHistoryOpen(false);
          }}
        />
      </div>
    </div>
      </AppShellSidebarContext.Provider>
    </UmbcProvider>
  );
}

function MenuBtn({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        padding: "8px 10px",
        textAlign: "left",
        fontSize: 12.5,
        color: danger ? "var(--red)" : "var(--text)",
        letterSpacing: -0.1,
        background: hover ? "var(--surface2)" : "transparent",
        border: "none",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.1s",
      }}
    >
      {children}
    </button>
  );
}
