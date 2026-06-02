"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Props = {
  initial: string;
  onProfile: () => void;
  onSignOut: () => void;
};

export function AppSidebarUser({ initial, onProfile, onSignOut }: Props) {
  const { state } = useSidebar();
  const showLabels = state === "expanded";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            tooltip="Account"
            className="data-popup-open:bg-[var(--accent-bg)]"
          />
        }
      >
        <Avatar
          className={cn(
            "bg-primary after:border-none",
            state === "collapsed" ? "size-8" : "size-7",
          )}
        >
          <AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        {showLabels ? <span className="app-nav-label">Account</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={showLabels ? "top" : "right"}
        align={showLabels ? "start" : "end"}
        sideOffset={8}
        className="z-[100] w-auto min-w-44"
      >
        <DropdownMenuItem onClick={onProfile}>Profile settings</DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          closeOnClick
          onClick={() => {
            void onSignOut();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
