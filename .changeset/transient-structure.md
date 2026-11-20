---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

A layer that is detached from the document or has no size no longer turns GPU mode off the moment it is seen. A React commit passes through such states for a task: it removes an element before a passive effect's cleanup releases its enrollment, hides a layer that a later effect shows again, or swaps a `key` that removes one element and enrolls another under the same id. On the GPU these are now decided at the next frame boundary, before that frame is presented: until then no GPU frame is drawn and no hit geometry changes, so the screen keeps the frame it already shows. A layer that was released by then simply leaves, and one that is back is drawn with its current pixels. A layer that is still detached or zero-sized falls back to ordinary DOM in that first frame, with the same reason as before (`Detached enrolled layer`, `Zero-sized layer`). Admission, and every other structural check, still decide at once; content that overflows a layer and `z-index` on a layer still leave GPU mode immediately. Two new counters, `state().metrics.deferredStructure` and `state().metrics.heldDraws`, count the layers held for a frame boundary and the draws withheld meanwhile. A fallback with a layer whose element was already removed no longer fails while it restores ordinary DOM.
