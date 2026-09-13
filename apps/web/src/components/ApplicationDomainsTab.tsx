import { Card, CardContent } from "@/components/ui/card";
import { AddDomainDialog, DomainsCard } from "@/components/DomainsCard";
import { ApplicationShell } from "@/components/ApplicationShell";

// Client island: custom domains routed to this application via Traefik, as its own tab/page.
export function ApplicationDomainsTab() {
  return (
    <ApplicationShell activeTab="domains">
      {(app) => (
        <>
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
        </>
      )}
    </ApplicationShell>
  );
}
