import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export function ExposedPortsCard() {
  return (
    <QueryProvider>
      <ExposedPortsCardInner />
    </QueryProvider>
  );
}

function ExposedPortsCardInner() {
  const queryClient = useQueryClient();
  // Shares the "settings" cache key with SettingsForm (same QueryProvider singleton, see lib/query-client.ts) —
  // saving the domain there refreshes exposePanelPort here too, and vice versa.
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const ports = useQuery({ queryKey: ["exposed-ports"], queryFn: api.listExposedPorts, refetchInterval: 15_000 });

  const togglePanelPort = useMutation({
    mutationFn: (expose: boolean) => api.updatePanelPortExposure(expose),
    onSuccess: (_data, expose) => {
      toast.success(expose ? "Panel is now reachable directly on :3000." : "Direct :3000 access disabled.");
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Exposed ports</h2>
          <p className="text-xs text-muted-foreground">Every port open on this server — Docker's own state read live, plus the host-level ports kuberfy can't see directly.</p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Port</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {otherPorts.map((p) => (
              <TableRow key={`${p.port}/${p.protocol}`}>
                <TableCell className="font-mono">
                  {p.port}/{p.protocol}
                </TableCell>
                <TableCell>{p.container}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline">Always on</Badge>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-mono">3000/tcp</TableCell>
              <TableCell>kuberfy panel (direct, bypasses HTTPS)</TableCell>
              <TableCell className="text-right">
                <Switch checked={panelExposed} disabled={togglePanelPort.isPending} onCheckedChange={(v) => togglePanelPort.mutate(v)} />
              </TableCell>
            </TableRow>
            {HOST_LEVEL_PORTS.map((p) => (
              <TableRow key={p.key}>
                <TableCell className="font-mono text-muted-foreground">{p.label}</TableCell>
                <TableCell>
                  <div>{p.service}</div>
                  <div className="text-xs text-muted-foreground">{p.note}</div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="text-muted-foreground">
                    {p.service === "SSH" ? "Not monitored" : "Blocked"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
