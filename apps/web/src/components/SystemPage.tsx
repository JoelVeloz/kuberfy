import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UsageAreaChart } from "@/components/UsageAreaChart";
import { useSystemStats } from "@/lib/use-system-stats";
import { SHORT_WINDOW_MS, computeTimeDomain, formatClock, niceCeil } from "@/lib/chart-time";
import { formatBytes, formatMB } from "@/lib/format-bytes";

// Green under 75%, amber up to 90%, red above — the visual answer to "did this hit its max?"
// Targets the Progress indicator (its only child div) since the component only exposes one fixed fill color.
function levelColor(percent: number) {
  if (percent >= 90) return "[&>div]:bg-destructive";
  if (percent >= 75) return "[&>div]:bg-chart-4";
  return "";
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

// Client island: the host's own resource usage (not any one application's) — CPU, RAM, disk, plus how they trend
// over the last hour. Same live-WebSocket pattern as ApplicationStatsChart.
export function SystemPage() {
  const { host, hostHistory, connected } = useSystemStats();

  if (!host) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for metrics…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  const timeDomain = computeTimeDomain(hostHistory);
  const formatAxisTick = (t: number) => formatClock(t, timeDomain[1] - timeDomain[0] <= SHORT_WINDOW_MS);
  const memPercent = host.memTotal > 0 ? (host.memUsed / host.memTotal) * 100 : 0;
  const diskPercent = host.diskTotal > 0 ? (host.diskUsed / host.diskTotal) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <UsageCard title="Host CPU" percent={host.cpu} detail={`${host.cpu.toFixed(1)}% · ${((host.cpu / 100) * host.cpuCount).toFixed(2)} / ${host.cpuCount} cores`} />
        <UsageCard title="Memory" percent={memPercent} detail={`${formatBytes(host.memUsed)} / ${formatBytes(host.memTotal)}`} />
        <UsageCard title="Disk" percent={diskPercent} detail={`${formatBytes(host.diskUsed)} / ${formatBytes(host.diskTotal)}`} />
      </div>

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
    </div>
  );
}
