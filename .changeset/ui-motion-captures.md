---
"@underglass/ui": minor
---

A Dialog's depth entry and a Drawer's slide capture only what changes in the DOM (#165). The GPU helper rewrote a presented scrim's `data-strata-mode` with the value it already had on every frame of a motion; every DOM mutation is a capture, so a 2.4 s open recaptured every layer each frame (about 407 captures, flush or plate alike). The write is now made only when the value differs: the open makes 9 to 12 captures, none in the middle of the motion, and the close 3 to 5. A content change made mid-motion is still captured at once.
