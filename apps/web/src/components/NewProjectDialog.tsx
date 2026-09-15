import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function NewProjectDialog() {
  return (
    <QueryProvider>
      <NewProjectDialogInner />
    </QueryProvider>
  );
}

function NewProjectDialogInner() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.createProject(name.trim()),
    onSuccess: () => {
      toast.success("Project created.");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setName("");
    },
    onError: (err) => toastError(err, "Failed to create project."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Create a project to group related applications.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name">
            Name
          </Label>
          <Input id="project-name" placeholder="e.g. Marketing site" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={name.trim().length === 0 || isPending} onClick={() => mutate()}>
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
