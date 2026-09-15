"use client";

import type * as React from "react";
import { ChartLineUp, Cpu, FolderSimple, Gear, Users as UsersIcon } from "@phosphor-icons/react";
import { KuberfyMark } from "@/components/KuberfyMark";
import { NavUser } from "@/components/nav-user";
import { UpdateAvailableButton } from "@/components/UpdateAvailableButton";
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
  SidebarRail,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Projects", href: "/", icon: FolderSimple, isActive: (path: string) => path === "/" || path.startsWith("/projects") },
  { title: "Traffic", href: "/traffic", icon: ChartLineUp, isActive: (path: string) => path.startsWith("/traffic") },
  { title: "System", href: "/system", icon: Cpu, isActive: (path: string) => path.startsWith("/system") },
  { title: "Users", href: "/users", icon: UsersIcon, isActive: (path: string) => path.startsWith("/users") },
  { title: "Settings", href: "/settings", icon: Gear, isActive: (path: string) => path.startsWith("/settings") },
];

export function AppSidebar({ pathname, ...props }: { pathname: string } & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <KuberfyMark />
                <span className="font-heading text-sm font-medium tracking-tight">Kuberfy</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={item.isActive(pathname)} tooltip={item.title}>
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UpdateAvailableButton />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
