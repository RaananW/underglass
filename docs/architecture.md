# Current architecture and lifecycle contract

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive/archive-catalog.md).

This describes the supported **bounded Phase 2/3 runtime plus Phase 4/5
ownership/module/decorative additions, the bounded Phase 6 matrix and implemented
Phase7 integration and Phase8 effects independently accepted with explicit limits**, not a released
library or arbitrary React application compatibility. The package remains
private. Historical alternatives and evidence are in [feasibility.md](archive/feasibility.md);
contributor commands are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Repository boundaries

The private root npm workspace is tooling, not a second library package.
`packages/core` (`@underglass/core`) owns the framework-neutral runtime: the
shared engine, renderer, mount boundary, enrollment, motion, effects, typed
style compiler, build generators and the worker protocol/thread. It imports no
UI framework. `packages/react` (`@underglass/react`) is the React adapter:
it owns the React bindings and the experimental worker's React controller,
depends on `@underglass/core` (never bundles it, so every adapter on a page
shares one core and one engine) and re-exports its public root, build and
worker-thread entries unchanged. `packages/vue` (`@underglass/vue`) is the Vue 3
adapter over the same core, with the same dependency rule. No library package may
depend on playground or tests. Every adapter must pass the shared framework
contract in `tests/helpers/framework-contract.mjs`.
The private `packages/css-compiler` workspace owns the
build-only JSON analyzer and Vite/webpack integration, not another UI runtime.
`examples/playground` owns the engineering HTML entries, app/demo/historical-probe source
and its private manifest/configuration. Source development resolves the public
package specifier to workspace source; installed consumer gates instead resolve
the physically extracted current child-package archive without that alias.
Unit/browser/shared-helper tests are grouped by runner responsibility, not
removed. Independent React18 remains an exact separate manifest/lock fixture.
Root commands preserve ergonomic entrypoints and canonical page URLs.
Old accepted packages and path-based seals remain dated old-layout authorities.

`examples/showcase` is a separate private React SPA gallery consuming the built
public package and the maintained task component. Its surrounding chrome uses
CSS; enrolled live surfaces retain typed layout and original native controls.
Its isolated Pages output is not a release package or raw evidence browser.
See [showcase preparation](showcase.md); no hosting is implied.

## GPU-first contract

Underglass is a GPU-first framework. Supported React layer, ref and content
updates must remain GPU-presented with fresh pixels, current original native
interaction geometry and no blank application frames. DOM fallback is reserved
for GPU errors or factual lack of required GPU/capture/geometry feature support,
not missing framework implementation. Explicit disable/disposal is caller-owned
lifecycle. Structure/layout/DPR updates, visibility pauses and reduced motion
must not themselves revoke GPU. Every implemented transition, component
add/remove/change and undo/redo flow must use continuous GPU presentation.
Components should layer GPU support and a small typed declarative CSS/JS
fallback over their standard native React implementation, sharing originals
and state. Complex GPU visual apps with HTML semantics/native input are the
target, not current certification or automatic third-party adaptation.

React owns the original descendants, controls and state; the adapter owns only
the stable external root-container boundary. Preserve one shared renderer and
public browser/engine APIs. The typed path requires no handwritten CSS; it
compiles browser styles rather than implementing a custom CSS/layout engine.
Cloned controls, stale screenshot covers, wrong native hits and cosmetic status
debouncing cannot satisfy the presentation contract.

**Current bounded correction, independently accepted:** Runtime **Layer** and integration
**Replace ref** previously exposed readmission blank frames. The persisted
`cfa9df73` core replaces that mechanism with same-owner membership/geometry and
complete-frame successors. Missing/new/extent-grown slots retain the last
complete output until prepared fresh native-paint uploads. Fresh independent
acceptance qualified that exact source; `ab598c00` added bounded external scroll
and native content-origin correction. The selected task workspace and diagnostic
repair were accepted at `12f13661`. Neither decoded automated frames nor
queue completion prove physical-display continuity, text fidelity, accessibility
or performance budgets. Historical verdicts remain immutable and scoped to
their original sources. See the [current register](open-issues.md).

### Presentation policy updates (2026-10-13, implementer-verified)

The policy revokes GPU for CSS/WAAPI animations only on an enrolled boundary
element that animates GPU-owned presentation properties (transform, opacity,
translate, rotate, scale, transform-origin, or `transition-property: all`).
Descendant animations/transitions (hover, spinners, focus rings) repaint native
content that the paint event captures, so GPU stays active (Canary 157.0.8102.0:
a spinning descendant kept GPU active with about 62 fresh uploads/s).
Structural style/DOM-derived checks are cached and re-evaluated after
mutations, resize, scroll, animation/transition events, input/focus,
membership, ownership, effects and phase changes; ownership checks and
transform-dependent geometry still run every frame. React commits coalesce
reconciliation into one microtask (`CanvasRuntime.requestReconcile()`), giving
one GPU frame per commit. Paint events upload only layers in `changedElements`
or stale ones (new slot, extent/grid change, invalidated, after a hidden-document
pause). Declarative transitions pause while hidden and resume with the same
progress; React transform/layout updates during a transition or ownership
become the resting/base transform instead of throwing. Details and the
upstream check (WICG proposal `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`,
2026-10-09; Chromium hotlist 6783002 inaccessible without sign-in; Canary
157.0.8102.0 on Windows 11) are in [api.md](api.md#changes-2026-10-13). These are
implementer checks, not independent acceptance.

### Capability versus implementation matrix

**Upstream review (2026-10-11):** the current
[WICG explainer](https://github.com/WICG/html-in-canvas/blob/5fb3df86d84de598c7f0fcfc5ee53de1df067e7d/README.md)
was checked at main commit `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`
(2026-10-09). It requires canvas `content="drawable"` AND descendant
`drawable`; these are distinct opt-ins. It also specifies direct WebGPU
`GPUQueue.drawElementImageToTexture`, not only 2D capture/staging. Drawing in
`paint` belongs to the current rendering update; DOM changes belong to the next.
Offscreen geometry batching prevents task interleaving, not a proven shared
GPU/native presentation transaction. Current core rejects silent legacy
`layoutSubtree` qualification and uses public `DynamicTexture2D.texture` with
direct owning-paint upload, not Lite's older inert HTML-texture helper.
Earlier anonymous browser review of the
[Chromium hotlist](https://issues.chromium.org/hotlists/6783002) reports
[content drawable](https://issues.chromium.org/issues/561849343),
[legacy layoutsubtree removal](https://issues.chromium.org/issues/568010578),
[ElementCanvasTransform default enablement](https://issues.chromium.org/issues/565840013)
and [legacy transform getter removal](https://issues.chromium.org/issues/571496925)
as Fixed. Writer-only later fetches exposed application shells and could not
verify individual current issue status. The independent accepted external-scroll
closeout separately rechecked the same WICG commit and an accessible anonymous
hotlist slice (first50 entries/36 links), not the total or full tracker.
The explainer still lists that getter, so neither source alone
establishes the shipped API. Landed revisions/release availability were not
verified in this assessment. Actual secure-localhost Chrome155 inspection
found no reflected `content` property, legacy `layoutSubtree` present and both
direct-GPU upload names present; property inspection is not functional
qualification. Historical bounded source qualification targeted actual Canary157.0.8098.0; its reflected
content and transform getter are functionally tested despite tracker divergence.
Default native grids are read inside owning paint because new originals do not
yet have a cached paint record. WebGL2 direct capture remains explicitly
unqualified. Future changes must repeat current proposal/tracker review and
distinguish it from actual browser functional qualification.

The current local validation target is pinned installed
Canary157.0.8100.0 and its exact revision in the [private release runner contract](archive/private-release.md).
It receives fresh native/source/public-package and ordinary-DOM checks; it does
not reinterpret8098/8099 acceptance or establish physical/universal qualification.

| Area | Current bounded evidence | Remaining boundary |
| --- | --- | --- |
| Initial native capture, public texture upload, shared GPU composition and affine native hits | Independently qualified actual Canary157 current-API route and bounded React18/19 specimens | Required experimental capture/geometry APIs are not general browser support |
| Content invalidation and numeric GPU motion | Bounded complete publication/current native-hit and settled motion proof accepted | Not every content/layout or a physical-display transaction; genuine live native paints still occur |
| Layer/ref/membership/layout/DPR updates | Same renderer/root, synchronous current geometry, prepared textures and complete-frame publication accepted at `cfa9df73` | Decoded source frames are not physical refresh proof; arbitrary layouts remain unqualified |
| Visibility/reduced motion | Current scheduling/cancellation policies | Pause/resume and reduced motion must preserve GPU ownership rather than treat the preference as missing capability |
| Editing, scroll/clipping, overlays and effects | Original editor/root/enrolled viewport and external axis-aligned scroll proof accepted; native portals and inert effects | Other CSS/coordinate subsets remain framework qualification boundaries, not invented missing browser features |
| Component CSS/JS fallback | Same original DOM/state, typed browser styles and public GPU augmentation used by accepted Phase13 task workspace | No general component toolkit, automatic app adapter or essential shader parity promise |
| Complex apps and undo/redo | Selected finite task workspace accepted at `12f13661`; broader framework target | Arbitrary apps/undo-redo flows are not certified; future flows need independent proof |

## Opt-in build-time CSS adapter

**Implemented experimental subset:** `packages/css-compiler` consumes an
explicit versioned JSON configuration and produces literal compositor WGSL,
bindings and matching native-geometry samplers through production Vite and
bounded webpack adapters. This is separate from the current
runtime `compiler.ts` typed-style helper and explicit CSS animation adapter.
It is not automatic conversion of arbitrary components or a replacement layout
engine. See the [configuration, enrollment and exact integration limits](../packages/css-compiler/README.md).
Installed npm-package SCSS/CSS Modules, Sass partials, configured PostCSS and
local stylesheet selection have executable fixtures. The new compiler has not
received independent acceptance; older acceptance records do not qualify it.

Inputs may be local components or installed npm packages. Package components
and their stylesheet entrypoints must resolve through the application's bundler,
honoring package exports, resolution conditions and the installed dependency
graph. No hardcoded `node_modules` paths, dependency-file mutation or assumption
that packages publish their original React/SCSS sources is permitted. Public
compiled CSS is a valid input; a component without statically available styles
needs a supported extraction adapter or an explicit unsupported diagnostic.

Styles may originate as CSS, SCSS/Sass, Less or other build-supported formats.
The compiler consumes normalized CSS after the application's configured
preprocessor and relevant PostCSS transforms, before information-losing
minification. It reuses that pipeline rather than implementing another Sass
compiler. CSS Modules mappings and the import graph must connect configured
selectors to emitted selectors without guessing hashed class names. Source maps
must be retained through preprocessing and generation; when original package
sources or maps are unavailable, diagnostics identify the available published
input rather than inventing original source locations. Supporting a format is
conditional on a verified bundler integration, not a blanket preprocessor claim.

All statically supported analysis, animation/easing lowering, shader-source
generation and binding generation belong to the build. The compiled route must
not require runtime CSS parsing or shader-source synthesis. Where interactive
transforms require CPU-side native geometry, matching numeric helpers should be
generated from the same animation representation. Runtime still supplies time,
state, dimensions and uniforms, manages admission/lifecycle, and creates
device-specific GPU pipelines; browser/driver shader compilation cannot be
eliminated by a JavaScript bundler.

Unsupported behavior in selected targets must produce source-linked build
errors, not silent approximation or automatic DOM success. Unselected CSS stays
unchanged. Static CSS and the original React controls remain authoritative;
only GPU-owned translated animation is suppressed and restored on disable or
disposal. Build-time generation must retain the shared compositor and native-hit
geometry guarantees. No performance improvement is implied without matched
ordinary-CSS and compiled-GPU measurements.

## Module boundaries

The separate [experimental worker backend](worker.md) transfers owning native
snapshots and the associated OffscreenCanvas to a public Lite compositor.
React, DOM/layout and capture remain on the main thread. Essential/control
geometry is fixed; asynchronous worker presentation is not an atomic native-hit
transaction. Only inert decoration animates. Source-boundary diagnostics are
not browser capability claims, and the default runtime remains unchanged.
WGSL/bindings are build-generated; runtime pipelines still compile on the device.
Publication stops and worker fences/disposal acknowledgement precede original
DOM restoration. Stop timeout retains explicitly pending resources rather than
destroying an unknown healthy queue. See the guide for exact API, limits,
functional proof and benchmark interpretation.

| Module | Responsibility |
| --- | --- |
| `packages/react/src/index.ts`, `react.tsx` | Intentional typed API, explicit root bootstrap, context, enrollment and fixed native overlay portal |
| `packages/core/src/enrollment.ts` | Original-element ref enrollment options and typed pre-mutation refusal codes |
| `packages/core/src/runtime.ts` | Stable registry, per-layer controller motion, layout/environment policies and observer ownership |
| `packages/core/src/affine.ts`, `compiler.ts` | Canonical invertible transforms and narrow authoring-to-browser-style compilation |
| `packages/core/src/composition.ts` | Per-layer pass shader (bounding-box vertex stage, inverse sampling, straight-alpha blend) and the worker's layer-count shader |
| `packages/core/src/mount-boundary.ts` | Destination validation, one mount callback, stable-container moves and final unmount |
| `packages/core/src/device-lifecycle.ts` | Public configured-device loss observation and bounded idle synchronization |
| `packages/core/src/renderer.ts` | Native capture, public texture/effect composition, independent dirty scheduling, serialized recovery and resource accounting |
| `packages/core/src/admission.ts` | Independent known-color probe DOM, pixel checks, applied geometry and native interior/clipped-exterior hit validation |
| `packages/core/src/motion.ts`, `timeline.ts`, `animation.ts`, `css-animation.ts` | Public numeric descriptor contracts, shared whole-effect compilation, per-property presentation ownership, separate CSS/WAAPI compatibility and bounded replacement tracking |
| `packages/core/src/module.ts`, `ripple.ts` | Trusted local mounting contract and decorative-only effect validation |
| `packages/core/src/effects.ts` | Whole-chain descriptor/schema validation, trusted application definitions and shared uniform packing |
| `examples/playground/src/apps/effects/color-cycle.ts`, `examples/playground/src/demo/effects-demo.tsx`, `examples/playground/effects.html` | Public-API custom effect outside runtime, native poster composer and external measurement/HMR fixture |
| `examples/playground/src/demo/paired-demo.tsx`, `examples/playground/paired.html` | Shared React behavior in existing-CSS and compiled typed examples; public source/pixel/profiling diagnostic fixture |
| `examples/playground/src/apps/todo/` | Reusable bounded TODO reducer, typed native-control UI and one replaceable action-transition timer; public Underglass imports only |
| `examples/playground/src/demo/todo-demo.tsx`, `todo-probe.ts`, `examples/playground/todo.html` | External host/shell, profiling, deterministic/fault test facade and serialized HMR retirement |
| `examples/playground/src/demo/integration-demo.tsx`, `integration.css`, `examples/playground/integration.html` | App-owned CSS, original-element enrollment, public Radix Dialog portal and single-subtree Presence; external shell/profiling/HMR fixture |
| `examples/playground/src/demo/react-root.ts` | Matching public production profiling root/flush versus actual development client root/flush |
| `examples/playground/src/demo/performance-demo.tsx`, `scripts/measure.mjs` | Public-API 2/4/8-layer fixture, finite full-window collector and serial production measurement; not application/runtime policy |
| `fixtures/react18/`, `scripts/react-matrix.mjs` | Explicit independent dependency/type resolution, unchanged shared sources and actual React18/19 production/development behavior |
| `packages/core/src/native.ts` | Structural native capability guards, finite/applied geometry validation and abortable paint wait |
| `examples/playground/src/demo/runtime-demo.tsx` | Sample UI, production profiling, action/diagnostic fixture and HMR lifetime cleanup |
| `examples/playground/src/main.tsx` | Independent ordinary-DOM landing-page baseline |
| `examples/playground/src/probe.ts`, `backend-probe.ts`, `recovery-probe.tsx` | Historical native/backend/remount-versus-stable-container experiments; not production recovery code |
| `tests/browser/runtime.test.mjs`, `tests/browser/surface.test.mjs` | Current runtime and preserved historical acceptance/fault fixtures |

The renderer has no fixed specimen IDs, dimensions or shader slots. Each layer
is drawn as its own blended effect pass, ordered after a background clear on the
one engine; its vertex stage emits one triangle covering the layer's canvas-space
bounding box. Membership changes reuse the passes of unchanged layers, prepare
passes for new ones in the same engine and fence retired resources;
they do not restore DOM or create another root. Playground-level native/lifecycle/renderer files are compatibility
re-exports for historical probes. `window.runtimeProbe`/`surfaceProbe` are
diagnostic facades, not published APIs. No reusable module destroys a device.

The [TODO pilot](archive/todo-pilot.md) keeps two stable enrolled surfaces as task rows
change inside React. Task membership is not renderer enrollment membership:
there are no per-task engines/textures. Controls remain undistorted; only the
inert artwork has an action-driven sampled-pixel effect. The ordinary host is
the initial topology and GPU admission/reentry are deliberate user actions.

The [Phase7 pilot](archive/integration.md) enrolls original direct-root elements using
`useSurfaceRef` without a typed wrapper or CSS normalization. Null/replacement,
effect/ref StrictMode replay and unmount release registration and restore only
still-owned presentation/attributes. Radix Dialog mounts through its public
`Portal.container` in the fixed native overlay host, never through moving
React/library descendants. App styles and native control behavior remain.

Declarative transitions reuse the numeric compiler/timeline but do not create
a second WAAPI source: owned DOM declarations or canonical GPU/native affine
samples are driven by bounded RAF handles. Group descriptors are prepared
before starting at a shared epoch; stagger is a bounded delay offset, not a
new scheduler. Replacement resolves the old handle separately and samples its
current state. `Presence` lets React retain one original exiting subtree inside
a stable boundary, removing it after completion/cancellation; parent unmount
suppresses stale callbacks. Ref-authored CSS remains the settled DOM state.
Membership and relevant resize/DPR now reconcile without healthy DOM recovery.
Factual clipping/content-coverage restrictions remain diagnosed.
Phase9 hardening, [accepted-with-limits on actual155](../evidence/phase9-independent/acceptance-v1.json)
with exact154 still unverified, historically added a synchronous hidden-output/DOM presentation barrier,
registry revision/order/origin signature and post-await admission generation
checks. Resource retirement is serialized after outstanding native work, then
healthy public queue/readback completion; immediate fallback does not forcibly
destroy those retained resources. That historical barrier is not the current
healthy-update route. Native `paint.changedElements` in that browser reported the root
for native edits; malformed/absent attribution captures all enrolled layers.
React/MutationObserver information is not used to suppress native paint.
See [API](api.md), [adoption](archive/adoption.md) and [roadmap](archive/roadmap.md).

[Phase8 effects](effects.md) reuse the same clock, compositor, native capture
and owned-resource lifecycle. The one shared pass supports three unique
operations per layer: bounded sampling (ripple/chromatic) followed by
color/alpha (custom/dissolve). Uniform storage is160bytes per layer versus
the earlier64; no extra textures or intermediate targets are allocated.
The shader performs three channel samples even for neutral composition; this
is additional work, not an optimization claim. Effect shaders never enter the
native capture path, so snapshots retain neutral original content.

Trusted application functions receive color/local coordinates/extent/time/
parameters, not engine/device objects. New definitions compile through public
configured-device diagnostics during prepared admission/successor creation; the actual application
draw also checks a public validation error scope. Compilation
failure recovers to original DOM using the same healthy-fence rules. Parameter
or admitted-chain replacement does not recompile or recapture. Effects that move
pixels never touch live controls: only authored inert, aria-hidden noninteractive
decoration, or content held inert for a transition, may disappear or distort.
Materials (`interaction: "material"`) may sit on live controls because they only
relight pixels in place. Essential native geometry stays affine and unchanged by
effects and materials.

The material kinds are `custom`, `relief` (Rendering Model version 1), `objects`
(version 2, analytic objects in the same pass), `stage` (version 3, decorative) and
`instrument` (version 4, [design note](ui-library/instrument-phase2.md)). The
`instrument` kind is the only one with a pass of its own: `instrument.ts` validates
the scene and does the geometry (profiles, poses, containment over the travel) with
no GPU, and `instrument-pass.ts` keeps one Babylon Lite scene per instrument layer on
the shared engine, which `renderer.ts` places right after that layer's pass (a
documented, guarded reorder of `getRenderingContexts`) and updates inside its own
`draw()`. The meshes are decoration over the captured layer: they never take hits,
capture and native geometry are unchanged, the layer's face is still its relief pass,
and an object that cannot be drawn as meshes is drawn there at the Relief level, with
GPU on. Scene builds are sequenced with successor compositions so neither spends the
other's compile deadline. Each instrument scene draws its parts into an offscreen
target shared by every instrument layer of the engine, runs its post chain there
(SMAA and an emitter bloom by default; TAA, contact shadows and SSGI as options;
`instrument-post.ts` holds the chain's settings), draws its captured caps after the
chain and lays the result over the face in one composite multiplied by a mask of its
objects' bounds and the layer's clip and by the layer's opacity; captured text never
passes through a stage. A PCF shadow map from the key light shades parts on parts and
never the face. Glass parts are drawn by a WGSL shader of their own (`instrument-glass.ts`) in that same target: it loads the layer's capture and traces the model's 2D.6, with an exact-only twin of each window in the caps target so that text under glass is never filtered. Metals and coats reflect the layer's page through a cube texture that `capture-probe.ts` fills from the capture on the canvas's configured device and Lite binds as a local environment; it is refreshed on a capture upload, a texture replacement or a move of the layer, never per frame, and a probe or glass that cannot be built is left out with a diagnosis, GPU on.

Version 4 scenes of the `relief`, `objects` and `instrument` kinds may carry
**emitters** (lamps, LEDs, the pointer light) and protected text rects
(`emitters.ts`, [design note](ui-library/instrument-phase2.md#core-work-item-2-emitters-and-the-pointer-light)).
A lit layer's pass gets a face pool: a Babylon Lite frame-graph context with one
effect task, placed by the same guarded reorder right after the layer's pass and
before its mesh scene, that multiplies what is already on the canvas over the
layer's box and outset (a layer's own blend could only darken what lies beneath
it), adding no light to the text of the layers beneath it, which each layer guards
within `interior.max` itself. The relief binding carries the same emitter block for the highlights on
bevels and objects, and instrument scenes light their parts with clustered lights.
A moving light (`handle.setEmitters`) is uniform data only: no capture, no
native geometry change, no rebuild.

## Explicit mount boundary

The caller provides empty, distinct, connected, same-document sibling hosts:
an ordinary DOM host, a compatibility capture canvas and the owning GPU output canvas. The
adapter creates its `app-container` before calling `mount(container)` once.
The callback creates one root with `createRoot(container)` and returns that
root's unmount function. React owns everything **inside** this persistent root;
the adapter owns the container and its destinations outside every React root.
Runtime checks validate topology, not React ownership: outside-root ownership
is an explicit caller obligation, not something inferred from private Fibers.

After mounting, only `destination.moveBefore(container, null)` changes the
container's parent. No JSX-created descendant is imperatively relocated;
there is no second control tree, replacement root/portal target, remount,
implicit focus restoration or append/remove substitute. Missing `moveBefore`
refuses GPU admission but leaves the initial ordinary DOM usable. Invalid
destinations are rejected before the mount callback, preserving existing host
content. The caller must not detach, replace, populate or take over the hosts
while the adapter owns them. Final boundary disposal requires DOM recovery and
unmounts exactly once.

This API shape requires an explicit host/mount adapter. An ordinary JSX-only
wrapper cannot silently assume the same ownership boundary. Framework-owned roots and hydration remain unsupported. `NativeOverlay` is
the narrow proven portal boundary: an empty, fixed, connected outside-root
sibling supplied by the adapter. It never changes portal target or captures/
duplicates portal controls. Native modal/dialog and automatic-popover behavior
is tested only there.

## Pixel and input topology

One shared Lite/WebGPU engine renders the enrolled public dynamic textures through one
registered fullscreen effect renderer:

```text
Original drawable React layer under owning content="drawable" GPU output canvas
  -> synchronous native paint -> GPUQueue.drawElementImageToTexture
  -> public per-layer DynamicTexture2D.texture -> per-layer blended pass (shared engine)
```

There is no owning 2D context, staging canvas, application flat texture or
snapshot cover. The original stable adapter root initially moves under the
same output owner; React descendants never relocate or clone. Public
`updateElementGeometry`/verified getter reconcile connected current originals
before paint, and `clearElementGeometry` clears retired originals even after
React removal. Order changes rebuild hit order. One canonical affine matrix
drives native hits and inverse shader sampling.

Direct upload is not a zero-copy or performance claim. Native paint uploads
all current originals conservatively; no stale React attribution suppresses it.
GPU motion updates uniforms/current geometry without React renders or requested
recapture. Complete cached coverage is required for every submitted composition,
including motion while membership is pending. Native CSS extent, captured pixel
grid and allocated texture dimensions remain distinct. Actual default grids use
DPR without CSS downsampling; resize/growth prepares successors and preserves
last output until complete. Queue fences retain superseded resources; unexpected
errors are reported. Samples remain bounded, counts cumulative.
Complete cached reorder/removal re-presents the existing per-layer passes in the
new order synchronously; passes of removed layers and their bound textures remain
retained until that composition is fenced. Successor validation has a bounded
deadline; healthy retirement waits do not block ordinary GPU motion, and
explicit disable reports pending cleanup instead of awaiting a fence forever.
Optional `onMeasure` emits per-operation phase/layer/byte samples without
runtime retention, including a distinct native-readback/comparison span.
Only the diagnostic fixture collects all events in finite windows; its full
histograms do not infer p95 from truncated runtime history.

The 300-frame interval is measured after focus/caret and initial motion paint
have settled, with normal invalidation enabled. A recorded one-frame motion
warm-up is outside that interval; live editing still causes captures/uploads.

Moving across ancestors changes real CSS/layout. The historical specimen deliberately changes ancestry-dependent colors/padding.
The typed demo uses the same compiled authoring in both destinations. Neither
copies/normalizes arbitrary styles. Per-layer native textures contain each layer's valid
untransformed capture extent independently of the output bitmap.
Admission rejects zero, detached, nested, over-budget or
out-of-frame layers; capture rechecks current sizes before transfer. Captured
pixel budgets and a four-times-budget output-pixel safety limit are explicit,
and output dimensions respect the configured public device limit.

Output bitmap size is CSS frame size times DPR. Direct native captures use
`getElementImageDefaultSize` and omit a downsampling `size` argument. Allocation
and valid content grid are distinct; resize/DPR reconcile prepared successors
without healthy DOM recovery. Actual grid metadata is obtained inside native
paint and can reflect prior backing during resize, requiring subsequent fresh
paint. Emulated DPR tests do not prove physical display migration/text parity.

Eligible original INPUT/TEXTAREA internal caret scrolling and composition
start/update/end invalidate their enrolled capture for fresh owning native paint
without revoking GPU or existing motion ownership. Bounded descendant, enrolled
and adapter-root viewports (including `NativeScroll`) reconcile actual scroll
positions and matching native/GPU clips, then refresh native pixels and hits.
Same-engine membership/ref/layout/DPR preparation and complete-frame gating
remain active while scrolled. Ordinary document and untransformed external
axis-aligned scroll ancestors move the owner and original root together:
event/resize/style reconciliation refreshes cached local geometry without window
offsets, external texture cropping, membership generations or motion cancellation.
The browser's inherited external clip is not reapplied to individual captures.
Actual owner border/padding offsets apply only to native border-box registration;
GPU composition remains bitmap-content-local. Explicit owner overflow has matching
native/GPU local clipping. Chrome157's replaced canvas cannot itself scroll:
actual offsets remain zero, so no unverified owner-scroll bridge is used.
Unsupported transformed chains, RTL/writing-mode/zoom or mixed visible/clip axes,
nested enrollment and unbounded capture overflow remain framework boundaries,
not demonstrated missing Chrome157 features or unrestricted qualification.
Synthetic composition listeners do not establish actual OS IME completeness.
Forced colors refreshes content in GPU; reduced motion uses canonical
endpoint/identity behavior. Hidden-state policy pauses scheduling,
aborts paint waits while retaining dirty work and resumes frame-counted motion
without elapsed-time catch-up. Actual background-tab and OS IME behavior are
not established by synthetic policy tests.

## Functional admission, separate from content work

Method presence is only a structural precondition. An admission generation
enters `admitting`, observes its configured device, and
temporarily adds two adapter-owned, noninteractive DIVs directly under the
native canvas, **outside** the persistent React root. No controls are cloned or
React descendants mutated. A 4..16 CSS-pixel marker contains opaque RGBA
`[207,37,83,255]` and `[31,179,113,255]`; the owner must be at least 16 CSS pixels
per axis. Its independent colors avoid mistaking transparent application
content for missing capture support.

The owning native canvas is laid out and visible during this initial probe;
hidden native owners cannot provide the current capture record. Initial
admission is not a hidden-output publication guarantee. The marker traverses
owning native paint -> direct public dynamic texture -> generated shared
compositor, without a 2D owner or staging. Public Lite
`captureScreenshot(engine.surfaces[0])`, serviced with bounded public
`renderFrame` calls, verifies those colors in actual GPU output at the canonical
transformed positions/DPR. No private engine/device access, second engine, or
steady-state GPU readback is introduced.

Native geometry applies translation, 11-degree rotation and 0.75 scale.
`getElementTransform` must match all six requested affine coefficients within
1e-5. In-viewport `elementFromPoint` checks two transformed interiors and one
clipped exterior without synthesizing control interaction. Occlusion refuses
admission; offscreen witnesses defer admission as explicitly unproven, with
useful original DOM and explicit visible `enable()` reentry. Applied matrices
never substitute for a skipped functional native clip witness. This initial
admission bound does not revoke already-qualified GPU on ordinary visibility
changes. Probe geometry must clear to identity before removing its DOM.
After a confirmed idle/readback completion, temporary texture/composition/
resources are released. Actual content layers are then captured and
their applied geometry checked before declaring `gpu`.
Subsequent geometry updates validate the applied matrix too; draw failures
request same-generation DOM recovery. Enrollment, dimensions/DPR and policy
are rechecked across asynchronous admission, and hidden-state admission is
refused rather than revealing an undrawn surface.

`metrics.admission` separates attempts, passes, probe captures/copies/native
readbacks/uploads, GPU frames/readbacks and successful probe geometry checks
from content counters. Only the last successful pixel/matrix/hit proof is
stored. `probeElements` and `probeReadbacks` make temporary/outstanding resources
explicit; RAF and abort listeners use existing ledgers. Native paint
notifications remain independently recorded, including probe-induced paint.
Tests cover no-op/wrong native capture, public upload no-op, no-op/wrong/forged
geometry, content-only geometry failure and clearing failure, then assert
usable original DOM pixels, pointer/editing/form behavior and positive reentry.

## Animation and decorative ownership

New applications call `createMotion` with numeric keyframes and timing,
without constructing native transform strings or calling `Element.animate`.
The entire copied descriptor is compiled through the existing affine/timeline
validators first. One managed native `Animation`/`KeyframeEffect` then supplies
ordinary-DOM playback and the same ownership bridge; timing defaults are
normalized identically for native and GPU sampling. Explicit handle disposal,
unenrollment and runtime disposal cancel the exact source; stale handles cannot
cancel a replacement. Release leaves it alive for same-phase DOM/reentry.
`nativeMotions` accounts for sources independently of active GPU owners.
CSS/WAAPI adapters remain separate, not automatic animation-library support.

Acquisition validates all timing/keyframes/easing/channel extrema and actual
source presentation before pausing or detaching anything. Source effect/target
references and exact transform/opacity/origin declarations/priorities are
retained. The original `KeyframeEffect.target = null` transfers presentation;
setting `Animation.effect = null` alone is not the supported CSS path. Captures
are neutral, not transformed/opacity-baked, and uniform/native geometry changes
use the same logical timeline sample.

CSS acquisition additionally validates explicit top-level exact-ID/same-sheet
rules against raw literal frames and the applied timing cascade. Variable
dependencies cannot be inferred from resolved frames. The tested drawable
migration can regenerate one matching CSSAnimation and cancel its detached
original association. Exact matching, one retained reference and logical-time
restoration handle that browser behavior; repeated/conflicting regeneration
is refused. Serialized transform spellings are canonicalized for comparison,
without relaxing dependency/property validation. WAAPI source modifications
are checked against original frames/timing/composition/rate/target and expected
current time.

One `DeclarationOwnership` ledger per transferred presentation records
original declarations and the exact last runtime-written value/priority.
Animation ownership and GPU neutralization share that ledger instead of
nesting snapshots. A changed value, removed declaration or changed priority
relinquishes that property; restoration only touches still-owned writes.
Live individual translate/rotate/scale and origin dependencies are also
diagnosed before continuing GPU output. Unrelated styles remain untouched.
Per-enrolled-layer relinquishment survives repeated recovery callbacks, even
before admission, so the typed DOM compiler cannot overwrite a later React
or direct application write. Explicit controller/React transform changes
clear this preservation record; unregister/disposal remove it. The bounded
map's size is exposed as `presentationOverrides`, not hidden GPU allocation.
Identical value-and-priority rewrites cannot be observed as a new owner.

DOM recovery cancels the clock, clears native geometry, moves the persistent
root back, restores still-owned source declarations/effect/phase and discards ripple
ownership **before** waiting for safe GPU retirement. A healthy timed-out
fence therefore retains GPU resources, not animation ownership or unusable
DOM. Explicit fresh admission remains blocked until cleanup/readback safety
permits it. Unregistered owned layers retain restoration references until that
DOM transition rather than resurrecting source presentation in a live GPU tree.

One RAF clock advances independent logical owners and decorative time; neither
requires React reconciliation or capture/upload. Normal dirty invalidation
remains enabled. Visibility resets the elapsed clock instead of catching up;
reduced motion pauses sources/effects. The deterministic real-RAF driver forces
paused logical advancement for pixel tests. It is not a steady-state readback.
The source/counter/lifecycle facade belongs only to the demo.

The radial ripple changes decorative texture sampling only, with bounded
amplitude and an edge envelope; alpha, DOM order and essential controls'
matrices/hits are unchanged. Identity uses amplitude zero. Decorative enrollment
is explicit and inert/aria-hidden with no interactive/editable descendants.
These constraints are checked again at runtime. There is no second engine,
extra effect texture/capture, raw GL or private device access.

**Tilted layers** (`tiltX`, `tiltY`, `perspective`) use one projective matrix for GPU sampling (the shader maps
canvas to layer through the inverse homography of the layer's plane), native hit geometry (a 3D `canvasTransform`,
verified to all 16 coefficients) and ordinary DOM (`matrix3d`).

- **Admission:** admission proves the browser hit-tests through the projection. Two witnesses on the probe, tilted
  50° and viewed from its own size, are a point only the projection covers and a point only a flat stand-in covers.
  Without that proof, tilt is refused on the GPU.
- **Corners:** every corner of a tilted layer must stay in front of the viewer.
- **Clipping:** a tilted layer has no rectangular clip, because Chromium hit-tests a projected `canvasClip` by its
  bounding box (crbug.com/573454036, WICG html-in-canvas#186). A tilted layer inside a clipping viewport, or with
  clipped overflow, is a diagnosed policy violation. Its uncut border box is exact.

Transition effects (`interaction: "inert"`) apply the same bounded operations to a
non-decorative layer for the length of a transition. Hit-geometry safety holds
because no control can take input meanwhile: the runtime sets `inert` on the
boundary's element children (and children added during the effect) and restores
exactly those flags when the handle ends, by any route. The boundary must not be
interactive itself and stays hit-testable, so input over displaced pixels lands on
it rather than falling through to a covered control. Application code that makes
locked content interactive ends the handle; it does not revoke GPU.

Materials (`setMaterial`, `interaction: "material"`) are a second, persistent slot per
layer, applied before the effect chain in the same pass. They never move pixels, so
any enrolled layer may carry one with its content fully interactive. The shader
reduces a material to one brightness factor per point: the material's luma ratio on
a neutral mid-grey input, clamped to `interior.max` (at most 0.1). The captured
colour never reaches the factor, so text and the face around it change together and
contrast holds whatever the material code does (Strata Rendering Model, section
2.9). The slot grows the per-layer uniform block from 44 to 52 floats; compiled
program sets carry version 3 so a set built before the slot fails with a rebuild
message. A material persists across DOM and GPU presentation and never revokes GPU.

The module adapter accepts only already-imported trusted local code with a
mount/enroll/unmount contract. The adapter still owns only the stable external
container/destinations; React still owns original descendants. The module must
clean partial initialization it creates. Existing CSS is preserved except the
specific reversible presentation contribution; arbitrary application loading,
cascade normalization and animation-library compatibility are not implied.

## Public GPU contracts and loss mechanism

Composition uses public Lite `createEngine`, `setEngineSize`,
`createDynamicTexture`, `updateDynamicTexture`, effect binding/renderer APIs and
`renderFrame`; admission additionally uses public `captureScreenshot`.
Cleanup uses public unregister/dispose/release APIs.
`waitForGpuIdle` synchronizes previously submitted work; it is not a
steady-state readback or proof of all driver/internal allocation releases.

Installed Lite 1.33.0's `index.d.ts` exposes scene/sprite/text recovery enablers
and `forceWebGpuDeviceLossForTesting`. Its public contract requires a recovery
strategy for every registered context kind. The shipped
`dist/index.js.map` includes:

- `src/engine/device-lost-recovery.ts`: generic strategy registration is
  explicitly internal (`_enableDeviceLostRecovery`), and unsupported context
  kinds cannot recover through an unrelated strategy.
- `src/engine/device-lost-recovery-testing.ts`: the force-loss helper refuses
  engines without recovery registration.
- `src/engine/engine.ts`: public `waitForGpuIdle` delegates to submitted-work
  completion; the effect renderer's context kind is `"effect-renderer"`.

There is no public effect-only strategy enabler in this release. That limits
automatic **engine** restoration, not ordinary-DOM recovery. The adapter uses
the standard browser contract instead:

```ts
const context = outputCanvas.getContext("webgpu");
if (typeof GPUCanvasContext === "undefined" || !(context instanceof GPUCanvasContext)
  || typeof context.getConfiguration !== "function") throw new Error("Loss observation unavailable");
const configuration = context.getConfiguration();
if (!configuration) throw new Error("WebGPU output is not configured");
const lost = configuration.device.lost;
```

No private engine/device access or raw GL-state mutation is used. Each observer
has an explicit release flag and captures its admitted engine identity.
Both immediate delivery and queued recovery check that identity. Intentional
disposal or delayed old-generation promises cannot recover a replacement.

## Serialized lifecycle and safe cleanup

`enable`, `disable`, automatic recovery and `dispose` share a serialized
promise chain. Operation failures reach callers without poisoning subsequent
queued operations. Drawing/capture have separate scheduling and generation
checks; loss cancels pending refresh, aborts native paint waits (removing their
timer and listeners), and interrupts active GPU-only motion. Queued capture
failure recovery is generation-checked too, so it cannot undo final disposal.
Queued policy recovery binds the generation/mode when requested; a stale
ordinary-DOM event cannot tear down a subsequently admitted replacement.

| Transition | Behavior |
| --- | --- |
| Initial admission failure | Keep/recover the same usable DOM root with a visible reason; fence any created engine before healthy destruction |
| Successful admission | Observe device, move container once beneath the visible owning canvas, prove/release temporary native/GPU probe, then capture and publish complete application content; initial admitting output is not a seamless-display guarantee |
| Explicit disable or capture failure | Cancel refresh, clear owned geometry/bitmap, move to DOM, hide obsolete surfaces, synchronize, then destroy |
| Confirmed device loss | Same DOM transition; actual loss authorizes destruction even if the healthy idle fence rejects or cannot complete |
| Healthy teardown idle timeout/rejection | Keep DOM usable and **retain** GPU resources, observer and native capture textures; report pending cleanup |
| Healthy successor pending preparation/capture/fence | Keep the last complete GPU output and retained textures; current original geometry remains registered, and complete cached commits may reuse validated pipeline capacity |
| Retained cleanup completion | Serialized release only after a confirmed fence or confirmed loss; then permit fresh admission |
| Explicit reentry | Create a fresh engine, observer, textures and geometry; preserve the existing root/control objects |
| Final disposal | Refuse while cleanup is pending; otherwise recover, unmount, remove owned canvases/listeners and release ledgers |

Healthy teardown preserves the observed Chrome crash-avoidance order:
**cancel -> clear geometry -> move root -> hide surfaces -> confirmed GPU idle
-> unregister/dispose/release GPU resources**. Immediate unfenced destruction
previously crashed this browser after focused/transformed native rendering.
Timeout is **not** treated as loss.

The idle wait returns a bounded outcome after 1500 ms while retaining an
eventual safe-completion promise. A rejected healthy fence waits for actual loss
rather than pretending the queue is idle. Pending cleanup blocks admission and
final unmount; repeated disable is harmless and leaves working DOM. If an
unexpected synchronization exception occurs, resources are retained and
diagnostics are explicit; a loss observer, if available, can authorize later
cleanup. With neither a fence completion nor observable loss, cleanup can stay
pending indefinitely. No unsafe force-to-zero action is exposed.

The functional probe's public SDK screenshot request is pending work for the
healthy idle fence. A readback delivery timeout retains its GPU dependencies;
later request completion plus confirmed idle permits release. Confirmed loss
authorizes GPU release but does **not** falsely cancel/decrement an outstanding
SDK readback. Its own completion settles its ledger exactly once; reentry and
final disposal remain blocked until then. The tested Lite release exposes no
screenshot cancellation API. Loss before its lazily serviced screenshot hook
can leave that request pending indefinitely, even after GPU resources have
been safely released. This limitation is explicit, not a claimed zero ledger.
The healthy held-delivery fixture and destruction-during-readback fixture
exercise separate outcomes; the latter settles in the observed browser run.

Admission times out after 5000 ms. An abandoned, late-created engine is
disposed, and new admission is refused while its promise remains outstanding.
Native paint waits are bounded at 1500 ms. These limits do not guarantee timely
browser/driver recovery from a physical crash.

## Evidence boundaries

Actual loss fixtures obtain the configured public device, call `destroy()` and
await its real `lost` promise. This proves genuine WebGPU loss delivery induced
by explicit destruction (`reason: "destroyed"`), **not** physical GPU-reset,
driver-crash or browser-process-crash recovery. Tests cover idle and active
motion in production-profiling and actual development StrictMode, admission
delivery, fresh reentry and repeated loss/cleanup. Rendered DOM pixels, real
pointer/keyboard input, hook state, control/container identity, values, focus
and selection are asserted.

Healthy pending/rejected/delayed fence and delayed old-generation delivery
tests are explicitly synthetic timing/failure fixtures. Subsequent device
destruction in the pending/rejected cases still delivers actual loss.
No mocks are substituted for the four main actual-loss tests.

Resource ledgers count owned roots, canvases, pending/active engines, textures,
effects/renderers, retained native capture textures, listeners, native paint waits, scheduled refresh,
loss observers, probe DOM/readbacks and pending cleanup. Motion RAF waits and demo startup RAF are
also cancelled/accounted on recovery/disposal. Retention is visible, not a leak-free
claim. Final successful cleanup reaches zero; this is not a heap or driver
memory measurement. The demo's production commit measurement uses the public
`react-dom/profiling` renderer and subtree `Profiler.onRender`, not effect
counts or ordinary production Profiler callbacks.
The injected root and `flushSync` must be a matching public renderer pair;
React18's standard and profiling entries have independent batching state.
Actual development uses the ordinary client pair, with real StrictMode.
The bounded [React18/19 matrix and measured costs](archive/measurements.md) retain
normal invalidation and main dependency pins.

Twenty StrictMode mount/GPU/unmount cycles persist **every retired controller
state**, asserting zero old core/runtime resources and demo action listeners
after each disposal. Each replacement separately has one engine/two layers,
stable environment/observer counts and four installed demo action listeners.
The final lifetime also reaches zero. This is not inferred from constant new
instance counts, nor a browser heap or driver-memory measurement.
The demo HMR handler waits for old disposal before creating a new adapter/root
lifetime; it deliberately resets demo state, unlike state-preserving runtime
fallback. A retained healthy cleanup prevents replacement rather than forcing
unsafe teardown.

See the [verification matrix](archive/verification.md) for precise evidence and fixture
boundaries. Bounded headful TODO/native keyboard/pixels and original control
AX-tree evidence are recorded separately in the parent-owned Phase 6 report;
they do not establish screen-reader or OS IME behavior.
Untested: physical resets, OS IME,
screen readers, arbitrary portal targets, iframe continuity, framework/hydrated
roots, arbitrary CSS/layout and wider browser/device coverage.
General CSS/WAAPI translation and unrestricted decorative shader APIs remain
unsupported beyond the bounded contracts above. License choice and publication
are separate decisions; nothing here promises a release.
