import { ExecTerminal } from "@/components/ExecTerminal";
import type { ApiApplicationDetail } from "@/lib/api";

// Interactive shell inside the running container. Read-only output lives in the Logs tab instead (see
// ApplicationLogsTab / RuntimeLogs) — this one runs arbitrary commands via `docker exec`. Loaded lazily by
// ApplicationShell since @xterm/xterm touches browser globals at import time.
export function TerminalContent({ app }: { app: ApiApplicationDetail }) {
  return (
    <>
      <h2 className="font-heading text-sm font-medium">Terminal</h2>
      <p className="mt-1 text-xs text-muted-foreground">Interactive shell inside the running container.</p>
      <ExecTerminal applicationId={app.id} />
    </>
  );
}
