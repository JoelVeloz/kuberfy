import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, type ApiProjectWithCount } from "@/lib/api";

const PAGE_SIZE = 20;

type Row = ApiProjectWithCount;

async function fetchRows(page: number): Promise<{ items: Row[]; total: number }> {
  return api.listProjects(page, PAGE_SIZE);
}

const columnHelper = createColumnHelper<Row>();
const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => (
      <a href={`/projects/view?id=${info.row.original.id}`} className="font-medium after:absolute after:inset-0">
        {info.getValue()}
      </a>
    ),
  }),
  columnHelper.accessor("applicationCount", {
    header: "Applications",
    cell: (info) => <span className="text-muted-foreground">{`${info.getValue()} ${info.getValue() === 1 ? "application" : "applications"}`}</span>,
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => (
      <span className="text-muted-foreground">{new Date(info.getValue()).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
    ),
  }),
];

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
          <DataTable columns={columns} data={data.items} getRowId={(p) => p.id} rowClassName={() => "relative cursor-pointer"} />
        )}
        {data && data.items.length > 0 && <TablePagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
      </CardContent>
    </Card>
  );
}
