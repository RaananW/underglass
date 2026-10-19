---
"@underglass/core": minor
---

An `input` event no longer queues a capture when its target carries `data-underglass-gpu-value` (`GPU_VALUE_ATTRIBUTE`): the mark of a presenter that draws the value itself and hides the native paint. Elements without it capture on `input` exactly as before, and DOM that a handler writes is still captured by the mutation observer. The mark is a promise that the element's paint and state-keyed CSS do not depend on its value (api.md lists the conditions). Skipped events are counted in `state().metrics.inputCapturesSkipped` and per layer (layers containing the element or contained by it, as `queueCapture` attributes) in `state().metrics.perLayer[id].inputCapturesSkipped`.
