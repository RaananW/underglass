# Babylon Lite findings

Everything the Instrument work found in `@babylonjs/lite` **1.33.0** (the version pinned in `packages/core`), collected
for upstream reports. Nothing here has been filed upstream yet; each entry says where it was found, how to reproduce it
in this repository, what core does about it, and what an upstream fix or API would look like. Sources: the
[Phase I0 report](../ui-library/instrument-phase0.md#findings-for-later-phases), the
[Phase I2 design note](../ui-library/instrument-phase2.md), the Rendering Model's
[version 4 change log](../ui-library/rendering-model.md#change-log) and the pull requests named below. Tested on Chrome
Canary 158.0.8110.0, Windows 11, RTX 3080, unless stated.

Lite source paths are under `node_modules/@babylonjs/lite/lib/` (shipped as JavaScript; line numbers are for 1.33.0).

## Defects

### L1. Prefiltered environment mips are rotated 180° against mip 0

- **Symptom:** rough metal and coat reflections see the environment turned 180° about a horizontal axis (the screen's up
  and down swapped), while mirrors (mip 0) and the irradiance see it correctly. Brushed tops facing the viewer reflect
  the studio's floor instead of its overhead strip.
- **Where:** the prefilter compute shader's cube face table in `_chunks/hdr-ibl-pipeline-*.js` disagrees with WebGPU's
  cube sampling; mip 0 is a straight copy of the loaded cube, mips 1 and up go through the prefilter.
- **Found by:** the Rendering Model calibration (`tests/browser/ui-instrument-conformance.test.mjs`, branch
  `feat/instrument-calibration`): with the correct studio the reference predicted white brushed tops where core draws
  ≈ 134; with the turn modelled, every sampled point agrees within 16 levels.
- **Core today:** the Rendering Model (2D.5, `environmentTurn`) includes the turn so the standard matches what Lite
  draws. Fixing Lite changes those expectations.
- **Upstream fix:** align the prefilter's face table with the sampler's convention (or turn mip 0 to match), and add a
  conformance image that compares mip 0 against a prefiltered mip of a directional environment.

### L2. `loadHdrEnvironment` silently overrides image processing set earlier

- **Symptom:** exposure and contrast set on the scene before loading an HDR (`1` and `1`) do not hold; after the load
  the output transform is exposure 0.8, contrast 1.2, gamma 2.2 (`material/pbr/pbr-template.js` ≈ line 171:
  `color *= vImageInfos.x`, `pow(color, 1 / 2.2)`, the contrast curve).
- **Where:** `loader-hdr/load-hdr.js` ≈ lines 40–41 set exposure 0.8 and contrast 1.2 unconditionally.
- **Found by:** the calibration; this alone explained a 13-level offset on polished and chrome parts.
- **Core today:** core sets 1/1 before the load (`packages/core/src/instrument-pass.ts`), so Lite's values win; the
  Rendering Model mirrors 0.8/1.2 because that is the look the owner reviewed. Core should set them explicitly after the
  load (queued for core work item 3).
- **Upstream fix:** do not change image processing in a loader, or make it an option that defaults to "leave as is";
  document the output transform (gamma 2.2, not the sRGB curve, plus the contrast curve).

### L3. Shadow generator disabled before its first pass renders receivers black

- **Symptom:** `setShadowGeneratorEnabled(generator, false)` before the generator's first shadow pass makes every
  receiver render solid black.
- **Found by:** probe I0.5 (`examples/playground/ui-probe-instrument-shadows.html`).
- **Core today:** render the map once before turning a generator off.
- **Upstream fix:** a disabled generator should bind a "no shadow" map (all lit) until its first pass.

### L4. CSM with `numCascades: 1` fails WebGPU validation every frame

- **Symptom:** a 2D texture view is bound where a 2D-array view is expected, every frame. A CSM scene built after a
  PCF scene on the same engine fails the opposite way (and vice versa).
- **Found by:** probe I0.5 (the probe opens a new page per generator kind because of this).
- **Upstream fix:** treat one cascade as the array case (or refuse `numCascades: 1` with a clear error), and keep the
  per-kind pipeline layouts apart so generators of different kinds can share an engine.

### L5. The directional PCF generator accepts `normalBias` but never uses it

- **Found by:** probe I0.5 while searching the bias window (clean only between ≈ 1 px and 3.25 px world at 4096 for a
  2 px plate, which is 3.05 px deep along the light ray).
- **Upstream fix:** apply `normalBias` in the directional PCF shader, or remove the option from its config type.

### L6. Transmission cannot run inside a scene that draws into a shared swapchain pass

- **Symptom:** enabling `setPbrTransmission` retargets the render task to a linear rgba16f offscreen target and adds a
  full-screen image-processing pass that **clears the swapchain**; its render bundle lacks the scene's separate depth
  target, so 18 WebGPU validation warnings fire. In core that loses the presented frame and drops to DOM. The
  refraction grab is a fixed 1024², which blurs captured text.
- **Found by:** probe I0.4 (`?transmission=lite`, recorded in `tests/browser/ui-probe-instrument-materials.test.mjs`).
- **Core today:** glass is a custom capture-refraction `ShaderMaterial` with its reflection built in (design language
  §4 "glass").
- **Upstream request:** let transmission draw into the caller's target with the caller's depth texture, without an
  implicit clear, and let the grab resolution follow the target.

### L7. `mesh.visible` writes do not reach the recorded opaque draws

- **Symptom:** opaque draws are recorded in a render bundle; setting `mesh.visible` has no effect on it,
  `setMeshVisible` does.
- **Found by:** core work item 1 (PR #140), where the clip mask first failed because of it.
- **Upstream fix:** make the property write invalidate the bundle, or make `visible` read-only and document
  `setMeshVisible` as the only path.

### L8. A material assigned after registration is not drawn by an explicit render task

- **Symptom:** swapping a mesh's material after `registerScene` rebuilds its renderable asynchronously, and an explicit
  render task (`addMeshToTask`) did not draw it afterwards.
- **Found by:** PR #140; core keeps a pre-built blended twin per part kind instead of swapping materials for opacity.
- **Upstream fix:** re-record explicit tasks when a material swap completes, or expose a promise to await the rebuild.

### L9. Hemispheric light adds a normal-incidence specular that `specularColor: 0` does not remove

- **Symptom:** a hemispheric fill facing the viewer put a mirror highlight on every flat metal top; zeroing its
  `specularColor` had no effect.
- **Found by:** probe I0.4 and the I1 prototype; both turn the fill off (or diffuse only) in scenes with an environment.
- **Upstream fix:** honour `specularColor` for hemispheric lights, or document that the fill's specular cannot be
  disabled.

## Missing APIs

### L10. No ordered insertion of rendering contexts

- **Need:** a scene that must draw right after one specific layer pass and before the next (one mesh scene per layer,
  interleaved with core's own passes). `registerScene` appends and is asynchronous; `getRenderingContexts(surface)` is
  documented as live but not writable.
- **Core today:** permutes only its own contexts in that list and reads the order back after each permutation; if the
  order did not take, every instrument layer steps down to Relief primitives with a diagnostic (PR #140, decision 1).
- **Upstream request:** `registerScene(…, { before | after: context })`, or a frame graph the host can own.

### L11. No public way to find or remove a frame-graph task

- **Need:** disable a scene's auto-mirrored default task when an explicit task draws instead.
- **Core today:** the I0.5 probe reads `getFrameGraph(scene)._tasks` (probe only); core registers scenes with
  `defaultRenderTask: false` and its own tasks.
- **Upstream request:** `getFrameGraphTasks(scene)` and `removeTask(scene, task)`, or a `defaultRenderTask` option on
  every registration path (`registerSceneWithShadowSupport` included).

### L12. `ShaderMaterial` samplers are 2D only

- **Need:** a custom shader that samples a cube texture (the per-layer environment cube) — `viewDimension` is `"2d"`
  or `"2d-array"` only.
- **Core today:** the glass shader evaluates the studio analytically and traces reflections to the face plane instead
  of sampling the cube (I1 second iteration, design language §4).
- **Upstream request:** `"cube"` sampler bindings for shader materials.

### L13. Thin-instance colours are ignored by PBR materials

- **Need:** per-instance colour (a lit vs a dark meter segment, an accent flag).
- **Core today:** one part kind per colour (lit and dark segments are two kinds) — probe I0.1.
- **Upstream request:** honour `setThinInstanceColor(s)` in the PBR material, as the standard material does.

### L14. The shadow fit for thin instances uses the prototype mesh's bounds

- **Need:** a directional shadow map fitted to all placements of an instanced part kind.
- **Core today:** each part kind publishes the union of its placements as `boundMin`/`boundMax` (I0.5, core item 3).
- **Upstream fix:** compute the fit from the instance buffer's bounds.

### L15. `createPbrLocalEnvironmentProbeSet` copies its cubes once

- **Need:** a local environment that follows a live texture (the layer's capture).
- **Core today:** one single local cube per layer, whose view Lite binds directly, refreshed on capture (I0.4).
- **Upstream request:** probe sets that reference their cubes, or a `refresh` call.

### L16. `setPbrMetallicReflectance` tints dielectric F0 only

- **Symptom:** on a metal (metallic 1) the reflectance colour changes nothing (1 pixel by 1 level); gold must come from
  the base colour.
- **Found by:** probe I0.4; the design language's `reflectance` layer is documented accordingly.
- **Upstream request:** document the dielectric-only semantics, or add a metal F0 tint.

### L17. PBR output is always gamma-encoded and clamped to [0, 1]

- **Consequence:** no HDR output, so a luminance-threshold bloom blooms saturated specular highlights as well as lit
  lenses; bloom must draw from a separate emitter target (probe I0.8, Rendering Model 2D).
- **Upstream request:** an option to write linear, unclamped colour to a float target.

### L18. TAA is a plain history blend

- **Symptom:** no reprojection and no neighbourhood clamping: parts that change state instantly trail (meters trail on
  20–22% of their pixels, mean ≈ 19 levels); turning knobs do not.
- **Found by:** probe I0.8; the default post chain uses SMAA and lists TAA as an option.
- **Upstream request:** motion-vector reprojection or colour clamping in `createTaaPostProcessTask`.

### L19. The camera has no off-centre projection

- **Need:** a vanishing point that is not the canvas centre (a stage centred elsewhere than the canvas).
- **Core today:** the vanishing point is always the canvas centre; `camera.vanish` is validated and kept (PR #140).
- **Upstream request:** projection offsets (`setCameraProjectionOffset`) or a full projection matrix on the camera.

### L20. The normal matrix is `mat3(world)`

- **Consequence:** a sheared world matrix (used to screen-lock a part's top under perspective) lights the part wrongly;
  core places parts rigidly and relies on the taper rule instead (probe I0.1, design language §6 "no-shear rule").
- **Upstream request:** the inverse-transpose normal matrix when the world matrix is not a similarity.

### L36. No CPU-only glTF parse

- **Need:** the triangles (positions, normals, UVs, indices) of one named mesh of a glTF, with the file's caps checked
  before anything is allocated, in the unit tests (Node) and without a GPU upload.
- **What Lite has:** `loadGltf(engine, url | ArrayBuffer | Blob)` returns an `AssetContainer` whose meshes are already on the
  GPU, with their materials and textures, and `getMeshGeometry(mesh)` returns CPU copies only when the mesh retained them.
  By its typings it needs no scene (`addToScene` is separate) and works on the shared engine; it was **judged from the typings
  and not exercised**.
- **Core today:** a 200-line reader in `instrument-gltf.ts` (item 5 of the plan): `FLOAT` attributes, `TRIANGLES`, node
  transforms, caps first; Draco, meshopt, quantization, sparse accessors, external buffers and skins are refused by name.
- **Upstream request:** a `parseGltf(source)` that returns the primitives' typed arrays and the node transforms without
  touching the engine, so a host can apply its own caps and budgets.

## Behaviours to know (not defects, but undocumented or surprising)

| # | Behaviour | Found by | What core does |
| --- | --- | --- | --- |
| L21 | A `ShaderMaterial` with a `blend` is treated as transparent unless `needAlphaBlending: false` is set | PR #140 (the clip mask must draw before the parts) | sets it explicitly |
| L22 | Shader-material textures are bound when the scene registers: a texture assigned later fails with error 486 | PR #140 (captured caps) | binds the capture before `registerScene` |
| L23 | A render task drawing into a reused target needs `sharedRt: true`, or disposing an old scene's task destroys the target | probe I0.8 | passes it |
| L24 | The shadow task builds its casters from the scene: a caster drawn only by an explicit task throws "Material group has not completed its initial build"; `registerSceneWithShadowSupport` inside a build registers before textures are bound ("sampler has no Texture2D") | I1 second iteration | parts live in the scene; registration after binding |
| L25 | The overlay setup does not clear-protect a scene registered after effect renderers: the first scene clears the frame to its clear colour | probe I0.1 | one render task per scene with `clr: false` |
| L26 | SSGI's `fadeStart`/`fadeEnd` are distances from the camera, not ray lengths (4–24 px changed nothing) | probe I0.8 | uses 1e5/2e5 |
| L27 | Anisotropy alone reads faintly; brushed metal needs a generated hairline normal map as well | probe I0.4 | generates a grain map |
| L28 | `setMaxLights` caps the whole scene-light buffer (key light included) and is global | PR #145 | not used; clustered containers sized per scene |
| L29 | Per-task GPU timings see frame-graph tasks only, not effect renderers | PR #145 | the light pool is a frame-graph context |
| L30 | Disposing a task that drew into `engine.scRT` is safe only because the swapchain target is `_eager` with no `_disposeAttachments` (`engine/surface.js` ≈ 69, `render-target.js` ≈ 80) | PR #145 review | pinned with a comment; re-check on upgrade |
| L31 | Double-sided PBR flips the normal of a back-facing triangle: a face wound against its vertex normals shades as if it faced inward (reads black on a flat top) | I1 second iteration, PR #143 | every triangle is wound against its normals |
| L32 | Equirectangular layout: file column at longitude *l* lands at direction (sin *l*, ·, cos *l*), the first row is +y; `setEnvironmentRotation` turns about world y | probe I0.4 | the studio generator and its rotation to the key light |
| L33 | The powerPreference option is ignored by `requestAdapter()` on Windows (a Chromium warning, crbug.com/369219127, surfaced through Lite) | every GPU page | nothing to do |
| L34 | `setPbrLocalEnvironment` copies its projection (position, size, capture point) into a private state and its docs say to call `rebuildMaterial` after changing the assignment once bindings exist; there is no public call that updates a single local environment's projection in place (the state is read through an `@internal` getter). A layer that moves in the world therefore cannot move its box | core item 4 (`capture-probe.ts`) | the projection box is fixed at the layer's place when the scene is built, and the cube's content follows the layer (a refresh per move); a Lite call that updates a local environment's projection would remove that refresh |
| L35 | A `ShaderMaterial` with `needAlphaBlending`, a premultiplied `blend`, `depthWrite: false` and back-face culling draws after the opaque PBR parts of the same task and is depth-tested against them (observed: a lens over its polished stand, `core-glass`). A twin drawn at equal depth in another task would depend on both pipelines computing the same depth, and WGSL has no `invariant` | core item 4 | glass does not write depth, and its exact twin tests against the parts' depth only |
| L37 | `resizeMeshGeometry` on a registered mesh replaces its GPU geometry in place and works with thin instances, GPU culling, the PBR material and the shadow caster list: it invalidates the render bundles itself (`mesh/mesh-factories.js` ≈ 214), retains the new CPU arrays (`retainMeshGeometry`, which also resets the mesh's `boundMin`/`boundMax`: that is what is undocumented), and retires the old buffers after the GPU's frames (1.33.0); it throws (549) for a mesh that does not own its vertex buffers. A zero-area triangle is a valid placeholder mesh | item 5 of the plan (a custom part's file arrives after its scene is built) | relies on it: the kind's mesh is created with a placeholder spanning the declared box and takes the file's triangles in place; core re-assigns the mesh's `boundMin`/`boundMax` arrays after the call, since whether Lite keeps them is not documented |

## Not Lite's fault, listed so they are not re-investigated

- `copyElementImageToTexture` vs `drawElementImageToTexture`: Lite's `createHtmlTexture` documents the old WICG name
  and sets the element `inert`; core uses its own capture path on the new name — tracked in
  [#128](https://github.com/RaananW/underglass/issues/128).
- GPU clocks ramp with demand, so per-task timings scatter by up to 10× between runs on the same content; every cost in
  the reports is a median and an upper bound.

## Filing

When these are filed, record the upstream issue numbers here, one per entry, and keep the entry until the fix ships in
a Lite version this repository pins. An entry that is a request rather than a defect should quote the core workaround so
the upstream reviewer sees the shape of the need.
