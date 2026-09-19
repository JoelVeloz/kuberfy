import { docker } from "./deploy";

// kuberfy's own dashboard runs as a Docker Swarm service (see install.sh). Traefik's swarm provider reads
// routing rules from the *service's* labels — updating those (unlike a container's own labels) never creates a
// new task, so the domain can change without restarting kuberfy itself. No-ops outside Swarm (e.g. local dev via
// docker-compose, which runs kuberfy as a plain container) — the caller treats that as a soft failure.
export async function applyKuberfyDomain(host: string) {
  const service = docker.getService("kuberfy");
  const info = await service.inspect();

  const isLocalhost = host === "localhost" || host.endsWith(".localhost");
  const labels: Record<string, string> = {
    "traefik.enable": "true",
    "traefik.http.routers.kuberfy.rule": `Host(\`${host}\`)`,
    "traefik.http.routers.kuberfy.entrypoints": "web",
    "traefik.http.services.kuberfy.loadbalancer.server.port": "3000",
  };
  // `.localhost` never leaves the machine and Let's Encrypt won't issue for it — same rule deploy.ts applies to
  // deployed apps' own domains.
  if (!isLocalhost) {
    labels["traefik.http.routers.kuberfy-tls.rule"] = `Host(\`${host}\`)`;
    labels["traefik.http.routers.kuberfy-tls.entrypoints"] = "websecure";
    labels["traefik.http.routers.kuberfy-tls.service"] = "kuberfy";
    labels["traefik.http.routers.kuberfy-tls.tls.certresolver"] = "le";
  }

  await service.update({
    version: info.Version.Index,
    ...info.Spec,
    Labels: labels,
  });
}

export async function unpublishKuberfyPanelPort() {
  const service = docker.getService("kuberfy");
  const info = await service.inspect();

  const ports = (info.Spec.EndpointSpec?.Ports ?? []) as { TargetPort?: number }[];
  if (!ports.some((p) => p.TargetPort === 3000)) return;

  await service.update({
    version: info.Version.Index,
    ...info.Spec,
    EndpointSpec: { ...info.Spec.EndpointSpec, Ports: ports.filter((p) => p.TargetPort !== 3000) },
  });
}
