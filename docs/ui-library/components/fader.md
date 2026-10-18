# Fader

Instrument, wave 1 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Picks one number from a range by sliding, as on mixing desks and control hardware: a channel's level, a send, a
crossfade. Renders a native `<input type="range">`, vertical by default (`writing-mode: vertical-lr`,
`direction: rtl`, `aria-orientation="vertical"`), following the WAI-ARIA
[Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/). The native element has the role, the value, the
orientation, the keys, the drag and form participation; Strata adds `aria-valuetext` for units and the behaviour in
section 8.

`orientation="horizontal"` lays it along the page (minimum at the left). `detents` makes it stepped: that many
positions, and the native `step` is the range over `detents − 1`. The Fader is the [Slider](slider.md)'s physical
sibling: the same native element, attributes and keys, drawn as hardware.

## 2. Object

A **slot in the faceplate with a capped carriage**, and the scale printed beside the slot. Labels are printed on the
face, never on the carriage (design language principle 2).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Track (the native box) | 46 across for the slot band plus the scale; along the travel, the travel plus the thumb (74): 90 × 254 at medium | 0 | No |
| Slot | A dark cut 5 wide, from 3 px before the carriage centre's first stop to 3 px past its last, in the band's middle | Relief: `elevation.well` (a groove) | No |
| Scale | A tick (7 long, 1.2 thick) and a numeral at the carriage centre's place for each mark, beside the band on the side its shadow falls (right of a vertical fader, below a horizontal one) | 0 | No |
| Carriage | 30 across, 42 along, radius 3, a 1 px `edge` border | Relief and Objects: `elevation.raised` (3) | Slides `size.fader` (180 at medium) with the value |
| Grip | An index line 1.6 wide across the carriage, 6 px in from each side | On the carriage | With the carriage |

- **The thumb is the carriage.** The native thumb is transparent, as wide as the track and as long as the carriage plus
  a 16 px margin at each end (74), and the track is the travel plus the thumb, so the thumb's centre and the
  carriage's are the same point at every value ([I0.2](../instrument-phase0.md#i02-moving-parts-and-hits)): a press
  on the drawn carriage is a press on the native thumb, and the value follows the pointer one to one.
- **Why the margin is 16, not 8.** The box rule's margin for the carriage's own drift is 8 (band 46 for a carriage 30
  across). Along the travel the box also holds the carriage's shadow on the face at the Instrument level, which
  reaches 15.5 px down at 50% depth under the default light, and the scale sits on the side the shadow falls, so it
  holds it across (`faderShadowReach` in [`gpu/instrument-fader.ts`](../../../packages/ui/src/gpu/instrument-fader.ts)).
  At Relief and Objects the carriage's shadow reaches 7 px.
- **At the Instrument level** the fader is the [Instrument object table](../design-language.md#instrument-object-table)'s
  Fader, defined by `faderObject` in [`gpu/instrument-fader.ts`](../../../packages/ui/src/gpu/instrument-fader.ts)
  from the laid-out slot, bounded by the input's box:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `carriage` | Prism 30 × 42 (across × along), 12 high, radius 3, taper 0.6, a 2 px chamfer | `faderCap`: brushed (239, 240, 241), roughness 0.3, a linear brush 0.9 with the hairline grain 0.15 | `slide` half the travel each way from its middle |
  | `chamfer` | The carriage's chamfer band, a hair outside it | `faderChamfer`: the cap's metal polished, roughness 0.06 | As the carriage |
  | `cap` | The carriage's top inside the chamfer, brushed | `faderCap` | As the carriage |
  | `grip` | Prism 18.8 × 1.6 (across the travel), 0.1 high on the top | `faderInk`: (38, 40, 44), roughness 0.6 | As the carriage |

  `t` is the value's place along the range, driven by `spring.fader` (420 / 41, critically damped) in fixed 4 ms steps,
  clamped at the stops, instant under reduced motion; the slot and the scale stay on the face, and only the carriage
  casts. Every vertex stays at least 0.5 px inside the box over the whole travel in every corner of the reference
  stage at every depth (core's `checkContainment`). **Not wired yet:** the GPU helper's `instrument` level (the Knob's
  PR, #142) picks this module up; until then a fader at the Instrument level is drawn as at Objects. At full depth the
  carriage's shadow (24 px down) passes the 16 px margin at the bottom stop: the follow-up caps the caster's height or
  grows the margin with depth.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slot | `edge` mixed 70% towards black (`text` in the high-contrast themes) | — | `rail` (`metal`), a groove |
| Carriage | `knob`, a 1 px `edge` border | — | `knob` (`satin`); brushed hairlines and a light top edge in CSS |
| Grip | `edge` mixed 55% towards black (`text` in the high-contrast themes) | — | None |
| Ticks | `text` | — | None (printed) |
| Numerals | — | `muted` | None (printed) |
| Legend | — | `text` (small, strong, uppercase) | None (printed) |

The grip keeps at least 3:1 against the carriage in every theme, and the carriage's `edge` border and the slot keep it
apart from the faceplate (non-text contrast). `data-strata-material` on the fader overrides the carriage's material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Carriage at `elevation.raised`; slot a groove at `elevation.well` | Carriage slab on the panel; slot a groove on the face | The relief recipe on the carriage, the slot's inner shadow |
| Hover | Carriage height `× state.hoverHeight`; interior `+state.hoverLift` | Slab rises by a quarter of its height | Larger shadow, `brightness(1.04)` |
| Pressed (dragging) | As rest: a carriage does not sink under a finger | As rest | As rest |
| Focus-visible | The CSS ring round the track, captured (no GPU focus edge) | Same | `outline: focus.width solid accent`, offset `focus.offset` |
| Disabled | Height 0, no bevel gain, the track at 38% | Flattened | Flat, the track at 38% |
| Value change | The carriage moves: a new rect and fresh captured pixels | The slab moves | `top` (or `left`) follows `--strata-fader-value`; a detented carriage settles over `motion.fast` without overshoot |

Selected, invalid and busy do not apply. Under `prefers-reduced-motion` the carriage moves at once. At the Instrument
level the carriage stays at its height on hover and slides on its spring; focus is the same CSS ring.

## 5. Relief primitives

- One `groove`: the slot, vertical (or horizontal) as laid out. One `raised` face: the carriage, a rounded rectangle
  (radius 3). At the Objects level the carriage is a `slab` standing on the panel, and the slot stays a groove on the
  face.
- The `<input>` carries no `data-strata-face`: a range input with one is drawn as a Slider's horizontal rail and puck,
  which is wrong for a vertical one ([I0.7](../instrument-phase0.md#i07-interaction-and-accessibility), finding 2).
  The slot and the carriage are their own faces instead, and take the input's hover and disabled state (the GPU
  helper finds the input in the track); the carriage's material role is `knob`, the slot's `rail`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.fader` (120†, 180, 240†, `--strata-fader-travel`): the carriage centre's travel | `size`, `travel` (per fader) |
| `fader.snap` (2 px) | — |
| `colour.knob`, `colour.edge`, `colour.text`, `colour.muted`, `colour.accent` (focus) | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob`, `material.roles.rail` | `material` |
| `font.size.caption` (scale), `font.size.small` (legend), `font.weight.strong`, `space.1` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.standard` | — |
| `level` | `level` |

`size.fader`'s small and large values are this page's (†, provisional); the medium travel is the design language's
180. The travel grows by as much as 15em of the caption size grows past 180 px (12 px captions), so it grows with
text. Props: `label` (the legend), `value` / `defaultValue` (or `v-model`), `min` (0), `max` (100), `step` (1),
`detents`, `orientation` (`vertical`), `travel`, `marks` (a count, or values with labels; 5 by default, one per
detent up to 12), `unit` or `format` (`aria-valuetext`), `resetValue` (the double-click target; the initial value by
default), `id`, `name`, `form`, `disabled`, and in React `inputRef` (Vue exposes `root` and `input`).

## 7. DOM structure and overlay needs

```html
<div class="ug-fader" style="--strata-fader-value: 0.9091;">
  <div class="ug-fader__track">
    <span class="ug-fader__scale" aria-hidden="true">
      <span class="ug-fader__mark" data-strata-value="6" style="--strata-fader-at: 1;">6</span>
      <span class="ug-fader__mark" data-strata-value="0" style="--strata-fader-at: 0.9091;">0</span>
      <span class="ug-fader__mark" data-strata-value="-20" style="--strata-fader-at: 0.6061;">−20</span>
      <span class="ug-fader__mark" data-strata-value="-40" style="--strata-fader-at: 0.303;">−40</span>
      <span class="ug-fader__mark" data-strata-value="-60" style="--strata-fader-at: 0;">−60</span>
    </span>
    <span class="ug-fader__slot" data-strata-face="groove" aria-hidden="true"></span>
    <span class="ug-fader__carriage" data-strata-face="raised" aria-hidden="true"><span class="ug-fader__grip"></span></span>
    <input class="ug-fader__input" type="range" id="level" name="level" min="-60" max="6" step="1" value="0"
           aria-orientation="vertical" data-strata-default="0" data-strata-unit=" dB" aria-valuetext="0 dB">
  </div>
  <label class="ug-fader__label" for="level">Level</label>
</div>
```

- The `.ug-fader` root is the boundary: React and Vue refs, `class` and `style` reach it. `--strata-fader-value`
  (0–1) places the carriage; a `travel` prop adds `--strata-fader-travel`. `ug-fader--horizontal` lays it along the
  page (the input then has no `aria-orientation`), `ug-fader--detented` makes the carriage settle. The behaviour keeps
  `--strata-fader-value` in step with the value; call `syncStrataFader(input)` after setting `value` from script.
- The input is transparent (`appearance: none`, its thumb the carriage's footprint, `touch-action: pan-x`, or
  `pan-y` when horizontal) and covers the whole track, above the drawn parts, which take no pointer events: every
  press lands on the original control.
- A mark is a numeral with its tick (`::before`); `data-strata-value` is what a tap near it sets exactly.
- `data-strata-default` is the double-click target; `data-strata-unit` makes the behaviour keep `aria-valuetext` as
  the value and the unit ("−22 dB", with U+2212). Without either, the number alone is read.
- The legend is a `<label for>` printed under the track. No overlay.

## 8. Keyboard and screen reader

| Input | Action |
| --- | --- |
| Up, Right / Down, Left | Increase / decrease by `step` (native, either orientation) |
| PageUp, PageDown | Larger step, as the browser defines it (native: 10% of the range) |
| Home, End | Minimum, maximum (native) |
| Drag the carriage (mouse, pen or touch) | Native thumb drag: the value follows the pointer one to one along the travel |
| Click or tap on the track (the slot, the scale or the thumb's margin) | Sets the value under the carriage's centre (native track click; on the thumb's margin, on release); within `fader.snap` (2 px) of a printed mark, exactly its value. A tap on the carriage changes nothing |
| Wheel over the track | One notch (`step`, at least 1% of the range) per wheel notch, up or right raising it (touchpads add up to one); the page does not scroll. Ctrl+wheel zooms as usual |
| Double-click | Returns to `data-strata-default` |
| Tab, Shift+Tab | Move focus (native order) |

- Role `slider` (native), named by the legend, with the value, minimum, maximum, the orientation and `aria-valuetext`
  when a unit or a format gives one. Automation cannot hear `aria-valuetext` on a native range (the accessibility tree
  reports the number), so the manual screen-reader script for "a fader with units" is VAL-002's, in
  [open issues](../../open-issues.md), until performed.
- A click on the track is the single-pointer alternative to the drag (WCAG 2.5.7).
- Every change goes through the input's `value`: `input` while it changes, `change` at the end of a gesture, so forms
  and bindings see native events. The behaviour is `attachStrataFaders` from `@underglass/ui/dom` (one set of
  delegated listeners per document, among them the blocking document-level wheel listener); `attachStrata` and the
  React, Vue and Astro components attach it. Without script the fader is a native vertical slider whose drag, track
  click and keys work; the carriage stays where it was rendered.
- `disabled` uses the native attribute, which removes the fader from the tab order and from pointer input.

## 9. CSS presentation

The relief recipe on the carriage (`raised`, lit from the light, with a cast shadow) with the I1 prototype's brushed
finish (hairlines across the travel and a light top edge, scaled by the bevel gain: 0 in the high-contrast themes), and
the slot as a dark cut with an inner shadow and a lit lower lip. In face mode the carriage is flat `colour.knob` and
the slot flat, and the GPU paints the relief. Marks sit on whole pixels (CSS `round()`). The track is at least 74 px
along and 90 across (vertical), far above `target.min` (24); the carriage, the target a finger aims at, is 30 × 42.

- **Reflow:** a vertical fader is an inline column 90 px wide, so several fit a 320 px viewport; a horizontal one is
  as wide as its travel plus the thumb and shrinks to its container (`max-width: 100%`), the carriage and the marks
  placed in percentages of the track. The legend wraps.
- **Text size:** the travel grows by as much as 15em grows past 180 px, and the scale's band is 2.5em + 14 px, so
  200% text doubles a medium fader's travel, keeps its marks apart and every numeral inside the track.
- **`forced-colors: active`:** the slot is `CanvasText`, the carriage `Canvas` with a 1 px `CanvasText` border and a
  `CanvasText` grip, the ticks and numerals `CanvasText`, focus a `Highlight` ring, `GrayText` when disabled.
- **`prefers-contrast: more`:** the high-contrast theme applies through the tokens; the grip, the slot and the
  numerals take `colour.text`.
- **`prefers-reduced-motion: reduce`:** the detent settle is off; the carriage moves at once.

## 10. Tests

- **Plain DOM** (`ui-fader.test.mjs`, real input): a real drag of the drawn carriage (the native thumb) moves the value
  one to one with the carriage under the pointer; clicks on the slot and on printed numerals set their values, also
  on the thumb's margin; a tap off a numeral within `fader.snap` snaps; the wheel steps and the page does not scroll;
  native keys; the double-click reset; `aria-valuetext` with units; detents snap; `input` and `change` fire; the
  horizontal fader likewise; touch taps on numerals and a touch drag of the carriage at 390 px (Playwright touch
  emulation); 320 and 390 px viewports (no horizontal overflow, targets at least 24 px, print inside the viewport);
  200% text; axe in light and dark (and face mode); forced colours draw a visible control; reduced motion.
- **GPU** (`ui-fader.test.mjs`): at Relief and Objects, GPU stays active through value changes; the slot is a vertical
  (or horizontal) groove and the carriage a raised face or slab; pixels change after each value change and only inside
  the track; the carriage and its shadow stay inside the track over the whole travel (decoded pixels against the
  carriage hidden, at both stops and mid-travel); native hits on a grid over the track land on the input (0
  mismatches) at DPR 1 and 2; the accessibility snapshot is the same in DOM and GPU modes.
- **Bindings** (`ui-fader-bindings.test.mjs`, `ui-fader-astro.test.mjs`): React, Vue and Astro render the markup
  above; controlled and uncontrolled values, `onValueChange` / `v-model`, the root ref, `class` and `style`.
- **Unit** (`strata-fader.unit.test.mjs`): the value maths, marks and styles; the fader's object validated by core's
  `validateInstrumentScene`, contained over its whole travel in every corner of the reference stage at every depth
  (core's `checkContainment`), the carriage's face shadow inside its box at 50% depth, and `spring.fader`.
- **Not yet:** the Instrument level on the GPU (the helper's `instrument` level), a parity budget against I0.6's, a
  low-end GPU, and the manual screen-reader script.
