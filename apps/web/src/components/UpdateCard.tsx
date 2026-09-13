import * as React from "react";
import { ArrowsClockwise, CloudArrowDown } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

type CheckState = "checking" | "up-to-date" | "available" | "unknown";

export function UpdateCard() {
  return (
    <QueryProvider>
      <UpdateCardInner />
    </QueryProvider>
  );
}

function UpdateCardInner() {
  const [state, setState] = React.useState<CheckState>("checking");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);

  const check = React.useCallback(async () => {
    setState("checking");
    try {
      const result = await api.checkKuberfyUpdate();
      setState(result.updateAvailable === null ? "unknown" : result.updateAvailable ? "available" : "up-to-date");
    } catch (err) {
      toastError(err, "Failed to check for updates.");
      setState("unknown");
    }
  }, []);

  React.useEffect(() => {
    check();
  }, [check]);

  async function update() {
    setUpdating(true);
    try {
      await api.updateKuberfy();
      setConfirmOpen(false);
      setRestarting(true);
      // The service restart itself (stop-first) kills this very request's connection a moment after it succeeds —
      // give it a head start before polling, then keep retrying until the new container answers again.
      setTimeout(pollUntilBack, 3000);
    } catch (err) {
      toastError(err, "Failed to start the update.");
      setUpdating(false);
    }
  }

  function pollUntilBack() {
    api
      .getSettings()
      .then(() => window.location.reload())
      .catch(() => setTimeout(pollUntilBack, 2000));
  }

  if (restarting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <ArrowsClockwise className="animate-spin text-2xl text-muted-foreground" />
          <p className="text-sm font-medium">Kuberfy is restarting…</p>
          <p className="text-xs text-muted-foreground">This page will reload automatically once it's back — deployed apps are not affected.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Platform update</h2>
            {state === "up-to-date" && <Badge variant="success">Up to date</Badge>}
            {state === "available" && <Badge>Update available</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {state === "checking" && "Checking for the latest version…"}
            {state === "up-to-date" && "You're running the latest published image."}
            {state === "available" && "Pulls the latest image and restarts kuberfy's own service."}
            {state === "unknown" && "Couldn't check for updates — run `kuberfy update` on the host instead."}
          </p>
        </div>

        {state === "available" ? (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <CloudArrowDown /> Update
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update kuberfy?</DialogTitle>
                <DialogDescription>
                  Pulls the latest image and restarts kuberfy's own Swarm service. The dashboard will be briefly unreachable (a few seconds) while it restarts — deployed apps
                  keep running.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button disabled={updating} onClick={update}>
                  {updating ? "Starting…" : "Update now"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button size="sm" variant="outline" disabled={state === "checking"} onClick={check}>
            <ArrowsClockwise className={state === "checking" ? "animate-spin" : undefined} /> {state === "checking" ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
