import { Card, CardContent } from "@/components/ui/card";
import { AddDomainDialog, DomainsCard } from "@/components/DomainsCard";
import { HostPortCard } from "@/components/HostPortCard";
import type { ApiApplicationDetail } from "@/lib/api";
import { databaseConnection } from "@/lib/database-connection";

export function DomainsContent({ app }: { app: ApiApplicationDetail }) {
  if (databaseConnection(app)) return <HostPortCard app={app} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-medium">Domains</h2>
            <p className="mt-1 text-xs text-muted-foreground">Each domain routes to its own port inside the container.</p>
          </div>
          <AddDomainDialog applicationId={app.id} />
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
