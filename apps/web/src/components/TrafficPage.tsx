import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TablePagination } from "@/components/ui/table-pagination";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { QueryProvider } from "@/components/QueryProvider";
import { api, type ApiTrafficEvent } from "@/lib/api";
import { apiWsUrl } from "@/lib/api-url";

function statusColor(status: number) {
  if (status >= 500) return "text-destructive";
  if (status >= 400) return "text-amber-600 dark:text-amber-500";
  if (status >= 200) return "text-success";
  return "text-muted-foreground";
}

function formatSize(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const chartConfig = {
  good: { label: "2xx/3xx", color: "var(--color-success)" },
  warning: { label: "4xx", color: "var(--color-amber-500)" },
  critical: { label: "5xx", color: "var(--color-destructive)" },
} satisfies ChartConfig;

const PAGE_SIZE = 20;

const RANGES = {
  "1h": { label: "Last hour" },
  "24h": { label: "Last 24 hours" },
  "7d": { label: "Last 7 days" },
  "30d": { label: "Last 30 days" },
} as const;
type Range = keyof typeof RANGES;

function TrafficChart({ counts, range }: { counts: Array<{ bucketStart: number; good: number; warning: number; critical: number }>; range: Range }) {
  const dayGranularity = range === "7d" || range === "30d";
  const formatLabel = (t: number) =>
    dayGranularity
      ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })
      : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <BarChart data={counts} barCategoryGap={4}>
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

function TrafficPageInner() {
  const [hostFilter, setHostFilter] = React.useState("all");
  const [range, setRange] = React.useState<Range>("1h");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<ApiTrafficEvent | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [wsError, setWsError] = React.useState<string | null>(null);

  // Reset to page 1 (the live view) whenever the filters change — an old page number from a different
  // range/host wouldn't mean anything under the new one.
  React.useEffect(() => setPage(1), [range, hostFilter]);

  const summary = useQuery({
    queryKey: ["traffic-summary", range, hostFilter],
    queryFn: () => api.getTrafficSummary(range, hostFilter),
    refetchInterval: 30_000,
  });

  const hostsQuery = useQuery({ queryKey: ["traffic-hosts", range], queryFn: () => api.getTrafficHosts(range) });

  const eventsQuery = useQuery({
    queryKey: ["traffic-events", range, hostFilter, page],
    queryFn: () => api.listTrafficEvents(range, hostFilter, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  // Live tail: page 1 is "now", so a fresh request there should show up without waiting for the next poll —
  // debounced so a burst of requests triggers one refetch, not one per request. The socket connects once and
  // stays open across filter changes, so it reads these through refs rather than closing over stale query
  // objects from whichever render happened to be active when it opened.
  const pageRef = React.useRef(page);
  pageRef.current = page;
  const eventsRefetchRef = React.useRef(eventsQuery.refetch);
  eventsRefetchRef.current = eventsQuery.refetch;
  const summaryRefetchRef = React.useRef(summary.refetch);
  summaryRefetchRef.current = summary.refetch;
  const refetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl("/api/observability/traffic"));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => {
      const data = JSON.parse(String(evt.data)) as ApiTrafficEvent | { error: string };
      if ("error" in data) {
        setWsError(data.error);
        return;
      }
      if (pageRef.current !== 1 || refetchTimer.current) return;
      refetchTimer.current = setTimeout(() => {
        refetchTimer.current = null;
        eventsRefetchRef.current();
        summaryRefetchRef.current();
      }, 1500);
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  const hosts = hostsQuery.data?.hosts ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const loading = eventsQuery.isPending;

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
          {connected ? (page === 1 ? "Streaming live" : "Live (paused while browsing)") : "Connecting…"}
        </div>
      </div>

      {wsError && <p className="mb-3 text-xs text-destructive">{wsError}</p>}

      {!loading && total === 0 && !wsError && (
        <p className="text-xs text-muted-foreground">No requests in this range yet — traffic to any deployed app's domain will show up here.</p>
      )}

      {(total > 0 || loading) && !wsError && (
        <>
          <div className="mb-6 rounded-md border border-border p-3">
            <TrafficChart counts={summary.data?.counts ?? []} range={range} />
          </div>
          <div className="rounded-md border border-border">
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
                {(eventsQuery.data?.items ?? []).map((e, i) => (
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
            <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
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
                    ["User Agent", selected.userAgent ?? "—"],
                    ["Protocol", selected.protocol ?? "—"],
                    ["Origin Status", selected.originStatus !== null ? String(selected.originStatus) : "—"],
                    ["Request Size", formatSize(selected.requestContentSize)],
                    ["Response Size", formatSize(selected.downstreamContentSize)],
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

// Client island: real-time traffic view — a live tail on page 1 (short-debounced refetch on new requests), a
// paginated browse of history on any other page. Same {page, pageSize, total} pagination contract as every
// other table in the app.
export function TrafficPage() {
  return (
    <QueryProvider>
      <TrafficPageInner />
    </QueryProvider>
  );
}
