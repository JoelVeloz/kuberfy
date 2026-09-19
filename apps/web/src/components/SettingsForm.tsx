import * as React from "react";
import { Copy, Sparkle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  if (query.isPending || !query.data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { kuberfyDomain, serverIp } = query.data;
  const canSave = domain.trim().length > 0 && domain.trim() !== (kuberfyDomain ?? "") && !save.isPending;

  return (
    <>
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) save.mutate();
            }}
          >
            <div>
              <h2 className="text-sm font-medium">Dashboard domain</h2>
              <p className="text-xs text-muted-foreground">Where this dashboard is served. Generate creates a free one with HTTPS.</p>
            </div>
            <div className="flex max-w-sm gap-2">
              <Input id="kuberfy-domain" aria-label="Dashboard domain" placeholder="deploy.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} className="flex-1" />
              <Button type="button" variant="outline" size="sm" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
                <Sparkle /> {suggest.isPending ? "Generating…" : "Generate"}
              </Button>
            </div>
            <div>
              <Button type="submit" disabled={!canSave}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {serverIp && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">Server IP</h2>
              <p className="text-xs text-muted-foreground">Detected at install time. Point a custom domain's A record here.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{serverIp}</span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Copy server IP"
                onClick={() => {
                  navigator.clipboard.writeText(serverIp);
                  toast.success("IP copied.");
                }}
              >
                <Copy />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
