import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
        <pre className="max-h-96 overflow-auto border border-border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">{logs}</pre>
      </DialogContent>
    </Dialog>
  );
}
