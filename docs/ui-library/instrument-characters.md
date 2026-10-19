# Instrument characters: tuning record

The record of how each character after premium was proven on the Phase I1 prototype page
(`examples/playground/ui-proto-instrument.html`, its tuning bar's **Character** switch) before its components are tuned
([plan item 16](instrument.md#phase-i5-wave-3-and-characters)). The token tables are in
[design language section 19](design-language.md#19-characters).

## Studio

**Mechanism.** `characters/studio.json` is a sparse layer that `extends` premium. `data-strata-character="studio"` on a
root or a scope selects it: the build writes a block per character into `tokens.css` (`charactersToCss`, layer
`strata.theme`), so CSS, Relief, Objects and Instrument all read the same custom properties. The Instrument level now
builds its part materials (`gpu/instrument-character.ts`), knob and fader springs, pointer width and, on the root only, the
room (`studio.*`, `environment.intensity`) from them; with no attribute the premium tables stand, so existing pages are
unchanged. Premium has a block too, restating what studio sets, so a `premium` scope inside a `studio` one restores it
(a unit test holds the premium materials built from tokens equal to the premium tables). Switching is a rebuild of the
layer, never a revoke.

**Judged on the page** (premium beside studio, Instrument, Objects and CSS, light and dark, DPR 2): black anodised
skirts with aluminium caps read at once and keep the cap's brushed highlight; the near-black ink makes the pointer
and grips the crispest marks on the panel; with the duller room the aluminium no longer whitens, so its cap colour was
darkened from #eff0f1 to #d8dadd. The dark anodised faceplate keeps print at 5.96 to 8.34:1 (premium light 5.96, studio 7.47
minimum on the Instrument copy, 4.5 required). Amber (#ffb020) rather than premium's orange reads as a studio lamp
and stays distinct from the accent.

**Decisions the plan left open.**

- The key light is not the character's (section 19 forbids `light.*`, one light per application). The "warm, lower key"
  is an application option (`light: { elevation: 33 }`); the character carries a warmer pointer light instead.
- Geometry (cap ratio, heights, travel) is premium's: the runtime still builds parts from constants, so a bundle value
  would be a silent no-op. Only the pointer width (1.6 px) is wired. Studio's proportions wait for part tokens to be read.
- Default forms: studio's Switch is `rocker`; Button, ToggleButton, Checkbox, Radio, Select, Slider (`fader`), TextField
  (`display`), Tabs, SegmentedControl, ProgressBar, Badge, Rating, Card are as premium. Recorded in the bundle
  (`form.switch`); no component reads a per-character default form yet, so it is not wired.
- A character may set its sound set (`feedback.<sound>.*`); `feedback.sound` and `haptics` remain forbidden.
- Conformance (`instrument-4.json`): character-independent. The reference and core take every material, light and room
  value from the scene, and the suite's materials are scene data, so a studio run would restate the same renderer
  checks with different input numbers; the studio tokens are proved on the scene the runtime builds (browser suite).

**Not wired yet** (in the bundle and the prototype, not read by the runtime): the switch and meter springs (their
throws are CSS transitions), lamp and meter glass tints, the sound set's use beyond the control's own tokens, and `form.switch`.

**Evidence** (not committed): `evidence/regression/current/ui-probes/instrument-i5-studio/` (premium and studio
screenshots and `variants.json`), from `tests/browser/ui-character-studio.test.mjs`.

## Hifi

**Mechanism.** The same as studio: `characters/hifi.json` extends premium and `data-strata-character="hifi"` selects it from the
shipped stylesheet. It adds two presets (`champagne`, `walnut`) and a coat to the Instrument part materials
(`gpu/instrument-character.ts` now reads a preset's `coat.*`; premium's presets in use have none, so the premium tables are
still built exactly). The prototype page's **Character** switch gained Hi-fi, with page tables for champagne, walnut and
chrome; the cap's ink now follows whichever material the cap role names.

**Judged on the page** (premium beside hifi, Instrument, Objects and CSS, light and dark, DPR 2): the walnut plate with
cream print is the strongest change and keeps the layout legible; champagne caps against cool chrome rings read as the two
metals of a receiver; the pale-gold lamps and display read warm and distinct from studio's amber. Print contrast on decoded
pixels (4.5 required), minimum per presentation at DPR 2: light Instrument 6.60, Objects 6.82, CSS 6.66 (premium 5.96, 7.20,
7.11); dark 8.06, 8.23, 8.14. The display text is 14.1:1 and texel-exact. Mesh pixels stay inside the controls with 0 hit
mismatches in light and dark (about 3,030 hits sampled).

**Decisions the plan left open.**

- Plates: walnut by day, black lacquer in the dark; the faceplate on the page follows. A silver faceplate was not tried: it
  would have read as premium with a warm cap.
- Glow: pale incandescent gold (#ffd36b), not blue-white: blue would sit next to the blue accent and lose the lamp.
- Geometry (larger knobs) is not wired: the runtime builds parts from constants, as for studio, so only the pointer
  width (3 px) is set. Larger knob proportions wait for part tokens to be read.
- Chrome edge breaks are not wired: a cap's chamfer is its own metal polished (champagne), not a role; chrome is on the
  skirt, lever and bezel.
- Type: no per-character face exists in the type tokens, so serif or wide scales are not done.
- Default forms: Switch is `bat`; the others are premium's. Recorded (`form.switch`), not wired.
- Sound: a muted set (lower pitch, longer decay, less noise than premium and studio on every sound).
- Conformance (`instrument-4.json`): character-independent, as for studio.

**Not wired yet** (in the bundle and the prototype, not read by the runtime): as studio's, plus `form.switch` and the
geometry above. The gallery's character switch (#172) does not list hifi: follow-up to add it there.

**Evidence** (not committed): `evidence/regression/current/ui-probes/instrument-i5-hifi/` (premium and hifi screenshots and
`variants.json`), from `tests/browser/ui-character-hifi.test.mjs`. Tested on Chrome Canary 158.0.8110.0, headless and
headed; WICG html-in-canvas main at 5fb3df8 (2026-10-09).
