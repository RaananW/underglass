# Switch

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Turns a setting on or off, taking effect at once. Renders a native `<input type="checkbox" role="switch">`
with a `<label>`, following the WAI-ARIA [Switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).
The element is native; `role="switch"` is the one ARIA attribute, because HTML has no switch element. A
choice that is submitted later with a form is a [Checkbox](checkbox.md).

## 2. Object

A **track** (a well) with a **spherical knob** that slides. The track's base is the input's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Track | Pill (`radius.pill`) sunk by `elevation.well` (2) | −`elevation.well` | No; turns `emissive` when on |
| Knob | Sphere of diameter track height − 2 · `object.taper` (14 at the default size) | `elevation.raised` (3) | Slides the track width minus the track height, over `motion.normal` |

The input's border box is `size.switchWidth` by `size.indicator`: 30 by 16, 36 by 20 (default) or 44 by 24 px for
`data-strata-size` small, medium or large (section 13), and the label row is at least `target.min` (24) high and covers the whole row, so the row is the target (WCAG 2.5.8). The
track fills the box. The knob's whole travel stays inside it, inset by `object.taper` at both ends, so the
native control covers every position of the knob (section 6, moving parts). The knob casts a shadow onto the
track.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Track, off | `track` | — | `field` (`matte`) |
| Track, on | `accent` | — | `trackOn` (`emissive`) |
| Knob, off | `knob`, with a 1.5 px `edge` ring | — | `knob` (`satin`) |
| Knob, on | `knob` (the same colour), with a 1.5 px `on-accent` ring | — | `knob` (`satin`) |
| Track outline | `edge`, 1 px | — | None |
| Label | None (sits on the panel) | `text` | None |

The track's `edge` outline keeps its shape at 3:1 against the panel. The knob keeps at least 3:1 against the
track under it in both states (section 8). The state is also shown by the knob's
position, never by colour alone. `data-strata-material` on the input overrides the track material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, off | Track at `−elevation.well`; knob at the start end | Knob at the start | Inset shadow, `track` fill |
| Hover | Knob height `× state.hoverHeight`; track interior `+state.hoverLift` | Knob rises a little | Larger knob shadow, `brightness(1.04)` |
| Pressed (`:active`) | Knob height `× state.pressHeight`; interior `−state.pressSink` | Knob sinks | Smaller shadow, `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, outside the track | Emissive glow on the track | `outline: focus.width solid accent` |
| On (`:checked`) | Track `emissive`; knob slides to the end over `motion.normal` | Track lights; knob slides | `accent` fill; knob `translateX` |
| Disabled | Track and knob at height 0, no emissive glow, content at 38% | Flattened to the face | Flat, `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on the track | Same | `outline` in `danger` |

Busy does not apply; for work in progress the application disables the switch and shows a
[Spinner](spinner.md). Under `prefers-reduced-motion`, the knob jumps to the end with no slide.

## 5. Relief primitives

Two: the `<input>` is a `well` (`radius.pill`); the knob is a `knob`, drawn from a child
`<span data-strata-face="knob">`. Its position follows `:checked`; the pose lives in the GPU state and in
CSS `transform`, never in the input's box.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.accent`, `colour.knob`, `colour.edge`, `colour.text`, `colour.danger` | — |
| `radius.pill` | — (theme or scope) |
| `elevation.well`, `elevation.raised`, `object.taper`, `state.*`, `interior.max` | — |
| `material.roles.field`, `material.roles.trackOn`, `material.roles.knob` | `material` |
| `target.min` (track height), `density` (label row height), `space.*` | — |
| `font.size.body` | — |
| `focus.width`, `focus.offset`, `motion.normal`, `motion.easing.standard` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<label class="ug-switch">
  <input class="ug-switch__input" data-strata-face="well" type="checkbox" role="switch" name="wifi" />
  <span class="ug-switch__knob" data-strata-face="knob" aria-hidden="true"></span>
  <span class="ug-switch__label">Wi-Fi</span>
</label>
```

- The `<input>` is the boundary element (`appearance: none`, `size.switchWidth` by `size.indicator`). Refs and `checked` reach it.
- The wrapping `<label>` extends the hit target to the whole row, at least the density's control height.
  The knob is `pointer-events: none` and lies over the input.
- A label on the other side of the track is a `reverse` prop; the DOM order stays, so the focus and reading
  order do not change.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Space | Toggle (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `switch` (explicit), with the checked state exposed as `aria-checked` by the browser from `checked`.
  Screen readers say "on" or "off". The label must not contain "on" or "off".
- Name from the label text. Help and error through `aria-describedby` ([Field](field.md) without `label`).
- Enter does not toggle, as the native checkbox.

## 9. CSS presentation

The `well` recipe as a pill, the on-track as `accent` with a glow shadow for the `emissive` material, and
the knob as a circle with a spherical gradient and a cast shadow from the light. The input is `size.switchWidth` by
`size.indicator`; the row is at least the density's control height. Under `forced-colors`: the track has
a `ButtonBorder` border; off is `Field` with a `ButtonText` knob at the start; on is `Highlight` with a
`HighlightText` knob at the end; `GrayText` when disabled; no glow. Position and fill both show the state.

## 10. Tests

- **Plain DOM:** click on the track and on the label toggles once; Space toggles; `role` is `switch`; form
  data follows `checked`; disabled does not toggle.
- **GPU:** at Relief and Objects, GPU stays active through the slide; pixels are fresh at the end position
  and the track glows when on; a hit at the track's edge pixel and on the label reaches the input, at both
  knob positions.
- **Accessibility:** axe on on, off, disabled and invalid, in light, dark and high contrast; accessibility
  snapshot equal in DOM and GPU modes (`switch`, checked); focus ring in decoded pixels; knob contrast on both
  tracks.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, on and focus.

## 11. Forms

The same native switch drawn as hardware ([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level),
[design language section 6](../design-language.md#instrument-object-table)): `form` (prop) or `data-strata-form` (on the
row) chooses `slide`, `rocker`, `bat` or `wall`. Without it the Switch is the Strata switch above, at every level; the
premium character makes `slide` its default once characters land (design language section 19; no character is on main
yet). Sections 1, 3, 6 and 8 hold: the native `<input type="checkbox" role="switch">` is the control, its label row is
the target, the state is `checked` (`aria-checked`), and the label must not contain "on" or "off".

```html
<label class="ug-switch" data-strata-form="rocker">
  <input class="ug-switch__input" type="checkbox" role="switch" name="power" />
  <span class="ug-switch__object" aria-hidden="true">
    <span class="ug-switch__bezel" data-strata-face="raised"></span>
    <span class="ug-switch__paddle">
      <span class="ug-switch__facet ug-switch__facet--on" data-strata-face="raised"></span>
      <span class="ug-switch__facet ug-switch__facet--off" data-strata-face="raised"></span>
      <span class="ug-switch__flag" data-strata-face="flat"></span>
    </span>
  </span>
  <span class="ug-switch__label">Power</span>
</label>
```

- The `<input>` is a **transparent, square box over the object's whole travel** (the I0.2 box rule), with no face: a
  press anywhere on the object is a press on the input, and the hit area never moves. Its corners are square, so no
  corner of the box lets a press fall to the row.
- `.ug-switch__object` (`aria-hidden`; it and every part `pointer-events: none`) lies over the input, in paint order:

  | Form | Parts (`switchFormMarkup` in `shared/switch-forms.ts`) |
  | --- | --- |
  | `slide` | `slot` (`groove`), `flag` (`flat`), `block` (`raised`) with its `grip` |
  | `rocker` | `bezel` (`raised`); `paddle` with `facet--on` and `facet--off` (`raised`) and `flag` (`flat`) |
  | `bat` | `nut`, `bushing` and `lever` (`raised`), `ball` (`knob`) |
  | `wall` | `plate` (`raised`); `paddle` with `facet--on` and `facet--off` (`raised`) and `flag` (`flat`) |

- The bindings render it from `form`. Any other `form` string is still the native `form` attribute (the id of the
  input's form owner), so existing uses keep working. `reverse`, `material`, `level`, Field wiring and refs are as for
  the Strata switch; `size` does not change a form's box.

### Object per form

On is to the right for a slide and up for the others: an on rocker or wall switch has its top (On) end pressed in and
its bottom end raised, and an on bat points up. Numbers are the premium character's at 50% depth (design language
section 6, the second prototype iteration's).

| Form | Box (the input) | Static parts | Moving part | Throw | Spring |
| --- | --- | --- | --- | --- | --- |
| `slide` | 64 × 28 | The slot, 50 × 8, printed | A block 24 × 20 (6 high, taper 0.4, 2 px chamfer); its lit flag (21 × 4, in the slot's left half) shows once the block has left it | Slides 28 | `spring.slide` 600 / 49 (ratio 1.00): at rest in 568 ms |
| `rocker` | **54 × 70** | A bezel 38 × 62, 2 high | A paddle 28 × 50, facets 12 / 4, a lit flag 18 × 9 on its On end (1.0 on, 0.12 off) | Tilts ±17.7° | `spring.rocker` 1,200 / 58 (0.84): at its stop in 160 ms |
| `bat` | 48 × 92 | A nut Ø24 (3 high) and bushing Ø14 (7 high) | A lever 40 long (× the depth scale, at most 1.15), base r 3.4, neck r 2.7, ball r 5.6, on a pivot 5 up | Tilts ±40°: head-on the ball stands 18.9 px from the pivot | `spring.bat` 1,400 / 45 (0.60): 72 ms |
| `wall` | 66 × 92 | A plate **58 × 84** (3 high, radius 6) | A paddle 30 × 54 (7 high, taper 0.6, chamfer 2, crowned 1.6), a lit dot 12 × 4 near its On end | Tilts ±9° | `spring.wall` 1,200 / 58: 160 ms |

- **Boxes.** Each box passes core's containment check: every vertex at least 0.5 px inside, over the whole travel, at
  the reference stage's corners and edge middles, at 0, 50 and 100% depth. The prototype's rocker box, 38 × 62, does
  not: tipped ±17.7° at full depth the paddle's raised corners stand about 29 px high and drift up to 12 px sideways at
  the stage's edges. The box is therefore **54 × 70**, with the bezel still 38 × 62 in its middle. The prototype's wall
  plate filled its 66 × 92 box, leaving no room for its base edge or its shadow, so the plate is **58 × 84**, 4 px
  inside. The closest any vertex comes to its box: slide 2.68, rocker 1.38, bat 1.88, wall 3.09 px.
- **The throw** is the input's native change, once. The snap is visual: `--strata-switch-t`, a registered number (0 off,
  1 on), transitions on the form's spring, clamped at the stops (section 12: the velocity into a stop is dropped, so
  nothing passes it) and sampled every 4 ms into a `linear()` easing (`switchSpringCurve`). Under reduced motion it is
  instant.

### Interaction

| Input | Action |
| --- | --- |
| Click or tap anywhere on the box | Throws it (native) |
| A drag released past the box's centre towards the other stop | Throws it (`attachStrataSwitches`; touch too) |
| A drag released short of centre | Nothing, and no event: the lever springs back |
| Click on the label | Throws it (native) |
| Space | Throws it (native); Enter does not, as on the Strata switch |

A press that moves less than 4 px is a click. A drag keeps the pointer captured, so it may end outside the box; a touch
drag, which makes no click, is thrown by the behaviour itself. The one event the behaviour stops is the click a held
drag ends with (at the document, in the capture phase), so no framework sees a toggle that did not happen. The input is
`touch-action: pan-x` (`pan-y` for a slide), so a drag along the throw never scrolls the page.

### Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Off, on | The moving part at its stop; a paddle's raised half taller than its pressed half | The same, as slabs | The block translated, the paddle tipped with `rotateX`, the lever's projection scaled by `sin θ` |
| Throw | Boxes and heights follow `--strata-switch-t` frame by frame | Same | The spring's `linear()` transition |
| Lit flag or dot | A `flat` face: its captured accent drawn unshaded, full when on, 12% off | Same | The accent; mixed with the metal when off |
| Hover | Moving parts `× state.hoverHeight` | Caps raised by a quarter | `--_lift`, `--_tone` |
| Pressed (`:active`) | `× state.pressHeight` | Sinks | — |
| Focus-visible | The input's outline round the box (captured content); parts take no focus edge | Same | Outline |
| Disabled | Parts flat, the object at 38% | Same | `opacity: 0.38` |

### Relief primitives and the GPU

At Relief and Objects the GPU helper (`gpu/switch-forms.ts`) writes each part from its laid-out box, so it follows the
CSS throw: the slot a `groove`; the block, bezel, plate, nut, bushing, the lever's projected shaft and the paddle's
halves `raised` faces (Relief) or slabs (Objects), each half standing on its bezel or plate; the ball a `knob` face
(Relief) or a dome in the `knob` colour (Objects); the flags `flat`, which the model never lights (Rendering Model
2.3), so the lit accent reads at full strength on a shaded part. **A paddle's tilt reads as height:** its raised half
stands 4 px high and its pressed half 1.5 (2 on the wall plate at Relief), mixed by `t` through the throw, so the shadow
moves to the raised end; the CSS draws the paddle head-on in face mode. **Every part stands only as high as its box
lets its cast shadow reach** (2.8, hovered, under the scene's light): the slide's block and the wall plate, 4 px inside
their boxes, stand 1.24 px high under the default light. Native hits never leave the input.

### Instrument parts

`gpu/instrument-switch.ts` defines each form as an object of parts for core's `instrument` material, bounded by the
input's box and validated by core: the slide's chamfered brushed `carriage`, polished `chamfer`, brushed `cap`, ink
`grip` and lit `segment`; the rocker's polished `bezel`, faceted `paddle` (an extrusion turned onto its length, tilting
about its pivot on the bezel) and lit `segment`; the bat's polished `nut`, `bushing`, `lever` and `ball`; the wall's
`plate` (brushed aluminium on light faceplates, gunmetal on dark), chamfered `paddle`, its `chamfer`, a crowned `cap` and
lit `segment`. Every moving part of a form slides or tilts about one pivot, `mix(from, to, t)`.

The helper's `instrument` level draws each form with it. `t` is the CSS throw itself (`--strata-switch-t`, read each
frame from the root's computed style, transitioned on the form's spring), so CSS, Relief, Objects and Instrument move on
one spring, and the frames of a throw are uniform updates: the native change is captured once, and the frames after it
add no capture, upload or hit-geometry update. The CSS paint and motion of the parts the GPU draws (everything but the
slot, which stays a groove on the face) is hidden and held (`data-strata-dome`), so a throw repaints nothing. The
object takes the input's hover and disabled state; pressing does not sink the parts, and the GPU draws no focus edge
(the input's outline is captured content), as for the Knob and the Fader.
- **The structure never depends on the state**, which would rebuild the layer: both lit flags of a rocker or wall switch
  are always parts (the lit one on its facet or crown, the unlit one sunk 1 px into the solid under it, out of sight, its
  pivot kept), and the slide's flag (a hair inside the block's base at its Off stop, `flagAt` −13) is always there,
  covered by the block while it is off and shown as the block leaves it. The lit flags use the premium `glowOn` amber;
  the CSS and Relief flags use the theme's accent until characters bring `glowOn` into the tokens.
- **Shadows stay in the box.** The parts that stand still or slide (the slide's block, the rocker's bezel, the bat's nut,
  the wall plate) cast their footprint at their mean height (core's own caster) unless that shadow (2.8) would leave the
  input's box, 1 px short of the edge: then the caster is the same footprint at the tallest height that fits (the slide's
  block, 4 px inside its box above and below, casts at under a pixel). The tilting parts (paddles, lever, ball) cast
  none: their shadows fall on the bezel, plate or nut they stand on, whose own cast the face's. The wall plate is
  gunmetal on a dark faceplate.

### Feedback

With feedback on (design language section 20), every throw plays the `snap` sound and a 12 ms pulse. It is off by
default: `createStrataTheme({ feedback: { sound: true } })`, a scope's `feedback`, or the `feedback.sound` and
`feedback.haptics` tokens turn it on, and `attachStrataFeedback({ sound, haptics, muted })` sets the page's options.
The sound is synthesised (no assets), and the audio context is created only on the visitor's first gesture on a control
whose sound is on; pulses answer only the visitor's own input, and stop under reduced motion. The throw, the label and
`aria-checked` always carry the state.

### CSS presentation

From the tokens: brushed metal from `colour.knob` and `colour.edge`, the slot and grip in the edge's ink, polished bezels
and plates as gradients, the paddles tipped with `perspective() rotateX()`, the lever as its head-on projection. Under
`forced-colors` every part is a Canvas shape with a CanvasText edge on a CanvasText-bordered box, the slot, grip and
lever CanvasText, and the moving part and flag Highlight when on, so the state shows by position and by fill; GrayText
when disabled. `prefers-contrast: more` (and the contrast themes) ink the slot and grip in the text colour and edge every
part in it.

### Tests

- **Plain DOM** (`ui-switch-forms.test.mjs`): for each form, six clicks anywhere (centre, corners, the moving part), two
  drags past centre (one ending outside the box), a drag held short of centre (no event), Space, Enter (no change) and
  the label, one `input` and one `change` per throw; 121 hits over each box, 0 misses; `t` in between during the throw;
  a disabled one stays. Touch at 390 px: taps and touch drags throw it, a held one does not, the page does not scroll.
  At 320 and 390 px: no overflow, boxes of at least 28 px, labels whole.
- **Preferences:** axe in light, dark and face mode and under forced colours (every part drawn, Highlight when on),
  more contrast, reduced motion (instant).
- **Instrument** (`ui-switch-forms-instrument.test.mjs`, DPR 1 and 2, headless and headful): the scene is version 4 with
  the documented parts per form and the same parts off and on; at t = 0, 0.5 and 1 at depth 0, 0.5 and 1, and in flight,
  every pixel the objects draw (against them hidden) lies inside an input's box and native hits on those pixels find an
  input; a control run without the casters' caps puts 1,240 shadow pixels outside the boxes at full depth (0 with them); real clicks and
  drags give fresh pixels inside the boxes only; the frames of a throw add 0 captures and 0 hit-geometry updates and
  nothing is stepped down; hover and disabled reach the parts and pressing does not; reduced motion snaps at once; touch
  at 390 and 320 px throws every form; the accessibility snapshot equals the DOM's and axe passes.
- **GPU** at Relief and Objects: the documented primitives; 0 hit mismatches on every form at DPR 1 and 2; fresh pixels
  after each throw, only in the boxes; 0 px outside the boxes at nine poses along the throw and in flight; the
  accessibility snapshot equal in DOM and GPU modes; axe on the GPU page.
- **Bindings and Astro** (`ui-switch-forms-bindings`, `ui-switch-forms-astro`): the Forms example rendered exactly;
  controlled, uncontrolled, refs, attributes, Field, disabled, and `form` as the native form owner; without JavaScript
  the Astro forms are native switches that submit.
- **Feedback** (`ui-switch-forms-feedback`): off by default (no `AudioContext`); on, created only after a gesture on a
  form; pulses only for the visitor's own throws and not under reduced motion; muted silent; a scope's token alone.
- **Unit** (`strata-switch-forms.unit.test.mjs`): the springs and their CSS easing, the drag rule, the shadow fit, the
  Instrument parts with core's validator and containment check, the synthesised sounds and the feedback tokens.
