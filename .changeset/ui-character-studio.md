---
"@underglass/ui": minor
---

Add the `studio` character (`characters/studio.json`, a sparse layer over premium: matte black anodised skirts and plates, denser brushed aluminium caps with near-black ink, a duller room, firmer springs and deeper detents, studio amber glow and a dry sound set) and select characters at runtime: `data-strata-character="studio"` on the root or on a scope, from the shipped stylesheet (`charactersToCss`). The Instrument level builds its part materials, knob and fader springs, pointer width and (on the root) the room from the character's tokens; Relief and Objects read its presets and roles; a character may now set its sound set (`feedback.<sound>.*`), and a character may extend another (`extends`). Without the attribute nothing changes.
