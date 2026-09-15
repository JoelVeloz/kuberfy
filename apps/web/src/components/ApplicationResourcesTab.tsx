import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { toast } from "sonner";

export function ResourcesContent({ app }: { app: ApiApplicationDetail }) {
  const [memoryLimitMb, setMemoryLimitMb] = React.useState(String(app.memoryLimitMb));
  const [cpuLimit, setCpuLimit] = React.useState(String(app.cpuLimit));
  const appSizes = useQuery({ queryKey: ["app-sizes"], queryFn: api.listAppSizes });
  const matchedSize = appSizes.data?.find((s) => s.memoryLimitMb === Number(memoryLimitMb) && s.cpuLimit === Number(cpuLimit));
  const [repoUrl, setRepoUrl] = React.useState(app.repoUrl);
  const [isPrivate, setIsPrivate] = React.useState(app.registryUsername != null);
  const [registryUsername, setRegistryUsername] = React.useState(app.registryUsername ?? "");
  const [registryPassword, setRegistryPassword] = React.useState("");
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (mb: number) => api.updateApplicationMemoryLimit(app.id, mb),
    onSuccess: () => {
      toast.success("Memory limit saved.");
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    },
    onError: (err) => toastError(err, "Failed to save memory limit."),
  });
  const saveCpu = useMutation({
    mutationFn: (cores: number) => api.updateApplicationCpuLimit(app.id, cores),
    onSuccess: () => {
      toast.success("CPU limit saved.");
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    },
    onError: (err) => toastError(err, "Failed to save CPU limit."),
  });
  const saveImage = useMutation({
    mutationFn: () =>
      api.updateApplicationImage(app.id, {
        repoUrl: trimmedRepoUrl,
        ...(isPrivate
          ? { registryUsername: registryUsername.trim(), ...(registryPassword.length > 0 ? { registryPassword } : {}) }
          : { registryUsername: null, registryPassword: null }),
      }),
    onSuccess: () => {
      toast.success("Image saved.");
      setRegistryPassword("");
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    },
    onError: (err) => toastError(err, "Failed to save image."),
  });

  const parsed = Number(memoryLimitMb);
  const isValid = Number.isInteger(parsed) && parsed > 0;
  const parsedCpu = Number(cpuLimit);
  const isCpuValid = Number.isFinite(parsedCpu) && parsedCpu > 0;
  const trimmedRepoUrl = repoUrl.trim();
  const wasPrivate = app.registryUsername != null;
  const imageUnchanged =
    trimmedRepoUrl === app.repoUrl && isPrivate === wasPrivate && (!isPrivate || registryUsername.trim() === (app.registryUsername ?? "")) && registryPassword.length === 0;

  return (
    <>
      {app.buildType === "image" && (
        <>
          <h2 className="font-heading text-sm font-medium">Image</h2>
          <Card className="mt-3">
            <CardContent>
              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="app-image">
                  Image
                </Label>
                <Input id="app-image" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="e.g. mariadb:11" />
                <p className="text-xs text-muted-foreground">Any image/tag — Docker Hub, GHCR, or another registry. Applied on next deploy or restart.</p>
              </div>
              <div className="mt-3 flex items-center justify-between sm:max-w-xs">
                <Label htmlFor="app-private-image">Private image</Label>
                <Switch id="app-private-image" checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>
              {isPrivate && (
                <div className="mt-3 flex flex-col gap-3 sm:max-w-xs">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="app-registry-username">Username</Label>
                    <Input id="app-registry-username" value={registryUsername} onChange={(e) => setRegistryUsername(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="app-registry-password">Password / access token</Label>
                    <Input
                      id="app-registry-password"
                      type="password"
                      placeholder={wasPrivate ? "Leave blank to keep current password" : ""}
                      value={registryPassword}
                      onChange={(e) => setRegistryPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <Button
                className="mt-3"
                size="sm"
                disabled={
                  trimmedRepoUrl.length === 0 ||
                  imageUnchanged ||
                  (isPrivate && (registryUsername.trim().length === 0 || (!wasPrivate && registryPassword.length === 0))) ||
                  saveImage.isPending
                }
                onClick={() => saveImage.mutate()}
              >
                {saveImage.isPending ? "Saving…" : "Save"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <h2 className="mt-6 font-heading text-sm font-medium">Resources</h2>
      <Card className="mt-3">
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="app-size-pick">Size</Label>
            <Select
              value={matchedSize?.id ?? ""}
              onValueChange={(id) => {
                const picked = appSizes.data?.find((s) => s.id === id);
                if (!picked) return;
                setMemoryLimitMb(String(picked.memoryLimitMb));
                setCpuLimit(String(picked.cpuLimit));
              }}
            >
              <SelectTrigger id="app-size-pick" className="w-full">
                <SelectValue placeholder="Custom" />
              </SelectTrigger>
              <SelectContent>
                {(appSizes.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} · {s.cpuLimit} {s.cpuLimit === 1 ? "core" : "cores"} / {s.memoryLimitMb} MB
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Picking a size fills in the fields below — each still needs its own Save.</p>
          </div>
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
            <div>
              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="memory-limit">
                  Memory limit (MB)
                </Label>
                <Input id="memory-limit" type="number" min={1} step={1} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(e.target.value)} />
                <p className="text-xs text-muted-foreground">Applied on next deploy or restart.</p>
              </div>
              <Button className="mt-3" size="sm" disabled={!isValid || parsed === app.memoryLimitMb || save.isPending} onClick={() => save.mutate(parsed)}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
            <div>
              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="cpu-limit">
                  CPU limit (cores)
                </Label>
                <Input id="cpu-limit" type="number" min={0.1} step={0.1} value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} />
                <p className="text-xs text-muted-foreground">Hard cap on this app's CPU usage. Applied on next deploy or restart.</p>
              </div>
              <Button className="mt-3" size="sm" disabled={!isCpuValid || parsedCpu === app.cpuLimit || saveCpu.isPending} onClick={() => saveCpu.mutate(parsedCpu)}>
                {saveCpu.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
