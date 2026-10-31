# Distribution

How Underglass is packaged: the npm packages and their entries, what each archive
contains, peers and dependencies, the browser contract, and building the packages from
source. This file also ships inside `@underglass/react` as `docs/distribution.md`.

Underglass is **experimental and not production-ready**. The packages are published on
npm under the Apache-2.0 license (each archive includes `LICENSE`), versioned together
and released only by the repository's Release workflow, with npm provenance
([releasing](releasing.md)). Each package's `CHANGELOG.md` records what changed.

## Packages

| Package | What it is | Entries |
| --- | --- | --- |
| `@underglass/core` | The framework-neutral runtime: GPU engine, admission, layers, motion, effects. Imports no UI framework. | `.`, `/build`, `/experimental-worker`, `/experimental-worker/thread` |
| `@underglass/react` | The React adapter over core. | `.`, `/build`, `/experimental-worker`, `/experimental-worker/thread` |
| `@underglass/vue` | The Vue 3 adapter over core ([guide](guide/frameworks.md)). | `.` |
| `@underglass/css-compiler` | The opt-in build-time CSS compiler, with Vite and webpack adapters ([guide](../packages/css-compiler/README.md)). | `.`, `/vite`, `/webpack`, `/webpack-loader`, `/client`, `/schema.json` |
| `@underglass/ui` | Strata, the 3D design language: tokens, CSS and components for DOM, React, Vue and Astro ([design language](ui-library/design-language.md)). | `/tokens`, `/css`, `/dom`, `/gpu`, `/react`, `/vue`, `/astro`, schemas and conformance JSON |

```sh
npm install @underglass/react   # React 18.3 or 19 is a peer dependency
npm install @underglass/vue     # Vue 3.5 is a peer dependency
```

The adapters depend on `@underglass/core` at the exact version they were released with
and never bundle it, so every adapter in an application shares one core runtime. All
entries are ES modules; CommonJS and internal subpath imports are unsupported.

`/build` holds build-only generators (compositor programs, animation lowering, including
`workerCompositorProgram(1..8)`): do not import it into the browser runtime. The
`/experimental-worker` entries are the opt-in worker compositor; see
[worker](worker.md) for its setup and limits.

## What the archives contain

Each archive ships its JavaScript entries, their TypeScript declarations, `README.md`,
`LICENSE` and `CHANGELOG.md`, and nothing else: no source maps, tests, demos, evidence
or absolute local paths. `scripts/package-policy.mjs` lists the exact members of the
core, React and Vue archives, and the pack and release checks refuse any difference.
`@underglass/css-compiler` ships its sources and JSON schema; `@underglass/ui` ships
JavaScript, declarations, CSS, its scene schema and conformance JSON (its Astro entry is
`.astro` components plus JavaScript helpers).

The default runtime builds its WGSL internally and fetches no shaders. Compiled CSS and
worker routes use shaders generated at build time; device pipeline compilation still
happens in the browser. Bundling the application's worker and generating its program are
the application's integration work, not assets the packages inject.

## Peers and dependencies

- **React** and **React DOM** are peers (`^18.3.1 || ^19.0.0`), never bundled. The tested
  pairs are 18.3.1 and 19.3.1; the range is not a certification of every version.
- **Vue** is the peer of `@underglass/vue` (`^3.5.0`).
- **Babylon Lite** (`@babylonjs/lite`, public, exact version) is core's runtime
  dependency, not vendored. Its declarations name WebXR types, so core also depends on
  the exact `@types/webxr`; Underglass exposes no WebXR feature.
- **TypeScript 7.0.2** is the tested compiler. Declarations resolve under `Bundler` and
  `NodeNext` module resolution with `skipLibCheck: false`; older compilers are untested.
- Importing an entry without browser globals works (checked), but server-side rendering
  and hydration are not supported: mounting requires a browser DOM.

## Browser contract

The application always starts in usable ordinary DOM, in every browser. GPU mode needs
Chrome Canary with HTML-in-Canvas enabled (`CanvasDrawElement`, `ElementCanvasTransform`
and experimental web-platform features), WebGPU, and state-preserving
`Element.moveBefore`; [Getting started](guide/getting-started.md#requirements) has the
flags. Feature presence is not enough: admission verifies real native capture pixels,
uploaded output pixels and native hit geometry before it presents anything, and refuses
with a diagnosed reason otherwise. This is experimental Chromium support, not a WebGL
fallback or a promise about Safari, Firefox or other Chromium builds.

Once GPU is on, supported membership, layout, DPR and structure changes, hidden tabs and
reduced motion keep it on ([GPU-first contract](architecture.md#gpu-first-contract)).
The layer budget defaults to 32 (up to 64), within the captured-pixel budget. Nested or
foreign enrollment, unsupported native scrolling or clipping, editable or top-layer
content (including the enrolled element itself and any `contenteditable` other than
`"false"`), missing APIs and budget or compile failures leave usable, diagnosed DOM.
Long native input text whose selection scrolls the input cancels admission, because
native input scrolling is not a supported GPU interaction. Effects that move or hide
pixels require inert, aria-hidden, noninteractive decoration separate from essential
controls. DPR 2 text rasterisation is not pixel-identical between DOM and GPU, and no
speedup is claimed.

Screen readers, OS input methods, physical displays and devices, and real background
throttling are not yet validated ([open issues](open-issues.md)).

## Minimal bootstrap

Mount the application into hosts outside every React root; `createCanvasHosts` creates
them inside a sized frame with the styles they need. There is no global stylesheet to
import and no automatic CSS injection.

```tsx
import { useState } from "react";
import { createCanvasHosts, mountCanvasApp, Surface, Box } from "@underglass/react";

function App() {
  const [name, setName] = useState("");
  return <Surface id="editor"
    layout={{ x: 20, y: 20, width: 280, height: 200, padding: 12 }}
    appearance={{ background: "white", color: "black" }}>
    <Box layout={{ direction: "column", gap: 8 }}>
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={e => setName(e.target.value)} />
    </Box>
  </Surface>;
}

const hosts = createCanvasHosts(document.getElementById("frame")!); // a sized element
const controller = mountCanvasApp({
  outputCanvas: hosts.outputCanvas, ordinaryHost: hosts.ordinaryHost, overlayHost: hosts.overlayHost,
  onStatusChange: status => console.info(status.mode),
}, <App />);
// DOM is usable now. GPU is explicit, never a startup default:
const admitted = await controller.enable();
if (admitted.mode !== "gpu") console.info(admitted.reason);
// Later: await controller.disable(); await controller.dispose();
```

`Surface` and `Box` compile numeric layout and appearance to ordinary browser CSS;
`useSurfaceRef` and `enroll` adopt existing elements instead. Keep unenrolled native
content outside the movable root, using `NativeOverlay` and a library's public
portal-container API where needed. `mountApplicationModule` accepts a trusted,
already-imported local module; it is not a remote app loader. `disable()` returns to
ordinary DOM and `dispose()` unmounts; both are the caller's to call. The
[API reference](api.md) is the full contract.

## Building from source

```sh
npm ci --ignore-scripts
npm run build:library
# Writes the core, React and Vue archives (create the destination directory first):
npm run pack:library -- --pack-destination ../tarballs
# In a separate application:
npm install ../tarballs/underglass-core-<version>.tgz ../tarballs/underglass-react-<version>.tgz
```

Packing rebuilds the library entries and emits their declarations. Never publish from a
local build: releases come only from the Release workflow ([releasing](releasing.md)).

`npm run test:package` is the consumer gate: it packs the core and React archives,
checks their exact contents, installs them into fresh React 18 and React 19
applications, typechecks them under both module-resolution modes, builds them, and
drives the original mounted controls in Chrome with and without the native flags at
DPR 1 and 2. [CONTRIBUTING](../CONTRIBUTING.md) covers
its options. These are automated fixtures, not physical-device or accessibility proof.

The history of how the packages were prepared and accepted before the first npm release
is in the [archive](archive/reference-history.md#distribution).
