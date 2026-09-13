import * as React from "react";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
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

const columnHelper = createColumnHelper<ProcessSample>();
const columns = [
  columnHelper.accessor("pid", { header: "PID", size: 64, cell: (info) => <span className="font-mono tabular-nums text-muted-foreground">{info.getValue()}</span> }),
  columnHelper.accessor("command", {
    header: "Command",
    cell: (info) => (
      <span className="block truncate font-mono text-xs" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("cpu", { header: "CPU", size: 80, cell: (info) => <span className="font-mono tabular-nums">{info.getValue().toFixed(1)}%</span> }),
  columnHelper.accessor("memUsed", {
    header: "Memory",
    size: 96,
    cell: (info) => <span className="font-mono tabular-nums text-muted-foreground">{formatBytes(info.getValue())}</span>,
  }),
];

// Client island, kept separate from SystemPage: it needs its own live-WebSocket tick (same pattern as
// SystemPage's stats socket), but only ever cares about the latest sample — folding hundreds of processes
// into SystemPage's rolling chart-history buffer would bloat it for no benefit.
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

  const table = useReactTable({
    data: message?.processes ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!message) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for processes…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  const rows = table.getRowModel().rows;

  return (
    <Card>
      <CardContent className="max-h-[32rem] overflow-y-auto px-0">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="[&_th]:sticky [&_th]:top-0 [&_th]:bg-card">
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} style={{ width: header.getSize() }}>
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={`flex cursor-pointer items-center gap-1 hover:text-foreground ${sortDir ? "text-foreground" : ""}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDir === "desc" ? (
                          <CaretDown weight="bold" />
                        ) : sortDir === "asc" ? (
                          <CaretUp weight="bold" />
                        ) : (
                          <CaretUpDown className="text-muted-foreground/50" />
                        )}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-xs text-muted-foreground">
                  No process data — is /host/proc mounted?
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
