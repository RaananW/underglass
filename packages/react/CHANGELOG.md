# @underglass/react

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
- b333aca: Add the `objects` material: `setMaterial(id, { kind: "objects", scene })` takes a Strata scene in version 2 of the rendering model, whose back-to-front list also holds objects (keys, slabs, bezels, wells, rails, marks, knobs, pucks) seen through a perspective camera. Their tops keep the captured content in place and nothing is drawn outside a control; an object that would be is drawn at the Relief level and listed in `state().materials[].degraded`. Relief scenes also gain shadow occlusion by later primitives, which changes no conformance colour.
- b849f12: Add the built-in `relief` material: `setMaterial(id, { kind: "relief", scene })` shades a Strata Rendering Model scene (bevels, wells, finishes, cast shadows, focus edges and ring arcs for up to 256 relief primitives) on any enrolled layer, with face interiors held to the model's contrast guard. `MaterialHandle.update(scene)` changes states and geometry without recompiling. New exported types: `CustomMaterial`, `ReliefMaterial`, `ReliefScene`, `ReliefPrimitive` and `ReliefSceneMaterial`.
- c3a1d47: Add the `stage` material: `setMaterial(id, { kind: "stage", scene })` draws a Strata stage scene on a decorative layer, a lit backdrop and up to 256 particles moved by scene updates with no recompile. The `objects` material now also takes version 3 scenes, whose environment may be a 32 × 16 brightness map instead of the studio.
- dc94e5b: Add tilted layers: `Transform` gains `tiltX`, `tiltY` (at most ±60 degrees, as CSS `rotateX`/`rotateY`) and `perspective` (default 1600 px), in `setTransform`, `animate` and typed motion. On the GPU, pixels and native hits follow the projection; in ordinary DOM the same matrix is applied as `matrix3d`. Admission proves projective hit testing on the installed browser before tilt is allowed on the GPU. A tilted layer must not be clipped by a viewport or its own overflow (crbug.com/573454036, WICG html-in-canvas#186). The per-layer uniform block grows to 56 floats and compiled program sets move to version 4: rebuild them with the matching CSS compiler.

### Patch Changes

- 5e867f3: Prepare the packages for their first npm release: the five library packages are no longer marked `"private"` (they still publish nothing until the Release workflow is enabled), and their READMEs no longer describe them as private or unpublished. `@underglass/css-compiler`'s README no longer names a stale `0.0.0` version. `@underglass/ui` no longer ships TypeScript source: its `./astro` export is now `dist/astro/astro/index.js` with declarations, with the `.astro` components copied beside the JavaScript they import (your Astro build still compiles the `.astro` files), and the tarball carries only `dist`, the stylesheets, the scene schema and the conformance JSON, plus `dist/shared/*.d.ts` that the published declarations import.
- 1ee5716: Shallower bevels for narrow bands in the `relief` material: a primitive whose bevel band is narrower than `bevel.width` now has its slope scaled by the ratio, so a 2 px groove (a divider, a tab rail) is a shallow groove instead of a near-black line. Primitives at least two bevel widths across are unchanged.
- 38eca1d: Soften cast shadows in the `relief` and `objects` materials. On a face interior held by the contrast guard, a cast shadow is now scaled to darken by at most `interior.max` instead of being cut off there, so a tall caster's shadow fades smoothly instead of standing as a flat grey plateau. In `objects` scenes, hover now raises an object's cap by a quarter of its height (it no longer multiplies the height by `state.hoverHeight`), and hit safety checks that hovered geometry.
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
starting point.

- React 18.3.1 and 19 adapter over `@underglass/core`: `mountCanvasApp`, `GPUHost`, `Surface`,
  `Box`, `NativeScroll`, `NativeOverlay`, `Presence`, `useSurfaceRef`, `useGPUHost` and
  `useNativeOverlayHost`, with React state and the original controls kept across GPU admission,
  recovery and disposal.
- Re-exports the framework-neutral helpers and types of `@underglass/core`, plus its `./build` and
  `./experimental-worker/thread` entries; `./experimental-worker` adds the React worker controller.
