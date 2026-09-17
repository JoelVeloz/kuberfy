import * as React from "react";

// Shared by RuntimeLogs and DeploymentLogPage's BuildLog — both open a WebSocket that emits one message per log
// line, accumulate them, and auto-scroll a <pre> to the bottom as new ones arrive. `url` null skips connecting
// (e.g. a finished build with nothing left to stream), and changing it reconnects and clears the buffer.
export function useLogStream(url: string | URL | null, joiner: string) {
  const [lines, setLines] = React.useState<string[]>([]);
  const [connected, setConnected] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);
  const key = url?.toString() ?? null;

  React.useEffect(() => {
    if (!key) return;
    setLines([]);
    const ws = new WebSocket(key);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => setLines((prev) => [...prev, String(evt.data)]);
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [key]);

  React.useEffect(() => {
    preRef.current?.scrollTo({ top: preRef.current.scrollHeight });
  }, [lines]);

  return { text: lines.join(joiner), connected, preRef };
}
