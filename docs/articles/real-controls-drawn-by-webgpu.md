# Real React controls, drawn by WebGPU: keeping every click on the right element

HTML-in-Canvas lets a canvas draw live DOM. Underglass moves and distorts real React controls on the GPU while clicks, focus and state stay native.

Chrome and Edge ship HTML-in-Canvas without flags from version 157. A canvas can now draw live, laid-out HTML, and a WebGPU shader can do anything to those pixels. That is the easy half. The hard half starts when the pixels are no longer where the browser laid the element out. A button that is drawn rotated, faded or bent by a shader is still a real `<button>` at its old position, and the browser will deliver the click there unless something tells it otherwise.

I maintain [Underglass](https://underglass.dev/), an experimental React framework built on that problem. This article explains how it keeps hit-testing, focus, selection and React's own tree honest while the GPU draws the controls, what it refuses to do, what broke, including two browser bugs I found and reported, what the work costs per frame, and where it stops. Each claim traces to the repository, its tests or the [WICG proposal](https://github.com/WICG/html-in-canvas), unless I say otherwise.

## What the API gives you

The proposal has five pieces. A `<canvas content="drawable">` lays out its children, and a child marked `drawable` is painted by the browser as usual. A `paint` event reports when a snapshot of such a child changed. `drawElementImage` draws that snapshot into a 2D canvas, and `drawElementImageToTexture` does the same into a WebGPU texture. Finally, `updateElementGeometry` goes the other way: it tells the browser where on the canvas you drew an element, as a `canvasTransform` matrix, and optionally a `canvasClip` rectangle, so that hit-testing follows the picture.

The proposal also says what happens to accessibility: content under a drawable canvas is exposed like regular DOM, with one special case for elements whose geometry was never updated. The element stays in the document. That is the property Underglass builds on. The canvas draws the element, but it does not replace it.

The API decides nothing for you. Draw an element somewhere new without calling `updateElementGeometry` and the user sees a button in one place and clicks in another. Cache a texture and the control changes, and the user sees old pixels. Clone the control to draw it, and you own a second copy of its state. Underglass is designed around those three failures.

## One matrix, three consumers

In Underglass, a **layer** is an element whose pixels the GPU treats as one unit. You describe a layer's `transform` (position, rotation, scale, opacity, and a tilt about the X and Y axes) and its pivot. The runtime turns them into one canonical matrix. That matrix has three consumers, and they never get different versions of it:

<figure>
<svg viewBox="0 0 720 330" role="img" aria-labelledby="fig-title fig-desc" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:720px;font:14px system-ui,sans-serif">
<title id="fig-title">One transform matrix drives pixels, hits and ordinary DOM</title>
<desc id="fig-desc">The React tree in its original DOM is captured by the browser and uploaded as a texture that the GPU draws with the layer matrix. The same matrix is sent to the browser as native hit geometry, and in ordinary DOM mode it is written as a CSS transform.</desc>
<defs><marker id="fig-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
<g fill="none" stroke="currentColor" stroke-width="1.5">
<rect x="20" y="110" width="170" height="90" rx="8"/>
<rect x="265" y="20" width="190" height="80" rx="8"/>
<rect x="265" y="125" width="190" height="80" rx="8" stroke-width="3"/>
<rect x="265" y="230" width="190" height="80" rx="8"/>
<rect x="525" y="20" width="175" height="80" rx="8"/>
<rect x="525" y="125" width="175" height="80" rx="8"/>
<rect x="525" y="230" width="175" height="80" rx="8"/>
<path d="M190 140L265 62M190 155L265 165M190 170L265 270" marker-end="url(#fig-arrow)"/>
<path d="M455 60L525 60M455 165L525 165M455 270L525 270" marker-end="url(#fig-arrow)"/>
</g>
<g fill="currentColor" text-anchor="middle">
<text x="105" y="150">React tree</text><text x="105" y="170" font-size="12" opacity=".75">original DOM, one root</text>
<text x="360" y="55">Native paint</text><text x="360" y="75" font-size="12" opacity=".75">drawElementImageToTexture</text>
<text x="360" y="160">One matrix per layer</text><text x="360" y="180" font-size="12" opacity=".75">set by the controller</text>
<text x="360" y="265">Ordinary DOM mode</text><text x="360" y="285" font-size="12" opacity=".75">same root, no remount</text>
<text x="612" y="55">WebGPU pass</text><text x="612" y="75" font-size="12" opacity=".75">samples the capture</text>
<text x="612" y="160">Native hit testing</text><text x="612" y="180" font-size="12" opacity=".75">updateElementGeometry</text>
<text x="612" y="265">CSS transform</text><text x="612" y="285" font-size="12" opacity=".75">matrix or matrix3d</text>
</g>
</svg>
<figcaption>One matrix per layer. The GPU samples with it, the browser hit-tests with it, and ordinary DOM mode writes it as a CSS transform.</figcaption>
</figure>

The browser's own paint captures the React tree, and the GPU draws each layer's capture through the matrix. The same matrix goes to the browser as the element's `canvasTransform`, so `elementFromPoint` and real pointer events follow the picture. In ordinary DOM mode it becomes a CSS `transform` (`matrix3d` for a tilted layer, whose projective matrix the shader inverts to map canvas pixels back to layer pixels).

Writing it in code looks like ordinary React:

```tsx
function Profile() {
  const gpu = useGPUHost();
  return (
    <Surface id="profile" origin="center"
      layout={{ x: 40, y: 40, width: 280, height: 160, padding: 16, direction: "column", gap: 8 }}>
      <label htmlFor="name">Name</label>
      <input id="name" defaultValue="Ada" />
      <button onClick={() => gpu.transition("profile", {
        keyframes: [{ offset: 0 }, { offset: 0.5, rotation: 8, scaleX: 1.05, scaleY: 1.05 }, { offset: 1 }],
        timing: { duration: 600 },
      })}>Wiggle</button>
    </Surface>
  );
}
```

The input and the button are the elements React created. A transition does not re-render React or repaint the layer: it writes a new matrix, and the browser's hit geometry moves in the same call. The [motion guide](../guide/motion.md) documents the rest.

## What Underglass refuses to do

The [GPU-first contract](../architecture.md#gpu-first-contract) lists what the framework must not do. The rules that shaped the design:

- **It never clones a control.** There is no second tree of buttons drawn into the canvas, and no hidden duplicate to receive input. React owns the original elements and their state. When a user types into an input, the browser delivers the key to that input, because that is where the input is.
- **It never covers an update with stale pixels.** A snapshot laid over a changing control would hide flicker and make the control lie. The contract rules out screenshot covers, and also debouncing diagnostics to hide flicker.
- **It never weakens hit geometry to make something work.** If the browser cannot hit-test a configuration correctly, Underglass refuses that configuration and says why, instead of drawing it and letting clicks land somewhere else.
- **It does not fall back to DOM because of its own gaps.** Once GPU is on, only a GPU error or a factual lack of browser support justifies going back. Layout changes, resizes, DPR changes, hidden tabs and reduced motion do not revoke it. If a supported update would need a DOM fallback, that is a bug in the framework, not a browser limit.

## One React root that moves instead of being copied

Switching between ordinary DOM and GPU mode does not remount anything. The adapter creates one container outside React and mounts one React root inside it. When GPU turns on, that container is moved, with `Element.moveBefore`, from the ordinary host into the drawable canvas. `moveBefore` is the state-preserving move: focus, selection and input values survive it. No JSX-created element is relocated, cloned or replaced, and there is no second root or portal target. A browser without `moveBefore` is refused GPU at admission and keeps the ordinary DOM, with the reason listed on the [troubleshooting page](../guide/troubleshooting.md).

`contenteditable`, `<dialog>` and popovers cannot be inside a layer. Underglass does not try to draw them: `NativeOverlay`, an adapter-owned sibling outside the canvas, hosts them (see [limits](../guide/concepts.md#limits-to-know)).

Some state is not DOM state. The value of an `<input>` is not a DOM mutation, so a mutation observer would never see it change. The runtime listens for the native `input` event and queues a fresh capture of that layer. Caret scrolling and IME composition do the same. The observer ignores writes that change nothing, such as `setAttribute` with the value it already has, but a write from A to B and back to A is still captured, since it cannot prove the pixels match.

## Admission: prove it on this browser

Property checks prove little here: a browser can expose `updateElementGeometry` and still apply it wrongly. The project's rule is to prove an API with functional pixel and hit probes on the installed build.

`enable()` therefore runs a **functional admission**. It builds a small probe element outside React's root, with two known colours, and draws it through the whole path. It reads the colours back from the GPU output at the transformed positions. It applies a transform, an 11-degree rotation and 0.75 scale, and requires `getElementTransform` to return all six coefficients within 1e-5. It asks `elementFromPoint` about three points: two inside the probe and one that the clip must exclude. Only if every check passes does the canvas become visible.

Meanwhile the canvas is laid out at `opacity: 0` with `pointer-events: none`, so the user keeps working in the ordinary DOM. If the probe is covered or offscreen, admission refuses or defers, with a reason in `controller.state().reason`.

```tsx
const state = await controller.enable();
if (state.mode !== "gpu") console.info("Staying in DOM:", state.reason);
```

Tilt has its own proof. Before a layer may tilt on the GPU, admission checks that the browser hit-tests through a projection, using two witnesses on a probe tilted 50 degrees: a point only the projection covers, and a point only a flat stand-in covers. Without that proof, tilt is refused.

## The bug that rotated clips exposed

Admission is also where I found the first upstream bug, through a test that failed on some machines and passed on others.

`canvasClip` is a rectangle in the element's coordinate space, and it limits where the element receives hits. My admission probe uses it with a rotated element. It failed whenever the canvas sat on a fractional pixel offset, which a scrollbar in a real window can cause. The excluded test point was only 0.04 px outside the clip's bounding box, so a fractional offset put it inside.

The cause is in Chromium. Painting clips the rotated element by the rotated rectangle. Hit-testing clips it by the **axis-aligned bounding box** of the rotated rectangle. Points just outside the drawn clip but inside that box still hit the element: invisible, but clickable. My reproduction (a 20-degree rotation of a 200 by 120 child, clipped to its left half) shows a point 20 px past the clip edge, inside the box, still hitting the child. It reproduced, headless and in a normal window, on Chrome Canary 157.0.8102.0 and 158.0.8104.0 on Windows 11.

I filed it as [Chromium issue 573454036](https://issues.chromium.org/issues/573454036) and asked WICG to state the intended behaviour in the explainer: [html-in-canvas#186](https://github.com/WICG/html-in-canvas/issues/186). The text I submitted and the reproduction page are in [the upstream notes](https://github.com/RaananW/underglass/blob/main/docs/upstream/README.md). As of 2026-11-27, #186 is open with no replies.

Underglass does two things about it.

First, the probe now puts its excluded point far enough out, in the corner where the rotated edge leans inward, that fractional offsets cannot flip the result. The bug no longer fails admission.

Second, the runtime refuses the configurations the bug would make wrong. A rotated layer whose own overflow is clipped is not hit-tested correctly, so it is refused with the diagnosis `Rotated layers with clipped overflowing content`, and the page stays in ordinary DOM. A tilted layer gets no rectangular clip at all, because a projected clip would be hit-tested by its bounding box too. A tilted layer inside a scrolling or clipping container is refused for the same reason. A rotated layer with no clip is fine, and so is one crossing the stage edge: admission proves that the canvas's own content box already bounds native hits, so no extra clip is needed.

That is the pattern: when the browser cannot hit-test a case correctly, the case is refused with a readable reason, and the refusal can be lifted once a fix is verified. [Open issues](../open-issues.md) records "tilted layers are never clipped" as a bounded limit, not a solved problem.

## Effects move pixels; controls do not move with them

A shader that displaces pixels is the reason to use the GPU, and the most direct threat to hit geometry: if a ripple refracts a form, the pixel that looks like the submit button is no longer where the button is.

Underglass splits the cases by what is allowed to move:

- **Decorative layers** carry any effect: ripple, chromatic split, noise dissolve, or your own WGSL. A decorative layer is inert, `aria-hidden` and has no interactive elements, and the runtime checks that again at runtime. Interactive content goes in a sibling layer.
- **Transition effects** may be applied to an interactive layer, but only for the length of a transition. The runtime sets `inert` on the layer's children for that time and restores exactly those flags afterwards. The layer's own box stays hit-testable, so a click on distorted pixels lands on the boundary and never on a control behind it.
- **Materials** are the effect that stays on an interactive layer permanently, and they cannot move pixels. A material is evaluated on a neutral grey, never on the captured colours, and reduced to one brightness factor per point, limited to at most 0.1. A material can shade a card, but cannot lower contrast between text and its background, because both change by the same factor.

The [effects guide](../guide/effects.md) has the API. The [webcam pond](https://underglass.dev/examples/pond) shows the split in practice: the koi, the floor text and an optional camera `<video>` are ordinary HTML in a decorative layer, which a ripple and a custom WGSL water shader refract together, and the lily pad with its native button is a separate, rotated, interactive layer above it. The [card deck](https://underglass.dev/examples/motion) fans and shuffles cards whose Like buttons keep working throughout.

## What it costs per frame

I do not claim that drawing the DOM on the GPU is faster than the browser drawing it; the architecture notes say direct upload is not a zero-copy or performance claim. The design keeps per-frame work small and measurable.

- **Motion costs a matrix, not a render.** A controller transition, `animate` or `setTransform` updates uniforms and native geometry. It does not re-render React and does not request a recapture.
- **Only changed layers are captured.** A paint event uploads the layers it names, plus any that are stale (a new slot, a changed extent, an invalidated layer).
- **Writes share one draw.** Everything written in one task (an event handler, a frame callback, a React commit) is drawn once, in the state the task left. Hit testing and `getBoundingClientRect()` follow a new transform in the same task, before its pixels are drawn.
- **The policy check runs in every drawn frame.** Some changes that would break the contract raise no event (a keyframe edit, a stylesheet edit), so the runtime checks the declarations it owns before each draw. That check was the largest single function in one profile, about 12% of the main thread on a page that draws every frame. It now runs once per frame where it ran more than once: a frame of N transitions made N + 1 passes and now makes two. Its geometry half still reads layout every frame, which the open-issues record lists as unfinished.

You can measure all of this in your own app. `onMeasure` receives `captureMs`, `uploadMs`, `frameWorkMs` and `frameTickMs` samples, and `state().metrics.timings` keeps the counts and extremes:

```ts
mountCanvasApp({
  ...hosts,
  onMeasure: sample => { if (sample.kind === "frameWorkMs") frameCosts.push(sample.durationMs); },
}, <App />);
```

`frameWorkMs` times a whole draw, and `frameTickMs` times the runtime's own frame callbacks. Together they were 90 to 95% of the runtime's JavaScript in a CPU profile of the playground's performance page. They do not include the browser's own style, layout, paint or capture, or GPU execution, so compare them with a profile and not with frame intervals.

Here are the numbers recorded in the repository, with their conditions:

- A 320 by 200 layer holding an `OffscreenCanvas` that commits every frame, on Canary 160.0.8172.0 (RTX 3080, a loaded machine): 0.89 to 0.98 captures per frame, `captureMs` 2.2 to 2.7 ms at DPR 1 and 3.4 to 3.5 ms at DPR 2, and `frameWorkMs` 0.3 to 0.5 ms. With the CPU slowed four times: 0.80 to 0.85 captures per frame, `captureMs` 5.6 to 5.9 ms and `frameWorkMs` 3.1 to 4.0 ms.
- The Instrument gallery's synthesiser, the heaviest page, in Chrome's phone emulation with the CPU slowed four times (Canary 160.0.8169.0 on an RTX 3080): dragging the wheel still fills the main thread, with about 790 ms of work per second. The record gives 33 frames per second on the desktop layout and about 40 on the phone layout, against 20 and about 32 before the Strata helper began rebuilding only the panels something happened to.

Those are emulated phones on a desktop GPU. I tried the site once on a Galaxy S25+, which showed that a section was too tall for the screen, but I recorded no frame timings from the device, and I have not tried the latest tilt or Instrument pages on a real phone since. The [open-issues record](../open-issues.md#phone-and-frame-cost-findings-2026-11-18) lists what is still open. One of them is that the output canvas is drawn whole, whatever part of it is in the window, so a stage three windows tall costs its full height in every frame.

## Where it stops

The limits are real.

- **GPU mode is Chromium only.** It needs Chrome or Edge 157 or later. Everywhere else the same app runs as ordinary DOM, with the same controls. An [opt-in polyfill](../guide/polyfill.md) can provide the API in older Chromium builds, at a cost the page describes.
- **It is experimental.** The packages are on npm, but the README says not production-ready, and [open-issues](../open-issues.md) lists validation I have not done: physical display migration, real background throttling, accessibility and text fidelity across fonts and densities.
- **Captured text can differ from on-screen text.** On Canary 158.0.8112.0 at DPR 1, a text run's capture differed from the page's own rendering in 1,133 of 12,960 glyph-area pixels. At DPR 2 it differed in none of 51,840. This is the browser rasterising captured text differently from screen paint, not an Underglass defect, and I raised it as an observation in [html-in-canvas#187](https://github.com/WICG/html-in-canvas/issues/187).
- **Layers are flat rectangles with budgets.** There are up to 32 layers by default (64 at most) and 2 million captured pixels, no nested layers and no `z-index` on a layer, because paint order is DOM order. A stage is one canvas, so it also meets the GPU's texture size limit.
- **Canvases inside layers need a mark.** Canary 158 captured a nested `<canvas>` only when it was itself `content="drawable"`, so core sets that attribute while GPU presents and restores yours afterwards. Whether the mark is meant to be required is a question in #187, and a related `OffscreenCanvas` bug (Chromium 576333010) is fixed from Canary 160.0.8172.0.

The API details above follow the proposal at commit `5d9d970` (2026-10-30, its latest as I write this), and each browser finding names the build it was seen on.

## Try it

```sh
npm install @underglass/react
```

Read [Getting started](../guide/getting-started.md) for the first layer, then [Troubleshooting](../guide/troubleshooting.md) for every fallback reason. The live examples need Chrome or Edge 157 or later for GPU mode:

- [Webcam pond](https://underglass.dev/examples/pond): HTML refracted by a water shader, with a native lily pad above it.
- [Card deck](https://underglass.dev/examples/motion): motion with live buttons.
- [Shader lab](https://underglass.dev/examples/effects): built-in and custom effects.
- [Notification stack](https://underglass.dev/examples/presence): each toast keeps its real Dismiss button through its exit.
- [GPU or CSS?](https://underglass.dev/examples/compare): a comparison that shows where CSS alone is enough.

If a layer lands in the wrong place, a click goes to the wrong element, or GPU mode refuses with a reason that does not make sense, please [open an issue](https://github.com/RaananW/underglass/issues) with your browser build from `chrome://version`, the mode, the full `reason` and a minimal component. Wrong hits are the failure I care about most.
