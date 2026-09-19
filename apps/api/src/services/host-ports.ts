import fsp from "node:fs/promises";

const HOST_PROC = "/host/proc";

export interface ListeningPort {
  port: number;
  protocol: "tcp" | "udp";
  inode: string;
}

const SOURCES = [
  { file: "tcp", protocol: "tcp", state: "0A", v6: false },
  { file: "tcp6", protocol: "tcp", state: "0A", v6: true },
  { file: "udp", protocol: "udp", state: "07", v6: false },
  { file: "udp6", protocol: "udp", state: "07", v6: true },
] as const;

function isLoopback(address: string, v6: boolean) {
  if (!v6) return address.endsWith("7F");
  return address === "00000000000000000000000001000000" || (address.startsWith("0000000000000000FFFF0000") && address.endsWith("7F"));
}

export async function readListeningPorts(): Promise<ListeningPort[]> {
  const found: ListeningPort[] = [];
  for (const { file, protocol, state, v6 } of SOURCES) {
    let text: string;
    try {
      text = await fsp.readFile(`${HOST_PROC}/1/net/${file}`, "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 10 || fields[3] !== state) continue;
      const [address, hexPort] = fields[1].split(":");
      if (isLoopback(address, v6)) continue;
      found.push({ port: parseInt(hexPort, 16), protocol, inode: fields[9] });
    }
  }
  return found;
}

export async function resolveProcessNames(inodes: Set<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (inodes.size === 0) return names;

  let pids: string[];
  try {
    pids = (await fsp.readdir(HOST_PROC)).filter((entry) => /^\d+$/.test(entry));
  } catch {
    return names;
  }

  await Promise.all(
    pids.map(async (pid) => {
      let fds: string[];
      try {
        fds = await fsp.readdir(`${HOST_PROC}/${pid}/fd`);
      } catch {
        return;
      }
      for (const fd of fds) {
        let target: string;
        try {
          target = await fsp.readlink(`${HOST_PROC}/${pid}/fd/${fd}`);
        } catch {
          continue;
        }
        const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
        if (!inode || !inodes.has(inode) || names.has(inode)) continue;
        try {
          names.set(inode, (await fsp.readFile(`${HOST_PROC}/${pid}/comm`, "utf-8")).trim());
        } catch {}
      }
    }),
  );
  return names;
}
