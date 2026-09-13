import { RuntimeLogs } from "@/components/RuntimeLogs";
import { ApplicationShell } from "@/components/ApplicationShell";

// Client island: live, read-only output streamed from the running container (dockerode `logs --follow` over a
// WebSocket — see RuntimeLogs). Separate from the Terminal tab, which is an interactive exec console.
export function ApplicationLogsTab() {
  return (
    <ApplicationShell activeTab="logs">
      {(app) => (
        <>
          <h2 className="font-heading text-sm font-medium">Logs</h2>
          <p className="mt-1 text-xs text-muted-foreground">Live output streamed from the running container.</p>
          <RuntimeLogs applicationId={app.id} />
        </>
      )}
    </ApplicationShell>
  );
}
