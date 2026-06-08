"use client";

import React, { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NAV_ICONS } from "./nav-icons";
import {
  MOBILE_TAB_VIEWS,
  VIEW_ICONS,
  VIEW_LABELS,
  type AppView,
} from "./nav-config";

type Props = {
  active: AppView;
  builderActive: boolean;
  onSelect: (view: AppView) => void;
  onBuilder: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onHistoryOpen: () => void;
  onBugReport: () => void;
  onSignOut: () => void;
  userInitial: string;
};

export function AppBottomNav({
  active,
  builderActive,
  onSelect,
  onBuilder,
  theme,
  onToggleTheme,
  onHistoryOpen,
  onBugReport,
  onSignOut,
  userInitial,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        className="app-bottom-nav fixed inset-x-0 bottom-0 z-60 flex h-14 items-stretch justify-around border-t border-border bg-[var(--glass-bg)] pb-[env(safe-area-inset-bottom,0)] backdrop-blur-[16px] backdrop-saturate-[180%] md:hidden"
        aria-label="Primary"
      >
        {MOBILE_TAB_VIEWS.map((v) => {
          const isAct = v === "builder" ? builderActive : v === active;
          return (
            <button
              key={v}
              type="button"
              data-active={isAct}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-none bg-transparent font-inherit text-[9px] font-semibold tracking-wide text-[var(--dim)] uppercase transition-[color,transform] duration-200 active:scale-[0.96]",
                isAct && "text-accent [&_.app-nav-icon]:opacity-100",
              )}
              onClick={() => (v === "builder" ? onBuilder() : onSelect(v))}
            >
              <span className="app-nav-icon" aria-hidden>
                {VIEW_ICONS[v]}
              </span>
              <span className="max-w-[72px] truncate">{VIEW_LABELS[v]}</span>
            </button>
          );
        })}

        {/* More button */}
        <button
          type="button"
          data-active={moreOpen}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-none bg-transparent font-inherit text-[9px] font-semibold tracking-wide text-[var(--dim)] uppercase transition-[color,transform] duration-200 active:scale-[0.96]",
            moreOpen && "text-accent [&_.app-nav-icon]:opacity-100",
          )}
          onClick={() => setMoreOpen(true)}
        >
          <span className="app-nav-icon" aria-hidden>
            {NAV_ICONS.more}
          </span>
          <span>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-0 pb-16">
          <SheetTitle className="sr-only">More options</SheetTitle>

          {/* User row */}
          <div className="flex items-center gap-3 border-b border-border px-5 pb-4 pt-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">
              {userInitial}
            </span>
            <span className="text-sm font-medium text-[var(--text)]">Account</span>
          </div>

          <div className="flex flex-col py-2">
            {/* History */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface2)] active:bg-[var(--surface2)]"
              onClick={() => { setMoreOpen(false); onHistoryOpen(); }}
            >
              <span className="text-[var(--muted)]">{NAV_ICONS.history}</span>
              History
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface2)] active:bg-[var(--surface2)]"
              onClick={() => { onToggleTheme(); setMoreOpen(false); }}
            >
              <span className="text-[var(--muted)]">
                {theme === "dark" ? NAV_ICONS.themeDark : NAV_ICONS.themeLight}
              </span>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>

            {/* Contact */}
            <Link
              href="/contact"
              prefetch={false}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-[var(--text)] no-underline hover:bg-[var(--surface2)]"
              onClick={() => setMoreOpen(false)}
            >
              <span className="text-[var(--muted)]">{NAV_ICONS.contact}</span>
              Contact
            </Link>

            {/* Report a bug */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface2)] active:bg-[var(--surface2)]"
              onClick={() => { setMoreOpen(false); onBugReport(); }}
            >
              <span className="text-[var(--muted)]">{NAV_ICONS.bug}</span>
              Report a bug
            </button>

            {/* Sign out */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm text-red-500 hover:bg-[var(--surface2)] active:bg-[var(--surface2)]"
              onClick={() => { setMoreOpen(false); onSignOut(); }}
            >
              <span className="text-red-500">{NAV_ICONS.signOut}</span>
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
