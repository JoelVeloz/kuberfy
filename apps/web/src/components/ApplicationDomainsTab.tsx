import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AddDomainDialog, DomainsCard } from "@/components/DomainsCard";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { databaseConnection } from "@/lib/database-connection";

export function DomainsContent({ app }: { app: ApiApplicationDetail }) {
  const isDatabase = databaseConnection(app)?.engine === "PostgreSQL";
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: isDatabase });
  const remoteAccessOff = isDatabase && settings.data && !settings.data.remoteDatabaseAccess;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm font-medium">Domains</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isDatabase ? "Each domain accepts TLS connections on port 5432, only from its allowed IPs." : "Each domain routes to its own port inside the container."}
          </p>
        </div>
        <AddDomainDialog applicationId={app.id} isDatabase={isDatabase} />
      </div>
      {remoteAccessOff && (
        <p className="mt-3 text-xs text-muted-foreground">
          Remote database access is off in{" "}
          <a href="/settings" className="underline">
            Settings
          </a>
          , so these domains won't answer until you turn it on.
        </p>
      )}
      <Card className="mt-3">
        <CardContent>
          <DomainsCard applicationId={app.id} domains={app.domains} isDatabase={isDatabase} />
        </CardContent>
      </Card>
    </>
  );
}
