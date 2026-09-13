import * as React from "react";
import { navigate } from "astro:transitions/client";
import { Fingerprint } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { getQueryParam } from "@/lib/query-params";

export function LoginForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = React.useState(false);
  const [passkeyPending, setPasskeyPending] = React.useState(false);

  React.useEffect(() => {
    api
      .getPasskeyEnabled()
      .then((res) => setPasskeyEnabled(res.enabled))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? "Invalid email or password.");
      return;
    }
    navigate(getQueryParam("redirect") || "/");
  }

  async function handlePasskeySignIn() {
    setError(null);
    setPasskeyPending(true);
    const result = await authClient.signIn.passkey();
    setPasskeyPending(false);
    if (result?.error) {
      setError(result.error.message ?? "Passkey sign-in failed.");
      return;
    }
    navigate(getQueryParam("redirect") || "/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5">
      <div>
        <h1 className="font-heading text-lg font-medium">Sign in</h1>
        <p className="mt-1 text-xs text-muted-foreground">Enter your credentials to access the dashboard.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {passkeyEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" disabled={passkeyPending} onClick={handlePasskeySignIn} className="w-full">
            <Fingerprint /> {passkeyPending ? "Waiting for passkey…" : "Sign in with a passkey"}
          </Button>
        </>
      )}
    </form>
  );
}
