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
  [showcase](https://underglass.dev), input reached the GPU in 28–109 ms on the
  polyfill 0.4.0 in Chrome 156, against 10–19 ms natively in Canary.
- **Cost per change.** Every change re-serializes the layer it is in. Since 0.4.0
  the polyfill reuses the styles of elements that can't have changed, so the cost
  follows the size of the change more than the size of the layer. In the showcase's
  Strata gallery, one layer of about 500 elements, a click reaches the GPU in about
  110 ms (about 0.3 s on 0.3.0), and the page runs at about 40 fps while the pointer
  moves over it. Changes that touch everything, such as a theme switch, still cost
  about a full layer. Keep layers small, and give animated parts their own layer, or
  animate with Underglass's [motion](motion.md), which moves layers without new
  captures. Since 0.1.1 the polyfill redraws a layer that only a running animation
  changes at a reduced rate, so a spinner no longer holds the page at a few frames a
  second, and since 0.2.0 a pointer move only causes a capture when a `:hover` rule
  then matches different elements.
- **Stale frames.** A few changes take no snapshot of their own on the polyfill: a
  stylesheet edited in place through the CSSOM, a media query that flips without a
  resize (`prefers-color-scheme`), and a change to an ancestor's sibling that a
  selector depends on. They are drawn when something else takes a snapshot. Since
  0.4.0 the polyfill re-reads reused styles in idle time, which usually catches a
  stylesheet edited in place within a second, and `install({ incremental: false })`
  turns style reuse off if a drawing looks stale.
- **Workers.** Since 0.2.0 an `ElementImage` can be transferred to a worker that
  imports the polyfill's worker entry. Underglass's experimental worker compositor
  has not been tested on it.
- **Hit regions.** They are close, but not always exact: positions round to whole
  CSS pixels, and the polyfill's own
  [limitations](https://github.com/RaananW/html-in-canvas-polyfill/blob/main/docs/LIMITATIONS.md)
  list the cases it doesn't handle. Use 0.1.1 or later: 0.1.0 put every hit region
  of the showcase's Fluent cards on the last card, because it couldn't override the
  `transform` Underglass sets on layers. Test the clicks of your own app before you
  rely on it.
- **Rendering.** Use 0.3.0 or later. 0.2.0 drew the showcase's Strata gallery
  without its GPU relief and with square radios, among other differences: it hid
  drawn elements from `checkVisibility()`, rounded copied sizes, mis-sized tables with
  a caption and dropped styles equal to a UA default. The snapshot still re-lays out
  your elements, so compare your app on the polyfill with its DOM mode before you
  rely on it. 0.3.0 also places `position: fixed` content inside a drawn element
  against the canvas, as native HTML-in-Canvas does, rather than the viewport.
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
