import * as React from "react";
import { Cube, FolderSimple, GithubLogo } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { api, UnauthorizedError, type ApiProjectWithApplications, type ApiApplicationWithStatus } from "@/lib/api";

const PAGE_SIZE = 20;
const PREVIEW_SIZE = 5;

async function fetchProjects(page: number): Promise<{ items: ApiProjectWithApplications[]; total: number }> {
  return api.listProjectsWithApplications(page, PAGE_SIZE);
}

function AppTypeIcon({ buildType }: { buildType: ApiApplicationWithStatus["buildType"] }) {
  return buildType === "image" ? (
    <Cube weight="bold" className="size-3.5 shrink-0 text-blue-500" title="Deploys a prebuilt Docker image" />
  ) : (
    <GithubLogo weight="bold" className="size-3.5 shrink-0 text-foreground" title="Builds from a Git repository" />
  );
}

function ProjectApplications({ projectId, applications, total }: { projectId: string; applications: ApiApplicationWithStatus[]; total: number }) {
  if (applications.length === 0) {
    return <p className="border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">No applications yet.</p>;
  }

  return (
    <ul className="flex flex-col border-t border-border bg-muted/20">
      {applications.slice(0, PREVIEW_SIZE).map((app) => (
        <li key={app.id} className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2 last:border-b-0">
          <a href={`/applications/view?id=${app.id}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
            <AppTypeIcon buildType={app.buildType} />
            <span className="truncate">{app.name}</span>
          </a>
          {app.latestStatus ? <DeploymentStatusBadge status={app.latestStatus} /> : <span className="text-xs text-muted-foreground">No deployments</span>}
        </li>
      ))}
      {total > PREVIEW_SIZE && (
        <li className="border-b border-border/60 px-4 py-2 last:border-b-0">
          <a href={`/projects/view?id=${projectId}`} className="text-xs text-foreground underline underline-offset-2">
            View all {total} applications →
          </a>
        </li>
      )}
    </ul>
  );
}

function ProjectRow({ project }: { project: ApiProjectWithApplications }) {
  return (
    <>
      <TableRow className="relative">
        <TableCell>
          <a href={`/projects/view?id=${project.id}`} className="flex items-center gap-2 font-medium after:absolute after:inset-0">
            <FolderSimple weight="bold" className="size-3.5 shrink-0 text-muted-foreground" />
            {project.name}
          </a>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {project.applicationCount} {project.applicationCount === 1 ? "application" : "applications"}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {new Date(project.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </TableCell>
      </TableRow>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={3} className="p-0">
          <ProjectApplications projectId={project.id} applications={project.applications} total={project.applicationCount} />
        </TableCell>
      </TableRow>
    </>
  );
}

// Client island: real ids/counts don't exist at build time, so the list fetches from the API on mount
export function ProjectsTable() {
  return (
    <QueryProvider>
      <ProjectsTableInner />
    </QueryProvider>
  );
}

function ProjectsTableInner() {
  const [page, setPage] = React.useState(1);
  const { data, error } = useQuery({ queryKey: ["projects", page], queryFn: () => fetchProjects(page), placeholderData: keepPreviousData });

  if (error) return <p className="mt-6 text-xs text-muted-foreground">{error instanceof UnauthorizedError ? "Not signed in." : "Failed to load projects."}</p>;

  return (
    <Card className="mt-6">
      <CardContent className="px-0">
        {!data ? (
          <div className="flex flex-col gap-2 px-4 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data.items.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">No projects yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </TableBody>
          </Table>
        )}
        {data && data.items.length > 0 && <TablePagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
      </CardContent>
    </Card>
  );
}
