import type * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({
  pathname,
  defaultOpen,
  title,
  back,
  children,
}: {
  pathname: string;
  defaultOpen: boolean;
  title: string;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar pathname={pathname} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            {back && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <a href={back.href} className="transition-colors hover:text-foreground">
                    {back.label}
                  </a>
                  <span className="text-border">/</span>
                  <span className="text-foreground">{title}</span>
                </div>
              </>
            )}
          </header>
          <div className="flex-1 px-4 py-8 md:px-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
