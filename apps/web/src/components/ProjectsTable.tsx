import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api, UnauthorizedError, type ApiProject } from "@/lib/api";

interface Row extends ApiProject {
  appCount: number;
}

// Client island: real ids/counts don't exist at build time, so the list fetches from the API on mount
export function ProjectsTable() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<"unauthorized" | "failed" | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const projects = await api.listProjects();
        const counts = await Promise.all(projects.map((p) => api.listProjectApplications(p.id).then((apps) => apps.length)));
        if (!cancelled) setRows(projects.map((p, i) => ({ ...p, appCount: counts[i] })));
      } catch (err) {
        if (!cancelled) setError(err instanceof UnauthorizedError ? "unauthorized" : "failed");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error === "unauthorized") return <p className="mt-6 text-xs text-muted-foreground">Not signed in.</p>;
  if (error === "failed") return <p className="mt-6 text-xs text-muted-foreground">Failed to load projects.</p>;

  return (
    <Card className="mt-6">
      <CardContent className="px-0">
        {!rows ? (
          <div className="flex flex-col gap-2 px-4 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
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
              {rows.map((project) => (
                <TableRow key={project.id} className="relative cursor-pointer">
                  <TableCell>
                    <a href={`/projects/${project.id}`} className="font-medium after:absolute after:inset-0">
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
      </CardContent>
    </Card>
  );
}
