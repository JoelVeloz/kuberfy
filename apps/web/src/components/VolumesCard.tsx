import * as React from "react";
import { HardDrives, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api, type ApiVolume } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function AddVolumeDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = React.useState(false);
  const [mountPath, setMountPath] = React.useState("");
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: () => api.createVolume(applicationId, mountPath.trim()),
    onSuccess: () => {
      toast.success("Volume added.");
      setMountPath("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    },
    onError: (err) => toastError(err, "Failed to add volume."),
  });

  const canAdd = /^\/\S+$/.test(mountPath.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add volume
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add volume</DialogTitle>
          <DialogDescription>Persists data across redeploys and restarts.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="volume-mount-path">
            Path inside the container
          </Label>
          <Input id="volume-mount-path" placeholder="/data" value={mountPath} onChange={(e) => setMountPath(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={!canAdd || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VolumesCard({ applicationId, volumes }: { applicationId: string; volumes: ApiVolume[] }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteVolume(id),
    onSuccess: () => {
      toast.success("Volume deleted.");
      queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    },
    onError: (err) => toastError(err, "Failed to delete volume."),
  });

  if (volumes.length === 0) return <p className="text-xs text-muted-foreground">No volumes. Container data is lost on redeploy.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {volumes.map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-xs last:border-b-0 last:pb-0">
          <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-foreground">
            <HardDrives className="shrink-0 text-muted-foreground" />
            <span className="truncate">{v.mountPath}</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              Persistent
            </Badge>
            <DeleteVolumeDialog mountPath={v.mountPath} deleting={remove.isPending} onConfirm={() => remove.mutate(v.id)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeleteVolumeDialog({ mountPath, deleting, onConfirm }: { mountPath: string; deleting: boolean; onConfirm: () => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6" aria-label={`Delete volume at ${mountPath}`}>
          <Trash />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete volume</DialogTitle>
          <DialogDescription>
            This permanently deletes all data stored at <span className="font-mono text-foreground">{mountPath}</span>. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {deleting ? "Deleting…" : "Delete volume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
