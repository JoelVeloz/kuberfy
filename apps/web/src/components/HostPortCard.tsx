import * as React from "react";
import { ArrowRight, CopyIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { settingsQuery } from "@/lib/queries";
import { toastError } from "@/lib/toast";

async function copy(text: string) {
  if (!navigator.clipboard) {
    toast.error("Copying needs the dashboard to be served over HTTPS.");
    return;
  }
  await navigator.clipboard.writeText(text);
  toast.success("Address copied.");
}

function parsePort(value: string, min: number) {
  const port = Number(value);
  return Number.isInteger(port) && port >= min && port <= 65535 ? port : null;
}

export function HostPortCard({ app }: { app: ApiApplicationDetail }) {
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery());
  const [hostPort, setHostPort] = React.useState(String(app.hostPort ?? ""));
  const [containerPort, setContainerPort] = React.useState(String(app.containerPort ?? ""));
  React.useEffect(() => {
    setHostPort(String(app.hostPort ?? ""));
    setContainerPort(String(app.containerPort ?? ""));
  }, [app.hostPort, app.containerPort]);

  const [draft, setDraft] = React.useState(false);
  const save = useMutation({
    mutationFn: (body: { enabled: boolean; hostPort?: number; containerPort?: number }) => api.setApplicationHostPort(app.id, body),
    onSuccess: (ports) => {
      setDraft(false);
      toast.success(ports.hostPort == null ? "Public port closed." : `Public port ${ports.hostPort} → container port ${ports.containerPort}.`);
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    },
    onError: (err, body) => {
      if (body.enabled) setDraft(true);
      toastError(err, "Failed to update the public port.");
    },
  });

  const enabled = app.hostPort != null;
  const parsedHost = hostPort === "" && !enabled ? undefined : parsePort(hostPort, 1024);
  const parsedContainer = parsePort(containerPort, 1);
  const changed = !enabled || parsedHost !== app.hostPort || parsedContainer !== app.containerPort;
  const address = enabled && settings.data?.kuberfyDomain ? `${settings.data.kuberfyDomain}:${app.hostPort}` : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-medium">Public port</h2>
        <Switch
          aria-label="Public port"
          checked={enabled || draft}
          disabled={save.isPending}
          onCheckedChange={(on) => (on ? save.mutate({ enabled: true }) : enabled ? save.mutate({ enabled: false }) : setDraft(false))}
        />
      </div>
      <Card className="mt-3">
        <CardContent className="flex flex-col gap-4">
          {!enabled && !draft ? (
            <p className="text-xs text-muted-foreground">
              Off. Turn it on to reach this app from outside the server at <span className="font-mono">{settings.data?.kuberfyDomain ?? "your-domain"}:port</span>, straight to
              the container without TLS.
            </p>
          ) : (
            <>
              {draft && <p className="text-xs text-muted-foreground">Set the port this app listens on inside its container, then save to open it.</p>}
              {enabled &&
                settings.data &&
                (address ? (
                  <div className="flex items-center gap-1">
                    <p className="min-w-0 truncate font-mono text-sm font-medium">{address}</p>
                    <Button variant="ghost" size="icon-sm" aria-label="Copy address" onClick={() => copy(address)}>
                      <CopyIcon />
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Set kuberfy's domain in{" "}
                    <a href="/settings" className="underline">
                      Settings
                    </a>{" "}
                    to get this app's public address.
                  </p>
                ))}
              <div className={`flex flex-wrap items-end gap-3 ${enabled ? "border-t pt-4" : ""}`}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="host-port">External port (internet)</Label>
                  <Input
                    id="host-port"
                    type="number"
                    min={1024}
                    max={65535}
                    placeholder="Auto"
                    className="w-36 font-mono"
                    value={hostPort}
                    onChange={(e) => setHostPort(e.target.value)}
                  />
                </div>
                <ArrowRight className="mb-2.5 text-muted-foreground" />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="container-port">Internal port (container)</Label>
                  <Input
                    id="container-port"
                    type="number"
                    min={1}
                    max={65535}
                    className="w-36 font-mono"
                    value={containerPort}
                    onChange={(e) => setContainerPort(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!changed || parsedHost === null || parsedContainer == null || save.isPending}
                  onClick={() => save.mutate({ enabled: true, hostPort: parsedHost ?? undefined, containerPort: parsedContainer ?? undefined })}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
