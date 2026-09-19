import * as React from "react";
import { CopyIcon, EyeIcon, EyeSlashIcon, SparkleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { databaseConnection, MASKED_PASSWORD } from "@/lib/database-connection";
import { toastError } from "@/lib/toast";

type Format = "url" | "params" | "env";
type Network = "internal" | "public";

async function copy(text: string, label: string) {
  if (!navigator.clipboard) {
    toast.error("Copying needs the dashboard to be served over HTTPS.");
    return;
  }
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copied.`);
}

export function DatabaseConnectionCard({ app }: { app: ApiApplicationDetail }) {
  const queryClient = useQueryClient();
  const [format, setFormat] = React.useState<Format>("url");
  const [network, setNetwork] = React.useState<Network>(app.remoteAccessHost ? "public" : "internal");
  const [revealed, setRevealed] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [host, setHost] = React.useState("");
  const [allowlist, setAllowlist] = React.useState("");
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const connection = React.useMemo(() => databaseConnection(app), [app]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["application", app.id] });

  const save = useMutation({
    mutationFn: () =>
      api.enableRemoteAccess(
        app.id,
        host.trim(),
        allowlist
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    onSuccess: () => {
      setDialogOpen(false);
      setNetwork("public");
      invalidate();
      toast.success("Public access is on. The certificate is issued on the first connection, which can take a few seconds.");
    },
    onError: (err) => toastError(err, "Failed to enable public access."),
  });

  const disable = useMutation({
    mutationFn: () => api.disableRemoteAccess(app.id),
    onSuccess: () => {
      setNetwork("internal");
      invalidate();
      toast.success("Public access is off.");
    },
    onError: (err) => toastError(err, "Failed to disable public access."),
  });

  if (!connection) return null;

  const { user, password, database } = connection.credentials;
  const publicHost = network === "public" ? (app.remoteAccessHost ?? undefined) : undefined;
  const shown = (value: string) => (revealed ? value : MASKED_PASSWORD);
  const remoteAccessAvailable = connection.engine === "PostgreSQL";

  const params = [
    { label: "Host", value: publicHost ?? connection.host },
    { label: "Port", value: String(connection.port) },
    ...(user ? [{ label: "User", value: user }] : []),
    ...(password ? [{ label: "Password", value: password, secret: true }] : []),
    ...(database ? [{ label: "Database", value: database }] : []),
    ...(publicHost ? [{ label: "SSL mode", value: "verify-full" }] : []),
  ];

  const line =
    format === "env"
      ? {
          label: connection.envName,
          display: `${connection.envName}=${connection.url(revealed, publicHost)}`,
          value: `${connection.envName}=${connection.url(true, publicHost)}`,
        }
      : { label: "Connection string", display: connection.url(revealed, publicHost), value: connection.url(true, publicHost) };

  const revealButton = password && (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={revealed ? "Hide password" : "Show password"} onClick={() => setRevealed((r) => !r)}>
      {revealed ? <EyeSlashIcon /> : <EyeIcon />}
    </Button>
  );

  async function openDialog() {
    setDialogOpen(true);
    if (app.remoteAccessHost) {
      setHost(app.remoteAccessHost);
      setAllowlist(app.remoteAccessAllowlist ?? "");
      return;
    }
    setHost("");
    setAllowlist("");
    const [suggested, clientIp] = await Promise.allSettled([api.suggestKuberfyDomain(), api.getClientIp()]);
    if (suggested.status === "fulfilled") setHost(suggested.value.host);
    if (clientIp.status === "fulfilled" && clientIp.value.ip) setAllowlist(clientIp.value.ip);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Connection details</h2>
          <Badge variant="outline">{connection.engine}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {app.remoteAccessHost && (
            <Select value={network} onValueChange={(value) => setNetwork(value as Network)}>
              <SelectTrigger size="sm" aria-label="Network">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={format} onValueChange={(value) => setFormat(value as Format)}>
            <SelectTrigger size="sm" aria-label="Connection format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="url">Connection string</SelectItem>
              <SelectItem value="params">Parameters</SelectItem>
              <SelectItem value="env">Environment variable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="mt-3">
        <CardContent className="flex flex-col gap-3">
          {format === "params" ? (
            <dl className="divide-y divide-border">
              {params.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <dt className="w-20 shrink-0 text-xs text-muted-foreground">{p.label}</dt>
                  <dd className="min-w-0 flex-1 truncate font-mono text-xs">{p.secret ? shown(p.value) : p.value}</dd>
                  <div className="flex shrink-0 items-center">
                    {p.secret && revealButton}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${p.label.toLowerCase()}`} onClick={() => copy(p.value, p.label)}>
                      <CopyIcon />
                    </Button>
                  </div>
                </div>
              ))}
            </dl>
          ) : (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 bg-muted px-2.5 py-2 font-mono text-xs break-all">{line.display}</code>
              <div className="flex shrink-0 items-center">
                {revealButton}
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${line.label}`} onClick={() => copy(line.value, line.label)}>
                  <CopyIcon />
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {publicHost
              ? "Public: TLS is required, and the certificate is a real Let's Encrypt one, so verify-full works. Clients older than libpq 16 need sslmode=require instead."
              : "Internal: reachable from your other apps on this server, not from the internet."}
            {connection.initOnlyCredentials && " The password is only read when the database is first created, so changing it in Environment later won't change the real one."}
          </p>

          {remoteAccessAvailable && (
            <div className="flex items-start justify-between gap-3 border-t pt-3">
              <div className="min-w-0">
                <h3 className="text-xs font-medium">Public access</h3>
                {!settings.data?.remoteDatabaseAccess ? (
                  <p className="text-xs text-muted-foreground">
                    Turn on{" "}
                    <a href="/settings" className="underline">
                      Remote database access
                    </a>{" "}
                    in Settings to reach this database from outside this server.
                  </p>
                ) : app.remoteAccessHost ? (
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{app.remoteAccessHost}</span>, allowed from {app.remoteAccessAllowlist}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Off. Only apps on this server can connect.</p>
                )}
              </div>
              {settings.data?.remoteDatabaseAccess && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={openDialog}>
                    {app.remoteAccessHost ? "Edit" : "Enable"}
                  </Button>
                  {app.remoteAccessHost && (
                    <Button type="button" size="sm" variant="ghost" disabled={disable.isPending} onClick={() => disable.mutate()}>
                      {disable.isPending ? "Disabling…" : "Disable"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Public access</DialogTitle>
            <DialogDescription>
              The database answers on port 5432 for this host only, over TLS. If your cloud provider has its own firewall (Oracle Cloud security lists, AWS security groups),
              allow TCP 5432 there as well.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-remote-host">Host</Label>
              <div className="flex gap-2">
                <Input id="db-remote-host" placeholder="db.example.com" value={host} onChange={(e) => setHost(e.target.value)} className="flex-1 font-mono" />
                <Button type="button" variant="outline" size="sm" onClick={() => api.suggestKuberfyDomain().then((d) => setHost(d.host))}>
                  <SparkleIcon /> Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">A generated host needs no DNS setup and gets a Let's Encrypt certificate.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-remote-allowlist">Allowed IPs</Label>
              <Input
                id="db-remote-allowlist"
                placeholder="203.0.113.10, 198.51.100.0/24"
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Comma-separated IPs or CIDR ranges. Everything else is refused before it reaches the database.</p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={host.trim().length === 0 || allowlist.trim().length === 0 || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
