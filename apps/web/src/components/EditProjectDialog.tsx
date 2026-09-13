import * as React from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";

export function EditProjectDialog({ projectId, currentName, onRenamed }: { projectId: string; currentName: string; onRenamed: (name: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(currentName);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSave() {
    setSubmitting(true);
    try {
      const updated = await api.updateProject(projectId, name.trim());
      onRenamed(updated.name);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

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
          <Button disabled={name.trim().length === 0 || submitting} onClick={handleSave}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
