import * as React from "react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { apiWsUrl } from "@/lib/api-url";

interface ProcessSample {
  pid: number;
  command: string;
  cpu: number;
  memUsed: number;
}

interface ProcessesMessage {
  t: number;
  cpuCount: number;
  processes: ProcessSample[];
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

const columnHelper = createColumnHelper<ProcessSample>();
const columns = [
  columnHelper.accessor("pid", {
    header: "PID",
    meta: { headerClassName: "w-16" },
    cell: (info) => <span className="font-mono tabular-nums text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("command", {
    header: "Command",
    cell: (info) => (
      <span className="block truncate font-mono text-xs" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("cpu", {
    header: "CPU",
    meta: { headerClassName: "w-20" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue().toFixed(1)}%</span>,
  }),
  columnHelper.accessor("memUsed", {
    header: "Memory",
    meta: { headerClassName: "w-24" },
    cell: (info) => <span className="font-mono tabular-nums text-muted-foreground">{formatBytes(info.getValue())}</span>,
  }),
];

export function ProcessesTable() {
  const [message, setMessage] = React.useState<ProcessesMessage | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "cpu", desc: true }]);

  React.useEffect(() => {
    const ws = new WebSocket(apiWsUrl("/api/system/processes"));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => setMessage(JSON.parse(String(evt.data)) as ProcessesMessage);
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  if (!message) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for processes…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Every process on the host, CPU per-core (100% = one of {message.cpuCount} cores — a multi-threaded process can read above 100%). Click a column to sort.
      </p>
      <Card>
        <CardContent className="max-h-[32rem] overflow-y-auto px-0">
          <DataTable
            columns={columns}
            data={message.processes}
            getRowId={(p) => String(p.pid)}
            sorting={sorting}
            onSortingChange={setSorting}
            fixedLayout
            stickyHeader
            emptyMessage="No process data. Check that /host/proc is mounted."
          />
        </CardContent>
      </Card>
    </>
  );
}
