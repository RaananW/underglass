# Effects contract

Effects run inside the shared compositor, not a second renderer: each layer's chain
is part of that layer's own pass on the one Babylon Lite engine. Parameter-only
updates write the layer's uniforms; there are no additional textures or intermediate
render targets. A chain has at most three unique operations per enrolled layer, and
the usual layer budget applies (32 by default, up to 64). Supported structural
changes (membership, order, origin, size, DPR) keep GPU presentation and active
effects, as the [GPU-first contract](architecture.md#gpu-first-contract) requires.
Native capture stays neutral: effects change only what the GPU draws, never the
original elements. The [effects guide](guide/effects.md) introduces the same API
with examples; this page is the full contract.

The chosen extension is deliberately a **trusted application color function**,
not a shader graph, sandbox, remote loader, geometry/sampling extension or
resource allocator. An application supplies up to four bounded numeric
parameters and a WGSL function body. It receives only sampled color, local
coordinates, extent, seconds and a parameter vector. There are no engine objects
in the public contract. A custom definition is compiled into its layer's own pass:
during admission, or, when `setEffects` introduces a new definition while GPU
presents, as a successor pass that is validated before it replaces the current one
(the previous frame stays on screen meanwhile). A compile failure is a diagnosed GPU
failure with usable original DOM. Parameter/time/chain updates to a definition the
pass already holds do not rebuild anything.

## Contract

`setEffects(id, descriptors)` validates the complete chain before replacing
ownership. Every descriptor explicitly declares `bounds: "layer"`,
`interaction`, `media: "identity"`, `fallback: "static"` and
`time: { seconds, playing? }`. Every operation in a chain declares the same
`interaction`:

- `"decorative"`: only explicitly decorative, inert, aria-hidden enrollments
  without interactive descendants. Pointer-transparent GPU output is **not**
  justification for distorting or hiding native controls.
- `"inert"` (transition effects): any non-decorative enrolled layer whose
  boundary element is not itself interactive, for the length of a transition
  (entering, leaving, landing). While the handle is active the runtime makes the
  boundary's element children inert, including children added meanwhile; the
  boundary itself keeps its hit area. A click on displaced or dissolved pixels
  therefore lands on that non-interactive boundary: it can neither activate the
  layer's controls nor fall through to a control under the layer, so native hits
  never disagree with what is drawn. Focus inside the layer is lost when the
  effect starts. Ending the handle in any way (cancel, dispose, replacement,
  fallback, unenrollment) restores exactly the inert flags it set. If application
  code makes locked content interactive again, the handle ends as `cancelled`
  ("Layer content became interactive during a transition effect") and GPU stays on.

- `ripple`: `amplitude` 0..12 CSS pixels.
- `chromatic`: `displacement` 0..12 CSS pixels; red/blue sample displacement.
- `dissolve`: `amount` 0..1, `speed` 0..4; deterministic time-dependent alpha mask.
- `custom`: a `defineEffect` definition and exactly its declared parameter keys.

Sampling operations must precede color/alpha operations. Ripple/chromatic may
appear in either order; order is significant. Custom/dissolve may appear in
either order. No kind may repeat. Sampling clamps to the original layer and
fades displacement at its boundary; no effect expands output bounds. Zero
amplitude/displacement/amount is identity. Dissolve amount 1 is transparent:
the output canvas is cleared to transparent, so the page behind it shows through,
as it would in ordinary DOM.

The handle exposes `seek`, `play`, `pause`, `update`, `cancel`, `dispose`, `state` and
`finished`. `update(parameters)` takes one parameter object per operation, in
chain order and with exactly the declared keys, and applies them without
recompiling, so a transition can animate `amount` or `amplitude` every frame. There is no implicit completion duration: playing is an explicitly
looping seconds clock (wrapped at 1000 seconds, as in the compatible ripple).
Replacement resolves the previous handle as `replaced`;
cancel/dispose are idempotent, and stale handles cannot affect successors.
Other state-changing calls on retired handles throw. Invalid chains, parameter
keys, unsupported policies and unknown custom definitions leave ownership
unchanged. `setRipple` remains the compatible one-operation adapter and clears
the current chain when called with null.

Reduced motion presents identity and pauses playback; explicit `play` while
reduced motion is active throws. Fresh admission still compiles declared custom
definitions under reduced motion, so returning to normal motion can apply
them without a rebuild. Hidden documents pause clocks/drawing; visible
resumption does not catch up elapsed hidden time. Forced colors refreshes native
GPU content and supported structure changes retain motion and ownership. Loss,
factual unsupported effect/native boundaries and explicit disable retain usable original DOM with static
decoration and resolve active handles as `fallback`. Static fallback is not
claimed to reproduce a shader with CSS. Unmount disposes enrollment handles.
Normal native content invalidation stays enabled.

## Materials

`setMaterial(id, descriptor)` installs a persistent, colour-only material on any
enrolled layer, interactive or decorative, and returns a handle (`finished`,
`state`, `update`, `cancel`, `dispose`). The descriptor declares
`bounds: "layer"`, `interaction: "material"`, `media: "identity"`,
`fallback: "static"`, `kind: "custom"` with a `defineEffect` definition and
exactly its parameters, and `interior: { max }` within 0..0.1.

- The layer pass applies the material before the effect chain. It evaluates the
  definition on a neutral input `(0.5, 0.5, 0.5, 1)`, takes twice the result's
  luma (Rec. 709 weights, encoded sRGB) as a factor, clamps it to
  `1 ± min(max, 0.1)` and scales the captured colour by it. The captured colour
  never reaches the material, so text and face move together.
- `kind: "relief"` is core's built-in implementation of the
  [Strata Rendering Model](ui-library/rendering-model.md), version 1. Its descriptor carries a `scene` in the
  model's scene format (`@underglass/ui/scene.schema.json`) instead of a definition: light, bevel, shadow, interior
  budget, state multipliers, focus edge, up to 16 materials as numeric layers, and up to 256 relief primitives in
  layer-local CSS px. The pass gets a second uniform binding (binding 3, about 25 KB) holding the scene, with each
  primitive's derived values computed on the CPU. `handle.update(scene)` replaces the scene (states, rectangles,
  primitives added or removed) without recompiling. Its decoded GPU pixels pass the model's conformance suite
  (`tests/browser/relief.test.mjs`). Face interiors are guarded as section 2.9 of the model defines. The scene's
  `outset` (at most 128 px per side) grows the drawn rectangle for shadows only, on every side the layer's clip does
  not cut; native hits keep the layer's border box, so the outset never takes a hit.
- `kind: "objects"` is the same material at the Objects level: a scene in version 2 of the model, with a `camera`
  (distance and vanishing point) and objects mixed into its back-to-front list (part 2B). Solids (keys, slabs,
  bezels, wells, rails, marks) are shaded in screen space: their caps keep the captured pixels where they are and
  their sides fall in the band between cap and base, so they never draw outside their control. Domes (knobs, pucks)
  are ray-cast in their own colour. An object that would draw outside its control (the taper rule, or a dome leaving
  its `bounds`) is drawn as its Relief equivalent, and `state().materials[].degraded` lists it with the reason. Its
  decoded GPU pixels pass `objects-2.json` (`tests/browser/objects.test.mjs`). Objects share the relief binding, so
  a layer is at either level and nothing else changes: no extra pass, texture or depth buffer. A version 3 scene may
  set `environment` to a 32 × 16 brightness map, which the objects reflect instead of the studio.
- `kind: "stage"` draws a stage scene (version 3 of the model, part 2C) on a **decorative** layer: a lit backdrop (a
  pool of the light and a vignette) and up to 256 particles, lit cards and discs in perspective. The layer's own
  content is empty and takes no hits. Particles move by `handle.update(scene)` each frame, with no recompile; their
  physics is the application's. `state().materials` reports `{ kind: "stage", particles, backdrop }`. Its decoded GPU
  pixels pass `scene-3.json` (`tests/browser/stage.test.mjs`).
- `kind: "instrument"` is the Instrument level (version 4 of the model, part 2D): the face is the relief pass, and each
  object's parametric parts are drawn as Babylon Lite meshes in a scene of the layer's own, right after its pass, with
  captured caps, analytic face shadows, the layer's clip and opacity. Parts never take hits; an object that would draw
  outside its `bounds` over its travel is drawn at the Relief level and reported. See [the API](api.md#the-instrument-material)
  and the [design note](ui-library/instrument-phase2.md); `tests/browser/core-instrument.test.mjs` checks it.
- One pass may hold a custom effect and a custom material; a new definition is
  compiled as a successor while the previous frame keeps presenting.
- Replacement resolves the previous handle as `replaced`. The material survives
  DOM presentation and readmission; unenrollment and runtime disposal resolve it as
  `disposed`. `runtimeResources.materials` counts active materials and
  `state().materials` lists them.

## Trusted custom authoring

`defineEffect` freezes the schema and requires `geometry: "color"`,
`bounds: "layer"`, `capabilities: ["webgpu"]`. Its WGSL body returns `vec4f`;
parameter vector ordering is declaration insertion order. Results are clamped
to 0..1. WGSL is trusted local application code, **not** made safe by TypeScript
or text validation. Do not load untrusted source. The supported body is a
bounded pure color calculation, without external bindings or entry points.
Compilation uses bounded public configured-device shader diagnostics; actual shared
pipeline validation occurs while output is hidden. Failure is diagnosed and
recovers to DOM through the existing healthy-fence/loss lifecycle.

See `examples/playground/src/apps/effects/color-cycle.ts` for an effect authored outside runtime
modules through the public API. `/effects.html` is a native poster composer:
form edits change original captured content, motion and effects compose on
separate inert artwork, and native input/library overlays remain undistorted.
The artwork's ref callback sets `element.inert = true` before enrollment, which
works with the React 18 types (they do not expose a JSX `inert` attribute).

```tsx
import { defineEffect } from "@underglass/react";

export const tint = defineEffect({
  name: "warm-tint",
  parameters: { strength: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: "return vec4f(mix(color.rgb, vec3f(1.0, 0.4, 0.2), parameters.x), color.a);",
});

// After mounting an authored inert/aria-hidden decorative boundary in DOM:
const effect = controller.setEffects("art", [{
  kind: "custom", definition: tint, parameters: { strength: 0.5 },
  bounds: "layer", interaction: "decorative", media: "identity",
  fallback: "static", time: { seconds: 0, playing: false },
}]);
await controller.enable(); // Explicit fresh hidden compilation/admission.
effect.seek(0.5); // Parameters/time of this admitted definition need no rebuild.
effect.cancel(); // Identity original decoration; does not cancel affine motion.
```

Schema names are 1..48 lowercase/digit/hyphen characters beginning lowercase, parameter keys 1..32
alphanumeric characters beginning lowercase. There are 1..4 parameters with
finite ordered ranges bounded to absolute 1e6, and at most 4096 WGSL characters.
Descriptor seconds are 0..1e6; unsupported capability/policies or unknown/excess
parameter keys throw before ownership mutation. Definition validation is not
shader compilation. A compiler or application-pipeline failure during
`enable()` returns diagnosed DOM state and retires the handle as `fallback`.
Final controller disposal retires an active handle as `disposed`.
Admission revalidates enrolled capture dimensions and visibility after the
asynchronous pipeline check, refusing late changes before revealing output.

## Testing

`tests/browser/effects.test.mjs` checks this contract in Chrome Canary: atomic chain
refusal and stale handles, reduced motion, visibility and forced colours, compiler and
pipeline failures with usable DOM, retirement through device loss, StrictMode and HMR,
successor compilation while GPU presents, and transition effects on interactive layers.
[CONTRIBUTING](../CONTRIBUTING.md) describes how to run it and the React 18 and 19
matrices. GPU timestamps and driver memory are not measured, and screen readers, OS
input methods, physical devices and real background throttling are not yet validated
([open issues](open-issues.md)).
