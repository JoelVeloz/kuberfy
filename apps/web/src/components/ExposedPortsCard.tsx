import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

// Not visible to `GET /api/settings/ports` (the container only sees Docker's own state, not the host's raw
// socket table) — listed here as static, known facts instead of pretending they're live-detected.
const HOST_LEVEL_PORTS = [
  { key: "22/tcp", label: "22/tcp", service: "SSH", note: "Managed by your server provider, not kuberfy" },
  { key: "2377/tcp", label: "2377/tcp", service: "Docker Swarm — cluster management", note: "Blocked by the installer's firewall (single-node, never needed)" },
  { key: "7946/tcp", label: "7946/tcp", service: "Docker Swarm — node gossip", note: "Blocked by the installer's firewall (single-node, never needed)" },
  { key: "7946/udp", label: "7946/udp", service: "Docker Swarm — node gossip", note: "Blocked by the installer's firewall (single-node, never needed)" },
  { key: "4789/udp", label: "4789/udp", service: "Docker Swarm — overlay network", note: "Blocked by the installer's firewall (single-node, never needed)" },
];

interface PortRow {
  key: string;
  port: React.ReactNode;
  service: React.ReactNode;
  access: React.ReactNode;
}

const columnHelper = createColumnHelper<PortRow>();
const columns = [
  columnHelper.accessor("port", { header: "Port", cell: (info) => info.getValue(), meta: { className: "font-mono" } }),
  columnHelper.accessor("service", { header: "Service", cell: (info) => info.getValue() }),
  columnHelper.accessor("access", { header: "Access", cell: (info) => info.getValue(), meta: { headerClassName: "text-right", className: "text-right" } }),
];

export function ExposedPortsCard() {
  return (
    <QueryProvider>
      <ExposedPortsCardInner />
    </QueryProvider>
  );
}

function ExposedPortsCardInner() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const queryClient = useQueryClient();
  // Shares the "settings" cache key with SettingsForm (same QueryProvider singleton, see lib/query-client.ts) —
  // saving the domain there refreshes exposePanelPort here too, and vice versa.
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const ports = useQuery({ queryKey: ["exposed-ports"], queryFn: api.listExposedPorts, refetchInterval: 15_000 });

  const togglePanelPort = useMutation({
    mutationFn: (expose: boolean) => api.updatePanelPortExposure(expose),
    onSuccess: (data, expose) => {
      if (data.liveUpdateError) toast.warning(data.liveUpdateError);
      else toast.success(expose ? "Panel is now reachable directly on :3000." : "Direct :3000 access disabled.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["exposed-ports"] });
    },
    onError: (err) => toastError(err, "Failed to update port exposure."),
  });

  if (settings.isPending || ports.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const panelExposed = settings.data?.exposePanelPort ?? false;
  // The live scan already reports :3000 whenever the toggle is on (same underlying Docker state) — collapse
  // that into the one controlled row below instead of listing it twice.
  const otherPorts = (ports.data?.ports ?? []).filter((p) => p.port !== 3000);

  const domain = settings.data?.kuberfyDomain;
  const isLocalDomain = !domain || domain === "localhost" || domain.endsWith(".localhost");
  const domainUrl = domain ? `${isLocalDomain ? "http" : "https"}://${domain}` : null;

  const rows: PortRow[] = [
    ...otherPorts.map((p) => ({
      key: `${p.port}/${p.protocol}`,
      port: (
        <>
          {p.port}/{p.protocol}
        </>
      ),
      service: p.container,
      access: <Badge variant="outline">Always on</Badge>,
    })),
    {
      key: "3000/tcp",
      port: "3000/tcp",
      service: "kuberfy panel (direct, bypasses HTTPS)",
      access: <Switch checked={panelExposed} disabled={togglePanelPort.isPending} onCheckedChange={handleToggle} />,
    },
    ...HOST_LEVEL_PORTS.map((p) => ({
      key: p.key,
      port: <span className="text-muted-foreground">{p.label}</span>,
      service: (
        <>
          <div>{p.service}</div>
          <div className="text-xs text-muted-foreground">{p.note}</div>
        </>
      ),
      access: (
        <Badge variant="outline" className="text-muted-foreground">
          {p.service === "SSH" ? "Not monitored" : "Blocked"}
        </Badge>
      ),
    })),
  ];

  function handleToggle(next: boolean) {
    if (next) {
      togglePanelPort.mutate(true);
      return;
    }
    // Disabling this is the only way left to reach the panel if the domain turns out not to work — refuse to
    // even offer it without a domain configured at all, and make sure it's been verified for anything else.
    if (!domain) {
      toast.error("Set a domain in Settings first — disabling direct access with no working domain would lock you out of the panel.");
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Exposed ports</h2>
          <p className="text-xs text-muted-foreground">Every port open on this server — Docker's own state read live, plus the host-level ports kuberfy can't see directly.</p>
        </div>

        <DataTable columns={columns} data={rows} getRowId={(r) => r.key} />
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable direct access?</DialogTitle>
            <DialogDescription>
              Please verify you can already reach the panel at{" "}
              <a href={domainUrl ?? undefined} target="_blank" rel="noreferrer" className="font-mono text-foreground underline">
                {domainUrl}
              </a>{" "}
              before continuing — if that domain isn't working yet, you will lose access to this dashboard entirely until you SSH into the server and re-enable :3000 manually.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={togglePanelPort.isPending} onClick={() => togglePanelPort.mutate(false, { onSuccess: () => setConfirmOpen(false) })}>
              {togglePanelPort.isPending ? "Disabling…" : "Yes, I've verified it — disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
