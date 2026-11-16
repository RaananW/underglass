# Prerendering and hydration

An Underglass application can be rendered to HTML ahead of time, on a server or in a
build, and **hydrated** in the browser. The page then shows its content before any
script runs, search engines and other readers get real HTML, and the elements the
server sent are the application's original elements: React attaches to them, and GPU
presentation later draws those same elements.

This is for the React adapter. It needs no browser API: any browser hydrates, and GPU
presentation stays a separate, later step (`enable()`).

## Prerender

Render the same tree you mount in the browser with `prerenderCanvasApp`. You pass
React's own renderer, so `@underglass/react` never imports `react-dom/server`:

```tsx
import { renderToString } from "react-dom/server";
import { prerenderCanvasApp } from "@underglass/react";
import { App } from "./App";

const html = prerenderCanvasApp(<App />, renderToString);
```

The result is the HTML of the three adapter-owned hosts (the hidden output canvas, the
ordinary host and the overlay host) with your application inside the ordinary host.
Write it as the **only content** of the sized, positioned frame element:

```html
<div id="stage" style="position: relative; width: 800px; height: 480px"><!-- html goes here --></div>
```

It runs without a DOM: Node, a build plugin or an edge worker all do.

## Hydrate

In the browser, `createCanvasHosts` finds the prerendered hosts in the frame and
returns them instead of creating new ones. Mount the same tree with `hydrate`:

```tsx
import { createCanvasHosts, mountCanvasApp } from "@underglass/react";
import { App } from "./App";

const hosts = createCanvasHosts(document.querySelector<HTMLElement>("#stage")!);
const gpu = mountCanvasApp({ ...hosts, hydrate: true }, <App />);
await gpu.enable(); // as usual, when you want GPU presentation
```

Hydration finishes before `mountCanvasApp` returns, as a client render does: the layers
are registered and the controller is ready.

To see what React could not hydrate, pass your own `hydrateRoot`:

```tsx
import { hydrateRoot } from "react-dom/client";

mountCanvasApp({ ...hosts, hydrate: true,
  hydrateRoot: (container, tree) => hydrateRoot(container, tree, { onRecoverableError: console.warn }),
}, <App />);
```

## What to know

- **Render the same thing on both sides.** If the client's first render differs from
  the HTML, React reports it and renders the tree again on the client. The application
  still works and can still enable GPU, but the prerendered elements are replaced.
  Keep browser-only values (`window`, `localStorage`, the current time) out of the
  first render: read them in an effect.
- **The controller is not there while prerendering.** Components and hooks render as
  usual, but calling a controller method during render (`useGPUHost().state()`, for
  example) throws and names the method. Call it from an effect or an event handler,
  where it only runs in the browser.
- **`NativeOverlay` has no prerendered markup.** A portal cannot be hydrated, so an
  overlay renders nothing in the HTML and mounts right after hydration.
- **Colours are checked in the browser.** `appearance` colours are validated with the
  browser's CSS parser. While prerendering there is none, so a value is only refused
  when it holds something no colour does (a URL, an image, a second declaration); the
  browser checks it fully when the page hydrates.
- **`hydrate` needs the prerendered hosts, and only them.** Hydrating hosts that were
  created empty is refused, and so is an ordinary mount into prerendered hosts. The
  frame must hold nothing but the three hosts.
- **Layout comes from your CSS.** `Surface` layout and appearance are inline styles,
  so they are in the HTML. Classes you use need their stylesheet loaded in the page's
  `<head>`, or the content jumps when it arrives.

## Not covered

- Streaming (`renderToPipeableStream`), Suspense boundaries that hydrate later, and
  React Server Components. Only a complete `renderToString` render is tested.
- Frameworks that own the React root themselves (Next.js, Remix): `mountCanvasApp`
  creates and owns its root.
- The Vue adapter and the experimental worker backend.
- React 18: the same API exists there, but the tests run on React 19.

A plain-DOM application can use the same two core pieces, `canvasHostsMarkup(content)`
and `hydrate: true` on `mountApplicationModule`: its `mount` then receives the
prerendered container instead of an empty one.
