import { Card, CardContent } from "@/components/ui/card";
import { DeploymentsPanel } from "@/components/DeploymentsPanel";
import { ApplicationShell } from "@/components/ApplicationShell";

// Client island: full build/release history for the application, as its own tab/page.
export function ApplicationDeploymentsTab() {
  return (
    <ApplicationShell activeTab="deployments">
      {(app) => (
        <>
          <h2 className="font-heading text-sm font-medium">Deployments</h2>
          <p className="mt-1 text-xs text-muted-foreground">Build and release history for this application.</p>
          <Card className="mt-3">
            <CardContent className="px-4">
              <DeploymentsPanel applicationId={app.id} />
            </CardContent>
          </Card>
        </>
      )}
    </ApplicationShell>
  );
}
