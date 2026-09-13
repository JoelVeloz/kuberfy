import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";
import type { BuildType } from "@/lib/types";

export function NewApplicationDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [repoUrl, setRepoUrl] = React.useState("");
  const [branch, setBranch] = React.useState("main");
  const [buildType, setBuildType] = React.useState<BuildType>("image");
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.createApplication({ projectId, name: name.trim(), repoUrl: repoUrl.trim(), branch: branch.trim() || "main", buildType }),
    onSuccess: () => {
      toast.success("Application created.");
      queryClient.invalidateQueries({ queryKey: ["project", projectId, "apps"] });
      setOpen(false);
      setName("");
      setRepoUrl("");
      setBranch("main");
      setBuildType("image");
    },
    onError: (err) => toastError(err, "Failed to create application."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New application</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>Connect a repository to deploy as part of this project.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-name">Name</Label>
            <Input id="app-name" placeholder="e.g. api" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-build-type">Build type</Label>
            <Select value={buildType} onValueChange={(v) => setBuildType(v as BuildType)}>
              <SelectTrigger id="app-build-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Docker image</SelectItem>
                <SelectItem value="dockerfile">Dockerfile (git repo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-repo">{buildType === "image" ? "Docker image" : "Repository URL"}</Label>
            <Input
              id="app-repo"
              placeholder={buildType === "image" ? "e.g. nginx:alpine" : "https://github.com/org/repo"}
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
          {buildType === "dockerfile" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-branch">Branch</Label>
              <Input id="app-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={name.trim().length === 0 || repoUrl.trim().length === 0 || isPending} onClick={() => mutate()}>
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
