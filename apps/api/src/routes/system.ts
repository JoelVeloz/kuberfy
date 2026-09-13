import * as fs from "node:fs";
import * as os from "node:os";
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { db } from "../db";
import { deployment } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";
import { docker, parseDockerStats, type DockerStatsSample } from "../services/deploy";

export const system = new Hono();

system.use("*", requireAuth);

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
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

          const apps = await db.query.application.findMany({
            with: { deployments: { orderBy: desc(deployment.createdAt) } },
          });

          const appStats = await Promise.all(
            apps.map(async (app) => {
              const dep = app.deployments[0];
              if (!dep || dep.status !== "running" || !dep.containerId) {
                return { id: app.id, name: app.name, status: dep?.status ?? null, cpu: 0, memUsed: 0, memLimit: 0 };
              }
              try {
                const raw = (await docker.getContainer(dep.containerId).stats({ stream: false })) as unknown as DockerStatsSample;
                const parsed = parseDockerStats(raw);
                return { id: app.id, name: app.name, status: dep.status, cpu: parsed.cpu, memUsed: parsed.memUsed, memLimit: parsed.memLimit };
              } catch {
                // container gone/unreachable between the deployment row and this tick — report it as idle rather than failing the whole batch
                return { id: app.id, name: app.name, status: dep.status, cpu: 0, memUsed: 0, memLimit: 0 };
              }
            }),
          );

          ws.send(JSON.stringify({ t: Date.now(), host: { cpu: hostCpu, memUsed, memTotal, diskUsed, diskTotal }, apps: appStats }));
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
