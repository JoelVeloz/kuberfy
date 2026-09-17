import * as React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiWsUrl } from "@/lib/api-url";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Shell = "auto" | "bash" | "sh";
const SHELLS: Array<{ value: Shell; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "bash", label: "/bin/bash" },
  { value: "sh", label: "/bin/sh" },
];

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
        <ConnectionIndicator connected={connected} label={connected ? "Connected" : "Disconnected"} />
        <Select value={shell} onValueChange={(v) => setShell(v as Shell)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHELLS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div ref={containerRef} className="h-96 border border-border bg-black p-2" />
    </div>
  );
}
