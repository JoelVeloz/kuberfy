import { ArrowRight } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { ApplicationShell } from "@/components/ApplicationShell";
import { ApplicationStatsChart } from "@/components/ApplicationStatsChart";
import type { ApiApplicationDetail } from "@/lib/api";

// Client island: the application's landing tab — a quick summary with links into the other tabs, rather than
// repeating their full content here.
export function ApplicationOverviewTab() {
  return <ApplicationShell activeTab="overview">{(app) => <OverviewContent app={app} />}</ApplicationShell>;
}

function OverviewContent({ app }: { app: ApiApplicationDetail }) {
  const latest = app.deployments[0];

  return (
    <div className="flex flex-col gap-6">
      {latest?.status === "running" && (
        <div>
          <h2 className="font-heading text-sm font-medium">Resource usage</h2>
          <div className="mt-3">
            <ApplicationStatsChart applicationId={app.id} />
          </div>
        </div>
      )}

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
                <p className="text-xs text-muted-foreground">No deployments yet — hit Deploy to build and run this application for the first time.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <SummaryLink
            href={`/applications/domains?id=${app.id}`}
            title="Domains"
            value={app.domains.length}
            description={app.domains.length === 1 ? "domain configured" : "domains configured"}
          />
          <SummaryLink
            href={`/applications/environment?id=${app.id}`}
            title="Environment variables"
            value={app.envVars ? Object.keys(JSON.parse(app.envVars) as Record<string, string>).length : 0}
            description="variables set"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryLink({ href, title, value, description }: { href: string; title: string; value: number; description: string }) {
  return (
    <a href={href} className="group block">
      <h2 className="font-heading text-sm font-medium">{title}</h2>
      <Card className="mt-3 transition-colors group-hover:bg-muted/30">
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-heading text-lg font-medium text-foreground">{value}</span> {description}
          </p>
          <ArrowRight className="text-muted-foreground transition-colors group-hover:text-foreground" />
        </CardContent>
      </Card>
    </a>
  );
}
