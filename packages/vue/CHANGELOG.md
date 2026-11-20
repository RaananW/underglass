# @underglass/vue

## 0.6.0

### Minor Changes

- 13204d9: The React and Vue adapters now behave alike where the two had drifted apart. React's `useSurfaceRef` no longer releases and re-enrolls its layer (with a recapture) when `decorative` changes between `undefined` and `false`, which name the same enrollment, as Vue already treated them. React's `useSurfaceRef` and `Presence` no longer write refs while rendering: a new element enrolls with the `origin` of the commit that attached it, and `onComplete` is the handler of the last commit, never of a render React discarded (a transition that suspended, for example). Vue's `Surface`, `Box` and `NativeScroll` take no `style`, as React's prop types already said: a typed template or `h()` call rejects it, a `style` passed anyway is not applied, and Vue warns about it once per component in development. Before, `Surface` dropped it without a word while `Box` and `NativeScroll` applied it; use `class`, or `layout` and `appearance`, instead. Vue's `useSurfaceRef` callback bound to a component now enrolls the component's root element (`$el`); before, it enrolled nothing and reported nothing. A ref that names no single element, or an element of another document or realm, is refused with the usual `EnrollmentError` (`foreign-element`) instead of being ignored. `@underglass/vue` now also exports `mountApplicationModule` and the `LayerDefinition` and `LocalApplicationModule` types, which `@underglass/react` already re-exported from core. `@underglass/react/build` and `@underglass/react/experimental-worker/thread` name their re-exports from core instead of re-exporting everything, so they export exactly what they did, and a later addition to core no longer joins them by itself.

### Patch Changes

- a9f9d47: A Vue application whose first render throws now makes `mountCanvasApp` throw that error, as the React adapter does. The app is unmounted and the hosts are left as they were, so they can take another mount. Before, Vue's production build only logged the error and the mount returned a working controller over an incomplete app, and Vue's development build threw but left the failed app's `Surface` registration in Vue's queue, where it threw again at the next update and stopped later mounts on the page from registering their layers. The error goes to the caller of `mountCanvasApp`, not to an `errorHandler` set in `configure`; that handler gets the errors after the mount, as before. An `onErrorCaptured` hook that returns `false` for the error still contains it, and the mount succeeds.
- @underglass/core@0.6.0

## 0.5.0

### Minor Changes

- edc754a: `frameWorkMs` now times the whole draw, the policy check included, where it started after that check and reported less than half of a frame's cost on an animated page. Reported values grow for the same work: if you chart `frameWorkMs` (from `onMeasure` or `state().metrics`), expect a step up at this version, not a regression. A new kind, `frameTickMs`, reports the work of the runtime's own frame callbacks apart from the frames they draw: the clock that advances owned animations and playing effects, the frame callback the running transitions share, and each `animate()` or `advance()` step. It reaches `onMeasure` and `state().metrics.timings` like the other kinds, and never overlaps `frameWorkMs`. The API reference now says what each kind covers and leaves out; neither covers the browser's style, layout and paint, or GPU execution.
- 967461b: The presentation policy check runs once per frame where it ran several times with the same inputs. A frame of owned playback or playing effects ran it twice and now runs it once, and each owned animation's source check (its computed style, keyframes and timing) runs once a frame, not three times. Running transitions share one frame callback: a group of N layers runs one check for all of them plus the draw's, not N + 1. The same things are checked, in the same frame, with the same recovery; when a transition's own motion breaks the contract it is still the one cancelled with the reason. On a test page with eight owned animations, with the CPU slowed four times, the main thread's JavaScript per frame fell by about a quarter.
  
  Two new counters, `state().metrics.policyPasses` and `state().metrics.ownershipChecks`, make the checks countable. `state().runtimeResources.controllerFrames` now counts the shared transition callback once, however many transitions run, where it counted one per transition.
- 64a8357: A layer that is detached from the document or has no size no longer turns GPU mode off the moment it is seen. A React commit passes through such states for a task: it removes an element before a passive effect's cleanup releases its enrollment, hides a layer that a later effect shows again, or swaps a `key` that removes one element and enrolls another under the same id. On the GPU these are now decided at the next frame boundary, before that frame is presented: until then no GPU frame is drawn and no hit geometry changes, so the screen keeps the frame it already shows. A layer that was released by then simply leaves, and one that is back is drawn with its current pixels. A layer that is still detached or zero-sized falls back to ordinary DOM in that first frame, with the same reason as before (`Detached enrolled layer`, `Zero-sized layer`). Admission, and every other structural check, still decide at once; content that overflows a layer and `z-index` on a layer still leave GPU mode immediately. Two new counters, `state().metrics.deferredStructure` and `state().metrics.heldDraws`, count the layers held for a frame boundary and the draws withheld meanwhile. A fallback with a layer whose element was already removed no longer fails while it restores ordinary DOM.

### Patch Changes

- Updated dependencies [edc754a]
- Updated dependencies [967461b]
- Updated dependencies [64a8357]
  - @underglass/core@0.5.0

## 0.4.1

### Patch Changes

- @underglass/core@0.4.1

## 0.4.0

### Minor Changes

- cfac7eb: Custom displacement effects: `defineEffect` takes `geometry: "displacement"`, a WGSL function that returns the position in the layer each pixel is drawn from. It is a sampling operation of an effect chain (`kind: "custom"`), so it can move, stretch, split or take away a layer's pixels during a transition, and one chain may hold a displacement and a colour function. A position outside the layer draws nothing, and nothing is drawn outside the layer's box. Materials refuse it.
- 0c21def: Writes are drawn once per frame. `setTransform`, `setOrigin` and a `Surface`'s committed layout or transform used to draw at once; they now change state in the call (hits and `getBoundingClientRect()` follow in the same task) and are drawn with the frame, like effect and material updates. Every write made in one task appears in the same frame, in the state the task left, so a pose written and replaced in one task is never shown, also when a layer is enrolled between the two. A frame loop is drawn in the frame it wrote in, whichever way it asks for its frames.
  
  Changed timing: code that wrote a transform and read the canvas's pixels in the same task now reads the previous frame. Wait for a frame, or `await controller.settle()`.

### Patch Changes

- 4054e2f: The npm pages of all five packages link https://underglass.dev as their homepage.
- Updated dependencies [cfac7eb]
- Updated dependencies [0c21def]
- Updated dependencies [4054e2f]
  - @underglass/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [29e1c82]
  - @underglass/core@0.3.0

## 0.2.5

### Patch Changes

- Updated dependencies [e487884]
  - @underglass/core@0.2.5

## 0.2.4

### Patch Changes

- @underglass/core@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [d920425]
- Updated dependencies [55f7c0b]
  - @underglass/core@0.2.3

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

- Vue 3.5 adapter over `@underglass/core`: `mountCanvasApp`, `Surface`, `Box`, `NativeScroll`,
  `NativeOverlay`, `Presence` (emits `complete`), `useSurfaceRef`, `useGPUHost` and
  `useNativeOverlayHost`, with Vue state and the original controls kept across GPU admission,
  recovery and disposal.
- Re-exports the framework-neutral helpers and types of `@underglass/core`.
