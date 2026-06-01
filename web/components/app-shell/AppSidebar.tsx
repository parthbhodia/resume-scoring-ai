"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Moon, Sun } from "lucide-react";
import { LogoFull, LogoMark } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}: {
  view: AppView;
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = VIEW_ICONS[view];
  const badge = VIEW_BADGES[view];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={VIEW_LABELS[view]}
        className={NAV_ACTIVE_CLASS}
        onClick={onClick}
      >
        <Icon aria-hidden />
        <span>{VIEW_LABELS[view]}</span>
        {badge ? (
          <Badge
            variant="secondary"
            className="ml-auto px-1.5 py-0 text-[9px] font-bold tracking-wide uppercase group-data-[collapsible=icon]:hidden"
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
  const BuilderIcon = VIEW_ICONS.builder;

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
      <SidebarHeader className="gap-3 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="h-auto px-0 hover:bg-transparent active:bg-transparent"
              onClick={() => onSwitchView("analyze")}
              tooltip="Resunova"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
                <LogoMark size={28} variant={isUmbc ? "umbc" : "resunova"} />
                <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <LogoFull
                    markSize={26}
                    textColor="var(--text)"
                    variant={isUmbc ? "umbc" : "resunova"}
                  />
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-end gap-1 px-0.5 group-data-[collapsible=icon]:justify-center">
          <SidebarTrigger className="size-9 shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem
                view="analyze"
                isActive={!onTemplateBuilderPage && active === "analyze"}
                onClick={() => onSwitchView("analyze")}
              />

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={builderActive}
                  tooltip={VIEW_LABELS.builder}
                  className={cn(NAV_ACTIVE_CLASS, "w-full")}
                  onClick={handleBuilderClick}
                >
                  <BuilderIcon aria-hidden />
                  <span>{VIEW_LABELS.builder}</span>
                  <ChevronDown
                    className={cn(
                      "ml-auto size-4 opacity-60 transition-transform group-data-[collapsible=icon]:hidden",
                      builderOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </SidebarMenuButton>
                <Collapsible open={builderOpen} onOpenChange={onBuilderOpenChange}>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {BUILDER_SUBFLOWS.map(({ key, label, icon: SubIcon }) => {
                        const subActive = builderActive && navBuilderSubflow === key;
                        return (
                          <SidebarMenuSubItem key={key}>
                            <SidebarMenuSubButton
                              isActive={subActive}
                              className={NAV_ACTIVE_CLASS}
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
                              <SubIcon aria-hidden />
                              <span>{label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              <NavItem
                view="library"
                isActive={!onTemplateBuilderPage && active === "library"}
                onClick={() => onSwitchView("library")}
              />
              <NavItem
                view="cover-letter"
                isActive={!onTemplateBuilderPage && active === "cover-letter"}
                onClick={() => onSwitchView("cover-letter")}
              />
              <NavItem
                view="jobs"
                isActive={!onTemplateBuilderPage && active === "jobs"}
                onClick={() => onSwitchView("jobs")}
              />
              <NavItem
                view="profile"
                isActive={!onTemplateBuilderPage && active === "profile"}
                onClick={() => onSwitchView("profile")}
              />
              {advisorAllowed ? (
                <NavItem
                  view="advisor"
                  isActive={!onTemplateBuilderPage && active === "advisor"}
                  onClick={() => onSwitchView("advisor")}
                />
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={historyOpen}
              tooltip="History"
              className={NAV_ACTIVE_CLASS}
              onClick={() => onHistoryOpenChange(!historyOpen)}
            >
              <Clock aria-hidden />
              <span>History</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 shrink-0"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
          <AppSidebarUser
            initial={userInitial}
            onProfile={() => onSwitchView("profile")}
            onSignOut={onSignOut}
          />
        </div>

        <SidebarSeparator className="mx-0" />
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
