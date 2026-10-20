# Instrument Phase I2, core work item 1: the `instrument` material

**Status:** design note for [core work item 1](instrument.md#core-work-additive) of the Instrument plan, written
before the code (2026-10-17), then implemented in the same PR ([results](#results-canary-15808110-windows-11-rtx-3080)). It
follows [`phase4-objects.md`](phase4-objects.md) in form. Each decision has a recommendation and an alternative; the
[decisions table](#decisions) collects them.

**Upstream check (2026-10-17):**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit
  (`gh api`, 2026-10-17). Open: [#186](https://github.com/WICG/html-in-canvas/issues/186) (rotated `canvasClip` hit
  testing) and [#185](https://github.com/WICG/html-in-canvas/issues/185). Neither touches this work: meshes never take
  hits, and capture, hit geometry and admission are unchanged.
- **Chromium hotlist 6783002** (including the ElementCanvasTransform issues): not accessible without sign-in; not
  rechecked.
- **Browser this note is tested on:** Chrome Canary 158.0.8110.0, Windows 11, RTX 3080 (the same build as
  [Phase I0](instrument-phase0.md)).

## What I0 proved and what core adds

The [Phase I0 probes](instrument-phase0.md) drew Lite mesh scenes through an internal hook
(`InstrumentProbeHook`): the playground built and posed the scenes, and core only put each one after its layer's
pass. They proved that the mesh pass keeps painter's order, stays inside its controls, keeps native hits and costs
about 2.2 ms GPU p95 at 250 controls ([I0.1](instrument-phase0.md#i01-mesh-pass)), and that containment must be
checked over the whole travel ([I0.2](instrument-phase0.md#i02-moving-parts-and-hits)).

Core now owns all of it, behind one new material kind:

- the scene format (Rendering Model part 2D, version 4, `kind: "instrument"`), validated with precise errors;
- part meshes built from profiles, thin-instanced per kind, with Lite's GPU culling;
- poses as rigid transforms, clamped at the stops;
- captured screen-locked caps, analytic face shadows of the parts, the studio and PBR materials;
- the layer's clip and opacity on the meshes, updated in the same frame as layout;
- containment over the whole travel, with a diagnostic and a step-down;
- budgets, GPU timings, a compile policy and the lifecycle.

The prototype hook stays as it is: the merged probe pages and their tests use it. It goes when those pages are ported
to the material, in a later PR.

## API

```ts
const handle = controller.setMaterial("panel", {
  kind: "instrument", scene,                     // a version 4 strata-scene with kind "instrument"
  bounds: "layer", interaction: "material", media: "identity", fallback: "static",
});
handle.update(nextScene);                        // poses (`t`), states and layout: no recompile, no capture
```

The public API grows by one material kind (`InstrumentMaterial`, its scene types) and its diagnostics
(`state().instrument`, `state().materials[].degraded`, and the `instrumentGpuMs` measurement sample). Nothing else
changes: capture, native hit geometry, admission and the layer pass are untouched. In ordinary DOM the material
persists and the original shows, as for every material.

## The scene format core accepts

Rendering Model part 2D (version 4), draft. Core validates what it relies on and returns a deep normalized copy;
every error names the path (`objects[3].parts[1].pose.to.turn requires a number in -720..720`).

| Field | Core |
| --- | --- |
| `format`, `version: 4`, `kind: "instrument"` | Required |
| `extent`, `outset`, `backdrop`, `bevel`, `shadow.strength`, `interior`, `state`, `focus` | As version 1; the face is shaded by core's relief pass |
| `primitives` | The face's relief primitives (part 2). Version 2 objects are refused: a layer has one renderer |
| `light` | `azimuth`, `elevation`, plus `intensity` (default 1.6) and `ambient` (0.55) |
| `camera` | Required: `distance` (`D`) and `vanish` (see [deviations](#deviations-from-the-draft)) |
| `environment` | Required: `{ source: "studio", strength, studio? }`; `page` accepted, not applied (item 4) |
| `materials` | Recipes: `base` (`colour`, `roughness`, `metallic`, `direct`), `coat`, `reflectance`, `emissive` (`strength`, `colour`), `sheen`, `iridescence`, `brush`, `grain`; `glass`, `dispersion`, `subsurface` accepted, not drawn |
| `profiles` | `lathe`, `prism`, `extrude`; `mesh` is refused until custom parts (item 5) |
| `objects` | At most 256, each `{ id, rect, bounds, t, parts, relief }`; parts `{ kind, profile, at, pose, material, captured, finish, caster, state }` |
| `emitters`, `protected` (`feather`) | Accepted and validated (64 each), **not lit**: emitters and the guard's face factor are item 2 |
| `shadow.map`, `post` | Accepted and validated, not applied: item 3 |
| part `glass`, `emitter` | Accepted; glass parts are not drawn until item 4, so a window never covers its text with an opaque mesh; an emitter's lens is drawn with its emissive material |

Primitives plus objects are at most 256, so every object's Relief primitive fits the face's list when it steps down.
Parts are capped at 8,192 per scene by validation; the **budget** (2,048) is enforced by the renderer as a step-down
with a diagnostic, not as a validation error, so the adjust policy can read it.

## Where and in which order the meshes draw

Each instrument layer has its own Lite scene on the shared engine: one stage camera at the canvas centre, at `D`, whose
field of view maps the face plane one CSS px to one CSS px; the key light; a diffuse fill; the studio; and two render
tasks:

1. **`face`:** the analytic shadows of the parts, drawn straight into the layer's pass target (colour loaded, no
   depth), multiplying the face by `1 − Sₚ`.
2. **`parts`:** the parts and the captured caps, into the same target with colour loaded (`clr: false`) and the
   scene's own depth buffer, cleared every frame. An empty-colour clip mask runs first when the layer is clipped.

**Draw order.** The scene must draw right after its layer's pass and before the next layer's. Lite 1.33 has no public
call that inserts a rendering context at a position: `registerScene` appends, and it is `async` (it builds the scene
and prepares pipelines), while core presents a new order synchronously inside the native paint event. Core therefore
keeps the prototype's reorder of `getRenderingContexts(surface)` as a **documented reliance with a guard**:

- core permutes only contexts it registered (its background, layer passes and instrument scenes) and leaves any
  other context after them, in their order;
- after the permutation it reads the list back; if it is not the intended order (the array became a snapshot, or
  frozen), every instrument layer steps down to its Relief primitives with the diagnostic `order-unavailable`. GPU
  stays on, and the face, hits and capture are unaffected;
- the reliance is recorded as a Lite request (an ordered insert, or a frame graph core can own).

The alternative, unregistering and re-registering everything in order, cannot be synchronous: a membership change
would draw a frame without its meshes, or wait for a scene rebuild before every reorder.

**The target.** The parts draw straight into the layer's pass target (I0.1's construction). Both tasks name their
target in one place, so item 3 can point `parts` at a per-layer offscreen target and add the clipped composite and the
captured caps after it ([I0.8](instrument-phase0.md#i08-post-chain-and-reflections)), without touching the face task.

## Geometry, poses and instances

- **Profiles** become triangles in part-local px (x right, y down, z up from the face), re-implemented in core from the
  probes' builders: `lathe` revolves `[r, z, nr, nz]` points with their normals (a repeated point with two normals is
  a crease); `prism` is a rounded rectangle raised to `height`, its top inset by `taper` and edged by a `chamfer`;
  `extrude` sweeps an `[x, z]` outline across `width`. The triangles are the part: containment is checked on them.
- **Kinds.** Parts that share profile, material and `captured` are one kind: one mesh, thin-instanced, with
  `enableThinInstanceGpuCulling`. Capacity is the next power of two above twice the count (at least 256, at most 2,048),
  so a density change within it only changes the instance count (`setThinInstanceCount`); the face-shadow quads hold all
  256 objects the format allows, so more objects of existing kinds never rebuild. A new kind, profile, material, light
  or environment rebuilds the scene: the key light, the fill, the studio image and its rotation and each material's
  environment intensity are built into it, so they are part of the structure key.
- **Poses.** `mix(from, to, t)` field by field, `t` clamped to 0..1, and the placement
  `T(at) · T(slide, travel) · T(pivot) · R(axis, tilt) · R(z, turn) · T(−pivot)`: rotation and translation only.
- **Layout and moves.** Instance matrices are written in canvas space: the layer's matrix times the placement. They
  are rewritten in the frame the layer's matrix, a scene field or `t` changes, inside core's own `draw()`, after
  native geometry and before `renderFrame`, so meshes never lag their face. A layer whose matrix is not a similarity
  (shear, non-uniform scale, a tilt) steps down to Relief with `transform`.

## Caps, shadows, clip and opacity

- **Captured caps** (`captured: true`) sample the layer's capture at their own pixel with core's layer-pass sampling
  (inverse layer matrix, the same premultiplied bilinear filter), so on the pixel grid they are the capture texel for
  texel, then apply the solid cap's interior factor (2B.4) within `interior.max`. No placement screen-locks them
  (2D.3). They draw in the `parts` task, after the opaque parts.
- **Face shadows** are I0.5's path (a): one quad per object over its bounds and its shadows' reach, which loads up to
  8 casters of the object from a storage buffer and takes the darkest (the Relief formula 2.8). A caster is the
  part's `caster`, or, when omitted, the rounded box of the posed part's footprint at its mean height (`null`: none).
  Shadows are rewritten with the pose. Without protected rects applied (item 2) they are not guarded.
- **Clip.** The `face` quads and the caps discard outside the layer's clip in their fragment shaders. Lite's PBR
  cannot, so a clip mask quad writes the nearest depth outside the clip before the parts (depth `always`, no colour),
  and every part there fails the depth test.
- **Opacity.** 1 draws the parts; 0 draws none; in between, the parts take the opacity as Lite's material alpha, so
  each part blends over the faded face. That is the closest a direct pass can get: exact group opacity needs the
  offscreen target and composite of item 3, which multiply the whole mesh layer at once. Each PBR kind has a blended
  twin (the same instances, an `alphaBlend` material) built with the scene and shown only at fractional opacity:
  Lite rebuilds a swapped material's renderable asynchronously and did not draw it in an explicit task.

## Containment and the step-down

2D.9: every vertex of every part, at every `t` of the travel, must project at least 0.5 px inside `bounds`.

- **The travel** is sampled at `n` steps, `n ≥ 32` and large enough that a turning or tilting vertex's chord strays
  less than 0.45 px from its arc.
- **The layer's box.** An object whose `bounds` leave the layer's own box steps down at once (`containment`, "its bounds
  leave the layer's box"): with the clip covering the layer, no mask would stop its parts covering other content.
  The box is the one the scene was built for: when the layer's box changes under a scene already judged (core's observer runs
  before the producer's, issue #156), the scene is not judged against a box it was not built for; its verdict stands, with a
  `layout:` warning, until the next scene, which is checked against the new box ([api](../api.md#the-instrument-material)).
- **Fast path.** Per object core keeps the frontier of (orthographic inset, height) over all vertices and steps, kept
  separately above and below the face (a point at `+h` drifts more than one at `−h`, so they never dominate each other).
  Since a point at height `h` drifts at most `r · |h| / (D − h)` from its orthographic position, with `r` the distance
  from the vanishing point to the object's farthest bounds corner, `min(inset − r · |h| / (D − h)) ≥ 0.5` proves
  containment in constant time per object per frame, wherever the layer is.
- **Exact path.** If the bound fails, core projects every vertex at every step at the object's current stage position.
  It runs only for objects near the limit, and is cached per placement: on a layer that moves every frame, an object
  near the limit pays the exact projection every frame (a known cost, not a correctness issue).
- **Step-down.** A failing object is drawn as its `relief` primitive (default: a raised rectangle over its bounds) in
  the face's list, and `state().instrument` names the object, the part, the smallest projected inset and the
  overshoot past `bounds` in px. GPU stays on.

## The material cap (issue #173)

A layer draws with at most 16 materials (`INSTRUMENT_MATERIALS`: one PBR material per name its kinds use, and the Relief face's own binding holds 16). The scene format
is wider: `INSTRUMENT_MATERIALS_CEILING` (64) is what validation refuses. Between the two the layer is **stepped down as a whole**, the way a parts
budget is (decision 9): status `stepped-down`, every object `budget` with `detail` `N materials in the layer, above 16`, a `materials:` warning, GPU on, and
`state().instrument.layers[].materials` (`{ count, cap }`) says by how much. The alternative, to draw the first 16 materials in scene order and give the parts of
the rest a fallback material, was rejected: a part in the wrong material is worse than a layer at Relief, the cap's usual cause is a panel mixing component
kinds (each brings its own materials), and a silent partial scene would make the same bug as the refusal did. The ceiling of 64 is a format limit (the bound of `INSTRUMENT_PROFILES` and `INSTRUMENT_PROTECTED`), not a budget. Because the face's Relief
binding also holds 16 materials, a scene past the cap gives the face only the materials its primitives use (a scene under it is unchanged); if those
are more than 16 (every object's own `relief.material`), the face draws the first 16 in scene order and the others' entries in the first, and the layer's
`detail` adds `N face materials, above 16`. A Relief face in a wrong material is acceptable there because the layer is already reported as stepped down,
unlike an Instrument part. The helper's side: every key-like object registers its body with the registry of `gpu/instrument-keys.ts`
(`registerKeyBody`, `keyAtRelief`, the constants `INSTRUMENT_KEY_BODY_MATERIALS` and `INSTRUMENT_PUSH_MATERIALS`) so the conversion that keeps a scene within 16
can trim it; a loop that does not register stays outside the conversion. Before this, core refused the
scene at `setMaterial` and the Strata helper swallowed the error, so the controls vanished with no diagnostic.

## The fallback ladder

`instrument → relief primitives`, per object or per layer, never DOM:

| Cause | Scope | Diagnostic |
| --- | --- | --- |
| A part breaks `bounds` | That object | `containment`, with part, inset and overshoot |
| More than 2,048 parts, or more than 64 kinds, in the layer | The layer | `budget` |
| The stage passes 6,000 parts | The layers in paint order that push it over | `budget` |
| The scene or a pipeline fails to build, or its build passes the 10 s instrument deadline | The layer | `compile`, with the error |
| The order guard fails | Every instrument layer | `order-unavailable` |
| The layer's matrix is not a similarity | The layer | `transform` |
| The scene is still building | The layer, until it is ready | `pending` |

A GPU error (a validation error scope, device loss) is still a GPU error: it goes to DOM through core's existing
diagnosed recovery. More than 16 kinds is reported (`kinds` warning) but drawn.

## The compile-deadline policy

I1's second iteration found that core's successor deadline (1.5 s for a successor composition's shader compilation)
fired in 1 start of 8 while a page's mesh pipelines compiled, because the GPU process compiles one pipeline at a time.
Core now owns both, so it **sequences** them:

- an instrument scene build starts only after any pending successor preparation has settled, waiting at most 10 s, so
  successors arriving one after another cannot starve it;
- the **gate** is held only by the build that is running: from its start (after that wait) through registration and
  pipeline preparation to the GPU queue catching up (`onSubmittedWorkDone`, at most 10 s). A queued build holds nothing,
  and the gate needs no drawn frame, so a pending successor (which stops core's frames) can never hold it open;
- a successor that starts while the gate is held starts its 1.5 s deadline when the gate opens or after **3 s**
  (`INSTRUMENT_SUCCESSOR_DEFERRAL_MS`), whichever comes first, so the deadline counts core's own work again. Each deferral
  is counted (`state().instrument.compile.deferredDeadlines`, with the time waited);
- an instrument build has its own deadline of 10 s (`INSTRUMENT_BUILD_DEADLINE_MS`); past it, the layer steps down with
  `compile` and GPU stays on. The wait for successor preparations before a build is capped at the same 10 s;
- until a build is ready, the layer draws its objects at the Relief level (`pending`), so no frame shows a half-built
  scene. `enableAsyncShaderPipelineCompilation` lets registration prepare the shader-material pipelines.

**The two ceilings.** Core skips frames while a successor is pending, so the successor ceiling is how long a hung build can
freeze every layer: 3 s, against measured starts of 0.88–1.33 s with three instrument layers and successor deferrals of
323–717 ms (two to three times the need). A successor whose compile is still blocked after it falls back, diagnosed,
after 3 s + 1.5 s, as the contract allows for a GPU stall. The build keeps its own 10 s, so a slow build steps its layer
down without holding anyone else for that long. When the ceiling, not the gate, releases a successor, core logs a
warning. A build that takes the gate while another successor's 1.5 s is already running does not defer that one, so
under continuous successor churn a build and a running successor deadline can overlap: the build waits at most 10 s for
preparations to settle and then runs anyway. The alternative, a longer deadline for every successor while instrument
layers exist, would let a real GPU stall hold the last frame longer and would still race the first frame.
- **After registration,** the GPU queue must catch up within 10 s; if it does not (a GPU-side hang after the scene
  registered), the scene is retired and the layer is drawn at Relief with `compile` (`compile.warmupTimeouts`).

## Budgets

| Budget | Value | At the limit |
| --- | --- | --- |
| Parts per layer | 2,048 | Above it the layer steps down, `budget` |
| Parts per stage | 6,000 | Layers that push it over step down, in paint order |
| Part kinds per layer | about 16 | Reported above 16 (`kinds`); step-down above 64 |
| Materials per layer | 16 | Above it the layer steps down, `budget`; the format refuses more than 64 |
| Objects per layer | 256 | Validation error (with the face's primitives, 256 in all) |

## GPU timings and diagnostics

- When the device has timestamp queries, core enables Lite's per-task timings
  (`setRenderTaskGpuTimingEnabled`) while an instrument layer exists. After each frame it reads
  `getRenderTaskGpuTimings` and keeps, per layer, the summed GPU time of its `face` and `parts` tasks (a 256-entry
  history with p50 and p95), forwarded as `onMeasure({ kind: "instrumentGpuMs", layerId, durationMs })`. The adjust
  policy reads them (design language section 16).
- `state().instrument`: per layer the status (`ready`, `pending`, `stepped-down`, `failed`), objects, parts, kinds,
  drawn parts, each stepped-down object with its cause, warnings and GPU time; the stage's parts; the timing status;
  the compile counters. `state().materials` gains `{ kind: "instrument", objects, parts, interior, degraded }`.

## Lifecycle

Scenes, textures (the grain map) and storage buffers are engine resources. A scene that is replaced (a rebuild, a
material removed, the layer gone) is taken off the surface at once and disposed after a queue fence or device loss,
as superseded compositions are. `destroyGPU` disposes every scene before the engine, after core's existing fence. A
build that finishes after its generation was retired disposes its own scene. Nothing is fetched: the studio is a
Radiance image generated in code once per engine and light, loaded into each layer's scene with `loadHdrEnvironment`
(Lite attaches IBL textures to one scene) and rotated with `setEnvironmentRotation` so its softbox lies at
`light.azimuth`.

## Deviations from the draft

- **`camera.vanish`:** Lite's camera has no off-centre projection, so the vanishing point is the canvas centre, as in
  every probe. `vanish` is validated and kept; drift and containment use the canvas centre.
- **Parts budget:** a validation limit in the draft; core accepts up to 8,192 and steps the layer down above 2,048 (so
  the diagnostic and the adjust policy see it).
- **`protected`:** the field name of the draft (the brief calls it protected rects).
- **Captured caps** draw inside the `parts` task, depth-tested, until item 3 adds a target to draw them after.

## Decisions

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | Draw order | Keep the reorder of `getRenderingContexts` as a documented reliance, permuting only core's contexts, with a read-back guard that steps instrument layers down; ask Lite for an ordered insert | Re-register every context in order: `registerScene` is async, so a membership change draws a frame without meshes or waits for a rebuild |
| 2 | Mesh target | Direct into the layer's pass target, own render tasks with `clr: false`, the target named once for item 3 | An offscreen target now: an extra target and composite before any post stage needs one |
| 3 | Compile-deadline policy | Sequence: builds wait (at most 10 s) for successor preparation; only the running build holds the gate, until the GPU queue has caught up; a successor's deadline starts when the gate opens or after 3 s (measured need 0.3–0.7 s; a hung build freezes frames at most 3 s); builds have their own 10 s deadline and step down; pending layers draw at Relief | Extend the successor deadline while instrument layers exist |
| 4 | Recipes to Lite PBR | `base` → base colour (linear), metallic, roughness, `directIntensity`; `environment.strength` → `environmentIntensity`; `coat` → `setPbrClearCoat`; `reflectance` → `setPbrMetallicReflectance` (dielectric F0 only, I0.4); `emissive` → `setPbrEmissive`; `sheen`, `iridescence` → their setters; `brush` → `setPbrAnisotropy` with a generated hairline `grain` normal map | Per-layer custom shading: would re-specify Lite's PBR |
| 5 | Face shadows | A quad per object with up to 8 casters from a storage buffer, darkest wins (I0.5 (a)) | Casters in the relief binding: 256 entries cannot hold 2,048 parts, and the binding is shared with the conformance-tested shader |
| 6 | Clip | Fragment discard for shader materials, a depth clip mask before the PBR parts | Camera viewports: scissor exactly, but Lite would also change the projection |
| 7 | Opacity | 1 and 0 exact; between, material alpha per part, through a blended twin per kind built with the scene | Hide the parts below 1 (a pop); swap materials at run time (built asynchronously, not drawn in an explicit task) |
| 8 | Containment | A frontier bound per object (constant time per frame), the exact projection only near the limit | The exact projection every frame (vertices × steps × objects) |
| 9 | Budgets at the limit | Step-down with a diagnostic, never a validation error for counts the adjust policy measures | Refuse the scene |
| 10 | Diagnostics | `state().instrument` and `state().materials[].degraded`, plus `instrumentGpuMs` samples | A new event channel |
| 11 | LOD partners | Not used: Lite's thin-instance LOD switches by camera distance, and every part sits at `D ± h`; a profile's `segments` sets its detail | LOD partners for small parts, as the plan listed |
| 12 | Module layout | `instrument.ts` (format, validation, geometry, poses, containment; no Lite) and `instrument-pass.ts` (Lite scenes) beside `renderer.ts` | Everything in `renderer.ts` |

## Verification

- Unit: `tests/unit/instrument.unit.test.mjs` (validation, profile geometry, pose clamping, containment including the
  stage-corner drift case, a binding at mid-travel and I0.2's box rule).
- Browser: `tests/browser/core-instrument.test.mjs` on
  [`instrument-core.html`](../../examples/playground/instrument-core.html), DPR 1 and 2, headless, and again in a
  headful Canary window (`--headed`, viewport emulated at 1920 × 1080).
- Regression: the relief, objects and stage material suites, `ui-gpu`, the I0.1 hook suite, animation and the
  framework contract.

## Results (Canary 158.0.8110.0, Windows 11, RTX 3080)

Three panels at 1920 × 1080 (60 controls: knobs, faders, keys with captured caps, switches; 185 parts, 11 kinds per
layer), one panel clipped by a viewport. Headless and headful gave the same pixel numbers.

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| Part pixels (on against face only) / outside their control, a covering panel or the clip | 413,778 / 0 | 1,647,363 / 0 |
| Closest drawn pixel to a box edge (px, negative inside) | −2.40 | −2.39 |
| Crossed lower knob under the upper panel: covered / uncovered px | 0 / 6,310 | 0 / 25,218 |
| Clipped knob: past the viewport / inside | 0 / 1,582 | 0 / 6,329 |
| Native hits on part pixels: mismatches | 0 of 4,010 | 0 of 4,001 |
| Captured labels against core's plain pass (14 keys): mismatched texels | 0 of 26,046 | 0 of 107,516 |
| Opacity 0: part px against the face only | 0 of 296,462 | 0 of 1,185,848 |
| After a layer move: px outside / hit mismatches | 0 / 0 | 0 / 0 |
| 300 frames of poses (30 moving): captures, uploads, geometry updates | 0, 0, 0 | 0, 0, 0 |
| 250 controls (717 parts), 300 frames of poses (125 moving): captures, uploads, geometry updates | 0, 0, 0 | 0, 0, 0 |
| Core frame work p50 / p95, 250 controls (ms, CPU) | 3.8 / 5.8 | 3.1 / 5.6 |
| GPU per layer p50 / p95, 250 controls (ms): lower 616 parts, upper 84, clipped 17 | 1.56 / 2.56, 0.74 / 1.25, 0.66 / 0.69 | 1.54 / 2.12, 0.68 / 0.70, 0.71 / 0.72 |
| Overshooting pointer (`?overshoot=1`) | Stepped down: `containment`, `pointer`, inset −11.44 px, overshoot 11.44; 0 px outside | The same |
| Budget | 2,048 parts drawn; 2,049 stepped down (`budget`), GPU on | The same |

**Starts:** 10 of 10 starts reached GPU with all three scenes built (alternating DPR 1 and 2) while a successor
composition joined during the builds (`?race=1`): each deferred one successor deadline, by 414–632 ms headless
(505–662 headful); ready in 0.88–1.23 s headless, 1.08–1.33 s headful. No build timed out or failed. Each scene builds
in about 17–86 ms; its first frame finishes on the GPU about 20–35 ms later.

**Review fixes (2026-10-17).** An independent contract review found that the first compile gate covered the whole
build queue and waited for a drawn frame, so a successor and a queued build could wait on each other with no deadline;
that light and environment changes did not reach the parts; that bounds past the layer's box were not stepped down;
and that one more object rebuilt the scene. Each is fixed above and tested: a build held forever by core's internal
test hook (`?hang=1&race=1`) times out after 10,000 ms, its layer is drawn at Relief (`compile`), and the racing
successor waits 3,002 ms headless and 3,004 ms headed (the 3 s ceiling, `INSTRUMENT_SUCCESSOR_DEFERRAL_MS`), then compiles
within its own 1.5 s deadline and is published with GPU on and no fallback (the hook holds the build in script, not the
GPU); with the 3 s ceiling the 10 starts deferred 276–380 ms headless and 441–537 ms headed, ready in 0.83–0.94 s and
1.10–1.37 s (each start deferred exactly one successor deadline); a new light rebuilds all three scenes and changes 128,715 knob pixels (DPR 1); an object 40 px past
the panel changes 0 pixels beside it; three more knobs need 0 rebuilds; scenes and retirements return to 3 / 0 after a
rebuild, 2 / 0 after a cancel, 3 / 0 after restoring it, none after disable and 3 / 0 after re-enabling.

Smaller fixes from the same review: a failed order read-back takes the scenes off the surface and steps every object
down to Relief in that same frame (core now orders contexts before it writes the face's uniforms); Lite's task timings are turned off when the last instrument layer leaves; the studio image cache keeps at most
4 images; the camera's near plane is `D / 20` (was `D / 4`, which clipped parts taller than `0.75 D` at small `D`). Left
as they are, recorded: the browser test's 1 px band at the upper panel's edge accepts a pixel owned by a control of
either panel there (the border pixel is shared by both layers' antialiasing), and the exact containment cache misses
on a moving layer (above).

A second review added: a warm-up that times out is diagnosed like a build timeout (above); the successor-deferral
ceiling is 3 s and logs a warning when it, not the gate, releases a successor (the hung-build test checks the warning);
`boundsInside` allows half a pixel past the layer's edge, so a control flush with a fractional layer edge stays parts;
the 10-starts test asserts a deferral in every start; and the new modules are in the package allowlist. **Trade-off
kept (S1):** any change of light or environment rebuilds the layer's scene, so objects show at Relief for one build
(about 20–90 ms); a follow-up can update the key light and the fill in place and rebuild only for a new studio image.

**Lite 1.33 behaviour found while building it** (each fixed in core, recorded for the Lite requests):

- Opaque draws are recorded in a render bundle: `mesh.visible` writes do not reach it, `setMeshVisible` does.
- Double-sided PBR shades a back face with its normal flipped. Core's prism and extrude builders wound their triangles
  the other way from its lathes, so prism and extrude tops were drawn dark (a matte swatch's top 89 against its
  lathe's 149; brushed carriages and paddles 1–7 levels, found by `instrument-4.json`'s first run). Every builder now
  orients each triangle by its normals (`profileGeometry`), and a swatch test checks the three profile types alike.
- A `ShaderMaterial` with a `blend` is transparent unless `needAlphaBlending: false` is set, which the clip mask needs to
  draw before the parts.
- A material assigned after registration is rebuilt asynchronously and was not drawn by an explicit render task, hence
  the blended twins.
- Shader materials bind their textures when the scene registers: a captured cap's capture must be bound before
  `registerScene` (error 486 otherwise).
- `registerScene` appends and is asynchronous; there is still no ordered insert (decision 1).

# Core work item 2: emitters and the pointer light

**Status:** design note for [core work item 2](instrument.md#core-work-additive), written before the code (2026-10-18),
then implemented in the same PR ([results](#results-item-2)). One concern: lamps, LEDs, lit rings and the pointer light
as **light sources** in core, at every GPU level. Not in it: bloom (item 3), shadows from emitters (never, design
language section 3), and the Strata helper's pointer tracking and preferences (`pointermove`, `pointer: fine`,
`prefers-contrast`, `forced-colors`): core draws what the scene says and exposes exactly what the helper needs.

**Upstream check (2026-10-18):**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit (`gh api`,
  2026-10-18). Updated since item 1: [#162](https://github.com/WICG/html-in-canvas/issues/162) (rename `PaintEvent` to
  `CanvasPaintEvent`) and #155 were closed on 2026-10-15 with no new commit; #186 and #185 are still open. None touches
  this work: emitters change no capture, hit geometry or admission.
- **Chromium hotlist 6783002** (including the ElementCanvasTransform issues): not accessible without sign-in; not
  rechecked.
- **Browser tested:** Chrome Canary 158.0.8110.0, Windows 11, RTX 3080 (as item 1).

## What I0.3 proved and what core adds

[I0.3](instrument-phase0.md#i03-emitters-and-the-pointer-light) lit three overlapping panels through the probe hook: a
Lite effect task per layer right after the layer's pass, blend `dst · src + dst` over the layer box and a 48 px outset,
clustered point lights for the parts, protected rects from the layer's text runs. It found that the layer blend cannot
brighten what lies beneath (so the pool is its own pass), that strong pools turn guarded text boxes into grey patches
(the I1 second iteration answered with the pointer light's `face` 0.3 and a 10 px feather), and that the Relief and
Objects pointer light was face-only: no highlight followed bevel, side or dome normals.

Core now owns it, behind fields the scenes of every GPU level accept:

- **the face pool**, one pass per lit layer, at Relief, Objects and Instrument;
- **the analytic specular term** in the relief shading (bevels, object sides, domes), so a lamp or the pointer catches
  the Relief and Objects controls, not only the face;
- **clustered lights** on the Instrument parts, with the same position, colour, strength and reach;
- **protected rects and the guard**, with one feather per layer;
- **the budget** (64 per layer, tiled 16 × 9), with the drop rule and its diagnostic;
- **the per-frame path** for a moving emitter: `handle.setEmitters`, uniform writes only.

## API

```ts
const handle = controller.setMaterial("panel", { kind: "relief" | "objects" | "instrument", scene, ...policy });
// scene: version 4, with emitters, protected and feather (relief and objects: kind "relief", the default)
handle.update(nextScene);      // structure, layout, protected rects: as today
handle.setEmitters(emitters);  // positions, colours, strengths only: no validation of the rest, no repack, no rebuild
```

`setEmitters` is the only new call. It validates the emitter list alone and swaps it into the material's own validated
copy of the scene, so every cache keyed on that scene (the packed relief binding, the Instrument structure and face
scenes) stays valid; the next frame writes uniforms and clustered lights and nothing else. A version 4 scene that had no
`emitters` field gets one through the full `update` path instead (for an Instrument scene that is a structure change,
below). The pointer light is an emitter like any other, so the helper moves it with `setEmitters` every frame.

**Every frame a light is written is drawn.** `setEmitters` asks core for a frame, and core coalesces requests into one
draw per animation frame. The first version drew every other frame for a writer in the usual idiom (an animation-frame
callback that asks for its next frame before writing runs ahead of core's request in every frame: 150 draws for 300
writes). After a draw that carried a `setEmitters` write, core now asks for a lead frame at once, which draws only if
another write arrived by then, so core's callback follows the writer's in each frame (review fix; measured 299 draws
for 300 writes in that idiom, and 297–300 for 300 real pointer moves).

Diagnostics: `state().emitters` (per layer: emitters in the scene, lit, drawn, dropped with their reach, the guard's
rects and caps, the feather, the pass status, GPU time) and `emitterGpuMs` measurement samples.

## The scene fields

Rendering Model 2D.1 and 2D.4. Version 4 adds them to scenes of every level; versions 1 to 3 refuse them.

| Field | Core |
| --- | --- |
| `emitters` | `{ position: [x, y, z], colour: [r, g, b] (0–1), strength, radius, reach: "outset" \| "layer", face (0–1, default 1) }`, layer px, `z` above the face. The format takes up to 1,024; the renderer draws 64 per layer (the budget, below) |
| `protected` | Up to 4,096 rects `[x, y, width, height]` (the layer's text runs), or `"extent"`. Above 64 rects the layer protects its whole box, reported, never a validation error |
| `feather` | Default 4 px, 0–16 (the pointer light's guard feather is 10; the helper passes the largest of the emitters that reach the layer) |

Relief and Objects scenes carry them as **version 4 with `kind: "relief"`**: the `relief` material takes version 1 or
4 (no camera), the `objects` material versions 2, 3 or 4 (camera required, studio or map). That is how versions 2
and 3 were added (each version adds fields and the earlier ones refuse them), and it is what 2D.1 says. A version 4
`relief` scene without emitters shades exactly as its version 1 to 3 equivalent.

## Where the light is drawn

**The face pool** is its own pass per layer: a Lite standalone frame-graph context (`createFrameGraphContext`) with one
effect render task, drawn right after the layer's pass and before the layer's Instrument scene (so the parts are not lit
twice). It covers the layer's draw rectangle (its box grown by the scene's `outset` on every side the clip does not cut,
the relief pass's own rectangle), maps each pixel to layer px through the layer's inverse matrix (affine or tilted), and
multiplies what is on the canvas by `1 + E`:

```text
E = Σ I · face · colour · max(z / ‖d‖, 0) / (π ‖d‖²) · clamp(1 − (‖d‖² / R²)², 0, 1)² · (reach "layer" ? a(p) : 1) · opacity
```

`a(p)` is the layer's captured alpha, read from the layer's capture (0 outside the layer's box), so the pointer light
lights each layer's own content once where layers overlap and nothing beneath it. Past the layer's box the light eases
out over the outer half of the outset on that side (`1 − smoothstep(0.5, 1, beyond / outset)`), so a lamp whose reach
passes the outset leaves no edge on the page or the panel beneath (I0.3 saw a hard cut at the 48 px outset; a
deviation from 2D.4, which draws the outset at full strength). The pass is skipped (task execution off) on frames with
no light. A frame-graph context rather than an effect renderer because Lite's per-task GPU timings only see frame
graphs, and it registers synchronously, so it can join a frame without an asynchronous build.

**Why not inside `reliefShade`:** the layer blend is straight alpha, so the layer's shading can only darken what lies
beneath its outset (I0.3). The pool must multiply the canvas.

**The specular term at Relief and Objects:** the relief shading adds, per emitter, a coloured point-light highlight on
bevels, object sides and domes: the lobe of 2.5 (`pow(n · h, mix(160, 6, roughness)) · (1 − roughness) · mix(0.35, 1,
metallic) · 1.2`, plus the coat lobe) with `h = normalize(l + (0, 0, 1))`, times the emitter's irradiance
`I · colour · max(n · l, 0) / (π d²) · window` at full strength (`face` is for the face pool; parts and their projections
take all of the light, design language section 3). It is added where the relief's own `shade` term is, so it is zero
wherever the 2.9 guard holds, and it is multiplied by `1 − protect` inside protected rects. The point is `(p, 0)` on a
relief bevel and `(p, mid height)` on an object. The pool already lights the diffuse part of bevels and domes.

**The parts at Instrument:** one Lite clustered light container per Instrument scene with 64 point lights, created with
the scene (Lite bakes the capacity and wires the PBR materials at `addClusteredLightContainer`); unused lights have
intensity 0, which Lite skips. Each frame the drawn emitters are written into them in world units: position through the
layer's world matrix, range `R · s` and intensity `I · s²` for a layer scale `s`, so the falloff in layer px matches the
pool. A scene gets the container when it has an `emitters` field (even empty): the field's presence is part of the
structure key, so turning the pointer light on rebuilds the scene once (its objects show at Relief for one build), and
every later change is in place. `setMaxLights` is not used: it caps Lite's scene-light buffer (the key light and the
fill), not clustered lights, and it is global.

## Emitters in the relief binding

The pool and the relief shading read the same **emitter block**, packed once per layer and frame:

| vec4s | Content |
| --- | --- |
| 1 | emitter count, feather, protected rect count, `interior.max` |
| 1 | the tile grid: origin and cell size over the draw rectangle, layer px |
| 1 | the protected box: on or off, the extent, and whether the whole outset is protected (lower layers' text overflowed) |
| 64 | protected rects: the layer's own, then lower layers' text under its outset |
| 64 | per rect: the light cap and the shadow cap (the guard, below; 0 for a lower layer's text) |
| 128 | emitters: `(x, y, z, ±R)` (negative for `reach: "layer"`), `(I · colour, face)`, at full strength |
| 144 | the 16 × 9 tiles, one vec4 each: four 16-bit masks of the emitters whose reach meets the tile (exact in f32, so no shader reinterprets uniform floats as bits) |
| 144 | the protected box's 16 × 9 cells over the extent: each cell's light and shadow caps |

The block (547 vec4s) is packed once per layer and frame and appended to the relief binding (1,702 → 2,249 vec4s, 36 KB
of the 64 KB a uniform binding may hold), so the layer pass keeps its one binding layout; the stage material uses only
the start of the binding and is unchanged. The pool's own binding is an 8-vec4 header (frame and the layer's opacity,
draw bounds, inverse matrix rows, draw rectangle, capture grid, extent) and a copy of the same block. Tiles bin each
emitter by its reach in the face plane; the highlight on an object is evaluated at the object's mid height, a few px
above it, where the reach is the same to within `z² / R` (under 0.1 px for the tokens).

## The guard

Inside a protected rect the face's **whole** change stays within `m = interior.max`: the relief's interior factor `k`
(2.9), the part shadows `Sₚ` and the emitter light together (2D.4). Core keeps it without evaluating the relief on the
pool's pixels:

- **Bounds of `k` per area,** on the CPU, from the layer's face scene (for an Instrument layer, its primitives and the
  objects drawn at Relief this frame), cached per face scene and protected list (`interiorBounds`):
  - **offsets by the largest stack:** in the shading a covering entry replaces the offset beneath it, and offsets add
    only within an antialiased edge, so `k_hi = 1 + min(m, largest over the entries overlapping the area of its offset
    plus the offsets of the earlier entries it overlaps there)`, and `k_lo` likewise with the negative offsets. Entries
    side by side never add (review fix: the first version summed every overlapping entry, so a rect over two separate
    satin keys bounded `k_hi` at 1.01 instead of 1.005, and ten satin keys under `"extent"` left no light at all);
  - **shadows where they can fall on a guarded face:** every caster counts, whether or not its box touches the area (its
    shadow reaches past it). Its cast shadow lowers `k_lo` to `1 − min(strength, m)` only where its shadow region meets
    a point of the area that lies on an *earlier* entry (the shading drops shadows under later covers) and is not a
    pixel inside the caster (2.8). A face's own drop shadow, which falls outside the face, never counts (review fix: the
    first version counted any shadow that could reach the area, the panel's own included through its rounded corners, so
    one raised face under `"extent"` lost every part shadow; second review fix: the fix after it tested shadows only
    for casters whose box touched the area, so a rect 2 px below a key bounded `k` at [1, 1] while the shading darkens it
    by up to 0.215; it is now [0.96, 1]). The cast height is the one the relief pass packs, through the same function
    (`castHeight`): hover raises it, a press lowers a face by `pressHeight` and a key or mark by its travel (a pressed key
    of height 10 and travel 2 casts 8, not 2.5).
  - **a rect wholly inside a cover** (half a pixel clear of its edge) takes that cover's offset alone: offsets stack only
    within antialiased edges.
- **Light:** inside an area, `E` is capped per channel at `(1 + m) / k_hi − 1` (`m` on a plain face).
- **Part shadows:** inside an area, each object's face shadow is scaled (2.9's `g`, so it keeps its soft profile) so that
  the `n` objects whose shadows reach the area darken it together by at most `1 − (1 − m) / k_lo` (`shadowScales`, a pure
  function). Part shadows inside protected areas are guarded whether or not the scene has emitters: this is 2D.4's face
  factor, as the relief's own shadows are on guarded faces (2.9).
- Emitters only add light and shadows only take it away, so `k · (1 − Sₚ) · (1 + E)` stays in `[1 − m, 1 + m]` inside
  every protected area. Outside, both return to full strength over `feather` px (`1 − smoothstep(0, feather, q)`, `q` the
  distance to the area).
- **A protected box** (`"extent"`, or more than 64 rects, the design language's rule, reported in `state().emitters`)
  has its caps per cell of a 16 × 9 grid over the extent, so one stack of controls or one shadow lowers the caps of its
  own cells only (review fix: the first version gave the whole box one cap). The outset is outside the box, so a lamp
  near the edge still lights the page past it.
- **Lower layers' text:** a layer adds no light to the text of the layers beneath its outset. Each frame core maps the
  protected areas of every lower layer into the layer's px, keeps their parts that lie in its outset (outside its own
  box, which covers the rest), and adds them to the block with a light cap of 0, after the layer's own rects. If they do
  not fit, they are merged per side of the layer's box (left, right, top, bottom: at most four boxes, none reaching into
  the box, so the layer's own face keeps its light; third review fix: one bounding box over text on two sides covered
  part of the face); if even those do not fit, the outset gets no light. `state().emitters.layers[].beneath` reports `{ rects, merged, overflow }`. Each
  layer's text therefore takes light only from its own layer, within its own guard (review fix: C's lamp lit B's text in
  C's outset by +35 levels at 2 px). It assumes the upper layer's box is opaque: lower text inside the upper box (its
  rounded corners included) where the upper layer is transparent is lit by the upper layer's `reach: "outset"` lamps
  without a cap.
- **What the guard does not hold:** text on bare ground (inside no relief entry) takes the relief's cast shadows at full
  strength, as part 2.9 never guarded it; the caps step at the cells' borders, so a part shadow under a protected box can
  be cut along a straight line; under a protected box the relief highlights are off across the whole box.

**Deviation from 2D.4:** the model clamps the product `(1 − Sₚ)(1 + E)` to `[(1 − m)/k, (1 + m)/k]`; core bounds each
side. They are equal when only light or only shadow reaches a protected pixel; with both, core is stricter (light does
not lift a shadow inside text). The exact clamp needs `k` and `Sₚ` per pixel in the pool: the relief loop a second time
on text pixels and the casters of every object, which a refactor of the conformance-tested shader could give later.


## The budget

64 emitters per layer, binned into the 16 × 9 tile mask over the layer's draw rectangle. An emitter counts when it gives
light (strength and colour above 0) and reaches the draw rectangle: its reach margin is `√(R² − z²)` minus the distance
from `(x, y)` to the rectangle. The renderer keeps the 64 with the largest margin (the nearest by reach, in scene order
on ties) and drops the rest: `state().emitters.layers[].dropped` lists each dropped emitter's index and margin. Never a
validation error, and GPU stays on. The stage has no emitter budget.

## The update path

| Change | Path | Work |
| --- | --- | --- |
| Emitter positions, colours, strengths (a lamp turns on, the pointer moves) | `handle.setEmitters` | Validate the list; next frame: tile binning, the pool's and the relief tail's uniforms, clustered light data. 0 captures, 0 capture uploads, 0 geometry updates, no rebuild |
| Protected rects, feather, layout | `handle.update(scene)` | As any scene update; the guard's bounds are recomputed |
| `emitters` appears in an Instrument scene | `handle.update(scene)` | One rebuild (the clustered container) |

## Lifecycle

The pool context belongs to its layer's pass (it reads that pass's capture texture): created with the pass when the
layer's scene already has an `emitters` field (its pipeline built then, registered and taken off again as successor
passes are, so a new composition's first frame compiles nothing), or the first frame the field appears; registered with
the passes and ordered after its layer's pass, taken off the surface when the composition is unpresented, and disposed
with the pass after the composition's queue fence, device loss or `destroyGPU` (`resources.lightPasses`,
`metrics.lightPassesDisposed`). Its task draws into Lite's swapchain target and disposes that target with the task;
Lite 1.33 leaves it alone only because the swapchain target is eager with no attachment disposer
(`lib/engine/surface.js`, `lib/engine/render-target.js`), which the browser test exercises by retiring a pass while the
engine lives. The clustered container is a resource of its Instrument scene and goes with it. Task timings stay on while
a pool or an Instrument layer exists.

**Draw order.** Pools join item 1's documented reliance (decision 1): core permutes its own contexts in
`getRenderingContexts` and reads the order back. If Lite refuses it, every pool is taken off the surface (the light is
off, `state().emitters.order` names the reason), Instrument layers step down as before, and GPU stays on.

## Decisions (item 2)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | Where the face pool is drawn | Its own pass per layer after the layer's pass and before its parts, over the draw rectangle, `dst · src + dst`; the same pass at every level | A light term in `reliefShade`: cannot brighten what lies beneath the outset (I0.3) |
| 2 | The pass object | A standalone frame-graph context with one effect task: synchronous registration, seen by Lite's task timings, execution off on unlit frames | An effect renderer: not timed by Lite; a Lite scene: asynchronous `registerScene` |
| 3 | How emitters reach the relief shading | An emitter block (64 emitters, 64 rects with caps, 16 × 9 tiles of four 16-bit masks) appended to the relief binding, packed per frame | A separate binding: a second bind-group layout for every relief pass |
| 4 | Specular at Relief and Objects | The 2.5 lobe per emitter on bevels, sides and domes, coloured, at full strength, zero where 2.9 guards and inside protected rects | No specular (I0.3's face-only light) |
| 5 | The guard | CPU bounds of `k` per area (offsets by the largest stack, shadows where they fall on a guarded face); light capped and part shadows scaled so the product stays in `1 ± m`; one feather per layer; a protected box (`"extent"`, more than 64 rects) has caps per 16 × 9 cell; lower layers' text under the outset gets no light | The exact clamp of 2D.4, evaluating the relief and every caster per text pixel |
| 6 | The update path | `handle.setEmitters` swaps the list into the validated scene in place: uniform writes only; core draws every frame a light was written (a lead frame after such a draw) | `handle.update` every frame: re-validates and repacks the scene, and recomputes the Instrument structure key; guidance on the writer's idiom instead of the lead frame |
| 7 | The budget | 64 per layer kept by reach margin, the rest dropped with a diagnostic; the format takes 1,024 | A validation error at 65 |
| 8 | Scene versions | Version 4 (`kind: "relief"`) carries `emitters`, `protected` and `feather` for the Relief and Objects materials | Additive fields on versions 1 to 3: changes normative versions |
| 9 | Instrument parts | One clustered container of 64 lights per scene that has `emitters`, built with the scene, updated in place | A container sized to the emitter count: a rebuild whenever the count changes |
| 10 | Timing | `emitterGpuMs` per layer from Lite's task timings; the clustered cost shows in `instrumentGpuMs` | Frame GPU time deltas only |

## Verification (item 2)

- Unit: `tests/unit/emitters.unit.test.mjs` (validation, the version rules, budget selection and its order, tile
  binning, the guard's bounds of `k`, packing).
- Browser: `tests/browser/core-emitters.test.mjs` on
  [`instrument-emitters-core.html`](../../examples/playground/instrument-emitters-core.html), DPR 1 and 2, at
  `?level=relief`, `objects` and `instrument`, headless, and a headful Canary check.
- Regression: `core-instrument`, `ui-gpu`, the relief, objects, stage and material suites, and the I0.3 probe
  (`ui-probe-instrument-emitters`).

## Results (item 2)

Canary 158.0.8110.0, Windows 11, RTX 3080, 1920 × 1080, [`instrument-emitters-core.html`](../../examples/playground/instrument-emitters-core.html)
(stage layer and panels A, B, C; C's power lamp ×1.5 beside its label near C's left edge over B; its corner lamp near
its bottom edge over the stage). Headless at DPR 1 and 2, and headful at DPR 1 (`--headed`, viewport emulated at
1920 × 1080): every pixel number below is the same headful and headless. Pixel numbers are identical at the three
levels except where a column says otherwise (the face pool is one pass at every level).

**Pools** (8-bit mean-RGB gain, lamp on against off):

| Where | Light theme | Dark theme |
| --- | --- | --- |
| Face, one lens diameter from the power lamp (median of the clear sample points) | +11.3 | +25.7 (DPR 2: +25.0) |
| Face at 1.5 / 2 / 3 diameters | — / — / +6.3 | +10 / +4.3 / +1.3 |
| Past C's edge onto B at 2 / 6 / 12 / 20 / 32 / 48 px | +35 / 21.3 / 19.3 / 19.3 / 12.3 / 0 | +16 / 13 / 9 / 6 / 2.7 / 0 |
| Onto the dark stage past the corner lamp at 2 / 6 / 12 / 20 / 32 / 48 px | | +5 / 4 / 3 / 2 / 1 / 0 |
| The lamp's bezel ring, 9.5 px from its centre (Instrument: a part, clustered light only) | +99 DPR 1, +67 DPR 2 (median) | |

**Contrast and the guard** (decoded WCAG; the excess is how far any channel of the text box moves past `1 ± m`
against core's plain pass, the capture with no material, in 8-bit levels, so ≤ 0.5 is rounding):

| Theme | Text | Lamp off | Lamp on | Excess past `interior.max` |
| --- | --- | --- | --- | --- |
| Light | label | 13.96 | 14.96 | 0.44 |
| Light | caption (muted) | 5.44 | 5.64 (DPR 2: 5.69) | 0.40 |
| Dark | label | 11.00 (DPR 2: 11.07) | 11.59 | 0.40 (DPR 2: 0.44) |
| Dark | caption (muted) | 5.95 | 6.42 | 0.32 (DPR 2: 0.40) |

**Hits:** 16 visible controls, each hit at its centre, identical with every lamp off and on; 0 hit-geometry updates.

**Highlights** (pointer light with `face` 0, so only the highlight changes pixels; the pointer moves from one side of
A's knob to the other): knob pixels changed 68 / 137 / 783 at DPR 1 (Relief / Objects / Instrument), 274 / 518 /
3,184 at DPR 2; A's protected text, less its 1 px rim (the REC label's box reaches under the lit ring part): 0 of
13,067 (DPR 1) and 0 of 53,936 (DPR 2) changed, at every level.

**The pointer run** (300 real mouse moves paced at 60 Hz across the stage, A, B and C, at every level and DPR, headless
and headful): 0 captures, 0 uploads, 0 hit-geometry updates, 300 GPU frames, 301 `setEmitters` rounds (all four
layers), interval p50 17.6–17.8 ms (p95 18.2–18.5), the page's write p50 / p95 0.1–0.2 / 0.2–0.3 ms; hits on every
visible control unchanged; the face under the pointer (233, 235, 239) → (255, 255, 255) on the light theme; a point
of B in C's outset and its mirror about the pointer both gain 4 levels (the light is applied once).

**Budget:** 64 emitters on B: 64 drawn, 0 dropped; 65: 64 drawn, emitter 64 dropped (margin 167.81 px); 80: 64
drawn, 16 dropped, the pass drawn, GPU on, at every level and DPR.

**Cost** (GPU task medians over 120 frames, ms; the stage's pool covers the whole window; B's pool and B's Instrument
scene, whose `parts` task carries the clustered lights). Headful DPR 1, the steadiest run:

| Emitters | 0 | 1 | 16 | 64 |
| --- | --- | --- | --- | --- |
| Stage pool, Relief / Objects | off | 0.28 | 0.62 | 1.09 |
| Stage pool, Instrument page | off | 0.22 | 0.42 | 0.74 |
| B's pool | off | 0.09 | 0.22 | 0.41 |
| B's Instrument scene (face shadows + parts with clustered lights) | 0.80 | 0.79 | 0.77 | 0.78 |

Headless runs scatter by up to 10× on the same counts (stage pool at 64: 0.14–1.44 ms at DPR 1, 0.84–1.42 at DPR 2;
B's scene 0.12–0.68), the RTX 3080's demand-driven clocks (I0.8); treat the numbers as upper bounds. The clustered
lights add no measurable time to the parts at 64. With 0 emitters the pool's task is off and takes no GPU time.

**Lifecycle:** after `disable`, `resources.lightPasses` is 0 and the engine is gone; after `enable` the pools come back
and draw.

**Review fixes (2026-10-18).** An independent contract review rated the first version not ready; each finding is fixed
above and measured here (headless DPR 1 and 2, and headful DPR 1, identical pixel numbers):

- **The guard bound** (blocker). The review's three cases, computed from core's sources: one raised face (radius 14)
  under `"extent"`: every cell keeps light and shadow caps of 0.04 (was a shadow cap of 0); ten satin keys under
  `"extent"`: the smallest light cap is 0.0348, one key's (was 0); a rect over two separate satin keys: `k_hi` 1.005 (was
  1.01). On the page, with every panel protecting `"extent"` or 65 or more rects (12 past 64): the knob's part shadow on
  the face is 7.3 levels deep at Instrument (49–50 with text runs: inside a protected box part shadows darken by at most
  `interior.max`, as the relief's own shadows on guarded faces do), the pool still lights the face (+3 to +9 levels
  beside the corner lamp), and the label and caption stay within 0.44 / 0.40 levels of `1 ± m`; with overlapping rects,
  +19.3 and the same excesses. The cells' smallest caps: 0.040 / 0.040 at Instrument, 0.030 / 0 at Objects and 0.011 / 0
  at Relief (cells inside the keys' and knobs' relief shadows).
- **Lower layers' text.** B's note under C's outset: 0 levels of change against the plain pass with C's lamp on, at every
  level and DPR (C adds no light there); contrast 5.44 / 5.94 light / dark, unchanged by the lamp. C carries one such
  rect.
- **Every written frame drawn.** A writer in the usual idiom (asks for its next frame, then writes): 299 draws for 300
  writes (was 150); the pointer run 297–300 draws for 300 moves.
- **Tests.** The guard tolerance is 1 level against the plain pass (worst measured 0.44); the lamp's change alone is
  asserted within 1.5 levels (worst 1.12, Objects light label: the two frames are each rounded once, which accounts for
  ≈ 1.02 of it, the rest is the 8-bit blend); a pass retired by a resize disposes its pool while the engine lives (1
  disposed, 4 pools before and after, the next frame drawn).
- **Nits.** The block is packed once per layer and frame; a failed pool creation releases its frame-graph context; pools
  are created and their pipelines built with their pass; the timing answer cannot write into a replaced record; layers
  that no longer light anything leave the diagnostics.

**Second review fixes (2026-10-18).** A second review found two regressions in the fixes and four smaller gaps; each is fixed
above and measured here (headless DPR 1 and 2, headful DPR 1, identical numbers):

- **Every caster's shadow counts** (regression). A rect below a key in the unit scene: at y 70 / 71 [0.96, 1.005], at
  y 72 / 75 [0.96, 1] (was [1, 1]), at y 90 [1, 1] (clear of the shadow); the review's rect [146..160, 96..104] beside a
  raised key [100, 50, 40, 40]: [0.96, 1] (was [1, 1] with caps 0.04 / 0.04). Ten satin keys under `"extent"`: 91 of 144
  cells may lie in a key's shadow (shadow cap 0), the smallest light cap stays 0.0348. Cast heights now match the relief
  pass: a raised face of height 10 casts 10, 16 hovered, 2.5 pressed; a key of height 10 and travel 2 casts 8 pressed
  (the guard assumed 2.5) and 12.5 hovered. A rect wholly inside a key on a satin plate: [1, 1.005] (was 1.01).
- **Ordinary draws during a lead frame** (regression). A light written in one frame, then `handle.update` (B's shadow
  strength 0.24 → 0.6) in the next, while core's lead frame was pending: 1 GPU frame in the two frames after the update,
  0 paints, the stage below B 73–75 levels darker. With the regression rebuilt into the page the same sequence drew 0
  frames (three runs), so the test tells them apart.
- **Lower layers' text that does not fit** is merged into its bounding box before the outset goes dark, reported in
  `beneath` (`{ rects, merged, overflow }`; C: 1 rect, not merged, no overflow); unit-tested with 63 + 2 and 64 + 2 rects.
- **`writeLight`** computes the guard when `packLights` did not run (admission's own uniform write).
- **Tests:** B's note under C's outset: the raw difference lamp off against on is 0 levels on both themes, while a control
  point in C's glow 9 px below it gains +10.7 (light) and +2.7 (dark); after the pass with its pool was replaced by a
  resize, C's lamp lights B past C's edge by +21.3; the overlapping rects have exact caps (0.034826 / 0 and
  0.034826 / 0.04).

**Third review fixes (2026-10-18).** The guard's cost: with every caster tested against every earlier entry, a warm
`layerGuard` under `"extent"` took 31–37 ms (the review) and 36–50 ms (here, Node 24) over 256 entries, and 2.5–3.6 ms over
41, on the main thread at every scene change. Each shape's shadow region is now computed once with the shape, and a
caster whose region misses the area skips the scan: 0.9–1.1 ms over 256 entries and 0.3–0.5 ms over 41 (median of 7, warm;
a unit test fails above 15 ms). Lower layers' text is merged per side (above); the update-after-lead check also asserts
that no browser paint drew its frames.

**Suites (after the second review's fixes):** `core-emitters` 6 of 6 headless and 3 of 3 headful (DPR 1); `core-instrument`,
`ui-gpu`, relief, objects, stage, material and the I0.3 probe: 74 of 74; unit 152 (1 skipped), compiler 129, typecheck,
build and `test:package` pass.

**Suites (after the first review's fixes):** `core-emitters` 6 of 6 headless and 3 of 3 headful (DPR 1); `core-instrument` 5 of 5,
`ui-gpu`, relief, objects, stage, material and the I0.3 probe: 74 of 74; unit 151 (1 skipped), compiler 129,
typecheck, build and `test:package` pass. The first version's runs: `core-emitters` 6 / 3, the same suites 69 + 5,
unit 149.

**Found while building it** (each handled in core or the page, recorded):

- Lite builds one shader module from an effect's vertex and fragment WGSL, so a binding is declared once.
- An effect render task disposes its target with the task; the swapchain target is eager and survives it.
- A Playwright screenshot asks the browser for a paint with no attribution, which recaptures every layer: the pointer
  run takes its screenshots after the run.
- Core coalesces draw requests into one per animation frame; a writer that asks for its next frame before writing
  drew every other frame (150 of 300), hence the lead frame above.
- The pool reads the captured alpha for `reach: "layer"`; outside the layer's box the clamped read returned the edge
  texel and lit C's outset over B twice (+8 instead of +4): the alpha is 0 outside the box, and the test checks it.

**Limits:** captured caps (key labels at Instrument) are drawn after the pool and not lit, as in I0.3; a protected box
lowers part shadows to `interior.max` across the whole face (the guard's rule, not a fault); lamps at the Objects level
saturate their own emissive pucks (the lamp's light falls on its own dome); one fast GPU; `prefers-contrast`,
`forced-colors`, `pointer: fine` and the fade belong to the helper and are not tested here. The open limits are in
[open issues](../open-issues.md) (SCOPE-009).

# Core work item 3: shadows and the post chain

**Status:** design note for [core work item 3](instrument.md#core-work-additive), written before the code (2026-10-18),
then implemented in the same PR ([results](#results-item-3)). One concern: the per-layer **offscreen mesh target** and its
**clipped composite**, **SMAA**, **emitter bloom**, the **PCF shadow map** for parts on parts, **captured caps after the
chain**, **exact group opacity** (the blended twins of item 1 go), and TAA, contact shadows and SSGI as options, off by
default. Also the exposure and contrast fix the calibration found. Not in it: the capture-fed environment probe and glass
(item 4), custom parts (item 5), and the Strata helper's wiring.

**Upstream check (2026-10-18):**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit (`gh api`,
  2026-10-18). Nothing has changed since item 2: #162 and #155 were closed on 2026-10-15 with no commit, and #186 and #185
  are still open. None touches this work: the chain draws decoration only and changes no capture, hit geometry or
  admission.
- **Chromium hotlist 6783002** (including the ElementCanvasTransform issues): not accessible without sign-in; not
  rechecked.
- **Browser tested:** Chrome Canary 158.0.8110.0, Windows 11, RTX 3080 (as items 1 and 2).

## What I0.5 and I0.8 proved and what core adds

[I0.5](instrument-phase0.md#i05-object-on-object-shadow) drew a lever's shadow on its plate with a PCF map of 4,096 at a
bias of about 1.95 world px, its depth range fitted to the stage, thin-instance bounds published and re-rendered on pose
change only, and changed no face pixel outside the analytic footprints. [I0.8](instrument-phase0.md#i08-post-chain-and-reflections)
drew the parts into an offscreen target (`createSurfaceRenderTargetTexture`, rgba16float + depth24plus with
`withSampledDepthTexture`, drawn by `createRenderTask({ sharedRt: true, autoMirror: false })` and `addMeshToTask`), ran
TAA, contact shadows, SSGI, SMAA and an emitter bloom on it, and composited it over the face with a premultiplied effect
task (`createEffectWrapper`, `createEffectRenderTask({ target: engine.scRT, clear: false })`) multiplied by an r8unorm
mask of the controls' rounded boxes; every stage left text unchanged as long as the composite was clipped. Both were
probes through the prototype hook; core now owns the construction, behind the scene fields that item 1 validated and
did not draw (`shadow.map`, `post`).

## API

Nothing new to call. The scene's existing fields now draw:

| Field | Default | Core |
| --- | --- | --- |
| `post.smaa` | `true` | SMAA on the mesh target |
| `post.bloom` | `true` | Emitter bloom (below) |
| `post.taa` | `false` | TAA, first in the chain when on |
| `post.contact` | `false` | Screen-space contact shadows between parts |
| `post.ssgi` | `false` | Screen-space bounced light between parts |
| `shadow.map` | `{ size: 4096, bias: 1.95, darkness: 0.1 }` | The PCF map; `darkness: 1` builds no map (a map that leaves the whole key term is no map) |

A scene without `post` takes the defaults (2D.1), and a scene without `shadow.map` takes the map's defaults (2D.7): every
Instrument layer now draws SMAA, bloom and the map unless its scene turns them off. Diagnostics grow by
`state().instrument.post` and a `post` step-down reason (below). The only other public change is that fractional layer
opacity is exact.

## The order of one layer's tasks

Each Instrument layer's Lite scene runs, right after its layer's pass (and its face pool):

1. **`shadow`** (Lite's task, installed by `registerSceneWithShadowSupport`): the PCF map, only on frames whose casters or
   light changed.
2. **`face`:** the analytic face shadows, straight onto the swapchain, as in item 1 (they belong to the face, `Φ`).
3. **`mask`:** the clip mask (below) into an r8unorm target.
4. **`parts`:** every PBR part into the mesh target, cleared transparent, with its own depth.
5. **`taa`, `contact`, `ssgi`** when on, in that order, each into the next ping-pong target.
6. **`smaa`** when on.
7. **`emitters`** and **`bloom`** when the layer has lit lenses this frame.
8. **`caps`:** the captured caps into the caps target, depth-tested against the mesh target's depth.
9. **`composite`:** one effect task onto the swapchain over the layer's drawn rectangle.

The composite, per pixel, with `M` the clip mask, `α` the layer's opacity, `P` the chain's result (premultiplied), `C` the
caps (premultiplied) and `B`, `E` the bloom and its emitter source:

```text
src = α · [ C + (1 − C.a) · (P + max(B − E, 0)) · M ]        blended one, one-minus-src-alpha over the swapchain
```

so the canvas becomes `src + (1 − src.a) · out`: 2D.8's composite, with the caps (step 6) laid over the parts inside it.

## Decisions (item 3)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | **Target format and lifetime** | rgba16float colour with a depth24plus depth (sampled), cleared transparent every frame (I0.8). **One set of surface-sized targets per engine, shared by every Instrument layer in paint order:** each layer's chain runs to its composite before the next layer's scene starts, in one command encoder, so the next layer may clear and reuse them. Allocated on first need, only for the stages some layer uses (ping-pong targets for TAA, contact, SSGI and SMAA; caps, emitter and glow targets when a layer has caps or lenses). They are Lite surface render targets, so a resize or a DPR change re-sizes them on the next record; they are released with the controller (engine teardown, device loss), after every scene that reads them | A set per layer (I0.8): memory times layers, about 270 MB per layer at DPR 2 on a 1920 × 1080 window |
| 2 | **Always through the target** | Every Instrument layer draws its parts through the target and composite, with every `post` flag off too: one path, and group opacity is exact in every configuration. Cost: the composite (0.20–0.26 ms per layer in I0.8) | Direct into the layer's target when every flag is off and the opacity is 1 (2D.8 allows it): two paths, and fractional opacity would need item 1's blended twins again |
| 3 | **The composite** | An effect task onto the swapchain over the layer's drawn rectangle (its box through the layer's matrix, in device px, clamped to the canvas), premultiplied, by the formula above | A full-screen effect per layer: the same result at the cost of every pixel |
| 4 | **The clip mask (mandatory)** | An r8unorm mask: one quad per object drawn as parts, whose fragment sets 1 where its pixel centre lies inside the object's `bounds` (rounded box, in layer px through the inverse similarity: exact, no rasterised antialiasing) and inside the layer's clip. The composite multiplies the parts, the chain and the halo by it, so no stage (SMAA, TAA, SSGI, bloom) draws outside a control's box or the clip. It replaces item 1's depth clip mask | No mask, trusting containment: TAA, SMAA and SSGI spill 0.2–2 px past part edges and bloom further (I0.8) |
| 5 | **Captured caps** | Drawn after the chain into their own **rgba8unorm** target, depth-tested against the mesh target's depth (loaded, not cleared), and laid over the parts inside the composite, so no stage filters them and neither bloom nor the mask touches them. rgba8unorm, so a fully covered cap pixel is its capture texel quantised once, as the direct pass of item 1 drew it. A part in front of a cap (an LED on a key) occludes it through the depth test and goes through the chain (it carries no text) | Caps on the swapchain after the composite (I0.8's construction): exact at opacity 1, but at a fractional opacity the cap blends over the already faded parts, which is not group opacity |
| 6 | **Opacity** | **The meshes blend as one group over the layer's already faded face:** the composite multiplies the layer's whole mesh result (parts, halo, caps) by `α`, so under an opaque part the canvas is `α · P + (1 − α) · (α · F + (1 − α) · B)`, with `F` the face and `B` what lies beneath the layer. The parts no longer show through each other (the twins' fault), but this is not true group opacity of the layer (`α · P + (1 − α) · B`): the layer pass fades the face before the composite, so a label under a knob shows through at `α (1 − α)` (25% at 0.5). True group opacity needs the face drawn into the chain; it is recorded as a follow-up (open issues, SCOPE-009), a candidate for item 4, which reworks the face path for the capture probe. The blended twins are deleted. The face shadows keep item 1's darkening by `α` (they are part of the face) | Keep the twins: each part blends over the faded face separately |
| 7 | **SMAA** | Last of the anti-aliasing stages, before bloom, on the mesh target's chain (TAA first when on, since it jitters the parts task), with I0.8's threshold 0.05 and 16 search steps | SMAA after the composite: it would filter the face and the text |
| 8 | **Bloom from an emitter target** | Parts flagged `emitter` whose emitter is lit (strength and colour above 0) draw into an rgba8unorm emitter target as **flat glow copies**: the same triangles and instances, a shader material that reads a per-instance glow colour (the part material's emissive colour times its strength, display-encoded and clamped; the emitter's own colour when the material has no emissive), and nothing for an unlit lens. Lite's bloom (threshold 0.05, weight 0.8, kernel 48, scale 0.5, I0.8) reads it into a glow target, and the composite adds `max(B − E, 0)` inside `M`. Frames with no lit lens turn the emitter and bloom tasks off (`executionEnabled`) and the composite reads neither; a layer with no flagged part has neither task. Lite's PBR clamps its output, so a luminance threshold would bloom specular highlights too (I0.8) | The lens's own PBR material in the emitter target (I0.8): a material is per kind, not per instance, so an unlit lens of a lit kind would bloom, and a glow that follows the emitter would need a material swap |
| 9 | **The PCF map** | Lite's directional PCF generator on the key light, created with the scene: `size` from `shadow.map.size` (4,096), `darkness` from the scene, the bias converted from world px (`2 · bias / span`, with `span = 2R` the window's full depth, since Lite's bias offsets light-space depth by half of it: `bias / R`). The light stands on the stage centre's ray, and its depth window is centred on the stage with half-depth `R = max(4096, 2^⌈log₂(r + 256)⌉)` px, `r` the stage's half-diagonal: every part on the stage lies in it at every DPR, so the range is **fitted to the stage**; core checks it every frame, and a stage that outgrows `R` rebuilds the scene (the window is part of its structure key). Every PBR part casts and receives; captured caps, glow copies, mask and face quads do not; the face is not a mesh, so the map never reaches it. Each part kind **publishes the world box of its placements** as its bounds, updated with its instances (Lite fits the map to them). **Re-rendered on pose change only:** Lite re-renders when a caster's instances or the light change, and core flushes a kind only in a frame its instances change. The generator is never disabled (L3); a darkness of 1 builds none | CSM or ESM (ruled out by I0.5); a map re-rendered every frame (120 renders in 120 still frames) |
| 10 | **Options** | `post.taa`, `post.contact` and `post.ssgi`, off by default, with I0.8's settings (TAA factor 0.1 over 8 samples; contact 8 px, 12 steps, multiplied; SSGI 24 px rays, additive, fade 1e5–2e5, since its fade is a camera distance). **Their resolutions are core constants** (contact 1, SSGI 0.5), not scene fields: 2D.1 defines `post` as five booleans, so a resolution field is a change of the format | Resolution fields in `post`: a change of version 4 that the reference validator refuses today |
| 11 | **The budget rule** | A stage is on by default only if its task p95 at DPR 2 is about 2 ms or less and the look justifies it (I0.8). Measured costs are recorded per stage below; SMAA and bloom stay on, TAA, contact and SSGI stay options | — |
| 12 | **Compile gating** | Every task of the chain, the map's task, and the mask, glow and caps pipelines are created in the scene before it registers, so registration (`registerScene[WithShadowSupport]`: the frame graph's build and the async shader pipelines) prepares them inside item 1's build, under its gate and its 10 s deadline. Nothing is created after a scene's first frame, so the first frame of a new composition never waits on a chain pipeline | Build the chain lazily on the first frame: its pipelines would compile outside the gate and race a successor's 1.5 s deadline |
| 13 | **A stage that fails to build** | An optional stage (SMAA, bloom, TAA, contact, SSGI) whose task throws at creation is left out of the chain, reported as `failed` with its error in `state().instrument.post`, and the layer draws the rest. If registration itself fails while optional stages are on, core rebuilds the layer once with the target, mask, caps and composite only (loading the studio again: Lite attaches an environment to one scene, and the failed scene is disposed with it), and reports the stages as `failed` with the registration's error. Only a failed registration is rebuilt. The layer steps down to Relief with `post` or `compile`: `post` means exactly: the chain's target, mask or composite could not be built, or the minimal chain (the chain without its optional stages: the rebuild after a failed registration, or the first build when no optional stage is on) failed to register. Any other build error (a mesh, a shader material, the studio) stays `compile`. Either way the reason names the cause (the original error's message). A failed build is tied to the canvas size: after a resize or a DPR change it is tried again. GPU stays on in every case | Step the layer down whenever any stage fails: a lost SMAA would cost the whole Instrument look |
| 14 | **Timings** | Every task is named `instrument:<layer>:<stage>`; Lite's map task (named `shadow`, timed only on frames that render the map) is the layer's when it precedes the layer's `face` task. `instrumentGpuMs` stays the layer's total; `state().instrument.post` keeps p50 and p95 per stage over the last 256 frames | One sum per layer: the budget rule needs the stages apart |
| 15 | **Exposure and contrast** | After `loadHdrEnvironment`, core sets exposure 0.8, contrast 1.2 and tone mapping off explicitly (`INSTRUMENT_EXPOSURE`, `INSTRUMENT_CONTRAST`). They are the values Lite's loader sets as a side effect (`loader-hdr/load-hdr.js`, L2) and the values of the Rendering Model's 2D.5 output transform (exposure 0.8, gamma 2.2, contrast 1.2; 61 sampled points asserted at tolerance 16 since the calibration, #148), so the drawn result does not change and no longer depends on load order, and the model needs no new draft revision | Exposure 1 and contrast 1 (what core wrote before the load and the loader overwrote): a 13-level change on polished and chrome parts, and a model change |

## Diagnostics

`state().instrument.post`: per layer, each stage's status (`on`, `off`, `failed` with its error, or `idle` for bloom on a
frame with no lit lens), the map (`size`, `bias` in px and in Lite units, `darkness`, the depth window, `renders`: the
frames that re-rendered it by Lite's rule, `casters`), and per stage `{ lastMs, p50Ms, p95Ms, samples }` with the layer's
total; the shared targets (`width`, `height`, which are allocated). A layer that cannot build its target, mask or composite
lists its objects in `steppedDown` with the reason `post`.

## Verification (item 3)

- Unit: `tests/unit/instrument.unit.test.mjs` grows the pure parts (the bias conversion, the depth window, kind bounds,
  glow colours, the composite's rectangle).
- Browser: `tests/browser/core-post.test.mjs` on [`instrument-post-core.html`](../../examples/playground/instrument-post-core.html),
  DPR 1 and 2, headless, and a headful Canary check.
- Regression: `core-emitters`, `core-instrument`, `ui-gpu`, `ui-knob`, `ui-switch-forms`, the I0.5 and I0.8 probes and
  `ui-instrument-conformance`.

## Results (item 3)

Canary 158.0.8110.0, Windows 11, RTX 3080, 1920 × 1080,
[`instrument-post-core.html`](../../examples/playground/instrument-post-core.html): 250 controls on two overlapping panels
and six in a clipped viewport (a lit lamp straddling its edge), 247 visible text boxes (faceplate prints and captured key
labels), 16 visible thin plates and 14 visible bats; three Instrument layers, 662 + 88 + 16 drawn parts, 20 / 20 / 14 kinds.
Headless at DPR 1 and 2, and headful at DPR 1 (`--headed`, viewport emulated): every pixel number below is the same
headful and headless.

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| Text px differing, default chain against every stage off (no map) / every stage on / core's plain pass (lights off) | 0 / 0 / 0 of 67,700 | 0 / 0 / 0 of 274,432 |
| Changed px with the chain on (halos included) / outside their control | 303,411 / 0 | 1,090,733 / 0 |
| The same with every stage on (TAA, contact, SSGI too) | 313,796 / 0 | 1,107,084 / 0 |
| Lamp px drawn inside their boxes; the straddled lamp inside / past the viewport | 41,899; 1,688 / 0 | 63,979; 2,724 / 0 |
| Native hits on drawn px: mismatches; hit grid (1,536 points) chain on against off | 0 of 4,018; 0 differ | 0 of 4,014; 0 differ |
| Opacity 0.5 against the group blend: worst error, px over 1 level (61,239 / 251,115 px) | 1 level, 0 | 1 level, 0 |
| Map on against off (stages off): changed px / outside the parts / outside the controls | 11,818 / 0 / 0 | 46,313 / 0 / 0 |
| Thin plates' mapped shadow: components (8-neighbour), px each | 1 for all 16; 26–98 | 1 for all 16; 139–376 |
| Bats' plates shaded by lever and ball (14 bats), px each | 75–181 | 315–729 |
| Map renders over 120 drawn still frames (each layer) / per pose change | 0 / 1 (5 of 5, posed layer only) | 0 / 1 (5 of 5) |
| After a resize (1600 × 900) and a DPR change: targets, px outside | 1600 · dpr wide, 0; 3,840 at DPR 2, 0 after the change back | 3,200, 0; 1,920 at DPR 1, 0 |
| 300 frames of poses (each config): captures, uploads, geometry updates | 0, 0, 0 | 0, 0, 0 |

**Costs** (Lite task timings over 300 animated frames, 250 controls with knobs, faders and bats moving, so the map
re-renders every frame; per stage, the p50 / p95 of each layer summed over the three layers, ms; headless; the RTX
3080's demand-driven clocks make these upper bounds, and runs scatter by up to 2×):

| Stage | DPR 1 | DPR 2 |
| --- | --- | --- |
| Map (every frame, poses moving) | 0.64 / 1.40 | 0.49 / 0.69 |
| Face shadows | 0.07 / 0.12 | 0.17 / 0.46 |
| Mask | 0.01 / 0.02 | 0.02 / 0.03 |
| Parts | 0.98 / 3.32 | 1.01 / 1.38 |
| **SMAA** (default) | 0.56 / 1.48 | 1.37 / 1.55 |
| **Bloom** (emitter target and bloom, default) | 0.30 / 0.66 | 0.66 / 0.74 |
| Caps | 0.02 / 0.04 | 0.01 / 0.02 |
| Composite | 0.06 / 0.29 | 0.11 / 0.14 |
| TAA (option) | 0.53 / 0.60 | 1.02 / 1.07 |
| Contact shadows (option) | 0.76 / 0.93 | 1.57 / 1.59 |
| SSGI (option) | 0.50 / 0.59 | 0.89 / 0.92 |
| Layers' totals (default chain, p50 / p95 per layer) | 1.28 / 4.12, 0.89 / 2.18, 0.46 / 1.12 | 1.91 / 2.62, 1.16 / 1.34, 0.79 / 0.91 |

By the budget rule every stage fits (task p95 at DPR 2 at most 1.59 ms summed over three layers); SMAA and bloom stay on,
and TAA (it trails), contact shadows (barely visible head-on) and SSGI stay options for the look reasons I0.8 recorded.
Headful DPR 1 gave the same order (SMAA 0.53 / 1.49, bloom 0.28 / 0.68, contact 1.02 / 1.15).

**Starts:** 10 of 10 reached GPU with all three chains built while a successor composition joined during the builds
(`?race=1`, alternating DPR 1 and 2), ready in 1.34–1.69 s, each deferring one successor deadline; no fallback, no error.
**Failures:** with SMAA's creation failing (core's internal test hook) every layer reports `smaa: failed` with the error
and draws the rest (bloom on), GPU on; with the chain's target failing every layer is drawn at Relief with `post`, GPU on.
**Lifecycle:** with every instrument material cancelled the shared targets are released (none listed); after `disable`
there is no instrument state, and `enable` allocates them again.

**Regression** (after merging `main` at #148): `core-emitters` 6, `core-instrument` 7, `ui-gpu` 53, `ui-knob` 13,
`ui-switch-forms` 9, `ui-fader` 10, the I0.5 probe 2 and the I0.8 probe 6 (its headful test skipped, gated by
`CANVAS_HEADFUL_POST`), `ui-instrument-conformance` 2 and `core-post` 4: 112 passed. The conformance suite at DPR 1 and 2:
contained 22, sampled 61, presence 6, exact 46, unchanged 4, ratio 2, relief 6 passed, 0 failed; the shadow map's ratio
and presence checks, pending until this item, now pass and are asserted; only glass (item 4) stays pending.

**Found while building it** (recorded for the Lite requests):

- A surface render target's textures are replaced when the first scene re-records after a resize or DPR change, and an
  effect keeps the views it was given: the composite read a destroyed texture in a submit (`Destroyed texture
  "underglass-instrument:caps" used in a submit`) until core set its textures again from `onRenderTargetTextureResize`.
- A PCF generator's map texture (64 MB at 4,096²) has no public disposal; core destroys it through its internal
  `_depthTexture` when the scene goes.
- `loadHdrEnvironment` sets exposure 0.8 and contrast 1.2 (L2); core now sets them after the load.
- Playwright shoots at the context's scale whatever a CDP device-metrics override set, and a DPR changed through CDP
  reaches core's canvas only after a controller operation; the test checks pixels back at the context's DPR.

## Review fixes (item 3, 2026-10-18)

An independent review found no blocker. Its four should-fix items and the cheap nits are fixed here; each fix that changes
behaviour has a test that fails without it:

- **S1, the shared targets and builds in flight.** A layer that left while its scene was still building scheduled the
  targets' release; the build then allocated them again, or the release ran while the scene awaited its registration
  (Lite error 789, a failed build). Core now counts builds in flight and releases the targets only when no layer, no build
  and no registered scene is left, after every retired scene's fence; the check runs when a layer leaves, a build ends
  and a scene retires. Test: every instrument material cancelled 300, 600, 900, 1,200 and 1,500 ms after the page starts
  (`?dropAt`), while the scenes build: no target left, 0 failed builds, no WebGPU warning, GPU on. Before the fix the
  300 ms run had a failed build.
- **S2, the map's render counts.** `renders` is the controller's own flush count (it follows Lite's refresh rule: an
  estimate); `timedRenders` counts the frames in which Lite's timings saw the map task. Lite times a sample of frames, so
  the test now also checks that the still frames were timed (119 to 120 of 120 per layer) while no map pass was, and, as
  the positive control, that the timings saw the map render in 247 to 274 of 300 animated frames. A single pose change's
  render is seen or not (0 to 1 of 5): core reads the timings after its own frames, and a still page draws none after it.
- **S3, opacity.** Reworded (decision 6, the changeset, the API) and pinned: on 25,523 (DPR 1) and 101,883 (DPR 2) part
  pixels with face content under them, the result matches `0.5 P + 0.25 F + 0.25 B` within 1.25 levels (three 8-bit
  inputs and the canvas's own rounding of the faded face), and differs from true group opacity by up to 53 levels.
- **S4, the minimal rebuild.** Core's internal test hook can now fail a scene's registration. With the optional stages
  failing (`?failRegistration=optional`) every layer is rebuilt and draws, and SMAA and bloom read `failed` with
  `registration failed with the optional stages on: …`, GPU on. A failure of the minimal chain too
  (`?failRegistration=all`) is now the `post` step-down (it was `compile`), and once the failure stops a DPR change
  retries it and every layer draws (before, a failed build stayed failed for its structure). The retry loads the studio
  again (decision 13): reusing the first load would mean attaching one scene's environment to another, which Lite does
  not offer, and the failed scene's textures go with it.
- **N3.** A shadow map texture that cannot be released through Lite's internal field is counted
  (`state().instrument.resources.mapTextures.missing`) and warned once; the test asserts 0 missing and 104 released over
  its rebuilds.
- **N4.** A layer removed and added again beside two live layers: the targets stay, 0 px outside the controls, the same
  under reduced motion (30 still frames drawn), and the targets are released when the last layer leaves. A hidden tab is
  not tested (Playwright cannot hide a page reliably headless).
- **N1 and N2** are limits, recorded below and in SCOPE-009. Decision 9's bias formula now names the full depth span.

**Second review (2026-10-18).** No blocker; three should-fixes and nits, each fixed and, where a test is possible, tested
against the code without the fix:

- **The release waits for every fence.** It waited for the fences pending when it was scheduled, so a scene that retired
  while it waited (a layer added and removed again meanwhile) could be disposed after the targets it read. It now waits
  until no fence is left (`settledAll`, `instrument-post.ts`) and checks again that no layer, build or scene is left. A
  fence cannot be held from a browser test, so a unit test covers the loop: with fence A pending, fence B added, A settled,
  a snapshot of the set settles (the old behaviour) while `settledAll` waits for B.
- **`post` is defined exactly** (decision 13): `post` means exactly: the chain's target, mask or composite could not be built, or the minimal chain (the chain without its optional stages: the rebuild after a failed registration, or the first build when no optional stage is on) failed to register. Any other build error (a mesh, a shader material, the studio) stays `compile`. Either way the reason names the cause (the original error's message). Test: an ordinary error thrown in the minimal rebuild
  (`?failRegistration=optional&failBuild=minimal`) is `compile` with `the test hook fails the build of the minimal chain` in
  its reason (with the first review's wrapping restored, it read `post`); a registration failure of the minimal chain is
  `post`, naming the hook's error.
- **The in-flight case is deterministic:** core's `beforeBuild` hook holds a build (`?hold=1`) with its gate taken, every
  instrument material is cancelled while it is held, and the hold is released: the build runs to its end with no layer
  left, and no target, no failed build, no warning or error remains. With the first review's release logic undone (the
  release scheduled only when the layer leaves) it leaves the targets allocated. A run at 300 ms after the page starts
  stays as a second sample.
- **Nits:** the build hook runs inside the build's promise chain, so a hook that throws ends the build (and its count);
  the canvas size is read once per frame; the timed checks skip, with the reason recorded, when Lite's task timings are not
  available; the assertion that the faded face shows through says to delete it when true group opacity lands.

**Limits added by the review:**

- **A build that never settles** (a GPU hang inside its registration) keeps the shared targets allocated, since its scene
  may hold their handles, until device loss or `destroyGPU` disposes the controller. This is by design: the build's own
  10 s deadline steps its layer down, but the promise it is waiting on may never settle.

- **The map's texel grows with the stage** (Lite fits the map to the casters' box) while the bias stays 1.95 px: at
  3,840 × 2,160 CSS px a texel is about 1.1 px, and below about 38° of light elevation a stage that large may show acne on
  thin parts. Not measured; the default elevation is 41°.
- **`state().instrument.post.targets`** reports each shared target's last size: a target that no layer uses this frame
  is resized only when a scene records with it, so its size may be stale until then.

## Deviations from the draft (item 3)

- **Bloom's halo** is `max(B − E, 0)` with `E` the emitter target (the design language's and I0.8's form), not 2D.8's
  `max(bloom − parts.rgb, 0)`: over a neighbouring part the model would hide the halo where the part is brighter.
- **Captured caps** are laid over the parts inside the composite rather than drawn onto the canvas after it: the same
  colour at opacity 1 (a covered cap pixel is its texel), and group opacity in between.
- **Group opacity** is the meshes' group over the layer's already faded face, `α · P + (1 − α) · (α · F + (1 − α) · B)` under
  an opaque part, not the layer's true group opacity `α · P + (1 − α) · B` (the layer pass fades the face before the
  composite). The browser test pins the implemented formula over face content (within 1.25 levels) and that it differs
  from true group opacity (by up to 53 levels). True group opacity is a follow-up (SCOPE-009), a candidate for item 4.
- **Post resolutions** are core constants, not scene fields.
- **The map's depth window** is fitted to the stage by a power-of-two bucket (at least 4,096 px half-depth), checked every
  frame, rather than refitted each frame: Lite fixes the window when the generator is created.

# Core work item 4: the capture probe and glass

**Status:** design note for [core work item 4](instrument.md#core-work-additive), written before the code (2026-10-18),
then implemented in the same PR ([results](#results-item-4)). One concern: **the capture probe** (the layer's own capture, plus the
studio, as a reflection source for Lite's PBR parts) and **the glass material** (`glass: "lens" | "window"` parts, which
items 1 to 3 validated and did not draw). Not in it: custom parts (item 5), the Strata helper's wiring, and true group
opacity (assessed below, left in SCOPE-009).

**Upstream check (2026-10-18):**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit (`gh api
  repos/WICG/html-in-canvas/commits`, 2026-10-18). Nothing new since item 3: #186 (rotated `canvasClip` hit testing) and
  #185 are still open, #162 and #155 closed on 2026-10-15 without a commit. None touches this work: glass and the probe
  read the layer's capture texture that core already uploads with `drawElementImageToTexture`, and change no capture, hit
  geometry or admission.
- **Chromium hotlist 6783002** (including the ElementCanvasTransform issues): not accessible without sign-in; not
  rechecked.
- **Browser tested:** Chrome Canary 158.0.8110.0, Windows 11, RTX 3080 (as items 1 to 3). The glass and the probe are
  proved on the installed build by decoded pixels (refraction displaces a known pattern, text under a window is exact,
  the probe changes a reflection when the capture changes) and native-hit probes, not by property presence.

## What I0.4 and the I1 prototype proved and what core adds

[I0.4](instrument-phase0.md#i04-materials-over-the-capture) filled a cube texture from a layer's capture on the GPU
(512², 10 blur mips, captured 300 px in front of the face), bound it to the PBR parts with `setPbrLocalEnvironment` and
refreshed it on capture only (1.07 to 1.72 ms GPU per refresh). The
[I1 second iteration](instrument-phase0.md#the-glass-construction) drew glass as a `ShaderMaterial` that loads the capture
per pixel and traces the reflection analytically, because Lite 1.33's transmission fails in a layer scene (L6: 18
validation warnings, a swapchain clear, a fixed 1024² grab that would blur text) and its shader materials bind 2D
textures only (L12), so a glass shader cannot sample a cube. The Rendering Model already defines both: 2D.6 gives glass
exactly (a lens refracts in and out through its flat bottom, a window shifts the capture against a flat pane, both add the
traced Fresnel reflection), and 2D.5 gives the `page` cube for PBR parts. The reference implementation (`glassSample`,
`partColour`) and the suite's `glass` case exist and were pending on core. Core now draws both.

## The two constructions, and why the plan's "one cube per layer" splits in two

The plan said glass would sample a local capture cube per layer. Lite 1.33 cannot bind a cube in a custom shader (L12), and
the model (2D.6, last bullet) says the page cube is not used for glass: the reflected ray is traced to the face, which is
exact where a prefiltered cube is not. So:

| Surface | Draws with | Sees |
| --- | --- | --- |
| Lite PBR parts (metal, lacquer, coats) | Lite's PBR, with the layer's **page cube** through `setPbrLocalEnvironment` | The studio, and the faceplate print and neighbouring controls where a reflected ray meets the face |
| Glass parts | A **custom WGSL shader** (`ShaderMaterial`) that loads the layer's capture texture per pixel | Refraction of the capture, the traced reflection of the studio (analytic in the shader), the part's `stand` and the face |

Both read the one capture texture of the layer (no new capture, no clone of anything). The probe is the "capture probe" the
plan names; the glass shader is the "capture-refraction shader".

## API

Nothing new to call. The scene's existing fields now draw:

| Field | Core |
| --- | --- |
| `parts[].glass: "lens" \| "window"`, `stand`, `finish` | Drawn by the glass shader (2D.6) |
| `materials[].glass` (`ior`, `tint`, `absorption`, `reflection`), `materials[].dispersion` | The shader's constants |
| `environment.page` (`enabled`, `size`, `height`) | The page cube of PBR parts; absent or `enabled: true` builds it (the model's default); `enabled: false` leaves the studio alone |
| `emitter` on a glass part | The lens glows through its glass while its emitter is lit |

`finish: true` on a window now means the defaults `{ band: 0.3, horizon: 0.25 }` (the reference, which drew nothing for
`true`, follows; no suite scene uses it). Diagnostics grow by `state().instrument.layers[].probe` and `.glass`, and
`state().instrument.probes` (below).

**A scene without `environment.page` now builds a probe** (the model's default is on): every Instrument layer reflects its
page in its metals unless its scene says `page: { enabled: false }`. The cost is below.

## The capture probe

**What it is.** A cube texture per layer (`rgba16float`, `page.size` texels per face, default 512, a full mip chain),
filled on the GPU from the layer's capture. Lite binds its view directly as the specular environment of the layer's PBR
materials with box projection (`enablePbrLocalCubemap`, `setPbrLocalEnvironment`), so refreshing its texels updates
every material with no rebuild. Irradiance, the BRDF table and the sampler are the studio's, so the diffuse term and the
calibration of 2D.5 do not change.

**Which faces come from what.** All six faces are filled by the same pass. From the capture point (the layer's centre at
build time, `page.height` px in front of the face plane, default 300), a texel's direction either leaves the projection box
through its back wall, the face plane, inside the layer's extent, where the cube holds the captured colour (decoded to
linear, weighted by the capture's alpha), or leaves anywhere else, where it holds the **studio** at that direction (the
box's other walls are 50,000 px away, so the studio stays at infinity). Looking straight at the face the +z face is mostly
capture; the side faces hold the capture towards the layer's edges and the studio beyond it. Mips 1 and up are a Gaussian
blur chain in direction space (5 × 5 taps about one texel wide), so rough materials see a blurred page.

**When it refreshes: not every frame, and not at the pace a layer moves.** The probe is rebuilt only when (a) the layer's
capture was uploaded again (the renderer's per-layer upload counter changed) or (b) the capture texture was replaced (a
resize or DPR change): both at once, one refresh per upload; or (c) the layer's **placement** changed (its similarity matrix
or the stage): Lite fixes the projection box when the scene registers, so the cube's content, not the box, follows a layer
that moves (a scroll). (c) is not in the plan; without it a moved layer would reflect a page it no longer shows. **Its rule
(review fix S1):** the placement is quantised to a quarter of the cube's texel footprint (`2 · height / size / 4`, 0.29 px at
the defaults; a sub-texel move is invisible after the mip blur), and a placement refresh happens at most once per 100 ms
while the layer keeps moving (a resize or a DPR change changes the key too, through the stage and the content size, and is
throttled the same way unless it replaces the capture texture, which refreshes at once), with a trailing refresh (a timer asks for a frame) once it settles, so a scrolling layer costs
about 10 refreshes a second however fast it moves, and its reflection lags by at most 100 ms. A pose, a pointer light, an
emitter write or any number of idle frames refresh nothing.

**Budget and degradation.**

- GPU memory: `size² · 8 B · 6 · 4/3` (16.8 MB at 512²). **At most 4 probes per stage** (`INSTRUMENT_PROBES_PER_STAGE`):
  the fifth and later layers keep the studio alone, reported with `reason: "budget"`.
- GPU time per refresh is measured with timestamp queries (below). A refresh is one command buffer of `6 · mips`
  small passes.
- If the probe cannot be built (the device refuses the texture, a shader fails, the test hook), the layer builds without it:
  PBR parts reflect the studio alone, glass is unaffected (it traces the face itself), GPU stays on, and
  `layers[].probe` reads `{ status: "failed", error }`. A refresh that throws turns the probe off the same way.

## The glass shader

**Placement in the chain.** Glass is drawn in the `parts` task of the layer's scene, into the same offscreen mesh target as
the PBR parts, so SMAA, bloom and the clipped composite apply and the group opacity rule of item 3 holds. It is a
`ShaderMaterial` with premultiplied source-over blending, **depth-tested against the opaque parts and not written**
(back faces culled: a lens and a window are convex, so there is one front face per pixel, and the composite and SMAA see
a coverage edge). Glass does not cast into the shadow map (it transmits) and is not a map receiver; it casts onto the face
like any part unless its `caster` is `null` (2D.7: the suite's glass sets `caster: null`; the previous exclusion of glass
casters is dropped).

**Per pixel** (layer axes: x right, y down, z up; `d` from the camera `C` to the surface point `X`, `n` turned towards the
viewer): exactly 2D.6. A **lens**: Snell in at the dome, down to its flat bottom at the part's base height, out (total
internal reflection on the green channel gives the dark rim `(0.015, 0.015, 0.018)`), onto the face, one index per channel
(`ior − Δ`, `ior`, `ior + Δ`, `Δ = 0.1 · dispersion.strength`: dispersion costs two extra capture reads, nothing else),
absorbed along the path by `exp(−(1 − tint) · absorption · ℓ)`, then `(1 − Fr) T + Fr · strength · reflection · R` encoded
with the sRGB curve. A **window**: the capture shifted by the difference between the refracted ray through the real normal
and through a flat pane, Fresnel beyond the flat pane's, absorption through 12 px · `(1 − n.z)`, the studio/stand/face
reflection mixed in by that Fresnel, and the finish zone. `R` is traced: the studio is evaluated from its definition
(2D.5, constants as uniforms), the stand and the face by intersecting the reflected ray. `C`, `X` and `n` are rebuilt in
layer axes from the interpolated world position and normal and the layer's similarity (a uniform), so a layer scaled,
rotated or moved draws the same glass.

**Text under a window is exact.** Inside the scene's protected rects grown by 2 px (read from the guard buffer the face
shadows already use), and wherever a window is flat outside its finish zone, the pixel is the capture texel. SMAA would
filter that texel against its neighbours (it detects the glyph edges), so those pixels are **also drawn into the caps
target** by a second, exact-only twin of the window (the same instances, discarding everywhere else), which the composite
lays over the chain's result like a captured cap. The chain therefore never touches text under glass, and a part in front
of the window (the caps test their depth against the parts) still hides it.

**Emitters.** A glass part with an `emitter` is a lens like any other: its glow copy feeds bloom while the emitter is lit,
and the glass adds the glow colour inside itself (the lamp glows through its dome). Clustered lights do not light glass
(it has no diffuse term); the face pool still lights the face around it.

**Fallback.** If the glass material cannot be built (its shader or storage), the glass kinds are left out and the layer
draws everything else; the face shows through (a lens disappears, a window is the plain capture, text exact), GPU stays
on, and `layers[].glass` reads `{ status: "fallback", error }`. A shader that fails at registration is the layer's
existing `compile` step-down, as any shader.

## Decisions (item 4)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | **Glass construction** | A custom WGSL shader that traces 2D.6, per pixel, with the capture loaded as a texture | Lite's transmission (L6: validation failures, a swapchain clear, a 1024² grab); a cube sampled for the reflection (L12: not bindable) |
| 2 | **The capture probe's job** | The page cube of PBR parts (metals, coats, lacquer), box-projected, filled from the capture and the studio | One cube for glass and metal alike: glass cannot bind it; the model traces glass reflections exactly |
| 3 | **Probe refresh** | At once on a capture upload or texture replacement; on a placement change (quantised to a quarter texel) at most once per 100 ms with a trailing refresh; nothing else | Every frame (frame work p50 9.0 against 5.3 ms in I0.4); only on capture (a scrolled layer would reflect a stale page) |
| 4 | **Probe anchor** | The layer's centre at build time; the cube's content follows the layer's current placement | A box rebuilt on every move (`rebuildMaterial` per frame); a canvas-centred anchor (poor resolution for off-centre layers) |
| 5 | **Probe budget** | 4 per stage at 16.8 MB each at 512²; the rest studio-only with a reported reason | Unbounded (a stage of many layers would hold hundreds of MB) |
| 6 | **Degradation** | Probe failure: studio-only reflections. Glass failure: glass left out, face shows through. Both reported; GPU on | Step the layer down to Relief (loses every part for a reflection) |
| 7 | **Glass in the chain** | The mesh target, transparent, depth-tested and not depth-written, premultiplied; the chain applies | Its own target after the chain (no SMAA on its edges); a depth-writing opaque pass (the exact twin would z-fight) |
| 8 | **Text under windows** | Exact by an exact-only twin drawn into the caps target, so SMAA never reaches it (2D.9 rule 7) | Trust that SMAA leaves flat text alone (it does not: glyph edges are what it detects) |
| 9 | **Shadow map** | Glass neither casts into nor receives from the map | Glass in the map (the shader material has no depth caster in Lite 1.33; a lens would shade its stand) |
| 10 | **Glass roughness** | Not drawn. 2D.6 defines clear glass (the recipe's `base.roughness` is ignored for glass) | A blurred refraction (needs a mip chain of the capture, which the layer texture does not have) |
| 11 | **Group opacity (SCOPE-009)** | Not done; assessment below | Composite the face inside the chain |

## True group opacity: assessed, not done

Item 3's composite is `α · [caps + (1 − caps.a)(parts + halo) M]` over a canvas on which the layer's own pass already drew
the face at opacity `α`. True group opacity, `α · (P + (1 − P.a) F) + (1 − α) B`, needs the face inside the group: the
layer's pass would draw into an offscreen target at full opacity and the composite would blend that target, parts and all.
The capture probe does not help (it concerns reflections, not the face's draw path); glass makes the gap larger, since a
window replaces the face under it with the capture at `α` while the face beneath it was already faded. The change touches
`renderer.ts`'s layer pass (a new target per layer, the face pool, the emitter pools, hit-geometry-neutral but every
relief layer shares the path), not a contained change of this PR. It stays in SCOPE-009, with this note.

## Verification (item 4)

- Unit: `tests/unit/instrument-glass.unit.test.mjs` (pure helpers: kind keys, the glass uniforms, per-instance data, probe
  settings and refresh key, the studio constants against the reference).
- Browser: `tests/browser/core-glass.test.mjs` on [`instrument-glass-core.html`](../../examples/playground/instrument-glass-core.html),
  DPR 1 and 2, headless, and a headful Canary pass; `ui-instrument-conformance` asserts the glass checks.
- Regression: `core-instrument`, `core-post`, `core-emitters`, `ui-gpu`, `ui-knob`, `ui-switch-forms-instrument`.

## Results (item 4)

Canary 158.0.8110.0, Windows 11, RTX 3080, 1920 × 1080, [`instrument-glass-core.html`](../../examples/playground/instrument-glass-core.html):
one panel, 7 objects and 12 parts in 10 kinds (a display window over stripes and text, three glass lens knobs over printed
target rings, a chrome knob, a glass plate over a checkerboard, a lamp with a glass lens), headless at DPR 1 and 2 and
headful (`--headed`, viewport emulated) at both: every number below passed the same headful. GPU on and nothing stepped down
throughout.

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| Printed ring's radius along a diagonal, on the face / through the clear lens (nominal 9.5 px) | 8 / 13 px (×1.63) | 7.5 / 12.5 px (×1.67) |
| Pixels differing from the same parts as an opaque lacquer: lens knobs / plate / display / lamp | 17.5 to 18.0% / 90.6% / 89.2% / 28.7% | 17.3 to 17.7% / 90.6% / 89.2% / 27.7% |
| Lens rim (r 17 to 22 px) mean luminance, reflection on / off | 182.7 / 167.5 (+15.2) | 185.6 / 171.0 (+14.6) |
| Lens centre (r < 6 px), reflection on / off | 103.7 / 91.0 (+12.7) | 116.6 / 104.7 (+11.9) |
| **Fresnel edge brighter than the centre** (rim minus centre, levels) | 79.0 | 69.0 |
| Share of the lens changed by the reflection | 96.6% | 96.1% |
| A window's flat region against the layer without objects: px mismatched | 0 of 5,550 | 0 of 22,800 |
| A window's bevel (3 to 6 px in): mean luminance change | 29.9 | 25.8 |
| **Text under the display window against the layer without objects**: px mismatched | **0 of 12,960** | **0 of 51,840** |
| Display text contrast through the glass | 10.94 : 1 | 12.04 : 1 |
| Prints beside the glass (9 text boxes), lamp and shadows on: largest change | 0 levels | 0 levels |
| A lit lamp's glass against unlit (mean luminance of its centre) | 254.1 / 213.7 | 254.4 / 213.7 |
| Parts on against off: px changed / outside every control's box | 25,000 / 0 | 98,064 / 0 |
| Native hits on drawn px (sampled): mismatches | 0 of 260 | 0 of 1,013 |
| Chrome knob, page probe on against studio alone: px differing / the stripes (a face) | 3,821 of 10,000 / 0 | 15,020 of 40,000 / 0 |
| 300 frames, pointer moving and a knob posed: captures, uploads, geometry updates, probe refreshes | 0, 0, 0, 0 (300 frames drawn) | 0, 0, 0, 0 (300) |
| Typing into the display: uploads / probe refreshes | 1 / 1 | 1 / 1 |
| Moving the layer once: probe refreshes (within 300 ms) | 1 | 1 |

The lens knobs differ from the lacquer by about 18% of their box because the lens fills 46 of 100 px; the plate and the
display differ almost entirely, since the lacquer hides the capture.

**Conformance** (`ui-instrument-conformance`, DPR 1 and 2): every check is asserted and passes, none is pending: contained
22, sampled 65 (61 + the glass case's 4; median 1, 95th percentile 5, maximum 16, unchanged), presence 9, exact 50,
unchanged 4, ratio 2, relief 6. The glass case: text under the window, the second text run and the flat region at 0 levels;
the lens's centre (the hub magnified), its domes on both sides and the polished stand's reflection at 0 or 1 level; the finish
band changes 0.55 of the window's pixels (0.11 required), dispersion 0.12 at DPR 1 and 0.08 at DPR 2 of the lens (0.04) and
the lens's reflection 0.26 (0.14). No calibration was needed: core's shader is the reference's computation, and the model's
sampled tolerance stays 16.

**Costs** (Lite task timings over 300 frames with a lens knob posed every third frame, so the map re-renders; p50 / p95 per
stage, ms; headless; the RTX 3080's clocks are demand-driven, so these are upper bounds and runs scatter by up to 2×):

| Stage | DPR 1 glass | DPR 1 the same parts as lacquer | DPR 1 no page probe | DPR 2 glass | DPR 2 lacquer | DPR 2 no probe |
| --- | --- | --- | --- | --- | --- | --- |
| Parts (glass drawn here) | 2.00 / 2.02 | 2.33 / 2.36 | 1.96 / 2.03 | 0.64 / 1.39 | 0.89 / 1.67 | 0.67 / 1.47 |
| Caps (the windows' exact twins) | 0.06 / 0.06 | none | 0.06 / 0.06 | 0.05 / 0.05 | none | 0.05 / 0.05 |
| SMAA | 1.09 / 1.11 | 1.07 / 1.08 | 1.09 / 1.10 | 1.86 / 1.91 | 1.84 / 1.88 | 1.86 / 1.91 |
| Composite | 0.14 / 0.14 | 0.12 / 0.12 | 0.14 / 0.14 | 0.18 / 0.18 | 0.16 / 0.17 | 0.18 / 0.18 |
| Layer total | 3.32 / 4.11 | 3.55 / 4.68 | 3.32 / 4.12 | 2.79 / 3.77 | 2.94 / 4.32 | 2.83 / 4.04 |

Glass costs nothing measurable beyond the PBR it replaces (its parts stage is the same or smaller, its twins 0.05 to
0.06 ms), and a probe adds nothing to a frame that does not refresh it. **The probe's own cost:** its first refresh was 0.50
ms (cold clocks); over 21 refreshes, 1.97 ms p50 and 3.41 p95 at DPR 1 and 1.04 / 1.12 at DPR 2 (the cube is the same
size at both); a layer's first build was 221 to 222 ms, and rebuilds took 37 to 40 ms with a probe against 20 to 32 ms
without (the cube, its 60 passes' bind groups and the error-scope round trip; not broken down). By the budget rule (a
stage is on by default only at about 2 ms task p95 at DPR 2 or less) the probe fits: it costs a refresh, not a frame, and
a refresh is one command buffer. A layer that keeps moving refreshes at most every 100 ms (review fix S1: 60 frames of movement
over 1.05 s took 10 refreshes, bound 11, at DPR 1 and 2, where the first version took 60); about 1 to 2 ms GPU each.

**Failures:** with `?failProbe=1` (core's internal test hook) the layer reports `probe: failed` with the hook's reason, holds
no probe, draws its glass as before (0 pixels of the lens differ from a page-off render) and its chrome knob exactly as a
page-off render; with `?failGlass=1` it reports `glass: fallback`, the glass parts are left out, the display's text and the
plate's region equal the layer without objects, and the probe is unaffected. GPU on in both. An invalid probe (a texture the
device refuses) is caught with validation and out-of-memory error scopes at build; the unit tests cover the settings, the
budget and the refresh key.

**Regression** (the same code): `core-instrument` 7, `core-emitters` 6, `core-post` 4 and `core-post-lifecycle` 3, `ui-gpu` 53,
`ui-knob` 13, `ui-switch-forms` 9, `ui-fader` 14, `ui-instrument-conformance` 2 and `core-glass` 4 passed; `npm run test:unit`
(7 new tests) passed.

**Found while building it** (recorded for the Lite requests, L34 and L35):

- Lite binds a local environment's projection at registration and offers no call to update it, so a layer that moves keeps
  its box and the cube's content follows the layer instead (decision 3).
- WebGPU buffer and texture usage flags are different enums with the same names; a `MapWrite | Uniform` buffer failed with a
  validation error that the probe's error scopes caught and reported as `probe: failed` (the diagnosis path worked the
  first time it was exercised).
- A finish, a stand or an emitter changes with the same layout, so the glass's per-instance data is compared every frame and
  written when it changes; writing it only when an object moved left a changed `finish` stale (found by the suite's
  `no-band` variant).
- A range input's `value` repaints, so a test that posed a knob through the DOM recaptured the panel 100 times in 300 frames
  (and the probe refreshed exactly once per upload); poses go through the scene's `t`, as core's other pages do.

## Review notes and limits (item 4)

- **`core-post` runs with the default probe** (review fix S2, below): its two assertions that the probe disturbed were wrong
  measures, not product defects, and were corrected.
- **The page probe's look is not in the model's reference** (2D.5 reflects the page by presence only; the suite's scenes turn it
  off). Its colour is Lite's and the blur chain's; it is not calibrated.
- **Glass over a transparent capture** takes the capture's alpha (the premultiplied result with the capture's alpha at the
  green channel's read): a lens over empty space shows its reflection only. Faceplates are opaque, so this is not measured.
- **At a fractional opacity** glass takes item 3's group blend; a window then shows the capture at `α` over a face already
  faded at `α` (SCOPE-009).
- **Caps behind glass:** captured caps are composited last, so a key behind a window shows over it.
- **The window's exact twin** discards everywhere the window is not exact, at a cost of the window's pixels in the caps task
  (0.05 to 0.06 ms for two windows); a window with no protected rects and no flat region has none to draw.
- **The probe's resolution** is uniform on the face plane only within `page.height` px of its anchor (the +z face); farther
  or at grazing angles it is coarse (up to about 13 px per texel at 1,000 px) and blurred by the mip chain.

## Deviations from the draft (item 4)

- **The plan's "local capture cube per layer" feeds the PBR parts, not the glass.** Glass traces its reflection (2D.6) and
  loads the capture directly, because Lite 1.33's shader materials cannot bind a cube (L12) and the model says the page cube is
  not used for glass; the plan's sentence predates the model's glass.
- **The probe also refreshes when the layer moves** (the plan said only when the capture refreshes): Lite fixes the box at
  registration (L34).
- **Glass casts on the face by default** (2D.7: a part casts unless `caster` is `null`); item 1 had excluded glass because it
  was not drawn. It does not enter the shadow map (a shader material has no depth caster in Lite 1.33).
- **`finish: true` on a window** is the zone with its defaults, in core and in the reference.
- **Glass roughness is not drawn** (the brief asked for it; 2D.6 defines clear glass and a blurred refraction needs a mip
  chain of the capture, which the layer's texture does not have).
- **The probe's default is on** for scenes that omit `environment.page`, as 2D.5 says; no existing scene opted in.

## Review fixes (item 4, 2026-10-18)

An independent review found no blocker. Its four should-fix items and the cheap nits are fixed, each with a test that fails
without the fix where a test is possible (before / after on the same page, Canary 158.0.8110.0):

- **S1, the probe refreshed on every frame a layer moved.** The placement key is quantised to a quarter of the cube's texel
  footprint and a placement refresh is throttled to once per 100 ms with a trailing refresh (rule above). Test (`core-glass`,
  DPR 1 and 2): 60 frames of movement over about 1.05 s, **60 refreshes before, 10 after, against the bound
  `floor(elapsed / 100) + 1` = 11**; nothing refreshes once it settles, and the dragged panel's chrome knob equals a fresh
  build at the same place (0 of 10,000 / 40,000 pixels differ; the test allows 2 levels for a sub-quantum difference).
- **S2, the `core-post` change was unverified.** The override is reverted (the post chain is tested with the default probe).
  The experiment (`core-post`, DPR 2, probe on) printed the three offending pixels, all interior part pixels with their four
  neighbours part pixels (not silhouette edges): parts with the map (224,226,229), (225,226,229) and (225,226,229) equal the
  face's colour exactly, while the map-off render reads (224,226,230), (226,227,230) and (226,227,231), one level off the
  face: a polished part reflecting the light face. Two takes of the parts render differ in 0 pixels (deterministic), and with
  `?fail=probe` (no probe anywhere; a new hook in the page) the map assertion passes (the run failed only on the hook's own
  logged errors). So the map changes no face pixel: the test's proxy (a changed pixel counts as a face pixel when the map-on
  render equals the face) was wrong for parts whose colour meets the face's, and so was the first replacement (map-off equals
  the face: two pixels met it the other way round). A changed pixel now counts as a face pixel only where the parts' coverage
  mask shows the face, the mask being the same parts lit by nothing (no key light, no environment: near black, never the
  face's colour; `setDark` in the page), so the post chain keeps covering PBR parts with the default probe under SMAA, bloom
  and the clip mask. The same run showed the "one connected component" check failing with the probe on (the first reading, that the probe weakens
  the band, is corrected below): the "one connected component" check, which counts
  pixels the map darkens by at least 6 levels, found 4 components at DPR 2 (159, 15, 4 and 2 pixels) and one with a threshold
  of 2: the threshold is now 3 for that check (see the second review below for the strength check). The post chain's page: the override
  `page: { enabled: false }` is reverted.
- **S3, a resize and a DPR change mid-run.** `core-glass` resizes the viewport (1600 × 900) and changes the emulated DPR and
  back: GPU on, the probe refreshed (a resize or a DPR change changes the key or the texture), text under the window 0 pixels
  mismatched against the layer without objects after each, no page error and no warning but Chromium's powerPreference one.
- **S4, a translucent texel was composited twice at an exact pixel.** The main shader drew it and so did the exact twin
  (`caps + (1 − caps.a) · parts`). The main shader now discards at exact pixels, and the twin draws only opaque texels
  (alpha at least 0.999): a translucent texel is already on the face (the layer's pass drew the capture over what lies
  beneath), so nothing more is composited there. Test (a faceplate, stripes and display field with alpha below 1): text and
  field under the window against the layer without objects, **11,640 of 12,960 pixels mismatched (up to 19 levels) before, 0
  after** at DPR 1; 45,957 of 51,840 before, 0 after at DPR 2.
- **N2:** the timestamp read's callback returns when the probe was disposed in between, and a failed read is caught (no
  unhandled rejection). **N3:** a refresh that throws sets the layer's `probeOff`, which changes its structure: the scene is
  rebuilt without the probe, the cube is released (it cannot be destroyed under live materials) and the budget slot is free,
  since the budget is counted from the other layers' passes at each build, not kept. Test (a test hook that fails a refresh):
  status `failed` with the reason, 0 probes, 0 bytes, glass on, GPU on; before, the status stayed `on`.
  **N5:** a glass kind left out by the fallback casts no face shadow (test with `?failGlass=1` and casters on: 2,060 pixels
  around the plate differed before, 0 after). **N8:** the retext assertion allows coalesced uploads (1 to the uploads' count).
- **N9, the Fresnel control.** With an index of 1 (F0 = 0, only Schlick's angle term left) the reflection adds 0 at the lens
  centre and 7.1 (DPR 1) and 6.9 (DPR 2) levels at its rim: the rim gains at least 3 times the centre, the Fresnel edge on its
  own (asserted). With an index of 1.5 the rim is only 1.2 times the centre (15.2 against 12.7 levels), not 3: the centre also
  reflects, F0 = 4% of a bright studio (its ceiling and strip) times the recipe's 1.5, so the glass's edge is brighter than its
  centre mainly by what it refracts and sees (the stand: 79 levels), and the angle term adds the rest.
- **Limits recorded (N1, N4, N6, N7)** in SCOPE-009 and here:
  - **N1:** the probe's error scopes stay open across an await (safe because builds are serialised).
  - **N4:** a GPU error during a refresh is not diagnosed.
  - **N6:** `glassInstance` and `partCaster` run for every glass part on every frame and compare the result with the instance
    data buffer, allocating per part, so a layer with many glass parts pays a per-frame CPU cost growing with their number (not
    measured beyond the fixture; fix later by running them only when the part's data changed).
  - **N7:** the probe samples the layer's capture with hardware bilinear filtering on straight-alpha texels, so colour bleeds
    dark at alpha edges and at the content edge of a retained texture larger than the content (the cube's mips blur it; low
    impact).
  The probe's lag while a layer moves (up to 100 ms and a quarter texel, S1) and the exact twin's opaque-only texel (S4) are
  consequences of those fixes, described in their own bullets above, not N6 or N7.

## Second review fixes (item 4, 2026-10-18)

- **N6 and N7** are recorded as the review found them (see the first review's limits bullet). The probe's lag during movement
  and the exact twin's opaque-only texel stay consequences of S1 and S4.
- **Translucent texels under a window.** `windowExact` covers the whole flat region; opaque texels are drawn by the twin, and
  translucent ones (alpha below 1) by neither shader, so they come from the face pass and the chain. Test (`core-glass`, DPR 1
  and 2): a translucent faceplate, stripes and field with the default chain on (the map, SMAA, bloom) and the lamp's light on:
  text under the window against the layer without objects, **0 of 12,960 and 0 of 51,840 pixels differ**. The wording is now
  "exact against SMAA for opaque capture texels; translucent texels follow the face pass" (changeset, API, SCOPE-009).
- **The map's depth with the probe on and off** (`core-post`, `?page=off` for the studio alone; the largest luminance drop the
  map makes in each band, in the test's luminance units): thin plinths 13 to 41 (DPR 1) and 27 to 42 (DPR 2) with the probe on,
  14 to 41 and 28 to 42 off; bats' plates 40 to 46 on and 39 to 47 off at both. The probe moves a band's depth by a few levels
  in either direction (plinth by plinth: 31/33, 13/14, 15/16, 18/19, 21/22, 38/39, 25/27, 27/27, 31/30, 34/31, 32/32, 39/37,
  34/33, 22/24, 34/36, 41/41 at DPR 1), and the plinths' mean luminance is about 13 higher with it (385 against 372). So the
  review's hypothesis, that the page's reflection is not occluded by the map and so weakens the band, is **not supported as
  a cause of a weaker band**: the depth does not fall systematically. (By construction the map scales the key term only, as
  2D.5 says, so neither the studio's nor the page's reflection is shadowed; that is behaviour, and the page adds light the
  map does not touch, but the measured band is as deep.) What the probe changes is a plinth's penumbra: pixels there fall a few
  levels under the 6-level threshold of the connectedness check, which is why the check now uses 3. The strength is asserted
  separately: each thin plinth's depth is at least 10 levels and each bat's plate at least 35 (the probe-on minimums are 13
  and 40, less a margin). My earlier explanation (the output transform compresses levels near white) was a guess and is
  withdrawn.
- **Nits:** a retired scene clears its probe's throttle timer (no stray frame request); the unit test checks both sides of a
  bucket edge of the placement key; resize and DPR changes are documented as going through the throttle (above).

# Core work item 5: custom parts

**Status:** design note for [core work item 5](instrument.md#core-work-additive), written before the code (2026-10-18), then
implemented in the same PR (results follow it). One concern: **custom parts in core's instrument scene format**,
validated, contained and budgeted like the parametric ones. Item 4 (the capture probe and glass) merged while this was
being written, and the work was merged onto it: a custom part may be glass (below). Not in it: the helper-side anchor fitting of the design language (`fitCustomPart`, below), textures, animation, skinning, and the
Strata components' use of custom parts (the helper only gains the ability to declare one, with one playground example).

**Upstream check (2026-10-18):**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit (`gh api`,
  2026-10-18). Open and recently touched: [#186](https://github.com/WICG/html-in-canvas/issues/186) (2026-10-14) and
  [#185](https://github.com/WICG/html-in-canvas/issues/185) (2026-10-13). Neither touches this work: custom parts are
  decoration drawn by the mesh pass and change no capture, hit geometry or admission.
- **Chromium hotlist 6783002** (including the ElementCanvasTransform issues): not accessible without sign-in; not
  rechecked.
- **Browser tested:** Chrome Canary 158.0.8110.0, Windows 11, RTX 3080 (as items 1 to 3). Headful passes are named in the
  results.

## What the plan fixed and what this note decides

The plan ([decision 6](instrument.md#rendering-decisions), [Core work 5](instrument.md#core-work-additive)) says: a glTF for
a named part, fitted to documented anchors (base, pivot, cap, pointer, travel axis) and checked against `bounds`; core never
fetches at render time, the helper loads and hands core mesh data. The design language adds: a custom part carries no
captured content, counts as one part kind in the budgets and takes its material from its role; a part that fails the
check is not drawn. Rendering Model 2D.2 lists the `mesh` profile (`positions`, `normals`, `indices`, optional `uvs`) and a
`custom` kind with `anchors`, and says the triangles are the part.

This item keeps the model's two names (`custom` kind, `mesh` profile) and the rule that the triangles are the part. It
deviates from the plan in two places, on the brief's instruction, and says so: **core loads** (asynchronously, never in a
frame: see [Loading](#loading)), and **anchor fitting is not core's**: a custom part is placed in the same part-local px
as every profile, with a uniform `scale` and an `offset` on a glTF reference as the fit. A helper that wants the anchors
computes them and passes inline data, or `scale` and `offset` (the helper's `customPart` takes them).

## The format

A profile of `type: "mesh"` in `profiles`, in one of two forms, in part-local px (x right, y down, z up from the face, the
origin at the centre of the part's base: the axes of every profile):

| Field | Inline | Reference | Meaning |
| --- | --- | --- | --- |
| `positions` | required | none | Flat `x, y, z` numbers (an array or a typed array) |
| `normals` | required, or `"compute"` | none | Flat vectors (normalised on the way in), or `"compute"` to derive smooth normals from the triangles |
| `indices` | required | none | Triangle list into the vertices |
| `uvs` | optional | none | Flat `u, v`; omitted: planar from `x` and `y` over the box, so a linear brush runs along `x` |
| `source` | none | required | `{ url, mesh? }` or `{ data: ArrayBuffer, mesh? }`: a glB or a glTF with embedded buffers; `mesh` names a glTF mesh (or the node that holds it); omitted: the file's only mesh |
| `scale`, `offset` | none | optional | glTF units to part-local px (default 1) and the placement after the axis change (default `[0, 0, 0]`) |
| `bounds` | optional | required | `{ low: [x, y, z], high: [x, y, z] }`: the declared box in part-local px |
| `pivot` | optional | optional | `[x, y, z]`: the default `pose.pivot` of a part of this profile whose pose gives none |

A part uses it with `kind: "custom"` (or, for a part that replaces a named one, that part's kind: any kind may use a mesh
profile; `custom` requires one) and every property the parametric kinds have: `material` (the scene's recipe, so themes
and characters apply), `at`, `pose`, `caster`, `emitter`, `finish`, `state`, and `glass` (the glass shader of item 4 draws the mesh: a file's dome as a lens, a file's plate as a
window, checked by one dome in the browser test). Not accepted: `captured` (a custom part carries no captured content) and `stand`.

**glTF to part-local px.** glTF is right-handed, y up, +z towards the viewer; the part's frame is left-handed with z up. A
vertex `(gx, gy, gz)` becomes `(gx, gz, gy) · scale + offset`: the model stands on the face with its front towards the
bottom of the screen. The mesh is taken as its node places it (the node's TRS or matrix and its ancestors'). That change of
handedness reverses the winding, which the next section normalises.

## Validation

`validateInstrumentScene` is the one place a scene is checked; every refusal names its path and gives the reason
(`profiles.cap.positions[7] requires a finite number`).

| Rule | Refused with |
| --- | --- |
| `positions`: a multiple of 3, 3 to 16,384 vertices, each finite and within ±10,000 | the count, or the index of the first bad value |
| `indices`: a multiple of 3, at most 32,768 triangles, each an integer below the vertex count, no triangle that repeats a vertex | the index of the first bad value or triangle |
| `normals`: as many as positions, each finite and not zero; absent without `"compute"` | "missing: give them or set `normals: "compute"`" |
| `uvs`: as many as vertices, finite | the index |
| `bounds`: finite, `low ≤ high`; inline vertices must lie inside it (1/1000 of its size + 0.01 px of slack) | the first vertex outside |
| reference: `url` a string or `data` an `ArrayBuffer`; `bounds` present; `scale` in 1e-6..1e6 | the field |
| `captured` or `stand` on a mesh part; a `custom` part whose profile is not a mesh | "custom parts carry no captured content" |

**Caps.** 16,384 vertices and 32,768 triangles per profile (a closed mesh has about twice as many triangles as vertices, so
the two agree), and 64 profiles per scene as for every profile. Per layer, the **drawn triangles of custom parts**
(instances times triangles) are budgeted at 1,000,000: above it, the objects holding custom parts step down to Relief with
`budget` from the last object of the scene backwards until the layer fits, which is deterministic and keeps the first
objects, the ones an application lists first. The 2,048 parts per layer and 6,000 per stage count custom parts like any
other, and above them the layer steps down as today (the whole layer, `budget`). Every distinct mesh profile with each
material is one kind (one draw call), counted in the 16 kinds.

**Winding and normals.** A part is shaded with its vertex normals and its winding never decides its light (2D.2, #143).
Normals that are given are normalised and every triangle is oriented against them, as `profileGeometry` orients the
parametric builders'. Normals that are computed come from the triangles' winding: a triangle whose `(b − a) × (c − a)`
points against the outside is front-facing, core's convention; when the mesh is closed (every edge shared by exactly two
triangles) and its signed volume says it is inside out, every triangle is reversed first, so a closed mesh authored with
the other winding (a glTF after the handedness change) is lit right whatever its order. An open mesh with computed normals
keeps its authored winding. UVs pass through.

**Cost of validation.** An update validates its scene (the poses idiom hands core a new scene every frame), so a mesh
profile is validated once per input: normalised data is cached by the identity of the input arrays, and a profile that is
passed again with the same arrays costs one comparison. Changing the data means passing new arrays (arrays that are
mutated in place are not noticed).

## Containment on the real triangles

2D.9 is unchanged and now sees the mesh: `profileGeometry` returns the mesh's normalised triangles, and the travel steps,
the frontier, the fast bound and the exact projection run on its vertices, not on its declared box. A part that cannot be
contained makes its object step down to its Relief primitive with the `containment` diagnostic naming the part
(`custom`), its smallest inset and its overshoot: refused, never clipped. The clip mask stays as item 3 made it (the last
guard, never the contract). The declared `bounds` are a contract about the file, not the check: a reference whose loaded
vertices leave its declared box (more than the slack above) fails with `bounds`, which catches an asset swapped for another
or a wrong `scale` before it is drawn.

The cost is vertices times steps, once per distinct geometry and object shape (the frontier is cached by shape, as for
parametric parts): the 16,384-vertex cap at 32 steps is about half a million projected vertices. A part with more than 20,000
vertex-steps keeps, instead of a witness per vertex and step, the least inset per 0.05 px height bucket (the height rounded up in
magnitude, so a drift is never underestimated), which is the same frontier to within 0.05 px of height; the exact path transforms the
vertices in place. Measured below.

**Face casters.** Omitted `caster`: the mesh's footprint at its mean height. The footprint is the xy extent of the posed
mesh's convex hull (computed once per geometry, posed per frame by transforming the hull's points, at the bottom and the top
of the mesh when it tilts), as a rounded box whose radius follows how round the hull is (a disc gets a full radius, a
rectangle none). Like the Fader, the height is **capped so that the shadow stays inside the object's `bounds`**: the
largest height whose shadow (the footprint shifted along the light plus the soft reach `1.5 h + 1`) lies inside the box (each side
gives `a − c · h ≥ 0`, so it is closed-form, and 0 when even a flat shadow leaves the box); an explicit `caster` is honoured as given. A mesh with no footprint or no height has no caster.

## Loading

Core owns an **asset store** per engine (`instrument-assets.ts`). It fetches or reads a reference, parses it with a small
glB reader in core (`instrument-gltf.ts`), and hands the triangles to the mesh pass. The store never runs inside a frame: a
frame only asks it for the state of each reference (`loading`, `ready` or `failed`) and starts a load the first time it
sees one.

**Lite's loader or our own.** Lite 1.33 exports `loadGltf(engine, url | ArrayBuffer | Blob)` and `getMeshGeometry`. By its
typings it runs on the shared engine without a scene (the container is only added to a scene by `addToScene`), but it
uploads every mesh, material and texture of the file to the GPU before core can look at a count, it returns node
hierarchies whose CPU geometry exists only if the mesh retained it, and it cannot run in the unit tests. Core wants
positions, normals, indices and UVs of one named mesh, a cap checked before any allocation, errors it can name and a test in
Node. **Decision: a small reader in core**: glB or glTF with embedded buffers; `FLOAT` positions, normals and UVs
(`TEXCOORD_0`); `u8`/`u16`/`u32` indices or none; interleaved views; triangle lists (`TRIANGLES`; other modes are
refused); node transforms; every accessor count is checked against the caps before an array is allocated or a byte is read. Refused with a reason:
Draco, meshopt, `KHR_mesh_quantization`, sparse accessors, external buffers, skins. Ignored: materials, textures, cameras,
lights, animations, morph targets (the base shape is used). Lite's loader is the alternative if a later item wants
materials or textures from the file.

**A frame never waits for a load.** A custom part whose reference is `loading` or `failed` is not drawn and is excluded from
its object's containment check; every other part of the layer draws as it did. When the load finishes the store asks core
for a frame, and the next frame replaces the mesh's geometry in place with Lite's `resizeMeshGeometry` (public: the mesh
object, its material and its shadow-caster entry stay valid), re-checks containment with the real vertices and writes the
instances, so the part appears in that frame and no scene is rebuilt: **no object steps down to Relief while a part loads**
(a load that rebuilt the scene would show every object at Relief for a build). The kind and its mesh exist from the first
build, with a one-triangle placeholder of zero area and no instance written.

**Failure.** A 404 or network error, a body over 8 MiB, a load over 15 s, a file that is not glB/glTF, a missing mesh, a
cap, a bounds mismatch, an unsupported feature or the asset budget leaves the part out with `failed` and the reason; the
layer, GPU and the other parts are untouched. A failed entry is kept until no scene references it any more, so a failing URL
is not refetched every frame and a scene that drops the reference and adds it again retries.

**Cache.** Parsed geometry is cached per engine by `url`, `mesh`, `scale` and `offset` (a buffer by identity), counting
`positions + normals + uvs + indices` bytes against a budget of **32 MiB**; the least recently used entry that no scene
references is evicted first, and a load that would pass the budget with every entry referenced fails with `budget`. The
file's bytes live only while it is parsed (concurrent loads of one URL share one fetch). Disposal: the geometry on the GPU
belongs to the scene and goes with it, the store goes with the controller (in-flight fetches are aborted) and a rebuilt
scene takes the CPU geometry from the store without a fetch.

**Diagnostics.** `state().instrument.layers[].customParts` lists each custom part (`object`, `part`, `profile`, `status`,
`error`, `vertices`, `triangles`); `state().instrument.assets` the store (`entries`, `bytes`, `budgetBytes`, `loads`,
`hits`, `failures`, `inFlight`).

## Rendering

Nothing new is drawn: a custom kind is a thin-instanced mesh with the scene's PBR recipe in the same `parts` task, so it is
shadowed by the map, receives the post chain, the clip mask and the opacity group, is lit by clustered emitters and (with
`emitter`) glows. Posed parts turn and tilt about `pose.pivot` as any part does.

## Decisions (item 5)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | Format | A `mesh` profile (inline or reference) and a `custom` kind, the model's own names; any kind may use a mesh profile; no `captured`, no `stand` | A separate `custom` part field: duplicates profile handling, caches and the kind key |
| 2 | Placement | Part-local px like every profile; a reference carries `scale` and `offset`; no anchors in core | The design language's anchors in core: a fitting solver for five anchors that the helper knows better |
| 3 | Declared box | Required on a reference, verified against the loaded vertices; optional inline, verified when given; the containment check uses the vertices | Trust the box: a wrong asset would pass |
| 4 | Loader | A glB/glTF reader in core: caps before allocation, named errors, Node-testable | Lite's `loadGltf`: GPU upload of everything first, nothing to cap, no unit tests |
| 5 | Who fetches | Core, in the store, never in a frame (the plan said the helper) | The helper fetches and hands data: every caller repeats caching, budgets and states |
| 6 | Load lifecycle | `loading`/`ready`/`failed` per part; the part is absent until ready; the mesh is replaced in place | A scene rebuild per load: every object at Relief for a build |
| 7 | Caps | 16,384 vertices and 32,768 triangles per profile; 1,000,000 custom triangles per layer; the 2,048/6,000 part budgets as they are | No triangle cap: one part could cost a stage |
| 8 | Budget at the limit | Triangle budget: objects with custom parts step down from the last; part budgets: the whole layer, as item 1 (the brief's "as today" is the layer) | Drop single parts: a control with half its parts |
| 9 | Cache | Per engine by `url`/`mesh`/`scale`/`offset`, 32 MiB, LRU of the unreferenced, failures kept while referenced | No cache: a refetch per scene rebuild |
| 10 | Winding | Orient by given normals; compute from winding, reversing a closed mesh that is inside out | Trust the authoring: dark tops (#143) |
| 11 | Caster | The hull footprint at mean height, height capped to keep the shadow in `bounds`; explicit caster as given | The posed bounding box (item 1's non-lathe rule): coarse for round caps, and uncapped |
| 12 | Textures, animation, skinning | No: the recipe's material is the look; UVs feed brush and grain | Texture support: Lite's loader and a material path |
| 13 | Module layout | `instrument-mesh.ts` (validation, normals, hull, no Lite), `instrument-gltf.ts` (the reader), `instrument-assets.ts` (the store); `instrument-pass.ts` calls them | Everything in `instrument.ts` |

## Verification (item 5)

- Unit: `tests/unit/instrument-mesh.unit.test.mjs` (validator, winding, containment on vertices, the caster, the reader and
  the store's cache and budget with a fake fetch).
- Browser: `tests/browser/core-custom.test.mjs` on `instrument-custom-core.html`, DPR 1 and 2, headless, and a headful
  Canary pass. The GLB fixture is generated by `scripts/make-custom-fixture.mjs`.
- Regression: `core-glass`, `core-instrument`, `core-post`, `core-post-lifecycle`, `core-emitters`, `ui-instrument-conformance`,
  `ui-gpu`, `ui-knob`, `ui-fader` and `ui-switch-forms`.

## Results (item 5)

Canary 158.0.8110.0, Windows 11, RTX 3080, 1920 × 1080, [`instrument-custom-core.html`](../../examples/playground/instrument-custom-core.html), on
this branch merged onto `main` with items 1 to 4: one panel of 15 native range inputs, each with a base plate and a part: inline meshes (a bar
that turns, a disc with its own normals, a bar too long), references to [`parts.glb`](../../examples/playground/public/custom/parts.glb) (133,808 bytes,
made by [`scripts/make-custom-fixture.mjs`](../../scripts/make-custom-fixture.mjs), five meshes: a fluted cap of 455 vertices and 768 triangles, a lever, a
block with no normals in the file, a dome of 2,501 vertices and 4,800 triangles, a slab; the cap again at twice the size, the dome as the lens of
an emitter and as a glass lens) and three files that fail on purpose. Headless at DPR 1 and 2 and headful at DPR 1 and 2 (`--headed`, viewport
emulated): eight tests per DPR, 16 of 16 in each, and every pixel number below is the same in both.

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| Part pixels over 9 poses of the travel (t = 0 to 1, a turning bar, lever, cap and disc among them) / outside every control's box | 40,691–41,216 / 0 | 154,249–156,637 / 0 |
| Every drawn control changes more than 200 px at every pose; a failed part changes | 0 px (3 controls) | 0 px |
| Native hits on drawn pixels: mismatches | 0 of 4,000 | 0 of 4,000 |
| Captions and heading (the guard's text), parts and shadows on against plates only: differing px / worst level difference / contrast-ratio shift | 0 of 24,492 / 0 / 0 | 0 of 97,464 / 0 / 0 |
| Tops lit (mean RGB at the centre of the top): file block with no normals / parametric prism it imitates / inline disc wound the other way with its own normals | (216, 222, 230) / (215, 220, 229) / (218, 223, 231) | the same |
| Face shadows with the derived caster, capped to the box: px outside the boxes (parts and shadows together) / with an explicit caster | 0 / 4,470 | 0 / 17,856 |
| Lamp (a file's dome as the lens of an emitter): lenses / lit / bloom / clustered lights lit; 0 px outside | 1 / 1 / on / 1 | the same |
| Glass dome (the same dome as a glass lens): glass material | `on`; 1,318 px at t = 0.5, 0 outside | `on`; 5,154 px, 0 outside |
| Load held, then released: frames sampled through the arrival, all `ready`, GPU on; fewest drawn parts in any frame | 54; at least 11 | 54; at least 11 |
| What the arrival changed: the 8 loaded controls (px) | 847–9,996 (slab: Relief) | 3,490–40,543 |
| ... the other controls (px / levels, with the shadow map: its fit follows the casters' box) | 70, 51, 49 / up to 7 | 293, 200, 98 / up to 4 |
| ... the other controls with `?map=off` | 0 px | 0 px |
| While held, the loading controls against their plates alone | 0 px | 0 px |
| Failures: 404 / malformed glB / box that does not hold the mesh | `failed`: "the request failed with HTTP 404", "a glB chunk runs past the end of the file", "the mesh leaves its declared bounds: vertex 0 is 54.756 on axis x, outside -18.5..18.5 (it spans -54.756..54.756); check the asset and its scale"; GPU on; no object stepped down | the same |
| Refused (containment): the 140 px slab in 100 px / the 108 px bar turning in 100 px | `part: custom`, overshoot 30.45 px / 6.29 px; 0 px outside | the same |
| Caps: 16,900 vertices / 33,000 triangles / a NaN / a repeated vertex / no normals / a box that does not hold it | refused with the path and the reason (the six messages of the test); the scene in effect untouched | the same |
| Parts budget: 2,048 / 2,049 | 2,041 drawn (the 7 parts of 2 refused objects and 3 failed files are not) / the whole layer `budget` | the same |
| Custom triangle budget: 16,044 of the scene's own + 204 dense copies (995,244) / 205 copies | no step-down / `dense-204` steps down (`budget`), the others stay | the same |
| 300 frames of poses (15 controls): captures, uploads, geometry updates | 0, 0, 0 (300 GPU frames) | 0, 0, 0 |
| Disable, then enable: no instrument state while disabled; the store is new and the file fetched again | the cap is `ready` | the same |

**Cost** (headless; 50 controls with a cap each, 100 parts, 2 kinds, 300 frames of poses; medians of 6 runs; the RTX 3080's
clocks make GPU figures upper bounds and bimodal):

| | DPR 1 custom (file's cap, 768 triangles) | DPR 1 parametric (lathe, 768 triangles) | DPR 2 custom | DPR 2 parametric |
| --- | --- | --- | --- | --- |
| Core frame work p50 / p95 (ms) | 1.70 / 2.50 | 1.80 / 2.50 | 1.70 / 2.40 | 1.70 / 2.50 |
| Instrument GPU p50 (range over the runs) / p95 (ms, the whole layer) | 1.65 (0.62–3.17) / 3.18 | 3.15 (3.03–3.19) / 3.22 | 3.56 (1.56–3.61) / 3.62 | 1.95 (1.20–3.56) / 3.60 |
| Frame interval p95 (ms) | 18.3 | 18.3 | 18.3 | 18.3 |
| `handle.update` per frame p50 (ms) | 0.30 | 0.30 | 0.30 | 0.30 |

A mesh costs what a lathe of the same triangles costs: the frame-work medians agree to 0.1 ms and the GPU columns overlap
(a run's clocks decide which of ~1.2 and ~3.2 ms it reports). Before this branch was merged onto item 4 the same test gave frame work
p50 1.0–1.2 ms for both: the page probe's refreshes and the reflections of the merged chain added the rest, to both.

**Loading** (headless; a mesh's own read, and the shared request): parsing the fixture's meshes takes 1.6–3.1 ms for the first cap (cold; 0.3–0.7
for the same mesh again at another scale), 0.2–0.4 for the lever, 0.1–0.2 for the block, 2.6–3.8 for the dome (4,800 triangles) and 0.3 for
the slab, about 7 ms in all; the request for the 134 KB file (one fetch shared by the parts that start together, from a local preview server) took
56–62 ms at DPR 1 and 70–76 ms at DPR 2 (headful 84–94 ms); replacing the eight meshes' geometry in place took 0.7 ms in all (0.9–1.1 headful),
0.1 ms each. The page is ready (GPU on, all objects drawn, files loading) 1.2 s after it starts.
Core's own cost for the largest mesh the caps allow (16,384 vertices, 32,258 triangles, a turn of 270°, Node 24, warm): validating
it 34 ms the first time and 0.15 ms again with the same arrays; its containment frontier about 6–14 ms (it was 215–290 ms before
the frontier's witnesses were bucketed by height), and its exact path 18 ms per check (32 ms before the vertices were transformed in place).

**Mutation checks** (the tests fail without the code they test): with triangles no longer oriented against their normals the
inline disc's top is dark (134 against the prism's 213) and the test fails; with the caster's height no longer capped the
shadow of the tall cap leaves its box (1,416 px outside) and the test fails; the unit tests cover the winding and the cap as well.

**Regression** (merged with item 4, after the last code change but one): `core-glass`, `core-instrument`, `core-post`,
`core-post-lifecycle`, `core-emitters`, `ui-instrument-conformance`, `ui-gpu`, `ui-knob`, `ui-fader` and `ui-switch-forms`: 126 of 126
passed (a run before the merge: 112 of 112). `npm run typecheck`, the unit tests (242 passed, 1 skipped), the compiler tests (129) and
`npm run test:package` pass.

**Lite 1.33 behaviour found or relied on:** [L36 and L37](../upstream/babylon-lite.md) (no CPU-only glTF parse; `resizeMeshGeometry`
replaces a registered mesh's geometry in place, invalidates the render bundles itself and works with thin instances, culling,
the PBR material, the shadow casters and the glass kinds' meshes). Nothing else new was needed.

**Review expectations / limits:** headful Canary was checked at DPR 1 and 2 with the viewport emulated; the budgets and costs are
one fast GPU; the file's request time is a local server's; the reference implementation (`@underglass/ui/tokens`) and its
conformance suite do not take `mesh` profiles; glass on a custom part was checked with one dome (a lens) only, not a window (a stand is
refused for a mesh). See [open issues](../open-issues.md) (SCOPE-009).

## Deviations from the draft (item 5)

- **Core loads.** The plan and the design language had the helper load and hand core mesh data; core fetches (outside any frame, never at
  render time), because every caller would otherwise repeat the cache, the budget and the states.
- **No anchors.** The design language's five anchors and `fitCustomPart` are not core's: a reference has a uniform `scale` and an `offset`.
- **The budget at the limit.** The brief expected the layer to drop its lowest-priority parts at the parts budget "as today"; today
  the whole layer steps down (item 1's note, decision 9), which is kept. The new triangle budget drops objects from the last of the scene.
- **The built-in stand-in** was first not done (core drew no part while a file loaded) and is now core's `fallback` (see the review fixes below).
- **`captured` and `stand`** are refused for a mesh part; **any kind** may use a mesh profile.

## Review fixes (item 5)

An independent review found no blocker. Its fixes, each with a unit test (`tests/unit/instrument-custom-fixes.unit.test.mjs`) that fails on the code before it:

- **The reader's caps are real.** A NORMAL or TEXCOORD_0 accessor must name as many elements as POSITION, and every accessor at most 16,384 elements
  (indices 98,304), *before* an array is allocated for it (a 1e9 count used to allocate gigabytes); `byteOffset`, `byteLength`, `byteStride` and
  `count` must be non-negative integers.
- **NaN and overflow.** The declared-box test is written so that NaN fails it; glB positions (after the node's transform, `scale` and `offset`) must be
  finite and within ±10,000 like inline ones, and a zero or non-finite normal is refused.
- **Bytes in hand** (`source.data`) are held to the 8 MiB cap like a download.
- **No per-frame serialization.** `profileGeometry` looks a shape up by its object first (`WeakMap`), so `profileBounds` (per glass instance and per posed part
  every frame) no longer `JSON.stringify`s it; a test counts the calls across 500 repeats (0 after the first). That is per validated scene object: each new scene (the poses idiom builds one per frame) costs one stringify per distinct profile, not one per call.
- **Stand-ins** (`fallback`), above: the helper's knob passes the built-in cap, chamfer and pointer, so a 404 shows the standard knob.
- **Triangles belong to a store.** A profile's loaded triangles carry the store that attached them; another store (a second engine, a controller enabled
  again) does not draw them and loads for itself, and evicting an entry (or ending a store) takes its triangles off the profiles, so no store draws another's triangles and the bookkeeping stays honest. The 32 MiB budget bounds the store's own parsed cache only: Lite's mesh keeps its own retained CPU copy and its GPU buffers (L37), which it does not count, and detaching does not free those.
- **Nits.** The triangle budget counts base meshes; the caster cap is 0 within 1 px of the box; `bucketedWitnesses` rounds the height magnitude up on both
  sides of the face, which is conservative on both (the drift grows with the magnitude), and says so; L37 names what is undocumented.
