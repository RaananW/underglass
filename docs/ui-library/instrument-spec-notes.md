# Instrument spec notes: provisional values

**Status:** working list (2026-10-17) for the Instrument level's spec, PR 3 of the
[Instrument plan](instrument.md#pull-request-sequence). The [design language](design-language.md) (DL below) marks
every provisional value with a dagger (†), and the [Rendering Model](rendering-model.md#2d-instrument-version-4) (RM)
names its provisional rules in the text. The values came from the first prototype iteration
([I1](instrument-phase0.md#i1-prototype)), a Phase I0 probe, or a range proposed while writing the spec. The second
iteration (v2 below: the look iteration the owner asked for after reviewing v1 on 2026-10-17) has now been folded in.

**v2's source:** the Phase I0 report's section "I1 prototype, second iteration" (decisions 23–27, the findings) and
the page's code under `examples/playground/src/ui-proto/`, both on the branch `probe/instrument-i1-v2` (PR #137) until
it merges. Line numbers below are of that branch. v2's look sign-off is pending with the owner.

**Status of each value:**

- **Confirmed by v2:** the v2 page uses the value and its test measured the page with it (GPU on, 0 px outside the
  controls, 0 hit mismatches, text exact). Its dagger is gone. Where v2 changed it, the row gives v1's value and v2's.
  If the owner's sign-off on v2 changes a value, it returns to this list.
- **Still provisional (v2 did not touch it):** v2 has no part that uses it, or did not measure it. It keeps its dagger.

**Rule for the follow-up:** change the value in the place named, remove its dagger, and record the change in the
design language's change log (or the Rendering Model's, for its rows). A changed value that alters an expected colour
of `instrument-4.json` is regenerated with the suite.

## Look values

| Value | Where | v1 | Now (v2) | v2 source | Status |
| --- | --- | --- | --- | --- | --- |
| Instrument fill | DL §3 *Light at the Instrument level*; RM 2D.1, 2D.5 | 0.35 (against `light.ambient` 0.55) | **0, off:** the studio is the fill | `instrument-surfaces.ts` 256–257 (hemispheric intensity 0); `instrument-tokens.ts` 145 still holds 0.35, unused | Confirmed by v2 (changed) |
| `base.direct` of the metal presets | DL §3, §4 *Presets*, §19 | 0.2 | **1** (every recipe) | `instrument-tokens.ts` 77–102 (`direct: 1`); `instrument-surfaces.ts` 274; decision 26 | Confirmed by v2 (changed) |
| `emitter.height` | DL §3 *Emitters* | lamp 0.7, LED 0.8 lens diameters; range 0.25–2 | — | No lamp or LED on the v2 page | Still provisional (v2 did not touch it) |
| `emitter.strength` | DL §3 | lamp 3,200, LED 520; range 0–32,000 | — | No lamp or LED on the v2 page; the plan says lamps "are still to be judged at I0.3's strength" | Still provisional (v2 did not touch it) |
| `emitter.guardFeather` (lamp, LED) | DL §3; RM 2D.1 `protected.feather` | 4 px; range 0–16 | — | No lamp or LED on v2 | Still provisional (v2 did not touch it) |
| One guard feather per layer, the largest `guardFeather` of its emitters | DL §3 | — | New rule | v2 had one face emitter, so it could not test it | Still provisional: a rule the spec chose (below) |
| Face-pool outset | DL §3 | 48 px | — | v2's only face emitter is the pointer light, which lights the layer's box alone | Still provisional (v2 did not touch it) |
| `glowOn` colour | DL §4 roles | (255, 146, 40) | (255, 146, 40), unchanged | `instrument-tokens.ts` 157 | Still provisional: v2 kept it for the ring and flags but has no lamp to pick one amber against I0.3's (1, 0.72, 0.38) |
| `pointerLight.strength`, `radius`, `height` | DL §3 *The pointer light* | 16,000; 360 px; 120 px (I0.3; not on the v1 page) | 16,000; 360 px; 120 px | `instrument-light.ts` 47 | Confirmed by v2 |
| `pointerLight.colour` | DL §3 | (255, 255, 255) | **(255, 242, 224)**: (1, 0.95, 0.88), I0.3's own value | `instrument-light.ts` 47; `ui-probes/instrument-emitters.ts` 77 | Confirmed by v2 (changed) |
| `pointerLight.face` | DL §3; RM 2D.4 `face` | — (full strength) | **0.3** of the strength on the face; parts take all of it | `instrument-light.ts` 47, 254, 259; decision 25 | Confirmed by v2 (new) |
| `pointerLight.guardFeather` | DL §3 | — (4 px, `emitter.guardFeather`) | **10 px** | `instrument-light.ts` 47, 252 | Confirmed by v2 (new) |
| The pointer light only while the pointer is over the stage | DL §3 | — | New | `instrument-mesh.ts` 174; `instrument-page.ts` (the `pointermove` and `pointerleave` listeners) | Confirmed by v2 (new) |
| Pointer-light ranges | DL §3 | 0–32,000; 60–1,000; 20–400 | Unchanged, plus `face` 0–1 and `guardFeather` 0–16 | v2's tuning bar has an on/off toggle only | Still provisional (v2 did not touch them) |
| Studio defaults | DL §4 *Environment*; RM 2D.5 | key 12, keyRadius 0.24 rad, fill 1.2, front 0.12, strip 2.5, floor 0.03, ceiling 0.25 (I0.4; v1 ran a grey sweep, key 2.5, strip 0.7) | I0.4's, unchanged | `ui-probes/instrument-environment.ts` 41; `instrument-surfaces.ts` 108–120, 251–253 | Confirmed by v2 |
| Studio ranges | DL §4 | As in the table | Unchanged | v2 exposes only `environment.intensity` ("Reflections", 0–2) | Still provisional (v2 did not touch them) |
| Page reflection on light faceplates | DL §4 *Environment* | Cube as I0.4; v1's caps reflected the light faceplate almost white | Cube as I0.4: 512², refreshed on capture only (2 refreshes per test run) | `instrument-surfaces.ts` 261–263, 316–321 | Confirmed by v2: with the studio the caps are no longer whitened; head-on, flat tops show the studio's front more than the page (v2's limits) |
| `lacquer` | DL §4 *Presets* | (29, 29, 31), roughness 0.5, coat 1 at 0.03 (I0.4); I1 v1 used (16, 16, 18), 0.38 | **(28, 28, 30)**, roughness 0.5, coat 1 at 0.03 | `instrument-tokens.ts` 87 | Confirmed by v2 (changed) |
| `glass` | DL §4 *Presets*, *Glass*; RM 2D.5, 2D.6 | `dispersion` 0.5 (spread 0.05); reflection roughness 0.02; rim tint (209, 230, 224) at 0.9; a separate reflection shell | ior 1.5; **`dispersion` 0.2** (spread ±0.02); **absorption tint (0.84, 0.93, 0.9) at 0.03 per px** of path; **reflection 1.5 × `environment.intensity`**, a mirror traced to the stand, the face or the studio | `instrument-tokens.ts` 92; `instrument-surfaces.ts` 298–299 (uniforms), 141–149 (reflection), 195–206 (lens); decision 23 | Confirmed by v2 (changed): rim +25.9 levels (light), +123.6 (dark); hub ×1.46 |
| Window finish band | DL §4 *Glass*; RM 2D.6 | The coat profile (2.6) | **Band 3–26% at 0.3**, brighter on the key's side, **horizon 25–31% at 0.25** | `instrument-tokens.ts` 156; `instrument-surfaces.ts` 177–178, 192 | Confirmed by v2 (new): display text 10,830 px, 0 mismatched; 12,790 of 24,962 window px outside the text changed |
| `metal` (brushed aluminium) | DL §4 *Presets* | (239, 240, 241), roughness 0.3, `brush` 0.9, `grain` 0.15 (I0.4); I1 v1 used (236, 237, 239), brush 0.45 | Unchanged from I0.4 | `instrument-tokens.ts` 77; `instrument-surfaces.ts` 264, 273–276 | Confirmed by v2 |
| No grain on large plates | DL §4 *Presets* | — | Wall plates and display bezels take no grain map | `instrument-mesh.ts` 441, 484 (`grain: false`) | Confirmed by v2 (new): it aliased into coarse streaks |
| `polished` | DL §4 *Presets* | (244, 245, 247), roughness 0.08 | **(250, 250, 251), roughness 0.04** | `instrument-tokens.ts` 82 | Confirmed by v2 (changed) |
| `gunmetal` | DL §4 *Presets* | (104, 107, 114), roughness 0.36, `brush` 0.6 | **`brush` 0.9** with the grain | `instrument-tokens.ts` 102 | Confirmed by v2 (changed) |
| `gold` | DL §4 *Presets* | (255, 219, 147), roughness 0.18 (I0.4); I1 v1 used (246, 214, 150), 0.30, brush 0.6 | (255, 219, 147), roughness 0.18, no brush | `instrument-tokens.ts` 97 | Confirmed by v2 |
| `chrome` | DL §4 *Presets* | (250, 250, 252), roughness 0.04 | — | Not a v2 material (`polished` now has its roughness) | Still provisional (v2 did not touch it) |
| Instrument role defaults | DL §4 roles | `knobCap`, `faderCap`, `lever`, `rockerPlate` → `metal`; `knobSkirt` → `polished`; `plate` (wall plates and bezels) → `metal` light, `gunmetal` dark | As v1, with chamfers and the lever in the cap's metal polished (roughness 0.06, no brush), and **bezels, nuts and bushings in `polished`** (a new `bezel` role) | `instrument-mesh.ts` 296 (cap, skirt, plate), 408, 425–427, 463, 484 (bezels in the skirt's material), 441 (the wall plate in the plate's); `instrument-surfaces.ts` 273 (polished roughness) | Confirmed by v2 (changed: the `bezel` role is the spec's naming of what v1 and v2 both did) |
| Knob numbers | DL §6 *Instrument object table* | Chamfer 1.4; pointer 2 wide, 0.3–0.8 of r; flat top | **Chamfer 2; pointer 2.2 wide, 0.28–0.86; spun top crowned 1.2; skirt top a 7.5° cone**; the rest unchanged (skirt Ø64, 2.5 high, 0.8 edge break; cap 0.8 × skirt, 16 high; dial box skirt + 76; ticks r + 5, numerals r + 20; 11 detents; detented 0.8 × size) | `instrument-tokens.ts` 110, 122–141, 147–148; `instrument-markup.ts` 24, 32 | Confirmed by v2 (changed) |
| Glass knob cap | DL §6 table | A dark coated cap, (20, 24, 29) | **Radius 0.45 × the cap diameter (23), 2 px wall, elliptical dome to 22 high, hub ring r 7; pointer in the faceplate's ink** | `instrument-tokens.ts` 137, 139; `instrument-mesh.ts` 349–357 | Confirmed by v2 (new) |
| Glass shadow strength | DL §7 | — | **0.45** of `shadow.strength` | `instrument-mesh.ts` 305 | Confirmed by v2 (new) |
| Fader numbers | DL §6 table | Carriage taper 2.5, no chamfer; grip 1.4; travel 180; carriage 30 × 42, 12 high, radius 3; box 46; slot 5 | **Taper 0.6, chamfer 2, grip 1.6**; the rest unchanged | `instrument-tokens.ts` 149; `ui-proto-instrument.html` 59 (slot) | Confirmed by v2 (changed) |
| Slide numbers | DL §6 table | Block taper 1.5; flag 0.25 lit | **Taper 0.4, chamfer 2; flag lit 1.0 when on**; box 64 × 28, block 24 × 20, 6 high, travel 28 unchanged | `instrument-tokens.ts` 150; `instrument-mesh.ts` 395 | Confirmed by v2 (changed) |
| Rocker numbers | DL §6 table | Facets 10 / 5; ±11.3° | **Facets 12 / 4, ±17.7°; flag 18 × 9 on the On end, 1.0 / 0.12**; bezel 38 × 62, 2 high, paddle 28 × 50 unchanged; **box 54 × 70** (v2's 38 × 62 box fails core's containment: the tipped paddle's raised corners stand about 29 px at full depth and drift up to 12 px at the stage's edge, inset −6.7 px) | `instrument-tokens.ts` 151; `instrument-mesh.ts` 407, 412; `packages/ui/src/gpu/instrument-switch.ts` (#146) | Confirmed by v2 (changed); the box confirmed by #146 |
| Bat numbers | DL §6 table | Box 44 × 68; nut Ø22; bushing Ø13; lever 28; base 2.8, neck 2.1, ball r 3.6; ±30° | **Box 48 × 92; nut Ø24; bushing Ø14; lever 40 × min(depth scale, 1.15); base 3.4, neck 2.7, ball r 5.6; ±40°**; nut 3 and bushing 7 high, pivot 5 unchanged | `instrument-tokens.ts` 152; `instrument-shapes.ts` 43 (radii) | Confirmed by v2 (changed): the lever projects about 28 px head-on |
| Wall numbers | DL §6 table | Paddle 6 high, taper 1; ±6° | **Paddle 7 high, taper 0.6, chamfer 2, crown 1.6; ±9°; dot 12 × 4, 1.0 / 0.12**; box 66 × 92, plate 3 high, radius 6 unchanged; **plate 58 × 84** inside the box (4 px for its edge and shadow) | `instrument-tokens.ts` 153; `instrument-mesh.ts` 447; `packages/ui/src/gpu/instrument-switch.ts` (#146) | Confirmed by v2 (changed); the plate's size confirmed by #146 |
| Push-button numbers | DL §6 table | Box 56; taper 1.2; travel 2.5 held, 1.2 latched; bezel 2.8 high | **Box 64; taper 0.6, chamfer 2; travel 4 held, 1.8 latched; bezel 3.2 high; ring 1.0 / 0.22 in the bloom**; cap Ø40, 6 high, bezel r 27 → 22.6, ring r 22.6 → 20.6 unchanged | `instrument-tokens.ts` 154; `instrument-mesh.ts` 464 | Confirmed by v2 (changed) |
| Display numbers | DL §6 table | Only the 0.5 px bezel inset (I0.4) | **Box 236 × 58; bezel 7, radius 8, 2.4 high, chamfer 2; window 2.4 high, bevel 2.6; text a native `<output>`, 13 px monospace, protected rect + 2 px** | `instrument-tokens.ts` 156; `instrument-markup.ts` 109; `instrument-mesh.ts` 482–499 | Confirmed by v2 (new); the backlight emitter is still provisional |
| Lamp and LED lens sizes | DL §6 table | 28 and 10 | — | Not on v2 | Still provisional (v2 did not touch it) |
| Meter segments | DL §6 table | 16 | — | Not on v2 | Still provisional: set with the Meter component (Phase I4) |
| Objects per layer | DL §6 *Part budgets* | 256 | — | v2 drew 61 part kinds (27 casting) on one layer, against "about 16" per layer, not measured for cost | Still provisional (v2 did not touch it): measure with the 250-control page |
| `shadow.map.darkness` default | DL §7; RM 2D.7 | 0.1 | 0.1 | `instrument-light.ts` 39 | Confirmed by v2 |
| `shadow.map.darkness` range 0–0.15, and the softness where a mapped streak meets the face shadow | DL §7 | Open | — | v2's report does not judge them; the plan leaves the softness "to be judged on the screenshots" | Still provisional (v2 did not touch it) |
| I1's contact line (0.22 over 1.6 px) | Not in the spec | — | Unchanged, plus a 0.75 gap over 1.2 px round a pressed cap | `instrument-tokens.ts` 144; `instrument-mesh.ts` 77, 480 | Still provisional: whether an analytic contact line is part of the face shadow, or contact shadows stay a post option |
| Instrument hover | DL §11 | No pose change | — | Not prototyped | Still provisional (v2 did not touch it) |
| Instrument disabled | DL §11 | Flattened to the face, as Objects | — | Not prototyped | Still provisional (v2 did not touch it) |
| Springs | DL §12 | knob 420 / 41, detent 900 / 42, fader 420 / 41, slide 600 / 49, rocker 1,200 / 58, bat 1,400 / 45, wall 1,200 / 58, button 1,600 / 80 | Unchanged | `instrument-tokens.ts` 159–163; `instrument-mesh.ts` 183–192 | Still provisional (v2 did not touch it): v2's springs are **not clamped at the stops** (the update has no clamp) and its test checks containment at rest only, so the clamped throw is still unjudged |
| Spring ranges | DL §12 | stiffness 50–4,000, damping 5–200 | — | Proposed | Still provisional (v2 did not touch it) |
| `knob.snap` | DL §14 | — (a ring click set the value by angle alone) | **2°** to a printed numeral | `instrument-behaviour.ts` 33, 52–61; decision 24 | Confirmed by v2 (new): ring clicks on five numerals per knob set exactly their values |
| Tap and wheel notch | DL §14 | `step` | **`step`, at least 1% of the range**; a tap anywhere inside the skirt | `instrument-behaviour.ts` 49, 98; `instrument-page.ts` 101 (`capRadius` = skirt radius); decision 24 | Confirmed by v2 (changed) |
| Premium defaults | DL §19 | Switch `slide`; faceplate by theme; metals direct × 0.2; lit ring plain emissive | Switch `slide`; faceplate by theme; **metals direct × 1; lit rings and flags emissive in the bloom; pointer light on the face at 0.3** | `instrument-tokens.ts` 109–110, 121; `instrument-light.ts` 47 | Confirmed by v2 (changed); the look sign-off is the owner's |

## Proposed ranges (no measurement behind them)

These are the ranges a token needs for validation; they were proposed while writing the spec. v2's tuning bar reaches
depth, size, skirt, chamfer, travel, detents, key light, reflections and the pointer light's on/off, not these.

| Token | Range | Where |
| --- | --- | --- |
| `emitter.height`, `emitter.strength`, `emitter.guardFeather` | 0.25–2 diameters; 0–32,000; 0–16 px | DL §3 |
| `pointerLight.strength`, `face`, `guardFeather`, `radius`, `height` | 0–32,000; 0–1; 0–16 px; 60–1,000 px; 20–400 px | DL §3 |
| `studio.*` | As in the table | DL §4 |
| `knob.sweep`, `knob.dragPx`, `knob.fine`, `knob.tapSlop`, `knob.snap` | 90–330°; 50–1,000 px; 0.01–1; 1–12 px; 0–5° (the defaults are I0.7's and v2's, settled) | DL §14 |
| `spring.*` | stiffness 50–4,000; damping 5–200 | DL §12 |

## Rules the spec chose that the prototypes did not test

| Rule | Where | Status after v2 |
| --- | --- | --- |
| **Poses are clamped at the stops,** and the velocity into a stop is dropped | DL §12; RM 2D.2 | Still untested: v2's springs are unclamped (bat damping ratio 0.60, detent 0.70, rocker and wall 0.84 overshoot their stops) and v2 checks containment at rest only. The prototype needs the clamp and a mid-motion containment check |
| **The guard limits the whole face change** in protected rects | DL §3; RM 2D.4 | Still untested: v2's pointer pass caps the emitter light alone, as I0.3 did |
| **One guard feather per layer,** the largest `guardFeather` of its emitters | DL §3 | New with this update; v2 had one face emitter |
| **A failing object is drawn as its Relief primitive** | DL §6; RM 2D.9 | Still untested |
| **Camera rule inset less 0.5 px** | DL §6; RM 2D.3 | Still untested |
| **Part shadows and relief shadows combine by product** | RM 2D.7 | v2 draws them the same way (the face shadows alpha-blended over the layer's result, `instrument-light.ts` 11–12); no separate measurement |
| **Windows subtract the flat-pane Fresnel** and reflect only in finish zones and on the rim | DL §4 *Glass*; RM 2D.6 | **Confirmed by v2:** the display text is texel-exact through the glass and the band and bevel change only the window outside it. v2 subtracts `F0` and returns the texel on flat glass outside the zone; RM's `Fr(n) − Fr((0, 0, 1))` gives the same zero there and differs from `F0` by less than 10⁻⁵ at the stage's corners |
| **The lens construction and the traced reflection** | DL §4 *Glass*; RM 2D.6 | **Confirmed by v2** (decision 23), one refraction at the dome and one at the flat bottom, no exit through the side wall (v2's limits) |
| **A layer with more than 64 text runs protects its whole box** | DL §3; RM 2D.1 | Still untested |
| **Custom parts take their material from their role;** a failing custom part is replaced by the built-in part | DL §6 *Custom parts* | Still untested: core work item 5 has not started |
| **The sampled tolerance, 12,** and the sample-placement rule (3 px, 4 levels per px, 24 levels apart) | RM 2D.10 | Still untested: first checked when core's Instrument material runs `instrument-4.json` against Lite |

## What v2 still reads as wrong (its own list, for the sign-off)

- "Glass on everything" is weak on the light theme: flat glass blocks (fader, slide, paddles) show the plate through
  themselves with only their bevels refracting, and a glass part over another part shows the faceplate, not the part
  under it (the shader sees only the capture).
- The wall paddle reads near-white when on (its crown reflects the strip and saturates).
- The push button's travel reads mainly through the ring and the darkening gap; head-on the cap's sinking is small.
- The pointer light is subtle on the dark theme at 0.3 face strength.
- Head-on, the page's reflection is subtle: most of what metal shows is the studio.
- The Objects panel's drop shadow at 100% depth is still clipped by the frame (the plan's look-iteration list).

## v2 facts that are not spec values

- **Startup and core's successor deadline:** core gives a successor composition's shader compilation 1,500 ms. With
  v2's scene compiling while the relief material and the Objects copy asked for a successor, 1 start in 8 fell back to
  DOM ("Successor composition preparation timed out after 1500 ms"; v1: 16 of 16 on GPU). The page now draws eight
  frames and waits for the GPU before it sets them (`instrument-page.ts` 165–169): 24 of 24 starts on GPU at the
  defaults and 8 of 8 with glass on the dark theme. Core's `instrument` material (Phase I2) must sequence its pipeline
  compiles with core's successors, or the deadline must count only core's work. This is a core finding, not a rule of
  the model.
- **Lite 1.33's `ShaderMaterial` binds 2D textures only,** not a cube, which is why the glass evaluates the studio
  from its definition and traces reflections to the face (RM 2D.6 states the construction engine-neutrally).
- **Lite's shadow task builds its casters from the scene,** and **double-sided PBR shades a reversed-winding face
  black** (the rocker's prism); both in the report's findings.
- **The prototype page:** the panel is 590 px tall (was 548), for the display and an empty plate patch for I0.6; the
  faceplate's relief scene has an outset of 36 px on every side (was 18; the report gives no reason, and by the shadow
  formula the 8 px plate's shadow reaches about 26 px past its edge at 50% depth, which 18 cut). The display is a
  native `<output>` reading out the three controls.
- **Post-chain parameters** the spec does not tokenise: SMAA threshold 0.05; bloom threshold 0.05, weight 0.8, kernel
  48 (`instrument-light.ts` 40–41).
- **Parity budgets (I0.6) were re-derived** with the same rule over v2's look (decision 27): the rocker's p95 moved
  past v1's budget (144.86 against 143). The spec cites the rule, not the numbers, so nothing in the spec changes.

## Not yet measured (hardware and scale)

- **A low-end GPU:** the part budgets (2,048 per layer, 6,000 per stage, about 16 kinds), the 64-emitter budget, the
  default post chain's cost and the adjust policy's defaults (VAL-009) were measured on one RTX 3080 only. v2's 61 part
  kinds on one layer were not measured for cost.
- **The pointer light across gaps without a stage layer** (the probe lit a full-stage layer).
- **`subsurface`** has not been probed on Lite.
- **Emitter light on captured caps** (not lit in I0.3), and the pointer light's specular at Relief and Objects.
- **A canvas on fractional pixels with v2's scene:** v2's headful run had the canvas on whole pixels, so the scrollbar
  case was not exercised.
