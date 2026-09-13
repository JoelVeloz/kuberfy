import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import type { DeploymentStatus } from "@/lib/types";
import { apiWsUrl } from "@/lib/api-url";

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

const MIN_WINDOW_MS = 60 * 1000;
const formatClock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
// Grows from the oldest sample actually held (never further back than a real timestamp) up to `now`, so a chart
// with only a few seconds of data shows a tight, honest window instead of empty space reserved for a full hour.
// Once the buffer fills (WINDOW_SIZE, ~1h of samples) the oldest end naturally slides forward tick by tick.
function computeTimeDomain(data: Array<{ t: number }>): [number, number] {
  const domainMax = data.at(-1)?.t ?? Date.now();
  const domainMin = Math.min(data[0]?.t ?? domainMax, domainMax - MIN_WINDOW_MS);
  return [domainMin, domainMax];
}
// ChartTooltipContent resolves its header label by looking up `config[dataKey]` and only calls labelFormatter with
// that (a string, or undefined when the key doesn't match, e.g. dataKey "memMB" vs config key "mem") — never the
// raw x-value. Reading the timestamp straight off the hovered point's payload sidesteps that lookup entirely.
const formatTooltipLabel = (_value: unknown, payload: unknown) => {
  const point = (payload as Array<{ payload?: { t?: number } }> | undefined)?.[0]?.payload;
  return point?.t ? formatClock(point.t) : "";
};

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

// Client island: the host's own resource usage (not any one application's) — CPU, RAM, disk, plus every
// application's current footprint in one table. Same live-WebSocket pattern as ApplicationStatsChart.
export function SystemPage() {
  const [samples, setSamples] = React.useState<StatsSample[]>([]);
  const [connected, setConnected] = React.useState(false);

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
                <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatClock} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis width={44} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} unit="%" />
                <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent indicator="line" />} />
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
                <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatClock} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis width={48} tickLine={false} axisLine={false} tickFormatter={formatMB} />
                <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent indicator="line" />} />
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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-2/5">Name</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20">CPU</TableHead>
                  <TableHead>Memory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.infra.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-xs text-muted-foreground">
                      No infrastructure containers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...latest.infra]
                    .sort((a, b) => b.memUsed - a.memUsed)
                    .map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="truncate font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="success">Running</Badge>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">{c.cpu.toFixed(1)}%</TableCell>
                        <TableCell>
                          <MemoryCell memUsed={c.memUsed} memLimit={c.memLimit} />
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="font-heading text-sm font-medium">Applications</h2>
        <Card className="mt-3">
          <CardContent className="px-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-2/5">Name</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20">CPU</TableHead>
                  <TableHead>Memory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...latest.apps]
                  .sort((a, b) => b.memUsed - a.memUsed)
                  .map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="truncate">
                        <a href={`/applications/view?id=${app.id}`} className="font-medium hover:underline">
                          {app.name}
                        </a>
                      </TableCell>
                      <TableCell>
                        {app.status ? <DeploymentStatusBadge status={app.status} /> : <span className="text-xs text-muted-foreground">No deployments</span>}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{app.status === "running" ? `${app.cpu.toFixed(1)}%` : "—"}</TableCell>
                      <TableCell>
                        {app.status === "running" ? <MemoryCell memUsed={app.memUsed} memLimit={app.memLimit} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
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
