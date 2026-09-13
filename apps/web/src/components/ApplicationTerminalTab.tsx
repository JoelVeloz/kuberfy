import { ExecTerminal } from "@/components/ExecTerminal";
import { ApplicationShell } from "@/components/ApplicationShell";

// Client island: interactive shell inside the running container. Read-only output lives in the Logs tab instead
// (see ApplicationLogsTab / RuntimeLogs) — this one runs arbitrary commands via `docker exec`.
export function ApplicationTerminalTab() {
  return (
    <ApplicationShell activeTab="terminal">
      {(app) => (
        <>
          <h2 className="font-heading text-sm font-medium">Terminal</h2>
          <p className="mt-1 text-xs text-muted-foreground">Interactive shell inside the running container.</p>
          <ExecTerminal applicationId={app.id} />
        </>
      )}
    </ApplicationShell>
  );
}
