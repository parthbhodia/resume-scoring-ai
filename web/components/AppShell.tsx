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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { apiUrl, cn } from "@/lib/utils";
import { isUmbcUser } from "@/lib/userDomainDetection";
import { LogoFull, LogoMark } from "./BrandLogo";
import { UmbcWelcomeBanner } from "./UmbcWelcomeBanner";
import ResumeSidebar from "./ResumeSidebar";
import { useAppBreakpoints } from "@/hooks/useAppBreakpoints";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

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

const BUILDER_SUBFLOW_ICONS: Record<"tailor" | "template", ReactNode> = {
  tailor: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="5" width="11" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.35"/>
      <path d="M5.5 5V4a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0110.5 4v1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
      <path d="M8 7.4l.45.95.95.45-.95.45L8 10.2l-.45-.95-.95-.45.95-.45L8 7.4z" fill="currentColor"/>
    </svg>
  ),
  template: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.35"/>
      <path d="M2.5 6h11M6.5 6v7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
      <path d="M8.7 8.6h2.4M8.7 10.8h2.4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round"/>
    </svg>
  ),
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = useAppView();
  const onTemplateBuilderPage = (pathname ?? "").replace(/\/$/, "") === "/template-builder";
  const { isTablet } = useAppBreakpoints();
  const flowRaw = (searchParams?.get("flow") || "tailor").toLowerCase();
  const builderFlow: "tailor" | "template" =
    flowRaw === "template" ? "template" : "tailor";
  const [layoutOnlyForNav, setLayoutOnlyForNav] = useState(readBuilderLayoutOnlyFlag);
  const [user, setUser] = useState<User | null>(null);
  const [isUmbc, setIsUmbc] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [advisorAllowed, setAdvisorAllowed] = useState(false);

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

  const expandSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "0");
    } catch { /* ignore */ }
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

    const syncAdvisorAccess = async (accessToken?: string | null) => {
      if (!accessToken) {
        setAdvisorAllowed(false);
        return;
      }
      try {
        const resp = await fetch(apiUrl("/api/advisor-access"), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
          setAdvisorAllowed(false);
          return;
        }
        const json = await resp.json() as { allowed?: boolean };
        setAdvisorAllowed(json.allowed === true);
      } catch {
        setAdvisorAllowed(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);
      setIsUmbc(isUmbcUser(currentUser?.email));
      void syncAdvisorAccess(data.session?.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => {
      const currentUser = s?.user ?? null;
      setUser(currentUser);
      setIsUmbc(isUmbcUser(currentUser?.email));
      void syncAdvisorAccess(s?.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setBuilderOpen(active === "builder" || onTemplateBuilderPage);
  }, [active, onTemplateBuilderPage]);

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
  };

  const initial = (user?.email || "?").charAt(0).toUpperCase();
  const builderActive = active === "builder" || onTemplateBuilderPage;
  const navBuilderSubflow: "tailor" | "template" =
    onTemplateBuilderPage
      ? "template"
      : builderActive && builderFlow === "tailor" && layoutOnlyForNav
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
    const isActive = extraActive ?? (!onTemplateBuilderPage && view === active);
    return (
      <button
        type="button"
        className="app-nav-row"
        data-active={isActive}
        onClick={onClick ?? (() => switchView(view))}
      >
        <span className="app-nav-icon" aria-hidden>{VIEW_ICONS[view]}</span>
        <span className="app-sidebar-label min-w-0 flex-1">
          {VIEW_LABELS[view]}
          {BADGES[view] && (
            <Badge
              variant="secondary"
              className="ml-2 align-middle px-1.5 py-0 text-[9px] font-bold tracking-wide uppercase"
            >
              {BADGES[view]}
            </Badge>
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
        <div className="shrink-0 px-3.5 pb-3.5 pt-[18px]">
          <div
            className={cn(
              "flex items-center gap-2",
              isTablet || sidebarCollapsed ? "flex-col justify-center" : "flex-row justify-between",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => switchView("analyze")}
              aria-label="Resunova — go to Analyze"
              className={cn(
                "h-auto px-0 font-inherit hover:bg-transparent",
                isTablet || sidebarCollapsed ? "justify-center" : "min-w-0 flex-1 justify-start",
              )}
            >
              {isTablet || sidebarCollapsed ? (
                <LogoMark size={28} variant={isUmbc ? "umbc" : "resunova"} />
              ) : (
                <LogoFull markSize={26} textColor="var(--text)" variant={isUmbc ? "umbc" : "resunova"} />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="app-shell-sidebar-toggle size-9 shrink-0"
              onClick={toggleSidebarCollapsed}
              aria-label="Hide navigation"
              title="Hide navigation"
            >
              <NavMenuIcon open={!sidebarCollapsed} />
            </Button>
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-3 pt-1">
          <NavRow view="analyze" />

          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              className="app-nav-row"
              data-active={builderActive}
              data-expanded={builderOpen}
              onClick={() => {
                if (sidebarCollapsed) {
                  expandSidebar();
                  setBuilderOpen(true);
                  return;
                }
                setBuilderOpen(o => !o);
              }}
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
                    { key: "tailor" as const, label: "Tailor to a job" },
                    { key: "template" as const, label: "Template Builder" },
                  ].map(({ key, label }) => {
                    const subActive = builderActive && navBuilderSubflow === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className="app-nav-sublink"
                        data-active={subActive}
                        aria-current={subActive ? "page" : undefined}
                        onClick={() => {
                          if (key === "template") {
                            router.push("/template-builder/");
                            setHistoryOpen(false);
                            setBuilderOpen(false);
                            return;
                          }
                          goBuilderFlow(key);
                        }}
                      >
                        <span className="app-nav-sublink-icon" aria-hidden>
                          {BUILDER_SUBFLOW_ICONS[key]}
                        </span>
                        <span>{label}</span>
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
          {advisorAllowed ? <NavRow view="advisor" /> : null}
        </nav>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-2.5 pb-3 pt-2.5">
          <button
            type="button"
            className="app-nav-row mb-0"
            data-active={historyOpen}
            onClick={() => setHistoryOpen(o => !o)}
            title="Resume history"
          >
            <span className="app-nav-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="app-sidebar-label flex-1">History</span>
          </button>

          <div className="app-sidebar-footer-row flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
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
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:ring-3 data-popup-open:ring-accent/30"
                aria-label="Account menu"
                title="Account menu"
              >
                <Avatar className="size-8 bg-primary after:border-none">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={8} className="min-w-40">
                <DropdownMenuItem onClick={() => switchView("profile")}>
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => void onSignOut()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="app-sidebar-legal flex flex-wrap gap-2.5 pt-1 text-[11px]">
            <Link href="/terms" prefetch={false} className="text-muted-foreground no-underline hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" prefetch={false} className="text-muted-foreground no-underline hover:text-foreground">
              Privacy
            </Link>
          </nav>
          <div className="app-sidebar-legal text-[10px] tracking-wide text-muted-foreground">
            © 2026 Resunova
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────── */}
      <div className="app-shell-main">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="app-shell-sidebar-reopen size-10"
          onClick={toggleSidebarCollapsed}
          aria-label="Show navigation"
          title="Show navigation"
        >
          <NavMenuIcon open={false} />
        </Button>
        <UmbcWelcomeBanner />
        <main
          key={active}
          className="app-shell-view-pane flex min-h-0 flex-1 flex-col overflow-hidden"
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
              <span className="max-w-[72px] truncate">{VIEW_LABELS[v]}</span>
            </button>
          );
        })}
      </nav>

      {/* ── History drawer (right) ───────────────────────────── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[min(300px,92vw)] gap-0 p-0 sm:max-w-[300px]"
        >
          <SheetTitle className="sr-only">Resume history</SheetTitle>
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
        </SheetContent>
      </Sheet>
    </div>
      </AppShellSidebarContext.Provider>
    </UmbcProvider>
  );
}
