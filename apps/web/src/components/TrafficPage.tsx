import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { apiUrl, apiWsUrl } from "@/lib/api-url";

interface TrafficEvent {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
  service: string | null;
  clientIp: string | null;
}

function statusColor(status: number) {
  if (status >= 500) return "text-destructive";
  if (status >= 400) return "text-amber-600 dark:text-amber-500";
  if (status >= 200) return "text-success";
  return "text-muted-foreground";
}

type StatusClass = "good" | "warning" | "critical";
function statusClass(status: number): StatusClass {
  if (status >= 500) return "critical";
  if (status >= 400) return "warning";
  return "good";
}

const chartConfig = {
  good: { label: "2xx/3xx", color: "var(--color-success)" },
  warning: { label: "4xx", color: "var(--color-amber-500)" },
  critical: { label: "5xx", color: "var(--color-destructive)" },
} satisfies ChartConfig;

const MAX_TABLE_ROWS = 200;

const RANGES = {
  "1h": { label: "Last hour", ms: 60 * 60_000, bucketMs: 60_000, buckets: 60 },
  "24h": { label: "Last 24 hours", ms: 24 * 60 * 60_000, bucketMs: 60 * 60_000, buckets: 24 },
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000, buckets: 7 },
  "30d": { label: "Last 30 days", ms: 30 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000, buckets: 30 },
} as const;
type Range = keyof typeof RANGES;

function useBuckets(events: TrafficEvent[], range: Range) {
  const { ms, bucketMs, buckets: count } = RANGES[range];
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return React.useMemo(() => {
    const windowStart = Math.floor((now - ms) / bucketMs) * bucketMs;
    const buckets = Array.from({ length: count }, (_, i) => ({ bucketStart: windowStart + i * bucketMs, good: 0, warning: 0, critical: 0 }));
    for (const e of events) {
      const t = new Date(e.time).getTime();
      const idx = Math.floor((t - windowStart) / bucketMs);
      if (idx < 0 || idx >= count) continue;
      buckets[idx]![statusClass(e.status)]++;
    }
    return buckets;
  }, [events, now, ms, bucketMs, count]);
}

function TrafficChart({ buckets, range }: { buckets: Array<{ bucketStart: number; good: number; warning: number; critical: number }>; range: Range }) {
  const dayGranularity = RANGES[range].bucketMs >= 24 * 60 * 60_000;
  const formatLabel = (t: number) =>
    dayGranularity
      ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })
      : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <BarChart data={buckets} barCategoryGap={4}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucketStart" tickFormatter={formatLabel} tickLine={false} axisLine={false} tickMargin={8} interval={0} angle={-45} textAnchor="end" height={50} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => formatLabel(Number(payload[0]?.payload.bucketStart ?? 0))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="good" stackId="status" fill="var(--color-good)" radius={4} maxBarSize={24} />
        <Bar dataKey="warning" stackId="status" fill="var(--color-warning)" radius={4} maxBarSize={24} />
        <Bar dataKey="critical" stackId="status" fill="var(--color-critical)" radius={4} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}

export function TrafficPage() {
  const [events, setEvents] = React.useState<TrafficEvent[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hostFilter, setHostFilter] = React.useState("all");
  const [range, setRange] = React.useState<Range>("24h");
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<TrafficEvent | null>(null);

  React.useEffect(() => {
    setHistoryLoading(true);
    fetch(apiUrl(`/api/observability/traffic/history?range=${range}`), { credentials: "include" })
      .then((res) => res.json())
      .then((data: { events: TrafficEvent[] }) => setEvents([...data.events].reverse()))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [range]);

  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl("/api/observability/traffic"));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => {
      const data = JSON.parse(String(evt.data)) as TrafficEvent | { error: string };
      if ("error" in data) {
        setError(data.error);
        return;
      }
      setEvents((prev) => [data, ...prev].slice(0, 5000));
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  const hosts = React.useMemo(() => Array.from(new Set(events.map((e) => e.host))).sort(), [events]);
  const filtered = hostFilter === "all" ? events : events.filter((e) => e.host === hostFilter);
  const buckets = useBuckets(filtered, range);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            aria-label="Time range"
          >
            {Object.entries(RANGES).map(([key, r]) => (
              <option key={key} value={key}>
                {r.label}
              </option>
            ))}
          </select>
          {hosts.length > 0 && (
            <select
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              aria-label="Filter by domain"
            >
              <option value="all">All domains</option>
              {hosts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/40"}`} />
          {connected ? "Streaming live" : "Connecting…"}
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {events.length === 0 && !error && !historyLoading && (
        <p className="text-xs text-muted-foreground">No requests in this range yet — traffic to any deployed app's domain will show up here.</p>
      )}

      {(events.length > 0 || historyLoading) && !error && (
        <>
          <div className="mb-6 rounded-md border border-border p-3">
            <TrafficChart buckets={buckets} range={range} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Client IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, MAX_TABLE_ROWS).map((e, i) => (
                <TableRow key={i} className="cursor-pointer" onClick={() => setSelected(e)}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(e.time).toLocaleTimeString()}</TableCell>
                  <TableCell className="font-mono">{e.method}</TableCell>
                  <TableCell className="max-w-48 truncate font-mono">{e.host}</TableCell>
                  <TableCell className="max-w-64 truncate font-mono">{e.path}</TableCell>
                  <TableCell className={`font-mono ${statusColor(e.status)}`}>{e.status}</TableCell>
                  <TableCell className="text-muted-foreground">{e.durationMs}ms</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{e.clientIp ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="gap-0 p-0">
          {selected && (
            <>
              <SheetTitle className="border-b border-border px-3 py-2">Request</SheetTitle>
              <dl className="text-xs">
                {(
                  [
                    ["Time", new Date(selected.time).toLocaleString()],
                    ["Method", selected.method],
                    ["Host", selected.host],
                    ["Path", selected.path],
                    ["Status", String(selected.status)],
                    ["Duration", `${selected.durationMs}ms`],
                    ["Service", selected.service ?? "—"],
                    ["Client IP", selected.clientIp ?? "—"],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={`min-w-0 break-all text-right font-mono ${label === "Status" ? statusColor(selected.status) : "text-foreground"}`}>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
