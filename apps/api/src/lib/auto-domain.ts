import { env } from "./env";

// slug + a slice of the app's own (already-unique) id, so the suggested host never collides
export function suggestDomainHost(appId: string, appName: string) {
  const slug = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const label = `${slug || "app"}-${appId.slice(0, 8)}`;
  // in production, install.sh detects the server's public IP (SERVER_PUBLIC_IP) — sslip.io resolves that back
  // from the hostname itself, so the app is reachable (and gets a real Let's Encrypt cert) with zero DNS setup;
  // locally, without a public IP, `.localhost` resolves to the machine itself with no setup either
  return env.SERVER_PUBLIC_IP ? `${label}.${env.SERVER_PUBLIC_IP.replaceAll(".", "-")}.sslip.io` : `${label}.localhost`;
}

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

// kuberfy itself is a singleton (no app id to key off), so the label is a random token instead of a slug.
//
// Public case (real IP, real Let's Encrypt cert): the token must NOT be the product name and must NOT be derived
// from the IP. Certs are published forever in public Certificate Transparency logs (crt.sh, Censys) — a product
// name there would let anyone search those logs and build a list of every exposed kuberfy instance on the
// internet, and hashing the IP wouldn't help either, since all ~4 billion IPv4 addresses can be hashed and
// matched back in seconds. A long random token from getRandomValues has neither problem.
//
// Local case (`.localhost`, never leaves the machine, Let's Encrypt never issues for it, so it never reaches a CT
// log): none of that applies, so it gets a short readable label instead — same `<name>-<hash>` shape apps get
// from suggestDomainHost above, just for consistency rather than security.
export function suggestKuberfyDomainHost() {
  if (!env.SERVER_PUBLIC_IP) return `kuberfy-${randomHex(4)}.localhost`;
  return `${randomHex(6)}.${env.SERVER_PUBLIC_IP.replaceAll(".", "-")}.sslip.io`;
}
