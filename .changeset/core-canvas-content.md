---
"@underglass/core": patch
---

Present a `<canvas>` inside a layer instead of capturing it blank (#184). HTML-in-Canvas (Canary 158.0.8112.0) captures a nested canvas only when it is itself `content="drawable"`; core now sets that on every `<canvas>` in an enrolled layer while GPU presents (at admission and for one added later), remembers the author's own `content` value and restores it when GPU ends or the canvas leaves its layer. 2D, WebGL, `bitmaprenderer`, deep and hidden-then-shown canvases are captured with fresh pixels after a redraw or resize; the mark does not change the canvas's layout, context, `toDataURL` or hits. An `OffscreenCanvas`-transferred canvas raises no paint event when it commits, so call `controller.invalidate(layerId)` after drawing it.
