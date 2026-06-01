"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { AppShellSidebarContext } from "@/contexts/AppShellSidebarContext";
import { useSidebar } from "@/components/ui/sidebar";

export function AppShellSidebarBridge({ children }: { children: ReactNode }) {
  const { setOpen, isMobile, setOpenMobile } = useSidebar();

  const collapseSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  }, [isMobile, setOpen, setOpenMobile]);

  const value = useMemo(() => ({ collapseSidebar }), [collapseSidebar]);

  return (
    <AppShellSidebarContext.Provider value={value}>
      {children}
    </AppShellSidebarContext.Provider>
  );
}
