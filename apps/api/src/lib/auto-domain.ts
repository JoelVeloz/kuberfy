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

// kuberfy itself is a singleton (no app id to key off), so the label is a random token instead — not the product
// name and not derived from the IP: Let's Encrypt certs are published forever in public Certificate Transparency
// logs (crt.sh, Censys), so either of those would let anyone search for every exposed kuberfy instance on the
// internet (a product name directly; a hash of the IP is crackable too — only ~4 billion IPv4 addresses to try).
export function suggestKuberfyDomainHost() {
  if (!env.SERVER_PUBLIC_IP) return "localhost";
  const token = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${token}.${env.SERVER_PUBLIC_IP.replaceAll(".", "-")}.sslip.io`;
}
