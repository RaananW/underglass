---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

`frameWorkMs` now times the whole draw, the policy check included, where it started after that check and reported less than half of a frame's cost on an animated page. Reported values grow for the same work: if you chart `frameWorkMs` (from `onMeasure` or `state().metrics`), expect a step up at this version, not a regression. A new kind, `frameTickMs`, reports the work of the runtime's own frame callbacks apart from the frames they draw: the clock that advances owned animations and playing effects, each transition's tick, and each `animate()` or `advance()` step. It reaches `onMeasure` and `state().metrics.timings` like the other kinds, and never overlaps `frameWorkMs`. The API reference now says what each kind covers and leaves out; neither covers the browser's style, layout and paint, or GPU execution.
