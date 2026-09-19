import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, type ApiExposedPort } from "@/lib/api";

const columnHelper = createColumnHelper<ApiExposedPort>();
const columns = [
  columnHelper.accessor((row) => `${row.port}/${row.protocol}`, { id: "port", header: "Port", meta: { className: "font-mono" } }),
  columnHelper.accessor("service", { header: "Service" }),
  columnHelper.accessor("source", {
    header: "Source",
    cell: (info) => <Badge variant="outline">{info.getValue() === "docker" ? "Docker" : "Host"}</Badge>,
    meta: { headerClassName: "text-right", className: "text-right" },
  }),
];

export function ExposedPortsCard() {
  return (
    <QueryProvider>
      <ExposedPortsCardInner />
    </QueryProvider>
  );
}

function ExposedPortsCardInner() {
  const ports = useQuery({ queryKey: ["exposed-ports"], queryFn: api.listExposedPorts, refetchInterval: 15_000 });

  if (ports.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Exposed ports</h2>
          <p className="text-xs text-muted-foreground">Ports listening on this server, read live. The firewall isn't inspected.</p>
        </div>

        <DataTable columns={columns} data={ports.data?.ports ?? []} getRowId={(r) => `${r.port}/${r.protocol}`} />
      </CardContent>
    </Card>
  );
}
