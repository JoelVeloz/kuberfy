import { docker } from "./deploy";

const TRAEFIK = "kuberfy-traefik";
const DATABASE_PORT = "5432/tcp";
const DYNAMIC_CONFIG_PATH = "etc/kuberfy/traefik.yml";
const DATABASE_ARGS = ["--entrypoints.postgres.address=:5432", `--providers.file.filename=/${DYNAMIC_CONFIG_PATH}`];
const DYNAMIC_CONFIG = "tls:\n  options:\n    postgres:\n      alpnProtocols: [postgresql]\n";

let queue: Promise<unknown> = Promise.resolve();

export function applyDatabaseEntrypoint(enabled: boolean): Promise<boolean> {
  const run = queue.then(() => recreateTraefik(enabled));
  queue = run.catch(() => {});
  return run;
}

async function recreateTraefik(enabled: boolean) {
  const current = docker.getContainer(TRAEFIK);
  const info = await current.inspect();

  const baseArgs = (info.Config.Cmd ?? []).filter((arg) => !DATABASE_ARGS.includes(arg));
  const args = enabled ? [...baseArgs, ...DATABASE_ARGS] : baseArgs;
  const { [DATABASE_PORT]: _, ...basePorts } = info.HostConfig.PortBindings ?? {};
  const portBindings = enabled ? { ...basePorts, [DATABASE_PORT]: [{ HostPort: "5432" }] } : basePorts;
  const isApplied = DATABASE_ARGS.every((arg) => info.Config.Cmd?.includes(arg)) === enabled && Boolean(info.HostConfig.PortBindings?.[DATABASE_PORT]) === enabled;
  if (isApplied) return false;

  const [primaryNetwork, ...otherNetworks] = Object.keys(info.NetworkSettings.Networks);
  const next = await docker.createContainer({
    name: `${TRAEFIK}-next`,
    Image: info.Config.Image,
    Entrypoint: info.Config.Entrypoint,
    Cmd: args,
    Env: info.Config.Env,
    Labels: info.Config.Labels,
    ExposedPorts: Object.fromEntries(Object.keys(portBindings).map((port) => [port, {}])),
    HostConfig: { ...info.HostConfig, PortBindings: portBindings },
    NetworkingConfig: { EndpointsConfig: { [primaryNetwork!]: {} } },
  });

  try {
    for (const network of otherNetworks) await docker.getNetwork(network).connect({ Container: next.id });
    if (enabled) await next.putArchive(Buffer.from(await new Bun.Archive({ [DYNAMIC_CONFIG_PATH]: DYNAMIC_CONFIG }).bytes()), { path: "/" });
    await current.stop();
    await next.start();
    await waitUntilStable(next.id);
  } catch (err) {
    await next.remove({ force: true }).catch(() => {});
    await current.start().catch(() => {});
    throw err;
  }

  await current.remove();
  await next.rename({ name: TRAEFIK });
  return true;
}

async function waitUntilStable(containerId: string) {
  const container = docker.getContainer(containerId);
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const { State } = await container.inspect();
    if (!State.Running || State.Restarting) {
      const logs = await container.logs({ stdout: true, stderr: true, tail: 20 });
      throw new Error(`Traefik didn't stay up after the restart: ${logs.toString("utf-8").trim()}`);
    }
  }
}
