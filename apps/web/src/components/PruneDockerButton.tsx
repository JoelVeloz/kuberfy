import * as React from "react";
import { Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

// Reclaims disk space taken up by images no longer used by any container (e.g. an app's old image after a
// redeploy, or one pulled once from the marketplace and never deployed) plus the Dockerfile build cache —
// the two things that actually accumulate on a long-running instance. Never touches an image a running app needs.
export function PruneDockerButton() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function prune() {
    setPending(true);
    try {
      const result = await api.pruneDockerResources();
      toast.success(`Reclaimed ${formatBytes(result.spaceReclaimed)} (${result.imagesDeleted} unused image${result.imagesDeleted === 1 ? "" : "s"} removed).`);
      setOpen(false);
    } catch (err) {
      toastError(err, "Failed to clean up Docker resources.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash /> Clean up unused images
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clean up unused Docker images</DialogTitle>
          <DialogDescription>
            Removes every image not currently used by a running app or by kuberfy itself, plus the Dockerfile build cache — the usual reason disk usage creeps up over time.
            Nothing running is affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={pending} onClick={prune}>
            {pending ? "Cleaning up…" : "Clean up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
