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
| VAL-010 | **Open: Strata's full-stage layers and the captured-pixel budget.** A Dialog or Drawer's scrim, the Scene level's lit backdrop and its confetti layer are each captured as a layer the size of the Underglass root, so they count fully against the 2M CSS px default budget. A page whose panels fill a large root can exceed it when a dialog opens, and GPU then falls back with `Captured-pixel safety budget exceeded`. The showcase's Strata gallery (1040x700, about 3.1M px at the Scene level with a dialog open) raises its budget to 4M. | Present uniform full-stage layers (scrim tint, backdrop, particles) without capturing a full-size texture, or document a budget rule for Strata pages, and test a dialog over a full-viewport panel at the default budget. |
| VAL-008 | **Open: numeric app/hardware budgets.** No agreed production frame/input/capture/resource thresholds or speedup have been established. CPU submission is not GPU execution or physical input latency. [Phase12 envelope](archive/measurements.md#phase12-bounded-engineering-envelope). | Choose app/hardware/workloads and numerical exit budgets, then measure matched DOM/baseline/final paths and independently evaluate correctness and costs. Settled 300-frame zero-churn applies only after preparation/native settling; live editing/caret/scroll paints remain real costs. |

## Instrument gallery findings (2026-10-19)

- **16 materials per Instrument layer (issue #173, narrowed).** Resolved: a scene naming 17 to 64 materials is drawn at Relief as a whole, reported (`budget`, `materials: { count, cap }`, a warning), and the helper warns once per panel and trims its own key bodies to stay under (`StrataGpu.diagnostics`); no silent loss. Still open: the 16 itself (a panel that mixes many component kinds, such as the full synthesiser at 29, is drawn at Relief, so the gallery keeps its panels split) and the first-16-in-scene-order alternative, rejected because a part in the wrong material is worse than a stepped-down layer ([note](ui-library/instrument-phase2.md#the-material-cap-issue-173)).
- **A button whose background colour transitions** creates a new `key ${colour}` material for each frame it is in flight (a key body per colour), so it can push a scene past the rules mid-animation: the conversion trims it, and the warning re-arms when the panel fits again. This predates the cap work and is now visible.
- **A push button falling back to a Relief key at 12 materials** (resolved with the above): the rule is named `INSTRUMENT_PUSH_MATERIALS`, documented in `button.md` section 11 and reported by `diagnostics` and a once-per-panel warning.
- **The pointer light is not in the helper yet.** The gallery's `pointer-light.ts` does what the plan says the helper will.
- **Input events captured (#167): narrowed, resolved for the JogWheel.** An `input` event captures its layer unless its target carries
  `data-underglass-gpu-value` (`api.md#input-events-and-captures`); the JogWheel's helper marks its input while the GPU draws the dimple, so a
  flick costs no capture per step. Not marked, by design: a Knob and a Fader (their value is a custom-property write that recaptures anyway,
  #165: attribute and custom-property writes recapture the layer and are not in scope here), and every control whose native paint shows the value.
- **A GPU stage cannot take its height from its content** (the content lives in the canvas): the gallery sets `--ig-stage-height` from its panels.

- **Same-value mutation records recaptured (#181): resolved.** A same-value `setAttribute` or text write no longer queues a capture
  (`metrics.mutationsIgnored`; [api](api.md#same-value-mutations-are-ignored)); 300 frames of one cost 299 captures before and 0 now. Not covered, by design:
  a custom-property or style write that changes a value, and any write the DOM sees as a change (a different value, an added or removed attribute).

- **A `<canvas>` inside a layer is captured blank (Canary 158, found with #181).** In `core-mutation-noop.html` a 2D canvas with drawn content shows its
  bitmap in ordinary DOM and in a screenshot of the DOM presentation, but the GPU capture of its layer paints it as the layer background, also after a redraw.
  Not investigated further (browser or core); a layer that contains a `<canvas>` needs its own probe before it is relied on.

## Unsupported or untargeted scope

| ID | Current boundary and impact | Concrete closure criterion |
| --- | --- | --- |
| SCOPE-001 | **Not qualified: arbitrary CSS/transformed or mixed-axis ancestor chains, RTL, writing-mode and zoom combinations.** Supported axis-aligned scrolling is not a general CSS engine. Framework boundaries must not be labelled missing browser features. [Viewport contract](api.md), [architecture](architecture.md). | Select a finite coordinate/layout subset; implement only demonstrated gaps and independently verify live owning pixels/current and old/clipped native hit paths, state and motion across that subset. |
| SCOPE-002 | **Not qualified: general WAAPI/CSS conversion, arbitrary libraries, routes/shared elements, springs and virtualization.** Only finite explicit animation ownership, enrolled direct-root boundaries and the pinned Radix public portal integration are supported. | Select components/timing/layout contracts, preserve one original control tree and independently prove animation ownership, interaction, cancellation, layers and disposal. No unchanged-app promise follows from the current pilot. |
| SCOPE-003 | **Untargeted: SSR/hydration.** Safe public ESM import is not server rendering; current mounting creates a client root. [Distribution](distribution.md), [task workspace](archive/task-workspace.md). | Explicitly select a hydration/server target, define root ownership and verify real server/client reconciliation and lifecycle without replacing original controls. |
| SCOPE-004 | **Unqualified: WebGL2 runtime direct native capture.** Backend feasibility probes or method presence do not establish this runtime route. Current accepted direct owning-paint capture is public WebGPU. | Demonstrate actual current public backend capture/upload/composition/native hit behavior and supported lifecycle with independent source and installed-consumer proof; do not substitute an inert helper or deprecated syntax. |
| SCOPE-006 | **Bounded: framework adapters other than React.** `@underglass/core` is framework-neutral and plain DOM and `@underglass/vue` pass the shared adapter contract (`tests/helpers/framework-contract.mjs`) against workspace sources in the playground. There is no installed-tarball consumer gate for Vue (like `test:package` for React), no Vue SSR/hydration or Nuxt target, no Svelte/Solid adapter, and Astro is only reachable through a `client:only` island of a supported adapter. Implementer-verified (Canary 158.0.8106.0, Windows 11, headless), not independently accepted. | Add an installed-archive Vue consumer gate (typecheck, build, browser contract at DPR 1/2 with and without HTML-in-Canvas flags); for each further adapter, pass the shared contract plus its framework-specific checks; select and verify any SSR/hydration target separately (SCOPE-003). |
| SCOPE-007 | **Bounded: tilted layers are never clipped.** Chromium hit-tests a projected `canvasClip` by its canvas-space bounding box (crbug.com/573454036, WICG html-in-canvas#186, open). A tilted layer inside a clipping viewport, or with clipped overflowing content, is refused with a diagnosis rather than hit-tested wrongly; Strata keeps such panels flat. Implementer-verified (Canary 158.0.8108.0, Windows 11). | The browser hit-tests a projected `canvasClip` exactly (the WICG issue resolved and shipped in Chromium); then prove clipped tilted layers with old and new hit witnesses, and lift the refusal. |
| SCOPE-008 | **Bounded: CSS anchor positioning from inside a layer.** An element in an Underglass layer is laid out inside the output `<canvas>` (`layoutsubtree`). A popover anchored to it (its implicit anchor, through `popovertarget`) is placed from that layout, not from the layer's drawn place, while `getBoundingClientRect` and native hits follow the drawn place: on Canary 158.0.8109.0 (Windows 11) a Strata Popover opened from a GPU panel landed 60 px right and 50 px below its button. Strata's `attachStrataPopovers` places such popovers with script from the button's box instead (`tests/browser/ui-gpu.test.mjs`). Implementer-verified, not reported upstream yet. | Report it to the WICG proposal and Chromium with a minimal repro; once anchor positioning follows the drawn place, drop the script placement and prove alignment on the installed build. |
| SCOPE-009 | **Bounded: the `instrument` material (core work items 1 to 5).** Its mesh scenes are placed after their layers' passes by reordering Babylon Lite 1.33's `getRenderingContexts` list in place (guarded: a failed read-back draws every instrument layer at the Relief level, GPU on), because Lite has no ordered insert. A layer whose matrix is not a similarity draws its objects at Relief. Budgets (2,048 parts per layer, 6,000 per stage) were measured on one fast GPU (RTX 3080); **Emitters (core work item 2)** are drawn at every GPU level, with these limits: captured caps (key labels at Instrument) are drawn after the face pool and are not lit; each layer's face pool joins the same guarded reorder of `getRenderingContexts`, so if Lite refuses the order the light is off at every level (latched for the engine, `state().emitters.order`), GPU on; a face pool's task draws into Lite's swapchain target and disposes it with the task, which Lite 1.33 skips only because that target is eager with no attachment disposer; the guard bounds each side (light, part shadows) instead of clamping their product (2D.4), and part shadows inside protected areas are guarded with or without emitters; the light fades over the outer half of the outset; tile masks bin by reach in the face plane while highlights are evaluated at object height; the guard's caps step at the 16 × 9 cell borders under a protected box (a part shadow can be cut along a straight line), and the relief highlights are off across a protected box; lower layers' text under a layer's outset gets no light from it, merged into one box when it does not fit the block and the whole outset unlit when no slot is left (`state().emitters.layers[].beneath.overflow`); that assumes the upper layer's box is opaque (lower text inside it, rounded corners included, is lit uncapped by its `reach: "outset"` lamps); text on bare ground (inside no relief entry) takes relief cast shadows at full strength, as Relief never guarded it; costs were measured on one GPU with demand-driven clocks. **The post chain and shadow map (core work item 3)** draw every layer's parts through one set of offscreen targets shared by the engine's instrument layers, with a composite clipped to the objects' bounds, captured caps after the chain and the meshes blending as one group at a fractional opacity (the blended-twin limit is gone), but over the layer's already faded face, `α · P + (1 − α) · (α · F + (1 − α) · B)` under an opaque part, not the layer's true group opacity (face content under a part shows through at `α (1 − α)`). Its limits: TAA, contact shadows and SSGI are options (TAA is Lite's plain history blend, which trails on parts that change at once); their resolutions are core constants, not scene fields; the bloom is on or off per lens (its brightness does not follow the emitter's strength) and reads no depth, so a lens behind another part still blooms inside its own box; with TAA on, captured caps test their depth against the jittered parts; a PCF generator's map texture has no public disposal in Lite 1.33, so core destroys it through an internal field when its scene goes (a missing field is counted in `resources.mapTextures.missing` and warned once); the map's texel grows with the stage while the bias stays 1.95 px, so below about 38° of light elevation a 3,840 × 2,160 stage may show acne on thin parts (not measured); `post.targets` may report a stale size for a target no layer uses; every stage runs over the whole target per layer (SMAA and bloom cost about 0.5 and 0.3 ms p50 summed over three layers at 1920 × 1080), measured on one GPU; a stage that fails to build is left out, and a chain that cannot be built steps its layer down with `post`. **Glass and the page probe (core work item 4)** have these limits: glass is a custom shader that traces the model's 2D.6 (clear glass only: `base.roughness` does not frost it); it is not lit by the clustered lights (a lit lens glows through itself, the face pool still lights the face around it), neither casts into nor receives from the shadow map, and over a transparent capture it shows the capture's own alpha; glass over a window's text is exact only inside the scene's `protected` rects and where the window is flat; a captured cap behind glass is drawn over it (caps are composited last); at a fractional opacity glass takes the same blend as the parts (the face under it was faded by the layer pass, so true group opacity is still not drawn: item 4 assessed it, and it needs the face drawn into the chain, a change to every layer's pass, not contained); the page probe is a raw WebGPU cube on the canvas's device (Lite binds its view, never owns it), is on by default for every Instrument layer (16.8 MB at 512 per layer, at most 4 per stage, the rest reflect the studio alone), is anchored at the layer's centre when the scene is built and refreshed (about 1 to 2 ms GPU) at once when the capture is uploaded again or its texture is replaced and, while a layer moves, at most once per 100 ms (its placement quantised to a quarter texel, a trailing refresh once it settles: a scrolling layer costs about 10 refreshes a second, and its reflection lags by up to 100 ms and a quarter texel); a refresh that throws is dropped by rebuilding the layer without its probe (the layer is drawn at Relief while it rebuilds); a GPU error during a refresh (a validation error that does not throw) is not diagnosed: the cube keeps its last content; the probe's creation holds validation and out-of-memory error scopes open across an await, which is safe only because builds are serialised (one at a time); text under a window is exact against SMAA for opaque capture texels (the window's twin draws them, not lit by the face factor); translucent texels (alpha below 1) are drawn by neither shader and follow the face pass (measured within 1 level with the default chain on); `glassInstance` and `partCaster` run for every glass part on every frame and compare the result with the instance data buffer, allocating per part, so a layer with many glass parts pays a per-frame CPU cost growing with their number (not measured beyond the fixture; to fix by running them only when the part's data changed); the probe's far-off or oblique parts see the page at a coarser resolution; a layer's page reflection is not part of the model's reference shading (it is checked by presence only, and not at all in the conformance suite, whose scenes turn it off; every browser page, `core-glass`, `core-post`, `core-instrument` and `core-emitters`, runs with it on); like the studio's, it is not occluded by the shadow map (the map scales the key term only), and the measured band depth on plinths and plates is the same with and without it; the probe samples the capture with hardware bilinear filtering on straight-alpha texels, so colour bleeds dark at alpha edges and at the content edge of a retained texture larger than the content (the cube's mips blur it; low impact); a resize or DPR change goes through the same 100 ms throttle as a move unless it replaces the capture texture; costs were measured on one GPU with demand-driven clocks. **Custom parts (core work item 5)** validate inline meshes and load glB/glTF references outside any frame; their limits: core's own glB reader reads positions, normals, `TEXCOORD_0` and indices of triangle lists only (no Draco, meshopt, quantization, sparse accessors, external buffers, skins, textures, animation; Lite's `loadGltf` was judged from its typings and not exercised); a part with no `fallback` is absent while its file loads and if it fails (with one, core draws the stand-in until the mesh is there, and the Strata knob's custom cap passes the built-in cap, chamfer and pointer), and a file's arrival can still push a layer's custom triangles over their budget or refuse an object's containment; the anchor fitting of the design language (`fitCustomPart`, `anchors`) is not implemented, only `scale` and `offset`; the reference implementation in `@underglass/ui/tokens` and the conformance suite do not take `mesh` profiles; a custom triangle budget (1,000,000 per layer), the caps (16,384 vertices and 32,768 triangles per mesh) and the asset budget (32 MiB, 8 MiB per file, 15 s) were chosen from one fast GPU and are not tuned; containment on a 16,384-vertex mesh costs about half a million projected vertices per distinct shape and, near the limit on a moving layer, every frame (the exact path is cached per placement); downloads of one URL that are in flight together are shared, but a mesh of the file asked for later is fetched again, and bytes in hand are not fetched at all; arrays handed to an inline mesh must not be mutated in place (they are cached by identity); the shadow map's fit to the casters' box moves other controls' shadows by a few levels when a mesh arrives; headful Canary was checked at DPR 1 and 2 (viewport emulated). Implementer-verified (Canary 158.0.8110.0, Windows 11, headless and headed), not independently accepted. [Design note](ui-library/instrument-phase2.md). | A public Lite ordered-insert API (or a core-owned frame graph) replaces the reorder; true group opacity of an Instrument layer (the face drawn into the chain; assessed in item 4 and not done: it changes every layer's pass); measure the budgets on a low-end GPU; a Lite option to keep a render task's target on disposal; captured caps lit by the face pool; a Lite call that updates a local environment's projection without a rebuild (L34), so a moving layer need not refresh its probe; a Lite option for TAA with reprojection or clamping, and for a generator's disposal. |
| SCOPE-005 | **Phase14 private engineering started; release qualification and publication remain open. License selected: Apache-2.0 (2026-10-14).** Selected local task-workspace pilot/CI definition is documented in [private release engineering](archive/private-release.md). Packages remain private at 0.1.0; no publication permission has been granted. Local exact-package checks are not release readiness. Release tooling (2026-10-15) is in place but dormant: lockstep Changesets versioning, a CI changeset check and a Release workflow gated on `RELEASES_ENABLED`, the self-hosted GPU runner and an `npm` environment ([releasing](releasing.md)); it has not run on GitHub. | Separate explicit decisions for publication and a bounded pilot, reproducible CI/artifact retention, version/migration policy, security review, observability and demonstrated rollback with agreed correctness/compatibility/performance gates. |

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
React18.3.1/19.3.0 runtime preassertions and independent fresh status proof.
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
