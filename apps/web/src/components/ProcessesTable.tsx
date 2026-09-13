import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiWsUrl } from "@/lib/api-url";

interface ProcessSample {
  pid: number;
  command: string;
  cpu: number;
  memUsed: number;
}

interface ProcessesMessage {
  t: number;
  processes: ProcessSample[];
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

type SortKey = "pid" | "command" | "cpu" | "memUsed";

const columns: Array<{ key: SortKey; label: string; className: string }> = [
  { key: "pid", label: "PID", className: "w-16" },
  { key: "command", label: "Command", className: "" },
  { key: "cpu", label: "CPU", className: "w-20" },
  { key: "memUsed", label: "Memory", className: "w-24" },
];

// Client island, kept separate from SystemPage: it needs its own live-WebSocket tick (same pattern as
// SystemPage's stats socket), but only ever cares about the latest sample — folding hundreds of processes
// into SystemPage's rolling chart-history buffer would bloat it for no benefit.
export function ProcessesTable() {
  const [message, setMessage] = React.useState<ProcessesMessage | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("cpu");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl("/api/system/processes"));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => setMessage(JSON.parse(String(evt.data)) as ProcessesMessage);
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (!message) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for processes…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...message.processes].sort((a, b) => {
    const cmp = sortKey === "command" ? a.command.localeCompare(b.command) : a[sortKey] - b[sortKey];
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <Card>
      <CardContent className="max-h-[32rem] overflow-y-auto px-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="[&_th]:sticky [&_th]:top-0 [&_th]:bg-card">
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  <button type="button" onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-foreground">
                    {col.label}
                    {sortKey === col.key && <span className="text-[10px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-xs text-muted-foreground">
                  No process data — is /host/proc mounted?
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((p) => (
                <TableRow key={p.pid}>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">{p.pid}</TableCell>
                  <TableCell className="truncate font-mono text-xs" title={p.command}>
                    {p.command}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{p.cpu.toFixed(1)}%</TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">{formatBytes(p.memUsed)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
