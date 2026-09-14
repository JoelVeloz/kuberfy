import * as React from "react";
import { ArrowClockwise, Cube, Eye, EyeSlash, GithubLogo } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, type ApiMarketplaceTemplate } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";
import { toastError } from "@/lib/toast";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join("");
}

function TemplateCard({ template, onSelect }: { template: ApiMarketplaceTemplate; onSelect: () => void }) {
  return (
    <Card className="relative cursor-pointer transition-colors hover:border-foreground/30" onClick={onSelect}>
      <CardContent className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          {template.logo && <img src={template.logo} alt="" className="size-5 shrink-0" onError={(e) => e.currentTarget.remove()} />}
          <span className="font-medium">{template.name}</span>
          {template.image ? (
            <Cube weight="bold" className="size-3.5 shrink-0 text-blue-500" title="Deploys a prebuilt Docker image" />
          ) : (
            <GithubLogo weight="bold" className="size-3.5 shrink-0 text-foreground" title="Builds from a Git repository" />
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{template.description || "No description provided."}</p>
      </CardContent>
    </Card>
  );
}

function ConfigureTemplate({ template, projId, onBack }: { template: ApiMarketplaceTemplate; projId: string; onBack: () => void }) {
  const isDockerfile = template.image == null;
  const [name, setName] = React.useState(template.id);
  const [image, setImage] = React.useState(template.image ?? "");
  const [envValues, setEnvValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(template.envVars.map((v) => [v.key, v.secret ? generateSecret() : (v.default ?? "")])),
  );
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const app = await api.createApplication({
        projectId: projId,
        name: name.trim(),
        repoUrl: isDockerfile ? template.repoUrl! : image.trim(),
        branch: isDockerfile ? (template.branch ?? "main") : "main",
        buildType: isDockerfile ? "dockerfile" : "image",
        dockerfilePath: isDockerfile ? template.dockerfilePath : undefined,
        port: template.port ?? undefined,
        envVars: Object.keys(envValues).length > 0 ? JSON.stringify(envValues) : undefined,
      });
      for (const mountPath of template.volumes) await api.createVolume(app.id, mountPath);
      return app;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projId, "apps"] });
      window.location.href = `/projects/view?id=${projId}`;
    },
    onError: (err) => toastError(err, "Failed to deploy template."),
  });

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="w-fit text-xs text-muted-foreground hover:text-foreground">
        ← Back to marketplace
      </button>
      <div>
        <h1 className="font-heading text-lg font-medium">{template.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {isDockerfile ? (
            <>
              Building from <span className="font-mono text-foreground">{template.repoUrl}</span>
            </>
          ) : (
            <>
              Deploying <span className="font-mono text-foreground">{image.trim() || template.image}</span>
            </>
          )}
          {template.port && (
            <>
              {" "}
              on internal port <span className="font-mono text-foreground">{template.port}</span>
            </>
          )}
          . {template.volumes.length > 0 && `Persistent storage will be provisioned at ${template.volumes.join(", ")}.`}
        </p>
      </div>

      <Card className="max-w-lg">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">Application name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {!isDockerfile && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-image">Image</Label>
              <Input id="tpl-image" className="font-mono" value={image} onChange={(e) => setImage(e.target.value)} placeholder="e.g. mariadb:11" />
              <p className="text-xs text-muted-foreground">Change the tag to deploy a different version.</p>
            </div>
          )}
          {template.envVars.length > 0 && (
            <div className="flex flex-col gap-3">
              <Label>Environment variables</Label>
              {template.envVars.map((v) => (
                <div key={v.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`tpl-env-${v.key}`} className="font-mono text-xs font-normal text-muted-foreground">
                    {v.key}
                  </Label>
                  {v.secret ? (
                    <div className="flex gap-2">
                      <Input
                        id={`tpl-env-${v.key}`}
                        className="flex-1 font-mono"
                        type={revealed[v.key] ? "text" : "password"}
                        value={envValues[v.key]}
                        onChange={(e) => setEnvValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={revealed[v.key] ? `Hide ${v.key}` : `Reveal ${v.key}`}
                        onClick={() => setRevealed((prev) => ({ ...prev, [v.key]: !prev[v.key] }))}
                      >
                        {revealed[v.key] ? <EyeSlash /> : <Eye />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Generate ${v.key}`}
                        onClick={() => setEnvValues((prev) => ({ ...prev, [v.key]: generateSecret() }))}
                      >
                        <ArrowClockwise />
                      </Button>
                    </div>
                  ) : (
                    <Input id={`tpl-env-${v.key}`} value={envValues[v.key]} onChange={(e) => setEnvValues((prev) => ({ ...prev, [v.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button disabled={name.trim().length === 0 || (!isDockerfile && image.trim().length === 0) || isPending} onClick={() => mutate()}>
              {isPending ? "Deploying…" : "Deploy"}
            </Button>
            <Button variant="outline" onClick={onBack}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MarketplaceBrowserInner() {
  const projId = getQueryParam("project");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<ApiMarketplaceTemplate | null>(null);
  const project = useQuery({ queryKey: ["project", projId], queryFn: () => api.getProject(projId), enabled: projId.length > 0 });
  const templates = useQuery({ queryKey: ["marketplace-templates"], queryFn: api.listMarketplaceTemplates });

  if (projId.length === 0) {
    return <p className="text-xs text-muted-foreground">No project selected. Open the marketplace from within a project.</p>;
  }

  if (project.error instanceof UnauthorizedError) return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (selected) {
    return <ConfigureTemplate template={selected} projId={projId} onBack={() => setSelected(null)} />;
  }

  const filtered = (templates.data ?? []).filter((t) => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return true;
    return t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
  });
  const databases = filtered.filter((t) => t.category === "database");
  const applications = filtered.filter((t) => t.category === "application");
  const boilerplates = filtered.filter((t) => t.category === "boilerplate");

  return (
    <>
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <a href="/" className="transition-colors hover:text-foreground">
          Projects
        </a>
        <span className="text-border">/</span>
        <a href={`/projects/view?id=${projId}`} className="transition-colors hover:text-foreground">
          {project.data?.name ?? "Project"}
        </a>
        <span className="text-border">/</span>
        <span className="text-foreground">Marketplace</span>
      </div>

      <h1 className="font-heading text-lg font-medium">Marketplace</h1>
      <p className="mt-1 text-xs text-muted-foreground">One-click templates for popular self-hosted apps.</p>

      <Input placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-6 max-w-sm" />

      {templates.isPending ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-4 py-6 text-xs text-muted-foreground">No templates match "{search}".</p>
      ) : (
        <>
          {databases.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium">Databases</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {databases.map((t) => (
                  <TemplateCard key={t.id} template={t} onSelect={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}
          {applications.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium">Applications</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {applications.map((t) => (
                  <TemplateCard key={t.id} template={t} onSelect={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}
          {boilerplates.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium">Boilerplate Templates</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {boilerplates.map((t) => (
                  <TemplateCard key={t.id} template={t} onSelect={() => setSelected(t)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function MarketplaceBrowser() {
  return (
    <QueryProvider>
      <MarketplaceBrowserInner />
    </QueryProvider>
  );
}
