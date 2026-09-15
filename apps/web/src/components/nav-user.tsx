"use client";

import { CaretUpDownIcon, MoonIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function NavUser() {
  const { isMobile } = useSidebar();
  const { theme, toggle } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-3 flex-1" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!session) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <a href="/login">Sign in</a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const email = session.user.email;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(email)}</AvatarFallback>
              </Avatar>
              <span className="truncate font-mono text-xs">{email}</span>
              <CaretUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials(email)}</AvatarFallback>
                </Avatar>
                <span className="truncate font-mono text-xs text-muted-foreground">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggle}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
              <SignOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
