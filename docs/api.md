# Initial typed API

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive/archive-catalog.md).

The intentional source entry point is `packages/react/src/index.ts`, the
React adapter; it re-exports the framework-neutral helpers and types of
`@underglass/core` (`packages/core/src/index.ts`). This private
experimental package has no published package name or stability promise.
Do not import demo facades or internal renderer classes into application code.
The private prepared tarball now exports the same API at
`@underglass/react` with declarations, independently accepted with Phase10
limits. See [distribution](distribution.md) for actual install commands,
host CSS, public dependency/type boundaries and the bounded browser contract.

For an actual bounded application using these exports, see the
[TODO pilot](archive/todo-pilot.md) and `examples/playground/src/apps/todo/`. Its numeric layout/appearance
compile to browser CSS; real task events invoke public `setRipple` on a separate
decorative surface. No additional TODO-specific renderer API is introduced.
The [Phase13 task workspace](archive/task-workspace.md) extends that original application
to list/detail and native overlays without new core exports or a second tree;
its bounded source and exact-package engineering is qualified-accepted at
`12f13661`, including the three-file diagnostic repair and explicit generated
metadata integrity exception. See the [current register](open-issues.md) for
remaining limits and inherited workflow versus fresh repair proof.
The [bounded effects contract](effects.md) documents `setEffects`, effect
handles and trusted `defineEffect` authoring; `/effects.html` composes these
with motion while keeping essential native controls separate.

## Build-time CSS and worker exports (experimental)

These additions have implementer verification, not independent acceptance or
the historical Phase10 verdict. They are separate opt-in routes; neither
automatically adapts arbitrary components or integrates the compiler with the
worker backend.

| Public entry or API | Contract |
| --- | --- |
| `@underglass/css-compiler/vite` and `/webpack` | Production-build adapters configured by `underglass.config.json`; selected local/package styles use the application's verified preprocessing pipeline. |
| `virtual:underglass/compiled` | Generated `CompiledProgramSet`: literal WGSL/bindings and matching numeric native-geometry samplers. Pass it as `compiled` to `mountCanvasApp`. |
| `controller.ownCompiledAnimation(id, animationId)` | Explicit ownership of an enrolled original element's matching CSS animation. Returns the existing playback interface; disable/release/disposal restores native behavior. |
| `@underglass/react/build` | Build-only compositor/animation generators, including `workerCompositorProgram(1..8)`. Do not import this entry into the compiled browser runtime. |
| `@underglass/react/experimental-worker` | `mountWorkerCanvasApp`, `WorkerSurface` and public worker types. Essential/native-control geometry is fixed; only inert decoration animates. |
| `@underglass/react/experimental-worker/thread` | `startWorkerCompositor(self)` for an application-owned module worker. React, DOM/layout and native capture remain main-thread. |
| `@underglass/core` | The framework-neutral runtime for framework adapters and plain-DOM applications: `CanvasRuntime`, `compileStyle` (typed `Layout`/`Appearance` to a `CompiledStyle` of complete string values), `affine`/`pivot`, plus every helper and type `@underglass/react` re-exports. Imports no UI framework. |
| `@underglass/vue` | The Vue 3 adapter (`vue@^3.5` peer): `mountCanvasApp(options, RootComponent, rootProps?)`, `Surface`, `Box`, `NativeScroll`, `NativeOverlay`, `Presence` (emits `complete`), `useSurfaceRef`, `useGPUHost`, `useNativeOverlayHost`, plus the same core helpers and types `@underglass/react` re-exports. See the [frameworks guide](guide/frameworks.md). |
| `@underglass/core/build`, `/experimental-worker`, `/experimental-worker/thread` | Framework-neutral originals of the React package's `/build` and `/experimental-worker/thread` entries, and the worker protocol and capture primitives the React worker controller builds on. |

Compiled and worker runtime routes consume prebuilt shaders; the default
noncompiled route still generates WGSL internally. Device-specific pipeline
compilation, live uniforms, native geometry and lifecycle remain runtime work.
The worker controller exposes `enable`, `disable`, `dispose`, `invalidate`,
`settle`, `state` and asynchronous `statistics`; teardown rejection requires
handling, not forced DOM restoration before worker acknowledgement.

See the [compiler configuration/enrollment/subset guide](../packages/css-compiler/README.md),
[worker setup/lifecycle guide](worker.md) and
[current evidence and measurement limits](archive/verification.md#experimental-worker-compositor).
Chrome Canary with HTML-in-Canvas enabled is required for GPU operation;
ordinary DOM remains the initial/fallback presentation.

## GPU presentation policy

The policy revokes GPU for CSS/WAAPI animations only when they run on an
**enrolled boundary element** and animate GPU-owned presentation properties:
`transform`, `opacity`, `translate`, `rotate`, `scale`, `transform-origin`, or
`transition-property: all`. Descendant animations and transitions (hover
effects, spinners, focus rings) stay in GPU mode: they repaint native content,
which the paint event captures. Verified in Canary 157.0.8102.0, where a
spinning descendant kept GPU active with about 62 fresh uploads per second.

Structural policy checks (style/DOM-derived) are cached and re-evaluated after
mutations, resize, scroll, animation/transition events, input/focus, membership,
ownership, effects and phase changes. Ownership checks and transform-dependent
geometry still run every frame. Paint events upload only layers listed in
`changedElements`, plus stale ones (new slot, extent/grid change, invalidated,
or after a hidden-document pause); unchanged layers are not re-uploaded.

## Changes 2026-10-14

- **Per-layer drawing:** each layer is now its own blended effect pass (one triangle
  covering its canvas-space bounding box) drawn in DOM order after a background
  clear, all on the same engine and in one frame submission. The 8-layer cap is
  gone: the default layer budget is 32 and `budgets.layers` accepts 1..64 (the
  pixel budget still applies). Adding, removing or reordering layers reuses the
  passes of unchanged layers instead of regenerating a shader for the new count,
  and small layers only shade their own pixels. `resources.effects`/`renderers`
  count these passes (layers + 1). Compiled CSS program sets are now version 2 with
  one per-layer program; version 1 modules are refused with a rebuild message.
- **Ownership while GPU presents:** `ownAnimation`, `ownCSSAnimation`,
  `ownCompiledAnimation` and `createMotion` (and its `own()`) now also work while
  GPU is active, with no DOM round-trip or readmission. The runtime lifts the
  layer's GPU declarations only for the synchronous source verification and
  writes them back before any rendering opportunity; a refused acquisition
  restores them atomically.
- **`release({ freeze: true })`:** ends one layer's ownership and keeps GPU
  active. The layer keeps its last sampled transform and the source animation is
  handed back and cancelled (a `createMotion` source is disposed). Supported for
  WAAPI (`ownAnimation`) and typed-motion sources; CSS-provenance ownership still
  uses `release()`, which returns the whole surface to ordinary DOM.
- **Transform origin:** new static per-layer pivot, `origin?: TransformOrigin` on
  `Surface`, `useSurfaceRef`/`enroll` options and `LayerDefinition`, plus
  `setOrigin(id, origin)`. `TransformOrigin` is `"top-left"` (default), `"center"` or
  `{ x, y }` fractions of the layer's layout size. See [Authoring](#authoring-and-controller).
- **Rotated layers at the frame edge:** a rotated or skewed layer may now cross the
  output frame's edge and stay on the GPU. Functional admission rotates its probe
  across a visible canvas content edge and checks that the inner half is hit and
  the outer half is not (`state().metrics.admission.last.frameBounds`:
  `bounded`/`unbounded`/`unverifiable`). Only `bounded`, with the canvas content
  box equal to the frame, drops the frame clip for such layers; otherwise the old
  refusal stands. Rotated layers inside a clipping ancestor still use ordinary DOM.

**Upstream check (AGENTS.md):** WICG html-in-canvas proposal unchanged since
`5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09), checked 2026-10-14.
Chromium hotlist 6783002 still requires sign-in; no issue data was read. Tested
browser: Chrome Canary 157.0.8102.0 on Windows 11.

## Changes 2026-10-13

Implementer-verified, not independently accepted.

- **Policy:** boundary-only animation revocation and cached structural checks, as above.
- **Reconciliation:** React commits coalesce into one microtask; new public
  `CanvasRuntime.requestReconcile()`; one GPU frame per commit instead of N+1.
- **Uploads:** paint events upload only changed or stale layers.
- **Transforms:** Surface transform/layout updates during a declarative
  transition or ownership no longer throw; they become the resting/base transform.
- **Transitions:** pause while the document is hidden and resume with the same progress.
- **Presence:** starts motion in a layout effect.
- **`animate`:** accepts `{ duration }` (ms); a number is still a frame count.
- **Rendering quality:** the compositor filters captures bilinearly in premultiplied
  space and antialiases layer/clip edges analytically. Pixel-aligned, untransformed
  layers still sample exact texels (verified identical to ordinary DOM at a 50%
  alpha probe); rotated or scaled layers no longer alias or show dark edge fringes.
- **DOM-mode rotation:** declarative transitions with rotation no longer cancel in
  ordinary DOM. GPU viewport-clip geometry is only checked while GPU presents.
- **`createCanvasHosts(frame)`:** creates the output canvas, ordinary host and overlay host with the required styles. The output canvas is deliberately not `aria-hidden`, because GPU mode moves the original controls inside it.
- **Stylesheet scan:** `!important` pre-scan skips uninspectable sheets/rules instead of throwing.
- **Admission:** probe sits in the visible part of the output canvas; fully offscreen is still refused.
- **Status:** new `onStatusChange(status: CanvasStatus)`; `onStatus` (JSON string) is optional and kept for compatibility.
- **Options:** `captureHost` optional and deprecated; `admissionPolicy: "automatic"` is compatibility-only (same as `"explicit"`).
- **Unchanged:** `playback.release()` without options returns the shared surface to DOM (see 2026-10-14 for `{ freeze: true }`).
- **CSS compiler:** numeric easing comparison, selector-boundary overlap check,
  shorthand resets longhands, whole-token CSS-wide keyword guards, `-webkit-`
  animation aliases rejected clearly, inline PostCSS plugins no longer duplicated in Vite.
- **Worker:** load failures terminate cleanly and return a diagnosed DOM state;
  backing DPR is clamped to its pixel budget instead of revoking GPU; the clock wraps.

**Upstream check (AGENTS.md):** WICG html-in-canvas proposal checked at commit
`5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09). Chromium hotlist 6783002
requires sign-in and was not accessible, so no issue data was read. Tested
browser: Chrome Canary 157.0.8102.0 on Windows 11 (the descendant-animation
check above used build 157.0.8102.0). These are implementer checks, not
independent acceptance.

## Explicit bootstrap

**Required target versus current API:** follow the
[GPU-first contract and capability matrix](architecture.md#gpu-first-contract).
After enabling GPU, normal structure/layout/DPR changes, visibility pauses and
reduced motion must not revoke GPU. Only GPU errors or factual missing required
GPU/capture/geometry support justify diagnosed fallback; explicit disable and
disposal are caller lifecycle. The persisted bounded current-spec correction
reconciles membership and geometry in the same renderer/output owner
(`cfa9df73`, `ab598c00`, independently accepted with limits); historical
readmission acceptance is separate from the selected Phase13 qualification.

Create an empty output canvas and ordinary/overlay hosts as connected,
same-document siblings **outside all React roots**. Put them inside a sized,
positioned frame. The output canvas must fill that frame at the same
origin (`captureHost` is optional and deprecated: native capture happens on
`outputCanvas`, and the legacy element was only removed on dispose); the GPU output owns original native hit testing when enabled. Supply the ordinary host at the
same layout origin. See `runtime.html` for the minimal host scaffolding.
Those styles are host integration, not layer authoring.

```tsx
import { useState } from "react";
import { mountCanvasApp, Surface, Box, NativeOverlay } from "@underglass/react";
import type { CanvasStatus } from "@underglass/react";

function App() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  return <>
    <Surface id="editor" layout={{ x: 20, y: 20, width: 260, height: 200, padding: 12 }}
      appearance={{ background: "white", color: "black" }}>
      <Box layout={{ direction: "column", gap: 8 }}>
        <strong>Native controls</strong>
        <form onSubmit={event => { event.preventDefault(); setSaved(name); }}>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={event => setName(event.target.value)} />
          <button>Save</button>
        </form>
        <output>{saved}</output>
      </Box>
    </Surface>
    <NativeOverlay><dialog>Original native dialog content</dialog></NativeOverlay>
  </>;
}

const controller = mountCanvasApp({
  outputCanvas, ordinaryHost, overlayHost,
  onStatusChange: (status: CanvasStatus) => { statusElement.textContent = status.mode; },
  strict: true,
}, <App />);
await controller.enable();
```

`onStatusChange(status: CanvasStatus)` delivers the structured status object
(`CanvasStatus` is exported). `onStatus(message: string)` receives the same
status as a JSON string; it is now optional and kept for compatibility.

The identifiers in the bootstrap are typed host references from your
outside-root setup, not JSX refs whose descendants the runtime may move.
`mountCanvasApp` creates the stable container, mounts one root and supplies
`GPUHost` context automatically. The root always starts in usable ordinary DOM.
Admission failure resolves to a state with `mode: "dom"` and an explicit reason;
invalid topology/API/lifecycle calls throw before unsafe mutation.

Historical Phase9/12 acceptance concerns the former recovery route. Current
normal commits synchronously register current-original native geometry and
reconcile logical capture slots. Complete cached coverage may recompose; new
slots or extent/density growth retain the last complete GPU output until prepared
textures receive fresh native-paint uploads. Old resources await healthy queue
fences or confirmed loss. Initial `enable()` remains explicit by default.

## Opt-in settled readmission (Phase12 engineering)

The option `admissionPolicy: "automatic"` is documented as compatibility-only:
it behaves like `"explicit"`. It remains source-compatible, but no
structural DOM retirement/readmission loop runs in the corrected core. Both
policies preserve GPU after supported updates; neither enables it at startup
or retries factual errors. The heading preserves historical inbound links.

```tsx
const controller = mountCanvasApp({
  outputCanvas, ordinaryHost, overlayHost, onStatusChange,
  admissionPolicy: "automatic", // compatibility-only; same as "explicit"
}, <App />);
await controller.enable();
// Supported membership/order/origin/size/frame/DPR updates stay in this renderer.
await controller.disable(); // Cancels desired GPU intent, including queued work.
```

Membership resources are prepared without submitting a frame. Publication
requires every current visible slot to have valid capture coverage for its CSS
extent and native pixel grid. Pending membership also blocks motion/cached
submissions that would be incomplete. Additions first publish in the synchronous
owning native `paint` callback after all current originals are uploaded. Retired
original nodes are not kept or cloned. Coverage provenance is separate from
current composition geometry. Native capture uses the actual default grid,
not CSS-sized downsampling; allocation growth prepares a successor.

`state().publication` exposes generation, pending state and capture coverage;
`metrics.incompleteFramesSkipped` counts withheld incomplete compositions.
Compatibility admission/readmission counters remain, but automatic attempts
and retry frames stay zero. Visibility pauses scheduling, reduced motion uses
its canonical endpoint/identity contract and forced colors refreshes native
content without revoking healthy ownership. Explicit disable/dispose, factual
unsupported native/effect boundaries and GPU errors diagnose useful DOM.
There is no error retry loop.

The [historical accepted verdict](../evidence/phase12-independent/acceptance-summary.json)
is immutable and not acceptance of this correction. Fresh independent acceptance,
physical-display/text/accessibility and application performance budgets remain open.

`GPUHost` is the context boundary, **not** a JSX-only canvas/reparenting
component. Its runtime is established by the explicit adapter. Do not wrap a
framework-owned existing root and assume unchanged-app compatibility.
Optional `createRoot` injection is for a supported React root factory. Supply
the matching optional `flushSync` from the same renderer entry point:
React18's standard flush does not flush its separate profiling root.
The demos pair public `react-dom/profiling` exports in production and ordinary
client/flush exports in actual development. The default adapter remains
ordinary `react-dom/client` plus standard flush, without demo profiling.
Matching React18/19 types/builds and actual mounted behavior are recorded in
[the compatibility matrix](archive/measurements.md#actual-react-major-behavior-and-types).

## Authoring and controller

| API | Contract |
| --- | --- |
| `Surface` | Original native `<section>`, unique nonempty ID, enrolled through layout effects; registration is StrictMode-safe |
| `Box` | Ordinary native `<div>` with compiled layout/appearance; no engine or extra capture |
| `NativeScroll` | Original browser scroll container; bounded axis-aligned scrolling refreshes native captures without revoking GPU |
| `NativeOverlay` | Portal to one fixed adapter-owned external host; original native dialog/popover controls, not GPU-painted clones |
| `useGPUHost()` | Returns the narrow controller inside the adapter tree |
| `useSurfaceRef<T>({id, decorative?, origin?})` / `enroll(element, options)` | Enroll an original direct-root element, preserve authored layout/CSS; callback stable for stable options, release on replacement/null; imperative form returns an idempotent release |
| `useNativeOverlayHost()` | Fixed external native host for a library's public portal-container prop |
| `transition(id, descriptor)` | Bounded declarative numeric motion; explicit completion/cancellation handle, no separate native animation source |
| `transitionGroup(items, stagger?)` | Prepare 1..8 distinct boundaries, one start epoch, index-based0..1000ms stagger; invalid descriptors/groups have no enrollment/motion side effects |
| `Presence` | Retain one React child subtree through enter/exit inside a stable enrolled boundary; no wrapper, clone or portal relocation |
| `setMaterial(id, descriptor)` | Validate and install a persistent colour-only material on any enrolled layer, replacing the previous one; content stays interactive, and the change is one brightness factor within `interior.max` ([effects](effects.md#materials)); `update`/`setEmitters` ([emitters](#emitters-and-the-pointer-light))/cancel/dispose handle |
| `setEffects(id, descriptors)` | Atomically validate 1..3 ripple/chromatic/dissolve/custom operations before replacing ownership. `interaction: "decorative"` needs decorative enrollment; `interaction: "inert"` runs a transition effect on an interactive layer whose content is held inert meanwhile ([effects](effects.md#contract)); explicit seconds/playback/`update`/cancel/dispose handles; static original DOM fallback |
| `defineEffect(definition)` | Frozen trusted local WGSL color-function schema, 1..4 bounded numeric parameters, layer bounds and WebGPU capability; compile before successor publication, never a remote loader/sandbox |
| `enable()` | Serialized structural and functional admission; owning native canvas must be laid out/visible for paint and functional probes during `admitting`; only complete application capture establishes `gpu`. No automatic initial enable |
| `disable()` | Cancels desired/retry/admission intent; same-root DOM recovery, geometry clearing and safe fenced GPU release; repeated calls are harmless |
| `setTransform(id, transform)` | Replaces a layer's transform; GPU mode updates uniforms/native geometry without React reconciliation |
| `setOrigin(id, origin)` | Replaces a layer's static rotation/scale pivot (`Surface` and `useSurfaceRef` call it when their `origin` changes); applies immediately, including to a running transition |
| `animate(id, target, length)` | Interpolation of specified fields; unspecified fields stay at their starting values. A number is a fixed count of displayed frames (1..10000, refresh-rate dependent); `{ duration }` is time-based in milliseconds. Default 300 |
| `requestReconcile()` (`CanvasRuntime`) | Public request to reconcile membership/geometry. React commits call it through layout effects and it coalesces into one microtask |
| `createMotion(id, descriptor)` | Numeric keyframes/timing for new applications; creates one managed native source in idle DOM or active GPU and returns explicit ownership/playback/disposal controls |
| `invalidate(id?)` | Explicit dirty enrollment(s), with normal native paint/input/mutation invalidation still enabled |
| `settle()` | Bounded completion of already scheduled capture/draw work; not a promise that future browser paint cannot occur. Content that keeps changing (a `requestAnimationFrame` loop, a video) does not hold it: once a paint it waited for completes, a newer paint request is not awaited |
| `state()` | Current capability/mode/reason, registry matrices, bounded telemetry and owned-resource ledgers |
| `dispose()` | Serialized final unmount/observer/listener/canvas release; refuses while healthy GPU cleanup remains pending |

Editable and top-layer admission checks include the enrolled element itself,
not just descendants. Native `contenteditable` (including empty and
`plaintext-only` values or inherited editing) and dialog/popover boundaries
retain ordinary DOM. The native ASCII
case-insensitive `contenteditable="false"` keyword (also `FALSE`/`False`)
does not itself require fallback, including when overriding inherited editing.
Move supported overlays through the fixed
`NativeOverlay` portal, not by relocating already-mounted React controls.

Original connected eligible text-entry INPUT/TEXTAREA descendants use native
scroll/composition events to invalidate their enrolled capture for fresh owning
native paint. Internal caret scrolling is not ancestor viewport motion and must
not revoke healthy GPU or its animation ownership. Value, focus, selection and
native events stay on the original control. Manual OS IME/candidate-window
certification remains open.

Bounded descendant viewports, `NativeScroll`, enrolled viewports and the
adapter-owned root retain GPU during ordinary native scrolling. Root-relative
geometry subtracts actual ancestor scroll offsets; supported ancestor viewport
intersections feed identical transform-local native `canvasClip` and explicit GPU
visual clipping. Scroll requests fresh native paint; pending capture coverage
retains the last complete output. Original scroll containers, controls and events
remain unchanged. Ancestors inside the adapter root must be untransformed;
layers clipped by an ancestor must use positive axis-aligned transforms. A
rotated layer clipped only by the output frame is bounded by the canvas content
box itself once admission has proven that native hits stop at that edge. Arbitrary transformed
chains and general CSS clipping remain framework boundaries, not demonstrated
missing browser functionality. Ordinary document and untransformed axis-aligned
external ancestor scrolling refresh the cached owner-local projection without
adding window offsets, cropping textures by the page viewport, invalidating
content or cancelling motion. The browser moves/clips the whole owning canvas
and its original descendants together. External ancestor resize and style/class
changes use scoped observers; unrelated scrolling does not trigger this route.
LTR horizontal writing mode and unit CSS zoom are required.
Owner borders/padding separate native border-box geometry from GPU bitmap content
coordinates. Owner overflow clipping uses matching local native/GPU clips.
Actual Chrome157 treats the replaced owning canvas as non-scrollable:
`overflow:auto` clips but its actual scroll offsets remain zero. No speculative
owning-canvas scroll subtraction is applied or future-browser behavior promised.
Functional native clip admission needs an onscreen, unoccluded probe before GPU
exposure. Offscreen admission remains useful original DOM with an explicit
unproven/deferred diagnostic, not a missing-browser-feature claim or a successful
skipped test. Once visible, call `enable()` again; actual native clip hits must
pass before GPU can be exposed.

`Layout` supports x/y positioning, width/height, padding, gap, row/column
direction and visible/hidden/scroll overflow. `Appearance` supports background,
color, border color/width, radius and font size. Numeric fields are validated;
colors use the browser's `CSS.supports`. These types compile to HTML/CSS layout,
not a new layout engine or an absence of browser styles. `style` is intentionally
excluded from authored Surface/Box props. Existing arbitrary classes/ancestor
selectors are not normalized or proven compatible.
The positioned x/y origin applies to Surface; Box remains ordinary flow layout.

`Transform` supports x/y, scaleX/scaleY, rotation in degrees, opacity, and a tilt.

**Tilt:**
- **Channels:** `tiltX` and `tiltY` are in degrees, at most ±60, with the same directions as CSS `rotateX` and `rotateY`.
  `perspective` is the viewer distance in CSS px; it defaults to 1600 and must be at least 100.
- **The matrix:** a tilted layer's matrix is projective, composed as CSS composes
  `translate() perspective() rotate() rotateX() rotateY() scale()` about the pivot.
  - On the GPU, pixels and native hits follow the projection.
  - In ordinary DOM, the same matrix is applied as `matrix3d`.
- **Admission proves it:** admission tests projective hit testing on the installed browser
  (`metrics.admission.last.projective`). Tilt on the GPU needs that proof.
- **Clipping:** a tilted layer must not be clipped by a viewport or by its own overflow. Chromium hit-tests a
  projected `canvasClip` by its bounding box (crbug.com/573454036, WICG html-in-canvas#186), so such a layer is
  refused with a diagnosis rather than hit-tested wrongly.
Rotation and scale pivot around the layer's static `origin`, like CSS
`transform-origin`: `"top-left"` (default), `"center"` or `{ x, y }` fractions
of the layer's layout size (`{ x: .5, y: .5 }` is the centre). The origin is not
animated; transitions, `animate` and `setTransform` all pivot around it. The
pivot is baked into the one canonical matrix, so the element itself keeps
`transform-origin: 0 0`; ordinary DOM rewrites that matrix when a pivoted layer
resizes. Animation ownership (`ownAnimation`, `ownCSSAnimation`,
`ownCompiledAnimation`, `createMotion`) keeps the source animation's top-left
origin and refuses a layer with another origin. Rotation is normalized modulo 360
before conversion to radians. Computed coefficients, determinant and inverse
must remain finite and invertible (determinant magnitude >= 1e-8); opacity is
0..1. Huge finite scale inputs can therefore be rejected. Registration/update/
`setTransform` validate the origin-aware result before mutation, preserving
the prior valid layer state on rejection. Reflections are mathematically
representable but not broadly validated. One canonical affine matrix drives
CSS in DOM mode, inverse sampling in GPU mode and public native hit geometry.
Opacity follows normal DOM semantics: transparency does not disable hit testing.

React transform prop updates are ordinary commits and may capture; use the
controller for GPU-only motion. Browser hover/focus/caret and initial geometry
motion can still legitimately dirty pixels. The measured 300-frame guarantee
is a settled specimen interval, not an assertion that every arbitrary animation
will avoid capture work.

### Original-element refs and library overlays

`useSurfaceRef` is an alternative to `Surface`, not a second registration of
the same element. Place the element directly inside the adapter's persistent
root (context/fragment/library providers may surround it without adding DOM).
React owns the element and all descendants; neither the hook nor controller
moves, clones or creates controls. Keep ID/decorative options stable during an
enrollment lifetime. The callback identity survives ordinary rerenders; null,
replacement and StrictMode replay restore the old enrollment before reuse.

`enroll` validates before mutation and throws `EnrollmentError` with
`invalid-id` (blank/duplicate ID), `foreign-element` (not an original connected
same-document root element), `duplicate-element`, `nested-element` or
`decorative-element`. Decorative enrollment requires authored inert,
aria-hidden noninteractive content. It temporarily adds `drawable=""`;
release restores the prior attribute only when the runtime's value still
remains. It does not compile/normalize authored layout or CSS. GPU presentation
temporarily owns transform/origin/opacity; later app-written values/priorities
are diagnosed and retained instead of overwritten on release/recovery.

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { useSurfaceRef, useNativeOverlayHost } from "../underglass";

function App() {
  const panel = useSurfaceRef<HTMLElement>({ id: "panel" });
  const overlay = useNativeOverlayHost();
  return <Dialog.Root>
    <section ref={panel} className="app-panel">
      <label htmlFor="value">Value</label>
      <input id="value" defaultValue="Original native input" />
      <Dialog.Trigger>Open</Dialog.Trigger>
    </section>
    <Dialog.Portal container={overlay}>
      <Dialog.Overlay className="app-backdrop" />
      <Dialog.Content className="app-dialog">
        <Dialog.Title>Original dialog</Dialog.Title>
        <Dialog.Description>Outside capture, in the fixed native host.</Dialog.Description>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
```

App CSS must still size/position/style these elements. Neutral authored
transform/opacity and existing stacking/clipping/bounds restrictions apply
at GPU admission; arbitrary CSS/animation-library roots are not certified.
Use the library's **public** container API before its portal mounts; never
move existing library DOM. Only Radix Dialog1.2.0 Root/Trigger/Portal/Overlay/
Content/Title/Description/Close in this pilot are verified. See [integration](archive/integration.md).

### Declarative numeric motion and presence

```tsx
const enter = {
  keyframes: [{ offset: 0, x: 60, opacity: 0 }, { offset: 1 }],
  timing: { duration: 800 },
};
const exit = {
  keyframes: [{ offset: 0 }, { offset: 1, x: 60, opacity: 0 }],
  timing: { duration: 800 },
};

// Inside the adapter tree, within one stable enrolled boundary:
<section ref={useSurfaceRef<HTMLElement>({ id: "card" })} className="card-boundary">
  <Presence id="card" present={visible} enter={enter} exit={exit}
    onComplete={result => record(result)}>
    <Card />
  </Presence>
</section>;

const handle = controller.transition("card", exit);
const result = await handle.finished; // {status: "completed" | "cancelled", reason}
// handle.cancel() is idempotent and cannot cancel a later replacement.
const group = controller.transitionGroup([
  { id: "card", motion: enter }, { id: "other", motion: enter },
], 100);
await Promise.all(group.map(handle => handle.finished));
```

Use the hook at the top level of the containing component as usual; the JSX
above abbreviates that declaration. Descriptors reuse `MotionDescriptor` and
the existing compiler/easings, with one normal iteration, finite duration/delay
and total duration+delay at most60000ms (including group stagger).
Unspecified keyframe channels mean identity defaults, not inherited CSS.
Each supported numeric sample updates the canonical affine/opacity used for
native geometry and GPU composition; DOM mode temporarily writes owned CSS
and checks that it actually applies. There is no WAAPI source to double-run.
An idle enrolled boundary is required; admission/recovery/pending cleanup,
frame-count motion or competing managed/external animations refuse calls.

A group stages every presentation and revalidates the complete staged group
before starting or replacing any member. Failed preparation restores still-owned
declarations/priorities and preserves existing handles, start times and canonical
transforms. This includes style-dependent CSS failures and reduced-motion endpoints.
A replacement validates before cancellation and starts from the prior
currently sampled transform. The old handle resolves cancelled/Replaced.
Explicit cancellation restores its starting transform and still-owned DOM
declarations; completion keeps the GPU endpoint. Typed `Surface` DOM completion
keeps its canonical endpoint; ref-enrolled DOM completion restores authored
CSS, so author that CSS for the desired settled state. GPU-to-DOM recovery also
restores ref-authored CSS, not an unrequested permanent transform rewrite.
Reduced motion completes immediately at the endpoint, including active
transitions; disable/recovery/loss/unenrollment/disposal cancel. A hidden
document **pauses** a declarative transition, which resumes with the same
progress when visible (it was previously cancelled with "Document hidden").
There is no hidden-time catch-up. Reasons distinguish these outcomes.

A Surface `transform`/`layout` update that arrives from React during a
declarative transition or animation ownership no longer throws inside the
commit: the React-supplied transform becomes the resting transform applied when
the motion ends (or the ownership base on release).

`Presence` starts its enter/exit motion in a layout effect, so there is no
unanimated first frame. It is controlled by `present`; initially present content is already
settled and does not enter-animate. False retains the **same** React subtree
during exit; completion or cancellation removes it. True during exit reverses
from the sampled state without remounting that subtree. True after removal
mounts one new React subtree and enters. A parent unmount cancels motion and
suppresses stale completion callbacks. Keep its ID/runtime stable; changing
descriptors alone does not restart a transition. Content remains native
interactive DOM until React removes it; opacity0 does not disable focus/hits.
Presence animates the enrolled boundary, so place only the intended subtree
inside it and do not run a second transition owner on that same boundary.

Content mutation and native editing dirty capture. Supported capture bounds,
membership, layout and DPR updates retain GPU with complete prepared successors;
internal editor scrolling refreshes native contents without explicit readmission.
Unsupported authored clipping and unreconciled enrolled/ancestor viewport
scrolling remain disclosed framework gaps, not missing-browser-feature claims.
This is not a general CSS scroll/route/shared-element/spring engine.
No controls are hidden or duplicated to simulate exit retention.

### Opt-in operation measurements

`MountCanvasOptions.onMeasure` receives synchronous samples with
`kind`, `at` (`performance.now` milliseconds), `durationMs`, `phase`
(`admission` or `content`) and optional `layerId`/RGBA `bytes`.
Kinds are `captureMs`, `readbackCompareMs`, `uploadMs`, `frameWorkMs` and
`frameIntervalsMs`. The runtime retains no extra event array; its normal
last256 histories/cumulative counters remain bounded.

Use a cheap, nonthrowing callback and bound any external collection. Throwing
is not silently swallowed and can trigger the renderer's explicit failure
path. Callback/profiling overhead can perturb timing. Capture timing excludes
the native paint wait; readback plus comparison is measured separately;
upload/frame timing is synchronous public CPU work, not completion/GPU
execution. `phase` separates admission work from content work.
See [measurement definitions and raw evidence](archive/measurements.md).
With an `instrument` material, `instrumentGpuMs` samples (`layerId`, `phase: "content"`) carry the GPU time of one
layer's mesh pass and post chain in one frame, and with emitters, `emitterGpuMs` samples the GPU time of one layer's face pool pass,
both from Babylon Lite's per-task timings when the device has timestamp queries.

### Input events and captures

A native control's value is not a DOM mutation (a range thumb moves with it), so core queues a capture of the enclosing layer
for every `input` event in a layer, as it does for `focusin` and `focusout`; DOM that a handler writes is captured by the
mutation observer as usual. A presenter that draws a control's value itself and hides the control's native paint opts out
**per element** with the attribute `data-underglass-gpu-value` (`GPU_VALUE_ATTRIBUTE`, exported by `@underglass/core`) on the
element that receives the event:

- An `input` event whose target carries it queues no capture. It is counted: `state().metrics.inputCapturesSkipped`, and
  `state().metrics.perLayer[id].inputCapturesSkipped` for each layer that contains the element or is contained by it (as
  `queueCapture` attributes), so the per-layer sum can differ from the global count.
- Nothing else changes: attribute, text and child changes a handler makes still recapture through the mutation observer, and every
  element without the attribute captures on `input` exactly as before.
- **The mark is a promise, and the presenter must guarantee all of it:**
  1. The element's own paint does not depend on its value. A hidden thumb is not enough if a visible spinner, text, caret,
     selection, track fill or `datalist` tick still shows the value.
  2. No CSS keyed on the element's state restyles it or anything else without a DOM write (`:valid`, `:invalid`, `:in-range`,
     `:out-of-range`, `:placeholder-shown`, `:has(...)`, sibling selectors): such a change repaints with no mutation, and only an
     `input` capture would have caught it.
  3. Text, number, select and checkbox controls are never marked: their paint shows the value.
  4. A native repaint that remains (a focus ring, hover) does not need the `input` capture: it reaches the GPU through the browser's
     paint event (`changedElements`), the documented path for hover and focus repaints (`focusin`/`focusout` also queue one).
  A marked control with a value-dependent paint would show stale pixels, which the contract forbids.
- The Strata JogWheel's helper sets the mark on the wheel's input with the dimple's `data-strata-dome` (while the GPU draws the dimple;
  its thumb is never painted) and removes it where the dome is removed, so a flick of 49 steps costs 0 captures for its input events
  (36 to 38 before). A Knob or Fader writes its value to a custom property on its root for each `input`, which is a DOM write that
  recaptures anyway, so they are not marked.

### The instrument material

`setMaterial(id, { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback:
"static" })` draws the Instrument level ([design note](ui-library/instrument-phase2.md), Rendering Model part 2D).
The scene is a version 4 `strata-scene` with `kind: "instrument"`:

| Field | Contract |
| --- | --- |
| `extent`, `outset`, `backdrop`, `light`, `bevel`, `shadow.strength`, `interior`, `state`, `focus`, `primitives` | The face, shaded by core's relief pass as version 1; `light` adds `intensity` (1.6) and `ambient` (0: the studio is the fill) |
| `camera` | Required: `distance` (`D`, at least 100) and `vanish`; the vanishing point is drawn at the canvas centre |
| `environment` | Required: `{ source: "studio", strength (0..3), studio? }`, the studio generated in code and turned to the key light |
| `materials` | At most 16 recipes: `base` (`colour`, `roughness`, `metallic`, `direct`), `coat`, `reflectance` (dielectric F0 only), `emissive` (`strength`, `colour`), `sheen`, `iridescence`, `brush` with a hairline `grain`; `glass` (`ior`, `tint`, `absorption`, `reflection`) and `dispersion` for glass parts; `subsurface` validated, not drawn yet |
| `profiles` | At most 64 shapes by name: `lathe` (`points: [[r, z, nr, nz], …]`, `segments`), `prism` (`width`, `length`, `radius`, `height`, `taper`, `chamfer`), `extrude` (`outline: [[x, z], …]`, `width`), `mesh` (explicit triangles, inline or a glB/glTF reference: [custom parts](#custom-parts)) |
| `objects` | At most 256 (with `primitives`, 256 in all): `{ id, rect, bounds: { rect, radius }, t (clamped to 0..1), parts, relief }`. A part is `{ kind, profile, at, pose: { from, to }, material, captured, glass, stand, finish, caster, state }`; a pose mixes `travel`, `slide`, `turn` and `tilt` about a fixed `axis` and `pivot`; only parts that travel may be `captured` |
| `emitters`, `protected`, `feather` | Lights and the guard, as for every level ([emitters](#emitters-and-the-pointer-light)); the parts are lit by Babylon Lite clustered lights |
| `shadow.map` | The PCF map of parts on parts: `{ size: 2048 | 4096, bias (world px), darkness (0..1) }`, default `{ 4096, 1.95, 0.1 }`, drawn when omitted; `darkness: 1` draws no map |
| `post` | `{ smaa, bloom, taa, contact, ssgi }`, booleans, default `true`, `true`, `false`, `false`, `false` (the defaults when omitted) |
| a part's `emitter` | An index into `emitters`: the part is that emitter's lens and feeds the bloom while the emitter gives light; on a glass part the lens also glows through its glass |
| a part's `glass` | `"lens"` or `"window"`: the part is drawn by the glass shader (below). A lens may have a `stand` (`{ radius, colour }`, the polished part it stands on, which its reflection sees); a window may have a `finish` zone (`true`: band 0.3, horizon 0.25, or `{ band, horizon }`) |
| `environment.page` | `{ enabled, size, height }`, on by default (512, 300): the layer's page cube for its metals and coats (below); `enabled: false` leaves the studio alone |

- **Drawing.** Each instrument layer has a Lite scene on the shared engine, drawn right after the layer's pass:
  analytic face shadows of the parts; then the parts (thin-instanced per kind, GPU-culled) into an offscreen target with
  their own depth, the post stages the scene turns on (TAA, contact shadows, SSGI, SMAA, then the bloom of the lit
  lenses), and the captured caps after the chain; one composite lays the result over the face, multiplied by a mask of
  the objects' `bounds` and the layer's clip (so no stage draws outside a control's box) and by the layer's opacity, as
  one group. Captured text is never filtered. `handle.update(scene)` with new `t`, states or layout
  writes instances in the same frame, with no capture, upload or hit-geometry change; so do more or fewer objects of
  existing kinds. New profiles, materials, part kinds, a new light or environment, new `post` flags or `shadow.map`, or
  a stage larger than the map's depth window (a half-diagonal past 3,840 px) rebuild the scene; meanwhile the layer
  draws its objects at the Relief level.
- **Glass** (core work item 4) is a custom shader, not Lite's transmission: per pixel it loads the layer's capture and traces Rendering Model 2D.6 exactly. A lens refracts the capture in at its dome and out at its flat bottom, one index of refraction per colour channel (`dispersion`), and a window shifts the capture against a flat pane; both add the Fresnel reflection of the studio, of the lens's `stand` and of the face, tinted and absorbed by `glass.tint` and `glass.absorption`. Text under a window, inside the scene's `protected` rects grown by 2 px, and a window's flat region outside its finish zone are the capture texel: for opaque texels a twin of the window in the caps target keeps SMAA from touching them, and translucent texels (alpha below 1) follow the face pass. Glass is drawn in the same target as the other parts, so the chain, the clip and the opacity apply; it neither casts into nor receives from the shadow map, casts on the face like any part unless its `caster` is `null`, and is not lit by the clustered lights (a lit lens glows through itself). Glass roughness is not drawn. If the glass cannot be built, the glass parts are left out (the face shows through) and `layers[].glass` reads `fallback`.
- **The page probe.** Each layer with `environment.page` on holds a cube texture (`size` texels per face, a mip chain, 16.8 MB at 512) filled on the GPU from its capture and the studio, which Lite binds as the specular environment of the layer's PBR materials with box projection: metals and coats reflect the faceplate print and neighbouring controls, and the studio where the page does not reach. It is refreshed at once when the layer's capture is uploaded again or its texture is replaced, and when the layer moves (its placement quantised to a quarter of the cube's texel footprint, about 0.29 px at 512) at most once per 100 ms while it keeps moving or after a resize or DPR change that keeps the capture texture (a replaced texture refreshes at once), with one more when it settles; never otherwise (poses, emitters and idle frames refresh nothing); at most four layers per stage hold one (`state().instrument.probes.budget`), the others reflect the studio alone with `layers[].probe.status: "budget"`. A probe that cannot be built is left out the same way (`status: "failed"` with its `reason`), GPU on; one whose refresh throws turns the page off and the layer is rebuilt without it (the cube is released, the budget slot is free for the next build).
- **The shadow map** is a PCF map from the key light, its depth window centred on the stage, the bias given in world px.
  Every part casts and receives it except captured caps; the face never receives it. It is rendered again only in a
  frame whose parts move.
- **The output transform:** core sets the parts' image processing to exposure 0.8 and contrast 1.2 (tone mapping off)
  after it loads the studio, the values Babylon Lite's HDR loader sets and the Rendering Model's 2D.5 output transform.
- **Containment.** Every vertex of every part, over the whole travel, must project at least 0.5 px inside `bounds`, and
  `bounds` must lie inside the layer's box. An object that does not is drawn as its `relief` primitive (default: a raised
  box over its bounds).
- **Budgets.** 2,048 parts per layer and 6,000 per stage; above either, the layer is drawn at the Relief level. More
  than 16 part kinds per layer is reported; more than 64 steps the layer down. The format accepts up to 8,192 parts.
- **Diagnostics.** `state().instrument` lists each layer's `status` (`ready`, `pending`, `stepped-down`, `failed`),
  objects, parts, drawn parts, kinds, `steppedDown` entries (`{ object, reason, part?, inset?, overshoot?, detail? }`,
  reasons `containment`, `budget`, `compile`, `pending`, `transform`, `order-unavailable`, `post`), warnings and GPU time
  (`lastMs`, `p50Ms`, `p95Ms`); each layer's `probe` (`status` `on`, `off`, `budget` or `failed` with `reason`; with a probe its `size`, `bytes`, `refreshes` and the GPU time of the refreshes) and `glass` (`status` `none`, `on` or `fallback` with `error`); `state().instrument.probes` (`budget`, `live`, `builds`, `failures`, `refreshes`, `bytes`); the stage's parts; the timing status; and the compile counters (builds, failures,
  deferred successor deadlines). `state().instrument.post` lists per layer each stage's status (`on`, `off`, `idle`
  for bloom with no lit lens, `failed` with its `error`), the map (`size`, `biasPx`, `bias` in Lite's units, `darkness`,
  `window`, `casters`, `renders`: the controller's count of frames that flushed a caster, an estimate of Lite's refresh rule,
  `timedRenders`: the frames Lite's timings saw the map task in, a sample), its lenses and
  lit lenses, and the GPU time per stage (`face`, `map`, `mask`, `parts`, the stages, `caps`, `composite`: `lastMs`,
  `p50Ms`, `p95Ms`, `samples`, `total`); and the shared targets (`format`, `width`, `height`; a target no layer uses may
  report its last size). `state().instrument.resources.mapTextures` counts shadow map textures released with their scenes
  (`destroyed`) and any that could not be (`missing`, warned once). A stage that fails to build is
  left out and reported; a failed registration is rebuilt once without the optional stages. `post` means exactly: the chain's target, mask or composite could not be built, or the minimal chain (the chain without its optional stages: the rebuild after a failed registration, or the first build when no optional stage is on) failed to register. Any other build error (a mesh, a shader material, the studio) stays `compile`. Either way the reason names the cause (the original error's message). The layer is then drawn at Relief. `state().materials` lists `{ kind: "instrument", objects, parts, interior, degraded }`.
- **Compile sequencing.** A successor composition that starts while a mesh build compiles starts its 1.5 s deadline when
  the build is done or after 3 s, whichever comes first; a build that takes over 10 s steps its layer down.
- **Never DOM for an instrument reason.** Containment, budgets, build failures and slow builds (10 s) step objects
  down to Relief with GPU on. A GPU error (validation scope, device loss) still recovers to ordinary DOM.
- **Limits:** a layer whose matrix is not a similarity (shear, non-uniform scale, a tilt) draws its objects at Relief;
  between 0 and 1, the meshes blend as one group over the layer's already faded face: under an opaque part the canvas is
  `α · P + (1 − α) · (α · F + (1 − α) · B)` (`F` the face, `B` what lies beneath the layer), not the layer's true group
  opacity `α · P + (1 − α) · B`, so face content under a part shows through at `α (1 − α)`.

### Custom parts

A `mesh` profile is a part of any shape ([design note](ui-library/instrument-phase2.md#core-work-item-5-custom-parts), Rendering
Model 2D.2). A part uses it with `kind: "custom"` (or the kind of the part it replaces) and keeps everything a parametric
part has: `material` (the scene's recipe, so themes apply), `at`, `pose`, `caster`, `emitter`, `finish`, `state` and `glass` (the
glass shader draws the mesh); it carries no `captured` content and no `stand`. Units are the profile's: part-local px, x right, y down, z up from the face.

```ts
profiles: {
  // inline: the triangles are in the scene
  bar: { type: "mesh", positions, indices, normals: "compute" },   // or normals: [...]; uvs optional
  // a reference: core loads it outside any frame
  cap: { type: "mesh", source: { url: "/parts.glb", mesh: "Cap" }, bounds: { low: [-26, -26, 0], high: [26, 26, 15] }, scale: 1.4 },
},
```

| Field | Contract |
| --- | --- |
| `positions`, `indices`, `normals`, `uvs` | Inline. At most 16,384 vertices and 32,768 triangles; every value finite (within ±10,000), indices below the vertex count, no triangle that repeats a vertex; one normal per vertex or `"compute"`; planar UVs when omitted. Refused with the path and the reason |
| `source` | A reference: `{ url, mesh? }` (fetched by core) or `{ data: ArrayBuffer, mesh? }`; a glB, or a glTF with embedded buffers; `mesh` names a glTF mesh or the node holding it (omitted: the file's only mesh) |
| `scale`, `offset` | A reference: glTF units to part-local px (default 1), and a placement added after the axis change (default `[0, 0, 0]`). A glTF vertex `(x, y, z)` becomes `(x, z, y) · scale + offset`: the model stands on the face, its front towards the bottom of the screen |
| `bounds` | `{ low, high }` in part-local px **after `scale` and `offset`**. Required on a reference, optional inline; core checks every vertex against it (1/1000 of its size and 0.01 px of slack) |
| `pivot` | The default `pose.pivot` of a part of this profile whose pose gives none |

- **Winding and normals.** A triangle is wound against its vertex normals, whatever order it was authored in; computed
  normals come from a closed mesh's winding (a mesh wound the other way is reversed first), so no top is lit as if it
  faced inward.
- **Validation is cached.** An update validates its scene each time, so an inline mesh is validated once per input: pass the
  same arrays (or the same profile object) and nothing is checked again; pass new arrays to change it. A URL reference with
  the same `url`, `mesh`, `scale`, `offset`, `bounds` and `pivot` is one profile across updates.
- **Containment.** The check of every part runs on the mesh's own vertices over the whole travel. A mesh that cannot stay in
  its object's `bounds` steps the object down to its Relief primitive (`reason: "containment"`, `part: "custom"`, with the
  inset and overshoot): refused, never clipped.
- **Loading.** A reference loads once, outside any frame, with Core's own glB reader (positions, normals, `TEXCOORD_0`,
  indices, node transforms; no Draco, meshopt, quantization, sparse accessors, external buffers or skins; materials,
  textures, animations and morph targets are ignored). Until it is ready, and if it fails, the part is not drawn and is not
  checked (or, with a `fallback`, its stand-in draws: below); every other part of the layer draws, no scene is rebuilt and no object
  steps down *for the load itself*: the file's triangles replace the mesh's placeholder in place (`resizeMeshGeometry`) in the
  frame that binds them, the frame the finished load asks for. (What the real triangles then show is checked like any part's: they
  may refuse the object's containment, or push the layer's custom triangles over their budget.) A failure (a 404 or other HTTP status, a
  server answering with an HTML page, a body over 8 MiB, 15 s, a malformed file, a mesh that is not there, a cap, a mesh
  that leaves its declared `bounds`, the asset budget) leaves the part out and reports its reason; GPU stays on.
- **Stand-ins (`fallback`).** A custom part may carry `fallback: [part, …]`, up to 8 parametric parts (any of its own `kind`,
  `profile`, `at`, `pose`, `material`, `caster`, `state`; a mesh profile or a nested `fallback` is refused). Core draws them while the
  part is `loading` and after it `failed`, and stops drawing them in the very frame it draws the mesh (the in-place swap above), so
  there is no frame with both and none with neither. Validation expands each into a part marked `fallbackFor` placed before its
  custom part (validated scenes validate again), so they count as parts in the budgets. `customParts[].showing` reports `mesh`,
  `fallback` or `none`. The Strata knob's custom cap uses it with the built-in cap, chamfer and pointer.
- **Cache.** Parsed triangles are cached per engine by `url`, `mesh`, `scale` and `offset` (a buffer by identity) under 32 MiB (the budget bounds this parsed cache; Lite's own retained CPU copy and GPU buffers are not counted);
  the least recently used entry no scene uses is evicted first, and a load that would pass the budget with every entry in use
  fails (`budget`). A failed entry is forgotten once no scene uses it, so a scene that asks again retries. The store goes
  with the controller (in-flight requests are aborted); the geometry on the GPU goes with its scene.
- **Budgets.** The triangle budget counts each part's base mesh, not the glow copy of a lens or the exact twin of a glass window. Custom parts count as parts (2,048 per layer, 6,000 per stage) and each distinct mesh with each material is a
  part kind. Above 1,000,000 drawn triangles of custom parts in a layer (instances times triangles), the last objects that
  hold custom parts step down (`reason: "budget"`, the triangle count in `detail`) until the layer fits.
- **Casters.** Without `caster`, a mesh casts the xy extent of its posed convex hull at its mean height, as round as the hull,
  with the height capped so that the shadow stays inside the object's `bounds` (the Fader's rule; a footprint within 1 px of the box
  leaves no room for a shadow, so the cap is 0 and the part casts nothing); an explicit `caster` is honoured as given.
- **Diagnostics.** `state().instrument.layers[].customParts` lists each custom part (`object`, `part`, `profile`, `source`,
  `status`: `loading`, `ready` or `failed`, `error`, `vertices`, `triangles`); `state().instrument.assets` the store
  (`entries` with their `bytes`, `fetchMs` and `parseMs`, `bytes`, `budgetBytes`, `loads`, `hits`, `failures`, `evictions`, `inFlight`,
  and `uploads`: how many times, and how long, a mesh's geometry was replaced in place); `state().instrument.budgets` gains
  `customTrianglesPerLayer`.
- **Not in this version:** textures from the file, animation, skinning, and the design language's anchor fitting
  (`fitCustomPart`): fit with `scale` and `offset`, or in the helper.

### Emitters and the pointer light

Lamps, LEDs, lit rings and the pointer light are **emitters**: point lights a version 4 scene carries, at the Relief,
Objects and Instrument levels ([design note](ui-library/instrument-phase2.md#core-work-item-2-emitters-and-the-pointer-light),
Rendering Model 2D.4). The `relief` material takes them in a version 4 scene without a camera, the `objects` material
in one with a camera (both `kind: "relief"`, the default), the `instrument` material in its own; versions 1 to 3 refuse
them, and a version 4 scene without emitters shades as before.

| Field | Contract |
| --- | --- |
| `emitters` | Up to 1,024 `{ position: [x, y, z], colour: [r, g, b], strength, radius, reach, face }`: layer px with `z` above the face, colour channels 0..1, `strength` at least 0, `radius` above 0, `reach` `"outset"` (default: the layer's box and outset) or `"layer"` (the layer's own captured content only: the pointer light), `face` 0..1 (default 1: the share of `strength` on the face; parts take all of it) |
| `protected` | Up to 4,096 rects `[x, y, width, height]` (the layer's text runs), or `"extent"`. More than 64 protect the layer's whole box (reported) |
| `feather` | 0..16 px, default 4: how far outside a protected rect the guard eases off |

- **Drawing.** A lit layer gets a face pool pass right after its own pass (before its Instrument parts): over its box
  and its `outset` it multiplies what is on the canvas by `1 + E`, with `E = I · face · colour · cos θ / (π d²)` windowed
  to 0 at `radius`, so a lamp lights its faceplate and the page or the panel beneath past its edge (easing out over the
  outer half of the outset). The relief shading adds each emitter's highlight on bevels, object sides and domes; at the
  Instrument level the parts are lit by clustered lights with the same values.
- **The guard.** Inside a protected rect the face's whole change (the relief, the part shadows and the light together)
  stays within `interior.max`: the light is capped and part shadows are scaled there, easing back over `feather`. A
  protected box (`"extent"`, or more than 64 rects) has its caps per cell of a 16 × 9 grid, so the part shadows and the
  light stay everywhere at most `interior.max` from the face. A layer adds no light to the text of the layers beneath
  its outset (their protected rects, mapped into its space): each layer's text takes light from its own layer only.
  Part shadows inside protected areas are guarded whether or not the scene has emitters (2D.4's face factor). Not held:
  text on bare ground (inside no relief entry) takes the relief's cast shadows at full strength, as Relief never guarded
  it; caps step at the cells' borders; under a protected box the relief highlights are off.
- **Budget.** A layer draws the 64 emitters that give light and reach furthest into it (scene order on ties); the rest
  are dropped and reported, never a validation error, and GPU stays on.
- **`handle.setEmitters(emitters)`** replaces a version 4 scene's emitters without validating, repacking or rebuilding
  anything else: the path for a light that moves every frame. It writes uniforms and clustered light data only: no
  capture, upload or hit-geometry change. On a version 4 scene that has no `emitters` field yet, `setEmitters` takes the
  full validation path itself and adds the field (for an Instrument scene, one rebuild of its mesh scene). Core draws
  every frame in which a light was written, whatever the writer's idiom (after such a draw it asks for a lead frame).
- **Diagnostics.** `state().emitters` has the budget (64), `order` (`"core"`, or why the face pools are off), the task
  timing status and, per layer with emitters or protected rects: `emitters`, `lit`, `outOfReach`, `drawn` (scene
  indices), `dropped` (`{ index, margin }`, margin in px of reach), `pass` (`drawn`, `idle` or `off`), `feather`,
  `beneath` (`{ rects, merged, overflow }`: lower layers' text under its outset, merged into one box when it does not fit,
  or the whole outset unlit when nothing fits), `guard` (`rects`, `extent`, `overflow`, `caps` with each rect's
  `light` and `shadow` caps, `cells` with each cell's caps for a protected box) and `gpu` (`lastMs`, `p50Ms`, `p95Ms`,
  `samples`, `total`). `state().instrument.layers[].lights` reports whether a scene has its clustered lights and how many
  are lit. `state().resources.lightPasses` counts the face pools alive (they go with their passes after a queue fence or
  with the engine), and `state().metrics.lightPassesDisposed` counts those released.
- **Instrument scene limits changed:** `emitters` takes up to 1,024 (was 64), `protected` up to 4,096 rects (was 64),
  and `feather` is 0..16 (was 0..1,000).
- **Not in core:** tracking the pointer, `pointer: fine`, the fade, `prefers-contrast` and `forced-colors` are the
  application's (the Strata GPU helper's); core draws what the scene says. Emitters cast no shadows and never move the
  key light.

## Supported boundary, budgets and failure

One engine serves the application surface; there is no per-component engine.
Each layer is drawn as its own blended pass on that engine. Default limits are
32 layers and 2,000,000 captured pixels. Layer budget is 1..64; GPU output is
additionally limited to four times the captured-pixel budget and the public
configured device's dimension limit.
Functional admission places its probe inside the visible part of the output
canvas, so a partially scrolled page can enable GPU; a fully offscreen canvas is
still refused with the same unproven/deferred diagnostic.
Functional admission requires at least 16 CSS pixels on each surface axis for
its independent known-color marker. It uses the same single engine and legal
capture/upload path as content, plus one bounded public GPU readback.
Transparent application pixels are not a failure heuristic. In-viewport probe
occlusion/hit disagreement refuses admission. Offscreen native clip witnesses
are explicitly unproven and defer admission in useful original DOM until visible
and explicitly enabled again; applied-matrix checks cannot substitute for hits.
The output is not revealed until application geometry validates too.
An oversized source is refused even if scaling would fit its visual rectangle:
the owning capture bitmap must contain the untransformed source.

Nested/zero/detached/foreign layers, unbounded overflowing capture content, unsupported
clipping/scrolling/top-layer descendants, custom stacking and out-of-frame
transforms use refusal or diagnosed DOM recovery. Supported dynamic membership,
size and DPR updates reconcile current original geometry and prepared complete
successors in the same renderer/root without healthy DOM recovery or explicit
reentry. Missing/new/grown capture coverage retains the last complete GPU output
until fresh owning native paint can publish the complete successor. This bounded
behavior is not physical seamless-presentation or universal layout qualification.
The bounded adapter-root/enrolled viewport route subtracts actual ancestor scroll
offsets and intersects axis-aligned ancestor client boxes. The same transform-local
clip is registered with public `canvasClip` and applied explicitly in the GPU
shader: native clips alone neither render pixels nor request paint. Native scroll
requests fresh capture while original containers/control state remain intact;
cached complete-frame and resource fences remain unchanged. Supported ancestors
are observed for resize/mutation and read on reconciliation, not globally each
animation frame. Obsolete clips are replaced explicitly and retired originals
clear native geometry. Ordinary external document/axis-aligned ancestor changes
are projection-only; internal viewports and native editing still request fresh
capture. Transformed ancestors, RTL/writing-mode/zoom and mixed visible/clip axes
remain diagnosed framework boundaries, not missing browser-feature proof.
No general CSS clip/scroll engine or physical continuity qualification is implied. Animation
translation is restricted to the explicit contract below.

The adapter alone may move its stable container with `moveBefore`. Never move
React-created descendants, change the root/portal target, detach/populate the
destinations or use an append/remove fallback. Final disposal removes the
owned capture/output canvases; ordinary/overlay destinations remain.

Healthy timeout is not device loss: retained cleanup keeps the original DOM
usable and blocks reentry/final disposal until a confirmed fence or actual loss
permits GPU release. Admission readback promises must also settle: loss does
not falsely cancel an outstanding SDK request. `state()` exposes
`resources.probeElements`, `resources.probeReadbacks` and separate
`metrics.admission` counters/last successful proof. Normal content counters
exclude probe captures, copies, uploads and frames. A never-settling readback
can keep reentry/final disposal blocked; no unsafe forced cleanup is exposed.
See [architecture.md](architecture.md) for ordering and
[verification.md](archive/verification.md) for tested versus untested behavior.

## Transactional animation ownership (Phase 4)

Prepare ownership in **idle DOM** or while **GPU is active** (not while admitting,
recovering or with pending cleanup). In GPU mode the layer's GPU declarations are
lifted only for the synchronous verification below and restored before any
rendering opportunity. A layer must have
neutral controller transform/opacity and explicit inline `transform: none`,
`opacity: 1`, with a computed top-left origin. The adapter rejects important
transform/opacity overrides, individual translate/rotate/scale, overlapping
subtree effects and a source whose computed presentation disagrees with the
compiled effect. CSS requires explicit raw-rule provenance; resolved
`getKeyframes()` alone cannot establish dependency freedom.
The stylesheet `!important` pre-scan no longer throws for cross-origin sheets,
CSS nesting, `@import`, `@container` and similar; it skips what it cannot
inspect, and per-frame computed-style validation remains the guarantee.
Matching stylesheet important transform/opacity overrides are also rejected,
even when the current phase coincidentally matches the static override.
Initial validation inspects readable document/adopted sheets with a 4096-rule,
eight-level budget; inaccessible/imported sheets, nested selector rules,
scoped/dependent groups and matching important rules inside media/supports/layer
groups conservatively reject ownership rather than
pretending precedence is proven.

### Numeric motion for new applications

```ts
import type { MotionDescriptor } from "../underglass";

const descriptor: MotionDescriptor = {
  keyframes: [
    { offset: 0 },
    { offset: 1, x: 70, y: 20, rotation: 10, scaleX: 0.85, scaleY: 0.85, opacity: 0.5 },
  ],
  timing: { duration: 1000, delay: 100, iterations: Infinity,
    direction: "alternate", easing: "ease-in-out" },
};
const motion = controller.createMotion("editor", descriptor);
motion.seek(100);
motion.own();
await controller.enable();
motion.play();
motion.pause();
motion.seek(600);
await motion.release(); // Same-phase native DOM source remains available.
// Or keep GPU: freeze this layer at its current pose and dispose the source.
// await motion.release({ freeze: true });
await motion.dispose(); // Cancels this managed source, not a later replacement.
```

`MotionKeyframe` uses numeric CSS pixels/degrees/scales/opacity and explicit
offsets; omitted channels mean identity, not inheritance or previous-frame
values. `MotionTiming` uses milliseconds and the bounded subset below.
Defaults are delay 0, one iteration, normal direction, linear easing and fill
both, including the internal native source. The descriptor is copied and
entirely compiled before any source is created. No `Element.animate` call or
transform-string authoring is required in the application.

`MotionHandle` delegates play/pause/seek to the GPU owner while owned and the
native source otherwise. `own()` acquires or returns the current ownership;
after release it may acquire again through the same validation, in DOM or GPU. Its
`state().released` means ownership is inactive, not that the source is canceled.
`release()` restores DOM without deleting the source; `dispose()` cancels the
specific managed source. Enrollment removal/runtime disposal also cancel it,
after safe source restoration when GPU-owned. `runtimeResources.nativeMotions`
counts these live sources. The explicit `nativeAnimation` reference is an
interoperability/diagnostic escape hatch; external mutations while owned are
subject to the same conservative conflict policy. It is not necessary for
numeric motion authoring.

### Separate existing CSS/WAAPI compatibility adapters

```ts
const source = originalElement.animate([
  { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 },
  { transform: "translate(70px, 20px) rotate(10deg) scale(0.85)", opacity: 0.5 },
], { duration: 1000, delay: 100, iterations: Infinity,
  direction: "alternate", fill: "both", easing: "ease-in-out" });
source.pause();
source.currentTime = 100;
const playback = controller.ownAnimation("editor", source);
await controller.enable();
playback.play();
playback.pause();
playback.seek(600);
await playback.release(); // The entire shared surface returns to DOM.
// Or: await playback.release({ freeze: true }); // this layer only; GPU stays active.
```

`AnimationPlayback.state()` exposes logical milliseconds/playing/released and
actual retained source time/state/target detachment. During ownership the
original effect's target is null and the source is paused; no second animation
or duplicate control tree runs. GPU capture uses neutral transform/opacity,
so source opacity is not baked and then applied a second time. One canonical
transform drives GPU pixels/native geometry. Releasing, disabling, admission
failure, runtime recovery or disposal returns to DOM and restores the same
source/effect at the logical phase. Inline values/priorities/removals are
restored only for properties whose last runtime write is still present.
Later direct or React-authored changes are preserved, including removal or
priority-only changes and unrelated declarations. Live translate/rotate/scale
dependencies, origin and declaration ownership are checked too; they recover
to diagnosed usable DOM without overwriting the external author.
Relinquished typed presentation properties stay preserved across repeated DOM
recovery callbacks. `runtimeResources.presentationOverrides` counts enrolled
layers with these retained property records; explicit controller/React
transform changes or unenrollment clear them, and final disposal clears all.
Writing the exact same value and priority is not distinguishable from no
change and does not transfer ownership.
Playing sources resume; paused sources remain paused. An ownership handle
cannot be reused after release. Ownership requires no retained cleanup,
outstanding admission readback or initialization/transition.

Supported timing is positive duration <=3,600,000ms, delay 0..3,600,000ms,
integer iterations 1..10000 or Infinity, normal/alternate direction, fill both,
playback rate 1 and document timeline. Two to 32 complete transform+opacity
frames strictly span offsets 0..1. Transform lists are literal
`translate(px[, px]) rotate(deg) scale(number[, number])`, or neutral `none`;
positive scales are 1e-4..1e6, translations <=1e6 and authored rotation
<=36000 degrees. Missing translate Y is zero; missing scale Y equals X.
Global/per-keyframe easing supports linear, ease/ease-in/ease-out/ease-in-out
and valid cubic-bezier with X controls 0..1 and control magnitudes <=1e6.
Overshoot extrapolates transforms; only opacity clamps to 0..1. The entire
channel envelope is checked for finite bounds and singular scales before
source mutation. Seeking accepts finite 0..1e12ms.

Reject percentage/calc/var/environment/inherited dependencies, unsupported
properties, skew/perspective, additive/iteration composition, steps/springs,
reverse/alternate-reverse, other fill modes, iterationStart/endDelay, scroll
timelines and overlapping ownership. Existing animation libraries are **not**
automatic adapters. Controller/React transform changes conflict with an owned
layer. Source target/effect, frames, timing, composition, rate and externally
changed current time are monitored; an observed live conflict uses conservative
DOM recovery instead of partial translation.

`ownCSSAnimation(id, { rule, keyframes })` accepts one top-level CSSStyleRule
with exact `#id` selector and one same-sheet CSSKeyframesRule in the same
document. Timing longhands must match the applied cascade, with time units
normalized; inline animation overrides and dependent/overridden raw frames
are rejected. Media/nested rules, arbitrary selector resolution and general
CSS cascade translation are not supported. The caller passes actual trusted
CSSOM references, as `/paired.html?example=css` does.
In the tested browser, drawable migration can regenerate one exact matching
CSS association and cancel the detached original. The adapter retains that
replacement explicitly, pauses/detaches it, preserves original logical time
and cancels it on restoration. Repeated or incompatible regeneration refuses
GPU. `runtimeResources.cssReplacementSources` counts this bounded exception.

`advance(frames, milliseconds)` is a bounded real-RAF deterministic timeline
driver (1..10000 frames, step 0..1000ms), not a GPU readback or performance
benchmark. It advances even paused owned timelines/effects for deterministic
positions; ordinary Play uses elapsed visible RAF time, capped at 100ms per
frame, with no hidden-time catch-up. Reduced motion pauses owners/effects and
refuses deterministic motion; forced colors returns to DOM.

## Trusted local module adapter

`mountApplicationModule(options, module)` mounts an **already imported,
trusted local** `LocalApplicationModule`. There is no URL loader, sandbox,
arbitrary unchanged-app compatibility, hydration or animation-library adapter.

```tsx
const controller = mountApplicationModule(options, {
  mount({ container, enroll }) {
    const root = createRoot(container);
    flushSync(() => root.render(<ExistingLocalApp />));
    const unregister = enroll({
      id: "existing", element: container.querySelector("#existing")!,
      layout: {}, transform: {}, preserveStyles: true,
    });
    return () => { unregister(); root.unmount(); };
  },
});
```

The module owns one root and must return its synchronous unmount callback;
it must clean its own partially created root if mount throws. `enroll` accepts
original connected direct-root layers, not cloned/reparented controls.
`preserveStyles` leaves existing declarations intact in DOM; GPU temporarily
transfers only transform/opacity/origin and restores still-owned
values/priorities/removals without overwriting later application writes.
Other existing styles are not normalized. Nonneutral existing presentation
requires supported explicit ownership, not silent duplication. Layout,
stacking, clipping and capture-budget policies still apply.

## Decorative ripple (Phase 5)

`Surface decorative` supplies inert, aria-hidden and pointer-transparent
semantics. Local-module enrollment instead sets `decorative: true` and must
already provide equivalent native semantics. `setRipple(id, { amplitude,
seconds, playing? })` accepts amplitude 0..12 CSS px and seconds 0..1e6.
`setRipple(id, null)` removes the effect. Amplitude zero is identity.
Running time wraps at 1000 seconds; explicit values remain deterministic.

The shader radially displaces **texture sampling**, attenuating near the
decorative layer's border. It changes no native geometry. Interactive/editable/
focusable/link/dialog/popover descendants are rejected; live loss of decorative
eligibility uses diagnosed DOM recovery. Essential controls must be separate
unenhanced layers. Effects/resources clear on DOM return/disposal. Reduced
motion uses identity and pauses effect time. This is one bounded demonstration,
not an arbitrary postprocessing or motion toolkit.
