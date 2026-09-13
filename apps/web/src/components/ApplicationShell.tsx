import * as React from "react";
import { ArrowClockwise, ArrowSquareOut, RocketLaunch, Stop as StopIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { QueryProvider } from "@/components/QueryProvider";
import { DeleteApplicationDialog } from "@/components/DeleteApplicationDialog";
import { DeploymentStatusBadge } from "@/components/DeploymentStatusBadge";
import { OverviewContent } from "@/components/ApplicationOverviewTab";
import { LogsContent } from "@/components/ApplicationLogsTab";
import { DeploymentsContent } from "@/components/ApplicationDeploymentsTab";
import { DomainsContent } from "@/components/ApplicationDomainsTab";
import { VolumesContent } from "@/components/ApplicationVolumesTab";
import { EnvironmentContent } from "@/components/ApplicationEnvironmentTab";
import { ResourcesContent } from "@/components/ApplicationResourcesTab";
import { api, UnauthorizedError, NotFoundError, type ApiApplicationDetail } from "@/lib/api";
import { isDeploymentInProgress } from "@/lib/deployment-status";
import { getQueryParam } from "@/lib/query-params";
import { toastError } from "@/lib/toast";

// Lazy: @xterm/xterm touches browser globals at import time, which crashes this island's SSR pass if it's
// pulled in eagerly — deferred to only load once someone actually opens the Terminal tab.
const TerminalContent = React.lazy(() => import("@/components/ApplicationTerminalTab").then((m) => ({ default: m.TerminalContent })));

// Compact "3d 4h" / "2h 15m" / "45m" / "12s" — coarsest two units, dropping to one once it's the largest
function formatUptime(since: string): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${totalSeconds}s`;
}

export type ApplicationTab = "overview" | "deployments" | "logs" | "terminal" | "domains" | "volumes" | "environment" | "resources";

const TABS: Array<{ id: ApplicationTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Logs" },
  { id: "terminal", label: "Terminal" },
  { id: "domains", label: "Domains" },
  { id: "volumes", label: "Volumes" },
  { id: "environment", label: "Environment" },
  { id: "resources", label: "Resources" },
];

function isApplicationTab(value: string): value is ApplicationTab {
  return TABS.some((tab) => tab.id === value);
}

function readTabFromUrl(): ApplicationTab {
  const raw = getQueryParam("tab");
  return isApplicationTab(raw) ? raw : "overview";
}

async function fetchApp(id: string): Promise<ApiApplicationDetail> {
  const app = await api.getApplication(id);
  document.title = `${app.name} · Kuberfy`;
  return app;
}

// A single page/island for the whole application detail view — tabs switch via client state instead of each
// being its own route, so the header, breadcrumb, and the `application` query it all shares survive a tab
// change instead of refetching and remounting from a blank page every time.
export function ApplicationShell() {
  return (
    <QueryProvider>
      <ApplicationShellInner />
    </QueryProvider>
  );
}

function ApplicationShellInner() {
  const id = getQueryParam("id");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<ApplicationTab>(readTabFromUrl);

  React.useEffect(() => {
    const onPopState = () => setActiveTab(readTabFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function selectTab(tab: ApplicationTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.pushState({}, "", url);
  }

  const query = useQuery({
    queryKey: ["application", id],
    queryFn: () => fetchApp(id),
    refetchInterval: (q) => (q.state.data?.deployments[0] && isDeploymentInProgress(q.state.data.deployments[0].status) ? 2000 : false),
  });
  const project = useQuery({
    queryKey: ["project", query.data?.projectId],
    queryFn: () => api.getProject(query.data!.projectId),
    enabled: !!query.data,
  });

  // Ticks the uptime string forward every second while the container is running; no other state here changes on its own
  const runningSince = query.data?.deployments[0]?.status === "running" ? query.data.deployments[0].updatedAt : null;
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    if (!runningSince) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1_000);
    return () => clearInterval(interval);
  }, [runningSince]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["application", id] });
  const deploy = useMutation({
    mutationFn: () => api.deploy(id),
    onSuccess: () => {
      toast.success("Deployment started.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to start deployment."),
  });
  const restart = useMutation({
    mutationFn: () => api.restartApplication(id),
    onSuccess: () => {
      toast.success("Application restarted.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to restart application."),
  });
  const stop = useMutation({
    mutationFn: () => api.stopApplication(id),
    onSuccess: () => {
      toast.success("Application stopped.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to stop application."),
  });

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
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
  const projectName = project.data?.name ?? "Project";
  const latestStatus = app.deployments[0]?.status;
  const deploying = deploy.isPending || isDeploymentInProgress(latestStatus);
  const hasDeployedContainer = app.deployments.length > 0 && latestStatus !== undefined;
  const canStop = hasDeployedContainer && latestStatus === "running";
  const primaryDomain = app.domains.find((d) => d.isPrimary);

  return (
    <>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/projects/view?id=${app.projectId}`}>{projectName}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{app.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-lg font-medium">{app.name}</h1>
        <Badge variant="outline">{app.buildType}</Badge>
        {latestStatus && <DeploymentStatusBadge status={latestStatus} />}
        {runningSince && <span className="text-xs text-muted-foreground">Up {formatUptime(runningSince)}</span>}
        <div className="ml-auto flex items-center gap-2">
          {primaryDomain && (
            <Button size="sm" variant="outline" asChild>
              <a href={`http://${primaryDomain.host}`} target="_blank" rel="noreferrer">
                Visit <ArrowSquareOut />
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!hasDeployedContainer || restart.isPending || stop.isPending} onClick={() => restart.mutate()}>
            <ArrowClockwise /> {restart.isPending ? "Restarting…" : "Restart"}
          </Button>
          <Button size="sm" variant="outline" disabled={!canStop || restart.isPending || stop.isPending} onClick={() => stop.mutate()}>
            <StopIcon /> {stop.isPending ? "Stopping…" : "Stop"}
          </Button>
          <Button size="sm" disabled={deploying} onClick={() => deploy.mutate()}>
            <RocketLaunch /> {deploying ? "Deploying…" : "Deploy"}
          </Button>
          <DeleteApplicationDialog applicationId={app.id} applicationName={app.name} projectId={app.projectId} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {app.repoUrl} <span className="text-border">·</span> <span className="font-mono">{app.branch}</span>
      </p>

      <nav className="mt-6 flex items-center gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={`border-b px-3 py-2 text-xs font-medium transition-colors ${
              tab.id === activeTab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "overview" && <OverviewContent app={app} onSelectTab={selectTab} />}
        {activeTab === "deployments" && <DeploymentsContent app={app} />}
        {activeTab === "logs" && <LogsContent app={app} />}
        {activeTab === "terminal" && (
          <React.Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <TerminalContent app={app} />
          </React.Suspense>
        )}
        {activeTab === "domains" && <DomainsContent app={app} />}
        {activeTab === "volumes" && <VolumesContent app={app} />}
        {activeTab === "environment" && <EnvironmentContent app={app} />}
        {activeTab === "resources" && <ResourcesContent app={app} />}
      </div>
    </>
  );
}
