import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { AnsiLog } from "@/components/AnsiLog";
import { api, UnauthorizedError, NotFoundError, type ApiApplicationDetail } from "@/lib/api";
import { isDeploymentInProgress } from "@/lib/deployment-status";
import { getQueryParam } from "@/lib/query-params";
import type { DeploymentStatus } from "@/lib/types";
import { apiWsUrl } from "@/lib/api-url";

async function fetchApp(id: string): Promise<ApiApplicationDetail> {
  const app = await api.getApplication(id);
  document.title = `Build log · ${app.name} · Kuberfy`;
  return app;
}

// Client island: independent page for a single deployment's build log — streams live while the build is in progress,
// falls back to the persisted snapshot once it's finished.
export function DeploymentLogPage() {
  return (
    <QueryProvider>
      <DeploymentLogPageInner />
    </QueryProvider>
  );
}

function DeploymentLogPageInner() {
  const applicationId = getQueryParam("id");
  const deploymentId = getQueryParam("deploymentId");
  const query = useQuery({ queryKey: ["application", applicationId], queryFn: () => fetchApp(applicationId) });
  const deploymentQuery = useQuery({ queryKey: ["deployment", applicationId, deploymentId], queryFn: () => api.getDeployment(applicationId, deploymentId) });
  const projectId = query.data?.projectId;
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId!), enabled: !!projectId });

  if (query.isPending || deploymentQuery.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-80 w-full" />
      </div>
    );
  }

  if (query.error instanceof UnauthorizedError) return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (query.error instanceof NotFoundError) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Application not found.</p>
        <a href="/" className="mt-2 inline-block text-xs text-foreground underline">
          Back to projects
        </a>
      </div>
    );
  }

  if (query.error) return <p className="text-xs text-muted-foreground">Failed to load application.</p>;

  const app = query.data;
  const deployment = deploymentQuery.data;

  if (!deployment) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Deployment not found.</p>
        <a href={`/applications/view?id=${app.id}`} className="mt-2 inline-block text-xs text-foreground underline">
          Back to {app.name}
        </a>
      </div>
    );
  }

  return (
    <>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/projects/view?id=${app.projectId}`}>{project.data?.name ?? "Project"}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/applications/view?id=${app.id}`}>{app.name}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Build log</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-lg font-medium">Build log</h1>
        <DeploymentStatusBadge status={deployment.status} />
        <a href={`/applications/view?id=${app.id}`} className={buttonVariants({ size: "sm", variant: "outline", className: "ml-auto" })}>
          Back to application
        </a>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {deployment.commitSha ?? "—"} <span className="text-border">·</span>{" "}
        {new Date(deployment.createdAt).toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        })}
      </p>

      <Card className="mt-6">
        <CardContent className="px-0">
          <BuildLog applicationId={app.id} deploymentId={deployment.id} status={deployment.status} snapshot={deployment.logs} />
        </CardContent>
      </Card>
    </>
  );
}

function BuildLog({ applicationId, deploymentId, status, snapshot }: { applicationId: string; deploymentId: string; status: DeploymentStatus; snapshot: string | null }) {
  const live = isDeploymentInProgress(status);
  const [lines, setLines] = React.useState<string[]>([]);
  const [connected, setConnected] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    if (!live) return;
    const ws = new WebSocket(apiWsUrl(`/api/applications/${applicationId}/deployments/${deploymentId}/build-logs`));
    ws.onopen = () => setConnected(true);
    ws.onmessage = (evt) => setLines((prev) => [...prev, String(evt.data)]);
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [live, applicationId, deploymentId]);

  React.useEffect(() => {
    preRef.current?.scrollTo({ top: preRef.current.scrollHeight });
  }, [lines]);

  if (!live) return <AnsiLog text={snapshot ?? ""} className="max-h-[70vh] break-all" />;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-4 text-xs text-muted-foreground">
        <span className={`size-1.5 rounded-full ${connected ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
        {connected ? "Streaming live" : "Connecting…"}
      </div>
      <AnsiLog ref={preRef} text={lines.join("\n")} className="max-h-[70vh] break-all" />
    </div>
  );
}
