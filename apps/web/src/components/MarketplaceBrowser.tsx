import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, type ApiMarketplaceTemplate } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";
import { toastError } from "@/lib/toast";

// Generates an editable default for secret-looking env vars (passwords, keys) — never sent anywhere,
// just a reasonable starting value so "Deploy" works without the user having to invent one first.
function generateSecret() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

function TemplateCard({ template, onSelect }: { template: ApiMarketplaceTemplate; onSelect: () => void }) {
  return (
    <Card className="relative cursor-pointer transition-colors hover:border-foreground/30" onClick={onSelect}>
      <CardContent className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          {template.logo && <img src={template.logo} alt="" className="size-5 shrink-0" onError={(e) => e.currentTarget.remove()} />}
          <span className="font-medium">{template.name}</span>
          <Badge variant="outline" className="ml-auto capitalize">
            {template.source}
          </Badge>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{template.description || "No description provided."}</p>
      </CardContent>
    </Card>
  );
}

function ConfigureTemplate({ template, projId, onBack }: { template: ApiMarketplaceTemplate; projId: string; onBack: () => void }) {
  const [name, setName] = React.useState(template.id);
  const [envValues, setEnvValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(template.envVars.map((v) => [v.key, v.secret ? generateSecret() : (v.default ?? "")])),
  );
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      api.createApplication({
        projectId: projId,
        name: name.trim(),
        repoUrl: template.image,
        branch: "main",
        buildType: "image",
        port: template.port ?? undefined,
        envVars: Object.keys(envValues).length > 0 ? JSON.stringify(envValues) : undefined,
      }),
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
          Deploying <span className="font-mono text-foreground">{template.image}</span>
          {template.port && (
            <>
              {" "}
              on internal port <span className="font-mono text-foreground">{template.port}</span>
            </>
          )}
          . Source:{" "}
          <a href={template.sourceUrl} target="_blank" rel="noreferrer" className="underline">
            {template.source}
          </a>
          .
        </p>
      </div>

      <Card className="max-w-lg">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">Application name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {template.envVars.length > 0 && (
            <div className="flex flex-col gap-3">
              <Label>Environment variables</Label>
              {template.envVars.map((v) => (
                <div key={v.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`tpl-env-${v.key}`} className="font-mono text-xs font-normal text-muted-foreground">
                    {v.key}
                  </Label>
                  <Input
                    id={`tpl-env-${v.key}`}
                    type={v.secret ? "password" : "text"}
                    value={envValues[v.key]}
                    onChange={(e) => setEnvValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button disabled={name.trim().length === 0 || isPending} onClick={() => mutate()}>
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
      <p className="mt-1 text-xs text-muted-foreground">One-click templates for popular self-hosted apps — a single container each, no extra services required.</p>

      <Input placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-6 max-w-sm" />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.isPending ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : filtered.length === 0 ? (
          <p className="col-span-full py-6 text-xs text-muted-foreground">No templates match "{search}".</p>
        ) : (
          filtered.map((t) => <TemplateCard key={t.id} template={t} onSelect={() => setSelected(t)} />)
        )}
      </div>
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
