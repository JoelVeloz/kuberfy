import { Card, CardContent } from "@/components/ui/card";
import { AddDomainDialog, DomainsCard } from "@/components/DomainsCard";
import { HostPortCard } from "@/components/HostPortCard";
import type { ApiApplicationDetail } from "@/lib/api";
import { databaseConnection } from "@/lib/database-connection";

export function DomainsContent({ app }: { app: ApiApplicationDetail }) {
  const isDatabase = databaseConnection(app) != null;
  if (isDatabase && app.domains.length === 0) return <HostPortCard app={app} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-medium">Domains</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isDatabase ? "Databases don't serve HTTP — these old domains can only be removed." : "Each domain routes to its own port inside the container."}
            </p>
          </div>
          {!isDatabase && <AddDomainDialog applicationId={app.id} />}
        </div>
        <Card className="mt-3">
          <CardContent>
            <DomainsCard applicationId={app.id} domains={app.domains} />
          </CardContent>
        </Card>
      </div>
      <HostPortCard app={app} />
    </div>
  );
}
