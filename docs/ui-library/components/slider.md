# Slider

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Picks one number from a range. Renders a native `<input type="range">`, following the WAI-ARIA
[Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/). The native element already has the
role, the value, the keys and form participation, so Strata adds no ARIA and no script.

One thumb only. A range with two thumbs has no native element and is not Tier A. The slider is horizontal.
Sizes follow the density's control height (section 13), never a separate size scale.

## 2. Object

A **rail with a puck**: a thin metal groove cut into the panel, and a round puck that sits in it.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Rail | `groove`, 6 px thick (fixed rule), centred in the box, pill ends | Sunk by `elevation.well` (2) | No |
| Puck | `knob`: disc of `target.min` (24) diameter, `object.taper` inset at the top | `elevation.raised` (3) | Along the rail with the value; rises on hover, sinks while dragged |

The puck centre runs from half a puck width to half a puck width short of the other end, as the native
thumb does. The whole travel stays inside the `<input>` box.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Rail | `track` | — | `rail` (`metal`) |
| Puck | `knob` | — | `knob` (`satin`) |
| Puck shadow | Cast onto the rail | — | — |
| Rail and puck outline | `edge`, 1 px | — | None |

The rail and the puck carry `edge` outlines, so both keep 3:1 against what is around them (non-text
contrast, section 8). The slider has no text and no filled part. `data-strata-material` overrides the rail's material for one
slider. The puck keeps the `knob` role.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Puck at `elevation.raised` (3); rail at `elevation.well` | Puck at `elevation.raised` | Relief recipe: well on the rail, raised thumb |
| Hover | Puck `raised × state.hoverHeight`; interior `+state.hoverLift` | Puck rises by `elevation.raised × (state.hoverHeight − 1)` | Larger thumb shadow, `brightness(1.04)` |
| Pressed (`:active`, dragging) | Puck `raised × state.pressHeight`; interior `−state.pressSink` | Puck sinks to the same height | Smaller thumb shadow, `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, around the control box | Emissive glow on the puck | `outline: focus.width solid accent` |
| Disabled | Height 0, no bevel gain, content at 38% | Puck flattened to the rail | Flat, content `opacity: 0.38` |

Selected, invalid and busy do not apply. A required or invalid value is shown by the [Field](field.md)
around the slider, not by the slider.

## 5. Relief primitives

- One `groove` primitive: the rail, from the `<input>` border box with the rail thickness and `radius.pill`.
- One `knob` primitive: the puck. The thumb has no DOM element, so the integration derives its centre from
  `value`, `min`, `max` and the box width. This is a uniform update, not a recapture.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.knob`, `colour.edge`, `colour.accent` (focus) | — |
| `radius.pill` | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `object.taper` | — |
| `material.roles.rail`, `material.roles.knob` | `material` |
| `density` (control height), `target.min` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.standard` | — |
| `level` | `level` |

Native props pass through: `min`, `max`, `step`, `value`, `disabled`, `name`, `form`.

## 7. DOM structure and overlay needs

```html
<input type="range" class="ug-slider" data-strata-face="groove"
       min="0" max="100" step="1" value="40" aria-label="Volume">
```

- The `<input>` is the boundary element: React and Vue refs, `class` and `style` reach it.
- The name comes from a `<label for>` (usually a [Field](field.md)) or from `aria-label`.
- `aria-valuetext` is set only when the number alone is unclear ("40 percent", "Tuesday").
- A visible value is a separate `<output>` in the Field, not part of the slider.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Right, Up | Increase by `step` (native) |
| Left, Down | Decrease by `step` (native) |
| PageUp, PageDown | Larger step, as the browser defines it (native) |
| Home, End | Minimum, maximum (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `slider` (native), with the value, minimum and maximum from the attributes.
- `disabled` uses the native attribute, which removes the slider from the tab order.
- Pointer and touch drag are native. Strata adds no handler that changes the value.

## 9. CSS presentation

The relief recipe: a well on the rail (inverted bevel, inner shadow) and a raised round thumb with a cast
shadow, styled through `::-webkit-slider-runnable-track`, `::-webkit-slider-thumb` and the `::-moz-range-*`
pseudo-elements, with `appearance: none`. In GPU mode the CSS paints flat faces only (section 16) and the GPU
draws rail and puck. Minimum size: the density's control height, and never below `target.min` (24) in either
dimension. Under `forced-colors`: the rail is a `ButtonBorder` outline on `Canvas`, the thumb is `ButtonFace`
with a `ButtonText` outline, and focus uses `Highlight`; no shadows.

## 10. Tests

- **Plain DOM:** arrow, Page, Home and End keys change `value` by the native amounts; pointer drag sets the
  value; `input` and `change` fire as natively; disabled ignores keys and drag.
- **GPU:** at Relief and Objects, GPU stays active while dragging and on keyboard changes; the puck moves
  with the value and pixels are fresh on each change; a hit on the puck and on the rail reaches the
  `<input>`; layout and DPR changes keep GPU on.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU modes
  (role, name, value, min, max); focus edge visible in decoded pixels; puck against rail at least 3:1.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, pressed, and at minimum, middle and
  maximum value.

## 11. Hardware forms: `knob`, `fader` and `wheel`

The same native slider drawn as the Knob's or the Fader's object ([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level),
[design language section 6](../design-language.md#instrument-object-table)): `form` (prop) or `data-strata-form` (on the drawn root) chooses
`knob`, `fader` or `wheel`. Without it, or with `flush`, the Slider is the rail and puck above, in the markup and the look it had before, at every
level; the premium character's default form, `fader`, is reached by naming it (as the Switch's `slide` is), so a page that does not opt in is
unchanged. Sections 1, 6 and 8 hold: the native `<input type="range">` is the control, with its `name`, `min`, `max`, `step`, `value`, `id`,
Field wiring and every native key and event, and the accessibility snapshot is the same with and without the form. `wheel` is a thumbwheel: a ridged
roller rolling in a slot (below).

```html
<div class="ug-knob" data-strata-form="knob" style="--strata-knob-value: 0.4;">
  <div class="ug-knob__dial">
    <span class="ug-knob__scale" aria-hidden="true">
      <span class="ug-knob__mark" data-strata-value="0" style="--strata-knob-at: 0;">0</span>
      <span class="ug-knob__mark" data-strata-value="50" style="--strata-knob-at: 0.5;">50</span>
      <span class="ug-knob__mark" data-strata-value="100" style="--strata-knob-at: 1;">100</span>
    </span>
    <span class="ug-knob__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-knob__cap" data-strata-face="raised"><span class="ug-knob__pointer"></span></span></span>
    <input class="ug-knob__input" type="range" id="drive-example" name="drive" min="0" max="100" step="1" value="40"
           data-strata-default="40" aria-label="Drive">
  </div>
</div>
```

```html
<div class="ug-fader ug-fader--horizontal ug-fader--detented" data-strata-form="fader" style="--strata-fader-value: 0.5;">
  <div class="ug-fader__track">
    <span class="ug-fader__scale" aria-hidden="true">
      <span class="ug-fader__mark" data-strata-value="-12" style="--strata-fader-at: 0;">−12</span>
      <span class="ug-fader__mark" data-strata-value="0" style="--strata-fader-at: 0.5;">0</span>
      <span class="ug-fader__mark" data-strata-value="12" style="--strata-fader-at: 1;">12</span>
    </span>
    <span class="ug-fader__slot" data-strata-face="groove" aria-hidden="true"></span>
    <span class="ug-fader__carriage" data-strata-face="raised" aria-hidden="true"><span class="ug-fader__grip"></span></span>
    <input class="ug-fader__input" type="range" id="trim-example" name="trim" min="-12" max="12" step="6" value="0"
           data-strata-default="0" data-strata-unit=" dB" aria-valuetext="0 dB" aria-label="Trim">
  </div>
</div>
```

- **The form is the Knob's and the Fader's.** The markup is [`Knob`](knob.md)'s and [`Fader`](fader.md)'s, with the Slider's own input as their
  input and no printed legend (the Field's label, or `aria-label`, names it). So the CSS, the behaviour (`attachStrataKnobs`,
  `attachStrataFaders`: the knob's vertical drag, ring click-to-set, cap taps, wheel and double-click reset; the fader's thumb drag, track
  click and snap to a printed mark, wheel and reset) and the GPU helper at Relief, Objects and Instrument are theirs, unchanged: a Slider knob
  is the Knob's skirt, cap and pointer on `spring.knob`, a Slider fader is the Fader's carriage on `spring.fader`, and the value's change is a
  uniform update (no capture of its own, no hit-geometry update). A Slider fader is horizontal; for a vertical fader use the [Fader](fader.md).
  **`fader` presents the Fader's object over the Slider's native range input** (it is not deferred).
- **Props.** `form`, and for a form `marks` (a count, or the values with labels; five by default, as the Knob's and Fader's, three for a wheel), `detents`, `sweep`
  (a knob's turn, or a wheel's roll), `travel` (a fader's, or a wheel's drag), `unit` (and `format` in React and Vue) for `aria-valuetext`, and `resetValue` (the double-click's value; the
  initial value by default). `class` and `style` reach the drawn root and every other attribute the input. `size`, `material` and `level` go on the
  root. React and Vue are controlled with `value` and `onChange` (`v-model`), or uncontrolled with `defaultValue`; Astro takes `value`.
- **`form` is also the native attribute** (the id of the input's form owner). `knob`, `fader`, `wheel` and `flush` are the form names and never an
  owner; any other string is the form owner, as before, on the flush slider's input. A drawn form has no owner prop: put the input in its `<form>`.
- **Boxes.** A knob's box is the Knob's (the dial plus its printed scale); a fader's is its travel plus the carriage and a 16 px margin each end
  (`size.fader`, 180 + 74 at medium), shrinking to its container, and 46 + 1.5em + 12 px across. Both stay at least 24 px each way.
```html
<div class="ug-fader ug-fader--horizontal ug-fader--wheel" data-strata-form="wheel" style="--strata-fader-value: 0.4;">
  <div class="ug-fader__track">
    <span class="ug-fader__scale" aria-hidden="true">
      <span class="ug-fader__mark" data-strata-value="0" style="--strata-fader-at: 0;">0</span>
      <span class="ug-fader__mark" data-strata-value="50" style="--strata-fader-at: 0.5;">50</span>
      <span class="ug-fader__mark" data-strata-value="100" style="--strata-fader-at: 1;">100</span>
    </span>
    <span class="ug-fader__slot" data-strata-face="groove" aria-hidden="true"></span>
    <span class="ug-fader__carriage ug-fader__wheel" data-strata-face="raised" aria-hidden="true"><span class="ug-fader__ridges"></span></span>
    <input class="ug-fader__input" type="range" id="gain-example" name="gain" min="0" max="100" step="1" value="40"
           data-strata-default="40" aria-label="Gain">
  </div>
</div>
```

- **`wheel`: the thumbwheel.** The Fader's track and behaviour (the thumb drag along the slot, click-to-set on the slot and on the printed marks, the wheel
  over it, the double-click reset and every native key are `attachStrataFaders`'s, unchanged: a tap on the roller sets the value like a tap on the slot) with a
  ridged **roller** in place of the carriage. The roller does not slide: it stays at the middle of the slot and **rolls under the value**, its ridges
  moving past, one index ridge in ink marking where the turn is. It is horizontal (a roller with its axis across the travel); the slot is shorter than a
  fader's (0.4 of `size.fader`, 72 px at medium, or `travel`), so the whole form is 72 + 48 px across the travel and 46 + 1.5em + 12 px across it, and the
  `hits` of the native input cover all of it. `wheel.sweep` (150°, at most 180°) is the roller's roll from the minimum to the maximum and `wheel.ridges`
  (12) the ridges round it; the angle is the value's fraction times the sweep, from −sweep/2 to +sweep/2.
- **Decided: the ridges are the part's geometry, not a print.** A roller that rolls needs ridges that move. A captured print of them would be a capture a
  frame while the value turns, and a brushed finish is the same on every turn; so at the Instrument level the ridges are an `extrude` of a ridged
  circle (valley and peak per ridge, flat facets that catch the light one after the other) turned about its own axis by a pose (`tilt` about the y axis, pivot
  on the axis, from −sweep/2 to +sweep/2: a pose never passes 90° either side, so the token's maximum is 180°). The roller is **polished metal**
  (`knobSkirt`, the knob's polished skirt metal: a brush would hide the facets), the index tooth a hair proud of a roller tooth in ink (`knobInk`, the knob's
  pointer), both materials a knob or a rotary selector on the page already has, so a wheel beside them adds no material to the scene's 16. The axis stands one radius (`8 × depth scale`) above the face, so the
  roller lies **on** the face and no vertex is below it: a roller sunk through the slot would draw its lower half over the face, since the parts have a
  target of their own. Rolling about the axis keeps every vertex on its circle, so containment holds over the whole turn by construction (core's
  `checkContainment` in the unit test, at five values, every depth and the stage's corners, closest vertex 2.4 px inside the box). **Rubber** is not a
  separate form: a character that gives `knobSkirt` a rubber recipe (which a knob's skirt then takes too) makes the roller rubber.
- **Presentations.** CSS: the roller is a raised, round-cornered face, its ridges a printed pattern (`repeating-linear-gradient`) shifted by the value
  (radius times the angle: the surface moving) and its index ridge a printed bar. Relief and Objects: the slot a groove, the roller a raised face or a slab
  (its print is captured, so a change of value is a capture of the box, as the Fader's carriage never was). Instrument: the two parts above, the print
  hidden (`data-strata-dome`), the roll a pose on `t` (`spring.fader`): **a turn is a uniform update, with no capture and no hit-geometry update**. The
  roller's shadow is the footprint at a height capped so it stays in the box (3.3 px: the box has 10 px across the track). Reduced motion: no spring, the roller
  moves at once. Forced colours: a Canvas roller with CanvasText ridges and index. More contrast: the index and the slot take the text colour.

**Tests.** `ui-structural-forms.test.mjs` (plain DOM, touch at 390 and 320 px, preferences, GPU at Relief, Objects and Instrument at DPR 1 and 2),
`ui-structural-forms-bindings.test.mjs` (React and Vue), `ui-structural-forms-astro.test.mjs`; the wheel in `ui-deferred-forms.test.mjs`,
`ui-deferred-forms-bindings.test.mjs` and `ui-deferred-forms-astro.test.mjs`, and `strata-deferred-forms.unit.test.mjs` (the roller's parts, validated and contained).
