import * as React from "react";
import { Copy, Sparkle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function SettingsForm() {
  return (
    <QueryProvider>
      <SettingsFormInner />
    </QueryProvider>
  );
}

function SettingsFormInner() {
  const [domain, setDomain] = React.useState("");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  React.useEffect(() => {
    if (query.data) setDomain(query.data.kuberfyDomain ?? "");
  }, [query.data]);

  const suggest = useMutation({
    mutationFn: api.suggestKuberfyDomain,
    onSuccess: (data) => setDomain(data.host),
    onError: (err) => toastError(err, "Failed to generate a domain."),
  });

  const save = useMutation({
    mutationFn: () => api.updateSettings(domain.trim()),
    onSuccess: (data) => {
      if (data.liveUpdateError) toast.warning(data.liveUpdateError);
      else toast.success("Domain is live.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => toastError(err, "Failed to save settings."),
  });

  if (query.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kuberfy-domain">Kuberfy domain</Label>
          <div className="flex max-w-sm gap-2">
            <Input id="kuberfy-domain" placeholder="deploy.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} className="flex-1" />
            <Button type="button" variant="outline" size="sm" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
              <Sparkle /> {suggest.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Domain for this dashboard. Generate creates a free one with HTTPS.</p>
        </div>

        {query.data.serverIp && (
          <div className="flex flex-col gap-1.5">
            <Label>Server IP</Label>
            <div className="flex max-w-sm items-center gap-2">
              <Input readOnly value={query.data.serverIp} className="flex-1 font-mono" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(query.data!.serverIp!);
                  toast.success("IP copied.");
                }}
              >
                <Copy />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Public IP detected at install time.</p>
          </div>
        )}

        <div>
          <Button disabled={domain.trim().length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
