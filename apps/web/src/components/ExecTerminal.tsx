import * as React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiWsUrl } from "@/lib/api-url";

type Shell = "auto" | "bash" | "sh";
const SHELLS: Array<{ value: Shell; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "bash", label: "/bin/bash" },
  { value: "sh", label: "/bin/sh" },
];

// Client island: interactive `docker exec` shell over a WebSocket (see apps/api/src/routes/applications.ts's
// /:id/exec route). Distinct from RuntimeLogs, which is read-only container stdout/stderr.
export function ExecTerminal({ applicationId }: { applicationId: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [connected, setConnected] = React.useState(false);
  const [shell, setShell] = React.useState<Shell>("auto");

  React.useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({ convertEol: true, fontSize: 13, cursorBlink: true, theme: { background: "#000000" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const url = new URL(apiWsUrl(`/api/applications/${applicationId}/exec`));
    if (shell !== "auto") url.searchParams.set("shell", shell);
    const ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => term.write(String(evt.data));
    ws.onclose = () => setConnected(false);

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      onData.dispose();
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, [applicationId, shell]);

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/40"}`} />
          {connected ? "Connected" : "Disconnected"}
        </div>
        <select
          value={shell}
          onChange={(e) => setShell(e.target.value as Shell)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
        >
          {SHELLS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div ref={containerRef} className="h-96 rounded-md border border-border bg-black p-2" />
    </div>
  );
}
