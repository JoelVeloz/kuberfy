import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { apiWsUrl } from "@/lib/api-url";
import { SHORT_WINDOW_MS, computeTimeDomain, formatClock, formatTooltipLabel, niceCeil } from "@/lib/chart-time";

interface StatsSample {
  t: number;
  cpu: number;
  memUsed: number;
  memLimit: number;
}

// Docker's stats stream ticks ~1/s, so 3600 samples covers the last hour — no range picker, just a simple rolling window.
const WINDOW_SIZE = 3600;

const cpuConfig = { cpu: { label: "CPU", color: "var(--chart-1)" } } satisfies ChartConfig;
const memConfig = { mem: { label: "Memory", color: "var(--chart-2)" } } satisfies ChartConfig;

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
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

// Client island: opens a WebSocket to the API's dockerode stats stream and keeps a rolling window of
// samples in memory (nothing persisted) — same live-socket pattern as RuntimeLogs, applied to metrics.
export function ApplicationStatsChart({ applicationId, cpuLimit }: { applicationId: string; cpuLimit: number }) {
  const [samples, setSamples] = React.useState<StatsSample[]>([]);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl(`/api/applications/${applicationId}/stats`));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => {
      const sample = JSON.parse(String(evt.data)) as StatsSample;
      setSamples((prev) => [...prev.slice(-(WINDOW_SIZE - 1)), sample]);
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [applicationId]);

  const data = samples.map((s) => ({
    t: s.t,
    cpu: s.cpu,
    memMB: Math.round((s.memUsed / 1024 / 1024) * 10) / 10,
  }));

  const latest = samples.at(-1);
  const timeDomain = computeTimeDomain(data);
  const formatAxisTick = (t: number) => formatClock(t, timeDomain[1] - timeDomain[0] <= SHORT_WINDOW_MS);

  if (samples.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for metrics…" : "No running container to measure yet."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
          <CardTitle className="text-sm font-medium">CPU</CardTitle>
          <span className="font-mono text-lg font-medium tabular-nums">
            {latest!.cpu.toFixed(1)}% <span className="text-xs font-normal text-muted-foreground">/ {cpuLimit === 1 ? "1 core" : `${cpuLimit} cores`}</span>
          </span>
        </CardHeader>
        <CardContent>
          <ChartContainer config={cpuConfig} className="aspect-auto h-32 w-full">
            <AreaChart data={data} margin={{ left: 4, right: 4 }}>
              <defs>
                <linearGradient id="fillCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-cpu)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-cpu)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatAxisTick} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis width={44} tickLine={false} axisLine={false} domain={[0, cpuLimit * 100]} unit="%" />
              <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent formatter={tooltipRow("CPU", (v) => `${v}%`)} />} />
              <Area dataKey="cpu" name="cpu" type="monotone" fill="url(#fillCpu)" stroke="var(--color-cpu)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
          <CardTitle className="text-sm font-medium">Memory</CardTitle>
          <span className="font-mono text-lg font-medium tabular-nums">
            {formatBytes(latest!.memUsed)} {latest!.memLimit > 0 ? <span className="text-xs font-normal text-muted-foreground">/ {formatBytes(latest!.memLimit)}</span> : null}
          </span>
        </CardHeader>
        <CardContent>
          <ChartContainer config={memConfig} className="aspect-auto h-32 w-full">
            <AreaChart data={data} margin={{ left: 4, right: 4 }}>
              <defs>
                <linearGradient id="fillMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-mem)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-mem)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={timeDomain} tickFormatter={formatAxisTick} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis width={48} tickLine={false} axisLine={false} domain={[0, (max: number) => niceCeil(max)]} tickFormatter={formatMB} />
              <ChartTooltip labelFormatter={formatTooltipLabel} content={<ChartTooltipContent formatter={tooltipRow("Memory", (v) => formatMB(Number(v)))} />} />
              <Area dataKey="memMB" name="mem" type="monotone" fill="url(#fillMem)" stroke="var(--color-mem)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
