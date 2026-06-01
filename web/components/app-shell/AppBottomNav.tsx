"use client";

import { cn } from "@/lib/utils";
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
};

export function AppBottomNav({ active, builderActive, onSelect, onBuilder }: Props) {
  return (
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
    </nav>
  );
}
