import { docker } from "./deploy";

const TRAEFIK = "kuberfy-traefik";
const DATABASE_PORT = "5432/tcp";
const DYNAMIC_CONFIG_PATH = "etc/kuberfy/traefik.yml";
const DATABASE_ARGS = ["--entrypoints.postgres.address=:5432", `--providers.file.filename=/${DYNAMIC_CONFIG_PATH}`];

// TODO: drop once every install has booted a release without the shared Postgres entrypoint.
export async function removeDatabaseEntrypoint() {
  const current = docker.getContainer(TRAEFIK);
  const info = await current.inspect().catch((err: { statusCode?: number }) => {
    if (err.statusCode === 404) return null;
    throw err;
  });
  if (!info) return false;

  const args = (info.Config.Cmd ?? []).filter((arg) => !DATABASE_ARGS.includes(arg));
  const { [DATABASE_PORT]: databaseBinding, ...portBindings } = info.HostConfig.PortBindings ?? {};
  if (!databaseBinding && args.length === (info.Config.Cmd ?? []).length) return false;

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
