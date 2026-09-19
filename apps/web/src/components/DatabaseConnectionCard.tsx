import * as React from "react";
import { CopyIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApplicationTab } from "@/components/ApplicationShell";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { databaseConnection, MASKED_PASSWORD } from "@/lib/database-connection";

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

export function DatabaseConnectionCard({ app, onSelectTab }: { app: ApiApplicationDetail; onSelectTab: (tab: ApplicationTab) => void }) {
  const connection = React.useMemo(() => databaseConnection(app), [app]);
  const remoteAccessAvailable = connection?.engine === "PostgreSQL";
  const publicDomain = remoteAccessAvailable ? (app.domains.find((d) => d.isPrimary) ?? app.domains[0]) : undefined;
  const [format, setFormat] = React.useState<Format>("url");
  const [network, setNetwork] = React.useState<Network>(publicDomain ? "public" : "internal");
  const [revealed, setRevealed] = React.useState(false);
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: remoteAccessAvailable });

  if (!connection) return null;

  const { user, password, database } = connection.credentials;
  const publicHost = network === "public" ? publicDomain?.host : undefined;
  const shown = (value: string) => (revealed ? value : MASKED_PASSWORD);

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

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-sm font-medium">Connection details</h2>
          <Badge variant="outline">{connection.engine}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {publicDomain && (
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
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {!publicDomain
                  ? "Not reachable from outside this server. Add a domain to allow it."
                  : settings.data && !settings.data.remoteDatabaseAccess
                    ? "Public domain set, but remote database access is off in Settings."
                    : `Public at ${publicDomain.host}, allowed from ${publicDomain.allowlist ?? "nowhere"}.`}
              </p>
              <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onSelectTab("domains")}>
                {publicDomain ? "Manage in Domains" : "Add domain"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
