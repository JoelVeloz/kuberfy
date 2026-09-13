import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { DeploymentLogDialog } from "@/components/DeploymentLogDialog";
import type { ApiDeployment } from "@/lib/api";

// Client island: fed real deployments fetched by the parent (ApplicationDetail), most recent first
export function DeploymentsPanel({ deployments }: { deployments: ApiDeployment[] }) {
  if (deployments.length === 0) return <p className="px-1 py-6 text-xs text-muted-foreground">No deployments yet.</p>;

  return (
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
        {deployments.map((deployment) => (
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
              <DeploymentLogDialog logs={deployment.logs} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
