# Browsers without HTML-in-Canvas

Underglass presents through the browser's HTML-in-Canvas API, which today only
Chrome Canary has, behind flags. In other browsers your app runs in ordinary DOM,
which is complete and correct. If you want GPU mode there too, the
[HTML-in-Canvas polyfill](https://github.com/RaananW/html-in-canvas-polyfill)
(`@underglass/html-in-canvas-polyfill`) can stand in for the API. This page explains
what that gives you and what it costs.

## What the polyfill is

The polyfill implements the [WICG HTML-in-Canvas proposal](https://github.com/WICG/html-in-canvas)
in JavaScript: `content="drawable"`, `paint` and `requestPaint()`,
`drawElementImageToTexture`, element geometry and the rest. It draws an element by
serializing it into an SVG image, and it gives elements their hit regions with CSS
transforms on the live element. It does nothing when the browser supports the API
natively. It is a separate package, MIT-licensed, and Underglass does not depend on
it: you decide whether to load it.

## Using it with Underglass

Install it next to Underglass and install it before you call `enable()`:

```sh
npm install @underglass/html-in-canvas-polyfill
```

```ts
import { install } from "@underglass/html-in-canvas-polyfill";

const status = install(); // { native, polyfilled, version, limitations }
await controller.enable();
```

`import "@underglass/html-in-canvas-polyfill/auto"` installs it as a side effect
instead. Loading it on demand keeps it out of the bundle for browsers that never
need it:

```ts
async function enableAnywhere() {
  const { install, uninstall } = await import("@underglass/html-in-canvas-polyfill");
  const { polyfilled } = install();
  const { mode } = await controller.enable();
  if (mode !== "gpu" && polyfilled) uninstall();
}
```

Nothing else changes. Admission tests the polyfill exactly as it tests a browser,
with functional pixel and native hit probes, and refuses with a reason when they
fail. Your controls stay the original React elements with their state, and the
polyfill keeps the elements Underglass moves into the canvas; you don't need its
`data-hic-host` authoring mode.

## What to expect

- **Lag.** The polyfill paints a few frames after a change. In the
  [showcase](https://underglass.dev), typing reached the GPU in 77–125 ms on the
  polyfill in Chrome 156, against 11–17 ms natively in Canary.
- **Cost per change.** Serializing an element takes about 5–50 ms. Small layers that
  change on input are fine. A large layer that changes every frame (a spinner or
  another animation inside it) keeps the polyfill busy: the showcase's Strata gallery
  dropped to about 6 fps for that reason. Keep animated parts in their own small
  layers, or animate with Underglass's [motion](motion.md), which moves layers
  without new captures.
- **Hit regions.** They are close, but not always exact: positions round to whole
  CSS pixels, and the polyfill's own
  [limitations](https://github.com/RaananW/html-in-canvas-polyfill/blob/main/docs/LIMITATIONS.md)
  list the cases it doesn't handle. Version 0.1.0 put some hit regions on the wrong
  layer in the showcase's Fluent board, so test the clicks of your own app before
  you rely on it.
- **Browsers.** Underglass needs WebGPU and `Element.moveBefore`, which the polyfill
  does not provide. Chromium browsers without the flags (Chrome, Edge) have both.
  Safari has no `moveBefore` yet, so admission refuses there. Firefox has both but
  has not been tested.

## Say when it is in use

GPU mode on the polyfill looks like the real thing but behaves differently, so tell
your users when it is active. `install()` returns `polyfilled`, and
`window.HTMLInCanvasPolyfill.getStatus()` reports it later. The showcase offers the
polyfill only after a press, labels the mode as **GPU active · polyfill**, and
records polyfilled runs apart from native ones in its analytics.
