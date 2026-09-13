import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AnsiLog } from "@/components/AnsiLog";

// Per-deployment log, opened on demand instead of always rendered inline on the application page
export function DeploymentLogDialog({ logs }: { logs: string | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost" disabled={!logs}>
          View log
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build log</DialogTitle>
        </DialogHeader>
        <AnsiLog text={logs ?? ""} className="max-h-96 break-all" />
      </DialogContent>
    </Dialog>
  );
}
