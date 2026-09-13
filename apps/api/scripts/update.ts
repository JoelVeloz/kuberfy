import Docker from "dockerode";

const docker = new Docker();
const image = process.env.KUBERFY_IMAGE || "ghcr.io/joelveloz/kuberfy:latest";

async function main() {
  console.log(`Checking Docker Swarm service 'kuberfy'...`);
  const service = docker.getService("kuberfy");

  let info: any;
  try {
    info = await service.inspect();
  } catch (_err) {
    console.error(`Error: Could not inspect 'kuberfy' service. Is Kuberfy running in Swarm mode?`);
    process.exit(1);
  }

  console.log(`Pulling latest image: ${image}...`);
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (err: Error | null) => (err ? reject(err) : resolve()),
        (event: { status?: string }) => event?.status && console.log(event.status),
      );
    });
  });

  console.log(`Updating service 'kuberfy' to ${image}...`);
  const spec = info.Spec;
  const version = info.Version.Index;

  const currentForce = spec.TaskTemplate?.ForceUpdate ?? 0;
  spec.TaskTemplate = {
    ...spec.TaskTemplate,
    ContainerSpec: {
      ...spec.TaskTemplate?.ContainerSpec,
      Image: image,
    },
    ForceUpdate: currentForce + 1,
  };

  await service.update({ _query: { version }, _body: spec });
  console.log(`Update initiated successfully. Docker Swarm is rolling out the new container.`);
}

main().catch((err) => {
  console.error("Update failed:", err?.message || err);
  process.exit(1);
});
