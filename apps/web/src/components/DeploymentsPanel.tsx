import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { api, type ApiDeployment } from "@/lib/api";

const PAGE_SIZE = 20;

const columnHelper = createColumnHelper<ApiDeployment>();

function useColumns(applicationId: string) {
  return React.useMemo(
    () => [
      columnHelper.accessor("status", { header: "Status", cell: (info) => <DeploymentStatusBadge status={info.getValue()} /> }),
      columnHelper.accessor("commitSha", { header: "Commit", meta: { className: "font-mono text-muted-foreground" }, cell: (info) => info.getValue() ?? "—" }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        meta: { className: "text-muted-foreground" },
        cell: (info) =>
          new Date(info.getValue()).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      }),
      columnHelper.display({
        id: "log",
        header: () => <span className="block text-right">Log</span>,
        meta: { className: "text-right" },
        cell: (info) => (
          <a href={`/applications/deployment?id=${applicationId}&deploymentId=${info.row.original.id}`} className={buttonVariants({ size: "xs", variant: "ghost" })}>
            View log
          </a>
        ),
      }),
    ],
    [applicationId],
  );
}

// Client island: full deployment history for an application, fetched and paginated on its own — the application
// detail fetch only ever carries the latest deployment, not the whole history.
export function DeploymentsPanel({ applicationId }: { applicationId: string }) {
  const [page, setPage] = React.useState(1);
  const columns = useColumns(applicationId);
  const { data, isPending, error } = useQuery({
    queryKey: ["deployments", applicationId, page],
    queryFn: () => api.listDeployments(applicationId, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (error) return <p className="px-1 py-6 text-xs text-destructive">Failed to load deployments.</p>;
  if (data.items.length === 0) return <p className="px-1 py-6 text-xs text-muted-foreground">No deployments yet.</p>;

  return (
    <div>
      <DataTable columns={columns} data={data.items} getRowId={(d) => d.id} />
      <TablePagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
    </div>
  );
}
