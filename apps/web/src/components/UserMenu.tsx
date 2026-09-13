import { SignOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const { data: session, isPending } = authClient.useSession();

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 md:flex-col md:items-stretch">
        <Skeleton className="hidden h-3 w-32 md:block" />
        <Skeleton className="size-6 md:h-7 md:w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <a href="/login" className="text-xs text-muted-foreground hover:text-foreground">
        Sign in
      </a>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 md:flex-col md:items-stretch">
      <span className="hidden truncate font-mono text-xs text-muted-foreground md:block" title={session.user.email}>
        {session.user.email}
      </span>
      <Button variant="ghost" size="sm" className="justify-start gap-1.5 md:w-full" onClick={handleSignOut}>
        <SignOut />
        <span className="hidden md:inline">Log out</span>
      </Button>
    </div>
  );
}
