---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

Writes are drawn once per frame. `setTransform`, `setOrigin` and a `Surface`'s committed layout or transform used to draw at once; they now change state in the call (hits and `getBoundingClientRect()` follow in the same task) and are drawn with the frame, like effect and material updates. Every write made in one task appears in the same frame, in the state the task left, so a pose written and replaced in one task is never shown, also when a layer is enrolled between the two. A frame loop is drawn in the frame it wrote in, whichever way it asks for its frames.

Changed timing: code that wrote a transform and read the canvas's pixels in the same task now reads the previous frame. Wait for a frame, or `await controller.settle()`.
