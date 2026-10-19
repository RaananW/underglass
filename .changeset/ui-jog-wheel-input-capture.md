---
"@underglass/ui": minor
---

The JogWheel's input carries core's `data-underglass-gpu-value` while the GPU draws its dimple (the native thumb is never painted), so a flick queues no capture for its `input` events: 49 steps cost 0 input captures (36 to 38 before). The mark is taken off when the GPU stops drawing the dimple.
