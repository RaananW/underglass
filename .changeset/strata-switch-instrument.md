---
"@underglass/ui": minor
---

Draw the Strata Switch forms at the GPU helper's `instrument` level: each of `slide`, `rocker`, `bat` and `wall` is an object of parts (the slide's chamfered block, the rocker's and wall's tipping paddles, the bat's lever and ball, with the bezels, plate, nut, bushing and lit flags), bounded by the input's box and posed by the same CSS throw (`--strata-switch-t`, on the form's spring) that Relief and Objects follow, so a throw adds no capture or hit-geometry update after the native change. The scene's structure never changes with the switch's state, the casters of the parts that stand still or slide are capped where their shadows would leave the box, and the parts take the input's hover and disabled state. A detented Knob now plays the `tick` feedback as its pointer passes a detent; feedback stays off by default.
