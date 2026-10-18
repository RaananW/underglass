---
"@underglass/ui": minor
---

Add the Instrument level's custom slot to `@underglass/ui/gpu`: `customPart(input, profile)` builds a custom part (a `mesh` profile that core loads from a glB, and the part that uses it) and `attachStrataGpu(controller, { parts: { knobCap } })` (also `strataScene`) replaces the Instrument knob's cap, its chamfer and its pointer with a glB the application names (`source`, a `bounds` box in part-local px after `scale` and `offset`), standing on the skirt in the `knobCap` material and turning through the sweep. Without `parts` every component looks as it did. While the file loads, and if it fails, the knob shows its built-in cap, chamfer and pointer (the custom part's `fallback`); if the mesh does not fit the knob's box the object is drawn at the Relief level and core says why in `state().instrument`.
