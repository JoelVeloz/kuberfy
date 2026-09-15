import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Rendered inside a caller-owned <Dialog> so the trigger can vary (Settings card button vs. sidebar footer button).
export function UpdateConfirmDialog({ updating, onConfirm }: { updating: boolean; onConfirm: () => void }) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Update kuberfy?</DialogTitle>
        <DialogDescription>Restarts kuberfy's service. Briefly unreachable for a few seconds; deployed apps keep running.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button disabled={updating} onClick={onConfirm}>
          {updating ? "Starting…" : "Update now"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
