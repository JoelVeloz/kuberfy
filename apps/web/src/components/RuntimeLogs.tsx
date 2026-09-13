import * as React from "react";
import { AnsiLog } from "@/components/AnsiLog";

// Client island: opens a WebSocket to the API's dockerode-backed log stream — real container output, not a poll.
export function RuntimeLogs({ applicationId }: { applicationId: string }) {
  const [lines, setLines] = React.useState<string[]>([]);
  const [connected, setConnected] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    const url = new URL(`/api/applications/${applicationId}/runtime-logs`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => setLines((prev) => [...prev, String(evt.data)]);
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [applicationId]);

  React.useEffect(() => {
    preRef.current?.scrollTo({ top: preRef.current.scrollHeight });
  }, [lines]);

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/40"}`} />
        {connected ? "Connected" : "Disconnected"}
      </div>
      {lines.length === 0 ? (
        <div className="flex h-40 items-center justify-center border border-dashed border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">{connected ? "Waiting for output…" : "No running container to stream from."}</p>
        </div>
      ) : (
        <AnsiLog ref={preRef} text={lines.join("")} className="max-h-80" />
      )}
    </div>
  );
}
