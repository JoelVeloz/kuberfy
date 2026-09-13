import * as React from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function EditProjectDialog({ projectId, currentName }: { projectId: string; currentName: string }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(currentName);
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.updateProject(projectId, name.trim()),
    onSuccess: () => {
      toast.success("Project renamed.");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
    },
    onError: (err) => toastError(err, "Failed to rename project."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(currentName);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilSimple /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Update the name shown across the dashboard.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-project-name" className="text-xs font-medium">
            Name
          </label>
          <Input id="edit-project-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={name.trim().length === 0 || isPending} onClick={() => mutate()}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
