import * as React from "react";
import { ArrowSquareOut, PencilSimple, Sparkle, Star, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api, type ApiDomain } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function AddDomainDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = React.useState(false);
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("3000");
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: () => api.createDomain(applicationId, host.trim(), Number(port)),
    onSuccess: () => {
      toast.success("Domain added.");
      setHost("");
      setPort("3000");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    },
    onError: (err) => toastError(err, "Failed to add domain."),
  });
  const suggest = useMutation({
    mutationFn: () => api.suggestDomainHost(applicationId),
    onSuccess: (data) => setHost(data.host),
    onError: (err) => toastError(err, "Failed to generate a domain."),
  });

  const canAdd = host.trim().length > 0 && Number.isInteger(Number(port)) && Number(port) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add domain</DialogTitle>
          <DialogDescription>Traefik routes this host to the given port inside the container.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="domain-host" className="text-xs font-medium">
              Host
            </label>
            <div className="flex gap-2">
              <Input id="domain-host" placeholder="app.example.com" value={host} onChange={(e) => setHost(e.target.value)} className="flex-1" />
              <Button type="button" variant="outline" size="sm" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
                <Sparkle /> {suggest.isPending ? "Generating…" : "Generate"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Generates a free public domain with HTTPS.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="domain-port" className="text-xs font-medium">
              Port
            </label>
            <Input id="domain-port" type="number" min={1} placeholder="e.g. 3000" value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={!canAdd || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DomainsCard({ applicationId, domains }: { applicationId: string; domains: ApiDomain[] }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["application", applicationId] });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDomain(id),
    onSuccess: () => {
      toast.success("Domain deleted.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to delete domain."),
  });
  const setPrimary = useMutation({
    mutationFn: (id: string) => api.setPrimaryDomain(id),
    onSuccess: () => {
      toast.success("Primary domain updated.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to set primary domain."),
  });
  const updatePort = useMutation({
    mutationFn: (vars: { id: string; port: number }) => api.updateDomainPort(vars.id, vars.port),
    onSuccess: () => {
      toast.success("Port updated.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to update port."),
  });
  const toggleSsl = useMutation({
    mutationFn: (vars: { id: string; sslEnabled: boolean }) => api.updateDomainSsl(vars.id, vars.sslEnabled),
    onSuccess: () => {
      toast.success("SSL setting updated.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to update SSL setting."),
  });

  return (
    <div className="flex flex-col gap-3">
      {domains.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom domains configured.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {domains.map((domain) => (
            <DomainRow
              key={domain.id}
              domain={domain}
              onSetPrimary={() => setPrimary.mutate(domain.id)}
              onDelete={() => remove.mutate(domain.id)}
              onSavePort={(port) => updatePort.mutate({ id: domain.id, port })}
              savingPort={updatePort.isPending && updatePort.variables?.id === domain.id}
              settingPrimary={setPrimary.isPending}
              onToggleSsl={(sslEnabled) => toggleSsl.mutate({ id: domain.id, sslEnabled })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DomainRow({
  domain,
  onSetPrimary,
  onDelete,
  onSavePort,
  savingPort,
  settingPrimary,
  onToggleSsl,
}: {
  domain: ApiDomain;
  onSetPrimary: () => void;
  onDelete: () => void;
  onSavePort: (port: number) => void;
  savingPort: boolean;
  settingPrimary: boolean;
  onToggleSsl: (sslEnabled: boolean) => void;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [port, setPort] = React.useState(String(domain.port));
  const isLocalhostHost = domain.host === "localhost" || domain.host.endsWith(".localhost");

  const [sslEnabled, setSslEnabled] = React.useState(domain.sslEnabled);

  function handleSave() {
    onSavePort(Number(port));
    if (sslEnabled !== domain.sslEnabled) onToggleSsl(sslEnabled);
    setEditOpen(false);
  }

  return (
    <li className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <a href={`http://${domain.host}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 truncate font-mono text-foreground hover:underline">
          <span className="truncate">{domain.host}</span>
          <ArrowSquareOut className="shrink-0 text-muted-foreground" />
        </a>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">:{domain.port}</Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {isLocalhostHost || !domain.sslEnabled ? "No SSL" : "SSL"}
          </Badge>
          <Dialog
            open={editOpen}
            onOpenChange={(next) => {
              setEditOpen(next);
              if (next) {
                setPort(String(domain.port));
                setSslEnabled(domain.sslEnabled);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6" aria-label={`Edit ${domain.host}`}>
                <PencilSimple />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit domain</DialogTitle>
                <DialogDescription>
                  Settings for <span className="font-mono text-foreground">{domain.host}</span>.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`domain-port-${domain.id}`} className="text-xs font-medium">
                  Port
                </label>
                <Input id={`domain-port-${domain.id}`} type="number" min={1} value={port} onChange={(e) => setPort(e.target.value)} />
                <p className="text-xs text-muted-foreground">Internal port this domain routes to inside the container.</p>
              </div>
              <label className="flex items-center justify-between gap-2 text-xs font-medium">
                SSL (HTTPS via Let's Encrypt)
                <Switch checked={isLocalhostHost ? false : sslEnabled} disabled={isLocalhostHost} onCheckedChange={setSslEnabled} />
              </label>
              <p className="text-xs text-muted-foreground">
                {isLocalhostHost ? "`.localhost` domains can't get SSL." : "Provisioned automatically."}
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button disabled={savingPort || !Number.isInteger(Number(port)) || Number(port) <= 0} onClick={handleSave}>
                  {savingPort ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={domain.isPrimary ? `${domain.host} is the primary domain` : `Make ${domain.host} the primary domain`}
            disabled={domain.isPrimary || settingPrimary}
            onClick={onSetPrimary}
          >
            <Star weight={domain.isPrimary ? "fill" : "regular"} className={domain.isPrimary ? "text-foreground" : undefined} />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" aria-label={`Delete ${domain.host}`} onClick={onDelete}>
            <Trash />
          </Button>
        </div>
      </div>
    </li>
  );
}
