import * as React from "react";
import { Desktop, Fingerprint, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, NotFoundError, type ApiUserPasskey, type ApiUserSession } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";
import { toastError } from "@/lib/toast";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const passkeyColumnHelper = createColumnHelper<ApiUserPasskey>();
function usePasskeyColumns(onDelete: (id: string) => void, deleting: boolean) {
  return React.useMemo(
    () => [
      passkeyColumnHelper.display({ id: "icon", meta: { className: "w-8" }, cell: () => <Fingerprint className="text-muted-foreground" /> }),
      passkeyColumnHelper.accessor("name", { cell: (info) => info.getValue() || "Passkey" }),
      passkeyColumnHelper.accessor("createdAt", {
        meta: { className: "text-muted-foreground" },
        cell: (info) => `Added ${info.getValue() ? formatDate(info.getValue()!) : "—"}`,
      }),
      passkeyColumnHelper.display({
        id: "actions",
        meta: { className: "w-8" },
        cell: (info) => (
          <Button type="button" variant="ghost" size="icon" disabled={deleting} onClick={() => onDelete(info.row.original.id)}>
            <Trash />
          </Button>
        ),
      }),
    ],
    [onDelete, deleting],
  );
}

const sessionColumnHelper = createColumnHelper<ApiUserSession>();
function useSessionColumns(onRevoke: (token: string) => void, revoking: boolean) {
  return React.useMemo(
    () => [
      sessionColumnHelper.display({ id: "icon", meta: { className: "w-8" }, cell: () => <Desktop className="text-muted-foreground" /> }),
      sessionColumnHelper.accessor("userAgent", {
        cell: (info) => (
          <div className="max-w-64 truncate" title={info.getValue() || "Unknown device"}>
            {info.getValue() || "Unknown device"}
          </div>
        ),
      }),
      sessionColumnHelper.accessor("ipAddress", { meta: { className: "text-muted-foreground" }, cell: (info) => info.getValue() || "Unknown IP" }),
      sessionColumnHelper.accessor("createdAt", { meta: { className: "text-muted-foreground" }, cell: (info) => formatDate(info.getValue()) }),
      sessionColumnHelper.display({
        id: "actions",
        meta: { className: "w-8" },
        cell: (info) => (
          <Button type="button" variant="ghost" size="sm" disabled={revoking} onClick={() => onRevoke(info.row.original.token)}>
            Revoke
          </Button>
        ),
      }),
    ],
    [onRevoke, revoking],
  );
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

  const passkeyColumns = usePasskeyColumns((passkeyId) => deletePasskey.mutate(passkeyId), deletePasskey.isPending);
  const sessionColumns = useSessionColumns((token) => revokeSession.mutate(token), revokeSession.isPending);

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
            <div className="rounded-md border border-border">
              <ScrollArea className="max-h-72">
                <DataTable columns={passkeyColumns} data={passkeys} getRowId={(p) => p.id} hideHeader />
              </ScrollArea>
            </div>
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
            <div className="rounded-md border border-border">
              <ScrollArea className="max-h-72">
                <DataTable columns={sessionColumns} data={sessions} getRowId={(s) => s.id} hideHeader />
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
