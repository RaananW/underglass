# JogWheel

Instrument, wave 3 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Steps through a long range by turning an endless wheel, as on a tape deck, an editing console or a DJ deck: frames, a
timeline, a menu with no end. Renders a native `<input type="range">` that covers a large flat wheel, following the
WAI-ARIA [Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/). The native element has the role, the value,
the keys and form participation; Strata adds `aria-valuetext` for units, the round pointer behaviour (section 8) and the
**wrap**: with `wrap` (the default) the value goes round, from `max` to `min` and back, as the wheel does.

The wheel's **position is not the value**. The finger dimple's place is an accumulated angle, `--strata-jog-angle`
(degrees, clockwise, 0 at the top): each step of the value adds `360 / turn` degrees to it, in the direction it was
taken, and the angle never turns back when the value wraps. A value change by a script (a reset, a jump) turns the wheel
the shorter way round. An unbounded `aria-valuenow` mode is not part of the component: the value is always in `min` …
`max`.

A knob that stops at both ends is a [Knob](knob.md); a straight range is a [Slider](slider.md) or a [Fader](fader.md).

## 2. Object

A **flat machined wheel in a bearing recess** on the faceplate, with a finger dimple on its face. The legend is printed
under it, on the face, never on the wheel.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Dial (the native box) | Square, the wheel + 32 (128 at medium) | 0 | No |
| Recess | A well Ø wheel + 8 in the face, printed (`--strata-colour-track`) | `elevation.well` below the face | No |
| Wheel | Circle of `size.jogWheel` (64, 96 or 128 px) | Relief and Objects: 5 (fitted, below); Instrument: 8 | No |
| Dimple | Circle Ø 0.2 of the wheel (to the even px: 12, 20, 26), 0.34 of the wheel's diameter from its centre | A well 1.2 deep (Relief and Objects), a dish at the top (Instrument) | Turns about the wheel's centre with `--strata-jog-angle` |

- **Only the dimple turns.** The wheel is a solid of revolution: it keeps its box at every angle, and the dimple stays
  inside it (its farthest point is 0.44 of the wheel's diameter from the centre). Every part, its cast shadow included,
  lies inside the dial, the input's box, at every angle ("trivially contained": the footprint of a turning disc is
  its circle).
- **A turn adds no capture of its own.** At every GPU level the dimple is drawn by the GPU (a primitive or a part), and its CSS paint
  is hidden (`data-strata-dome`). While a wheel the GPU draws turns (a drag, coasting) the behaviour writes nothing to the DOM: the
  accumulated angle is kept in script (`liveStrataJog`) and wakes the helper with a bubbling `strata-jog-live` event (an event is no
  mutation), the value text (`aria-valuetext`) waits for the wheel to rest, and the input's thumb is not drawn (a thumb that moves with
  the value is paint); a custom property or an attribute written inside a layer recaptures it, as measured. The only captures left are
  core's own, one queued for each native `input` event (as for every native change, a Knob's included): a flick of 49 steps over 300
  frames costs 37 captures, none in a turning frame between the events, and no hit-geometry update. At rest the angle
  (`--strata-jog-angle`) and the value text are written once. In the CSS presentation the dimple turns by
  `rotate: calc(var(--strata-jog-angle) * 1deg)`, with its inner light turned back by the same angle so the dish stays lit from the
  light's side. At Relief and Objects the helper places the dimple from the angle (on the knob's spring), not from the layout.
- **At the Relief and Objects levels** the recess is a well (Relief) or a sunk disc (Objects), the wheel a raised disc or a
  round slab standing on the recess's floor, and the dimple a well on it ([`gpu/jog-forms.ts`](../../../packages/ui/src/gpu/jog-forms.ts)).
  Each stands only as high as its box lets its shadow reach (2.8), hovered: at medium, 5 fits the 16 px of room (2.42 · 5 + 1 = 13.1).
- **At the Instrument level** (`data-strata-level="instrument"`) the recess stays a well on the face and the wheel is the
  [Instrument object table](../design-language.md#instrument-object-table)'s JogWheel, built by
  [`gpu/instrument-jog.ts`](../../../packages/ui/src/gpu/instrument-jog.ts) from the laid-out wheel:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `collar` | Lathe ring on the face, 0.4 outside the wheel, 3 wide, 1.6 high, a 0.5 edge break on its outer top edge and a wall down to the face on its inner side | `knobSkirt`: polished (250, 250, 251), roughness 0.04 | None |
  | `cap` | Lathe: Ø of the wheel, 8 high, a 2 px 45° chamfer, a flat top | `knobCap`: brushed (239, 240, 241), roughness 0.3, circular brush 0.9 with the hairline grain 0.15 | None (a solid of revolution) |
  | `chamfer` | Lathe: the cap's chamfer, a hair outside it | `knobChamfer`: the cap's metal polished, roughness 0.06 | None |
  | `grip` | The finger dimple: a dish Ø 0.2 of the wheel, flat, a 0.5 lip at its rim and the normals of a bowl 2.4 deep (it shades as a concave dish), standing on the cap's top | `jogDimple`: graphite satin metal (58, 61, 68), metallic 0.85, roughness 0.3 | `turn` from 0° to 360° about the wheel's centre (`pivot`) |

  The object's `bounds` is the input's box and `t` the angle's place in a turn, the angle modulo 360° over 360, so the
  dimple's pose runs one full turn and the wrap from `t = 1` to `t = 0` is the same pose: the wheel never snaps back. The
  accumulated angle itself follows the value's angle on the knob's spring (`spring.knob` 420 / 41; detented, `spring.detent`
  900 / 42), unclamped, in fixed 4 ms steps, instant under reduced motion. A value change is the native change core
  captures once; the turning frames after it are uniform updates with no capture. The wheel's CSS paint (its edge) and the
  dimple's are hidden while the parts draw them. If an object could not stay in its box, core draws its Relief primitive (a
  raised circle the size of the wheel) and reports it.
- **Containment is checked on core's own validator** over the whole turn, in every corner of the 1920 × 1080 reference stage at
  depth scales 0.6, 1 and 1.6: the closest vertex is 11.0 px inside the box at 160 % depth, and 12.1 at 100 %.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Recess | `track` (printed) | — | `field` |
| Wheel | `knob` metal; `edge` ring | — | `knob` (`satin`); brushed at Instrument |
| Dimple | The wheel's metal, darkened by the `edge` colour (CSS); graphite at Instrument | — | `field` (a well) |
| Legend | None (sits on the panel) | `text` | None |

`data-strata-material` on the wheel overrides its material. A hardware wheel has no state of its own besides its place, so
nothing is shown twice: the value is the input's, named by the legend and spoken by `aria-valuetext`.

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | A raised disc in a recess | A slab on the recess's floor | The cap in its collar | The wheel's gradient |
| Hover | The wheel's height `× state.hoverHeight` | The wheel rises by a quarter | No pose change: hardware does not rise under a finger | `--_lift`, `--_tone` on the wheel |
| Dragging, coasting | The dimple turns | Same | Same | `--strata-jog-angle` changes |
| Pressed | As hover (a wheel does not sink) | As hover | As hover | As hover |
| Focus-visible | An accent ring round the recess, captured | Same | Same | `outline: focus.width solid accent` |
| Disabled | Parts flat, the dial at 38% | Same | Same | `opacity: 0.38` |

A detented wheel (`detents`) settles its dimple on each step with a little overshoot (`motion.fast`, an overshoot curve) in
CSS, and on the detent spring on the GPU. Under `prefers-reduced-motion` there is no overshoot, no spring and no coasting: the
dimple stands at the value's step at once and a released wheel stops where it was let go. Under `prefers-contrast: more` the wheel,
the recess and the dimple are edged in the text colour; under `forced-colors` the wheel and the recess are `Canvas` with a
`CanvasText` edge and the dimple a `CanvasText` disc.

## 5. Relief primitives

- The recess is a `well` face (`data-strata-face="well"`, a circle); at Objects a sunk disc.
- The wheel is a `raised` face (a circle); at Objects a round slab. The turning wrapper, `.ug-jog-wheel__turn`, has no face.
- The dimple is a `well` face that the helper draws from its laid-out box (the CSS turn moves it, a transition on a detented
  wheel included), so it turns by scene updates only; its CSS paint is hidden while it does.
- At the Instrument level the recess is the only primitive: the wheel, the dimple and the collar are the object's.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.jogWheel` (64, 96, 128, `--strata-jog-wheel-size`) | `size` |
| `jog.turn` (24), `jog.dragPx` (240), `jog.fine` (0.1), `jog.tapSlop` (4), `jog.flick` (180), `jog.maxRate` (240) | `turn` |
| `spring.jog` (stiffness 40, damping 3.2), `spring.knob`, `spring.detent` | — |
| `colour.knob`, `colour.track`, `colour.edge`, `colour.text`, `colour.accent` (focus) | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob` | `material` |
| `motion.fast`, `font.size.small`, `space.1`, `focus.width`, `focus.offset`, `feedback.tick.*` | — |
| `level` | `level` |

The `jog.*` and `spring.jog` values are the premium character's (provisional until the look sign-off). Props: `label`,
`value` / `defaultValue` / `onValueChange` (or `v-model`), `min` (0), `max` (99), `step` (1), `turn` (steps in one turn; 24),
`detents` (soft detents, with `tick` feedback), `wrap` (default true), `drag` (`circular`, the default, or `vertical`), `unit`
(appended to the value for `aria-valuetext`), `format` (instead of `unit`; React and Vue only), `resetValue`, `id`, `name`, `form`,
`disabled`, `size`, `material`, `level`; in React the ref reaches the root and `inputRef` the native input (Vue exposes `root` and
`input`). Inside a [Field](field.md) the wheel takes the Field's id, description and disabled state.

## 7. DOM structure and overlay needs

```html
<div class="ug-jog-wheel" style="--strata-jog-angle: 180; --strata-jog-turn: 24;">
  <div class="ug-jog-wheel__dial">
    <span class="ug-jog-wheel__well" data-strata-face="well" aria-hidden="true"></span>
    <span class="ug-jog-wheel__wheel" data-strata-face="raised" aria-hidden="true"><span class="ug-jog-wheel__turn"><span class="ug-jog-wheel__dimple" data-strata-face="well"></span></span></span>
    <input class="ug-jog-wheel__input" type="range" id="shuttle" name="shuttle" min="0" max="99" step="1" value="12" data-strata-default="12" data-strata-wrap="true" data-strata-unit=" fr" aria-valuetext="12 fr">
  </div>
  <label class="ug-jog-wheel__label" for="shuttle">Shuttle</label>
</div>
```

A detented wheel that is dragged vertically and does not wrap:

```html
<div class="ug-jog-wheel ug-jog-wheel--detented" data-strata-size="small" data-strata-drag="vertical" style="--strata-jog-angle: 360; --strata-jog-turn: 12;">
  <div class="ug-jog-wheel__dial">
    <span class="ug-jog-wheel__well" data-strata-face="well" aria-hidden="true"></span>
    <span class="ug-jog-wheel__wheel" data-strata-face="raised" aria-hidden="true"><span class="ug-jog-wheel__turn"><span class="ug-jog-wheel__dimple" data-strata-face="well"></span></span></span>
    <input class="ug-jog-wheel__input" type="range" id="tune" min="-12" max="12" step="1" value="0" data-strata-default="0" data-strata-unit=" st" aria-valuetext="0 st">
  </div>
  <label class="ug-jog-wheel__label" for="tune">Tune</label>
</div>
```

- The root is the boundary: `class`, `style`, `data-strata-size`, `data-strata-drag` and refs reach it. The dial is the input's
  box; the parts are `aria-hidden` and `pointer-events: none`, so every press lands on the input, which is transparent, has no face
  and sets `touch-action: none` (a touch would otherwise drive a native range by its x).
- `--strata-jog-angle` is the wheel's accumulated angle in degrees and `--strata-jog-turn` its steps in a turn; the markup gives them
  from the initial value (the value's index times `360 / turn`, the angle's origin being `min`). After that `attachStrataJogWheels`
  keeps the angle (React and Vue leave the style alone, since it is not a function of the value). `data-strata-wrap` (`"true"`) makes
  the value go round; `data-strata-drag="vertical"` swaps the circular drag for a vertical one; `data-strata-default` is the value a
  double-click returns to; `data-strata-unit` makes the behaviour keep `aria-valuetext` in step in the browser.
- No overlay.

## 8. Keyboard and screen reader

| Input | Behaviour |
| --- | --- |
| Arrow keys, Page Up and Down, Home, End | The native range input's. At an end of a `wrap` wheel the key that would go past it goes round instead: ArrowUp, ArrowRight (ArrowLeft in a right-to-left page) and PageUp past `max` to `min`; ArrowDown, ArrowLeft and PageDown past `min` to `max` |
| Drag (circular) | The pointer's angle about the wheel's centre turns the wheel by the same angle (a tenth of it with Shift); the value steps as the angle passes each step |
| Drag (`vertical`) | A turn per `jog.dragPx` (240 px), up clockwise, a tenth with Shift |
| Tap (a press that moves less than `jog.tapSlop`) | The upper half of the box steps up one step, the lower half down one: **the single-pointer alternative** (WCAG 2.5.7), so no drag is ever required |
| Wheel (mouse) | One step a notch; the page does not scroll over the wheel; Ctrl+wheel (zoom) is left to the browser |
| Double-click | Returns to `data-strata-default` |
| Release after a fast drag | The wheel keeps turning: inertia, below |

- **Inertia.** A drag released at more than `jog.flick` (180) degrees a second, measured over the last 100 ms, keeps turning on
  `spring.jog`: friction (`damping` 3.2) slows it, and with detents a soft pull (`stiffness` 40) to the nearest detent settles it
  on one. A continuous flick of 720°/s runs 2 to 3 s and turns about 220°. **The rule for the steps it applies:** the value only
  ever changes by one native `step` per `input` event, each event as the angle passes a step (a gesture that passes several steps
  at once dispatches one event for each, and more than 16 in one move is a single jump); a coasting wheel applies at most
  `jog.maxRate` (240) steps a second, the release speed being held to `jog.maxRate · 360 / turn` degrees a second, so a page that can
  take one event a frame (60 a second) is never given more than 4 steps in a frame. `change` fires once, when the wheel comes to
  rest. A key, a press, the wheel or a double-click stops it at once.
- **Under `prefers-reduced-motion`** a released wheel stops where it was let go, with no coasting and no spring; the value has
  already stepped as the angle passed each step.
- The role is `slider`, named by the legend, with the value, `min`, `max` and `aria-valuetext` (`"12 fr"`, a true minus sign
  for negatives, or `format`'s). Name the wheel by what it moves ("Shuttle"), never by its direction. Help and error through
  `aria-describedby` ([Field](field.md) without `label`). `wrap` is announced by the value itself: after the last value the
  reader says the first.
- **Target size** (2.5.8): the dial is at least 96 px square (at small), far over 24.
- **Feedback** ([design language section 20](../design-language.md#20-feedback)): a detented wheel plays `tick` once for each change
  of its value (a step; a jump across several steps is one change, one tick) where feedback is on; a wheel without detents never ticks.
  A pulse (5 ms) answers only the visitor's own input and stops under reduced motion. Both are off by default.
- **Screen readers:** the manual script for a wrapping encoder is VAL-002's, in [open issues](../../open-issues.md), until performed.

## 9. CSS presentation

A recess (a darker disc), a wheel in the knob's metal with circular hairlines and a bow-tie highlight along the light's azimuth,
and a dimple that is a small well in it. The legend is uppercase with a letter space and wraps (`overflow-wrap: anywhere`); the
wheel never exceeds its container (`max-width: 100%` on the root), so a 320 px viewport and 200% text reflow (the dial is 96 to 160 px).

- **`forced-colors: active`:** `Canvas` wheel and recess edged in `CanvasText`, a `CanvasText` dimple, a `Highlight` focus ring, `GrayText`
  when disabled.
- **`prefers-contrast: more`:** the wheel, the recess and the dimple are edged in the text colour.
- **`prefers-reduced-motion: reduce`:** no overshoot transition.
- Face mode (`data-strata-mode="face"`, GPU on): the dimple's CSS paint is hidden at every level, and the wheel's edge at the
  Instrument level; the recess, the printed legend and the focus ring stay.

## 10. Tests

- **Plain DOM** (`ui-jog-wheel.test.mjs`, real input): a circular drag turns the wheel by the pointer's angle and steps the value
  with it, through the wrap in both directions with the angle never turning back; the vertical drag; Shift's fine rate; taps on the
  upper and lower half; the wheel without scrolling the page; native keys and the wrap at both ends; the double-click reset;
  `aria-valuetext` with units; a flick coasts and stops, with one `input` per step, one native step each, at most `jog.maxRate` a
  second, and one `change`; a drag released slowly or under reduced motion does not coast; detents settle; `input` and `change`
  fire; touch drags and taps at 390 and 320 px; no horizontal overflow, targets, 200% text.
- **Preferences:** axe in light, dark, face mode, forced colours and more contrast.
- **GPU** (DPR 1 and 2, Relief, Objects and Instrument): GPU stays on; the scene is the documented one (a version 4 `instrument`
  scene with a `collar`, `cap`, `chamfer` and `grip` per wheel); the parts draw inside the dials only (0 px outside) through a whole
  turn, native hits on those pixels find the input and a grid over every dial has 0 mismatches; a turn changes pixels inside the dial
  only; 300 frames of a flick add no hit-geometry update and no capture beyond core's one for each `input` event (none in the turning
  frames between them), with the dimple moving on most frames and the native value stepping with the angle; reduced motion has no inertia and puts the
  dimple at its step at once; the accessibility snapshot is the same in DOM and GPU modes and axe passes on the GPU page.
- **Feedback** (`ui-jog-wheel.test.mjs`): off by default; a detented wheel ticks once per step crossed, a wheel without detents never.
- **Bindings and Astro** (`ui-jog-wheel-bindings.test.mjs`, `ui-jog-wheel-astro.test.mjs`): the two examples above rendered exactly;
  controlled, uncontrolled, refs, attributes, Field, `format`; the angle survives a re-render; without JavaScript the Astro wheel is a
  native range that submits.
- **Unit** (`strata-jog-patch.unit.test.mjs`): the step, wrap and angle maths (the angle only grows past a wrap), the pointer's
  angle, the inertia (stops, settles on a detent, held to `jog.maxRate`), the model, the tokens and the CSS, the Relief and Objects
  entries, the springs, and the Instrument parts validated by core's `validateInstrumentScene` and contained over the whole reference
  stage at every size and depth (`checkContainment`), with the dimple on its circle over the whole turn.
