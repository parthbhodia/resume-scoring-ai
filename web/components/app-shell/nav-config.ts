import type { ReactNode } from "react";
import { BUILDER_SUBFLOW_ICONS, NAV_ICONS } from "./nav-icons";

export type AppView =
  | "builder"
  | "library"
  | "analyze"
  | "profile"
  | "jobs"
  | "cover-letter"
  | "advisor";

export const VIEW_LABELS: Record<AppView, string> = {
  builder: "Resume Builder",
  library: "Library",
  analyze: "Analyze",
  profile: "Profile",
  jobs: "Jobs",
  "cover-letter": "Cover letter",
  advisor: "Advisor",
};

export const VIEW_ICONS: Record<AppView, ReactNode> = {
  analyze: NAV_ICONS.analyze,
  builder: NAV_ICONS.builder,
  library: NAV_ICONS.library,
  profile: NAV_ICONS.profile,
  jobs: NAV_ICONS.jobs,
  "cover-letter": NAV_ICONS["cover-letter"],
  advisor: NAV_ICONS.advisor,
};

export const VIEW_BADGES: Partial<Record<AppView, string>> = {
  jobs: "Soon",
  "cover-letter": "Soon",
};

export const BUILDER_SUBFLOWS = [
  { key: "tailor" as const, label: "Tailor to a job", icon: BUILDER_SUBFLOW_ICONS.tailor },
  { key: "template" as const, label: "Template Builder", icon: BUILDER_SUBFLOW_ICONS.template },
];

export const MOBILE_TAB_VIEWS: AppView[] = [
  "analyze",
  "builder",
  "library",
  "jobs",
  "profile",
];

/** Wrapper + menu button: original muted icons, accent when active. */
export const NAV_MENU_BTN_CLASS =
  "!gap-2.5 !px-3 !py-2.5 text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)] [&_.app-nav-icon_svg]:!size-5";

export const NAV_ACTIVE_CLASS =
  "data-active:!border-accent/22 data-active:!bg-[var(--accent-bg)] data-active:!text-accent data-active:shadow-[inset_3px_0_0_0_var(--accent)] data-active:hover:!bg-[var(--accent-bg)] data-active:hover:!text-accent data-active:[&_.app-nav-icon]:opacity-100";

export const SIDEBAR_COLLAPSED_KEY = "rn-app-sidebar-collapsed";

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}
