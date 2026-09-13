import * as React from "react";
import { Fingerprint, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { QueryProvider } from "@/components/QueryProvider";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export function PasskeyCard() {
  return (
    <QueryProvider>
      <PasskeyCardInner />
    </QueryProvider>
  );
}

function PasskeyCardInner() {
  const queryClient = useQueryClient();
  // Shares the "settings" cache key with SettingsForm/ExposedPortsCard (same QueryProvider singleton).
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw new Error(error.message ?? "Failed to load passkeys.");
      return data ?? [];
    },
  });

  const addPasskey = useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.passkey.addPasskey();
      if (error) throw new Error(error.message ?? "Failed to register passkey.");
      return data;
    },
    onSuccess: () => {
      toast.success("Passkey registered.");
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (err) => toastError(err, "Failed to register passkey."),
  });

  const removePasskey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw new Error(error.message ?? "Failed to remove passkey.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (err) => toastError(err, "Failed to remove passkey."),
  });

  const toggleEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.updatePasskeyEnabled(enabled),
    onSuccess: (_data, enabled) => {
      toast.success(enabled ? "Passkey sign-in enabled." : "Passkey sign-in disabled.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => toastError(err, "Failed to update passkey sign-in."),
  });

  if (settings.isPending || passkeys.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const list = passkeys.data ?? [];
  const enabled = settings.data?.passkeyEnabled ?? false;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Passkey sign-in</h2>
            <p className="text-xs text-muted-foreground">Sign in with a fingerprint, face, or security key instead of a password.</p>
          </div>
          <Switch checked={enabled} disabled={toggleEnabled.isPending || (!enabled && list.length === 0)} onCheckedChange={(next) => toggleEnabled.mutate(next)} />
        </div>

        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No passkeys registered yet — add one below to turn this on.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((passkey) => (
              <li key={passkey.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Fingerprint className="text-muted-foreground" />
                  <span>
                    <div>{passkey.name || "Passkey"}</div>
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(passkey.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  </span>
                </span>
                <Button type="button" variant="ghost" size="icon" disabled={removePasskey.isPending} onClick={() => removePasskey.mutate(passkey.id)}>
                  <Trash />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button type="button" variant="outline" size="sm" disabled={addPasskey.isPending} onClick={() => addPasskey.mutate()}>
            <Fingerprint /> {addPasskey.isPending ? "Registering…" : "Add passkey"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
