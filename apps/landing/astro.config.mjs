// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // Astro's own i18n routing — no plugin. Only the home page is translated (see src/i18n): default locale
  // stays unprefixed at "/", the others live at "/es/" and "/pt-br/".
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es", { path: "pt-br", codes: ["pt-BR"] }],
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
