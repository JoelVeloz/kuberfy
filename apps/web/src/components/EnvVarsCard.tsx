import * as React from "react";
import { Eye, EyeSlash, Pencil, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

// "KEY=VALUE" per line, skipping blanks and "#" comments — same shape as a .env file
function parseEnvText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    result[key] = line.slice(eq + 1).trim();
  }
  return result;
}

function envToText(envVars: Record<string, string>): string {
  return Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

// Rendered next to the "Environment variables" heading, alongside AddVariableDialog
export function BulkEditDialog({ applicationId, envVars }: { applicationId: string; envVars: Record<string, string> }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const save = useSaveEnvVars(applicationId, "Environment variables updated.");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setText(envToText(envVars));
      save.reset();
    }
  }

  function handleSubmit() {
    save.mutate(parseEnvText(text), { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Bulk edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Bulk edit variables</DialogTitle>
          <DialogDescription>One KEY=VALUE per line. Replaces all variables on save.</DialogDescription>
        </DialogHeader>
        <Textarea rows={36} className="font-mono" placeholder="NODE_ENV=production" value={text} onChange={(e) => setText(e.target.value)} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={save.isPending} onClick={handleSubmit}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useSaveEnvVars(applicationId: string, successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: Record<string, string>) => api.updateApplicationEnvVars(applicationId, next),
    onSuccess: () => {
      toast.success(successMessage);
      queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    },
    onError: (err) => toastError(err, "Failed to save environment variables."),
  });
}

// Rendered next to the "Environment variables" heading — kept separate from EnvVarsCard so the trigger sits by the section title
export function AddVariableDialog({ applicationId, envVars }: { applicationId: string; envVars: Record<string, string> }) {
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [value, setValue] = React.useState("");
  const save = useSaveEnvVars(applicationId, "Variable added.");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKey("");
      setValue("");
      save.reset();
    }
  }

  function handleSubmit() {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    save.mutate({ ...envVars, [trimmedKey]: value }, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add variable
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add variable</DialogTitle>
          <DialogDescription>Applied to the container on the next deploy or restart.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-key">
              Key
            </Label>
            <Input id="env-key" placeholder="NODE_ENV" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-value">
              Value
            </Label>
            <Input id="env-value" placeholder="production" className="font-mono" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={key.trim().length === 0 || save.isPending} onClick={handleSubmit}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnvVarsCard({ applicationId, envVars }: { applicationId: string; envVars: Record<string, string> }) {
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());
  const save = useSaveEnvVars(applicationId, "Variable deleted.");

  function handleDelete(k: string) {
    const next = { ...envVars };
    delete next[k];
    save.mutate(next);
  }

  function toggleReveal(k: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const entries = Object.entries(envVars);

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No environment variables configured.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(([k, v]) => (
            <EnvVarRow
              key={k}
              envKey={k}
              value={v}
              envVars={envVars}
              applicationId={applicationId}
              revealed={revealed.has(k)}
              onToggleReveal={() => toggleReveal(k)}
              onDelete={() => handleDelete(k)}
              deleting={save.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EnvVarRow({
  envKey,
  value,
  envVars,
  applicationId,
  revealed,
  onToggleReveal,
  onDelete,
  deleting,
}: {
  envKey: string;
  value: string;
  envVars: Record<string, string>;
  applicationId: string;
  revealed: boolean;
  onToggleReveal: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [key, setKey] = React.useState(envKey);
  const [editValue, setEditValue] = React.useState(value);
  const save = useSaveEnvVars(applicationId, "Variable updated.");

  function handleOpenChange(next: boolean) {
    setEditOpen(next);
    if (next) {
      setKey(envKey);
      setEditValue(value);
      save.reset();
    }
  }

  function handleSave() {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const next = { ...envVars };
    if (envKey !== trimmedKey) delete next[envKey];
    next[trimmedKey] = editValue;
    save.mutate(next, { onSuccess: () => setEditOpen(false) });
  }

  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <div className="flex min-w-0 items-baseline gap-1.5 font-mono">
        <span className="shrink-0">{envKey}=</span>
        <span className="truncate text-muted-foreground">{revealed ? value : "••••••••"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="size-6" aria-label={revealed ? `Hide ${envKey}` : `Reveal ${envKey}`} onClick={onToggleReveal}>
          {revealed ? <EyeSlash /> : <Eye />}
        </Button>
        <Dialog open={editOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label={`Edit ${envKey}`}>
              <Pencil />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit variable</DialogTitle>
              <DialogDescription>Applied to the container on the next deploy or restart.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`env-key-${envKey}`}>Key</Label>
                <Input id={`env-key-${envKey}`} className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`env-value-${envKey}`}>Value</Label>
                <Input id={`env-value-${envKey}`} className="font-mono" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button disabled={key.trim().length === 0 || save.isPending} onClick={handleSave}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" size="icon" className="size-6" aria-label={`Delete ${envKey}`} disabled={deleting} onClick={onDelete}>
          <Trash />
        </Button>
      </div>
    </li>
  );
}
