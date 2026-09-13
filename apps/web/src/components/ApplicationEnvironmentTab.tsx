import { Card, CardContent } from "@/components/ui/card";
import { AddVariableDialog, BulkEditDialog, EnvVarsCard } from "@/components/EnvVarsCard";
import type { ApiApplicationDetail } from "@/lib/api";

// Environment variables applied to the container.
export function EnvironmentContent({ app }: { app: ApiApplicationDetail }) {
  const envVars = app.envVars ? (JSON.parse(app.envVars) as Record<string, string>) : {};

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-medium">Environment variables</h2>
        <div className="flex items-center gap-2">
          <BulkEditDialog applicationId={app.id} envVars={envVars} />
          <AddVariableDialog applicationId={app.id} envVars={envVars} />
        </div>
      </div>
      <Card className="mt-3">
        <CardContent>
          <EnvVarsCard applicationId={app.id} envVars={envVars} />
        </CardContent>
      </Card>
    </>
  );
}
