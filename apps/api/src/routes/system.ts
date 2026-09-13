import * as fs from "node:fs";
import * as os from "node:os";
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { db } from "../db";
import { deployment } from "../db/schema/app";
import { env } from "../lib/env";
import { requireAuth } from "../lib/auth-middleware";
import { docker, parseDockerStats, pullImage, resolveContainerId, type DockerStatsSample } from "../services/deploy";

export const system = new Hono();

system.use("*", requireAuth);

// Aggregate ticks straight from /proc/stat's "cpu " line, not os.cpus() — Node drops iowait entirely from what
// it exposes on Linux, so a disk-bound host (heavy image pulls, a slow volume) reads as near-100% "CPU" here
// even with zero real compute work, since that missing iowait time vanishes from both idle and total instead
// of counting as idle-like the way `top`/vmstat treat it.
function cpuSnapshot() {
  const fields = fs.readFileSync("/proc/stat", "utf-8").split("\n")[0]!.trim().split(/\s+/).slice(1).map(Number);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = fields;
  return { idle: idle! + iowait!, total: user! + nice! + system! + idle! + iowait! + irq! + softirq! + (steal ?? 0) };
}

function hostCpuPercent(prev: { idle: number; total: number }, next: { idle: number; total: number }) {
  const idleDelta = next.idle - prev.idle;
  const totalDelta = next.total - prev.total;
  return totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 1000) / 10 : 0;
}

// os.freemem() only counts truly unused pages — on Linux almost all "free" RAM gets used as disk cache, which is
// reclaimable on demand and not real pressure (the same reason `free -h`'s "available" column differs from "free").
// /proc/meminfo's MemAvailable already accounts for that, matching what `free`/htop actually report as usage.
function hostMemory() {
  const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
  const totalKb = Number(/MemTotal:\s*(\d+)/.exec(meminfo)?.[1] ?? 0);
  const availableKb = Number(/MemAvailable:\s*(\d+)/.exec(meminfo)?.[1] ?? 0);
  return { memTotal: totalKb * 1024, memUsed: (totalKb - availableKb) * 1024 };
}

// Kuberfy's own infrastructure — Traefik plus this very process's container — reported the same way as any
// deployed app, so you can see whether the platform itself (not just what's deployed on it) is at its limit.
async function findInfraContainers(): Promise<Array<{ id: string; name: string }>> {
  const containers = await docker.listContainers();
  // Docker sets HOSTNAME to the short container id by default, so this identifies whichever container is
  // actually running this API process, in dev or production, without hardcoding a container/service name.
  const selfId = os.hostname();
  const infra: Array<{ id: string; name: string }> = [];
  for (const c of containers) {
    if (c.Image.split(":")[0] === "traefik") infra.push({ id: c.Id, name: "Traefik" });
    else if (c.Id.startsWith(selfId)) infra.push({ id: c.Id, name: "Kuberfy" });
  }
  return infra;
}

async function containerStats(containerId: string) {
  try {
    const raw = (await docker.getContainer(containerId).stats({ stream: false })) as unknown as DockerStatsSample;
    return parseDockerStats(raw);
  } catch {
    // container gone/unreachable between listing it and this tick — report it as idle rather than failing the whole batch
    return { cpu: 0, memUsed: 0, memLimit: 0 };
  }
}

const CLK_TCK = 100; // USER_HZ — universal on every Linux arch we target, so not worth shelling out to `getconf` for
const HOST_PROC = "/host/proc"; // the real host's /proc, bind-mounted read-only — Swarm services can't share the host PID namespace
// (no --pid=host equivalent for `docker service create`), so per-process /proc/[pid] entries aren't visible any other way.

interface ProcessSample {
  pid: number;
  command: string;
  cpu: number;
  memUsed: number;
}

// Mirrors hostCpuPercent's approach (a delta over the real elapsed time between ticks) but per-pid, since
// /proc/[pid]/stat only exposes cumulative CPU ticks since process start, not a live percentage.
function readHostProcesses(prevTicks: Map<number, number>, elapsedSeconds: number): { processes: ProcessSample[]; ticks: Map<number, number> } {
  const ticks = new Map<number, number>();
  const processes: ProcessSample[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(HOST_PROC);
  } catch {
    return { processes, ticks }; // not mounted (e.g. local dev without the bind mount) — report no processes rather than crash
  }

  for (const entry of entries) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) continue;

    let stat: string;
    try {
      stat = fs.readFileSync(`${HOST_PROC}/${pid}/stat`, "utf-8");
    } catch {
      continue; // exited between the readdir and this read
    }

    // comm is parenthesized and may itself contain "(" / ")", so locate it by the outermost pair rather than splitting on spaces
    const commEnd = stat.lastIndexOf(")");
    const comm = stat.slice(stat.indexOf("(") + 1, commEnd);
    // everything after ") " starts at field 3 (state) — utime/stime are fields 14/15, i.e. indexes 11/12 here
    const fields = stat
      .slice(commEnd + 2)
      .trim()
      .split(/\s+/);
    const totalTicks = Number(fields[11]) + Number(fields[12]);
    ticks.set(pid, totalTicks);

    const prev = prevTicks.get(pid);
    const cpu = prev !== undefined && elapsedSeconds > 0 ? Math.max(0, Math.round(((totalTicks - prev) / CLK_TCK / elapsedSeconds) * 1000) / 10) : 0;

    // Full argv reads better for debugging than the 15-char-truncated comm — but kernel threads have no argv, so fall back to comm for those
    let command = comm;
    try {
      const cmdline = fs.readFileSync(`${HOST_PROC}/${pid}/cmdline`, "utf-8").replace(/\0/g, " ").trim();
      if (cmdline) command = cmdline;
    } catch {
      // ignore — comm already set
    }

    processes.push({ pid, command, cpu, memUsed: Number(fields[21]) * 4096 });
  }

  return { processes, ticks };
}

// Every unused image (not just dangling — matches `docker image prune -a`, since a self-hosted single-node
// instance has no other consumer of an old image once its app has redeployed onto a newer tag) plus the
// buildkit cache from Dockerfile-based deploys, the two things that actually fill the disk over time.
system.post("/prune", async (c) => {
  const [images, builder] = await Promise.all([docker.pruneImages({ filters: { dangling: ["false"] } }), docker.pruneBuilder({})]);
  const spaceReclaimed = (images.SpaceReclaimed ?? 0) + (builder.SpaceReclaimed ?? 0);
  return c.json({ spaceReclaimed, imagesDeleted: images.ImagesDeleted?.length ?? 0 });
});

// Docker sets HOSTNAME to the short container id by default, same trick findInfraContainers() above uses to
// identify whichever container is actually running this API process.
async function selfContainer() {
  const containers = await docker.listContainers();
  return containers.find((c) => c.Id.startsWith(os.hostname())) ?? null;
}

// Pulls the tag fresh and compares its resolved image id against the one this container was actually started
// from — the same check `docker service update --image` ends up doing itself, surfaced ahead of time so the
// Settings page can show "up to date" without touching the live service.
system.post("/check-update", async (c) => {
  await pullImage(env.KUBERFY_IMAGE, () => {});
  const latestId = (await docker.getImage(env.KUBERFY_IMAGE).inspect()).Id;
  const self = await selfContainer();
  return c.json({ updateAvailable: self ? self.ImageID !== latestId : null, image: env.KUBERFY_IMAGE });
});

// Forces the Swarm service onto the image /check-update already pulled — same mechanism as `kuberfy update`/
// update.sh (see scripts/update.ts), triggered from the dashboard instead of the host CLI.
system.post("/update", async (c) => {
  const service = docker.getService("kuberfy");
  let info: any;
  try {
    info = await service.inspect();
  } catch {
    return c.json({ error: "Docker Swarm service 'kuberfy' not found — run `kuberfy update` on the host instead." }, 400);
  }
  const spec = info.Spec;
  spec.TaskTemplate.ContainerSpec.Image = env.KUBERFY_IMAGE;
  spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate ?? 0) + 1;
  await service.update({ version: info.Version.Index, ...spec });
  return c.json({ ok: true });
});

system.get(
  "/processes",
  upgradeWebSocket(() => {
    let prevTicks = new Map<number, number>();
    let prevTime = Date.now();
    let interval: ReturnType<typeof setInterval> | null = null;
    return {
      onOpen: (_evt, ws) => {
        const tick = () => {
          const now = Date.now();
          const elapsedSeconds = (now - prevTime) / 1000;
          const { processes, ticks } = readHostProcesses(prevTicks, elapsedSeconds);
          prevTicks = ticks;
          prevTime = now;
          ws.send(JSON.stringify({ t: now, processes }));
        };
        // Same "fire once immediately" reasoning as /stats — first tick's cpu reads 0 (no prior sample yet) and corrects 2s later.
        void tick();
        interval = setInterval(tick, 2000);
      },
      onClose: () => {
        if (interval) clearInterval(interval);
      },
    };
  }),
);

system.get(
  "/stats",
  upgradeWebSocket(() => {
    let prevCpu = cpuSnapshot();
    let interval: ReturnType<typeof setInterval> | null = null;
    return {
      onOpen: (_evt, ws) => {
        const tick = async () => {
          const nextCpu = cpuSnapshot();
          const hostCpu = hostCpuPercent(prevCpu, nextCpu);
          prevCpu = nextCpu;

          const { memTotal, memUsed } = hostMemory();

          // Reads the container's own root mount — under Docker's default overlay2 storage driver (no dedicated
          // volume backing it) this reports the host disk's real capacity/free space, since overlay2 isn't its own device.
          const diskInfo = fs.statfsSync("/");
          const diskTotal = diskInfo.blocks * diskInfo.bsize;
          const diskUsed = diskTotal - diskInfo.bavail * diskInfo.bsize;

          // limit: 1 — only the latest deployment's status/containerId matters here, and this query already
          // reruns every 2s for every application; fetching the full history each time would only get worse
          // as deployments pile up.
          const apps = await db.query.application.findMany({
            with: { deployments: { orderBy: desc(deployment.createdAt), limit: 1 } },
          });

          const appStats = await Promise.all(
            apps.map(async (app) => {
              const dep = app.deployments[0];
              // dep.containerId is a Swarm service ID — resolve the task's real container before reading stats,
              // since the Docker API only exposes stats at the container level.
              const containerId = dep?.status === "running" && dep.containerId ? await resolveContainerId(dep.containerId) : null;
              if (!containerId) {
                return { id: app.id, name: app.name, status: dep?.status ?? null, cpu: 0, memUsed: 0, memLimit: 0 };
              }
              return { id: app.id, name: app.name, status: dep!.status, ...(await containerStats(containerId)) };
            }),
          );

          const infraContainers = await findInfraContainers();
          const infraStats = await Promise.all(infraContainers.map(async (c) => ({ id: c.id, name: c.name, ...(await containerStats(c.id)) })));

          ws.send(JSON.stringify({ t: Date.now(), host: { cpu: hostCpu, memUsed, memTotal, diskUsed, diskTotal }, apps: appStats, infra: infraStats }));
        };
        // Fire once immediately so the page isn't sitting blank for a full tick before its first sample —
        // the CPU% on this first message reads 0 (no elapsed window yet) and corrects itself 2s later.
        void tick();
        interval = setInterval(tick, 2000);
      },
      onClose: () => {
        if (interval) clearInterval(interval);
      },
    };
  }),
);
