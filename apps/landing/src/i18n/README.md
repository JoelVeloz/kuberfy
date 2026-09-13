# i18n

Astro's built-in i18n routing (`astro.config.mjs`), no plugin. Only the home page is translated. Default locale
(`en`) is unprefixed at `/`; the others live at `/es/` and `/pt-br/`.

This is a static site — there's no server to read the `Accept-Language` header, so locale detection happens
once, client-side, on the default English page only (`src/pages/index.astro`): it checks `navigator.language`
and redirects on a visitor's first load. A `localStorage` flag means it never redirects again after that —
picking a language manually via the switcher, or just staying on the page it landed on, is final.
