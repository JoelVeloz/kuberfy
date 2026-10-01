import * as React from "react";
import { CopyIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiApplicationDetail } from "@/lib/api";
import { databaseConnection, MASKED_PASSWORD, type DatabaseEndpoint } from "@/lib/database-connection";
import { settingsQuery } from "@/lib/queries";

type Format = "url" | "params" | "env";

async function copy(text: string, label: string) {
  if (!navigator.clipboard) {
    toast.error("Copying needs the dashboard to be served over HTTPS.");
    return;
  }
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copied.`);
}

export function DatabaseConnectionCard({ app }: { app: ApiApplicationDetail }) {
  const connection = React.useMemo(() => databaseConnection(app), [app]);
  const [format, setFormat] = React.useState<Format>("url");
  const settings = useQuery(settingsQuery());
  const domain = settings.data?.kuberfyDomain;
  const publicEndpoint: DatabaseEndpoint | undefined = app.hostPort != null && domain ? { host: domain, port: app.hostPort } : undefined;
  const [network, setNetwork] = React.useState<"internal" | "public" | null>(null);
  const [revealed, setRevealed] = React.useState(false);

  if (!connection) return null;

  const { user, password, database } = connection.credentials;
  const endpoint = network === "internal" ? undefined : publicEndpoint;
  const shown = (value: string) => (revealed ? value : MASKED_PASSWORD);

  const params = [
    { label: "Host", value: endpoint?.host ?? connection.host },
    { label: "Port", value: String(endpoint?.port ?? connection.port) },
    ...(user ? [{ label: "User", value: user }] : []),
    ...(password ? [{ label: "Password", value: password, secret: true }] : []),
    ...(database ? [{ label: "Database", value: database }] : []),
  ];

  const line =
    format === "env"
      ? {
          label: connection.envName,
          display: `${connection.envName}=${connection.url(revealed, endpoint)}`,
          value: `${connection.envName}=${connection.url(true, endpoint)}`,
        }
      : { label: "Connection string", display: connection.url(revealed, endpoint), value: connection.url(true, endpoint) };

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
          {publicEndpoint && (
            <Select value={endpoint ? "public" : "internal"} onValueChange={(value) => setNetwork(value as "internal" | "public")}>
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
            {endpoint
              ? `Public: port ${endpoint.port} on this server forwards to ${connection.port} inside the container. No TLS, so rely on a strong password or your firewall.`
              : `Internal: port ${connection.port}, reachable from your other apps on this server, not from the internet.${app.hostPort == null ? " Turn on its public port in Domains to reach it from outside." : ""}`}
            {connection.initOnlyCredentials && " The password is only read when the database is first created, so changing it in Environment later won't change the real one."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
