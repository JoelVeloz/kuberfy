import { Card, CardContent } from "@/components/ui/card";
import { DeploymentsPanel } from "@/components/DeploymentsPanel";
import type { ApiApplicationDetail } from "@/lib/api";

// Full build/release history for the application.
export function DeploymentsContent({ app }: { app: ApiApplicationDetail }) {
  return (
    <>
      <h2 className="font-heading text-sm font-medium">Deployments</h2>
      <p className="mt-1 text-xs text-muted-foreground">Build and release history for this application.</p>
      <Card className="mt-3">
        <CardContent className="px-4">
          <DeploymentsPanel applicationId={app.id} />
        </CardContent>
      </Card>
    </>
  );
}
