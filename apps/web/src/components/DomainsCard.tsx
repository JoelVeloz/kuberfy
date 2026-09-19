import * as React from "react";
import { ArrowSquareOut, PencilSimple, Sparkle, Star, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api, type ApiDomain } from "@/lib/api";
import { toastError } from "@/lib/toast";

const DATABASE_PORT = 5432;

function parseAllowlist(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function AddDomainDialog({ applicationId, isDatabase }: { applicationId: string; isDatabase: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("3000");
  const [allowlist, setAllowlist] = React.useState("");
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: () =>
      isDatabase ? api.createDomain(applicationId, host.trim(), DATABASE_PORT, parseAllowlist(allowlist)) : api.createDomain(applicationId, host.trim(), Number(port)),
    onSuccess: () => {
      toast.success("Domain added.");
      setHost("");
      setPort("3000");
      setAllowlist("");
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

  const canAdd = host.trim().length > 0 && (isDatabase ? parseAllowlist(allowlist).length > 0 : Number.isInteger(Number(port)) && Number(port) > 0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && isDatabase && !allowlist) {
      api
        .getClientIp()
        .then(({ ip }) => ip && setAllowlist((current) => current || ip))
        .catch(() => {});
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add domain</DialogTitle>
          <DialogDescription>
            {isDatabase
              ? `Traefik accepts TLS connections for this host on port ${DATABASE_PORT}, only from the allowed IPs.`
              : "Traefik routes this host to the given port inside the container."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="domain-host">Host</Label>
            <div className="flex gap-2">
              <Input id="domain-host" placeholder="app.example.com" value={host} onChange={(e) => setHost(e.target.value)} className="flex-1" />
              <Button type="button" variant="outline" size="sm" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
                <Sparkle /> {suggest.isPending ? "Generating…" : "Generate"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Generates a free public domain with {isDatabase ? "a Let's Encrypt certificate" : "HTTPS"}.</p>
          </div>
          {isDatabase ? (
            <AllowlistField id="domain-allowlist" value={allowlist} onChange={setAllowlist} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="domain-port">Port</Label>
              <Input id="domain-port" type="number" min={1} placeholder="e.g. 3000" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          )}
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

function AllowlistField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Allowed IPs</Label>
      <Input id={id} placeholder="203.0.113.10, 198.51.100.0/24" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      <p className="text-xs text-muted-foreground">Comma-separated IPs or CIDR ranges. Everything else is refused before it reaches the database.</p>
    </div>
  );
}

export function DomainsCard({ applicationId, domains, isDatabase }: { applicationId: string; domains: ApiDomain[]; isDatabase: boolean }) {
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
  const updateAllowlist = useMutation({
    mutationFn: (vars: { id: string; allowlist: string[] }) => api.updateDomainAllowlist(vars.id, vars.allowlist),
    onSuccess: () => {
      toast.success("Allowed IPs updated.");
      invalidate();
    },
    onError: (err) => toastError(err, "Failed to update allowed IPs."),
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
              isDatabase={isDatabase}
              onSaveAllowlist={(allowlist) => updateAllowlist.mutate({ id: domain.id, allowlist })}
              onSetPrimary={() => setPrimary.mutate(domain.id)}
              onDelete={() => remove.mutate(domain.id)}
              onSavePort={(port) => updatePort.mutate({ id: domain.id, port })}
              savingPort={(updatePort.isPending && updatePort.variables?.id === domain.id) || (updateAllowlist.isPending && updateAllowlist.variables?.id === domain.id)}
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
  isDatabase,
  onSaveAllowlist,
  onSetPrimary,
  onDelete,
  onSavePort,
  savingPort,
  settingPrimary,
  onToggleSsl,
}: {
  domain: ApiDomain;
  isDatabase: boolean;
  onSaveAllowlist: (allowlist: string[]) => void;
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
  const [allowlist, setAllowlist] = React.useState(domain.allowlist ?? "");
  const allowedIps = parseAllowlist(domain.allowlist ?? "");

  function handleSave() {
    if (isDatabase) onSaveAllowlist(parseAllowlist(allowlist));
    else {
      onSavePort(Number(port));
      if (sslEnabled !== domain.sslEnabled) onToggleSsl(sslEnabled);
    }
    setEditOpen(false);
  }

  const canSave = isDatabase ? parseAllowlist(allowlist).length > 0 : Number.isInteger(Number(port)) && Number(port) > 0;

  return (
    <li className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        {isDatabase ? (
          <span className="min-w-0 truncate font-mono text-foreground">{domain.host}</span>
        ) : (
          <a href={`http://${domain.host}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 truncate font-mono text-foreground hover:underline">
            <span className="truncate">{domain.host}</span>
            <ArrowSquareOut className="shrink-0 text-muted-foreground" />
          </a>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">:{domain.port}</Badge>
          {isDatabase ? (
            <Badge variant="outline" className="text-muted-foreground" title={allowedIps.join(", ")}>
              {allowedIps.length === 1 ? allowedIps[0] : `${allowedIps.length} IPs`}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {isLocalhostHost || !domain.sslEnabled ? "No SSL" : "SSL"}
            </Badge>
          )}
          <Dialog
            open={editOpen}
            onOpenChange={(next) => {
              setEditOpen(next);
              if (next) {
                setPort(String(domain.port));
                setSslEnabled(domain.sslEnabled);
                setAllowlist(domain.allowlist ?? "");
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
              {isDatabase ? (
                <AllowlistField id={`domain-allowlist-${domain.id}`} value={allowlist} onChange={setAllowlist} />
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`domain-port-${domain.id}`}>Port</Label>
                    <Input id={`domain-port-${domain.id}`} type="number" min={1} value={port} onChange={(e) => setPort(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Internal port this domain routes to inside the container.</p>
                  </div>
                  <Label className="justify-between font-medium">
                    SSL (HTTPS via Let's Encrypt)
                    <Switch checked={isLocalhostHost ? false : sslEnabled} disabled={isLocalhostHost} onCheckedChange={setSslEnabled} />
                  </Label>
                  <p className="text-xs text-muted-foreground">{isLocalhostHost ? "`.localhost` domains can't get SSL." : "Provisioned automatically."}</p>
                </>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button disabled={savingPort || !canSave} onClick={handleSave}>
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
