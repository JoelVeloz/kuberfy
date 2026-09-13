import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// Shared Prev/Next footer for every paginated table — same {page, pageSize, total} contract every list endpoint returns.
export function TablePagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  if (total <= pageSize && page === 1) return null;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <CaretLeft />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={end >= total} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <CaretRight />
        </Button>
      </div>
    </div>
  );
}
