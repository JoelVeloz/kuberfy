import * as React from "react";
import { apiWsUrl } from "@/lib/api-url";
import type { DeploymentStatus } from "@/lib/types";

export interface AppRow {
  id: string;
  name: string;
  projectName: string;
  status: DeploymentStatus | null;
  cpuLimit: number;
  cpu?: number;
  memUsed?: number;
  memLimit?: number;
  startedAt?: number;
}

export interface InfraRow {
  id: string;
  name: string;
  cpuLimit?: number;
  cpu?: number;
  memUsed?: number;
  memLimit?: number;
  startedAt?: number;
}

export interface HostStats {
  cpu: number;
  cpuCount: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
}

type StatsMessage =
  | { type: "host"; t: number; host: HostStats }
  | { type: "hostHistory"; samples: Array<{ t: number; cpu: number; memUsed: number }> }
  | {
      type: "shell";
      apps: Array<{ id: string; name: string; projectName: string; status: DeploymentStatus | null; cpuLimit: number }>;
      infra: Array<{ id: string; name: string; startedAt: number }>;
    }
  | { type: "appStat"; id: string; cpu: number; memUsed: number; memLimit: number; startedAt?: number }
  | { type: "infraStat"; id: string; cpu: number; memUsed: number; memLimit: number };

// Last hour at the server's 2s tick — same "no range picker, just the last hour" rule as the per-app chart.
const WINDOW_SIZE = 1800;

function mergeShell<Row extends { id: string; cpu?: number; memUsed?: number; memLimit?: number; startedAt?: number }>(
  prev: Map<string, Row>,
  incoming: Row[],
): Map<string, Row> {
  const next = new Map<string, Row>();
  for (const item of incoming) {
    const existing = prev.get(item.id);
    next.set(item.id, { ...item, cpu: existing?.cpu, memUsed: existing?.memUsed, memLimit: existing?.memLimit, startedAt: item.startedAt ?? existing?.startedAt });
  }
  return next;
}

function mergeStat<Row extends { id: string }>(prev: Map<string, Row>, id: string, stat: { cpu: number; memUsed: number; memLimit: number; startedAt?: number }): Map<string, Row> {
  const row = prev.get(id);
  if (!row) return prev;
  const next = new Map(prev);
  next.set(id, { ...row, ...stat });
  return next;
}

// Shared by the Overview and Containers tabs — only one is ever mounted at a time, so this never opens
// the /api/system/stats socket twice, and both stay in sync with the same live feed.
export function useSystemStats() {
  const [host, setHost] = React.useState<HostStats | null>(null);
  const [hostHistory, setHostHistory] = React.useState<Array<{ t: number; cpu: number; memMB: number }>>([]);
  const [apps, setApps] = React.useState<Map<string, AppRow>>(new Map());
  const [infra, setInfra] = React.useState<Map<string, InfraRow>>(new Map());
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl("/api/system/stats"));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => {
      const msg = JSON.parse(String(evt.data)) as StatsMessage;
      switch (msg.type) {
        case "host":
          setHost(msg.host);
          setHostHistory((prev) => [...prev.slice(-(WINDOW_SIZE - 1)), { t: msg.t, cpu: msg.host.cpu, memMB: Math.round((msg.host.memUsed / 1024 / 1024) * 10) / 10 }]);
          break;
        case "hostHistory":
          setHostHistory(msg.samples.map((s) => ({ t: s.t, cpu: s.cpu, memMB: Math.round((s.memUsed / 1024 / 1024) * 10) / 10 })));
          break;
        case "shell":
          setApps((prev) => mergeShell(prev, msg.apps));
          setInfra((prev) => mergeShell(prev, msg.infra));
          break;
        case "appStat":
          setApps((prev) => mergeStat(prev, msg.id, msg));
          break;
        case "infraStat":
          setInfra((prev) => mergeStat(prev, msg.id, msg));
          break;
      }
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  return { host, hostHistory, apps, infra, connected };
}
