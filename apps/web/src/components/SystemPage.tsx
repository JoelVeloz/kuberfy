import * as React from "react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { UsageAreaChart } from "@/components/UsageAreaChart";
import { deploymentStatusLabel, deploymentStatusVariant } from "@/lib/deployment-status";
import type { DeploymentStatus } from "@/lib/types";
import { apiWsUrl } from "@/lib/api-url";
import { SHORT_WINDOW_MS, computeTimeDomain, formatClock, niceCeil } from "@/lib/chart-time";
import { formatBytes, formatMB } from "@/lib/format-bytes";

interface AppRow {
  id: string;
  name: string;
  status: DeploymentStatus | null;
  cpuLimit: number;
  cpu?: number;
  memUsed?: number;
  memLimit?: number;
}

interface InfraRow {
  id: string;
  name: string;
  cpuLimit?: number;
  cpu?: number;
  memUsed?: number;
  memLimit?: number;
}

interface HostStats {
  cpu: number;
  cpuCount: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
}

type StatsMessage =
  | { type: "host"; t: number; host: HostStats }
  | { type: "shell"; apps: Array<{ id: string; name: string; status: DeploymentStatus | null; cpuLimit: number }>; infra: Array<{ id: string; name: string }> }
  | { type: "appStat"; id: string; cpu: number; memUsed: number; memLimit: number }
  | { type: "infraStat"; id: string; cpu: number; memUsed: number; memLimit: number };

// Last hour at the server's 2s tick — same "no range picker, just the last hour" rule as the per-app chart.
const WINDOW_SIZE = 1800;

const statusOrder: DeploymentStatus[] = ["failed", "building", "pending", "running", "stopped"];

function Pending() {
  return <span className="text-muted-foreground">…</span>;
}

function MemoryCell({ memUsed, memLimit }: { memUsed?: number; memLimit?: number }) {
  if (memUsed === undefined || memLimit === undefined) return <Pending />;
  const percent = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={percent} className={`w-24 ${levelColor(percent)}`} />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatBytes(memUsed)} / {formatBytes(memLimit)}
      </span>
    </div>
  );
}

function CpuCell({ cpu, cpuLimit }: { cpu?: number; cpuLimit?: number }) {
  if (cpu === undefined || cpuLimit === undefined) return <Pending />;
  const cores = cpu / 100;
  const percent = cpuLimit > 0 ? (cores / cpuLimit) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={Math.min(100, percent)} className={`w-24 ${levelColor(percent)}`} />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {cores.toFixed(2)} / {cpuLimit} cores
      </span>
    </div>
  );
}

// Green under 75%, amber up to 90%, red above — the visual answer to "did this hit its max?"
// Targets the Progress indicator (its only child div) since the component only exposes one fixed fill color.
function levelColor(percent: number) {
  if (percent >= 90) return "[&>div]:bg-destructive";
  if (percent >= 75) return "[&>div]:bg-chart-4";
  return "";
}

const infraColumnHelper = createColumnHelper<InfraRow>();
const infraColumns = [
  infraColumnHelper.accessor("name", { header: "Name", meta: { headerClassName: "w-2/5" }, cell: (info) => <span className="truncate font-medium">{info.getValue()}</span> }),
  infraColumnHelper.display({ id: "status", header: "Status", meta: { headerClassName: "w-28" }, cell: () => <Badge variant="success">Running</Badge> }),
  infraColumnHelper.accessor("cpu", {
    header: "CPU",
    cell: (info) => <CpuCell cpu={info.getValue()} cpuLimit={info.row.original.cpuLimit} />,
  }),
  infraColumnHelper.accessor("memUsed", {
    header: "Memory",
    cell: (info) => <MemoryCell memUsed={info.getValue()} memLimit={info.row.original.memLimit} />,
  }),
];

const appColumnHelper = createColumnHelper<AppRow>();
const appColumns = [
  appColumnHelper.accessor("name", {
    header: "Name",
    meta: { headerClassName: "w-2/5" },
    cell: (info) => (
      <a href={`/applications/view?id=${info.row.original.id}`} className="block truncate font-medium hover:underline">
        {info.getValue()}
      </a>
    ),
  }),
  appColumnHelper.accessor("status", {
    header: "Status",
    meta: { headerClassName: "w-28" },
    cell: (info) => (info.getValue() ? <DeploymentStatusBadge status={info.getValue()!} /> : <span className="text-xs text-muted-foreground">No deployments</span>),
  }),
  appColumnHelper.accessor("cpu", {
    header: "CPU",
    cell: (info) =>
      info.row.original.status === "running" ? (
        <CpuCell cpu={info.getValue()} cpuLimit={info.row.original.cpuLimit} />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }),
  appColumnHelper.accessor("memUsed", {
    header: "Memory",
    cell: (info) =>
      info.row.original.status === "running" ? (
        <MemoryCell memUsed={info.getValue()} memLimit={info.row.original.memLimit} />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }),
];

function mergeShell<Row extends { id: string; cpu?: number; memUsed?: number; memLimit?: number }>(prev: Map<string, Row>, incoming: Row[]): Map<string, Row> {
  const next = new Map<string, Row>();
  for (const item of incoming) {
    const existing = prev.get(item.id);
    next.set(item.id, { ...item, cpu: existing?.cpu, memUsed: existing?.memUsed, memLimit: existing?.memLimit });
  }
  return next;
}

function mergeStat<Row extends { id: string }>(prev: Map<string, Row>, id: string, stat: { cpu: number; memUsed: number; memLimit: number }): Map<string, Row> {
  const row = prev.get(id);
  if (!row) return prev;
  const next = new Map(prev);
  next.set(id, { ...row, ...stat });
  return next;
}

// Client island: the host's own resource usage (not any one application's) — CPU, RAM, disk, plus every
// application's current footprint in one table. Same live-WebSocket pattern as ApplicationStatsChart.
export function SystemPage() {
  const [host, setHost] = React.useState<HostStats | null>(null);
  const [hostHistory, setHostHistory] = React.useState<Array<{ t: number; cpu: number; memMB: number }>>([]);
  const [apps, setApps] = React.useState<Map<string, AppRow>>(new Map());
  const [infra, setInfra] = React.useState<Map<string, InfraRow>>(new Map());
  const [connected, setConnected] = React.useState(false);
  const [infraSorting, setInfraSorting] = React.useState<SortingState>([{ id: "memUsed", desc: true }]);
  const [appSorting, setAppSorting] = React.useState<SortingState>([{ id: "memUsed", desc: true }]);

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

  if (!host) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for metrics…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  const statusCounts = Array.from(apps.values()).reduce<Partial<Record<DeploymentStatus, number>>>((acc, app) => {
    if (app.status) acc[app.status] = (acc[app.status] ?? 0) + 1;
    return acc;
  }, {});

  const timeDomain = computeTimeDomain(hostHistory);
  const formatAxisTick = (t: number) => formatClock(t, timeDomain[1] - timeDomain[0] <= SHORT_WINDOW_MS);
  const memPercent = host.memTotal > 0 ? (host.memUsed / host.memTotal) * 100 : 0;
  const diskPercent = host.diskTotal > 0 ? (host.diskUsed / host.diskTotal) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <UsageCard title="Host CPU" percent={host.cpu} detail={`${host.cpu.toFixed(1)}% across ${host.cpuCount} cores`} />
        <UsageCard title="Memory" percent={memPercent} detail={`${formatBytes(host.memUsed)} / ${formatBytes(host.memTotal)}`} />
        <UsageCard title="Disk" percent={diskPercent} detail={`${formatBytes(host.diskUsed)} / ${formatBytes(host.diskTotal)}`} />
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">
        Applications and Infrastructure below show CPU as cores used out of each container's own limit — directly comparable across rows even when limits differ, the same way the Memory column already works. This host has {host.cpuCount} cores total.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">CPU over time</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageAreaChart
              metric="cpu"
              data={hostHistory}
              dataKey="cpu"
              timeDomain={timeDomain}
              formatAxisTick={formatAxisTick}
              yAxisWidth={44}
              yDomain={[0, (max) => Math.max(100, Math.ceil(max / 10) * 10)]}
              unit="%"
              tooltipLabel="CPU"
              formatTooltipValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">Memory over time</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageAreaChart
              metric="mem"
              data={hostHistory}
              dataKey="memMB"
              timeDomain={timeDomain}
              formatAxisTick={formatAxisTick}
              yAxisWidth={48}
              yDomain={[0, (max) => niceCeil(max)]}
              yTickFormatter={formatMB}
              tooltipLabel="Memory"
              formatTooltipValue={(v) => formatMB(Number(v))}
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="font-heading text-sm font-medium">Infrastructure</h2>
        <p className="mt-1 text-xs text-muted-foreground">Kuberfy's own containers, not anything deployed on it.</p>
        <Card className="mt-3">
          <CardContent className="px-0">
            <DataTable
              columns={infraColumns}
              data={Array.from(infra.values(), (row) => ({ ...row, cpuLimit: host.cpuCount }))}
              getRowId={(c) => c.id}
              sorting={infraSorting}
              onSortingChange={setInfraSorting}
              fixedLayout
              emptyMessage="No infrastructure containers found."
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Applications</h2>
          <span className="text-xs text-muted-foreground">{apps.size} total</span>
          {statusOrder
            .filter((status) => statusCounts[status])
            .map((status) => (
              <Badge key={status} variant={deploymentStatusVariant[status]}>
                {statusCounts[status]} {deploymentStatusLabel[status]}
              </Badge>
            ))}
        </div>
        <Card className="mt-3">
          <CardContent className="px-0">
            <DataTable columns={appColumns} data={Array.from(apps.values())} getRowId={(app) => app.id} sorting={appSorting} onSortingChange={setAppSorting} fixedLayout />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UsageCard({ title, percent, detail }: { title: string; percent: number; detail: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="font-mono text-lg font-medium tabular-nums">{percent.toFixed(0)}%</span>
      </CardHeader>
      <CardContent>
        <Progress value={Math.min(100, percent)} className={levelColor(percent)} />
        <p className="mt-2 font-mono text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
