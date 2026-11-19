---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

The presentation policy check runs once per frame where it ran several times with the same inputs. A frame of owned playback or playing effects ran it twice and now runs it once, and each owned animation's source check (its computed style, keyframes and timing) runs once a frame, not three times. Running transitions share one frame callback: a group of N layers runs one check for all of them plus the draw's, not N + 1. The same things are checked, in the same frame, with the same recovery; when a transition's own motion breaks the contract it is still the one cancelled with the reason. On a test page with eight owned animations, with the CPU slowed four times, the main thread's JavaScript per frame fell by about a quarter.

Two new counters, `state().metrics.policyPasses` and `state().metrics.ownershipChecks`, make the checks countable. `state().runtimeResources.controllerFrames` now counts the shared transition callback once, however many transitions run, where it counted one per transition.
