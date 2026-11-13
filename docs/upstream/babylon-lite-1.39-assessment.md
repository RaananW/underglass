# Babylon Lite 1.33 to 1.39.3 and lite-gl 1.19 to 1.21.1: upgrade

`packages/core` moves from `@babylonjs/lite` **1.33.0** to **1.39.3**, and the playground from `@babylonjs/lite-gl`
**1.19.0** to **1.21.1**. Written on 2026-11-11 for 1.39.2; [1.39.2 to 1.39.3](#1392-to-1393) was added on
2026-11-13. It continues
[babylon-lite-1.36-assessment.md](babylon-lite-1.36-assessment.md), which covers 1.33 to 1.36 and still applies; this
note covers 1.36 to 1.39.2 and records what was changed and tested. Findings are numbered as in
[babylon-lite.md](babylon-lite.md).

## Sources and what could not be accessed

- npm registry: `@babylonjs/lite` 1.37.0 (2026-10-26), 1.37.1 (10-27), 1.37.2 (10-29), 1.38.0 (11-02), 1.38.1 (11-04),
  1.38.2 (11-06), 1.39.0 (11-09), 1.39.1 (11-09), 1.39.2 (11-10), 1.39.3 (11-12). `@babylonjs/lite-gl` 1.20.0 (11-02), 1.20.1 (11-04),
  1.21.0 (11-09), 1.21.1 (11-09). lite-gl's `latest` tag points at 1.21.0 and its `release` tag at 1.21.1; this uses
  1.21.1, the newest.
- GitHub releases of `BabylonJS/Babylon-Lite` up to `npm-lite-v1.39.0`, and the `CHANGELOG.md` inside the 1.39.2 and
  1.39.3 tarballs.
- The shipped 1.36.0 and 1.39.2 tarballs, diffed (JavaScript and `.d.ts`), and the lite-gl 1.19.0 and 1.21.0 `.d.ts`;
  the 1.39.2 and 1.39.3 tarballs, diffed with `npm diff`.
- **Not accessible:** there is no `npm-lite-v1.39.2` or `npm-lite-v1.39.3` tag or release (the newest tag is 1.39.0); GitHub's compare view
  stops at 300 files, so the library source was diffed from the tarballs instead; pull request bodies (including #820
  and #888) were not read; lite-gl has no changelog or tags of its own.

## Breaking changes and what they meant here

| Change | Effect on Underglass | Done |
| --- | --- | --- |
| 1.37.0: `SceneNode.visible` is read-only (#817); use `setMeshVisible` | Four writes in playground probe pages failed typecheck (L7 already said `visible` does not reach render bundles). Core already used `setMeshVisible` | `ui-probes/objects.ts` and `ui-probes/instrument-shadows.ts` call `setMeshVisible` |
| 1.38.1: scene overlays are opt-in (#888). Before, every later scene registered on a surface was configured as an overlay (its swapchain task forced to `clr: false`); now only `createOverlayScene` does that | Core's mesh scenes create their swapchain task explicitly with `clr: false` (the L25 workaround), so they should not depend on the old automatic setup. Hypothesis from source, proved by the instrument suites below | Nothing changed |
| 1.38.1, lite-gl: receiver-first signatures, unified texture options (#820) | `backend-probe.ts` passed `engine` to `disposeTexture`, `isEffectReady`, `setEffectTexture`, `setEffectFloat`, and positional flags to `updateDynamicTexture` | Updated to the new signatures |
| 1.39.2: error codes renumbered (#899) | **Core matched the raw code `#47` for "WebGPU adapter not available"** (#252). In 1.39.2 that error is `#54`, so a browser with `navigator.gpu` but no adapter would have got the opaque `#54` as its reason again | `LITE_NO_ADAPTER_CODE = 54` in `engine-failure.ts`, and a unit test decodes it with the installed Lite's own message table, so the next renumbering fails `test:unit` instead of reaching users |

Nothing was removed from Lite's public exports between 1.36 and 1.39.2. Every name core, the playground and the tests
import exists in 1.39.2's `index.d.ts`, and `npm run typecheck` passes.

## Findings, 1.36 to 1.39.2

No finding is claimed fixed in the release notes. From the diffs:

- **L1, L2, L17, L32 (HDR, IBL, tone mapping):** unchanged. The PBR output (`pow(color, 1/2.2)`, the contrast curve,
  the BRDF) moved verbatim into separate modules; `loadHdrEnvironment` still sets exposure 0.8 and contrast 1.2. The
  calibration should hold: the conformance suite is the proof.
- **L7:** `visible` is now typed read-only, which confirms `setMeshVisible` as the supported path. Not a fix.
- **L10, L11:** addressed by new API: `moveRenderingContext(surface, context, index)` (an ordered insert), and
  `getFrameGraphTasks` / `removeTask`. Core still reorders `getRenderingContexts` in place; adopting the new call is a
  follow-up, not part of this upgrade.
- **L22:** its "error 486" number is stale after #899.
- **L24:** possibly improved: PCF hooks hold casters whose depth view is not ready yet (#828), and the caster set is
  rebuilt with a mesh's renderable (#862).
- **L25:** touched by #888 (see above).
- **L30:** `surface.js` and `render-target.js` changed only in error codes. The PCF generator still keeps its map in the
  internal `_depthTexture` with no public disposal, so core's release through that field still applies.
- **L37:** `mesh-factories.js` is unchanged; `resizeMeshGeometry` behaves as recorded.
- **L6, L8:** nearby changes only (#878 keeps refraction out of depth and geometry views; the material rebuild and a
  material-swap queue were reworked, #863).
- Others: untouched or not found.

New since 1.36 and not adopted: `createOverlayScene`, `moveRenderingContext`, `createDevice` / `disposeDevice`,
`EngineContext.device`, `setEnvironmentLightingRotation`, `setEnvironmentSkyboxRotation`, bent-normal PBR inputs, and
`html-texture` preferring `drawElementImageToTexture` (#891; core draws through its own path).

## 1.39.2 to 1.39.3

Added on 2026-11-13. The 1.39.3 `CHANGELOG.md` entry is cumulative from 1.39.0, so what is new is what 1.39.2's entry
lacks. The 1.39.2 and 1.39.3 tarballs differ in 699 files, most of them only in renumbered error codes.

| Change | Effect on Underglass | Done |
| --- | --- | --- |
| **Breaking:** per-family scene collections for text, depth-hosted sprites and billboards (#907). `addTextRenderable`, `addDepthHostedSpriteLayer`, `addFacingBillboardSystem` and `addAxisLockedBillboardSystem` are removed (`addTextRenderableToScene`, `addDepthHostedSpriteLayerToScene` and `addBillboardSystemToScene` replace them) | None: core, the playground and the tests call none of them. They are the only names removed from `index.d.ts` | Nothing changed |
| Error codes renumbered again (from about 170 up) | `#54` is still "WebGPU adapter not available": the unit test that decodes `LITE_NO_ADAPTER_CODE` with the installed message table passes. Core matches no other code | Nothing changed |
| New: a scene SSAO pipeline (#908), public texture pixel readback (#906), texture replacement (#901), the HTML-in-Canvas polyfill lifecycle in compat (#903) | Not used | Not adopted |
| Fixes: HTML texture elements moved by HTML-in-Canvas polyfills are restored (#897); KTX2 transcoder fetches retry (#905) | Core draws captures through its own path, not Lite's `html-texture`, and loads no KTX2 | Nothing changed |

## Highest risk, and how it was tested

1. Multi-scene layering after #888 and core's context permutation (L10, L25): each layer's scene keeps its pixels.
2. `ui-instrument-conformance` at tolerance 16, after the PBR template split.
3. The glass and capture `ShaderMaterial`s and thin instances (L21, L22, L35), after the opaque and transparent
   renderable factories were merged (#855).
4. Shadows: key light, bias window, held casters with explicit-task casters.
5. Device loss, GPU errors, hidden tabs (#868 changed recovery), and the first-frame blank check (PBR meshes rebuild one
   by one since #863).

## Results

Tested on 2026-11-11 with Chrome Canary **160.0.8155.0** (Windows 11, a real GPU; Playwright's `chrome-canary`
channel with the harness's HTML-in-Canvas flags). No browser or Lite patch was assumed or applied.

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run test:unit` (434), `node --test tests/compiler/*.test.mjs` (129) | pass |
| `npm run test:browser`, headless | 1129 passed, 1 skipped, 0 failed, 0 flaky |
| `npm run test:browser:probes` (`ui-probe-*`, `ui-proto-*`), headless | 52 passed, 1 skipped |
| `npm run test:showcase` | passed |
| `npm run test:package` (React 18 and 19 consumers, four browser and DPR contracts each) | passed |
| Headful Canary window: `surface`, `core-layer-exactness`, `core-scene-media-change`, `core-instrument`, `ui-instrument-conformance`, `ui-probe-instrument-shadows` | 59 passed |

The browser runs cover each risk above: GPU stays on, pixels are fresh and native hits match in the layer, instrument
and multi-scene suites. `ui-instrument-conformance` passes at its unchanged tolerance of 16. So core does not depend on
the automatic overlay setup that #888 removed, and no tolerance was loosened.

### 1.39.3

Tested on 2026-11-13 with Chrome Canary **160.0.8160.0** (Windows 11, a real GPU, headless; the same channel and
flags), on main after #291 (Astro 7.4.12, Starlight 0.43.1, Playwright 1.65.0).

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run test:unit` (435), `node --test tests/compiler/*.test.mjs` (129) | pass |
| `npm run test:browser`, headless | 1129 passed, 1 skipped, 0 failed |
| `npm run test:showcase` | passed |

The probe suites and the headful window were not rerun for this patch: no core code changed, and the default suite
includes `core-instrument`, `core-scene-media-change` and `ui-instrument-conformance` (tolerance 16).
