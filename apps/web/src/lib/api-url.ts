// In dev, the panel (Astro, hot-reload) and the API (Bun, hot-reload) run as separate origins/ports — PUBLIC_API_URL
// points fetches and WebSockets at the API directly (see docker-compose.dev.yml). In production both are one
// process on one origin, so this stays unset and every call below resolves relative to the current page, unchanged.
const API_BASE = import.meta.env.PUBLIC_API_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function apiWsUrl(path: string): string {
  const url = new URL(path, API_BASE || window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
