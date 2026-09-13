import * as React from "react";
import { Desktop, Fingerprint, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, NotFoundError } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";
import { toastError } from "@/lib/toast";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Client island: real user ids don't exist at build time, so the id is read from the URL and fetched here.
export function UserDetail() {
  return (
    <QueryProvider>
      <UserDetailInner />
    </QueryProvider>
  );
}

function UserDetailInner() {
  const id = getQueryParam("id");
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ["user", id], queryFn: () => api.getUser(id) });

  const revokeSession = useMutation({
    mutationFn: (token: string) => api.revokeUserSession(id, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user", id] }),
    onError: (err) => toastError(err, "Failed to revoke session."),
  });

  const revokeAllSessions = useMutation({
    mutationFn: () => api.revokeAllUserSessions(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user", id] }),
    onError: (err) => toastError(err, "Failed to revoke sessions."),
  });

  const deletePasskey = useMutation({
    mutationFn: (passkeyId: string) => api.deleteUserPasskey(id, passkeyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user", id] }),
    onError: (err) => toastError(err, "Failed to remove passkey."),
  });

  if (user.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  if (user.error instanceof UnauthorizedError) return <p className="text-xs text-muted-foreground">Not signed in.</p>;

  if (user.error instanceof NotFoundError) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">User not found.</p>
        <a href="/users" className="mt-2 inline-block text-xs text-foreground underline">
          Back to users
        </a>
      </div>
    );
  }

  if (user.error) return <p className="text-xs text-muted-foreground">{(user.error as Error).message || "Failed to load user."}</p>;

  const { email, role, createdAt, passkeys, sessions } = user.data;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <a href="/users" className="transition-colors hover:text-foreground">
            Users
          </a>
          <span className="text-border">/</span>
          <span>{email}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-lg font-medium">{email}</h1>
          <Badge variant="outline">{role ?? "user"}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Member since {formatDate(createdAt)}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Passkeys</h2>
          {passkeys.length === 0 ? (
            <p className="text-xs text-muted-foreground">No passkeys registered.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {passkeys.map((passkey) => (
                <li key={passkey.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Fingerprint className="text-muted-foreground" />
                    <span>
                      <div>{passkey.name || "Passkey"}</div>
                      <div className="text-xs text-muted-foreground">Added {passkey.createdAt ? formatDate(passkey.createdAt) : "—"}</div>
                    </span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" disabled={deletePasskey.isPending} onClick={() => deletePasskey.mutate(passkey.id)}>
                    <Trash />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium">Active sessions</h2>
            {sessions.length > 0 && (
              <Button type="button" variant="outline" size="sm" disabled={revokeAllSessions.isPending} onClick={() => revokeAllSessions.mutate()}>
                Revoke all
              </Button>
            )}
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active sessions.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Desktop className="text-muted-foreground" />
                    <span>
                      <div className="truncate">{session.userAgent || "Unknown device"}</div>
                      <div className="text-xs text-muted-foreground">
                        {session.ipAddress || "Unknown IP"} · signed in {formatDate(session.createdAt)}
                      </div>
                    </span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" disabled={revokeSession.isPending} onClick={() => revokeSession.mutate(session.token)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
