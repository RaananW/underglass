---
"@underglass/core": minor
---

Refuse a layer that contains a `<canvas>` instead of presenting it blank (#184). On Canary 158.0.8112.0 HTML-in-Canvas captures a nested canvas (2D, WebGL, `preserveDrawingBuffer`, `OffscreenCanvas`) only when it is the first thing attached to its layer; a later canvas, or one after painted siblings, is the layer background, also after a redraw. The structural policy now reports `canvas-content: layer <id> contains a <canvas> ...` at `enable()` and, for a canvas added to a live GPU layer, recovers to ordinary DOM with that reason (explicit `enable()` re-admits once it is gone). The fallback is runtime-wide like every structural reason. New export `GPU_CANVAS_ATTRIBUTE` (`data-underglass-gpu-canvas`): `="allow"` on a `<canvas>` exempts it, as the author's acceptance that it may be presented blank. A canvas outside every layer is unaffected.
