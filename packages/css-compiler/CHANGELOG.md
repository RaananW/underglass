# @underglass/css-compiler

## 0.2.2

### Patch Changes

- 73fa6e1: Package READMEs: no stale version in the first line, install commands, links to underglass.dev and the repository, and absolute documentation links that work on npm. The Strata README describes everything the package ships, not only its first tier.
- Updated dependencies [73fa6e1]
  - @underglass/core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [4631168]
  - @underglass/core@0.2.1

## 0.2.0

### Minor Changes

- e2e3f58: Add `setMaterial(id, descriptor)`: a persistent, colour-only material on any enrolled layer, interactive or decorative (`interaction: "material"`). The layer's controls keep taking input. The runtime evaluates the material on a neutral grey, never on the captured pixels, and scales the layer by one brightness factor limited to `interior.max` (at most 0.1), so text and its background change together and contrast holds. A material runs before the effect chain in the same pass, persists across ordinary DOM and readmission, and is reported in `runtimeResources.materials` and `state().materials`. The per-layer uniform block grows from 44 to 52 floats (`LAYER_BLOCK_FLOATS`), and compiled program sets are now version 3: rebuild them with the matching CSS compiler.
- dc94e5b: Add tilted layers: `Transform` gains `tiltX`, `tiltY` (at most ±60 degrees, as CSS `rotateX`/`rotateY`) and `perspective` (default 1600 px), in `setTransform`, `animate` and typed motion. On the GPU, pixels and native hits follow the projection; in ordinary DOM the same matrix is applied as `matrix3d`. Admission proves projective hit testing on the installed browser before tilt is allowed on the GPU. A tilted layer must not be clipped by a viewport or its own overflow (crbug.com/573454036, WICG html-in-canvas#186). The per-layer uniform block grows to 56 floats and compiled program sets move to version 4: rebuild them with the matching CSS compiler.

### Patch Changes

- e2eb8aa: Update the PostCSS dependency to 8.5.31.
- 5e867f3: Prepare the packages for their first npm release: the five library packages are no longer marked `"private"` (they still publish nothing until the Release workflow is enabled), and their READMEs no longer describe them as private or unpublished. `@underglass/css-compiler`'s README no longer names a stale `0.0.0` version. `@underglass/ui` no longer ships TypeScript source: its `./astro` export is now `dist/astro/astro/index.js` with declarations, with the `.astro` components copied beside the JavaScript they import (your Astro build still compiles the `.astro` files), and the tarball carries only `dist`, the stylesheets, the scene schema and the conformance JSON, plus `dist/shared/*.d.ts` that the published declarations import.
- Updated dependencies [2bd3b69]
- Updated dependencies [9af1bff]
- Updated dependencies [6e53ffc]
- Updated dependencies [942a333]
- Updated dependencies [26c2aac]
- Updated dependencies [e4075a9]
- Updated dependencies [ac51e29]
- Updated dependencies [d8e22cc]
- Updated dependencies [eb867b1]
- Updated dependencies [6a258dc]
- Updated dependencies [e2e3f58]
- Updated dependencies [b333aca]
- Updated dependencies [b849f12]
- Updated dependencies [bac6bf3]
- Updated dependencies [af9921c]
- Updated dependencies [672d0b2]
- Updated dependencies [d44dbc5]
- Updated dependencies [1cefae6]
- Updated dependencies [c3a1d47]
- Updated dependencies [dc94e5b]
- Updated dependencies [bd6af09]
- Updated dependencies [aac065c]
- Updated dependencies [5e867f3]
- Updated dependencies [1ee5716]
- Updated dependencies [38eca1d]
  - @underglass/core@0.2.0

## 0.1.0

Baseline development version. Never published; recorded here so the first published release has a
starting point. Earlier development used version 0.0.0; the package now shares one version with the
other Underglass packages.

- Opt-in build-time compiler for selected CSS animations listed in `underglass.config.json`,
  producing literal WGSL and matching native-geometry samplers in `virtual:underglass/compiled`.
- Vite (`./vite`) and webpack (`./webpack`) integrations that reuse the application's own CSS, Sass,
  PostCSS and CSS Modules pipeline.
