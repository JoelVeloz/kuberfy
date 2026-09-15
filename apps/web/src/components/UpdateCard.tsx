import { ArrowsClockwise, CloudArrowDown } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { QueryProvider } from "@/components/QueryProvider";
import { UpdateConfirmDialog } from "@/components/UpdateConfirmDialog";
import { useKuberfyUpdate } from "@/lib/use-kuberfy-update";

export function UpdateCard() {
  return (
    <QueryProvider>
      <UpdateCardInner />
    </QueryProvider>
  );
}

function UpdateCardInner() {
  const { state, check, confirmOpen, setConfirmOpen, updating, restarting, update } = useKuberfyUpdate();

  if (restarting) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <ArrowsClockwise className="animate-spin text-2xl text-muted-foreground" />
          <p className="text-sm font-medium">Kuberfy is restarting…</p>
          <p className="text-xs text-muted-foreground">Reloads automatically. Deployed apps aren't affected.</p>
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
            {state === "unknown" && "Couldn't check for updates. Run `kuberfy update` on the host."}
          </p>
        </div>

        {state === "available" ? (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <CloudArrowDown /> Update
              </Button>
            </DialogTrigger>
            <UpdateConfirmDialog updating={updating} onConfirm={update} />
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
