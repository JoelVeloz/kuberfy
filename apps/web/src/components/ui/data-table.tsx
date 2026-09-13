import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type OnChangeFn, type SortingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    className?: string;
    headerClassName?: string;
  }
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  rowClassName?: (row: TData) => string | undefined;
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  fixedLayout?: boolean;
  stickyHeader?: boolean;
  hideHeader?: boolean;
}

// Shared table body for every data grid in the app: same column-def shape, sortable-header affordance, and empty
// state as ProcessesTable pioneered — kept here so all tables render and sort identically instead of each
// reimplementing the header/row loop.
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  sorting,
  onSortingChange,
  rowClassName,
  onRowClick,
  emptyMessage = "No results.",
  fixedLayout,
  stickyHeader,
  hideHeader,
}: DataTableProps<TData>) {
  const sortable = onSortingChange !== undefined;
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: sortable ? { sorting } : undefined,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
  });

  const rows = table.getRowModel().rows;

  return (
    <Table className={fixedLayout ? "table-fixed" : undefined}>
      <TableHeader hidden={hideHeader}>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className={stickyHeader ? "[&_th]:sticky [&_th]:top-0 [&_th]:bg-card" : undefined}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sortDir = header.column.getIsSorted();
              return (
                <TableHead key={header.id} className={header.column.columnDef.meta?.headerClassName}>
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={`flex cursor-pointer items-center gap-1 hover:text-foreground ${sortDir ? "text-foreground" : ""}`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortDir === "desc" ? <CaretDown weight="bold" /> : sortDir === "asc" ? <CaretUp weight="bold" /> : <CaretUpDown className="text-muted-foreground/50" />}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-xs text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id} className={rowClassName?.(row.original)} onClick={onRowClick ? () => onRowClick(row.original) : undefined}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
