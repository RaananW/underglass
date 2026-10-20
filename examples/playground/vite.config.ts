// Vite config for the playground. Every `*.html` file in this directory is a page and a build input,
// and `@underglass/react`, `@underglass/vue` and `@underglass/core` resolve to the library sources so the
// pages run against the working tree without a build, sharing one copy of the core runtime with the
// engineering deep imports.
import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  root,
  // Keep the Vite dependency cache in the repository root's `node_modules`.
  cacheDir: resolve(root, "../../node_modules/.vite/playground"),
  resolve: {
    // Exact matches: a bare string key would also rewrite the subpath entries.
    alias: [
      { find: /^@underglass\/react$/, replacement: resolve(root, "../../packages/react/src/index.ts") },
      { find: /^@underglass\/vue$/, replacement: resolve(root, "../../packages/vue/src/index.ts") },
      { find: /^@underglass\/core$/, replacement: resolve(root, "../../packages/core/src/index.ts") },
      { find: /^@underglass\/core\/experimental-worker$/, replacement: resolve(root, "../../packages/core/src/experimental-worker.ts") },
      // Strata's modules from source too; its CSS (`@underglass/ui/css`) is the built stylesheet.
      { find: /^@underglass\/ui\/(tokens|dom|gpu|react|vue)$/, replacement: resolve(root, "../../packages/ui/src/$1/index.ts") },
      // The built stylesheets by path, so the React 18 run copy (which has no workspace symlinks) resolves them too.
      { find: /^@underglass\/ui\/css$/, replacement: resolve(root, "../../packages/ui/dist/css/strata.css") },
      { find: /^@underglass\/ui\/css\/(tokens|components)\.css$/, replacement: resolve(root, "../../packages/ui/dist/css/$1.css") },
    ],
    // Force a single copy of React and of Vue so the libraries and the pages share hooks, context and injection.
    dedupe: ["react", "react-dom", "vue"],
  },
  // Vue's compile-time feature flags for its bundler build; the Vue page uses render functions, not the
  // Options API, and ships no devtools hooks.
  define: {
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      // Every page in the playground root; adding a page needs no edit to a shared list.
      input: readdirSync(root).filter(name => name.endsWith(".html")).sort().map(name => resolve(root, name)),
    },
  },
});
