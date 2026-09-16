import { docker, parseDockerStats } from "./deploy";

export interface LiveStat {
  cpu: number;
  memUsed: number;
  memLimit: number;
}

type StatsStream = { on(event: "data", cb: (chunk: Buffer) => void): void; on(event: "error", cb: (err: Error) => void): void; destroy(): void };

interface Tracked {
  stream: StatsStream | null;
  latest: LiveStat;
}

const IDLE_STAT: LiveStat = { cpu: 0, memUsed: 0, memLimit: 0 };

// One persistent `docker stats` stream per container id, shared by every /api/system/stats connection — the
// previous approach fired a fresh one-shot stats call per container per connection every 2s, which meant
// dockerd was doing (containers × open dashboard tabs) stat computations a second instead of one stream each.
const tracked = new Map<string, Tracked>();

function track(containerId: string) {
  if (tracked.has(containerId)) return;
  const entry: Tracked = { stream: null, latest: IDLE_STAT };
  tracked.set(containerId, entry);

  (async () => {
    let statsStream: StatsStream;
    try {
      statsStream = (await docker.getContainer(containerId).stats({ stream: true })) as unknown as StatsStream;
    } catch {
      tracked.delete(containerId);
      return;
    }
    // untrack() may have already run while stats() was resolving (container gone before the stream opened).
    if (tracked.get(containerId) !== entry) {
      statsStream.destroy();
      return;
    }
    entry.stream = statsStream;

    let buffered = "";
    statsStream.on("data", (chunk) => {
      buffered += chunk.toString("utf-8");
      let newlineIndex: number;
      while ((newlineIndex = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        if (!line) continue;
        const sample = parseDockerStats(JSON.parse(line));
        entry.latest = { cpu: sample.cpu, memUsed: sample.memUsed, memLimit: sample.memLimit };
      }
    });
    statsStream.on("error", () => untrack(containerId));
  })();
}

function untrack(containerId: string) {
  const entry = tracked.get(containerId);
  tracked.delete(containerId);
  entry?.stream?.destroy();
}

// Called once per shared tick with the container ids that currently matter (running apps + infra) — starts a
// stream for anything new, stops one for anything gone (stopped, removed, or replaced by a redeploy).
export function syncTrackedContainers(containerIds: Iterable<string>) {
  const wanted = new Set(containerIds);
  for (const id of wanted) track(id);
  for (const id of tracked.keys()) if (!wanted.has(id)) untrack(id);
}

export function getLiveStat(containerId: string): LiveStat {
  return tracked.get(containerId)?.latest ?? IDLE_STAT;
}
