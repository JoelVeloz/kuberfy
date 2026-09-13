import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { BuildType } from "@/lib/types";

export function NewApplicationDialog({ projectId }: { projectId: string }) {
  const [name, setName] = React.useState("");
  const [repoUrl, setRepoUrl] = React.useState("");
  const [branch, setBranch] = React.useState("main");
  const [buildType, setBuildType] = React.useState<BuildType>("dockerfile");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleCreate() {
    setSubmitting(true);
    try {
      await api.createApplication({ projectId, name: name.trim(), repoUrl: repoUrl.trim(), branch: branch.trim() || "main", buildType });
      window.location.reload();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <Dialog>
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
            <Label htmlFor="app-repo">Repository URL</Label>
            <Input id="app-repo" placeholder="https://github.com/org/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-branch">Branch</Label>
            <Input id="app-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-build-type">Build type</Label>
            <Select value={buildType} onValueChange={(v) => setBuildType(v as BuildType)}>
              <SelectTrigger id="app-build-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dockerfile">Dockerfile</SelectItem>
                <SelectItem value="nixpacks">Nixpacks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={name.trim().length === 0 || repoUrl.trim().length === 0 || submitting} onClick={handleCreate}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
