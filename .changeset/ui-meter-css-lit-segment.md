---
"@underglass/ui": patch
---

Fix the Meter's plain CSS presentation, where a lit LED segment looked dark: the socket (`::before`, `z-index: -1`) painted over the segment's own background. The segment's glass is now its `::after`, over the socket, as the indicator forms do; the GPU levels, forced colours, more contrast and reduced motion are unchanged.
