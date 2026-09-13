import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

// Wraps each top-level island (one per client:load root) so unauthorized/network errors
// still flow through the same UnauthorizedError/NotFoundError handling as before.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
