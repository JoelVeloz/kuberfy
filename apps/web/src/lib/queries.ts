import { queryOptions } from "@tanstack/react-query";
import { api, type TrafficFilters } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const PROJECTS_PAGE_SIZE = 20;
export const PROJECT_APPS_PAGE_SIZE = 100;
export const USERS_PAGE_SIZE = 20;
export const TRAFFIC_PAGE_SIZE = 20;

export type TrafficRange = "1h" | "24h" | "7d" | "30d";
export const DEFAULT_TRAFFIC_FILTERS: TrafficFilters = { host: "all", ip: "", method: "all", status: undefined };

export const projectsQuery = (page: number) =>
  queryOptions({ queryKey: ["projects", page], queryFn: () => api.listProjectsWithApplications(page, PROJECTS_PAGE_SIZE) });

export const projectQuery = (id: string) => queryOptions({ queryKey: ["project", id], queryFn: () => api.getProject(id) });

export const projectAppsQuery = (id: string, page: number) =>
  queryOptions({ queryKey: ["project", id, "apps", page], queryFn: () => api.listProjectApplications(id, page, PROJECT_APPS_PAGE_SIZE) });

export const applicationQuery = (id: string) => queryOptions({ queryKey: ["application", id], queryFn: () => api.getApplication(id) });

export const usersQuery = (page: number) => queryOptions({ queryKey: ["users", page], queryFn: () => api.listUsers(page, USERS_PAGE_SIZE) });

export const settingsQuery = () => queryOptions({ queryKey: ["settings"], queryFn: api.getSettings });

export const exposedPortsQuery = () => queryOptions({ queryKey: ["exposed-ports"], queryFn: api.listExposedPorts });

export const mcpTokenQuery = () => queryOptions({ queryKey: ["mcp-token"], queryFn: api.getMcpToken });

export const passkeysQuery = () =>
  queryOptions({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw new Error(error.message ?? "Failed to load passkeys.");
      return data ?? [];
    },
  });

export const trafficSummaryQuery = (range: TrafficRange, filters: TrafficFilters) =>
  queryOptions({ queryKey: ["traffic-summary", range, filters], queryFn: () => api.getTrafficSummary(range, filters) });

export const trafficHostsQuery = (range: TrafficRange) => queryOptions({ queryKey: ["traffic-hosts", range], queryFn: () => api.getTrafficHosts(range) });

export const trafficEventsQuery = (range: TrafficRange, filters: TrafficFilters, page: number) =>
  queryOptions({ queryKey: ["traffic-events", range, filters, page], queryFn: () => api.listTrafficEvents(range, filters, page, TRAFFIC_PAGE_SIZE) });

export const trafficIpsQuery = (range: TrafficRange, filters: TrafficFilters, page: number) =>
  queryOptions({ queryKey: ["traffic-ips", range, filters, page], queryFn: () => api.listTrafficIps(range, filters, page, TRAFFIC_PAGE_SIZE) });
