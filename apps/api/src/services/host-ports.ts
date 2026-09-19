import fsp from "node:fs/promises";

const HOST_PROC = "/host/proc";

export interface ListeningPort {
  port: number;
  protocol: "tcp" | "udp";
}

const SOURCES = [
  { file: "tcp", protocol: "tcp", state: "0A" },
  { file: "tcp6", protocol: "tcp", state: "0A" },
  { file: "udp", protocol: "udp", state: "07" },
  { file: "udp6", protocol: "udp", state: "07" },
] as const;

function isWildcard(address: string) {
  return /^0+$/.test(address);
}

export async function readListeningPorts(): Promise<ListeningPort[]> {
  const found: ListeningPort[] = [];
  for (const { file, protocol, state } of SOURCES) {
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
      if (!isWildcard(address)) continue;
      found.push({ port: parseInt(hexPort, 16), protocol });
    }
  }
  return found;
}

const WELL_KNOWN_SERVICES: Record<string, string> = {
  "22/tcp": "SSH",
  "25/tcp": "SMTP",
  "53/tcp": "DNS",
  "53/udp": "DNS",
  "67/udp": "DHCP (server)",
  "68/udp": "DHCP (client)",
  "80/tcp": "HTTP",
  "110/tcp": "POP3",
  "111/tcp": "RPCbind (portmapper)",
  "111/udp": "RPCbind (portmapper)",
  "123/udp": "NTP",
  "143/tcp": "IMAP",
  "443/tcp": "HTTPS",
  "465/tcp": "SMTPS",
  "587/tcp": "SMTP (submission)",
  "993/tcp": "IMAPS",
  "995/tcp": "POP3S",
  "2377/tcp": "Docker Swarm (cluster management)",
  "3306/tcp": "MySQL",
  "5432/tcp": "PostgreSQL",
  "6379/tcp": "Redis",
  "7946/tcp": "Docker Swarm (node gossip)",
  "7946/udp": "Docker Swarm (node gossip)",
  "8080/tcp": "HTTP (alt)",
  "8443/tcp": "HTTPS (alt)",
  "27017/tcp": "MongoDB",
  "4789/udp": "Docker Swarm (VXLAN overlay)",
};

export function wellKnownServiceName(port: number, protocol: string): string {
  return WELL_KNOWN_SERVICES[`${port}/${protocol}`] ?? "Unknown service";
}
