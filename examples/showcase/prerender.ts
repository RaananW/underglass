/**
 * Vite plugin that renders a page's React tree to HTML when the showcase is built or served, so the page's content is
 * in the HTML file itself. A page marks the place with `<!-- prerender:/src/x/prerender.tsx -->`; the named module
 * exports `prerender(base: string): string`, and its result replaces the marker. Used by `next.html`.
 *
 * The module is loaded through Vite's SSR loader in Node, with no DOM. The dev server loads it itself; a build has no
 * dev server, so one is started for the load and closed again.
 */
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { createServer, type Plugin } from "vite";

/** The marker a page puts where its prerendered markup goes, naming the module that renders it. */
export const prerenderMarker = /<!-- prerender:(\S+) -->/;

export function prerender(): Plugin {
  // The real path: a shell whose working directory spells the drive letter in the other case would otherwise make
  // Node load two copies of React, one per spelling.
  const root = realpathSync.native(import.meta.dirname);
  let base = "/", mode = "production";
  return {
    name: "underglass-showcase-prerender",
    configResolved(config) { base = config.base; mode = config.mode; },
    transformIndexHtml: { order: "pre", async handler(html, context) {
      const match = prerenderMarker.exec(html);
      if (!match) return html;
      const server = context.server ?? await createServer({
        configFile: join(root, "vite.config.ts"), root, mode, appType: "custom", logLevel: "error",
        server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] },
        cacheDir: join(root, "../../node_modules/.vite/showcase-prerender"),
      });
      try {
        const module = await server.ssrLoadModule(match[1]!) as { prerender(base: string): string };
        return html.replace(match[0], () => module.prerender(base));
      } finally { if (!context.server) await server.close(); }
    } },
  };
}
