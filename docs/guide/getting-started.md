# Getting started

Underglass lets a React app keep its ordinary DOM controls while Chrome draws them
through WebGPU. You write normal React: inputs, buttons, forms, text. Underglass
places parts of that tree in **layers** that the GPU can move, rotate, fade and run
shader effects on, while every click, keystroke and focus change still goes to the
original elements.

Without the experimental browser features the same app runs as plain DOM, with no
code changes.

## Requirements

- React 18 or 19.
- For GPU mode: **Chrome Canary** with HTML-in-Canvas enabled. Either turn on
  `chrome://flags/#canvas-draw-element` and
  `chrome://flags/#enable-experimental-web-platform-features`, or launch with:

  ```sh
  --enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features
  ```

  Every other browser gets ordinary DOM.

## Install

```sh
npm install @underglass/react
```

`@underglass/react` brings the framework-neutral runtime `@underglass/core` with it, pinned to the exact
version it was released with; React 18.3 or 19 is a peer dependency. For Vue use `@underglass/vue`, for
the Strata components `@underglass/ui`, and for the build-time CSS compiler `@underglass/css-compiler`.

To try unreleased changes, build the tarballs from this repository and install those instead:

```sh
npm ci --ignore-scripts
npm run pack:library            # writes underglass-core-<version>.tgz and underglass-react-<version>.tgz
cd ../your-app && npm install ../underglass/underglass-core-*.tgz ../underglass/underglass-react-*.tgz
```

## Your first layer

Underglass needs one sized element **outside every React root**. It adds three hosts
inside it: the output canvas, the host for ordinary DOM, and an overlay host for
dialogs and popovers. The element may also sit inside a shadow root, for example in
a web component or on a page that mounts its demos in shadow DOM; put the app's
styles in that shadow root.

```html
<div id="stage" style="position: relative; width: 800px; height: 500px"></div>
```

```tsx
import { useState } from "react";
import { createCanvasHosts, mountCanvasApp, Surface, useGPUHost } from "@underglass/react";

function Profile() {
  const gpu = useGPUHost();
  const [name, setName] = useState("Ada");
  return (
    <Surface id="profile" origin="center"
      layout={{ x: 40, y: 40, width: 280, height: 160, padding: 16, direction: "column", gap: 8 }}
      appearance={{ background: "white", color: "#1d1b26", radius: 16 }}>
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={event => setName(event.target.value)} />
      <button onClick={() => gpu.transition("profile", {
        keyframes: [{ offset: 0 }, { offset: 0.5, rotation: 8, scaleX: 1.05, scaleY: 1.05 }, { offset: 1 }],
        timing: { duration: 600 },
      })}>Wiggle</button>
    </Surface>
  );
}

const hosts = createCanvasHosts(document.getElementById("stage")!);
const controller = mountCanvasApp({
  ...hosts,
  onStatusChange: status => console.log(status.mode, status.reason),
}, <Profile />);
```

The app starts in **ordinary DOM**: it works everywhere immediately. GPU mode is
always an explicit choice:

```tsx
const state = await controller.enable();
if (state.mode !== "gpu") console.info("Staying in DOM:", state.reason);
```

`enable()` never throws for missing browser support. It runs a functional check
(**admission**) and resolves to `"gpu"`, or to `"dom"` with a reason. Call
`controller.disable()` to return to DOM and `controller.dispose()` to unmount.

> The output canvas must be **visible on screen** when you call `enable()`: the
> admission check draws and clicks a tiny probe inside it. Enable from a button in
> or near the stage, or after scrolling it into view.

## What to read next

- [Concepts](concepts.md): layers, the two modes, and what the GPU adds.
- [Motion](motion.md): transitions, groups, `Presence` and animation ownership.
- [Effects](effects.md): ripple, chromatic, dissolve and your own WGSL.
- [Building components](components.md): the standard for components that work here.
- [Troubleshooting](troubleshooting.md): what each fallback reason means.
- [API reference](../api.md) for every option.
- The [live showcase](https://raananw.github.io/underglass/) and its source in
  `examples/showcase`.
