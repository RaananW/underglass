# Concepts

## One React tree, two ways to present it

Your app is one React tree with real DOM elements. Underglass presents that tree in
one of two modes:

| Mode | What draws it | When |
| --- | --- | --- |
| **Ordinary DOM** | The browser, as usual | At startup, in browsers without HTML-in-Canvas, after `disable()`, or after a diagnosed problem |
| **GPU** | WebGPU, from live captures of the same elements | After a successful `enable()` in Chrome Canary |

Switching modes **moves** the same React root between the ordinary host and the
output canvas. React does not remount: state, focus, selection and input values stay
exactly where they were. Nothing is cloned.

## Layers

A **layer** is an element whose pixels the GPU treats as one unit. Each layer is
captured into a texture and drawn by its own GPU pass, in DOM order.

- `<Surface id layout appearance transform origin>` renders a `<section>` and enrolls
  it. Use it for layers you author.
- `useSurfaceRef({ id })` (or `controller.enroll(element, { id })`) enrolls an
  element you already render, for example a third-party component's root. The
  element must be a **direct child** of the Underglass root.
- `<Box>` is ordinary flow layout inside a layer. It is not a layer.

Everything inside a layer is regular DOM. Text, inputs, CSS animations and even
`<video>` are captured as they paint. When a layer's content changes, only that
layer is captured again.

A layer can be **decorative** (`decorative` prop): inert, `aria-hidden`, with no
interactive elements. Only decorative layers can carry shader effects, so effects
never distort something a user needs to click or read.

## Moving layers

A layer's `transform` (x, y, rotation, scaleX, scaleY, opacity) and static `origin`
(the pivot: `"top-left"`, `"center"` or `{ x, y }` fractions) become one matrix. The
same matrix drives the GPU drawing, the browser's hit testing and, in DOM mode, the
CSS `transform`, so clicks always land where the element appears.

Changing a transform through the controller (`transition`, `animate`,
`setTransform`) does **not** re-render React or repaint the layer. The GPU just
redraws with a new matrix.

## What the GPU adds over CSS

CSS already animates `transform` and `opacity` smoothly. The GPU path matters when
you need something CSS cannot do to rendered HTML:

- **Per-pixel effects on live content:** displacement (ripple and refraction),
  per-channel shifts, noise masks and your own WGSL. CSS filters are a fixed menu,
  and SVG filters are slow on large, changing areas.
- **HTML inside a GPU scene**, with native interaction intact. This is the
  foundation for mixing HTML with 3D content later.
- **Camera or video frames treated like any other pixels**: refract, reflect and
  light them together with your HTML.

If a component only needs transforms and fades, CSS is fine. Underglass keeps working
the same in DOM mode either way.

## Admission and fallback

`enable()` runs **functional admission**: it checks the browser APIs, creates the
WebGPU engine, then captures and clicks a probe to prove that pixels and hit
testing are correct on this browser, in this window. Only then does it reveal GPU
output.

Once GPU is on, ordinary updates (React renders, layout changes, resizing, device
pixel ratio changes, hidden tabs, reduced motion) **keep** it on. Underglass returns
to DOM only for a real GPU error or a construct GPU mode cannot present correctly,
and it always reports why: `controller.state().reason` and `onStatusChange`. See
[Troubleshooting](troubleshooting.md).

## Limits to know

- Up to 32 layers by default (`budgets.layers` up to 64) and 2 million captured
  pixels.
- Layers are 2D. Rotated layers may cross the stage edge, but not sit inside a
  clipping (scrolling or `overflow: hidden`) ancestor.
- No nested layers, and no `z-index` on a layer: paint order is DOM order.
- A `<canvas>` inside a layer is refused (reason `canvas-content`): the browser captures a nested canvas blank in most arrangements. Keep
  it outside enrolled layers, or opt in with `data-underglass-gpu-canvas="allow"` ([api](../api.md#canvas-inside-a-layer)).
- `contenteditable`, `<dialog>` and popovers inside a layer need ordinary DOM. Render
  dialogs and popovers through `NativeOverlay` instead (see
  [Building components](components.md)).
