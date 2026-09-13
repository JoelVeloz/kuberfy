import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeploymentsPanel } from "@/components/DeploymentsPanel";
import { DomainsCard } from "@/components/DomainsCard";
import { RuntimeLogs } from "@/components/RuntimeLogs";
import { api, UnauthorizedError, NotFoundError, type ApiApplicationDetail } from "@/lib/api";
import { isDeploymentInProgress } from "@/lib/deployment-status";

type State =
  { status: "loading" } | { status: "unauthorized" } | { status: "not-found" } | { status: "error" } | { status: "ready"; app: ApiApplicationDetail; projectName: string };

// Client island: the real application id only exists at request time, so it's read from the URL and fetched here
export function ApplicationDetail() {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [deploying, setDeploying] = React.useState(false);
  const id = React.useMemo(() => (typeof window === "undefined" ? "" : (window.location.pathname.split("/").filter(Boolean).pop() ?? "")), []);

  const refresh = React.useCallback(async () => {
    try {
      const app = await api.getApplication(id);
      const project = await api.getProject(app.projectId).catch(() => null);
      document.title = `${app.name} · Kuberfy`;
      setState({ status: "ready", app, projectName: project?.name ?? "Project" });
      return app;
    } catch (err) {
      if (err instanceof UnauthorizedError) setState({ status: "unauthorized" });
      else if (err instanceof NotFoundError) setState({ status: "not-found" });
      else setState({ status: "error" });
      return null;
    }
  }, [id]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const app = await refresh();
      if (!cancelled && app?.deployments[0] && isDeploymentInProgress(app.deployments[0].status)) setDeploying(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  React.useEffect(() => {
    if (!deploying) return;
    const interval = setInterval(async () => {
      const app = await refresh();
      if (app && !(app.deployments[0] && isDeploymentInProgress(app.deployments[0].status))) setDeploying(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [deploying, refresh]);

  async function handleDeploy() {
    setDeploying(true);
    await api.deploy(id);
    await refresh();
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  if (state.status === "unauthorized") return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (state.status === "not-found") {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Application not found.</p>
        <a href="/" className="mt-2 inline-block text-xs text-foreground underline">
          Back to projects
        </a>
      </div>
    );
  }

  if (state.status === "error") return <p className="text-xs text-muted-foreground">Failed to load application.</p>;

  const { app, projectName } = state;
  const envVarEntries = Object.entries(app.envVars ? (JSON.parse(app.envVars) as Record<string, string>) : {});

  return (
    <>
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <a href={`/projects/${app.projectId}`} className="transition-colors hover:text-foreground">
          {projectName}
        </a>
        <span className="text-border">/</span>
        <span className="text-foreground">{app.name}</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-lg font-medium">{app.name}</h1>
        <Badge variant="outline">{app.buildType}</Badge>
        <Button size="sm" className="ml-auto" disabled={deploying} onClick={handleDeploy}>
          {deploying ? "Deploying…" : "Deploy"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {app.repoUrl} <span className="text-border">·</span> <span className="font-mono">{app.branch}</span>
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-heading text-sm font-medium">Deployments</h2>
          <p className="mt-1 text-xs text-muted-foreground">Build and release history for this application.</p>
          <Card className="mt-3">
            <CardContent className="px-4">
              <DeploymentsPanel deployments={app.deployments} />
            </CardContent>
          </Card>

          <h2 className="mt-8 font-heading text-sm font-medium">Runtime logs</h2>
          <p className="mt-1 text-xs text-muted-foreground">Live output streamed from the running container.</p>
          <RuntimeLogs applicationId={app.id} />
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-heading text-sm font-medium">Domains</h2>
            <Card className="mt-3">
              <CardContent>
                <DomainsCard applicationId={app.id} initialDomains={app.domains} />
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="font-heading text-sm font-medium">Environment variables</h2>
            <Card className="mt-3">
              <CardContent>
                {envVarEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No environment variables configured.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {envVarEntries.map(([key]) => (
                      <li key={key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono">{key}</span>
                        <span className="font-mono text-muted-foreground">••••••••</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
