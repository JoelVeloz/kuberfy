import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { NewApplicationDialog } from "@/components/NewApplicationDialog";
import { api, UnauthorizedError, NotFoundError, type ApiApplication } from "@/lib/api";
import { deploymentStatusLabel, deploymentStatusVariant } from "@/lib/deployment-status";
import type { DeploymentStatus } from "@/lib/types";

interface AppRow extends ApiApplication {
  latestStatus: DeploymentStatus | null;
}

type State =
  { status: "loading" } | { status: "unauthorized" } | { status: "not-found" } | { status: "error" } | { status: "ready"; id: string; name: string; apps: AppRow[] };

// Client island: the real project id only exists at request time, so it's read from the URL and fetched here
export function ProjectDetail() {
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    let cancelled = false;
    async function load() {
      try {
        const project = await api.getProject(id);
        const apps = await api.listProjectApplications(id);
        const withStatus = await Promise.all(
          apps.map(async (app) => {
            const detail = await api.getApplication(app.id).catch(() => null);
            return { ...app, latestStatus: detail?.deployments[0]?.status ?? null };
          }),
        );
        if (cancelled) return;
        document.title = `${project.name} · Kuberfy`;
        setState({ status: "ready", id: project.id, name: project.name, apps: withStatus });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) setState({ status: "unauthorized" });
        else if (err instanceof NotFoundError) setState({ status: "not-found" });
        else setState({ status: "error" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  if (state.status === "unauthorized") return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (state.status === "not-found") {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <a href="/" className="mt-2 inline-block text-xs text-foreground underline">
          Back to projects
        </a>
      </div>
    );
  }

  if (state.status === "error") return <p className="text-xs text-muted-foreground">Failed to load project.</p>;

  return (
    <>
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <a href="/" className="transition-colors hover:text-foreground">
          Projects
        </a>
        <span className="text-border">/</span>
        <span className="text-foreground">{state.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="font-heading text-lg font-medium">{state.name}</h1>
        <EditProjectDialog projectId={state.id} currentName={state.name} onRenamed={(name) => setState({ ...state, name })} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Applications deployed as part of this project.</p>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-heading text-sm font-medium">Applications</h2>
        <NewApplicationDialog projectId={state.id} />
      </div>

      <Card className="mt-3">
        <CardContent className="px-0">
          {state.apps.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">This project has no applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Repository</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Latest deployment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.apps.map((app) => (
                  <TableRow key={app.id} className="relative cursor-pointer">
                    <TableCell>
                      <a href={`/applications/${app.id}`} className="font-medium after:absolute after:inset-0">
                        {app.name}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{app.repoUrl}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{app.branch}</TableCell>
                    <TableCell>
                      {app.latestStatus ? (
                        <Badge variant={deploymentStatusVariant[app.latestStatus]}>{deploymentStatusLabel[app.latestStatus]}</Badge>
                      ) : (
                        <span className="text-muted-foreground">No deployments</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
