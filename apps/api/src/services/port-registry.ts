import { readListeningPorts } from "./host-ports";

const PORT_RANGE_START = 10000;
const PORT_RANGE_END = 20000;

export async function findAvailablePort(taken: Set<number>): Promise<{ available: true; port: number } | { available: false; reason: string }> {
  const listening = new Set((await readListeningPorts()).map((p) => p.port));
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!taken.has(port) && !listening.has(port)) return { available: true, port };
  }
  return { available: false, reason: `No free port between ${PORT_RANGE_START} and ${PORT_RANGE_END}` };
}
