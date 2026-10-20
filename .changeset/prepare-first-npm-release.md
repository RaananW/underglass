---
"@underglass/core": patch
"@underglass/react": patch
"@underglass/vue": patch
"@underglass/css-compiler": patch
---

Prepare the packages for their first npm release: the four public packages are no longer marked `"private"` (they still publish nothing until the Release workflow is enabled), and their READMEs no longer describe them as private or unpublished. `@underglass/css-compiler`'s README no longer names a stale `0.0.0` version.
