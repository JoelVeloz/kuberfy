import * as React from "react";
import { Cube, GithubLogo, Play, Stop } from "@phosphor-icons/react";
import { useMutation, useQueryClient, keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { NewApplicationDialog } from "@/components/NewApplicationDialog";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { api, UnauthorizedError, NotFoundError, type ApiApplicationWithStatus, type ApiProject } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { getQueryParam } from "@/lib/query-params";

const PAGE_SIZE = 20;

type AppRow = ApiApplicationWithStatus;

const columnHelper = createColumnHelper<AppRow>();

function buildColumns(selected: Set<string>, onToggle: (id: string) => void) {
  return [
    columnHelper.display({
      id: "select",
      header: "",
      meta: { className: "w-8" },
      cell: (info) => (
        <Checkbox
          checked={selected.has(info.row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => onToggle(info.row.original.id)}
        />
      ),
    }),
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => (
        <a href={`/applications/view?id=${info.row.original.id}`} className="flex items-center gap-2 font-medium after:absolute after:inset-0">
          {info.row.original.buildType === "image" ? (
            <Cube weight="bold" className="size-3.5 shrink-0 text-blue-500" title="Deploys a prebuilt Docker image" />
          ) : (
            <GithubLogo weight="bold" className="size-3.5 shrink-0 text-foreground" title="Builds from a Git repository" />
          )}
          {info.getValue()}
        </a>
      ),
    }),
    columnHelper.accessor("repoUrl", { header: "Repository", meta: { className: "text-muted-foreground" } }),
    columnHelper.accessor("branch", { header: "Branch", meta: { className: "font-mono text-muted-foreground" } }),
    columnHelper.accessor("latestStatus", {
      header: "Latest deployment",
      cell: (info) => (info.getValue() ? <DeploymentStatusBadge status={info.getValue()!} /> : <span className="text-muted-foreground">No deployments</span>),
    }),
  ];
}

function BulkActions({ projectId, selected, onClear }: { projectId: string; selected: Set<string>; onClear: () => void }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["project", projectId, "apps"] });

  const stop = useMutation({
    mutationFn: () => Promise.all([...selected].map((id) => api.stopApplication(id))),
    onSuccess: () => {
      toast.success(`Stopped ${selected.size} ${selected.size === 1 ? "application" : "applications"}.`);
      onClear();
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to stop the selected applications."),
  });

  const redeploy = useMutation({
    mutationFn: () => Promise.all([...selected].map((id) => api.deploy(id))),
    onSuccess: () => {
      toast.success(`Redeployed ${selected.size} ${selected.size === 1 ? "application" : "applications"}.`);
      onClear();
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to redeploy the selected applications."),
  });

  if (selected.size === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{selected.size} selected</span>
      <Button size="sm" variant="outline" disabled={stop.isPending || redeploy.isPending} onClick={() => stop.mutate()}>
        <Stop /> {stop.isPending ? "Stopping…" : "Stop"}
      </Button>
      <Button size="sm" variant="outline" disabled={stop.isPending || redeploy.isPending} onClick={() => redeploy.mutate()}>
        <Play /> {redeploy.isPending ? "Redeploying…" : "Redeploy"}
      </Button>
    </div>
  );
}

async function fetchProject(id: string): Promise<ApiProject> {
  const project = await api.getProject(id);
  document.title = `${project.name} · Kuberfy`;
  return project;
}

async function fetchApps(id: string, page: number): Promise<{ items: AppRow[]; total: number }> {
  return api.listProjectApplications(id, page, PAGE_SIZE);
}

// Client island: the real project id only exists at request time, so it's read from the URL and fetched here
export function ProjectDetail() {
  return (
    <QueryProvider>
      <ProjectDetailInner />
    </QueryProvider>
  );
}

function ProjectDetailInner() {
  const id = getQueryParam("id");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const project = useQuery({ queryKey: ["project", id], queryFn: () => fetchProject(id) });
  const apps = useQuery({ queryKey: ["project", id, "apps", page], queryFn: () => fetchApps(id, page), placeholderData: keepPreviousData });

  function toggleSelected(appId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function changePage(next: number) {
    setPage(next);
    setSelected(new Set());
  }

  if (project.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  if (project.error instanceof UnauthorizedError) return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (project.error instanceof NotFoundError) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <a href="/" className="mt-2 inline-block text-xs text-foreground underline">
          Back to projects
        </a>
      </div>
    );
  }

  if (project.error) return <p className="text-xs text-muted-foreground">Failed to load project.</p>;

  const { id: projId, name } = project.data;

  return (
    <>
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <a href="/" className="transition-colors hover:text-foreground">
          Projects
        </a>
        <span className="text-border">/</span>
        <span className="text-foreground">{name}</span>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="font-heading text-lg font-medium">{name}</h1>
        <EditProjectDialog projectId={projId} currentName={name} />
        {apps.data && <DeleteProjectDialog projectId={projId} projectName={name} applicationCount={apps.data.total} />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Applications deployed as part of this project.</p>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-heading text-sm font-medium">Applications</h2>
        <div className="flex items-center gap-2">
          <BulkActions projectId={projId} selected={selected} onClear={() => setSelected(new Set())} />
          <a href={`/marketplace?project=${projId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Marketplace
          </a>
          <NewApplicationDialog projectId={projId} />
        </div>
      </div>

      <Card className="mt-3">
        <CardContent className="px-0">
          {apps.isPending ? (
            <div className="flex flex-col gap-2 px-4 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !apps.data || apps.data.items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">This project has no applications yet.</p>
          ) : (
            <DataTable
              columns={buildColumns(selected, toggleSelected)}
              data={apps.data.items}
              getRowId={(app) => app.id}
              rowClassName={() => "relative cursor-pointer"}
            />
          )}
          {apps.data && apps.data.items.length > 0 && <TablePagination page={page} pageSize={PAGE_SIZE} total={apps.data.total} onPageChange={changePage} />}
        </CardContent>
      </Card>
    </>
  );
}
