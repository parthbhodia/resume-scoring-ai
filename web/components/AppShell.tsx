"use client";

/**
 * AppShell — persistent left sidebar (desktop / tablet) + mobile bottom tab bar.
 * Design reference: docs/PRODUCT_DESIGN.md (Linear × Notion × career coach).
 */

import { useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { UmbcProvider } from "@/contexts/UmbcContext";
import { getSupabaseClient } from "@/lib/supabase";
import { apiUrl } from "@/lib/utils";
import { isUmbcUser } from "@/lib/userDomainDetection";
import { UmbcWelcomeBanner } from "./UmbcWelcomeBanner";
import ResumeSidebar from "./ResumeSidebar";
import { useAppBreakpoints } from "@/hooks/useAppBreakpoints";
import { useIsMobile } from "@/hooks/use-mobile";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-shell/AppSidebar";
import { AppBottomNav } from "./app-shell/AppBottomNav";
import { AppShellSidebarBridge } from "./app-shell/AppShellSidebarBridge";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
  type AppView,
} from "./app-shell/nav-config";

export type { AppView } from "./app-shell/nav-config";

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
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("rn-theme", next);
      applyTheme(next);
      return next;
    });
  }, []);

  return [theme, toggle];
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
  const valid: AppView[] = [
    "builder",
    "library",
    "analyze",
    "profile",
    "jobs",
    "cover-letter",
    "advisor",
  ];
  return valid.includes(raw as AppView) ? (raw as AppView) : "analyze";
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = useAppView();
  const onTemplateBuilderPage =
    (pathname ?? "").replace(/\/$/, "") === "/template-builder";
  const { isTablet } = useAppBreakpoints();
  const isMobile = useIsMobile();
  const flowRaw = (searchParams?.get("flow") || "tailor").toLowerCase();
  const builderFlow: "tailor" | "template" =
    flowRaw === "template" ? "template" : "tailor";
  const [layoutOnlyForNav, setLayoutOnlyForNav] = useState(readBuilderLayoutOnlyFlag);
  const [user, setUser] = useState<User | null>(null);
  const [isUmbc, setIsUmbc] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [advisorAllowed, setAdvisorAllowed] = useState(false);

  useEffect(() => {
    setSidebarOpen(!readSidebarCollapsed());
  }, []);

  useEffect(() => {
    if (isTablet) setSidebarOpen(false);
  }, [isTablet]);

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    writeSidebarCollapsed(!open);
  }, []);

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
        const json = (await resp.json()) as { allowed?: boolean };
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_ev, s) => {
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
      } catch {
        /* ignore */
      }
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
  const navBuilderSubflow: "tailor" | "template" = onTemplateBuilderPage
    ? "template"
    : builderActive && builderFlow === "tailor" && layoutOnlyForNav
      ? "template"
      : builderFlow;

  return (
    <UmbcProvider isUmbc={isUmbc}>
      <TooltipProvider delay={0}>
        <SidebarProvider
          open={sidebarOpen}
          onOpenChange={handleSidebarOpenChange}
          defaultOpen={!readSidebarCollapsed()}
          className="app-shell-root min-h-dvh max-h-dvh overflow-hidden bg-background"
          style={
            {
              "--sidebar-width": "13.75rem",
              "--sidebar-width-icon": "4.5rem",
            } as CSSProperties
          }
        >
          <AppShellSidebarBridge>
            {!isMobile && (
              <AppSidebar
                active={active}
                onTemplateBuilderPage={onTemplateBuilderPage}
                builderActive={builderActive}
                builderOpen={builderOpen}
                onBuilderOpenChange={setBuilderOpen}
                navBuilderSubflow={navBuilderSubflow}
                advisorAllowed={advisorAllowed}
                isUmbc={isUmbc}
                theme={theme}
                onToggleTheme={toggleTheme}
                userInitial={initial}
                historyOpen={historyOpen}
                onHistoryOpenChange={setHistoryOpen}
                onSwitchView={switchView}
                onGoBuilderFlow={goBuilderFlow}
                onSignOut={onSignOut}
              />
            )}

            <SidebarInset
              key={active}
              className="app-shell-main app-shell-view-pane min-h-0 flex-1 flex-col overflow-hidden pb-14 md:pb-0"
            >
              <UmbcWelcomeBanner />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </SidebarInset>

            <AppBottomNav
              active={active}
              builderActive={builderActive}
              onSelect={switchView}
              onBuilder={() => goBuilderFlow("tailor")}
            />

            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetContent
                side="right"
                showCloseButton={false}
                className="w-[min(300px,92vw)] gap-0 p-0 sm:max-w-[300px]"
              >
                <SheetTitle className="sr-only">Resume history</SheetTitle>
                <ResumeSidebar
                  activeFolder={null}
                  onSelect={(folder) => {
                    try {
                      sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
                    } catch {
                      /* ignore */
                    }
                    router.push(
                      `/?view=builder&flow=tailor&base=${encodeURIComponent(folder)}&intent=job`,
                    );
                    setHistoryOpen(false);
                  }}
                />
              </SheetContent>
            </Sheet>
          </AppShellSidebarBridge>
        </SidebarProvider>
      </TooltipProvider>
    </UmbcProvider>
  );
}
