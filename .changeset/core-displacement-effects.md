---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

Custom displacement effects: `defineEffect` takes `geometry: "displacement"`, a WGSL function that returns the position in the layer each pixel is drawn from. It is a sampling operation of an effect chain (`kind: "custom"`), so it can move, stretch, split or take away a layer's pixels during a transition, and one chain may hold a displacement and a colour function. A position outside the layer draws nothing, and nothing is drawn outside the layer's box. Materials refuse it.
