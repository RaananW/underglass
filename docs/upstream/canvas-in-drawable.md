# A `<canvas>` inside a `drawable` element is captured blank (draft, not filed)

Found with Underglass issue [#184](https://github.com/RaananW/underglass/issues/184). Core's answer is documented in
[api.md](../api.md#canvas-inside-a-layer): a layer that contains a `<canvas>` is refused with the reason `canvas-content`.

## What was checked, and what could not be

| Item | Result |
| --- | --- |
| WICG proposal | `WICG/html-in-canvas` `main` at `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`, committed 2026-10-09T22:49:17Z (read 2026-10-20 through `gh api`). |
| What the explainer says | A snapshot covers "all `drawable` elements, including their drawable subtrees"; `drawElementImage` "draws the last snapshot of a `drawable` element, and its drawable subtree". The security section excludes "`<canvas>` elements tainted with cross-origin data" from painting, which implies that untainted canvases are painted. Nothing says a nested `<canvas>` is left out, and nothing says when its bitmap is resolved. |
| WICG issues | Searched `canvas` in issue titles and bodies (`gh issue list -R WICG/html-in-canvas --search canvas`, 40 results read by title). Related but not the same: [#172](https://github.com/WICG/html-in-canvas/issues/172) (WebGL canvas stops updating when moved into a `layoutsubtree` canvas after the first paint; closed, tracked as crbug 563000233) and [#120](https://github.com/WICG/html-in-canvas/issues/120) (nested HTML-in-canvas; closed, supported from Canary 152). No issue reports this finding. |
| Chromium hotlist 6783002 | `curl https://issues.chromium.org/hotlists/6783002` returns HTTP 200 and an 83 KB page with no issue rows (the tracker renders its lists with script after sign-in), so the hotlist, including its ElementCanvasTransform issues, could not be read. `https://issues.chromium.org/issues/563000233` likewise returned only the application shell. Nothing is known here about a Chromium bug for this finding. |
| Browser build tested | Chrome Canary 158.0.8112.0 (revision `aade1d52aa45e7d97e434d5784e02d7ea8992254`), Windows 11, NVIDIA RTX 3080, flags `--enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features`. The finding was first seen on 158.0.8110.0. |

## Reproduction

[`canvas-in-drawable.html`](canvas-in-drawable.html) (self-contained; serve it from `localhost` or any https origin). Underglass's probe
pages, which measure many more variants, are `examples/playground/canvas-capture-raw.html` (no Underglass code) and
`examples/playground/core-canvas-content.html`; the pinned results are `tests/browser/core-canvas-content.test.mjs`.

## What was measured

Layer = a `drawable` div of a `content="drawable"` canvas, background rgb(233, 235, 239). Each cell: the pixel at the centre of the
nested canvas in the 2D `drawElementImage` result (the same through `GPUQueue.drawElementImageToTexture` in Underglass, DPR 1 and 2).

| Arrangement in the layer | Result |
| --- | --- |
| One canvas alone: 2D fill, 2D `drawImage`, 2D filled then redrawn after a frame, `willReadFrequently`, WebGL clear, WebGL `preserveDrawingBuffer`, transferred to `OffscreenCanvas`, two wrappers deep, hidden then shown | Captured, with fresh pixels after a redraw |
| Two or more canvases | The first canvas attached is captured; every later one is the layer background, also after a redraw of it |
| A canvas after a painted sibling (a `div` with a background, an `img`) | The canvas is the layer background (a painted sibling after the canvas is fine) |
| The first canvas attached is later in tree order than a canvas attached after it (`insertBefore`) | The one attached first is captured, not the first in tree order |
| A div attached and removed, then a canvas | The canvas is the layer background |
| One canvas in each of two layers | Both captured |
| A canvas with its own `content="drawable"` after other canvases | Captured |
| An `<img>` whose source is a `toDataURL()` of a canvas | Captured wherever it sits |
| A canvas that holds a drawable child (nested HTML-in-canvas) | The layer background |

The order is not tree order and not creation order alone (a canvas created first but placed after a `div` is blank); it behaves like
"the first thing attached to the drawable". The cause was not investigated.

## Draft issue

**Title:** HTML-in-Canvas: a `<canvas>` descendant of a drawable element is captured as transparent unless it is the first thing attached

**Steps:** open `canvas-in-drawable.html`. Three identical 2D canvases (filled red) sit in one `drawable` div.

**Expected:** `drawElementImage` shows three red canvases, as `drawImage` of each canvas does.

**Actual:** the first is red, the other two show the `drawable` element's background. A canvas after a painted sibling (a `div` with a
background, an `img`) is also blank. Redrawing the canvas, `requestPaint()` and waiting frames do not change it. The same holds for
`GPUQueue.drawElementImageToTexture`, and for 2D, WebGL, `preserveDrawingBuffer` and `OffscreenCanvas` canvases. A single canvas
alone in the drawable is captured, with fresh pixels after a redraw.

**Impact:** a library that presents real DOM through HTML-in-Canvas cannot tell from the API whether a nested canvas will appear, and
the failure is silent (the page shows the background). Underglass refuses such layers (`canvas-content`) until this is fixed.

**Question for the explainer:** is a nested `<canvas>`'s bitmap part of a drawable subtree's snapshot, and if so when is it resolved?
