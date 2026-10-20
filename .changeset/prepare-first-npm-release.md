---
"@underglass/core": patch
"@underglass/react": patch
"@underglass/vue": patch
"@underglass/css-compiler": patch
"@underglass/ui": patch
---

Prepare the packages for their first npm release: the five library packages are no longer marked `"private"` (they still publish nothing until the Release workflow is enabled), and their READMEs no longer describe them as private or unpublished. `@underglass/css-compiler`'s README no longer names a stale `0.0.0` version. `@underglass/ui` no longer ships TypeScript source: its `./astro` export is now `dist/astro/astro/index.js` with declarations, with the `.astro` components copied beside the JavaScript they import (your Astro build still compiles the `.astro` files), and the tarball carries only `dist`, the stylesheets, the scene schema and the conformance JSON, plus `dist/shared/*.d.ts` that the published declarations import.
