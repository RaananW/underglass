# Current open issues and qualification register

**Repository restructuring:** current library/package ownership is
`packages/react`, demo/page ownership is `examples/playground`, and tests
are grouped under `tests/unit`, `tests/browser` and `tests/helpers`.
Historical paths in accepted records below identify their original layouts;
they are not rewritten or requalified by this migration.

**Showcase preparation:** the separate private `examples/showcase` React gallery
uses public Underglass examples, default DOM and explicit experimental GPU admission.
[Pages preparation](showcase.md) is not hosted deployment, production,
accessibility, licensing or publication qualification; all existing gates below
retain their scope.

**Implemented experiments (2026-10-12):** the
[build-time CSS compiler](../packages/css-compiler/README.md) and
[worker compositor](worker.md) have bounded implementer proof, not independent
acceptance. JSON-selected Vite/webpack CSS/Sass/PostCSS/Modules and inert
worker decoration do not close SCOPE-002 or any production/manual gate.
Worker interactive geometry stays fixed; real worker crashes/never-returning
GPU fences, webpack workers and automatic compiler/worker integration remain
unqualified. [Current results](archive/verification.md#experimental-worker-compositor)
establish scheduling continuity, not a measured CSS presentation speedup.

**Engineering changes 2026-10-13 (implementer-verified, not independently accepted):**
GPU is revoked for CSS/WAAPI animation only on enrolled boundary elements that
animate GPU-owned properties; descendant animations stay in GPU mode. Structural
policy checks are cached, React commits coalesce into one reconcile, and paint
uploads only changed/stale layers. Transitions pause while hidden; Surface
updates during motion no longer throw; `animate` accepts `{ duration }`;
admission probes the visible part of the canvas; `onStatusChange` was added;
CSS-compiler and worker fixes landed. No existing ID changed status. Upstream
check: WICG proposal `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09),
Chromium hotlist 6783002 not accessible (sign-in), Chrome Canary 157.0.8102.0 on
Windows 11. Details: [api.md](api.md#changes-2026-10-13).

**As of 2026-10-11; accepted source checkpoint:**
[`12f13661`](https://github.com/RaananW/underglass/commit/12f13661978a9329331bf881af6aca526402d4d0).
This is a documentation register, not GitHub tickets, assigned work, release
approval or a new test verdict. IDs remain stable when status changes. No owners,
deadlines or severity rankings have been assigned.

No unresolved current-code defect was reproduced in the latest independently
accepted **bounded** core/external-scroll/task-workspace checks. That does not
establish unrestricted framework correctness. Unsupported scope, tests not
performed, historical anomalies and permanent integrity exceptions below are
different from currently failing supported code.

## Closed defects, with limits

| ID | Current disposition and evidence | Closure boundary |
| --- | --- | --- |
| REL-001 | **Closed 2026-10-20: SCOPE-005, release preparation.** The five library packages (`@underglass/core`, `@underglass/react`, `@underglass/vue`, `@underglass/css-compiler`, `@underglass/ui`) have complete npm metadata, no longer carry `"private": true` and pack to the expected files; [releasing](releasing.md) documents the one-time local first publish (placeholder versions), the trusted-publisher setup and what the first real version is; [distribution](distribution.md) is updated. License: Apache-2.0 (2026-10-14). Release tooling (lockstep Changesets versioning, a CI changeset check, a Release workflow gated on `RELEASES_ENABLED`, the self-hosted GPU runner and an `npm` environment) is in place. | Closed by the release-preparation decision (the first publish was the owner's; performed 2026-10-21, when `0.2.0` of all five packages was published from CI with provenance), not by production qualification. Security review, observability, a demonstrated rollback and agreed correctness, compatibility and performance gates for production use remain unperformed; the packages are experimental. |
| FIX-001 | Structural Layer/Replace-ref blank-frame readmission, native editor caret/composition recovery, root/enrolled clipping and unavailable initial admission proof were corrected in [cfa9df73](https://github.com/RaananW/underglass/commit/cfa9df73f98e075de0559a18fe42e9fb75c13a79), independently accepted with limits. Same-root complete publication and fresh owning paint replace healthy structural readmission. | Closed for the measured current-API subset, not physical-display continuity, every CSS layout or universal text fidelity. Historical Phase12 verdicts and four v7 frames remain unchanged. See [architecture](architecture.md#gpu-first-contract) and HIST-001. |
| FIX-002 | Ordinary document/external axis-aligned scroll projection and native border/padding origin were independently accepted and persisted in [ab598c00](https://github.com/RaananW/underglass/commit/ab598c00c320dec383377b78b29a328a82e26d84). Original focus/locator/editing workflow and pixel/native-hit checks passed. | Not arbitrary transformed ancestors, RTL/zoom/writing modes or future browser qualification. Actual157 replaced owning canvas observed scroll0; nonzero owner-canvas scrolling is inapplicable to that qualified case, not a missing capture feature or simulated success. |
| FIX-003 | Phase13 selected task workspace and actionable diagnostics are qualified-accepted at `12f13661`. Three-file diagnostic repair: `src/apps/todo/diagnostics.ts`, `tests/todo.test.mjs`, `tests/todo.unit.test.mjs`. Actual offscreen reason containing "explicitly enable again" now reports admission, not lifecycle; explicit disable still reports lifecycle. | Native workflow proof is inherited from the unchanged bounded application checks; fresh repair proof covers classification, actual peer-qualified status/native state/refusal/reentry/disposal, not a rerun of every workflow or 300-frame interval. INT-002 remains a permanent exception. See [task workspace](archive/task-workspace.md). |
| VAL-007 | **Closed 2026-10-14 as superseded: historical exact browser gate.** Some Phase6/7/8 evidence used Chrome154.0.8037.98; qualification is now made against the installed Canary build (157.0.8102.0 at time of writing) via functional probes, so the exact154 gate is no longer pursued. | Closed by explicit superseding browser decision, not by qualifying154: a configured label, upstream Fixed status or current157 pass does not retroactively qualify154. |

## Unperformed validation

| ID | Status, impact and reference | Concrete closure criterion |
| --- | --- | --- |
| VAL-001 | **Open: OS IME/candidate UI.** Automated composition events and original input/textarea checks do not qualify a real operating-system input method. [Operator checklist](archive/adoption.md). | Record actual browser/build, OS/input method, trusted composition/candidate selection, final values/caret/focus and useful recovery on the original controls; independent acceptance for the selected configuration. |
| VAL-002 | **Open: spoken accessibility.** Accessible-tree/labels/keyboard/forced-colors checks are bounded automation, not a screen-reader audit. [Adoption](archive/adoption.md), [verification](archive/verification.md). | Perform and record a named real screen reader's spoken navigation, editing, announcements, dialogs/portals and focus return in DOM and GPU modes, and the Instrument scripts (a knob with units, a lamp's state, a live StatusLight's announcement of a changed label); independently assess the selected app. |
| VAL-003 | **Open: physical display and frame join.** Decoded screenshots, GPU queue completion and asynchronously joined counters do not prove a physical refresh/native-input transaction or flicker-free display migration. User observations are separate evidence. | An authorized actual display/DPR migration and causal output/native-hit/frame observation with attributable source/browser/device/timing and retained original state; no substitution of emulated DPR or screenshot arrival for physical acknowledgment. |
| VAL-004 | **Open: everyday profiles and genuine background throttling.** Clean headless/headful profiles and synthetic visibility are not certification of the user's everyday profile or an actually backgrounded document. [2026-10-10 observations](archive/adoption.md) lack exact browser/mode/timing detail. | Record a selected real profile and genuine background/return workflow, permissions/extensions/configuration relevant to results, state retention, scheduling and diagnostics; distinguish native absence from framework failure. |
| VAL-005 | **Open: hardware/device-loss breadth.** Public configured-device destruction proves that induced loss path, not physical driver reset or multiple GPUs/platforms. [Recovery bounds](architecture.md). | Authorized real hardware/loss scenarios with actual device/browser identity, original state, safe retirement/reentry and independent results; declare the tested breadth rather than generalizing. |
| VAL-006 | **Open: universal text/DPR2 fidelity.** Historical DPR2 mismatch was baseline-identical (23249 pixels/68851 bytes), not pixel equivalence. Current finite DPR1/2 passes do not qualify all fonts, text, selection or display densities. [Measurements](archive/measurements.md). | Matched original-native/owning-output raster and interaction checks across explicitly selected fonts, text/editing/selection, DPI and hardware, with source/capture provenance and declared fidelity criteria. |
| VAL-009 | **Open: Strata adjust-policy defaults.** `@underglass/ui/gpu`'s adjust policy (off by default) steps levels down when the 95th percentile of frame intervals stays over 25 ms for 120 frames, and back up after 600 frames under 80% of it. These defaults are provisional: they were not measured on a low-end GPU (design language section 16). The policy itself is tested with an artificial frame load (`tests/browser/ui-gpu.test.mjs`). | Measure Relief, Objects and Scene pages on a low-end GPU and set the defaults from the measurements. |
| VAL-010 | **Open: Strata's full-stage layers and the captured-pixel budget.** A Dialog or Drawer's scrim, the Scene level's lit backdrop and its confetti layer are each captured as a layer the size of the Underglass root, so they count fully against the 2M CSS px default budget. A page whose panels fill a large root can exceed it when a dialog opens, and GPU then falls back with `Captured-pixel safety budget exceeded`. The showcase's Strata gallery (1040x700, about 3.1M px at the Scene level with a dialog open) raises its budget to 4M, and the Instrument gallery (a wall the size of the stage under up to five panels, plus the scrim, about 5M px on the everyday tab at 1090 px) to 6M. | Present uniform full-stage layers (scrim tint, backdrop, particles) without capturing a full-size texture, or document a budget rule for Strata pages, and test a dialog over a full-viewport panel at the default budget. |
| VAL-008 | **Open: numeric app/hardware budgets.** No agreed production frame/input/capture/resource thresholds or speedup have been established. CPU submission is not GPU execution or physical input latency. [Phase12 envelope](archive/measurements.md#phase12-bounded-engineering-envelope). | Choose app/hardware/workloads and numerical exit budgets, then measure matched DOM/baseline/final paths and independently evaluate correctness and costs. Settled 300-frame zero-churn applies only after preparation/native settling; live editing/caret/scroll paints remain real costs. |

## Instrument gallery findings (2026-10-19)

- **16 materials per Instrument layer (issue #173, narrowed).** Resolved: a scene naming 17 to 64 materials is drawn at Relief as a whole, reported (`budget`, `materials: { count, cap }`, a warning), and the helper warns once per panel and trims its own key bodies to stay under (`StrataGpu.diagnostics`); no silent loss. Still open: the 16 itself (a panel that mixes many component kinds, such as the full synthesiser at 29, is drawn at Relief, so the gallery keeps its panels split) and the first-16-in-scene-order alternative, rejected because a part in the wrong material is worse than a stepped-down layer ([note](ui-library/instrument-phase2.md#the-material-cap-issue-173)).
- **Pool light does not light a bare page (#134).** The GPU stage is transparent so the page's own background shows, and the face pool multiplies what is on the canvas, so a lamp's light past a panel's edge (and on the panel's outset shadow) lights nothing when no layer is beneath it; over the old hard-coded white it tinted the white and the shadow. Workaround: enrol a plain layer of the page colour beneath the panels (the emitters and instrument-conformance pages do). Lighting an unknown page colour would need the page colour on the canvas (reading it, option rejected in #134) or an additive formulation that over-lights dark pages.

- **A button whose background colour transitions** creates a new `key ${colour}` material for each frame it is in flight (a key body per colour), so it can push a scene past the rules mid-animation: the conversion trims it, and the warning re-arms when the panel fits again. This predates the cap work and is now visible.
- **A push button falling back to a Relief key at 12 materials** (resolved with the above): the rule is named `INSTRUMENT_PUSH_MATERIALS`, documented in `button.md` section 11 and reported by `diagnostics` and a once-per-panel warning.
- **The gallery's stage height at a phone's width** (2026-10-19): a stage is one canvas, so at 320 px and DPR 2 it must stay under 4,096 CSS px (the device's `maxTextureDimension2D` of 8,192); the synthesiser with its fifth module is at 4,034 (headless, 274 px stage) and 4,026 (a headed window, whose scrollbar narrows the stage to 259 px), so the gallery hides its intro and trims the envelope faders on a phone. A sixth module, or taller controls, needs the stage split across canvases or a different layout. **Superseded 2026-11-18:** that rule assumed two device pixels per pixel. A phone has 2.6 to 3.5, where a whole group in one column (3,084 CSS px at 412 px wide) is past the limit and GPU presentation was refused. The gallery now shows one content panel of a group at a time on a phone ([showcase](showcase.md)); its tallest stage is 1,907 CSS px (6,675 px at 3.5).
- **The pointer light is not in the helper yet.** The gallery's `pointer-light.ts` does what the plan says the helper will.
- **Input events captured (#167): narrowed, resolved for the JogWheel.** An `input` event captures its layer unless its target carries
  `data-underglass-gpu-value` (`api.md#input-events-and-captures`); the JogWheel's helper marks its input while the GPU draws the dimple, so a
  flick costs no capture per step. Not marked, by design: a Knob and a Fader (their value is a custom-property write that recaptures anyway,
  #165: attribute and custom-property writes recapture the layer and are not in scope here), and every control whose native paint shows the value.
- **The gallery's panels are counted, not merged.** Every panel of the gallery is under 16 materials, measured by `StrataGpu.diagnostics` in `tests/browser/showcase-instrument.test.mjs` (the notes tab lists them): the Pad and Keypad, the latching forms, the indicator and structural forms, the Select and Tabs forms are all in; none is drawn at Relief to fit.
- **The layer pass against the capture (#159): resolved, nothing to fix in core.** The report (numerals under a glass window differ from the object-less layer: 243 of 2,431 pixels at DPR 1, 635 of 9,108 at DPR 2, up to 22 levels) was a measurement artefact: all of those pixels lie in the last rows of the numerals' text boxes, outside the glyphs, where the window's own bottom bevel is drawn (every one is exactly +22 levels, white against the faceplate). The numerals' ink is identical, and so is the layer pass: with no primitives and no objects, with the face primitive, and under a window with the chain off, with SMAA only, bloom only, the default chain and every stage, a text run's 12,960 (DPR 1) and 51,840 (DPR 2) pixels are the same, 0 mismatches ([rendering model 2D.9](ui-library/rendering-model.md#2d9-geometric-guarantees), `core-layer-exactness`). The layer pass and the window's exact twin read the capture with the same `filtered` function, exact on the pixel grid, and no tone, exposure, contrast or post stage touches a captured texel. Against the DOM's own paint the capture differs where the browser rasterizes captured text differently (the display's text at DPR 1: 1,133 of 12,960 pixels, glyph interiors and edges; none at DPR 2), identically for the plain layer and the window; that is the capture, not the layer pass, and it was not read back directly (the capture is uploaded inside the native paint event). The Meter suite now asserts 0 mismatches over the numerals' ink.

- **Captured text is rasterized differently from on-screen paint at DPR 1 (browser finding, found with #159; not an Underglass defect).** In `instrument-glass-core.html` a text run's capture differs from the DOM's own rendering of the same page in 1,133 of 12,960 glyph-area pixels at DPR 1 (up to 120 levels, glyph interiors and anti-aliased edges, 0 background pixels), and in 0 of 51,840 at DPR 2. The plain layer, the face pass and the text under a window show the identical difference, and they read the capture through the same function, so it is the browser rasterizing captured text differently from on-screen paint (probably subpixel/LCD anti-aliasing or hinting on screen against greyscale in the snapshot); this is not confirmed, and the capture was not read back directly (the upload happens inside the native paint event). The faceplate prints differ the same way at both DPRs. `core-layer-exactness` therefore asserts 0 mismatches against the DOM at DPR 2 only, and at DPR 1 asserts that the window's difference from the DOM equals the plain layer's (the glass and the layer pass add nothing to the capture), with the layer and window comparisons exact at both. Build and upstream pin: [upstream notes](upstream/README.md#captured-text-differs-from-on-screen-paint-at-dpr-1-observed-not-filed-in-chromium). Raised as an observation in WICG html-in-canvas#187 (2026-10-21). Still open: a Chromium bug, which needs a repro that reads the capture back directly, if text fidelity at DPR 1 matters.

- **A GPU stage cannot take its height from its content** (the content lives in the canvas): the gallery sets `--ig-stage-height` from its panels.

- **A layout change under an Instrument scene stepped an edge object down for a frame (#156): resolved for a layout change that leaves the structure alone.**
  A media preference (`prefers-contrast`, `forced-colors`, `prefers-color-scheme`) that changes a border changes the layer's box in a frame; core's
  `ResizeObserver` draws it before the scene's producer (the Strata helper's observer, then its `requestAnimationFrame`) can answer, so the scene built for
  the old box was checked against the new one and an object at the edge was drawn at Relief for two composited frames. Core now runs the check against the
  current box and placement, and an object the same scene already passed at the box it was built for, failing only the bounds check, keeps that verdict
  until the next scene ([api](api.md#the-instrument-material)), with a `layout:` warning and `layers[].layoutHeld`. Covered: the layer in place and moved
  by a sibling, DPR 1 and 2, the three preferences, headless and headful (`core-scene-media-change.test.mjs`; before: 2 stepped-down draws per case, after: 0).
  Disclosed, not fixed: a producer that never rebuilds keeps the stale scene, the warning and the count (parts cropped at the new box, none outside it);
  the stale parts are one frame behind a moved control, as every scene is behind its layout. Not this issue: a media change that changes an Instrument
  scene's *structure* (the Lamps at `prefers-contrast: more`: their emitters go off) draws the layer at Relief with reason `pending` for 3 to 6 frames while the
  successor scene builds. Relation to #133 (GPU admission under `forced-colors` failed, now fixed: the admission marker opts out with `forced-color-adjust: none`, covered by
  `forced-colors.test.mjs`): a different path; a `forced-colors` change after admission goes through the path fixed here and the new suite covers it.
- **Same-value mutation records recaptured (#181): resolved.** A same-value `setAttribute` or text write no longer queues a capture
  (`metrics.mutationsIgnored`; [api](api.md#same-value-mutations-are-ignored)); 300 frames of one cost 299 captures before and 0 now. Not covered, by design:
  a custom-property or style write that changes a value, and any write the DOM sees as a change (a different value, an added or removed attribute).

- **A `<canvas>` inside a layer is captured blank (#184): resolved, one limit.** The browser (Canary 158.0.8112.0) captures a nested `<canvas>` only when it is itself `content="drawable"` (an unmarked one only if it is the first thing in its layer). Core now marks every canvas in an enrolled layer while GPU presents and restores the author's value afterwards ([api](api.md#canvas-inside-a-layer)); every variant (2D, WebGL, `preserveDrawingBuffer`, `willReadFrequently`, `bitmaprenderer`, `OffscreenCanvas`, deep, hidden then shown) is captured in every arrangement, at DPR 1 and 2. **Limit:** an `OffscreenCanvas`-transferred canvas raises no `paint` event when it commits, so its pixels stay stale until the author calls `controller.invalidate(layerId)` after drawing it (a core test pins the stale state); core cannot detect it safely. Not marked: canvases in open shadow roots (blank behind other canvases unless the author sets `content="drawable"`; core does not walk shadow roots and its observer cannot see inside them) and canvases that host drawable children (their own bitmap is captured). Filed 2026-10-21 as Chromium 576333009 (attach order) and 576333010 (no `paint` for `OffscreenCanvas` commits); whether the mark is intended to be required is asked in WICG html-in-canvas#187 ([upstream/canvas-in-drawable.md](upstream/canvas-in-drawable.md)). Closure: when the browser captures unmarked nested canvases (the raw `unmarked` probes in `core-canvas-content.test.mjs` fail first), the mark can go; when OffscreenCanvas commits invalidate paint, the `invalidate` step can.

## Phone and frame-cost findings (2026-11-18)

Found while the site was tried on a Galaxy S25+ and in Chrome's phone emulation (Canary 160.0.8169.0, an RTX 3080;
CPU figures with the CPU slowed four times). None is closed in `packages/` yet; the first two are narrowed.

- **The Strata helper builds the whole scene of every panel something happens to, each frame.** `@underglass/ui/gpu` reads
  a panel's DOM (boxes, computed styles, text) to build its scene and compares the result with the last one. Since
  2026-11-19 it does so only for the panels something happened to (a drag, a hover, a transition or a light in them),
  where it did for every panel in each frame anything moved; a stepped blink costs its panel only in the frames its
  light changes. What is left: a panel that changes is still read whole. On the Instrument gallery's synthesiser the
  wheel changes three panels through the page's state (the readout, the sound, the output), so a drag still fills the
  main thread of a CPU slowed four times (about 790 ms of work a second, 33 frames a second on the desktop layout and
  about 40 on the phone layout, from 20 and about 32). Closure: build only the part of a scene that a value or a
  spring drives (a uniform), without reading the panel again, and measure the same pages.
- **Core's policy check reads layout on every drawn frame.** `CanvasRuntime.policy()` reads each layer's
  `offsetWidth` and `offsetHeight` and its viewport clip per frame; in a profile of a page that draws every frame it
  was the largest single function (about 12% of the main thread). The structural half is cached; the geometry half is
  not. Since #331 the pass runs once a frame where it ran more than once: a clock frame ran it twice and a frame of N
  transitions N + 1 times (now 1 and 2), and each owned animation's source check ran three times (now once;
  [api](api.md#policy-checks-per-frame)). What is left: the one pass still reads layout, and a source check still
  reads every keyframe (`getKeyframes()` and its signature, about two thirds of a check), because nothing signals a
  keyframe edit. Closure: cache the geometry half until a transform, a size or a scroll changes it.
- **The clock for playing effects draws apart from the shared draw.** Since writes are drawn once per frame
  ([api](api.md#when-writes-are-drawn)), a page that plays an owned animation or an effect and also writes in that
  frame is still drawn twice in it, as before that change.
- **The output canvas is drawn whole, whatever part of it is in the window.** A stage taller than the window (the
  gallery's on a phone, three windows tall) costs its whole height in every frame. Drawing only the part in view
  would have to keep the part that scrolls into view fresh, which a scroll the compositor does on its own makes hard.
- **A page element over the stage's top left corner can turn tilted layers off.** `enable()` proves that native hits
  follow a tilted layer with a probe near (48, 48) in the canvas. An element of the page that takes the pointer there
  (a fixed header's link) fails the proof (`projective: "failed"`), and every tilt is then refused for the session.
  The home page moves its header out of the way while the check runs. Closure in core: tell a covered witness from a
  failed one, and place the probe where the stage is not covered.
- **A canvas whose size is not a whole number of device pixels can be refused.** In emulation at 412 px wide and
  2.625 device pixels per pixel, `enable()` fails with "Functional probe native grid exceeds prepared texture": the
  probe's texture is sized from the device pixel ratio, and the browser's grid for it from the canvas, which rounds
  up. Not known to happen on a device, whose screen is a whole number of device pixels.
- **One browser test fails now and then on `main`.** `ui-structural-forms.test.mjs` ("two Dialogs, a plate and a
  flush one", DPR 2) failed 1 of 24 runs on `main`'s core and 1 of 48 after the change to when writes are drawn, each
  time with one to five pixels outside the plate's box at its top or left edge. Not investigated.
- **Not tried on a real phone since:** the tilt on the home page's deck, the Instrument gallery's one-panel pages,
  and whether the gallery is fast enough there.

## Transient structure (2026-11-20, issue #262)

A layer that is detached or zero-sized on the GPU is now decided at the next frame boundary instead of at once
([api](api.md#transient-structure)); one that is still in that state then falls back with the same reason, in the first
frame after the task that made it. Covered by `tests/browser/transient-structure.test.mjs` (removal before a passive
release, a hide undone by the next effect, a `key` swap of a passive enrollment, and the three persistent counterparts),
Canary 160.0.8172.0 on Windows 11, headless and headful. Upstream check: WICG proposal
`5d9d970ebc06d1903aa0f4b99ac78655b9922804` (2026-10-30), whose `paint` event fires after the resize and intersection
observer steps of the same rendering update; Chromium hotlist 6783002 not readable without sign-in. What is left:

- **A state that lasts into the next frame still falls back.** React runs a commit's passive effects in a later task,
  and the browser may render in between. An enrollment released only in a passive cleanup can therefore still fall back
  with `Detached enrolled layer`; `useStrataGpu` keeps its layout-effect release (#259) for that reason.
- **The showcase's Instrument to layers switch was not a one-task state.** The stage lost the gallery's fluid form when
  the URL changed, and the gallery left only after the next example had loaded, several frames later: the wall had no
  height all that time. The showcase now changes the stage's form in the commit that swaps the example in; the core
  change alone does not keep GPU there, and should not.
- **A state made inside a rendering update is decided by that update's native paint.** Shown for a layer hidden in the
  page's own frame callback (the paint fired in that frame); not shown for every kind of DOM change.
- **An element removed while enrolled keeps whatever native geometry the browser keeps for it.** The browser refuses
  `clearElementGeometry` for an element that is no longer in the canvas, so core no longer calls it there (a fallback
  with such a layer used to throw in that call and left the page without its ordinary DOM). Whether that element hit-tests
  with its old canvas transform if it is put back into the canvas without being enrolled again was not checked.
- **`z-index` and content beyond the capture bounds stay immediate:** a contract exit and a safety guard
  ([api](api.md#transient-structure)).

## Unsupported or untargeted scope

| ID | Current boundary and impact | Concrete closure criterion |
| --- | --- | --- |
| SCOPE-001 | **Not qualified: arbitrary CSS/transformed or mixed-axis ancestor chains, RTL, writing-mode and zoom combinations.** Supported axis-aligned scrolling is not a general CSS engine. Framework boundaries must not be labelled missing browser features. [Viewport contract](api.md), [architecture](architecture.md). | Select a finite coordinate/layout subset; implement only demonstrated gaps and independently verify live owning pixels/current and old/clipped native hit paths, state and motion across that subset. |
| SCOPE-002 | **Not qualified: general WAAPI/CSS conversion, arbitrary libraries, routes/shared elements, springs and virtualization.** Only finite explicit animation ownership, enrolled direct-root boundaries and the pinned Radix public portal integration are supported. | Select components/timing/layout contracts, preserve one original control tree and independently prove animation ownership, interaction, cancellation, layers and disposal. No unchanged-app promise follows from the current pilot. |
| SCOPE-003 | **Bounded: prerendering and hydration.** The React adapter renders a complete tree to HTML without a DOM (`prerenderCanvasApp` with `renderToString`) and hydrates it in the adapter-owned container (`hydrate`), keeping the served elements as the original controls through GPU presentation and back (`tests/browser/hydration.test.mjs`: markup rendered in Node at build time, React 19, Canary 160.0.8166.0, Windows 11, headless; [guide](guide/server-rendering.md)). Not covered: streaming and Suspense boundaries that hydrate later, React Server Components, framework-owned roots (Next.js, Remix), React 18, Vue, the worker backend. Implementer-verified, not independently accepted. | Select and verify each further target separately: a streaming render with late-hydrating boundaries while GPU presents, a framework that owns the root, and Vue's `createSSRApp`. |
| SCOPE-004 | **Unqualified: WebGL2 runtime direct native capture.** Backend feasibility probes or method presence do not establish this runtime route. Current accepted direct owning-paint capture is public WebGPU. | Demonstrate actual current public backend capture/upload/composition/native hit behavior and supported lifecycle with independent source and installed-consumer proof; do not substitute an inert helper or deprecated syntax. |
| SCOPE-006 | **Bounded: framework adapters other than React.** `@underglass/core` is framework-neutral and plain DOM and `@underglass/vue` pass the shared adapter contract (`tests/helpers/framework-contract.mjs`) against workspace sources in the playground. There is no installed-tarball consumer gate for Vue (like `test:package` for React), no Vue SSR/hydration or Nuxt target, no Svelte/Solid adapter, and Astro is only reachable through a `client:only` island of a supported adapter. Implementer-verified (Canary 158.0.8106.0, Windows 11, headless), not independently accepted. | Add an installed-archive Vue consumer gate (typecheck, build, browser contract at DPR 1/2 with and without HTML-in-Canvas flags); for each further adapter, pass the shared contract plus its framework-specific checks; select and verify any SSR/hydration target separately (SCOPE-003). |
| SCOPE-007 | **Bounded: tilted layers are never clipped.** Chromium hit-tests a projected `canvasClip` by its canvas-space bounding box (crbug.com/573454036, WICG html-in-canvas#186, open). A tilted layer inside a clipping viewport, or with clipped overflowing content, is refused with a diagnosis rather than hit-tested wrongly; Strata keeps such panels flat. Implementer-verified (Canary 158.0.8108.0, Windows 11). | The browser hit-tests a projected `canvasClip` exactly (the WICG issue resolved and shipped in Chromium); then prove clipped tilted layers with old and new hit witnesses, and lift the refusal. |
| SCOPE-008 | **Bounded: CSS anchor positioning from inside a layer.** An element in an Underglass layer is laid out inside the output `<canvas>` (`content="drawable"`). A popover anchored to it (its implicit anchor, through `popovertarget`) is placed from that layout, not from the layer's drawn place, while `getBoundingClientRect` and native hits follow the drawn place: on Canary 158.0.8109.0 (Windows 11) a Strata Popover opened from a GPU panel landed 60 px right and 50 px below its button. Strata's `attachStrataPopovers` places such popovers with script from the button's box instead (`tests/browser/ui-gpu.test.mjs`). Implementer-verified, not reported upstream yet. | Report it to the WICG proposal and Chromium with a minimal repro; once anchor positioning follows the drawn place, drop the script placement and prove alignment on the installed build. |
| SCOPE-009 | **Bounded: the `instrument` material (core work items 1 to 5).** Its mesh scenes are placed after their layers' passes by reordering Babylon Lite's `getRenderingContexts` list in place (guarded: a failed read-back draws every instrument layer at the Relief level, GPU on), because Lite had no ordered insert when this was built (1.39 has `moveRenderingContext`, which core does not use yet). A layer whose matrix is not a similarity draws its objects at Relief. Budgets (2,048 parts per layer, 6,000 per stage) were measured on one fast GPU (RTX 3080); **Emitters (core work item 2)** are drawn at every GPU level, with these limits: captured caps (key labels at Instrument) are drawn after the face pool and are not lit; each layer's face pool joins the same guarded reorder of `getRenderingContexts`, so if Lite refuses the order the light is off at every level (latched for the engine, `state().emitters.order`), GPU on; a face pool's task draws into Lite's swapchain target and disposes it with the task, which Lite (1.33 to 1.39) skips only because that target is eager with no attachment disposer; the guard bounds each side (light, part shadows) instead of clamping their product (2D.4), and part shadows inside protected areas are guarded with or without emitters; the light fades over the outer half of the outset; tile masks bin by reach in the face plane while highlights are evaluated at object height; the guard's caps step at the 16 × 9 cell borders under a protected box (a part shadow can be cut along a straight line), and the relief highlights are off across a protected box; lower layers' text under a layer's outset gets no light from it, merged into one box when it does not fit the block and the whole outset unlit when no slot is left (`state().emitters.layers[].beneath.overflow`); that assumes the upper layer's box is opaque (lower text inside it, rounded corners included, is lit uncapped by its `reach: "outset"` lamps); text on bare ground (inside no relief entry) takes relief cast shadows at full strength, as Relief never guarded it; costs were measured on one GPU with demand-driven clocks. **The post chain and shadow map (core work item 3)** draw every layer's parts through one set of offscreen targets shared by the engine's instrument layers, with a composite clipped to the objects' bounds, captured caps after the chain and the meshes blending as one group at a fractional opacity (the blended-twin limit is gone), but over the layer's already faded face, `α · P + (1 − α) · (α · F + (1 − α) · B)` under an opaque part, not the layer's true group opacity (face content under a part shows through at `α (1 − α)`). Its limits: TAA, contact shadows and SSGI are options (TAA is Lite's plain history blend, which trails on parts that change at once); their resolutions are core constants, not scene fields; the bloom is on or off per lens (its brightness does not follow the emitter's strength) and reads no depth, so a lens behind another part still blooms inside its own box; with TAA on, captured caps test their depth against the jittered parts; a PCF generator's map texture has no public disposal in Lite (1.33 to 1.39), so core destroys it through an internal field when its scene goes (a missing field is counted in `resources.mapTextures.missing` and warned once); the map's texel grows with the stage while the bias stays 1.95 px, so below about 38° of light elevation a 3,840 × 2,160 stage may show acne on thin parts (not measured); `post.targets` may report a stale size for a target no layer uses; every stage runs over the whole target per layer (SMAA and bloom cost about 0.5 and 0.3 ms p50 summed over three layers at 1920 × 1080), measured on one GPU; a stage that fails to build is left out, and a chain that cannot be built steps its layer down with `post`. **Glass and the page probe (core work item 4)** have these limits: glass is a custom shader that traces the model's 2D.6 (clear glass only: `base.roughness` does not frost it); it is not lit by the clustered lights (a lit lens glows through itself, the face pool still lights the face around it), neither casts into nor receives from the shadow map, and over a transparent capture it shows the capture's own alpha; glass over a window's text is exact only inside the scene's `protected` rects and where the window is flat; a captured cap behind glass is drawn over it (caps are composited last); at a fractional opacity glass takes the same blend as the parts (the face under it was faded by the layer pass, so true group opacity is still not drawn: item 4 assessed it, and it needs the face drawn into the chain, a change to every layer's pass, not contained); the page probe is a raw WebGPU cube on the canvas's device (Lite binds its view, never owns it), is on by default for every Instrument layer (16.8 MB at 512 per layer, at most 4 per stage, the rest reflect the studio alone), is anchored at the layer's centre when the scene is built and refreshed (about 1 to 2 ms GPU) at once when the capture is uploaded again or its texture is replaced and, while a layer moves, at most once per 100 ms (its placement quantised to a quarter texel, a trailing refresh once it settles: a scrolling layer costs about 10 refreshes a second, and its reflection lags by up to 100 ms and a quarter texel); a refresh that throws is dropped by rebuilding the layer without its probe (the layer is drawn at Relief while it rebuilds); a GPU error during a refresh (a validation error that does not throw) is not diagnosed: the cube keeps its last content; the probe's creation holds validation and out-of-memory error scopes open across an await, which is safe only because builds are serialised (one at a time); text under a window is exact against SMAA for opaque capture texels (the window's twin draws them, not lit by the face factor); translucent texels (alpha below 1) are drawn by neither shader and follow the face pass (measured within 1 level with the default chain on); `glassInstance` and `partCaster` run for every glass part on every frame and compare the result with the instance data buffer, allocating per part, so a layer with many glass parts pays a per-frame CPU cost growing with their number (not measured beyond the fixture; to fix by running them only when the part's data changed); the probe's far-off or oblique parts see the page at a coarser resolution; a layer's page reflection is not part of the model's reference shading (it is checked by presence only, and not at all in the conformance suite, whose scenes turn it off; every browser page, `core-glass`, `core-post`, `core-instrument` and `core-emitters`, runs with it on); like the studio's, it is not occluded by the shadow map (the map scales the key term only), and the measured band depth on plinths and plates is the same with and without it; the probe samples the capture with hardware bilinear filtering on straight-alpha texels, so colour bleeds dark at alpha edges and at the content edge of a retained texture larger than the content (the cube's mips blur it; low impact); a resize or DPR change goes through the same 100 ms throttle as a move unless it replaces the capture texture; costs were measured on one GPU with demand-driven clocks. **Custom parts (core work item 5)** validate inline meshes and load glB/glTF references outside any frame; their limits: core's own glB reader reads positions, normals, `TEXCOORD_0` and indices of triangle lists only (no Draco, meshopt, quantization, sparse accessors, external buffers, skins, textures, animation; Lite's `loadGltf` was judged from its typings and not exercised); a part with no `fallback` is absent while its file loads and if it fails (with one, core draws the stand-in until the mesh is there, and the Strata knob's custom cap passes the built-in cap, chamfer and pointer), and a file's arrival can still push a layer's custom triangles over their budget or refuse an object's containment; the anchor fitting of the design language (`fitCustomPart`, `anchors`) is not implemented, only `scale` and `offset`; the reference implementation in `@underglass/ui/tokens` and the conformance suite do not take `mesh` profiles; a custom triangle budget (1,000,000 per layer), the caps (16,384 vertices and 32,768 triangles per mesh) and the asset budget (32 MiB, 8 MiB per file, 15 s) were chosen from one fast GPU and are not tuned; containment on a 16,384-vertex mesh costs about half a million projected vertices per distinct shape and, near the limit on a moving layer, every frame (the exact path is cached per placement); downloads of one URL that are in flight together are shared, but a mesh of the file asked for later is fetched again, and bytes in hand are not fetched at all; arrays handed to an inline mesh must not be mutated in place (they are cached by identity); the shadow map's fit to the casters' box moves other controls' shadows by a few levels when a mesh arrives; headful Canary was checked at DPR 1 and 2 (viewport emulated). Implementer-verified (Canary 158.0.8110.0, Windows 11, headless and headed), not independently accepted. [Design note](ui-library/instrument-phase2.md). | Lite 1.39's `moveRenderingContext` (or a core-owned frame graph) replaces the reorder; true group opacity of an Instrument layer (the face drawn into the chain; assessed in item 4 and not done: it changes every layer's pass); measure the budgets on a low-end GPU; a Lite option to keep a render task's target on disposal; captured caps lit by the face pool; a Lite call that updates a local environment's projection without a rebuild (L34), so a moving layer need not refresh its probe; a Lite option for TAA with reprojection or clamping, and for a generator's disposal. |

## Unresolved historical anomalies

### HIST-001 - Four private v7 DPR2 frames

**Unattributable and nonexonerated.** One original CDP screencast PNG and three
trace-derived images lacked the private experiment's sentinels and showed
enlarged/truncated output. Image arrival counters were not an atomic join to the
GPU/native source frame. Current complete-frame/publication passes do not prove
these old images harmless or prove a current-code failure.

Reference: retained private v7 raw/provenance assessment (maintainer access via
[archive catalog](archive/archive-catalog.md)); later core differs in native density,
coverage, geometry and capture transport. No new anomaly probe was authorized
as part of the current fixes. Closure requires attributable retained historical
source/image/transport evidence or a separately authorized causal investigation.
A new passing run cannot restore a missing historical join.

## Permanent evidence-integrity exceptions

### INT-001 - Five lost Phase6 original reports

Exactly five originals remain lost: **248/253 genuine original fixture reports**.
Regenerated samples, preserved Git bytes and later passes are not restorations;
no explicit original supersession approval exists. See
[archive integrity](archive/archive-catalog.md#integrity) and [measurements](archive/measurements.md).
The historical provenance gap remains permanent unless authentic original bytes
are recovered and verified; later qualification must remain separately dated.

### INT-002 - One Phase13 generated metadata corruption

Exactly one sealed generated file was mutated:
`evidence/phase13/adoption-v1/react18-workspace/node_modules/.vite/deps/_metadata.json`.
The diagnostic retry reused sealed dependencies through a directory symlink;
Vite wrote optimizer metadata. Original expected bytes are unavailable and were
not reconstructed or restored. **The old adoption-v1 seal is not wholly intact.**

- Expected: 72176 bytes, SHA256
  `8caaae776bc36a5fa84eeec1e45ada2170ae441d6142bcca7285b32b95c54b65`.
- Retained damaged bytes: 72176 bytes, SHA256
  `2e7631f3e9a76c7a05683f55350d03de3a1badcbf245af79fc8d6dc38f17f1ba`.
- Append-only disposition: retained `diagnostic-repair-v2/integrity-ledger.json`
  and damaged-current archive. Other protected source/product/test/raw records
  were verified separately, not covered by an "all old bytes intact" claim.

The subsequent repair used physically isolated dependency/cache trees, actual
React18.3.1/19.3.1 runtime preassertions and independent fresh status proof.
Earlier unidentified React18-labelled runs are not certified React18 evidence.
The fresh acceptance retained this exception explicitly; it did not repair the
historical archive. Closure means preserving/disclosing the exception and
keeping future artifacts isolated, not erasing the damaged file or old seal.
Never execute a new validation through sealed `node_modules`, directory
symlinks to sealed dependency trees, or sealed optimizer caches. Reuse requires
physically independent writable dependencies and explicit owned cache locations,
excluding `.vite`/`.vite-temp` optimizer outputs, with actual resolved/runtime
peer versions asserted before gates.

## Acceptance references and access

Current commit links above identify product bytes. Private independent reports
are retained separately and are available only through maintainer privacy review,
not shipped package assets or public downloads:

| Record | Retained report SHA256 |
| --- | --- |
| External-scroll acceptance underlying `ab598c00` | `cde5dfe7b1900217f9805b519fce42c1ea8af09dda1482834546e7385ba61aec` |
| Initial Phase13 review: diagnostic defect found, native workflow bounded checks passed | `8c0dd5f6c93d7f0b28002706d5248d6d15b93d1d94f43f19c3afaca6bd2ec00f` |
| Fresh three-file diagnostic repair acceptance with INT-002 | `82dd0d7a650e85815e5afff52576d8a6c5617d59a52cd4432e2c780c6eb15c18` |

Keep immutable historical verdicts unchanged. Update this register when a
separately accepted outcome changes an ID's status; link the exact evidence,
scope and source rather than marking unrelated manual/historical gates closed.

### ADM-202 - Seamless first admission: unperformed validation

**Bounded and partly unproven.** The first admission holds the last DOM frame with a view transition for the swap (a few
frames, hard bound 500 ms; [architecture](architecture.md#seamless-first-admission)). Not performed: browsers without
`document.startViewTransition`/`activeViewTransition` (the swap then has no hold and its first frame can be blank);
pages with a `style-src` CSP that forbids constructed stylesheets (the hold is then skipped; untested); other GPUs and
drivers (one Windows 11 machine, Chrome Canary 158.0.8114.0); recordings in CI headed runs (headed was run locally);
GPU load beyond one synthetic compute load; pages that run their own view transitions during enable (the hold is skipped
by design, untested here). Known limits: a pointer event wholly inside the hold (about 50 ms) is not delivered (hit
testing returns the document root during a view transition; a press in progress delays the swap instead); a tab hidden
while the functional probe runs falls back to DOM with a diagnosis rather than waiting (hidden between the probe and
the swap waits); the heavy Instrument page still builds its post chain progressively for about 0.5 s after admission.
