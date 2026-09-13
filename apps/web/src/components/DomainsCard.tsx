import * as React from "react";
import { Trash } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ApiDomain } from "@/lib/api";

export function DomainsCard({ applicationId, initialDomains }: { applicationId: string; initialDomains: ApiDomain[] }) {
  const [domains, setDomains] = React.useState(initialDomains);
  const [host, setHost] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAdd() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createDomain(applicationId, host.trim());
      setDomains((prev) => [...prev, created]);
      setHost("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteDomain(id);
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Failed to delete domain.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {domains.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom domains configured.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {domains.map((domain) => (
            <li key={domain.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono">{domain.host}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">SSL</Badge>
                <Button variant="ghost" size="icon" className="size-6" aria-label={`Delete ${domain.host}`} onClick={() => handleDelete(domain.id)}>
                  <Trash />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 border-t border-border pt-3">
        <Input placeholder="app.example.com" value={host} onChange={(e) => setHost(e.target.value)} className="h-8 flex-1 text-xs" />
        <Button size="sm" disabled={host.trim().length === 0 || submitting} onClick={handleAdd}>
          {submitting ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
