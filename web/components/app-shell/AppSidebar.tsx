"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAV_ICONS } from "./nav-icons";
import { LogoFull, LogoMark } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { AppSidebarUser } from "./AppSidebarUser";
import {
  BUILDER_SUBFLOWS,
  NAV_ACTIVE_CLASS,
  NAV_MENU_BTN_CLASS,
  VIEW_BADGES,
  VIEW_ICONS,
  VIEW_LABELS,
  type AppView,
} from "./nav-config";

export type AppSidebarProps = {
  active: AppView;
  onTemplateBuilderPage: boolean;
  builderActive: boolean;
  builderOpen: boolean;
  onBuilderOpenChange: (open: boolean) => void;
  navBuilderSubflow: "tailor" | "template";
  advisorAllowed: boolean;
  isUmbc: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  userInitial: string;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  onSwitchView: (view: AppView) => void;
  onGoBuilderFlow: (flow: "tailor" | "template") => void;
  onSignOut: () => void;
};

function NavItem({
  view,
  isActive,
  onClick,
  showLabels,
}: {
  view: AppView;
  isActive: boolean;
  onClick?: () => void;
  showLabels: boolean;
}) {
  const badge = VIEW_BADGES[view];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={VIEW_LABELS[view]}
        className={cn(NAV_MENU_BTN_CLASS, NAV_ACTIVE_CLASS)}
        onClick={onClick}
      >
        <span className="app-nav-icon" aria-hidden>
          {VIEW_ICONS[view]}
        </span>
        {showLabels ? <span className="app-nav-label">{VIEW_LABELS[view]}</span> : null}
        {showLabels && badge ? (
          <Badge
            variant="secondary"
            className="ml-auto px-1.5 py-0 text-[9px] font-bold tracking-wide uppercase"
          >
            {badge}
          </Badge>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({
  active,
  onTemplateBuilderPage,
  builderActive,
  builderOpen,
  onBuilderOpenChange,
  navBuilderSubflow,
  advisorAllowed,
  isUmbc,
  theme,
  onToggleTheme,
  userInitial,
  historyOpen,
  onHistoryOpenChange,
  onSwitchView,
  onGoBuilderFlow,
  onSignOut,
}: AppSidebarProps) {
  const router = useRouter();
  const { state, setOpen } = useSidebar();
  const showLabels = state === "expanded";
  const handleBuilderClick = () => {
    if (state === "collapsed") {
      setOpen(true);
      onBuilderOpenChange(true);
      return;
    }
    onBuilderOpenChange(!builderOpen);
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-0">
        <div
          className={cn(
            "flex w-full items-center gap-2",
            state === "collapsed"
              ? "flex-col justify-center gap-2.5"
              : "flex-row justify-between",
          )}
        >
          <button
            type="button"
            className={cn(
              "flex cursor-pointer items-center border-0 bg-transparent p-0 font-inherit",
              state === "collapsed" ? "justify-center" : "min-w-0 flex-1 justify-start",
            )}
            onClick={() => onSwitchView("analyze")}
            aria-label="Resunova — go to Analyze"
          >
            {state === "collapsed" ? (
              <LogoMark size={32} variant={isUmbc ? "umbc" : "resunova"} />
            ) : (
              <LogoFull
                markSize={26}
                textColor="var(--text)"
                variant={isUmbc ? "umbc" : "resunova"}
              />
            )}
          </button>
          {state === "expanded" ? (
            <SidebarTrigger className="size-10 shrink-0 border border-border bg-[var(--surface2)]" />
          ) : null}
        </div>
        {state === "collapsed" ? (
          <SidebarTrigger
            className="mx-auto size-10 shrink-0 border border-border bg-[var(--surface2)]"
            title="Expand navigation"
          />
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="group-data-[collapsible=icon]:items-center">
              <NavItem
                view="analyze"
                isActive={!onTemplateBuilderPage && active === "analyze"}
                onClick={() => onSwitchView("analyze")}
                showLabels={showLabels}
              />

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={builderActive}
                  tooltip={VIEW_LABELS.builder}
                  className={cn(NAV_MENU_BTN_CLASS, NAV_ACTIVE_CLASS, "w-full")}
                  onClick={handleBuilderClick}
                >
                  <span className="app-nav-icon" aria-hidden>
                    {VIEW_ICONS.builder}
                  </span>
                  {showLabels ? <span className="app-nav-label">{VIEW_LABELS.builder}</span> : null}
                  {showLabels ? (
                    <ChevronDown
                      className={cn(
                        "ml-auto size-4 opacity-60 transition-transform",
                        builderOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  ) : null}
                </SidebarMenuButton>
                {showLabels ? (
                <Collapsible open={builderOpen} onOpenChange={onBuilderOpenChange}>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {BUILDER_SUBFLOWS.map(({ key, label, icon }) => {
                        const subActive = builderActive && navBuilderSubflow === key;
                        return (
                          <SidebarMenuSubItem key={key}>
                            <SidebarMenuSubButton
                              isActive={subActive}
                              className={cn(NAV_MENU_BTN_CLASS, NAV_ACTIVE_CLASS, "[&_svg]:!size-auto")}
                              render={<button type="button" />}
                              onClick={() => {
                                if (key === "template") {
                                  router.push("/template-builder/");
                                  onHistoryOpenChange(false);
                                  onBuilderOpenChange(false);
                                  return;
                                }
                                onGoBuilderFlow(key);
                              }}
                            >
                              <span className="app-nav-icon" aria-hidden>
                                {icon}
                              </span>
                              <span className="app-nav-label">{label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
                ) : null}
              </SidebarMenuItem>

              <NavItem
                view="library"
                isActive={!onTemplateBuilderPage && active === "library"}
                onClick={() => onSwitchView("library")}
                showLabels={showLabels}
              />
              <NavItem
                view="cover-letter"
                isActive={!onTemplateBuilderPage && active === "cover-letter"}
                onClick={() => onSwitchView("cover-letter")}
                showLabels={showLabels}
              />
              <NavItem
                view="jobs"
                isActive={!onTemplateBuilderPage && active === "jobs"}
                onClick={() => onSwitchView("jobs")}
                showLabels={showLabels}
              />
              <NavItem
                view="profile"
                isActive={!onTemplateBuilderPage && active === "profile"}
                onClick={() => onSwitchView("profile")}
                showLabels={showLabels}
              />
              {advisorAllowed ? (
                <NavItem
                  view="advisor"
                  isActive={!onTemplateBuilderPage && active === "advisor"}
                  onClick={() => onSwitchView("advisor")}
                  showLabels={showLabels}
                />
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={historyOpen}
              tooltip="History"
              className={cn(NAV_MENU_BTN_CLASS, NAV_ACTIVE_CLASS)}
              onClick={() => onHistoryOpenChange(!historyOpen)}
            >
              <span className="app-nav-icon" aria-hidden>
                {NAV_ICONS.history}
              </span>
              {showLabels ? <span className="app-nav-label">History</span> : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={theme === "dark" ? "Light mode" : "Dark mode"}
              className={NAV_MENU_BTN_CLASS}
              onClick={onToggleTheme}
            >
              <span className="app-nav-icon" aria-hidden>
                {theme === "dark" ? NAV_ICONS.themeDark : NAV_ICONS.themeLight}
              </span>
              {showLabels ? <span className="app-nav-label">Theme</span> : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <AppSidebarUser
              initial={userInitial}
              onProfile={() => onSwitchView("profile")}
              onSignOut={onSignOut}
            />
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="mx-0 group-data-[collapsible=icon]:hidden" />
        <nav className="flex flex-wrap gap-2.5 px-2 text-[11px] group-data-[collapsible=icon]:hidden">
          <Link
            href="/terms"
            prefetch={false}
            className="text-muted-foreground no-underline hover:text-foreground"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            prefetch={false}
            className="text-muted-foreground no-underline hover:text-foreground"
          >
            Privacy
          </Link>
        </nav>
        <p className="px-2 pb-1 text-[10px] tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">
          © 2026 Resunova
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
