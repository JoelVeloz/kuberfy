import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ApplicationShell } from "@/components/ApplicationShell";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { toast } from "sonner";

// Client island: the hard memory cap enforced on the container (Docker HostConfig.Memory), as its own tab.
export function ApplicationResourcesTab() {
  return <ApplicationShell activeTab="resources">{(app) => <ResourcesContent app={app} />}</ApplicationShell>;
}

function ResourcesContent({ app }: { app: ApiApplicationDetail }) {
  const [memoryLimitMb, setMemoryLimitMb] = React.useState(String(app.memoryLimitMb));
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (mb: number) => api.updateApplicationMemoryLimit(app.id, mb),
    onSuccess: () => {
      toast.success("Memory limit saved.");
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    },
    onError: (err) => toastError(err, "Failed to save memory limit."),
  });

  const parsed = Number(memoryLimitMb);
  const isValid = Number.isInteger(parsed) && parsed > 0;

  return (
    <>
      <h2 className="font-heading text-sm font-medium">Resources</h2>
      <Card className="mt-3">
        <CardContent>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <label htmlFor="memory-limit" className="text-xs font-medium">
              Memory limit (MB)
            </label>
            <Input id="memory-limit" type="number" min={1} step={1} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(e.target.value)} />
            <p className="text-xs text-muted-foreground">Hard cap enforced on the container. Applied on the next deploy or restart.</p>
          </div>
          <Button className="mt-3" size="sm" disabled={!isValid || parsed === app.memoryLimitMb || save.isPending} onClick={() => save.mutate(parsed)}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
