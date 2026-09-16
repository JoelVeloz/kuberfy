import * as React from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DataTable } from "@/components/ui/data-table";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { deploymentStatusLabel, deploymentStatusVariant } from "@/lib/deployment-status";
import type { DeploymentStatus } from "@/lib/types";
import { useSystemStats, type AppRow, type InfraRow } from "@/lib/use-system-stats";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { formatBytes } from "@/lib/format-bytes";

const statusOrder: DeploymentStatus[] = ["failed", "building", "pending", "running", "stopped"];

function Pending() {
  return <span className="text-muted-foreground">…</span>;
}

function sumUsage(rows: Iterable<{ cpu?: number; memUsed?: number }>) {
  let cpuCores = 0;
  let memUsedBytes = 0;
  for (const row of rows) {
    cpuCores += (row.cpu ?? 0) / 100;
    memUsedBytes += row.memUsed ?? 0;
  }
  return { cpuCores, memUsedBytes };
}

function estimateRemainingCapacity(
  host: { cpuCount: number; cpu: number; memTotal: number; memUsed: number },
  appsUsage: { cpuCores: number; memUsedBytes: number },
  runningCount: number,
): number | null {
  if (runningCount === 0) return null;
  const avgCpu = appsUsage.cpuCores / runningCount;
  const avgMem = appsUsage.memUsedBytes / runningCount;
  if (avgMem <= 0) return null;
  const freeCpu = host.cpuCount - (host.cpu / 100) * host.cpuCount;
  const freeMem = host.memTotal - host.memUsed;
  const estimate = Math.min(avgCpu > 0 ? freeCpu / avgCpu : Infinity, freeMem / avgMem);
  return Number.isFinite(estimate) ? Math.max(0, Math.floor(estimate)) : null;
}

// Green under 75%, amber up to 90%, red above — the visual answer to "did this hit its max?"
// Targets the Progress indicator (its only child div) since the component only exposes one fixed fill color.
function levelColor(percent: number) {
  if (percent >= 90) return "[&>div]:bg-destructive";
  if (percent >= 75) return "[&>div]:bg-chart-4";
  return "";
}

function MemoryCell({ memUsed, memLimit }: { memUsed?: number; memLimit?: number }) {
  if (memUsed === undefined || memLimit === undefined) return <Pending />;
  const percent = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={percent} className={`w-24 ${levelColor(percent)}`} />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatBytes(memUsed)} / {formatBytes(memLimit)}
      </span>
    </div>
  );
}

function CpuCell({ cpu, cpuLimit }: { cpu?: number; cpuLimit?: number }) {
  if (cpu === undefined || cpuLimit === undefined) return <Pending />;
  const cores = cpu / 100;
  const percent = cpuLimit > 0 ? (cores / cpuLimit) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={Math.min(100, percent)} className={`w-24 ${levelColor(percent)}`} />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {cores.toFixed(2)} / {cpuLimit} cores
      </span>
    </div>
  );
}

function formatUptime(startedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function StartedCell({ startedAt }: { startedAt?: number }) {
  if (startedAt === undefined) return <Pending />;
  return <span className="text-xs text-muted-foreground">{new Date(startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>;
}

function UptimeCell({ startedAt }: { startedAt?: number }) {
  if (startedAt === undefined) return <Pending />;
  return <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatUptime(startedAt)}</span>;
}

function InfraRestartAction({ id, name }: { id: string; name: string }) {
  const [restarting, setRestarting] = React.useState(false);

  async function restart() {
    setRestarting(true);
    try {
      await api.restartInfraContainer(id);
      toast.success(`${name} restarted.`);
    } catch (err) {
      toastError(err, `Failed to restart ${name}.`);
    } finally {
      setRestarting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={restarting}>
          <ArrowClockwise /> {restarting ? "Restarting…" : "Restart"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restart {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {name === "Traefik"
              ? "Traefik routes every request to Kuberfy and to every deployed app. Restarting it drops in-flight connections for a few seconds."
              : "Restarts Kuberfy's own service. The dashboard briefly disconnects and reconnects on its own; deployed apps keep running."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={restart}>Restart</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const infraColumnHelper = createColumnHelper<InfraRow>();
const infraColumns = [
  infraColumnHelper.accessor("name", { header: "Name", meta: { headerClassName: "w-2/5" }, cell: (info) => <span className="truncate font-medium">{info.getValue()}</span> }),
  infraColumnHelper.display({ id: "status", header: "Status", meta: { headerClassName: "w-28" }, cell: () => <Badge variant="success">Running</Badge> }),
  infraColumnHelper.accessor("cpu", {
    header: "CPU",
    cell: (info) => <CpuCell cpu={info.getValue()} cpuLimit={info.row.original.cpuLimit} />,
  }),
  infraColumnHelper.accessor("memUsed", {
    header: "Memory",
    cell: (info) => <MemoryCell memUsed={info.getValue()} memLimit={info.row.original.memLimit} />,
  }),
  infraColumnHelper.accessor("startedAt", {
    id: "started",
    header: "Started",
    cell: (info) => <StartedCell startedAt={info.getValue()} />,
  }),
  infraColumnHelper.accessor("startedAt", {
    id: "uptime",
    header: "Uptime",
    cell: (info) => <UptimeCell startedAt={info.getValue()} />,
  }),
  infraColumnHelper.display({
    id: "actions",
    header: "",
    meta: { headerClassName: "w-28" },
    cell: (info) => <InfraRestartAction id={info.row.original.id} name={info.row.original.name} />,
  }),
];

const appColumnHelper = createColumnHelper<AppRow>();
const appColumns = [
  appColumnHelper.accessor("name", {
    header: "Name",
    meta: { headerClassName: "w-2/5" },
    cell: (info) => (
      <a href={`/applications/view?id=${info.row.original.id}`} className="block truncate hover:underline">
        <span className="text-muted-foreground">{info.row.original.projectName} / </span>
        <span className="font-medium">{info.getValue()}</span>
      </a>
    ),
  }),
  appColumnHelper.accessor("status", {
    header: "Status",
    meta: { headerClassName: "w-28" },
    cell: (info) => (info.getValue() ? <DeploymentStatusBadge status={info.getValue()!} /> : <span className="text-xs text-muted-foreground">No deployments</span>),
  }),
  appColumnHelper.accessor("cpu", {
    header: "CPU",
    cell: (info) =>
      info.row.original.status === "running" ? (
        <CpuCell cpu={info.getValue()} cpuLimit={info.row.original.cpuLimit} />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }),
  appColumnHelper.accessor("memUsed", {
    header: "Memory",
    cell: (info) =>
      info.row.original.status === "running" ? (
        <MemoryCell memUsed={info.getValue()} memLimit={info.row.original.memLimit} />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }),
  appColumnHelper.accessor("startedAt", {
    id: "started",
    header: "Started",
    cell: (info) =>
      info.row.original.status === "running" ? <StartedCell startedAt={info.getValue()} /> : <span className="text-xs text-muted-foreground">—</span>,
  }),
  appColumnHelper.accessor("startedAt", {
    id: "uptime",
    header: "Uptime",
    cell: (info) =>
      info.row.original.status === "running" ? <UptimeCell startedAt={info.getValue()} /> : <span className="text-xs text-muted-foreground">—</span>,
  }),
];

// Client island: every Docker container on the host — Kuberfy's own (Infrastructure) and everything deployed
// on it (Applications) — sharing the same live feed the Overview tab charts.
export function ContainersTable() {
  const { host, apps, infra, connected } = useSystemStats();
  const [infraSorting, setInfraSorting] = React.useState<SortingState>([{ id: "memUsed", desc: true }]);
  const [appSorting, setAppSorting] = React.useState<SortingState>([{ id: "memUsed", desc: true }]);

  if (!host) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for metrics…" : "Connecting…"}</p>
        </CardContent>
      </Card>
    );
  }

  const statusCounts = Array.from(apps.values()).reduce<Partial<Record<DeploymentStatus, number>>>((acc, app) => {
    if (app.status) acc[app.status] = (acc[app.status] ?? 0) + 1;
    return acc;
  }, {});

  const infraUsage = sumUsage(infra.values());
  const appsUsage = sumUsage(apps.values());
  const runningAppCount = statusCounts.running ?? 0;
  const estimatedCapacity = estimateRemainingCapacity(host, appsUsage, runningAppCount);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Infrastructure</h2>
          <span className="text-xs text-muted-foreground">
            {infra.size} total · {infraUsage.cpuCores.toFixed(2)} cores · {formatBytes(infraUsage.memUsedBytes)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Kuberfy's own containers, not anything deployed on it.</p>
        <Card className="mt-3">
          <CardContent className="px-0">
            <DataTable
              columns={infraColumns}
              data={Array.from(infra.values(), (row) => ({ ...row, cpuLimit: host.cpuCount }))}
              getRowId={(c) => c.id}
              sorting={infraSorting}
              onSortingChange={setInfraSorting}
              fixedLayout
              emptyMessage="No infrastructure containers found."
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Applications</h2>
          <span className="text-xs text-muted-foreground">
            {apps.size} total · {appsUsage.cpuCores.toFixed(2)} cores · {formatBytes(appsUsage.memUsedBytes)}
          </span>
          {statusOrder
            .filter((status) => statusCounts[status])
            .map((status) => (
              <Badge key={status} variant={deploymentStatusVariant[status]}>
                {statusCounts[status]} {deploymentStatusLabel[status]}
              </Badge>
            ))}
        </div>
        {estimatedCapacity !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            Estimated room for ~{estimatedCapacity} more app{estimatedCapacity === 1 ? "" : "s"} at current average usage.
          </p>
        )}
        <Card className="mt-3">
          <CardContent className="px-0">
            <DataTable columns={appColumns} data={Array.from(apps.values())} getRowId={(app) => app.id} sorting={appSorting} onSortingChange={setAppSorting} fixedLayout />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
