import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsageAreaChart } from "@/components/UsageAreaChart";
import { apiWsUrl } from "@/lib/api-url";
import { SHORT_WINDOW_MS, computeTimeDomain, formatClock, niceCeil } from "@/lib/chart-time";
import { formatBytes, formatMB } from "@/lib/format-bytes";

interface StatsSample {
  t: number;
  cpu: number;
  memUsed: number;
  memLimit: number;
}

// Docker's stats stream ticks ~1/s, so 3600 samples covers the last hour — no range picker, just a simple rolling window.
const WINDOW_SIZE = 3600;

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
          <UsageAreaChart
            metric="cpu"
            data={data}
            dataKey="cpu"
            timeDomain={timeDomain}
            formatAxisTick={formatAxisTick}
            yAxisWidth={44}
            yDomain={[0, cpuLimit * 100]}
            unit="%"
            tooltipLabel="CPU"
            formatTooltipValue={(v) => `${v}%`}
          />
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
          <UsageAreaChart
            metric="mem"
            data={data}
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
  );
}
