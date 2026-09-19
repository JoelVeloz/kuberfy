import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

const DATABASE_PORT = 5432;
const RESTART_TIMEOUT_MS = 60_000;

export function RemoteDatabaseAccessCard() {
  return (
    <QueryProvider>
      <RemoteDatabaseAccessCardInner />
    </QueryProvider>
  );
}

function RemoteDatabaseAccessCardInner() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const [requested, setRequested] = React.useState<boolean | null>(null);
  const [restarting, setRestarting] = React.useState(false);

  const apply = useMutation({
    mutationFn: (enabled: boolean) => api.updateRemoteDatabaseAccess(enabled),
    onSuccess: (data, enabled) => {
      setRequested(null);
      if (data.proxyRestarting) {
        setRestarting(true);
        waitForProxy(enabled);
      }
    },
    onError: (err) => toastError(err, "Failed to update remote database access."),
  });

  function finish(ok: boolean, enabled: boolean) {
    setRestarting(false);
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["exposed-ports"] });
    if (ok) toast.success(enabled ? `Port ${DATABASE_PORT} is open for databases.` : `Port ${DATABASE_PORT} is closed.`);
    else toast.error("The proxy couldn't restart with this change, so it was reverted. Check the server logs.");
  }

  function waitForProxy(enabled: boolean) {
    const deadline = Date.now() + RESTART_TIMEOUT_MS;
    const poll = async () => {
      try {
        const [latest, ports] = await Promise.all([api.getSettings(), api.listExposedPorts()]);
        if (ports.ports.some((p) => p.port === DATABASE_PORT) === enabled) return finish(true, enabled);
        if (latest.remoteDatabaseAccess !== enabled) return finish(false, enabled);
      } catch {}
      if (Date.now() > deadline) return finish(false, enabled);
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 3000);
  }

  if (settings.isPending || !settings.data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  const enabled = settings.data.remoteDatabaseAccess;

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Remote database access</h2>
          <p className="text-xs text-muted-foreground">
            {restarting
              ? "Restarting the proxy. Your sites will be back in a few seconds."
              : `Opens port ${DATABASE_PORT} so PostgreSQL databases can accept TLS connections from outside this server.`}
          </p>
        </div>
        <Switch checked={enabled} disabled={restarting || apply.isPending} onCheckedChange={setRequested} aria-label="Remote database access" />
      </CardContent>

      <Dialog open={requested !== null} onOpenChange={(open) => !open && setRequested(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{requested ? `Open port ${DATABASE_PORT}?` : `Close port ${DATABASE_PORT}?`}</DialogTitle>
            <DialogDescription>
              The proxy restarts to apply this, so your sites and this dashboard will be unreachable for a few seconds.{" "}
              {requested
                ? `If your cloud provider has its own firewall (Oracle Cloud security lists, AWS security groups), allow TCP ${DATABASE_PORT} there as well.`
                : "Databases will stop accepting connections from outside this server."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant={requested ? "default" : "destructive"} disabled={apply.isPending} onClick={() => requested !== null && apply.mutate(requested)}>
              {apply.isPending ? "Applying…" : requested ? "Open port" : "Close port"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
