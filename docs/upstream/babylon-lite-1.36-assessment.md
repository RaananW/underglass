# Babylon Lite 1.33 to 1.36 and lite-gl 1.16 to 1.18: upgrade assessment

Assessment only. Nothing is bumped by this note: `packages/core` still pins `@babylonjs/lite` **1.33.0** and the
playground still pins `@babylonjs/lite-gl` **1.16.0**. Written on 2026-10-20 against the findings in
[babylon-lite.md](babylon-lite.md) (L1 to L37).

## Sources and what could not be accessed

- npm registry: `@babylonjs/lite` 1.34.0 (2026-10-12), 1.35.0 (2026-10-19), 1.36.0 (2026-10-20); `@babylonjs/lite-gl`
  1.17.0 (2026-10-12), 1.18.0 (2026-10-19).
- GitHub releases of `BabylonJS/Babylon-Lite` (public) for tags `npm-lite-v1.34.0`, `v1.35.0`, `v1.36.0`, which are
  auto-generated conventional-commit lists, and the compare view `npm-lite-v1.33.0...npm-lite-v1.36.0` (32 commits, 283
  files; the `packages/babylon-lite/src` part was read file by file and the patches of the files named below were read).
  Pull request #785 (the lite-gl breaking change) was read.
- **Not accessible:** the package ships no CHANGELOG file; there are no `lite-gl` releases or tags of its own (its
  changes appear only in the Lite release notes: #785, #793, #794); the bodies of pull requests other than #785 were not
  read; the shipped 1.36.0 tarball was not unpacked or run. Nothing here was executed against Canary: every statement
  about behaviour is read from source diffs and is a hypothesis until the suite below runs.

## Release notes in brief

- **1.34.0** (breaking: lite-gl effect compilation is non-blocking, #785; dependency updates, #787). Features: custom render
  draw tasks, texture render targets and engine GPU events (`onEngineGpuError`, `onEngineDeviceLost`, #784); opt-in global
  `ShaderMaterial` pipeline sharing (#790) and visible packet updates (#799); exact active draw ranges
  (`setMeshDrawRange`); GPU-produced indexed indirect draws (#800); effect scissor (#795). Fixes: shader system uniforms
  invalidate by declared dependencies (#798), held CSM casters stay out of cascades (#781), lite-gl `bindAttributes`
  leak (#793). Performance: unchanged geometry renderables and views survive scene re-syncs (#780), shader modules are
  shared across geometry rebuilds and materials (#778).
- **1.35.0**: scene accessibility metadata (#775); sprite per-instance parameters; CSM static-cache camera refit (#804,
  #805, #809); glTF base-colour factors applied once (#814, #810); `build meshes whose material is assigned after
  addToScene` (#818); cameras passed to `addToScene` are installed (#801); removed mesh renderables dropped from material
  group output (#815).
- **1.36.0**: one lab demo fix (#825); no library change.

## Which recorded findings the changelog claims to fix

None of L1 to L37 is named as fixed. Reading the diffs:

| Finding | Status in 1.36 |
| --- | --- |
| L1 (prefilter mips rotated 180 degrees), L2 (`loadHdrEnvironment` sets exposure 0.8 / contrast 1.2), L17 (gamma-encoded clamped PBR output) | **Untouched.** No file under the HDR/IBL pipeline, `loader-hdr`, `material/pbr/pbr-template`, or tone mapping is in the compare. The calibration (exposure 0.8, gamma 2.2, contrast 1.2, no-pi diffuse, split-sum IBL, the 180-degree-turned prefiltered mips) should be unchanged. |
| L3, L4, L5 (shadow generators) | Not fixed. CSM changed (#781, #804, #805, #809, `csm-shadow-cache`, `csm-shadow-task-hooks`, ESM and PCF hook edits), so CSM and PCF shadow behaviour needs a re-run, but no claim touches the disabled-generator, one-cascade or `normalBias` defects. |
| L6 (transmission with a shared swapchain pass) | Not fixed. The new custom render draw tasks and texture render targets (#784) are new building blocks, not a transmission change. |
| L7 (`mesh.visible` does not reach bundles) | Not claimed. `setMeshDrawRange` calls `invalidateRenderBundles`, but `visible` is not touched. |
| L8 (material assigned after registration not drawn by an explicit task) | **Adjacent, possibly related.** #818 builds meshes whose material is assigned after `addToScene`, and #815 drops removed renderables. Wording differs from L8 (explicit task after `registerScene`); needs a probe. |
| L10, L11 (ordered contexts, frame-graph task access) | Not claimed. |
| L12 (cube samplers in `ShaderMaterial`) | Not claimed; `shader-material.ts` changed only for system-uniform dependencies and layout copies. |
| L13, L14, L16, L19, L20, L36 | Not claimed. |
| L15 | Not claimed. |
| L18 (TAA plain history blend) | Partly touched, not fixed: `taa.ts` now resets history when the source pass's camera object changes (explicit `cam` override). Still no reprojection or clamping. |
| L21 to L26, L28, L29, L31, L32 | Not claimed. L22 (textures bound at registration) and L24 (shadow casters from the scene) sit near the re-sync and shared-module changes, so re-check. |
| L30 (disposing a task that drew into `engine.scRT`) | `render-target.ts` gained an optional `_colorSubresource` field only; the re-check the finding asks for on upgrade is still due. |
| L37 (`resizeMeshGeometry`) | **Behaviour near it changed:** `mesh-factories.ts` gained `setMeshDrawRange`, `retainMeshGeometry` now takes `preserveDrawRange` and clears the draw-range source on a complete geometry update, and device-loss recovery re-uploads from that source. The documented core reliance (placeholder mesh, in-place resize, re-assigning `boundMin`/`boundMax`) should still hold but must be re-proved. |
| L9, L27, L33, L34, L35 | Not claimed. |

## Conventions that might change

Highest risk first. All are hypotheses from source reading.

1. **`ShaderMaterial` (the instrument glass and capture materials).** `shader-material.ts`, `shader-renderable.ts`
   (+125 -105), `shader-thin-instance.ts` (+113 -139), `shader-pipeline-cache.ts` and a new
   `shader-system-dependencies.ts` changed. Uniforms are now copied at creation (mutating a declaration object afterwards
   no longer takes effect), system uniforms (`world`, `view`, `viewProjection`, `cameraPosition`, `screenSize`,
   `alphaCutoff`, ...) are re-uploaded by declared dependency instead of every frame, and pipelines, layouts and modules are
   shared per device (global sharing is opt-in via `enable...PipelineSharing`). Check: glass `needAlphaBlending` ordering
   (L21, L35), capture texture binding at registration (L22), and any uniform that core mutates through a declaration
   or relies on being refreshed every frame.
2. **Geometry renderables and re-sync (#780, #778, `geometry-renderer-task`, `pbr-geometry-renderable`,
   `scene-core`, `scene-change`, `scene-remove`).** Renderables and views survive re-syncs; mesh add and remove now
   emit committed change events. Core's per-kind part scenes, blended twins, placeholder meshes, and the order in which
   layer scenes are registered and permuted (L10) rely on this machinery. Check ordering, removal, and dispose.
3. **WebGPU engine init and device loss.** New `engine-gpu-events.ts` (`onEngineGpuError`, `onEngineDeviceLost`), and
   `device-lost-recovery-run` calls `_attachGpuEvents` after replacing the device. Not an init-order change on its face, but core
   has its own device-loss path: confirm the two do not both react, and consider adopting the events later instead of
   core's own listeners. `useFloatingOrigin` light versioning changed too (unused by core).
4. **Shadows (CSM, ESM, PCF).** CSM static cache, refit gate, held casters, camera-key handling. Core's key light uses a
   directional shadow generator per scene; re-prove the shadow bias window (L5) and fit (L14).
5. **Texture formats and texture API.** `texture-render-target.ts`, `texture-region.ts`, `compressed-formats.ts`,
   `texture-array.ts` are new or changed; `updateTextureRegion` recovery capture takes any `ArrayBufferView`. Core uses
   capture textures and cube textures; no format default is claimed to change, but re-run the format-sensitive probes.
6. **TAA:** history reset on a camera-object change (L18 context); the default post chain uses SMAA, TAA only if enabled.
7. **glTF loader:** base-colour factors applied once (#814, #810), KHR unlit and sampler descriptor edits. Matters for
   custom-part glTF files (L36): a file with a `baseColorFactor` may shade differently.
8. **Tone mapping, IBL, prefilter, HDR loader, PBR template:** unchanged (see above). The calibration conventions
   should hold; the conformance run is the proof.

### lite-gl 1.16 to 1.18 (playground only)

`@babylonjs/lite-gl` is used in `examples/playground/src/backend-probe.ts` alone (the `createEffectWrapper` /
`createEffectRenderer` pair, lines 12 to 34, 197 to 252). **1.34 (#785) is a breaking change:** shader syntax errors no
longer throw synchronously from `createEffectWrapper`; a consumer must poll readiness with `getEffectCompilationError` or
`await waitForEffect`. If the probe expects a throw for a bad shader, it needs updating; on valid shaders it should be
unaffected. Also in range: `bindAttributes` instance-location leak fix (#793) and a new texture source (#794). 1.18.0 has
no dependency changes (`@types/webxr` ^0.5.0, optional peers unchanged).

## Recommended plan

A separate pull request, one concern: bump `@babylonjs/lite` to 1.36.0 in `packages/core` and `@babylonjs/lite-gl` to
1.18.0 in `examples/playground`, refresh the lock, changeset `@underglass/core` patch (the `dependencies` range changes).
Land the dependency-updates PR first and base this one on `main`.

1. Bump, build, run `typecheck`, `test:unit`, `node --test tests/compiler/*.test.mjs`, `test:package`, `test:showcase`.
2. Re-read the Lite findings table by hand for the touched areas above, with a probe each for L8, L22, L30, L37 and
   the `ShaderMaterial` uniform copy and dependency behaviour (a functional pixel check, not a property check).
3. Browser: the **full** `npm run test:browser` suite (the AGENTS.md rule for core changes), then specifically:
   - `ui-instrument-conformance` with reference sampling at tolerance 16 (the calibration: exposure 0.8, gamma 2.2,
     contrast 1.2, no-pi diffuse, split-sum IBL, 180-degree-turned prefiltered mips). Any shift means a convention moved;
     decide whether to follow it (and update the Rendering Model change log) or file it.
   - `core-glass`, `core-emitters`, `core-instrument-materials`, plus the shadow tests (key light, bias window) and
     `ui-gpu`, `ui-specimen`, `showcase-instrument`.
   - Device-loss and GPU-error paths, including hidden tab and reduced motion: GPU must stay on (the contract).
4. Headful Canary run of the same set (scrollbars put the canvas on fractional pixels); record the Canary build,
   not just "latest".
5. If everything holds, record the result in `babylon-lite.md` (version 1.36.0, line numbers re-checked) and keep any
   workaround whose finding is still open. If a convention moved, adjust core, not the tolerance.
6. lite-gl: no browser test references `backend-probe`; load the page by hand, and adapt `backend-probe.ts` only if it relied on a synchronous throw.

Not recommended in the same PR: adopting new APIs (`onEngineDeviceLost`, `setMeshDrawRange`, pipeline sharing,
visible packet updates, custom render draw tasks), even though some could simplify L10, L11 and L23 workarounds later.
