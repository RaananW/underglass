---
"@underglass/ui": patch
---

`@underglass/ui/gpu` builds a panel's scene only when something happened to that panel, where it built every panel's in each frame anything moved. A drag, a hover or a blinking light in one panel no longer costs the others, and a stepped blink costs its own panel only in the frames its light changes. The poll (`poll`, 500 ms) still reads every panel, and `refresh()` does at once.
