// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // dev-only: proxies to apps/api (:3000) so relative /api/* fetches work; same origin already in the Docker image
    server: {
      proxy: {
        "/api": "http://localhost:3000",
      },
    },
  },
});
