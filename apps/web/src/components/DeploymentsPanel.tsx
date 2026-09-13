import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Deployment, DeploymentStatus } from "@/lib/types";
import { allDeploymentStatuses, deploymentStatusLabel, deploymentStatusVariant } from "@/lib/deployment-status";

// Client island: only the status filter is interactive; deployments arrive as static, pre-rendered data.
export function DeploymentsPanel({ deployments }: { deployments: Deployment[] }) {
  const [filter, setFilter] = React.useState<DeploymentStatus | "all">("all");

  const visible = filter === "all" ? deployments : deployments.filter((d) => d.status === filter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>
          All
        </Button>
        {allDeploymentStatuses.map((status) => (
          <Button key={status} size="xs" variant={filter === status ? "secondary" : "ghost"} onClick={() => setFilter(status)}>
            {deploymentStatusLabel[status]}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-xs text-muted-foreground">No deployments match this filter.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((deployment) => (
              <TableRow key={deployment.id}>
                <TableCell>
                  <Badge variant={deploymentStatusVariant[deployment.status]}>{deploymentStatusLabel[deployment.status]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">{deployment.commitSha}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(deployment.createdAt).toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
