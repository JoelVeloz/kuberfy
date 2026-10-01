import { ArrowRight } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { ApplicationStatsChart } from "@/components/ApplicationStatsChart";
import { DatabaseConnectionCard } from "@/components/DatabaseConnectionCard";
import type { ApplicationTab } from "@/components/ApplicationShell";
import type { ApiApplicationDetail } from "@/lib/api";

export function OverviewContent({ app, onSelectTab }: { app: ApiApplicationDetail; onSelectTab: (tab: ApplicationTab) => void }) {
  const latest = app.deployments[0];

  return (
    <div className="flex flex-col gap-6">
      {latest?.status === "running" && (
        <div>
          <h2 className="font-heading text-sm font-medium">Resource usage</h2>
          <div className="mt-3">
            <ApplicationStatsChart applicationId={app.id} cpuLimit={app.cpuLimit} />
          </div>
        </div>
      )}

      <DatabaseConnectionCard app={app} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-heading text-sm font-medium">Latest deployment</h2>
          <Card className="mt-3">
            <CardContent>
              {latest ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <DeploymentStatusBadge status={latest.status} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {latest.commitSha ?? "—"} <span className="text-border">·</span>{" "}
                      {new Date(latest.createdAt).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    </p>
                  </div>
                  <a href={`/applications/deployment?id=${app.id}&deploymentId=${latest.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    View log
                  </a>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No deployments yet. Hit Deploy to run this app.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <SummaryLink
            onClick={() => onSelectTab("domains")}
            title="Domains"
            value={app.domains.length}
            description={app.domains.length === 1 ? "domain configured" : "domains configured"}
          />
          <SummaryLink
            onClick={() => onSelectTab("environment")}
            title="Environment variables"
            value={app.envVars ? Object.keys(JSON.parse(app.envVars) as Record<string, string>).length : 0}
            description="variables set"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryLink({ onClick, title, value, description }: { onClick: () => void; title: string; value: number; description: string }) {
  return (
    <button type="button" onClick={onClick} className="group block text-left">
      <h2 className="font-heading text-sm font-medium">{title}</h2>
      <Card className="mt-3 transition-colors group-hover:bg-muted/30">
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-heading text-lg font-medium text-foreground">{value}</span> {description}
          </p>
          <ArrowRight className="text-muted-foreground transition-colors group-hover:text-foreground" />
        </CardContent>
      </Card>
    </button>
  );
}
