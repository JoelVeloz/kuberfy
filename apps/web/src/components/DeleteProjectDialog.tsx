import * as React from "react";
import { Trash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function DeleteProjectDialog({ projectId, projectName, applicationCount }: { projectId: string; projectName: string; applicationCount: number }) {
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const blocked = applicationCount > 0;

  const del = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (err) => toastError(err, "Failed to delete project."),
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
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            {blocked ? (
              <>
                <span className="font-mono">{projectName}</span> has {applicationCount} application{applicationCount === 1 ? "" : "s"}. Remove{" "}
                {applicationCount === 1 ? "it" : "all of them"} before deleting the project.
              </>
            ) : (
              <>
                Deletes <span className="font-mono">{projectName}</span> permanently. This cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!blocked && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-project-name" className="text-xs font-medium">
              Type <span className="font-mono">{projectName}</span> to confirm
            </label>
            <Input id="confirm-project-name" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {!blocked && (
            <Button variant="destructive" disabled={confirmText !== projectName || del.isPending} onClick={() => del.mutate()}>
              {del.isPending ? "Deleting…" : "Delete project"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
