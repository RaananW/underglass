---
"@underglass/core": minor
---

An `input` event no longer queues a capture when its target carries `data-underglass-gpu-value` (`GPU_VALUE_ATTRIBUTE`): the mark of a presenter that draws the value itself and hides the native paint. Elements without it capture on `input` exactly as before, and DOM that a handler writes is still captured by the mutation observer. Skipped events are counted in `state().metrics.inputCapturesSkipped` and per layer in `state().metrics.perLayer[id].inputCapturesSkipped`.
