import { RuntimeLogs } from "@/components/RuntimeLogs";
import type { ApiApplicationDetail } from "@/lib/api";

// Live, read-only output streamed from the running container (dockerode `logs --follow` over a WebSocket — see
// RuntimeLogs). Separate from the Terminal tab, which is an interactive exec console.
export function LogsContent({ app }: { app: ApiApplicationDetail }) {
  return (
    <>
      <h2 className="font-heading text-sm font-medium">Logs</h2>
      <p className="mt-1 text-xs text-muted-foreground">Live output streamed from the running container.</p>
      <RuntimeLogs applicationId={app.id} />
    </>
  );
}
