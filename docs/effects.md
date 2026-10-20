# Bounded effects (Phase8 implementation)

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive/archive-catalog.md).

This gate uses the existing public Lite1.33.0 fullscreen compositor, not a
second renderer. No dependency changes are needed. Parameter-only updates use
one uniform buffer and one shared composition pass; there are no additional
textures or intermediate render targets. The limit is three unique operations
per enrolled layer, within the existing eight-layer budget.

Phase9 [actual155 accepted-with-limits hardening](../evidence/phase9-independent/acceptance-v1.json)
preserves this API and budget; exact154 remains unverified. Active
effects do not authorize unsafe structural output: changes to membership,
order/origin/size/DPR hide GPU presentation and require fresh admission.
Native capture stays neutral and root-attributed paint remains conservative.
See [adoption](archive/adoption.md) for lifecycle/manual constraints.

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

- `ripple`: `amplitude`0..12 CSS pixels.
- `chromatic`: `displacement`0..12 CSS pixels; red/blue sample displacement.
- `dissolve`: `amount`0..1, `speed`0..4; deterministic time-dependent alpha mask.
- `custom`: a `defineEffect` definition and exactly its declared parameter keys.

Sampling operations must precede color/alpha operations. Ripple/chromatic may
appear in either order; order is significant. Custom/dissolve may appear in
either order. No kind may repeat. Sampling clamps to the original layer and
fades displacement at its boundary; no effect expands output bounds. Zero
amplitude/displacement/amount is identity. Dissolve amount1 is transparent.
The shared compositor still presents its existing opaque white backdrop.

The handle exposes `seek`, `play`, `pause`, `update`, `cancel`, `dispose`, `state` and
`finished`. `update(parameters)` takes one parameter object per operation, in
chain order and with exactly the declared keys, and applies them without
recompiling, so a transition can animate `amount` or `amplitude` every frame. There is no implicit completion duration: playing is an explicitly
looping seconds clock (wrapped at1000 seconds, as in the compatible ripple).
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
to0..1. WGSL is trusted local application code, **not** made safe by TypeScript
or text validation. Do not load untrusted source. The supported body is a
bounded pure color calculation, without external bindings or entry points.
Compilation uses bounded public configured-device shader diagnostics; actual shared
pipeline validation occurs while output is hidden. Failure is diagnosed and
recovers to DOM through the existing healthy-fence/loss lifecycle.

See `examples/playground/src/apps/effects/color-cycle.ts` for an effect authored outside runtime
modules through the public API. `/effects.html` is a native poster composer:
form edits change original captured content, motion and effects compose on
separate inert artwork, and native input/library overlays remain undistorted.
The original artwork callback sets `element.inert = true` before ref enrollment
because the pinned React18 types do not expose JSX `inert`; no types upgrade,
duplicate element or CSS normalization is used.

```tsx
import { defineEffect } from "../underglass";

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

Schema names are1..48 lowercase/digit/hyphen characters beginning lowercase, parameter keys1..32
alphanumeric characters beginning lowercase. There are1..4 parameters with
finite ordered ranges bounded to absolute1e6, and at most4096 WGSL characters.
Descriptor seconds are0..1e6; unsupported capability/policies or unknown/excess
parameter keys throw before ownership mutation. Definition validation is not
shader compilation. A compiler or application-pipeline failure during
`enable()` returns diagnosed DOM state and retires the handle as `fallback`.
Final controller disposal retires an active handle as `disposed`.
Admission revalidates enrolled capture dimensions and visibility after the
asynchronous pipeline check, refusing late changes before revealing output.

## Reproduce and inspect

Build before focused production tests and keep all browser writers serial:

```sh
npm run test:unit
npm run build
CANVAS_EVIDENCE_ROOT=evidence/phase9/effects-rerun npm run test:browser -- effects.test.mjs
CANVAS_EVIDENCE_ROOT=evidence/phase9/react18-rerun npm run test:react18
CANVAS_EVIDENCE_ROOT=evidence/phase9/react19-rerun npm run test:react19
```

Install only the already-pinned matching fixture dependencies if absent, using
the [contributor setup](../CONTRIBUTING.md). No new effect dependency is required.
The recorded implementation matching-major gate is78 shared React18 browser
cases and124 full React19 browser cases plus18 units, types and production
builds. Three routing-only units were added afterward for P8-A1; independent
final independent acceptance passed21 units/types/build/124 browsers and
retained source-identical React18 types/build/78 browsers. Actual mounted
React18.3.1/19.3.1 and Dialog resolution are in the
[React18 matrix (archived raw)](archive/archive-catalog.md) and
[React19 matrix (archived raw)](archive/archive-catalog.md).

| Proof | Current Phase8 evidence |
| --- | --- |
| Decoded identity/time/alpha/bounds, sampling and color order; essential native equality | [Production pixels (archived raw)](archive/archive-catalog.md), [development StrictMode pixels (archived raw)](archive/archive-catalog.md), matching named PNGs |
|300-frame effects and motion/effects, normal invalidation, content update| [Production independence (archived raw)](archive/archive-catalog.md), [development independence (archived raw)](archive/archive-catalog.md) |
| Atomic chain refusal/snapshots/stale cancellation | [Handles (archived raw)](archive/archive-catalog.md) |
| Media and usable fallback | [Media (archived raw)](archive/archive-catalog.md) |
| Genuine compiler rejection, hidden failure and reentry | [Compiler (archived raw)](archive/archive-catalog.md) |
| Synthetic capability/pipeline failure and late mutation, final active-handle disposal | [Failure paths (archived raw)](archive/archive-catalog.md) |
| Actual diagnostic loss, twenty StrictMode retirements and real HMR | [Retirement (archived raw)](archive/archive-catalog.md) |
| Healthy pending fence retains resources until genuine queue completion | [Healthy fence (archived raw)](archive/archive-catalog.md) |
| Byte preservation, matched hashes and CPU/resource costs | [Implementation report (archived raw)](archive/archive-catalog.md) |

React18 executes the same cases and retains independent outputs under
`evidence/phase8/react18/reports/effects/`. Existing Phase7 integration and
P7-1 transaction checks are rerun, not replaced. The report compares every
versioned baseline evidence file to commit
`3c508a848b9673fd1d691e76fa26b651dccf2ab9` (rewritten Phase7; original ID is
archived in the [catalog](archive/archive-catalog.md)); the private byte backup was made
before tests.955/955 preserved Git bytes do not restore the five lost
Phase6 originals or change the permanent disclosure.

Each effect cost window has300 synchronous CPU `frameWorkMs` samples from
the existing measurement sink. The report includes median/p95/max and
differences from neutral within each build/major, plus initial custom compile
CPU samples. These single bounded windows are noisy, not an optimization
comparison or GPU execution timing. The common generalized shader performs
three channel samples even in identity mode. Uniform storage increases from
64 to160bytes/layer (two-layer buffer144 to336bytes); the pass/texture/target
count does not increase. Driver memory and GPU timestamps remain unmeasured.

## Evidence routing

All browser/matrix writers default to regenerable `evidence/regression/current`.
`CANVAS_EVIDENCE_ROOT=evidence/phase9/<distinct-run>` selects current output.
Independent acceptance uses `CANVAS_EVIDENCE_ROOT=evidence/phase9-independent/<distinct-run>`;
the shared test/matrix/reporter/sanitizer routing and probe support that exact
root and its descendants. The probe defaults to the selected root's `chrome/`
directory; `EVIDENCE_DIR` overrides must use one of the same named roots.
Accepted evidence is read-only; other evidence roots are refused. Without a
selected root, the probe defaults to `evidence/regression/current/chrome`.
Performance comparison/smoke fixtures follow the same root's `performance/`
directory, regenerable `evidence/regression/current/performance` by default.
Historical Phase8 runs used `evidence/phase8/performance`; that root and its
independent reports are now read-only. The Phase8 report generator refuses
before writing. Source-copy React18 reports read the same
selected root. Sanitization visits only the selected output root, never all
archives. Back up/hash committed evidence before runs and audit afterward.

Phase8 is independently accepted with explicit limits; see the
[Phase8 acceptance summary](../evidence/phase8-acceptance-summary.json) and its
fresh `run-v3/` reports. Initial P8-A1/A2 findings and the original implementation
report remain historical and unchanged.
The implementation report and matrix counts above describe the original
implementation gates; the linked independent verdict records final acceptance.
CPU/frame samples describe added, non-equivalent effect work, not a DOM speedup.
GPU timestamps are unavailable (`null`); bounded ledgers are not driver-memory
or physical-device leak proof. OS IME, real screen readers, physical devices,
display/reset behavior, everyday profiles and real background throttling remain
unverified.
