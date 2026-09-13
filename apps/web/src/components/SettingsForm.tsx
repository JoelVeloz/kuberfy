import * as React from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export function SettingsForm() {
  const [domain, setDomain] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    api
      .getSettings()
      .then((s) => setDomain(s.kuberfyDomain ?? ""))
      .catch(() => setError("Failed to load current settings."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateSettings(domain.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kuberfy-domain">Kuberfy domain</Label>
          <Input id="kuberfy-domain" placeholder="deploy.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} className="max-w-sm" />
          <p className="text-xs text-muted-foreground">The domain this kuberfy dashboard itself is reached at.</p>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {saved && (
          <Alert>
            <CheckCircle />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>
              The domain was saved. It will not take effect on kuberfy's own routing until the <code>KUBERFY_DOMAIN</code> environment variable is updated
              and the stack is restarted (e.g. re-running <code>docker compose up -d</code> or the installer).
            </AlertDescription>
          </Alert>
        )}

        <div>
          <Button disabled={domain.trim().length === 0 || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
