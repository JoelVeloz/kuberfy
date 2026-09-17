import * as React from "react";
import { Cube, GithubLogo, Stack } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { navigate } from "astro:transitions/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, type ApiProjectTemplate, type ApiAppSize } from "@/lib/api";
import { toastError } from "@/lib/toast";

function TemplateCard({ template, onSelect }: { template: ApiProjectTemplate; onSelect: () => void }) {
  return (
    <Card className="relative cursor-pointer transition-colors hover:border-foreground/30" onClick={onSelect}>
      <CardContent className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Stack weight="bold" className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{template.projectName}</span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {template.apps.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-none border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {a.image ? <Cube weight="bold" className="size-3" /> : <GithubLogo weight="bold" className="size-3" />}
              {a.name}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigureTemplate({ template, appSizes, onBack }: { template: ApiProjectTemplate; appSizes: ApiAppSize[] | undefined; onBack: () => void }) {
  const [projectName, setProjectName] = React.useState(template.projectName);
  const [sizes, setSizes] = React.useState<Record<string, string>>(() => Object.fromEntries(template.apps.map((a) => [a.id, a.defaultSize ?? "nano"])));
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.deployProjectTemplate(template.id, { projectName: projectName.trim(), sizeOverrides: sizes }),
    onSuccess: (data) => {
      toast.success(`Deploying "${projectName.trim()}"…`);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/view?id=${data.projectId}`);
    },
    onError: (err) => toastError(err, "Failed to deploy project."),
  });

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="w-fit text-xs text-muted-foreground hover:text-foreground">
        ← Back to project templates
      </button>
      <div>
        <h1 className="font-heading text-lg font-medium">{template.projectName}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="project-template-name">Project name</Label>
        <Input id="project-template-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
      </div>

      <Card>
        <CardContent className="max-h-112 overflow-y-auto px-0">
          <ul className="flex flex-col">
            {template.apps.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 last:border-b-0">
                <div className="flex min-w-0 items-center gap-2">
                  {a.image ? <Cube weight="bold" className="size-3.5 shrink-0 text-blue-500" /> : <GithubLogo weight="bold" className="size-3.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{a.image ?? a.repoUrl}</p>
                  </div>
                </div>
                <Select value={sizes[a.id]} onValueChange={(v) => setSizes((prev) => ({ ...prev, [a.id]: v }))}>
                  <SelectTrigger size="sm" className="h-7 w-48 shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(appSizes ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label} · {s.cpuLimit} {s.cpuLimit === 1 ? "core" : "cores"} / {s.memoryLimitMb} MB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div>
        <Button disabled={projectName.trim().length === 0 || isPending} onClick={() => mutate()}>
          {isPending ? "Deploying…" : `Deploy ${template.apps.length} ${template.apps.length === 1 ? "app" : "apps"}`}
        </Button>
      </div>
    </div>
  );
}

function ProjectMarketplaceBrowserInner() {
  const [selected, setSelected] = React.useState<ApiProjectTemplate | null>(null);
  const templates = useQuery({ queryKey: ["project-templates"], queryFn: api.listProjectTemplates });
  const appSizes = useQuery({ queryKey: ["app-sizes"], queryFn: api.listAppSizes });

  if (templates.error instanceof UnauthorizedError) return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (selected) {
    return <ConfigureTemplate template={selected} appSizes={appSizes.data} onBack={() => setSelected(null)} />;
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <a href="/" className="transition-colors hover:text-foreground">
          Projects
        </a>
        <span className="text-border">/</span>
        <span className="text-foreground">Project templates</span>
      </div>

      <h1 className="font-heading text-lg font-medium">Project templates</h1>
      <p className="mt-1 text-xs text-muted-foreground">Deploy a framework wired to its database in one step — each combination has been tested end to end.</p>

      {templates.isPending ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(templates.data ?? []).map((t) => (
            <TemplateCard key={t.id} template={t} onSelect={() => setSelected(t)} />
          ))}
        </div>
      )}
    </>
  );
}

export function ProjectMarketplaceBrowser() {
  return (
    <QueryProvider>
      <ProjectMarketplaceBrowserInner />
    </QueryProvider>
  );
}
