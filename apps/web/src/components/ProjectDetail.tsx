import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { NewApplicationDialog } from "@/components/NewApplicationDialog";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { api, UnauthorizedError, NotFoundError, type ApiApplication, type ApiProject } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";
import type { DeploymentStatus } from "@/lib/types";

interface AppRow extends ApiApplication {
  latestStatus: DeploymentStatus | null;
}

async function fetchProject(id: string): Promise<ApiProject> {
  const project = await api.getProject(id);
  document.title = `${project.name} · Kuberfy`;
  return project;
}

async function fetchApps(id: string): Promise<AppRow[]> {
  const { items } = await api.listProjectApplications(id);
  return Promise.all(
    items.map(async (app) => {
      const detail = await api.getApplication(app.id).catch(() => null);
      return { ...app, latestStatus: detail?.deployments[0]?.status ?? null };
    }),
  );
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
  const project = useQuery({ queryKey: ["project", id], queryFn: () => fetchProject(id) });
  const apps = useQuery({ queryKey: ["project", id, "apps"], queryFn: () => fetchApps(id), enabled: project.isSuccess });

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
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Applications deployed as part of this project.</p>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-heading text-sm font-medium">Applications</h2>
        <div className="flex items-center gap-2">
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
          ) : apps.data.length === 0 ? (
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
                {apps.data.map((app) => (
                  <TableRow key={app.id} className="relative cursor-pointer">
                    <TableCell>
                      <a href={`/applications/view?id=${app.id}`} className="font-medium after:absolute after:inset-0">
                        {app.name}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{app.repoUrl}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{app.branch}</TableCell>
                    <TableCell>
                      {app.latestStatus ? <DeploymentStatusBadge status={app.latestStatus} /> : <span className="text-muted-foreground">No deployments</span>}
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
