import { eq, ne } from "drizzle-orm";
import { db } from "../db";
import { application } from "../db/schema/app";
import { applyApplicationDomains, defaultContainerPort } from "./deploy";
import { findAvailablePort, hostPortConflict } from "./port-registry";

export class PublicPortError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface PublicPortInput {
  enabled: boolean;
  hostPort?: number;
  containerPort?: number;
}

export async function setPublicPort(applicationId: string, input: PublicPortInput) {
  const found = await db.query.application.findFirst({
    where: eq(application.id, applicationId),
    columns: { id: true, buildType: true, repoUrl: true, hostPort: true, containerPort: true },
    with: { domains: true },
  });
  if (!found) throw new PublicPortError(404, "Application not found");

  let ports: { hostPort: number | null; containerPort: number | null } = { hostPort: null, containerPort: null };
  if (input.enabled) {
    const others = await db.query.application.findMany({ where: ne(application.id, applicationId), columns: { hostPort: true } });
    const taken = new Set(others.flatMap((a) => (a.hostPort == null ? [] : [a.hostPort])));

    let hostPort = input.hostPort ?? found.hostPort;
    if (hostPort == null) {
      const result = await findAvailablePort(taken);
      if (!result.available) throw new PublicPortError(409, result.reason);
      hostPort = result.port;
    } else {
      const conflict = await hostPortConflict(hostPort, taken, found.hostPort);
      if (conflict) throw new PublicPortError(409, conflict);
    }

    const containerPort = input.containerPort ?? found.containerPort ?? (await defaultContainerPort(found, found.domains));
    if (containerPort == null) throw new PublicPortError(400, "Couldn't detect which port this app listens on — set the container port.");
    ports = { hostPort, containerPort };
  }

  try {
    await db.update(application).set({ ...ports, updatedAt: new Date() }).where(eq(application.id, applicationId));
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new PublicPortError(409, `Port ${ports.hostPort} was just taken by another application.`);
    throw err;
  }
  await applyApplicationDomains(applicationId);
  return ports;
}
