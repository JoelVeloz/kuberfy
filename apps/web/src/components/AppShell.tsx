import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export const SIDEBAR_TOGGLE_ATTRIBUTE = "data-sidebar-toggle";

function SidebarToggleListener() {
  const { toggleSidebar } = useSidebar();

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`[${SIDEBAR_TOGGLE_ATTRIBUTE}]`)) toggleSidebar();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toggleSidebar]);

  return null;
}

function useCurrentPathname(initialPathname: string) {
  const [pathname, setPathname] = React.useState(initialPathname);

  React.useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname);
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);

  return pathname;
}

export function AppShell({ pathname: initialPathname, defaultOpen }: { pathname: string; defaultOpen: boolean }) {
  const pathname = useCurrentPathname(initialPathname);

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen} className="contents">
        <AppSidebar pathname={pathname} />
        <SidebarToggleListener />
      </SidebarProvider>
    </TooltipProvider>
  );
}
