import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { api, type ApiApplicationDetail } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { toast } from "sonner";

export function ResourcesContent({ app }: { app: ApiApplicationDetail }) {
  const [memoryLimitMb, setMemoryLimitMb] = React.useState(String(app.memoryLimitMb));
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
                <label htmlFor="app-image" className="text-xs font-medium">
                  Image
                </label>
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
        <CardContent>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <label htmlFor="memory-limit" className="text-xs font-medium">
              Memory limit (MB)
            </label>
            <Input id="memory-limit" type="number" min={1} step={1} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(e.target.value)} />
            <p className="text-xs text-muted-foreground">Applied on next deploy or restart.</p>
          </div>
          <Button className="mt-3" size="sm" disabled={!isValid || parsed === app.memoryLimitMb || save.isPending} onClick={() => save.mutate(parsed)}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
