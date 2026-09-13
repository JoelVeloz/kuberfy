// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // dev-only: proxies to apps/api so relative /api/* fetches work; same origin already in the production image.
    // API_URL lets docker-compose.dev.yml point this at the sibling "api" container instead of localhost.
    // ws: true is required for the runtime-logs/exec/build-logs WebSocket routes — the string shorthand form
    // doesn't proxy WebSocket upgrades, so those connections hang silently in dev without it.
    server: {
      proxy: {
        "/api": { target: process.env.API_URL || "http://localhost:3000", ws: true },
      },
    },
  },
});
