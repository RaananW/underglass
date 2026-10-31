/**
 * Vite config for the public showcase (`npm run dev:showcase`, `build:showcase`, `preview:showcase`).
 * The build output in `dist` is what Vercel (`vercel.json`) and the Pages workflow deploy;
 * `scripts/check-showcase-assets.mjs` then rejects anything but the pages, site files and assets it
 * lists. See `docs/showcase.md`.
 */
import { defineConfig } from "vite";
import { showcaseBase } from "./site-policy.mjs";
import { seo } from "./seo.ts";

export default defineConfig({
  root: import.meta.dirname,
  // One HTML page per URL with its own metadata, plus sitemap, robots and 404 (`seo.ts`).
  plugins: [seo()],
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
  build: { sourcemap: false, outDir: "dist" },
});
