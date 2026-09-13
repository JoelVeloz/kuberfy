import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { api } from "@/lib/api";

const PAGE_SIZE = 20;

// Client island: full deployment history for an application, fetched and paginated on its own — the application
// detail fetch only ever carries the latest deployment, not the whole history.
export function DeploymentsPanel({ applicationId }: { applicationId: string }) {
  const [page, setPage] = React.useState(1);
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Log</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((deployment) => (
            <TableRow key={deployment.id}>
              <TableCell>
                <DeploymentStatusBadge status={deployment.status} />
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">{deployment.commitSha ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(deployment.createdAt).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}
              </TableCell>
              <TableCell className="text-right">
                <a href={`/applications/deployment?id=${applicationId}&deploymentId=${deployment.id}`} className={buttonVariants({ size: "xs", variant: "ghost" })}>
                  View log
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
    </div>
  );
}
