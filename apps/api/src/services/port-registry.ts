import { readListeningPorts } from "./host-ports";

const AUTO_RANGE_START = 10000;
const AUTO_RANGE_END = 20000;
export const MIN_HOST_PORT = 1024;
export const MAX_HOST_PORT = 65535;
const RESERVED_PORTS = new Map([
  [2377, "Docker Swarm"],
  [4789, "Docker Swarm"],
  [7946, "Docker Swarm"],
]);

async function listeningTcpPorts() {
  return new Set((await readListeningPorts()).filter((p) => p.protocol === "tcp").map((p) => p.port));
}

export async function findAvailablePort(taken: Set<number>): Promise<{ available: true; port: number } | { available: false; reason: string }> {
  const listening = await listeningTcpPorts();
  for (let port = AUTO_RANGE_START; port <= AUTO_RANGE_END; port++) {
    if (!taken.has(port) && !listening.has(port) && !RESERVED_PORTS.has(port)) return { available: true, port };
  }
  return { available: false, reason: `No free port between ${AUTO_RANGE_START} and ${AUTO_RANGE_END}` };
}

export async function hostPortConflict(port: number, takenByOtherApps: Set<number>, currentPort: number | null): Promise<string | null> {
  const reservedFor = RESERVED_PORTS.get(port);
  if (reservedFor) return `Port ${port} is reserved for ${reservedFor}.`;
  if (takenByOtherApps.has(port)) return `Port ${port} is already used by another application.`;
  if (port !== currentPort && (await listeningTcpPorts()).has(port)) return `Port ${port} is already in use on this server.`;
  return null;
}
