# Underglass build-time CSS compiler

Experimental `@underglass/css-compiler`. Explicitly selected
animations compile to literal WebGPU compositor programs and matching numeric
native-geometry samplers during the application build. Ordinary CSS, browser
layout, React state and the original controls are retained. This is not a
general CSS translator or a custom React renderer.

## Configuration

Place `underglass.config.json` in the application root:

```json
{
  "version": 1,
  "target": "webgpu",
  "unsupported": "error",
  "entries": [
    {
      "id": "card",
      "stylesheet": "@my-library/card/styles.scss",
      "selector": ".card",
      "animations": ["float"]
    }
  ]
}
```

Use a real exported package stylesheet or an explicit local path such as
`./src/card.module.scss`. The application's bundler resolves it; dependency
files are never rewritten. A component must expose both usable styles and a
public ref/enrollment boundary. Packages without those cannot be automatically
adapted. `schema.json` provides an editor schema; unknown JSON fields (including
`$schema`) are currently refused. Configuration accepts 1..32 targets. The output holds one per-layer compositor
program that the runtime draws once per layer, so it does not limit the layer
count; `maxLayers` is still accepted for compatibility and has no effect.

## Vite

```js
import { defineConfig } from "vite";
import { underglass } from "@underglass/css-compiler/vite";

export default defineConfig({
  plugins: [underglass({ configFile: "underglass.config.json" })],
});
```

The adapter uses Vite's preprocessing, configured PostCSS plugins and CSS
Modules mapping, then substitutes generated code before final chunk emission.
Chunk source maps are preserved. This is a **production-build integration**;
`vite dev`, HMR and watch compilation are deliberately refused when the virtual
module is requested.

## webpack

```js
import { UnderglassPlugin } from "@underglass/css-compiler/webpack";

export default {
  plugins: [new UnderglassPlugin({ configFile: "underglass.config.json" })],
  module: {
    rules: [{
      test: /\.scss$/,
      use: [
        { loader: "css-loader", options: {
          sourceMap: true, modules: { namedExport: false },
        } },
        { loader: "postcss-loader", options: { sourceMap: true } },
        { loader: "sass-loader", options: { sourceMap: true } },
      ],
    }],
  },
};
```

The adapter uses webpack's public resolver and `importModule` to run the real
loader chain at build time. It currently requires one processed css-loader
array part per stylesheet. Aggregated CSS imports, style-loader,
MiniCssExtractPlugin and other injection/extraction outputs are **not supported**.
The application must deliver the returned ordinary CSS itself:

```js
import styles from "@my-library/card/styles.scss";
const sheet = document.createElement("style");
sheet.textContent = styles.toString();
document.head.append(sheet);
const cardClass = styles.locals.card;
```

This native stylesheet is essential for fallback. The integration does not
invent a second CSS delivery pipeline. Sass `@use` partials and configured
PostCSS transforms are exercised in the installed-package fixture; other
preprocessors/loader chains require separate qualification.

## Runtime enrollment

```tsx
/// <reference types="@underglass/css-compiler/client" />
import compiled from "virtual:underglass/compiled";
import { mountCanvasApp, useSurfaceRef } from "@underglass/react";

function App() {
  const ref = useSurfaceRef({ id: "card" });
  return <Card ref={ref} className={cardClass} />;
}

const controller = mountCanvasApp({
  ordinaryHost, captureHost, outputCanvas,
  compiled, budgets: { layers: 2, pixels: 1_000_000 },
  onStatus: message => { diagnostics.textContent = message; },
}, <App />);
const motion = controller.ownCompiledAnimation("card", "card/float");
await controller.enable();
```

The three hosts must satisfy the existing stable sibling/root mount contract.
Enrollment must reference the original direct root child, not a cloned control
or a ref hidden inside a third-party component. Set `transform-origin: 0 0`;
avoid competing inline transforms/opacity, individual transform properties or
other animation owners.

Ownership checks the actual browser animation against the compiled descriptor
before changing it. Only the enrolled animation is suppressed. Generated WGSL
samples motion/opacity; a generated JS sampler synchronizes native affine hit
geometry. Playback supports `play`, `pause`, `seek` and `release`. Disable,
failure or disposal restores ordinary CSS behavior and the current time/play
state without replacing React's original controls. The browser may recreate
the CSSAnimation object; Animation-object identity is not guaranteed.
Later authored declarations that differ from Underglass's owned values are
preserved on restoration. Reassigning an identical value/priority is not
distinguishable from the ownership lease's existing write.

## Supported subset and boundaries

One unconditional top-level `.class` or `#id` rule, one named CSS keyframe
animation, 2..32 increasing offsets spanning 0..1, and complete transform and
opacity in every frame. Transforms use `none` or
`translate(px[, px]) rotate(deg) scale(number[, number])`, with positive bounded
scales. Timing supports positive duration, nonnegative delay, integer/infinite
iterations, normal/alternate direction and `both` fill. Easing supports linear,
named CSS easing and non-overshooting cubic-bezier control points in [0,1].

Selected transitions, dependent values (`var`, `calc`, percentages in transforms),
important/composite animations, conditional/overlapping selected rules, CSS
Modules composition and unsupported keyframe properties fail the build with an
available source location. Source maps identify available preprocessed/published
inputs; missing original sources are not reconstructed. The analyzer is not a
whole-application cascade engine. Runtime validation still refuses mismatched
styles, competing animations, unsupported geometry and essential effects.
Existing animation libraries require explicit integration.

The compiled route does **not** parse authored CSS or generate shader source at
runtime. It selects prebuilt programs and supplies time, state and dimensions;
native geometry and lifecycle still execute on the CPU. Browser/driver
device-specific shader/pipeline compilation necessarily occurs at runtime.
Samplers use f32 arithmetic; bounded GPU/native numerical agreement is not a
promise of universal bit-exact CSS interpolation.
Logical milliseconds are reduced to a bounded phase before f32 upload. This
preserves short motion after large delays and avoids shader division rounding
near sharp easing endpoints. Mirrored cubic evaluation avoids cancellation
near the end of a curve; motion interpolation remains in generated WGSL.

GPU operation requires Chrome Canary with HTML-in-Canvas enabled, WebGPU and
functional capture/native-hit admission. Unsupported browsers remain ordinary
DOM. Reduced motion pauses motion without revoking working GPU presentation.
No performance improvement, arbitrary package compatibility, WebGL compiler,
hardware/manual accessibility qualification or publication is claimed.

## Reproducing the integration proof

From the repository root, with the pinned dependencies already installed:

```sh
CANVAS_BROWSER_EXECUTABLE="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  node scripts/compiler-validation.mjs --runtime-regression
```

The runner builds in new physical execution trees, packs and installs the
component/compiler/library fixtures, and exercises local and package Sass,
configured PostCSS, CSS Modules and production minification in both bundlers.
It verifies the pinned browser before native rendering/interaction assertions,
compares generated GPU/native samplers, and checks explicit refusal and ordinary
DOM restoration. The optional flag additionally runs existing runtime units,
playground types/build and animation/recovery/runtime browser regressions.
Each run retains its result under `evidence/compiler/`; failed runs remain
failed evidence. This does not run the separate React 18/19 release matrix or
qualify manual accessibility, hardware loss or performance.

## CSS conformance coverage

`tests/compiler/css-corpus.mjs` names **48 accepted and 72 refused stylesheet
cases**. Each case has its own test in `conformance.test.mjs`; together with
the four original compiler groups, this is 124 tests, not hundreds of distinct
third-party components.

| Coverage | Examples |
| --- | --- |
| Accepted declarations | Class/ID selectors, shorthand defaults/reordering, longhand overrides, comments, CSS Modules mapping and unrelated CSS preservation |
| Accepted motion | Canonical translation/rotation/scale, negative motion, multiple rotation turns, decimal/exponent values, opacity endpoints, 32 frames and per-segment easing |
| Accepted timing | Fractional durations, short motion after large delays, bounded maximum timing, normal/alternate, finite/infinite iterations, named and sharp-endpoint cubic easing |
| Explicit refusals | Incomplete/duplicate frames, invalid number syntax, dependent values, unsupported units/properties/easing, composition, transitions, conditional/overlapping rules and indistinct f32 offsets |

For every accepted case, the browser runner seeks an actual ordinary
`CSSAnimation` and compares its computed matrix/opacity against the generated
native sampler. This is independent of the generated WGSL/JS comparison, which
executes real WebGPU compute shaders and reads back their results. Current
proof covers **3,080 browser CSS comparisons and 297,974 GPU/native time
samples per bundler**. The latter are samples of the same 48 stylesheets,
not additional CSS use cases.

The native reference uses fixed tolerances of 0.02 CSS pixels for translation
and 0.0005 for matrix coefficients/opacity. Boundary neighborhoods use 0.01ms:
the tested Canary reports zero CSS progress for a 0.001ms seek at the start of
the sharp `cubic-bezier(0,1,0,1)` case. Those one-microsecond seeks remain in
raw clock diagnostics, but are not claimed as interpolation-equivalence proof.
GPU/native sampler checks still include +/-0.001ms neighborhoods. No tolerance
was widened to pass a mismatch.

The two real stylesheet pipelines remain an installed npm component and a
local stylesheet using Sass, PostCSS and CSS Modules in Vite/webpack. The
synthetic corpus does not qualify arbitrary npm components, cascade rules,
Less, injection/extraction loaders, dev/HMR or performance improvements.

## License

Apache License 2.0. See [LICENSE](LICENSE).
