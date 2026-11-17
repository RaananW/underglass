/**
 * Vite config for the public showcase (`npm run dev:showcase`, `build:showcase`, `preview:showcase`).
 * The build output in `dist` is what Vercel (`vercel.json`) and the Pages workflow deploy;
 * `scripts/check-showcase-assets.mjs` then rejects anything but the pages, site files and assets it
 * lists. See `docs/showcase.md`.
 */
import { defineConfig } from "vite";
import { showcaseBase } from "./site-policy.mjs";
import { seo } from "./seo.ts";
import { prerender } from "./prerender.ts";
import { inlineCss } from "./inline-css.ts";
import { join } from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  // One HTML page per URL with its own metadata, plus sitemap, robots and 404 (`seo.ts`); `prerender.ts` renders
  // the preview home page's React tree into `next.html`, and `inline-css.ts` writes its stylesheet into it.
  plugins: [seo(), prerender(), inlineCss(["next.html"])],
  // Vercel sets `VERCEL=1` in its builds: only those load Vercel Web Analytics (`analytics.ts`), which is
  // served from the deployment's own `/_vercel/insights/`.
  define: { __VERCEL_ANALYTICS__: JSON.stringify(process.env.VERCEL === "1") },
  // `/underglass/` by default; `CANVAS_SHOWCASE_BASE=/` builds for a domain root.
  base: showcaseBase(process.env.CANVAS_SHOWCASE_BASE),
  cacheDir: "../../node_modules/.vite/showcase",
  // The tasks example imports `TodoApp` from the playground sources; dedupe keeps one React copy
  // for it, the library and this app.
  resolve: { dedupe: ["react", "react-dom"] },
  // No source maps in the public build; the asset check refuses source-map references.
  // The page loads with only React and the catalog; Underglass and each example are chunks loaded on demand
  // (`examples.ts`). Two of those are single libraries over Vite's default 500 kB warning: Fluent UI (about
  // 535 kB, only for the Fluent example) and the Underglass runtime with Babylon Lite (about 525 kB, after the
  // page has rendered). The limit sits just above them, so a new oversized chunk still warns.
  build: { sourcemap: false, outDir: "dist", chunkSizeWarningLimit: 600, rolldownOptions: {
    // Two pages: the site (`index.html`, which `seo.ts` copies per example) and the preview home page at `/next`.
    input: { index: join(import.meta.dirname, "index.html"), next: join(import.meta.dirname, "next.html") },
    // Fluent UI and Radix mark their modules "use client" (a React Server Components directive), and the
    // bundler warns once per module (about 950 warnings) that it drops it. This is a browser-only bundle, so
    // dropping it changes nothing; every other warning still prints.
    onLog(level, log, handler) {
      if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.message.includes('"use client"')) return;
      handler(level, log);
    },
  } },
});
