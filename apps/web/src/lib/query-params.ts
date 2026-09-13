// Client islands read their real id from the URL's query string, not a path segment (`/applications/view?id=...`
// rather than `/applications/[id]`). Astro's static output can only pre-build the fixed set of routes returned by
// getStaticPaths() — a real per-request id has nowhere to live in a path segment without a server-side rewrite, and
// that rewrite only exists in production (Hono's serveStatic), not in front of `astro dev`. A query string needs no
// rewrite anywhere, in dev or prod. See private/PLAN.md and https://github.com/withastro/astro/issues/11928.
export function getQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}
