import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AnsiLog } from "@/components/AnsiLog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryProvider } from "@/components/QueryProvider";
import { api, type ApiServiceTask } from "@/lib/api";
import { apiWsUrl } from "@/lib/api-url";

const LIVE = "live";

// A restart force-updates the Swarm service — it doesn't recreate it — so the old task (and its container) stays
// around for a while after the new one takes over. These are the states Docker actually reports for a task, not
// container states; "running" is the only one still following live, everything else is a frozen tail.
function taskStateBadge(state: string) {
  if (state === "running") return <Badge variant="success">Running</Badge>;
  if (state === "failed" || state === "rejected" || state === "orphaned") return <Badge variant="destructive">{state}</Badge>;
  if (state === "complete" || state === "shutdown") return <Badge variant="outline">{state}</Badge>;
  return <Badge variant="secondary">{state}</Badge>;
}

function taskLabel(task: ApiServiceTask, index: number, isCurrent: boolean) {
  const when = new Date(task.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const suffix = isCurrent ? "current" : `${index} restart${index === 1 ? "" : "s"} ago`;
  return `${when} (${suffix})`;
}

// Client island: opens a WebSocket to the API's dockerode-backed log stream. A restart doesn't erase the previous
// container's logs — this lets you pick any of the service's recent tasks, not just the one running right now.
export function RuntimeLogs({ applicationId }: { applicationId: string }) {
  return (
    <QueryProvider>
      <RuntimeLogsInner applicationId={applicationId} />
    </QueryProvider>
  );
}

function RuntimeLogsInner({ applicationId }: { applicationId: string }) {
  const [selected, setSelected] = React.useState<string>(LIVE);
  const [lines, setLines] = React.useState<string[]>([]);
  const [connected, setConnected] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  const tasksQuery = useQuery({
    queryKey: ["application-tasks", applicationId],
    queryFn: () => api.listApplicationTasks(applicationId),
    refetchInterval: 5000,
  });
  const tasks = tasksQuery.data?.items ?? [];
  const currentTask = tasks.find((t) => t.state === "running");
  // A task without a containerId (still scheduling, or Docker already garbage-collected its container) has no logs to show.
  const selectableTasks = tasks.filter((t) => t.containerId);

  const containerId = selected === LIVE ? undefined : selected;

  React.useEffect(() => {
    setLines([]);
    const url = new URL(apiWsUrl(`/api/applications/${applicationId}/runtime-logs`));
    if (containerId) url.searchParams.set("containerId", containerId);
    const ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => setLines((prev) => [...prev, String(evt.data)]);
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [applicationId, containerId]);

  React.useEffect(() => {
    preRef.current?.scrollTo({ top: preRef.current.scrollHeight });
  }, [lines]);

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {selectableTasks.length > 1 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-7 w-auto min-w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIVE}>Live (current container)</SelectItem>
              {selectableTasks.map((t, i) => (
                <SelectItem key={t.taskId} value={t.containerId!}>
                  {taskLabel(t, i, t.taskId === currentTask?.taskId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/40"}`} />
          {connected ? (containerId ? "Reading past logs" : "Connected") : "Disconnected"}
        </div>
        {containerId && taskStateBadge(selectableTasks.find((t) => t.containerId === containerId)?.state ?? "unknown")}
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
