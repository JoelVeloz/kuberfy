import { z } from "zod";

// Shared shape for every paginated list endpoint — ?page=1&pageSize=20 in, { items, total } out.
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationQuery>;

export function paginationOffset({ page, pageSize }: Pagination) {
  return (page - 1) * pageSize;
}
