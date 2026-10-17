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

`a(p)` is the layer's captured alpha, read from the layer's capture, so the pointer light lights each layer's own content
once where layers overlap and nothing beneath it. The pass is skipped (task execution off) on frames with no light. A
frame-graph context rather than an effect renderer because Lite's per-task GPU timings only see frame graphs, and it
registers synchronously, so it can join a frame without an asynchronous build.

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
| 64 | protected rects |
| 64 | per rect: the light cap and the shadow cap (the guard, below) |
| 128 | emitters: `(x, y, z, ±R)` (negative for `reach: "layer"`), `(I · colour, face)` |
| 72 | the 16 × 9 tiles, two 32-bit words per tile: the emitters whose reach meets the tile |

The block is appended to the relief binding (1,702 → 2,032 vec4s, 32.5 KB of the 64 KB a uniform binding may hold), so
the layer pass keeps its one binding layout; the stage material uses only the start of the binding and is unchanged.
The pool's own binding is a 7-vec4 header (frame, draw bounds, inverse matrix rows, draw rectangle, capture grid) and the
same block.

## The guard

Inside a protected rect the face's **whole** change stays within `m = interior.max`: the relief's interior factor `k`
(2.9), the part shadows `Sₚ` and the emitter light together (2D.4). Core keeps it without evaluating the relief on the
pool's pixels:

- **Bounds of `k` per rect,** on the CPU, from the layer's face scene (for an Instrument layer, its primitives and the
  objects drawn at Relief this frame): `k_hi = 1 + min(m, Σ positive interior offsets of the entries that overlap the
  rect)` and `k_lo = max(1 − m, (1 − min(m, Σ negative offsets)) · (1 − min(strength, m) if a relief cast shadow can
  reach the rect))`. Cached per face scene and rect list.
- **Light:** inside rect `r`, `E` is capped per channel at `(1 + m) / k_hi − 1` (`m` on a plain face).
- **Part shadows:** inside `r`, each object's face shadow is scaled (2.9's `g`, so it keeps its soft profile) so that the
  `n` objects whose shadows reach the rect darken it together by at most `1 − (1 − m) / k_lo`.
- Emitters only add light and shadows only take it away, so `k · (1 − Sₚ) · (1 + E)` stays in `[1 − m, 1 + m]` inside
  every protected rect. Outside, both return to full strength over `feather` px (`1 − smoothstep(0, feather, q)`, `q` the
  distance to the rect).
- **`"extent"`** protects the layer's box; the outset is outside it, so a lamp near the edge still lights the page past
  it. **More than 64 rects** protect the extent (the design language's rule), reported in `state().emitters`.

**Deviation from 2D.4:** the model clamps the product `(1 − Sₚ)(1 + E)` to `[(1 − m)/k, (1 + m)/k]`; core bounds each
side. They are equal when only light or only shadow reaches a protected pixel; with both, core is stricter (light does
not lift a shadow inside text). The exact clamp needs `k` and `Sₚ` per pixel in the pool: the relief loop a second time
on text pixels and the casters of every object, which a refactor of the conformance-tested shader could give later.

**Not guarded by the lamp's layer:** a lower panel's text beneath another panel's outset glow. Its guard is its own
layer's; the protected rects of other layers are not in this layer's pass. Recorded as a limit; the helper keeps lamps
whose glow crosses an edge away from text on the panel beneath.

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

The pool context belongs to its layer's pass (it reads that pass's capture texture): created the first frame the
layer's scene has an `emitters` field, registered with the passes and ordered after its layer's pass, taken off the
surface when the composition is unpresented, and disposed with the pass after the composition's queue fence, device
loss or `destroyGPU`. The clustered container is a resource of its Instrument scene and goes with it. Task timings stay
on while a pool or an Instrument layer exists.

**Draw order.** Pools join item 1's documented reliance (decision 1): core permutes its own contexts in
`getRenderingContexts` and reads the order back. If Lite refuses it, every pool is taken off the surface (the light is
off, `state().emitters.order` names the reason), Instrument layers step down as before, and GPU stays on.

## Decisions (item 2)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | Where the face pool is drawn | Its own pass per layer after the layer's pass and before its parts, over the draw rectangle, `dst · src + dst`; the same pass at every level | A light term in `reliefShade`: cannot brighten what lies beneath the outset (I0.3) |
| 2 | The pass object | A standalone frame-graph context with one effect task: synchronous registration, seen by Lite's task timings, execution off on unlit frames | An effect renderer: not timed by Lite; a Lite scene: asynchronous `registerScene` |
| 3 | How emitters reach the relief shading | An emitter block (64 emitters, 64 rects with caps, 16 × 9 tiles of two words) appended to the relief binding, packed per frame | A separate binding: a second bind-group layout for every relief pass |
| 4 | Specular at Relief and Objects | The 2.5 lobe per emitter on bevels, sides and domes, coloured, at full strength, zero where 2.9 guards and inside protected rects | No specular (I0.3's face-only light) |
| 5 | The guard | CPU bounds of `k` per rect; light capped and part shadows scaled so the product stays in `1 ± m`; one feather per layer; `"extent"` protects the box; more than 64 rects protect the extent | The exact clamp of 2D.4, evaluating the relief and every caster per text pixel |
| 6 | The update path | `handle.setEmitters` swaps the list into the validated scene in place: uniform writes only | `handle.update` every frame: re-validates and repacks the scene, and recomputes the Instrument structure key |
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

To be measured.
