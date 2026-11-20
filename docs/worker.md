# Experimental worker compositor

This opt-in WebGPU backend moves texture upload, shared GPU composition and
decorative animation scheduling to an application-owned module worker. React,
DOM/layout, native paint/capture and original controls stay on the main thread.
It is **not** worker-side HTML rendering, an arbitrary-app adapter, or a promise
of better performance than the browser's CSS compositor. The default runtime
is unchanged.

Chrome Canary with HTML-in-Canvas enabled is required:
`--enable-blink-features=CanvasDrawElement,ElementCanvasTransform`
and `--enable-experimental-web-platform-features`. Functional admission checks
owning capture/upload/output pixels and original native hit geometry; method
presence alone is insufficient. Current automated proof uses installed
Chrome157.0.8100.0, revision
`@799dbe91dfe8604f0327d070ecd6d2792a7d3d63`.
WebGL2, other browsers, physical displays and everyday profiles are unqualified.

## Build and application setup

Generate literal shader source and bindings before bundling. This example is
equivalent to `fixtures/worker/app/prepare.mjs`:

```js
// prepare.mjs; run in Node before the application build.
import { writeFile } from "node:fs/promises";
import { workerCompositorProgram } from "@underglass/react/build";
await writeFile(new URL("./program.json", import.meta.url),
  JSON.stringify(workerCompositorProgram(8)));
```

```ts
// thread.ts; the application's worker entry.
import { startWorkerCompositor } from "@underglass/react/experimental-worker/thread";
startWorkerCompositor(self);
```

```tsx
import { useState } from "react";
import { Box } from "@underglass/react";
import { mountWorkerCanvasApp, WorkerSurface, type WorkerProgram } from "@underglass/react/experimental-worker";
import program from "./program.json";

function App() {
  const [value, setValue] = useState("");
  return <>
    <WorkerSurface id="editor"
      layout={{ x: 20, y: 20, width: 280, height: 200, padding: 12 }}
      appearance={{ background: "white", color: "black" }}>
      <Box layout={{ direction: "column", gap: 8 }}>
        <label htmlFor="name">Name</label>
        <input id="name" value={value} onChange={event => setValue(event.target.value)} />
      </Box>
    </WorkerSurface>
    <WorkerSurface id="art" decorative animation="ripple"
      layout={{ x: 320, y: 20, width: 200, height: 200 }}
      appearance={{ background: "#2f80ed" }}>
      Decorative artwork
    </WorkerSurface>
  </>;
}

const controller = mountWorkerCanvasApp({
  ordinaryHost, canvasHost, width: 640, height: 320,
  program: program as WorkerProgram,
  createWorker: () => new Worker(new URL("./thread.ts", import.meta.url), { type: "module" }),
  onStatus: message => { statusElement.textContent = message; },
}, <App />);
// Useful original DOM is the initial presentation.
const admitted = await controller.enable();
if (admitted.mode !== "gpu") console.info(admitted.reason);
// Later: await controller.disable(); await controller.dispose();
```

Hosts must be empty, connected, distinct and in the same document, outside
React-owned roots. The application owns their common frame and positioning;
`canvasHost` contains the adapter-owned canvas, not a pretransferred canvas.
Neither mounting nor `WorkerSurface` clones controls. The adapter may move only
its persistent root container using connected same-document `moveBefore`.
A first render that throws (and that no error boundary in the application
catches) makes `mountWorkerCanvasApp` throw it, on React 18 and 19: the root is
unmounted, the container removed and the controller's observers and listeners
released before it returns, so the hosts are empty again.
Layout/appearance compile to browser styles internally, not a custom layout engine.

Vite requires `worker: { format: "es" }`; see the executable fixture's
`vite.config.ts`. Worker bundling is verified with Vite, not webpack.
The separate CSS compiler's Vite/webpack coverage does not qualify webpack
workers or automatic compiled-CSS integration with this backend.
The program generator supports capacity1-8; increasing membership beyond its
chosen capacity is refused rather than synthesizing a shader at runtime.

All worker shader-source/binding generation occurs in `prepare.mjs`.
Runtime supplies snapshots, dimensions, uniforms and clock/lifecycle messages,
and the browser/driver still creates device-specific GPU pipelines.
Neither experimental runtime bundle parses authored CSS or generates WGSL.
Existing noncompiled main-thread routes retain their runtime generation.
Programs are trusted application build artifacts, not untrusted shader input.

## Deliberately bounded surfaces

Essential surfaces and their original native control rectangles must stay
fixed. Main-thread native geometry is synchronized before transferring images;
asynchronous worker updates are not a proven atomic GPU/native-hit transaction.
Animating an interactive surface is therefore refused, not approximated.
The wider main-thread runtime remains the route for supported interactive motion.

Decorative surfaces are `inert`, `aria-hidden` and must contain no interactive
descendants. They may be added, removed and repositioned while GPU remains
active. Available built-in presets are `none`, two-second repeating triangular
`opacity` (1 -> 0.35 -> 1), and `ripple`. Opacity uses the same native WAAPI
preset in DOM mode; ripple becomes static original content there. These are
explicit presets, not translation of arbitrary CSS or animation libraries.
GPU admission starts the preset clock anew; seamless phase continuity across
disable/reentry is not promised.

Refused source boundaries include subtree CSS/WAAPI animations other than the
adapter's own fallback, unenrolled direct root content, transforms/filters/blend
on the enrolled root, changed essential control geometry, contenteditable,
dialogs/popovers, select and native-picker inputs. Errors identify a framework
source boundary, not an invented missing browser capability. IME, selection,
scrolling, portals and picker compatibility beyond the tested ordinary input
are not certified for workers.

Supported content edits, decorative membership/layout changes, viewport and
emulated DPR updates retain GPU. Reduced motion and forced colors render
static identity decoration, including zero ripple amplitude, while retaining
GPU ownership. Visibility pauses/resumes worker scheduling; only synthetic
visibility events have been verified, not real OS/background throttling.

## Capture, metrics and lifecycle

The owning canvas has `content="drawable"`; enrolled original descendants also
have `drawable`. Main-thread native paint produces transferable `ElementImage`
snapshots. Its associated OffscreenCanvas, not an unrelated canvas, receives
them. The worker uses public Lite and
`GPUQueue.drawElementImageToTexture`; no private device field is used.

GPU-only animation reuses uploaded textures without React renders/capture.
Each dirty native paint currently captures every enrolled layer; dirty-layer
optimization is not implemented. The mailbox holds at most one in-flight batch
and the newest pending complete batch. Superseded unsent images are closed;
transferred images are closed only after submitted GPU work completes.
Two million output pixels and the prebuilt layer capacity bound admission.

`state()` exposes main resource/capture/transfer counters.
`statistics()` requests worker upload/frame/texture-byte/resource counters.
Frame interval/work samples retain at most20,000 entries; paint diagnostics
retain16 entries. Worker intervals measure actual rAF callbacks, including gaps
across snapshot publication; publication draws are not rAF samples. Visibility,
media and stop clock resets exclude explicitly paused time. Texture bytes are
texture accounting, not RSS, browser or driver memory.
`settle()` waits requested native paint and current mailbox work,
not all future animation; it rejects hidden pending-paint settlement explicitly.

Disable/disposal first stops publication and awaits in-flight work. The worker
then stops scheduling, fences a healthy queue, closes transferred snapshots,
releases renderer/effect/textures/engine and acknowledges completion. Only then
may the main thread clear geometry, restore the **same** original root to DOM,
wait two visible frames and terminate/remove the old worker/canvas. Early DOM
restoration hung the tested Canary and is not a safe shortcut.

A stop acknowledgement timeout after10seconds rejects with explicit
**cleanup pending** and truthful retained resources. It does not destroy an
unknown healthy queue or claim successful DOM rollback. A later disable/dispose
retry can complete when the worker acknowledges. The synthetic11second delayed
reply is tested; genuine worker crashes, never-returning queues and hardware
hangs remain unqualified failure boundaries. Do not ignore lifecycle rejection.
A worker that never acknowledged `init` (script 404, CSP, syntax error, or one that
never calls `startWorkerCompositor`) has not used its queue: admission
terminates it immediately, removes the canvas, keeps the original DOM and returns
a diagnosed DOM-mode state instead of waiting for a stop acknowledgement. Worker
`error`/`messageerror` events reject pending requests. Unknown request types
are answered with an error reply.

The backing store follows the device pixel ratio but is clamped (effective ratio
reduced) to the 2,000,000 pixel budget, so DPR/zoom changes never revoke GPU;
only a CSS extent that exceeds the budget at DPR 1 is refused at construction.
The worker clock is wrapped at 1000 seconds like the main renderer. Texture
size comes from the declared ElementImage default size; the transferred image's
own reported size is not cross-checked because its unit is unqualified.

Each successful reentry uses a fresh canvas/worker because transfer is irreversible.

## Reproduction and measured conclusion

Use Node24 for repository validation. These commands create fresh physical
execution trees and extract the actual package; do not reuse their generated
workspaces/dependencies/caches for another proof:

```sh
node scripts/worker-validation.mjs --react18 --functional-only
node scripts/worker-validation.mjs --functional-only
# Run this alone, after other browser/build/measurement helpers have closed:
CANVAS_WORKER_EXCLUSIVE=1 npm run test:worker
```

Functional gates cover owning glyph/motion pixels, original controlled input
and trusted Save, current native hits, focus/value/selection rollback and
reentry, decorative updates, media, live emulated DPR changes, diagnosed source
refusals, cancellation/concurrent disposal, delayed stop/retry, synthetic
device loss and zero resources after healthy disposal.

The benchmark compares the same eight-layer React app and seven opacity
animations across ordinary CSS/WAAPI **Underglass DOM fallback**, existing main-thread
Underglass and the prebuilt worker route. This CSS baseline still contains Underglass's DOM
bookkeeping; it is not an independently unadopted application.
Three repetitions rotate execution order, with500ms warmup and2seconds measured
per cell. Contention combines a React update every80ms and45ms synchronous
main-thread work. Raw before/after counters and timing samples are retained.

Worker clock continuity under this synthetic load is useful evidence, not a
CSS speedup. Main/worker rAF intervals are not displayed frames; CSS animations
may already run on the browser compositor independently of main rAF.
CPU submission work is not GPU execution and no input-to-photon latency was
measured. Current run identities/results are in the
[verification matrix](archive/verification.md#experimental-worker-compositor).
Independent acceptance, production budgets, hardware/accessibility and
publication remain separate gates.
