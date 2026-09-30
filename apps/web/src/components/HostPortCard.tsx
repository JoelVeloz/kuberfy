import { CopyIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { toastError } from "@/lib/toast";

async function copy(text: string) {
  if (!navigator.clipboard) {
    toast.error("Copying needs the dashboard to be served over HTTPS.");
    return;
  }
  await navigator.clipboard.writeText(text);
  toast.success("Address copied.");
}

export function HostPortCard({ app }: { app: ApiApplicationDetail }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.setApplicationHostPort(app.id, enabled),
    onSuccess: ({ hostPort }) => {
      toast.success(hostPort == null ? "Direct access disabled." : `Direct access on port ${hostPort}.`);
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    },
    onError: (err) => toastError(err, "Failed to update direct access."),
  });
  const address = app.hostPort == null ? null : `${window.location.hostname}:${app.hostPort}`;

  return (
    <div>
      <h2 className="font-heading text-sm font-medium">Direct access</h2>
      <Card className="mt-3">
        <CardContent className="flex items-center justify-between gap-4">
          {address ? (
            <div className="flex min-w-0 items-center gap-1">
              <p className="truncate font-mono text-sm font-medium">{address}</p>
              <Button variant="ghost" size="icon-sm" aria-label="Copy address" onClick={() => copy(address)}>
                <CopyIcon />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Expose a public port on this server, bypassing domains and TLS.</p>
          )}
          <Switch aria-label="Direct access" checked={address != null} disabled={toggle.isPending} onCheckedChange={(enabled) => toggle.mutate(enabled)} />
        </CardContent>
      </Card>
    </div>
  );
}
