import { queryClient } from "@/lib/query-client";
import {
  DEFAULT_TRAFFIC_FILTERS,
  applicationQuery,
  exposedPortsQuery,
  mcpTokenQuery,
  passkeysQuery,
  projectAppsQuery,
  projectQuery,
  projectsQuery,
  settingsQuery,
  trafficEventsQuery,
  trafficHostsQuery,
  trafficIpsQuery,
  trafficSummaryQuery,
  usersQuery,
} from "@/lib/queries";

const HOVER_DELAY_MS = 50;

const islandModules = import.meta.glob([
  "../components/ApplicationShell.tsx",
  "../components/DeploymentLogPage.tsx",
  "../components/ExposedPortsCard.tsx",
  "../components/MarketplaceBrowser.tsx",
  "../components/McpPage.tsx",
  "../components/NewProjectDialog.tsx",
  "../components/PasskeyCard.tsx",
  "../components/ProjectDetail.tsx",
  "../components/ProjectMarketplaceBrowser.tsx",
  "../components/ProjectsTable.tsx",
  "../components/PruneDockerButton.tsx",
  "../components/RemoteDatabaseAccessCard.tsx",
  "../components/SettingsForm.tsx",
  "../components/SystemTabs.tsx",
  "../components/TrafficPage.tsx",
  "../components/UpdateCard.tsx",
  "../components/UserDetail.tsx",
  "../components/UserSessionDetail.tsx",
  "../components/UsersPage.tsx",
]);

const htmlInFlight = new Set<string>();

function queriesFor(url: URL) {
  const id = url.searchParams.get("id") ?? "";
  switch (url.pathname) {
    case "/":
      return [projectsQuery(1)];
    case "/projects/view":
      return id ? [projectQuery(id), projectAppsQuery(id, 1)] : [];
    case "/applications/view":
      return id ? [applicationQuery(id)] : [];
    case "/users":
      return [usersQuery(1)];
    case "/settings":
      return [settingsQuery(), exposedPortsQuery(), passkeysQuery()];
    case "/mcp":
      return [settingsQuery(), mcpTokenQuery()];
    case "/traffic":
      return [
        trafficSummaryQuery("1h", DEFAULT_TRAFFIC_FILTERS),
        trafficHostsQuery("1h"),
        trafficEventsQuery("1h", DEFAULT_TRAFFIC_FILTERS, 1),
        trafficIpsQuery("1h", DEFAULT_TRAFFIC_FILTERS, 1),
      ];
    default:
      return [];
  }
}

function prefetchData(url: URL) {
  for (const query of queriesFor(url)) queryClient.prefetchQuery(query as Parameters<typeof queryClient.prefetchQuery>[0]);
}

function prefetchAnchor(anchor: HTMLAnchorElement) {
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const path = url.pathname + url.search;
  if (path === location.pathname + location.search) return;

  if (!htmlInFlight.has(path)) {
    htmlInFlight.add(path);
    fetch(path)
      .then((response) => response.arrayBuffer())
      .catch(() => {})
      .finally(() => htmlInFlight.delete(path));
  }
  prefetchData(url);
}

function anchorFrom(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
}

let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoveredAnchor: HTMLAnchorElement | null = null;

document.addEventListener(
  "mouseover",
  (event) => {
    const anchor = anchorFrom(event.target);
    if (anchor === hoveredAnchor) return;
    hoveredAnchor = anchor;
    clearTimeout(hoverTimer);
    if (anchor) hoverTimer = setTimeout(() => prefetchAnchor(anchor), HOVER_DELAY_MS);
  },
  { passive: true },
);

for (const type of ["touchstart", "mousedown", "focusin"] as const) {
  document.addEventListener(
    type,
    (event) => {
      const anchor = anchorFrom(event.target);
      if (anchor) prefetchAnchor(anchor);
    },
    { passive: true },
  );
}

prefetchData(new URL(location.href));
document.addEventListener("astro:before-preparation", (event) => prefetchData((event as Event & { to: URL }).to));

const WARMUP_DELAY_MS = 2000;

function warmIslands() {
  setTimeout(() => {
    const load = () => Object.values(islandModules).forEach((importIsland) => importIsland().catch(() => {}));
    if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 5000 });
    else load();
  }, WARMUP_DELAY_MS);
}

if (document.readyState === "complete") warmIslands();
else window.addEventListener("load", warmIslands, { once: true });
