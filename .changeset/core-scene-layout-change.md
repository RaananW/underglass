---
"@underglass/core": patch
---

Keep an Instrument scene's parts through the frame a layout change reaches core before its producer (#156). A media preference that changes a border (`prefers-contrast`, `forced-colors`, `prefers-color-scheme`) changes the layer's box in one frame; core's `ResizeObserver` draws it first, so the scene built for the old box was checked against the new one and an object at the edge was drawn at Relief for two composited frames, GPU on. A scene that was already judged is now judged again only against the box it was built for: while the layer's box differs from the scene's `extent` its verdict stands, with a `layout:` warning in `state().instrument.layers[].warnings`, until the next scene, which is checked against the new box. A new scene whose bounds leave the box still steps down with `containment`.
