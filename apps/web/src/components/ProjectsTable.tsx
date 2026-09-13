import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, type ApiProject } from "@/lib/api";

const PAGE_SIZE = 20;

interface Row extends ApiProject {
  appCount: number;
}

async function fetchRows(page: number): Promise<{ items: Row[]; total: number }> {
  const projects = await api.listProjects(page, PAGE_SIZE);
  // pageSize: 1 — only .total is used here, so there's no reason to fetch a full page of applications per project
  const counts = await Promise.all(projects.items.map((p) => api.listProjectApplications(p.id, 1, 1).then((apps) => apps.total)));
  return { items: projects.items.map((p, i) => ({ ...p, appCount: counts[i]! })), total: projects.total };
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
  const { data, error } = useQuery({ queryKey: ["projects", page], queryFn: () => fetchRows(page), placeholderData: keepPreviousData });

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
                <TableRow key={project.id} className="relative cursor-pointer">
                  <TableCell>
                    <a href={`/projects/view?id=${project.id}`} className="font-medium after:absolute after:inset-0">
                      {project.name}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{`${project.appCount} ${project.appCount === 1 ? "application" : "applications"}`}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(project.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {data && data.items.length > 0 && <TablePagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
      </CardContent>
    </Card>
  );
}
