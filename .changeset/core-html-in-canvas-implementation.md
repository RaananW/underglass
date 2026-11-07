---
"@underglass/core": patch
---

`state().htmlInCanvas` names the HTML-in-Canvas implementation the latest admission tested: `"native"` for the browser's own, `"polyfill"` when `@underglass/html-in-canvas-polyfill` stands in for it (read from the global it publishes; core does not import it), or `null` before the first admission. Diagnoses and bug reports from a polyfilled page no longer look like native ones.
