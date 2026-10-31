# Underglass

Underglass is an experimental UI layer for React and Vue that presents your **original
DOM controls** through Chrome's HTML-in-Canvas API and WebGPU (via `@babylonjs/lite`)
while keeping native interaction: real inputs, focus, selection, forms and
hit-testing keep working on the same elements React created. The GPU draws
those elements with transforms, motion and decorative effects; it does not
replace them with canvas-drawn clones.

Principles (the [GPU-first contract](docs/architecture.md#gpu-first-contract)):

- **One control tree.** React owns the original controls and state. There are no
  cloned interactive controls or hidden duplicate trees, and one shared renderer
  serves the application.
- **GPU stays on.** Once GPU is enabled, supported layer, ref and content updates
  stay GPU-presented with fresh pixels and current native hit geometry. Only a
  GPU error or a factual lack of required browser support justifies a diagnosed
  fallback to plain DOM; explicit disable/dispose is caller-owned.
- **Plain DOM always works.** Components are standard React DOM first; GPU
  presentation is layered on top, with a small typed declarative fallback.
- **Typed authoring.** Layout and appearance are typed props compiled to browser
  CSS, not a custom layout engine.

## Gallery

Screenshots from the [live showcase](https://underglass.dev/), taken in Chrome
Canary with GPU presentation on. Every button, input and like counter in them is the
original React element; the GPU only draws it.

[![Webcam pond: plain HTML koi refracted by a WGSL water shader](examples/showcase/src/previews/webcam-pond.jpg)](https://underglass.dev/examples/pond)

**Webcam pond.** The koi are plain `<span>`s, the text on the pond floor is a `<p>` you
type into, and the optional camera image is a `<video>`. A ripple refracts all of it and
a custom WGSL shader adds caustics. X-ray (shown) labels the HTML under the water.
The camera image never leaves the page.

| | |
| --- | --- |
| [![Postcard studio](examples/showcase/src/previews/postcard-studio.jpg)](https://underglass.dev/examples/layers) | [![Card deck](examples/showcase/src/previews/card-deck.jpg)](https://underglass.dev/examples/motion) |
| **Postcard studio.** A native form edits a GPU-presented card; *Riso print* shifts the artwork's colour channels apart, which no CSS filter can do to rendered HTML. | **Card deck.** Cards with native Like buttons fan, stack and shuffle as GPU layers, and the felt table ripples when they land. |
| [![Shader lab](examples/showcase/src/previews/shader-lab.jpg)](https://underglass.dev/examples/effects) | [![Notification stack](examples/showcase/src/previews/notification-stack.jpg)](https://underglass.dev/examples/presence) |
| **Shader lab.** Ripple, chromatic split, noise dissolve and application-written WGSL chained on live DOM artwork. | **Notification stack.** `Presence` keeps each toast's React subtree, with its real Dismiss button, through its exit. |

GPU mode needs Chrome Canary with HTML-in-Canvas enabled (see [Requirements](#requirements)).
In other browsers the showcase runs as ordinary DOM with the same controls.

## Status

Experimental and not production-ready. The packages are on npm, released together
under one version (see each package's `CHANGELOG.md` and [releasing](docs/releasing.md)):

| Package | What it is |
| --- | --- |
| [`@underglass/react`](https://www.npmjs.com/package/@underglass/react) | The React adapter (React 18.3 or 19) |
| [`@underglass/vue`](https://www.npmjs.com/package/@underglass/vue) | The Vue 3 adapter (Vue 3.5) |
| [`@underglass/core`](https://www.npmjs.com/package/@underglass/core) | The framework-neutral runtime both adapters build on |
| [`@underglass/ui`](https://www.npmjs.com/package/@underglass/ui) | Strata, the 3D design language and component library |
| [`@underglass/css-compiler`](https://www.npmjs.com/package/@underglass/css-compiler) | The opt-in build-time CSS compiler (Vite and webpack) |

It is for deliberately adopted small applications, not for loading arbitrary
websites or libraries unchanged. GPU mode needs Chrome Canary with experimental
flags; plain DOM mode works in any browser. Licensed under the
[Apache License 2.0](LICENSE). History and acceptance records are in
[docs/archive/history.md](docs/archive/history.md).

## Install

```sh
npm install @underglass/react react react-dom   # React 18.3 or 19
npm install @underglass/vue vue                 # Vue 3.5
```

Each adapter brings `@underglass/core` with it. Add `@underglass/ui` for the Strata
components, and `@underglass/css-compiler` only for its build-time route.

## Requirements

- To work on this repository: Node 24 (validated with Node 24.19.0 / npm 11.17.0).
  Dependencies are exact-pinned.
- For GPU mode: Chrome Canary (most recently tested: 159.0.8134.0 on Windows 11)
  with the HTML-in-Canvas features enabled. Either launch with

  ```sh
  --enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features
  ```

  or enable `chrome://flags/#canvas-draw-element` and
  `chrome://flags/#enable-experimental-web-platform-features`. Support is
  verified functionally at runtime (admission), not inferred from API presence.

## Quick start

```sh
npm ci --ignore-scripts
npm run dev            # playground at http://127.0.0.1:5173/ (plain DOM landing page)
npm run dev:showcase   # React example gallery
```

The [showcase](docs/showcase.md) is the public gallery: ten live examples, from native
forms, motion and shader effects to stock Fluent UI components, a GPU-versus-CSS
comparison and the Strata and Instrument component galleries. **GPU demos require
Chrome Canary with HTML-in-Canvas enabled**; ordinary DOM mode works without flags. It deploys to
<https://underglass.dev/> on Vercel, and to GitHub Pages at
<https://raananw.github.io/underglass/>, from `main`.

## Minimal usage

Give Underglass a sized element **outside all React roots**; `createCanvasHosts`
adds the output canvas, the ordinary DOM host and the overlay host to it as
empty siblings. Then mount:

```tsx
import { useState } from "react";
import { createCanvasHosts, mountCanvasApp, Surface, Box, useGPUHost } from "@underglass/react";

function App() {
  const host = useGPUHost();
  const [name, setName] = useState("");
  return (
    <Surface id="editor" layout={{ x: 20, y: 20, width: 260, height: 160, padding: 12 }}
      appearance={{ background: "white", color: "black" }}>
      <Box layout={{ direction: "column", gap: 8 }}>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={() => host.transition("editor", {
          keyframes: [{ offset: 0 }, { offset: 1, x: 40, opacity: 0.6 }],
          timing: { duration: 400 },
        })}>Move</button>
      </Box>
    </Surface>
  );
}

const { outputCanvas, ordinaryHost, overlayHost } = createCanvasHosts(document.getElementById("frame")!);
const controller = mountCanvasApp({
  outputCanvas,   // GPU output canvas; holds the original controls while GPU is active
  ordinaryHost,   // host for the React root (plain DOM until GPU is enabled)
  overlayHost,    // host for NativeOverlay / library portals
  onStatusChange: status => console.log(status.mode, status.reason),
  strict: true,
}, <App />);

await controller.enable(); // explicit; resolves to mode "dom" with a reason if unsupported
```

The app starts in usable plain DOM. `enable()` runs functional admission and
only then reveals GPU output. `disable()` returns to DOM; `dispose()` tears
down. `captureHost` is optional and deprecated. Full API, including
`useSurfaceRef`, `Presence`, `NativeScroll`, `NativeOverlay`, `createMotion`,
`setEffects` and the Radix Dialog integration, is in [docs/api.md](docs/api.md); the
[guide](docs/guide/getting-started.md) walks through it step by step.
Public exports live in `packages/react/src/index.ts`, over the
framework-neutral runtime exported from `packages/core/src/index.ts`.

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/core` | The framework-neutral runtime (package `@underglass/core`): GPU engine, mount boundary, enrollment, motion, effects |
| `packages/react` | The React adapter (package `@underglass/react`): React bindings over core, ESM entry, declarations, prepack build |
| `packages/vue` | The Vue 3 adapter (package `@underglass/vue`): Vue components and composables over core ([guide](docs/guide/frameworks.md)) |
| `packages/css-compiler` | Opt-in build-time CSS compiler with Vite/webpack adapters ([guide](packages/css-compiler/README.md)) |
| `packages/ui` | Strata, the 3D design language: tokens, CSS and components for DOM, React, Vue and Astro (package `@underglass/ui`) |
| `examples/playground` | Engineering HTML pages, demo apps and probes (Vite root) |
| `examples/showcase` | The public gallery at [underglass.dev](https://underglass.dev/) |
| `examples/docs` | The documentation site at [underglass.dev/docs](https://underglass.dev/docs), built from `docs/` |
| `tests/unit`, `tests/browser`, `tests/helpers`, `tests/compiler` | Test suites and shared helpers |
| `fixtures/` | Installed-consumer, exact React 18, compiler and worker fixtures |
| `docs/` | Architecture, API, adoption, verification, open issues, history |
| `scripts/` | Test runners, measurement and validation tooling |

The root is private tooling, not the release package; root `npm pack` is refused.

## Scripts

Run from the repository root.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Playground dev server on 127.0.0.1 (use `-- --port 5173 --strictPort`) |
| `npm run dev:showcase` | Build the library, then run the showcase dev server |
| `npm run build` | Build library and playground |
| `npm run build:showcase` | Build the library, then the showcase |
| `npm run dev:docs` | Run the documentation site's dev server |
| `npm run build:site` | Build the showcase and the documentation site into one output, as Vercel deploys it |
| `npm run typecheck` | Type-check library, playground and showcase |
| `npm run test:unit` | Node unit tests |
| `npm run test:browser` | Build, then Playwright browser tests (Chrome Canary) |
| `npm run test:browser:probes` | Build, then the `ui-probe-*`/`ui-proto-*` evidence suites the default run skips |
| `npm run test:showcase` | Build the showcase in an isolated copy and drive it in Canary, in DOM and GPU |
| `npm test` | Unit tests, build, then the browser suite |
| `npm run test:compiler` | Build the library and run CSS compiler validation |
| `npm run test:worker` | Experimental worker compositor validation |
| `npm run measure` | Production measurements (run alone, not beside other suites) |

See [CONTRIBUTING.md](CONTRIBUTING.md) for focused tests and browser setup.

## Examples

| Page | Purpose |
| --- | --- |
| `/runtime.html` or `/runtime.html?dom` | Typed runtime, enrolled layers, explicit admission/recovery |
| `/paired.html?example=css` or `?example=typed` | Existing CSS or numeric motion, ownership, inert refraction |
| `/todo.html` | Bounded list/detail task workspace, original native forms, portals and decorative artwork |
| `/integration.html` | Authored CSS, original-element refs, Radix Dialog, motion/presence |
| `/integration.html?auto` or `/runtime.html?auto` | Compatibility option specimen; initial enable is explicit, normal updates reconcile without readmission |
| `/effects.html` | Inert ripple/chromatic/dissolve/trusted color effects in one shared pass |
| `/probe.html`, `/recovery.html`, `/surface.html` | Historical feasibility and recovery specimens |

## What is supported, and what is not

Supported within bounded, tested scope: native pointer/keyboard/input/form/focus/
selection; axis-aligned affine motion with explicit CSS/WAAPI ownership;
declarative numeric transitions and single-subtree `Presence`; inert decorative
effects; `NativeScroll` and ordinary axis-aligned scrolling; one real Radix
Dialog integration through its public portal-container API; and opt-in
experimental [CSS compiler](packages/css-compiler/README.md) and
[worker compositor](docs/worker.md) routes.

Not qualified (see [open issues](docs/open-issues.md), SCOPE entries):

- Arbitrary CSS: transformed or mixed-axis ancestor chains, RTL, writing modes, zoom.
- General WAAPI/CSS conversion, arbitrary animation or UI libraries, routes,
  shared elements, springs, virtualization.
- SSR and hydration (mounting creates a client root).
- A WebGL2 direct-capture runtime route (the supported route is public WebGPU).
- Manual and physical gates: OS IME, screen readers, physical display/DPR moves,
  everyday browser profiles, hardware device loss, numeric performance budgets.
  No speedup or production qualification is claimed.

## Documentation

The guide, the reference and the Strata pages are also published at
<https://underglass.dev/docs>, built from this repository's `docs/` folder.

- **Guide:** [getting started](docs/guide/getting-started.md), [concepts](docs/guide/concepts.md),
  [motion](docs/guide/motion.md), [effects](docs/guide/effects.md),
  [building components](docs/guide/components.md), [troubleshooting](docs/guide/troubleshooting.md)
  and [other frameworks and plain DOM](docs/guide/frameworks.md).
- **Reference:** [API](docs/api.md), [effects contract](docs/effects.md), [worker](docs/worker.md),
  [distribution](docs/distribution.md).
- **Contributing:** [CONTRIBUTING](CONTRIBUTING.md), [architecture](docs/architecture.md),
  [releasing](docs/releasing.md), [open issues](docs/open-issues.md), and the
  [engineering archive](docs/archive/).

All documentation is indexed in [docs/README.md](docs/README.md).

## License

Underglass is licensed under the [Apache License, Version 2.0](LICENSE).
