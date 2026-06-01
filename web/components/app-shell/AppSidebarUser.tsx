"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";

type Props = {
  initial: string;
  onProfile: () => void;
  onSignOut: () => void;
};

export function AppSidebarUser({ initial, onProfile, onSignOut }: Props) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex w-full items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:ring-3 data-popup-open:ring-accent/30"
            aria-label="Account menu"
            title="Account menu"
          >
            <Avatar className="size-8 bg-primary after:border-none">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={8} className="min-w-40">
            <DropdownMenuItem onClick={onProfile}>Profile settings</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void onSignOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
