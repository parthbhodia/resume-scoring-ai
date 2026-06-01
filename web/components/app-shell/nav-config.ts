import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  FileSearch,
  FileText,
  FolderKanban,
  LayoutTemplate,
  Mail,
  Sparkles,
  User,
  UserCheck,
} from "lucide-react";

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

export const VIEW_ICONS: Record<AppView, LucideIcon> = {
  analyze: FileSearch,
  builder: FileText,
  library: FolderKanban,
  profile: User,
  jobs: Briefcase,
  "cover-letter": Mail,
  advisor: UserCheck,
};

export const VIEW_BADGES: Partial<Record<AppView, string>> = {
  jobs: "Soon",
  "cover-letter": "Soon",
};

export const BUILDER_SUBFLOWS = [
  { key: "tailor" as const, label: "Tailor to a job", icon: Sparkles },
  { key: "template" as const, label: "Template Builder", icon: LayoutTemplate },
];

export const MOBILE_TAB_VIEWS: AppView[] = [
  "analyze",
  "builder",
  "library",
  "jobs",
  "profile",
];

/** Product active state: inset accent bar + tinted background */
export const NAV_ACTIVE_CLASS =
  "data-active:border data-active:border-accent/22 data-active:bg-[var(--accent-bg)] data-active:text-accent data-active:shadow-[inset_3px_0_0_0_var(--accent)] data-active:hover:bg-[var(--accent-bg)] data-active:hover:text-accent";

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
