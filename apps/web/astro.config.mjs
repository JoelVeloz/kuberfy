// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (/node_modules\/@xterm\//.test(id)) return "terminal";
            if (/node_modules\/(recharts|victory-vendor|d3-|internmap|decimal\.js-light|react-redux|@reduxjs|redux|immer|reselect|es-toolkit|eventemitter3|use-sync-external-store)\//.test(id) || id.includes("/src/components/ui/chart.tsx")) return "charts";
            if (id.includes("node_modules")) return "vendor";
            if (/\/src\/(components\/ui|lib|hooks)\//.test(id)) return "common";
            return undefined;
          },
        },
      },
    },
  },
});
