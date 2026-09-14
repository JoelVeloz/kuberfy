import * as React from "react";
import { ArrowClockwise, Copy, Fingerprint } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { QueryProvider } from "@/components/QueryProvider";
import { api, type ApiUser } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { authClient } from "@/lib/auth-client";

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function NewUserDialog() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "user">("user");
  const [password, setPassword] = React.useState(generatePassword());
  const [created, setCreated] = React.useState<{ email: string; password: string } | null>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.createUser(email.trim(), password, role),
    onSuccess: () => {
      setCreated({ email: email.trim(), password });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toastError(err, "Failed to create user."),
  });

  function reset() {
    setEmail("");
    setRole("user");
    setPassword(generatePassword());
    setCreated(null);
  }

  const canCreate = email.trim().length > 0 && password.length >= 8;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New user</Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>Copy this password now. It won't be shown again.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Email</label>
              <Input readOnly value={created.email} className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Password</label>
              <div className="flex gap-2">
                <Input readOnly value={created.password} className="flex-1 font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(created.password);
                    toast.success("Password copied.");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
              <DialogDescription>Regular users can do everything you can, except create other users.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="user-email" className="text-xs font-medium">
                  Email
                </label>
                <Input id="user-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="user-role" className="text-xs font-medium">
                  Role
                </label>
                <select
                  id="user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "admin" | "user")}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="user-password" className="text-xs font-medium">
                  Password
                </label>
                <div className="flex gap-2">
                  <Input id="user-password" className="flex-1 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                    <ArrowClockwise /> Generate
                  </Button>
                </div>
              </div>
              {create.error && <p className="text-xs text-destructive">{create.error.message}</p>}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 20;

const columnHelper = createColumnHelper<ApiUser>();

function useColumns(isAdmin: boolean) {
  return React.useMemo(
    () => [
      columnHelper.accessor("email", {
        header: "Email",
        meta: { className: "font-mono" },
        cell: (info) =>
          isAdmin ? (
            <a href={`/users/view?id=${info.row.original.id}`} className="after:absolute after:inset-0">
              {info.getValue()}
            </a>
          ) : (
            info.getValue()
          ),
      }),
      columnHelper.accessor("role", {
        header: "Role",
        cell: (info) => <Badge variant="outline">{info.getValue() ?? "user"}</Badge>,
      }),
      columnHelper.accessor("passkeyCount", {
        header: "Passkeys",
        meta: { className: "text-muted-foreground" },
        cell: (info) =>
          info.getValue() > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Fingerprint /> {info.getValue()}
            </span>
          ) : (
            "—"
          ),
      }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        meta: { className: "text-muted-foreground" },
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
      }),
    ],
    [isAdmin],
  );
}

function UsersPageInner() {
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [page, setPage] = React.useState(1);
  const columns = useColumns(isAdmin);

  const { data, isPending, error } = useQuery({
    queryKey: ["users", page],
    queryFn: () => api.listUsers(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-lg font-medium">Users</h1>
          <p className="mt-1 text-xs text-muted-foreground">Accounts are created here only. No public sign-up.</p>
        </div>
        {isAdmin && <NewUserDialog />}
      </div>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <p className="text-xs text-destructive">Failed to load users.</p>
      ) : (
        <Card>
          <CardContent className="px-0">
            <DataTable columns={columns} data={data.items} getRowId={(u) => u.id} rowClassName={() => (isAdmin ? "relative cursor-pointer" : undefined)} />
            <TablePagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function UsersPage() {
  return (
    <QueryProvider>
      <UsersPageInner />
    </QueryProvider>
  );
}
