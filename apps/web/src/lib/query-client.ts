import { QueryClient } from "@tanstack/react-query";

// Module-level singleton so sibling islands on the same page (e.g. NewProjectDialog + ProjectsTable)
// share one cache and can invalidate each other's queries despite being separate React roots.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: false } },
});
