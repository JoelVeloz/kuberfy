import * as React from "react";
import { Trash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function DeleteApplicationDialog({ applicationId, applicationName, projectId }: { applicationId: string; applicationName: string; projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  const del = useMutation({
    mutationFn: () => api.deleteApplication(applicationId),
    onSuccess: () => {
      window.location.href = `/projects/view?id=${projectId}`;
    },
    onError: (err) => toastError(err, "Failed to delete application."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmText("");
          del.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <Trash /> Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete application</DialogTitle>
          <DialogDescription>
            Deletes the container, deployments, and domains for <span className="font-mono">{applicationName}</span>. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-app-name" className="text-xs font-medium">
            Type <span className="font-mono">{applicationName}</span> to confirm
          </label>
          <Input id="confirm-app-name" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={confirmText !== applicationName || del.isPending} onClick={() => del.mutate()}>
            {del.isPending ? "Deleting…" : "Delete application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
