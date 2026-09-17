import * as React from "react";
import { Cube, GithubLogo, Play, Stop, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient, keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const PAGE_SIZE = 100;
const DELETE_CONFIRM_WORD = "DELETE";

type AppRow = ApiApplicationWithStatus;

const columnHelper = createColumnHelper<AppRow>();

function buildColumns(rowIds: string[], selected: Set<string>, onToggle: (id: string) => void, onToggleAll: () => void) {
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  return [
    columnHelper.display({
      id: "select",
      meta: { className: "relative z-10 w-8" },
      header: () => <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all applications" />,
      cell: (info) => (
        <Checkbox
          className="relative z-10"
          checked={selected.has(info.row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => onToggle(info.row.original.id)}
          aria-label={`Select ${info.row.original.name}`}
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

function BulkDeleteDialog({ projectId, selected, names, onDeleted }: { projectId: string; selected: Set<string>; names: string[]; onDeleted: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleteVolumes, setDeleteVolumes] = React.useState(false);
  const queryClient = useQueryClient();

  const del = useMutation({
    mutationFn: () => Promise.all([...selected].map((id) => api.deleteApplication(id, { deleteVolumes }))),
    onSuccess: () => {
      toast.success(`Deleted ${selected.size} ${selected.size === 1 ? "application" : "applications"}.`);
      setOpen(false);
      onDeleted();
      queryClient.invalidateQueries({ queryKey: ["project", projectId, "apps"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => toastError(err, "Failed to delete the selected applications."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmText("");
          setDeleteVolumes(false);
          del.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <Trash /> Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {selected.size} application{selected.size === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Permanently deletes {selected.size === 1 ? "this application" : "these applications"} and everything deployed for{" "}
            {selected.size === 1 ? "it" : "them"}. Docker images are never touched — other apps or a future redeploy may still use them. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto border border-border bg-muted px-3 py-2 font-mono text-xs">
          {names.map((name, i) => (
            <li key={i} className="truncate">
              {name}
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-2 text-xs">
          <Checkbox checked={deleteVolumes} onCheckedChange={(v) => setDeleteVolumes(v === true)} className="mt-0.5" />
          <span>
            Also delete their data volumes. <span className="text-muted-foreground">Leave this off to keep the data and remove it manually later.</span>
          </span>
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-bulk-delete">
            Type <span className="font-mono">{DELETE_CONFIRM_WORD}</span> to confirm
          </Label>
          <Input id="confirm-bulk-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={confirmText !== DELETE_CONFIRM_WORD || del.isPending} onClick={() => del.mutate()}>
            {del.isPending ? "Deleting…" : `Delete ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkActions({ projectId, apps, selected, onClear }: { projectId: string; apps: AppRow[]; selected: Set<string>; onClear: () => void }) {
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
      <BulkDeleteDialog
        projectId={projectId}
        selected={selected}
        names={apps.filter((a) => selected.has(a.id)).map((a) => a.name)}
        onDeleted={onClear}
      />
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

  function toggleAllSelected() {
    const rowIds = apps.data?.items.map((a) => a.id) ?? [];
    setSelected((prev) => (rowIds.every((id) => prev.has(id)) ? new Set() : new Set(rowIds)));
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
          <BulkActions projectId={projId} apps={apps.data?.items ?? []} selected={selected} onClear={() => setSelected(new Set())} />
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
              columns={buildColumns(apps.data.items.map((a) => a.id), selected, toggleSelected, toggleAllSelected)}
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
