# Private distribution preparation

Phase10 implementation is **prepared, independently accepted with limits**.
Phase11 engineering is **independently accepted with limits; human/physical
validation pending**. Full Phase11 remains incomplete; the repository's compact
Phase11 verdict and adoption checklist preserve the open gates.
The packages are **published to npm (first release `0.2.0`, 2026-10-21) and not production-ready**. The five library packages
(`@underglass/core`, `@underglass/react`, `@underglass/vue`, `@underglass/css-compiler` and
`@underglass/ui`) are no longer `private`, are versioned together and are prepared for npm; the project is licensed under Apache-2.0 (each tarball includes `LICENSE`).
Releases come only from the Release workflow, with provenance; do not publish from a local build or
change visibility except by the steps in [releasing](releasing.md#making-a-release).
`@underglass/ui` ships JavaScript, declarations, CSS and the conformance JSON only (its Astro entry is
`.astro` components plus JavaScript helpers); the contract below describes core and the React adapter.

## Build and install locally

**Bounded current-spec correction is persisted after independent acceptance
with limits** (`cfa9df73`, `ab598c00`). Legacy installed-consumer verdicts
below are immutable historical evidence, not qualification of Phase13. The
current WebGPU route requires reflected owner `content="drawable"`, descendant
`drawable` and owning-native-paint public direct upload. WebGL2 direct capture
is unqualified. No publication or dependency installation is authorized by the
local correction; use existing dependency resolutions for exact archive checks.

The selected client-only Phase13 task adopter is qualified-accepted at
`12f13661`, including the fresh diagnostic repair and explicit one-file
generated metadata integrity exception. Its unchanged workflow proof and fresh
status proof are distinct; the old adoption-v1 seal is not wholly intact.
See the checkout's `docs/open-issues.md` for current boundaries and exceptions.
That accepted documentation update did not rebuild or requalify an existing
tarball. Phase14 private engineering now uses the checkout's
`scripts/release-validation.mjs` and `docs/private-release.md`: build-only,
no-flags/default DOM and explicitly requested-native lanes in a fresh owned
Phase14 root. No new execution may reuse sealed dependency directories,
directory symlinks or optimizer caches; `--reuse-dependencies` now makes independent physical copies and
excludes optimizer caches; it never executes through dependency symlinks.
The new runner physically extracts the exact current archive for matching React18/19,
copies the authored task application (not the core source), uses only the public
entry and Radix's public portal container, and checks actual flagged GPU and
no-flags/default DOM DPR1/2 browsers. Default DOM leaves GPU disabled; it does
not prove native methods absent on157. Intentional clip-dropping refusal is
checked separately in the accepted Phase13 proof, not rerun by the narrow
release pilot. The example app/CSS is not shipped as a library export.
See `docs/task-workspace.md` in the checkout for its state/layer/focus limits;
no framework, hydration, physical/accessibility, publication or release promise
is added. Earlier installed-consumer records below remain historical.

```sh
npm run build:library
npm pack --workspace @underglass/core --workspace @underglass/react --dry-run --json
# Choose an ignored directory for the actual archives:
npm run pack:library -- --pack-destination fixtures/package-consumer/workspaces
# In a separate React application, install both generated .tgz files (the
# React package depends on the framework-neutral core runtime):
npm install /path/to/underglass-core-0.1.0.tgz /path/to/underglass-react-0.1.0.tgz
```

Create the pack destination first. `prepack` rebuilds the intentional
library entries with existing Vite and emits TypeScript declarations. The
unchanged runtime root is ESM `@underglass/react`; additional explicit
exports are `/build`, `/experimental-worker` and `/experimental-worker/thread`.
The React package depends on `@underglass/core` and never bundles it, so its
entries import the core runtime from the installed package.
CommonJS and internal subpath imports are unsupported. The React allowlist
contains 14 members: manifest, README, `LICENSE`, `CHANGELOG.md`, this
contract, four JS entries and their five declarations. The core allowlist
contains 34 members: manifest, README, `LICENSE`, `CHANGELOG.md`, four JS
entries and their required declaration graph. No source maps, tests, demos, evidence, profiles,
absolute local paths or app-owned worker/program assets ship.
The default runtime still constructs WGSL internally without shader fetch.
Compiled CSS and worker routes use literal build-generated shader artifacts;
runtime browser/driver pipeline compilation remains. App-owned worker URL
bundling and program generation are explicit integration work, not injected
assets or automatic adoption. Historical archive identities below do not
qualify this changed package.

The separate private `@underglass/css-compiler` workspace supplies JSON-configured
Vite/webpack adapters for a bounded CSS/Sass/PostCSS/Modules subset; it is not
shipped inside this library. Worker bundling is verified with Vite's ES module
worker output, not webpack or automatic compiler/worker interoperability.
Create the application worker entry with
`startWorkerCompositor(self)` imported from `/experimental-worker/thread`,
generate `workerCompositorProgram(1..8)` from `/build` before bundling, and use
`mountWorkerCanvasApp`/`WorkerSurface` from `/experimental-worker` with empty
connected ordinary/canvas hosts and an app-owned module-worker factory.
Ordinary DOM starts first; GPU is explicitly enabled. React/DOM/layout/capture
remain main-thread; essential/control geometry is fixed and only inert,
aria-hidden noninteractive decoration animates. Unsupported sources are
diagnosed explicitly. Disable/disposal awaits worker fence/acknowledgement
before restoring the original root. A10second timeout reports cleanup pending
with retained resources and requires handling/retry, not a successful teardown.
The checkout's `docs/worker.md` contains the complete setup and measured limits;
it is not another bundled package member. No CSS speedup is established.

React/React DOM are external matching-major peers (`^18.3.1 || ^19.0.0`),
not bundled duplicate roots. Actual tested pairs are18.3.1 and19.3.1;
the peer range is not certification of every version. Public Lite1.33.0
is an exact runtime dependency, not vendored, and its unrelated WebXR
declaration names require the exact `@types/webxr`0.5.24 dependency/reference.
Underglass does not expose a WebXR feature. Radix, Lite GL, profiling and demo
dependencies are development-only. TypeScript7.0.2 is the tested compiler;
older compiler/DOM-library compatibility is unverified. Declaration references
resolve under Bundler and NodeNext with `skipLibCheck: false` and no implicit
ambient types. Top-level ESM import without browser globals is checked, not
SSR rendering or hydration certification. Bootstrap requires a browser DOM.
Only this standalone contract ships with README; other README links refer
to documentation/evidence in the repository checkout, not tarball contents.

## Minimal typed bootstrap

Provide empty, connected, same-document sibling hosts outside every React
root. The application owns their frame/CSS; there is no missing stylesheet
export or automatic global CSS injection.

```html
<style>
  [hidden] { display: none !important; }
  #frame { position: relative; width: 640px; height: 420px; }
  #capture, #output, #ordinary {
    position: absolute; inset: 0; width: 100%; height: 100%;
  }
  #output { pointer-events: none; } /* Adapter owns native hits while GPU-enabled. */
</style>
<div id="frame">
  <canvas id="capture" hidden></canvas><canvas id="output" hidden></canvas>
  <div id="ordinary"></div><div id="overlay"></div>
</div>
```

```tsx
import { useState } from "react";
import { mountCanvasApp, Surface, Box, type MountCanvasOptions } from "@underglass/react";

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
// Resolve and validate these references in your outside-root host setup.
const options: MountCanvasOptions = {
  captureHost, outputCanvas, ordinaryHost, overlayHost,
  onStatus: message => { statusElement.textContent = message; },
};
const controller = mountCanvasApp(options, <App />);
// DOM is useful now. GPU use is explicit, not a startup default:
const admitted = await controller.enable();
if (admitted.mode !== "gpu") console.info(admitted.reason);
// Later: await controller.disable(); await controller.dispose();
```

`Surface`/`Box` compile numeric layout and appearance to ordinary browser CSS.
`useSurfaceRef`/`enroll` selectively adopt original direct-root elements.
Keep all content inside the movable root in admitted boundaries; keep
unenrolled native content outside it, using the fixed `NativeOverlay` host
and a library's public portal-container API where needed.
`mountApplicationModule` accepts a trusted, already-imported local module
with a persistent-root cleanup callback; it is not a remote app loader.
The public root exports the typed controller, layout/appearance/transform,
enrollment, motion, effects and local module contracts. No private engine,
facade, profiling root or custom reconciler is required.

## Bounded browser policy

Useful ordinary DOM startup and diagnosed refusal work without native-capture
flags in the installed Chrome automation profile. GPU requires working
`CanvasDrawElement`, `ElementCanvasTransform`, experimental web-platform APIs,
WebGPU and state-preserving connected same-document `Element.moveBefore`.
Feature presence alone is insufficient: admission verifies actual native
capture pixels, staging/upload/output pixels and applied native hit geometry.
This is experimental Chromium support, not a general WebGL fallback or a
promise about Safari, Firefox, all Chromium builds or arbitrary applications.
The package runner records actual CDP browser build/revision and launch flags
separately for flagged and unflagged temporary profiles. It uses only the
installed macOS Google Chrome executable; no downloads, installs or everyday
profile/global flag changes are permitted.

Implementation checks on2026-10-10 recorded Chrome155.0.8059.40,
revision `@cfaadc5a132d78e1828635aa8405a499f3e14864`, through CDP (not a
user-agent version guess). Independent acceptance confirmed the bounded
package and separate direct-consumer contracts, not browser approval.

| Actual target | Bounded observed result |
| --- | --- |
| Installed Chrome155, clean headless profile, no native flags, DPR1/2, React18/19 | Capture/draw/geometry unavailable despite WebGPU/moveBefore presence; exact admission diagnostic and original useful DOM/native controls |
| Same installed build, clean headless profile, explicit native/experimental flags, DPR1/2, React18/19 | Native/GPU admission pixels, red/green decoded application pixels, transformed native hits, controlled input/form/counters and same-root DOM recovery/reentry |
| Exact Chrome154, other Chromium builds, Safari, Firefox, everyday profiles | Untested here; no availability or compatibility claim |

The preceding Chrome155 table is historical and non-current. Corrected source
uses one owning GPU canvas, prepared per-layer native-grid textures and complete
same-renderer successors for normal membership/ref/layout/DPR changes.
`admissionPolicy?: "explicit" | "automatic"` is retained for compatibility;
neither option starts GPU automatically or runs structural DOM readmission.
Visibility/media preserve healthy ownership; factual unsupported boundaries and
GPU errors diagnose DOM until explicit retry. See [current source API](api.md).
The layer budget defaults to 32 (configurable up to 64), subject to the pixel budget.
Nested/foreign enrollment, unsupported native scrolling or clipping, forced
colors, missing APIs and budget/compile failures diagnose usable DOM.
Editable/top-layer refusal includes the enrolled root itself and
`contenteditable=""`/`plaintext-only`, not only explicitly `"true"` descendants.
Long native input text and selection can generate a real input scroll event
and cancel GPU admission with a diagnosed lifecycle transition, retaining DOM;
native-input scrolling is not a supported GPU interaction.
Nonaffine/disappearing effects require inert, aria-hidden, noninteractive
decoration separate from essential controls. Reduced motion remains honored.
Capture stays conservative on root-wide native paint; no speedup is claimed.
DPR2 text rasterization is not DOM/GPU pixel equivalent.

Exact Chrome154.0.8037.98 remains **UNVERIFIED**. Historical actual155
continuation after user unavailability was not explicit155 approval or a154
waiver; browser transition cause/date is unknown. Screen readers, actual OS
IME, everyday profiles, real background throttling, physical displays/devices
and resets remain manual gates; CDP, synthetic visibility and `device.destroy`
cannot close them. The five lost original Phase6 fixture reports remain a
provenance exception, not repaired by package tests.

## Reproducible consumer gate and release checklist

```sh
# Always creates a fresh ignored root; do not run concurrent browser writers:
CANVAS_EVIDENCE_ROOT=evidence/phase10/my-run npm run test:package
# A reviewer uses evidence/phase10-independent/<fresh-run>.
# Phase11 focused native compatibility extension, still actual tarball installs:
CANVAS_EVIDENCE_ROOT=evidence/phase11/my-run CANVAS_INTERACTION_AUDIT=1 npm run test:package
# Phase12 dynamic/motion/pending-capture/DPR/disable/unmount contracts:
CANVAS_EVIDENCE_ROOT=evidence/phase12/my-run CANVAS_DYNAMIC_AUDIT=1 npm run test:package
```

The runner packs twice, enforces the shared exact contents allowlist,
installs the actual tarball into independent React18 and19 workspaces,
checks dependency/type resolution, both compiler module-resolution modes,
safe top-level import, production builds and original mounted React controls.
Flagged/unflagged browser checks exercise pointer/keyboard/forms, controlled
and uncontrolled values, same-root recovery, selective enrollment, native/GPU
decoded pixels and safe disposal. Raw outputs/workspaces/archives are ignored;
the eight historical compact reports remain immutable. The Phase12 extension
checks actual decoded pixels/native hits, controlled/uncontrolled values,
checkbox/focus/selection, structural motion cancellation, held public paint,
CDP DPR changes, scroll refusal and disposal during public engine initialization.
These are automated bounded fixtures, not physical or accessibility proof.
The new runtime artifact is not identical to the prior Phase11 tarball; only
the actual fresh runner's packed/member hashes and installed bytes describe it.
Phase12 engineering is independently accepted with limits (the repository's compact
Phase12 verdict). The exact reviewed tarball SHA256 is
`5f668a38a3c3972457e4cfb246ca354552c606507677b393d09521bda2579944`:
23 members,47406 packed/232882 unpacked bytes. Accepted-status README/distribution
edits produce a new artifact; only their member comparison can establish a
doc-only delta, not an identical tarball or a browser-tested new archive.
This gate does not
rerun full benchmarks or certify all UI semantics.

| Release gate | Current boundary |
| --- | --- |
| Independent Phase10 and Phase11 engineering acceptance | Accepted with limits; full Phase11 human/physical validation remains pending |
| Local pack/install/type/browser checks | Implemented reproducible runner; inspect its fresh results |
| Final package name, public visibility, npm publication | Separate user decisions; no publish authorization (license: Apache-2.0, selected 2026-10-14) |
| Human/device/accessibility and exact154/provenance gates | Open; see limits above and repository adoption checklist |
| Phase12 opt-in settled structural readmission | Engineering independently accepted with limits; full Phase12 production application/hardware and numeric budgets remain open |
| Release CI, broad framework/browser support | Outside current scope |
