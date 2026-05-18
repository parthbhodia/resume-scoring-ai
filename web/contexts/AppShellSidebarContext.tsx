"use client";

import { createContext, useContext } from "react";

export type AppShellSidebarContextValue = {
  collapseSidebar: () => void;
};

export const AppShellSidebarContext = createContext<AppShellSidebarContextValue | null>(null);

export function useAppShellSidebar(): AppShellSidebarContextValue | null {
  return useContext(AppShellSidebarContext);
}
