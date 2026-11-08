---
"@underglass/core": patch
---

When the browser exposes WebGPU but has no usable adapter (for example Firefox on a machine without a WebGPU adapter), `enable()` now stays in DOM mode with the reason `GPU admission failed: WebGPU adapter unavailable (navigator.gpu.requestAdapter() resolved no adapter): ...` instead of the opaque `GPU admission failed: Error: #47` from the underlying engine. Behaviour is unchanged: this is a factual lack of browser support, so the surface remains ordinary DOM.
