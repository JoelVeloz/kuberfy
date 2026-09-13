import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, type ApiProject } from "@/lib/api";

interface Row extends ApiProject {
  appCount: number;
}

async function fetchRows(): Promise<Row[]> {
  const projects = await api.listProjects();
  const counts = await Promise.all(projects.map((p) => api.listProjectApplications(p.id).then((apps) => apps.length)));
  return projects.map((p, i) => ({ ...p, appCount: counts[i] }));
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
  const { data: rows, error } = useQuery({ queryKey: ["projects"], queryFn: fetchRows });

  if (error) return <p className="mt-6 text-xs text-muted-foreground">{error instanceof UnauthorizedError ? "Not signed in." : "Failed to load projects."}</p>;

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
      </CardContent>
    </Card>
  );
}
