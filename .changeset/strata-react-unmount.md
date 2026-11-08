---
"@underglass/ui": patch
---

React `useStrataGpu` releases its panels before React removes them, so unmounting a component that uses it keeps GPU mode on. Before, the runtime met a detached enrolled layer and fell back to DOM.
