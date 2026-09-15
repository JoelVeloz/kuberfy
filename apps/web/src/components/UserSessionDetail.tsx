import type * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api, UnauthorizedError, NotFoundError } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";
import { describeDevice, formatDateTime } from "@/lib/session-display";
import { toastError } from "@/lib/toast";

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-sm break-all" : "text-sm"}>{value}</span>
    </div>
  );
}

// Client island: sessions only exist within their parent user's fetch, so this reuses the same ["user", userId]
// query (and its cache) rather than adding a dedicated single-session endpoint.
export function UserSessionDetail() {
  return (
    <QueryProvider>
      <UserSessionDetailInner />
    </QueryProvider>
  );
}

function UserSessionDetailInner() {
  const userId = getQueryParam("userId");
  const sessionId = getQueryParam("sessionId");
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ["user", userId], queryFn: () => api.getUser(userId) });

  const revoke = useMutation({
    mutationFn: (token: string) => api.revokeUserSession(userId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      window.location.href = `/users/view?id=${userId}`;
    },
    onError: (err) => toastError(err, "Failed to revoke session."),
  });

  if (user.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-48 w-full" />
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

  const { email, sessions } = user.data;
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Session not found. It may have already been revoked or expired.</p>
        <a href={`/users/view?id=${userId}`} className="mt-2 inline-block text-xs text-foreground underline">
          Back to {email}
        </a>
      </div>
    );
  }

  const { label, Icon } = describeDevice(session.userAgent);
  const expired = new Date(session.expiresAt).getTime() < Date.now();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <a href="/users" className="transition-colors hover:text-foreground">
            Users
          </a>
          <span className="text-border">/</span>
          <a href={`/users/view?id=${userId}`} className="transition-colors hover:text-foreground">
            {email}
          </a>
          <span className="text-border">/</span>
          <span>Session</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Icon className="text-muted-foreground" />
            <h1 className="font-heading text-lg font-medium">{label}</h1>
            {expired && <Badge variant="outline">Expired</Badge>}
          </div>
          <Button type="button" variant="destructive" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(session.token)}>
            {revoke.isPending ? "Revoking…" : "Revoke session"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="User" value={email} />
          <Field label="IP address" value={session.ipAddress || "Unknown"} mono />
          <Field label="Created" value={formatDateTime(session.createdAt)} />
          <Field label="Expires" value={formatDateTime(session.expiresAt)} />
          <Field label="Session ID" value={session.id} mono />
          <Field label="User agent" value={session.userAgent || "Unknown"} mono />
        </CardContent>
      </Card>
    </div>
  );
}
