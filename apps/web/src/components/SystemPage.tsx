import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import type { DeploymentStatus } from "@/lib/types";
import { apiWsUrl } from "@/lib/api-url";
import { SHORT_WINDOW_MS, computeTimeDomain, formatClock, formatTooltipLabel } from "@/lib/chart-time";

interface AppStat {
  id: string;
  name: string;
  status: DeploymentStatus | null;
  cpu: number;
  memUsed: number;
  memLimit: number;
}

interface InfraStat {
  id: string;
  name: string;
  cpu: number;
  memUsed: number;
  memLimit: number;
}

interface StatsSample {
  t: number;
  host: { cpu: number; memUsed: number; memTotal: number; diskUsed: number; diskTotal: number };
  apps: AppStat[];
  infra: InfraStat[];
}

// Last hour at the server's 2s tick — same "no range picker, just the last hour" rule as the per-app chart.
const WINDOW_SIZE = 1800;

const cpuConfig = { cpu: { label: "CPU", color: "var(--chart-1)" } } satisfies ChartConfig;
const memConfig = { mem: { label: "Memory", color: "var(--chart-2)" } } satisfies ChartConfig;

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

// Short tick labels for the memory axis — "1.2GB" instead of "1200MB" keeps the reserved axis width small.
function formatMB(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
}

// ChartTooltipContent's `formatter` prop replaces the whole row (indicator + label + value), not just the value —
// this rebuilds that row with a unit-suffixed value instead of the raw number it'd otherwise show.
const tooltipRow = (label: string, formatValue: (value: unknown) => string) => (value: unknown) => (
  <div className="flex flex-1 items-center justify-between leading-none">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono font-medium text-foreground tabular-nums">{formatValue(value)}</span>
  </div>
);

// Shared by the Applications and Infrastructure tables — a CPU% cell and a memory progress bar + used/limit label.
function MemoryCell({ memUsed, memLimit }: { memUsed: number; memLimit: number }) {
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

// Green under 75%, amber up to 90%, red above — the visual answer to "did this hit its max?"
// Targets the Progress indicator (its only child div) since the component only exposes one fixed fill color.
function levelColor(percent: number) {
  if (percent >= 90) return "[&>div]:bg-destructive";
  if (percent >= 75) return "[&>div]:bg-chart-4";
  return "";
}

const infraColumnHelper = createColumnHelper<InfraStat>();
const infraColumns = [
  infraColumnHelper.accessor("name", { header: "Name", meta: { headerClassName: "w-2/5" }, cell: (info) => <span className="truncate font-medium">{info.getValue()}</span> }),
  infraColumnHelper.display({ id: "status", header: "Status", meta: { headerClassName: "w-28" }, cell: () => <Badge variant="success">Running</Badge> }),
  infraColumnHelper.accessor("cpu", {
    header: "CPU",
    meta: { headerClassName: "w-20" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue().toFixed(1)}%</span>,
  }),
  infraColumnHelper.accessor("memUsed", {
    header: "Memory",
    cell: (info) => <MemoryCell memUsed={info.getValue()} memLimit={info.row.original.memLimit} />,
  }),
];

const appColumnHelper = createColumnHelper<AppStat>();
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
    meta: { headerClassName: "w-20" },
    cell: (info) => <span className="font-mono tabular-nums">{info.row.original.status === "running" ? `${info.getValue().toFixed(1)}%` : "—"}</span>,
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

// Client island: the host's own resource usage (not any one application's) — CPU, RAM, disk, plus every
// application's current footprint in one table. Same live-WebSocket pattern as ApplicationStatsChart.
export function SystemPage() {
  const [samples, setSamples] = React.useState<StatsSample[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [infraSorting, setInfraSorting] = React.useState<SortingState>([{ id: "memUsed", desc: true }]);
  const [appSorting, setAppSorting] = React.useState<SortingState>([{ id: "memUsed", desc: true }]);

  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl("/api/system/stats"));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => {
      const sample = JSON.parse(String(evt.data)) as StatsSample;
      setSamples((prev) => [...prev.slice(-(WINDOW_SIZE - 1)), sample]);
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  const latest = samples.at(-1);

  if (!latest) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for metrics…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = samples.map((s) => ({
    t: s.t,
    cpu: s.host.cpu,
    memMB: Math.round((s.host.memUsed / 1024 / 1024) * 10) / 10,
  }));

  const timeDomain = computeTimeDomain(chartData);
  const formatAxisTick = (t: number) => formatClock(t, timeDomain[1] - timeDomain[0] <= SHORT_WINDOW_MS);
  const memPercent = latest.host.memTotal > 0 ? (latest.host.memUsed / latest.host.memTotal) * 100 : 0;
  const diskPercent = latest.host.diskTotal > 0 ? (latest.host.diskUsed / latest.host.diskTotal) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <UsageCard title="Host CPU" percent={latest.host.cpu} detail={`${latest.host.cpu.toFixed(1)}%`} />
        <UsageCard title="Memory" percent={memPercent} detail={`${formatBytes(latest.host.memUsed)} / ${formatBytes(latest.host.memTotal)}`} />
        <UsageCard title="Disk" percent={diskPercent} detail={`${formatBytes(latest.host.diskUsed)} / ${formatBytes(latest.host.diskTotal)}`} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">CPU over time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={cpuConfig} className="aspect-auto h-32 w-full">
              <AreaChart data={chartData} margin={{ left: 4, right: 4 }}>
                <defs>
                  <linearGradient id="fillHostCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-cpu)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-cpu)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatAxisTick} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis width={44} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} unit="%" />
                <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent formatter={tooltipRow("CPU", (v) => `${v}%`)} />} />
                <Area dataKey="cpu" name="cpu" type="monotone" fill="url(#fillHostCpu)" stroke="var(--color-cpu)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">Memory over time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={memConfig} className="aspect-auto h-32 w-full">
              <AreaChart data={chartData} margin={{ left: 4, right: 4 }}>
                <defs>
                  <linearGradient id="fillHostMem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-mem)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-mem)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatAxisTick} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis width={48} tickLine={false} axisLine={false} tickFormatter={formatMB} />
                <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent formatter={tooltipRow("Memory", (v) => formatMB(Number(v)))} />} />
                <Area dataKey="memMB" name="mem" type="monotone" fill="url(#fillHostMem)" stroke="var(--color-mem)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ChartContainer>
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
              data={latest.infra}
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
        <h2 className="font-heading text-sm font-medium">Applications</h2>
        <Card className="mt-3">
          <CardContent className="px-0">
            <DataTable columns={appColumns} data={latest.apps} getRowId={(app) => app.id} sorting={appSorting} onSortingChange={setAppSorting} fixedLayout />
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
