# Knob

Instrument, wave 1 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Picks one number from a range by turning, as on audio and control hardware: gain, volume, a filter, an input selector.
Renders a native `<input type="range">` that covers a printed dial, following the WAI-ARIA
[Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/). The native element has the role, the value, the
keys and form participation; Strata adds `aria-valuetext` for units and the round pointer behaviour (section 8).

`detents` makes the knob stepped: that many positions, and the native `step` is the range over `detents − 1`. For a
plain horizontal range, use [Slider](slider.md).

## 2. Object

A **machined knob on a printed faceplate**: a skirt, a cap on it with an engraved pointer, and the scale printed on
the face around it. Labels are printed on the face, never on the cap (design language principle 2).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Dial (the native box) | Square, twice the numerals' radius plus 1.5 em (140 at the medium size) | 0 | No |
| Scale | Ticks at r + 5 (6 px long), numerals upright at r + 5 + 1.25 em (r + 20) and at least 3.5 em, printed on the face | 0 | No |
| Skirt | Circle of `size.knob` (48, 64 or 80 px; a detented knob 0.8 of it, to the even px) | Relief and Objects: `elevation.raised` (3) | No |
| Cap | Circle, 0.8 of the skirt (to the even px), on the skirt | `elevation.raised` (3) on the skirt | No |
| Pointer | Engraved line, 2.2 px wide, from 0.28 to 0.86 of the cap's radius | On the cap | Turns through `knob.sweep` (270°) with the value, 0° at the top |

- **Only the pointer turns.** The skirt and the cap keep their boxes at every value, so their faces never change size
  ([I0.7](../instrument-phase0.md#i07-interaction-and-accessibility), finding 3); the pointer is captured content on
  the cap. Every part lies inside the dial, the input's box, at every value.
- **At the Instrument level** (`data-strata-level="instrument"`) the panel is drawn with core's `instrument` material
  and the knob is the [Instrument object table](../design-language.md#instrument-object-table)'s Knob, built by
  [`gpu/instrument.ts`](../../../packages/ui/src/gpu/instrument.ts) from the laid-out skirt and cap:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `skirt` | Lathe: Ø of the skirt (64), 2.5 high, a 0.8 edge break, its top a 7.5° cone rising to the cap | `knobSkirt`: polished (250, 250, 251), roughness 0.04 | None (a solid of revolution) |
  | `cap` | Lathe on the skirt: Ø of the cap (52), 16 high, a 2 px 45° chamfer, a spun top crowned 1.2 at the centre | `knobCap`: brushed (239, 240, 241), roughness 0.3, circular brush 0.9 with the hairline grain 0.15 | None |
  | `chamfer` | Lathe: the cap's chamfer, a hair outside it | `knobChamfer`: the cap's metal polished, roughness 0.06 | None |
  | `pointer` | Extrude: 2.2 wide, from 0.28 to 0.86 of the top's radius, following the crown 0.25 above it | `knobInk`: (38, 40, 44), roughness 0.6 | `turn` from −sweep/2 − 90° to sweep/2 − 90° (it is built along +x) |

  The object's `bounds` is the input's box (the dial) and `t` the value's place along the range, driven by
  `spring.knob` (420 / 41) or, detented, `spring.detent` (900 / 42) in fixed 4 ms steps, clamped at the stops, instant
  under reduced motion. A value change is the native change core captures once; the turning frames after it are
  uniform updates with no capture. The skirt, cap and pointer's own CSS paint is hidden while the parts draw them
  (`data-strata-dome`); the printed scale, the legend and the focus ring stay on the face. Parts take the input's hover
  and disabled state. If an object could not stay in its box, core draws its Relief primitive (a raised circle the size
  of the skirt) and reports it. No collar, emitters or sound yet.

  **A custom cap** (`attachStrataGpu(controller, { parts: { knobCap } })`, the plan's custom slot; core work item 5): a glB
  the application names replaces the cap, its chamfer and the pointer. `knobCap` is `{ source: { url, mesh? } | { data, mesh? },
  bounds: { low, high }, scale?, offset?, pivot? }`, the box in part-local px after `scale` and `offset` (core checks the loaded
  vertices against it); the model stands on the skirt in the `knobCap` material (so themes and characters apply), turns
  through the sweep about its own axis (orient its pointer, if it has one, towards the top of the screen at the middle of
  the sweep: the file's −z), and is contained over the whole travel like any part. Core loads the file outside any frame: until
  it is ready, and if it fails or does not fit the dial, the knob shows its skirt and no cap (core reports the part's
  `loading`, `ready` or `failed` and the reason in `state().instrument`); the design language's built-in stand-in is not done.
  Without `parts` the knob is the one above. [`ui-knob.html?level=instrument&cap=glb`](../../../examples/playground/ui-knob.html)
  shows it.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Skirt | `knob` | — | `knob` (`satin`); a turned-flange gradient in CSS |
| Cap | `knob` | — | `knob` (`satin`); spun hairlines and a highlight along `light.azimuth` in CSS |
| Pointer | `edge` mixed 55% towards black (`text` in the high-contrast themes) | — | None |
| Ticks | `text` | — | None (printed) |
| Numerals | — | `muted` | None (printed) |
| Legend | — | `text` (small, strong, uppercase) | None (printed) |

The pointer keeps at least 3:1 against the cap in every theme (non-text contrast, section 8): 11:1 light, 9:1 dark,
21:1 high contrast. `data-strata-material` on the knob overrides the skirt's and cap's material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Skirt and cap at `elevation.raised` | Skirt slab, cap slab on it | The relief recipe on both, with the knob finishes |
| Hover | Height `× state.hoverHeight`; interior `+state.hoverLift` | Slabs rise by a quarter of their height | Larger shadow, `brightness(1.04)` |
| Pressed (dragging) | As rest: a cancelled `pointerdown` sets no `:active` | As rest | As rest |
| Focus-visible | The CSS ring round the skirt, captured (no GPU focus edge) | Same | `outline: focus.width solid accent`, offset `focus.offset + 2` |
| Disabled | Height 0, no bevel gain, the dial at 38% | Flattened | Flat, the dial at 38% |
| Value change | The pointer turns: captured content, fresh pixels; no geometry changes | Same | `rotate` on the pointer; a detented knob settles over `motion.fast` with a slight overshoot |

Selected, invalid and busy do not apply. Under `prefers-reduced-motion` the pointer turns at once. At the Instrument
level the parts stay at their height on hover (hardware does not rise under a finger) and the pointer turns on its
spring; focus is the same CSS ring.

## 5. Relief primitives

- Two `raised` faces: the skirt and the cap, both round (`border-radius: 50%`), the cap inside the skirt. At the
  Objects level they are two `slab`s, the cap standing on the skirt's top; their tops carry the captured pointer.
- The `<input>` carries no `data-strata-face`: a range input with one is drawn as a Slider's rail and puck.
- The skirt and the cap take the input's hover and disabled state (the GPU helper finds the input in the dial); their
  material role is `knob`.
- At the Instrument level the same two markers name the parts' sizes; the knob adds no primitive to the face, so the
  layer's face is the panel and its printed print.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.knob` (48, 64, 80†, `--strata-knob-size`) | `size` |
| `knob.sweep` (270), `knob.dragPx` (200), `knob.fine` (0.1), `knob.tapSlop` (4), `knob.snap` (2) | `sweep` (per knob, `--strata-knob-sweep`) |
| `colour.knob`, `colour.edge`, `colour.text`, `colour.muted`, `colour.accent` (focus) | — |
| `elevation.raised`, `state.*`, `interior.max`, `bevel.*`, `shadow.*`, `light.azimuth` | — |
| `material.roles.knob` | `material` |
| `font.size.caption` (scale), `font.size.small` (legend), `font.weight.strong`, `space.1` | — |
| `focus.width`, `focus.offset`, `motion.fast` | — |
| `level` | `level` |

The `knob.*` tokens are design language section 14's; `size.knob`'s small and large values are this page's (†,
provisional). Props: `label` (the legend), `value` / `defaultValue` (or `v-model`), `min` (0), `max` (100), `step` (1),
`detents`, `sweep`, `marks` (a count, or values with labels; 11 by default, one per detent up to 12), `unit` or
`format` (`aria-valuetext`), `resetValue` (the double-click target; the initial value by default), `id`, `name`,
`form`, `disabled`, and in React `inputRef` (Vue exposes `root` and `input`).

## 7. DOM structure and overlay needs

```html
<div class="ug-knob ug-knob--detented" style="--strata-knob-value: 0.5;">
  <div class="ug-knob__dial">
    <span class="ug-knob__scale" aria-hidden="true">
      <span class="ug-knob__mark" data-strata-value="-12" style="--strata-knob-at: 0;">−12</span>
      <span class="ug-knob__mark" data-strata-value="-6" style="--strata-knob-at: 0.25;">−6</span>
      <span class="ug-knob__mark" data-strata-value="0" style="--strata-knob-at: 0.5;">0</span>
      <span class="ug-knob__mark" data-strata-value="6" style="--strata-knob-at: 0.75;">6</span>
      <span class="ug-knob__mark" data-strata-value="12" style="--strata-knob-at: 1;">12</span>
    </span>
    <span class="ug-knob__skirt" data-strata-face="raised" aria-hidden="true">
      <span class="ug-knob__cap" data-strata-face="raised"><span class="ug-knob__pointer"></span></span>
    </span>
    <input class="ug-knob__input" type="range" id="gain" name="gain" min="-12" max="12" step="6" value="0"
           data-strata-default="0" data-strata-unit=" dB" aria-valuetext="0 dB">
  </div>
  <label class="ug-knob__label" for="gain">Gain</label>
</div>
```

- The `.ug-knob` root is the boundary: React and Vue refs, `class` and `style` reach it. `--strata-knob-value` (0–1)
  turns the pointer; a `sweep` prop adds `--strata-knob-sweep`. The behaviour keeps `--strata-knob-value` in step with
  the value; call `syncStrataKnob(input)` after setting `value` from script.
- The input is transparent (`appearance: none`, a 1 px invisible thumb, `touch-action: none`) and covers the whole
  dial, above the drawn parts, which take no pointer events: every press lands on the original control.
- A mark is a numeral with its tick (`::before`); `data-strata-value` is what a ring click near it sets exactly.
- `data-strata-default` is the double-click target; `data-strata-unit` makes the behaviour keep `aria-valuetext` as
  the value and the unit ("−6 dB", with U+2212). Without either, the number alone is read.
- The legend is a `<label for>` printed under the dial. No overlay.

## 8. Keyboard and screen reader

| Input | Action |
| --- | --- |
| Up, Right / Down, Left | Increase / decrease by `step` (native) |
| PageUp, PageDown | Larger step, as the browser defines it (native) |
| Home, End | Minimum, maximum (native) |
| Vertical drag (mouse, pen or touch) | `knob.dragPx` (200) per full sweep, up raises; `× knob.fine` (0.1) with Shift; a press moving under `knob.tapSlop` (4) is a tap |
| Tap on the ring | Sets the value by angle: 0° at the top, clockwise over the sweep; the bottom gap goes to the nearer end; within `knob.snap` (2°) of a printed numeral, exactly its value |
| Tap on the skirt or cap | Steps one notch up on the upper half, down on the lower half (the single-pointer alternative, WCAG 2.5.7); a notch is `step`, at least 1% of the range |
| Wheel over the dial | One notch per wheel notch (touchpads add up to one); the page does not scroll. Ctrl+wheel zooms as usual |
| Double-click | Returns to `data-strata-default` |
| Tab, Shift+Tab | Move focus (native order) |

- Role `slider` (native), named by the legend, with the value, minimum and maximum from the attributes and
  `aria-valuetext` when a unit or a format gives one. Automation cannot hear `aria-valuetext` on a native range (the
  accessibility tree reports the number), so the manual screen-reader script for "a knob with units" is VAL-002's, in
  [open issues](../../open-issues.md), until performed.
- Every change goes through the input's `value`: `input` while it changes, `change` at the end of a gesture, so forms
  and bindings see native events. The behaviour is `attachStrataKnobs` from `@underglass/ui/dom` (one set of delegated
  listeners per document, among them the blocking document-level wheel listener); `attachStrata` and the React, Vue
  and Astro components attach it.
- `disabled` uses the native attribute, which removes the knob from the tab order and from the pointer behaviour.

## 9. CSS presentation

The relief recipe on the skirt and the cap (`raised`, lit from the light, with cast shadows), with the knob's
finishes: a turned-flange gradient on the skirt and spun hairlines with a bow-tie highlight along `light.azimuth` on
the cap, from the I1 prototype's second iteration, scaled by the bevel gain (0 in the high-contrast themes). In face
mode both are flat `colour.knob` and the GPU paints the relief. Marks sit on whole pixels (CSS `round()`), upright,
at angles from `sin()` and `cos()`. The dial is at least 108 px square, far above `target.min` (24).

- **Reflow:** the knob is an inline column as wide as its dial (140 px at medium), so it fits a 320 px viewport; the
  legend wraps. The scale's radius and the dial grow with the caption size, so 200% text keeps every numeral clear of
  its neighbours and inside the dial.
- **`forced-colors: active`:** the skirt and the cap are `Canvas` circles with a 1 px `CanvasText` border, the pointer
  and the ticks `CanvasText`, the numerals `CanvasText`, focus a `Highlight` ring, `GrayText` when disabled.
- **`prefers-contrast: more`:** the high-contrast theme applies through the tokens; the pointer and the numerals take
  `colour.text`, and the skirt and cap an `edge` border.
- **`prefers-reduced-motion: reduce`:** the detent settle is off; the pointer turns at once.
- **Feedback** ([design language section 20](../design-language.md#20-feedback)): a detented knob's pointer passing a
  detent plays `tick` through `strataFeedback` (one per change, however many detents it passes; the Fader's rule).
  Sound and haptics are both off by default (`feedback.sound`, `feedback.haptics`, or `attachStrataFeedback`), so
  nothing plays unless the application or a scope turns them on; a knob without detents never ticks.

## 10. Tests

- **Plain DOM** (`ui-knob.test.mjs`, real input): ring clicks on printed numerals set their values; cap taps step up
  and down; drag with and without Shift; the wheel steps and the page does not scroll; native keys; the double-click
  reset; `aria-valuetext` with units; detents snap; `input` and `change` fire; touch taps on numerals and a touch drag
  (Playwright touch emulation); 320 and 390 px viewports (no horizontal overflow, targets at least 24 px, legend and
  numerals inside the viewport and readable); 200% text; axe in light and dark; forced colours draw a visible control;
  reduced motion.
- **GPU** (`ui-knob.test.mjs`): at Relief and Objects, GPU stays active through value changes; the skirt and cap are
  the expected primitives or slabs; pixels change after each value change and only inside the dial; native hits at a
  grid of points over the dial land on the input (0 mismatches); the accessibility snapshot is the same in DOM and GPU
  modes.
- **Instrument** (`ui-knob.test.mjs`, DPR 1 and 2, headless and headful): the scene is version 4 with the four parts
  per knob and the Reset key; every pixel the knobs draw (parts and their face shadows, against the dials hidden) lies
  inside a dial, and native hits on them find the input; real ring clicks, drags, cap taps, keys, the wheel and the
  reset turn the pointer with fresh pixels inside the dial only; 300 frames of turning add 0 captures beyond the native
  changes and 0 hit-geometry updates; nothing is stepped down to Relief; reduced motion makes the turn instant.
- **Feedback** (`ui-knob.test.mjs`): with feedback off a detent passed by a real key pulses nothing; with haptics on,
  each change of a detented knob by the visitor's own key or click is one 5 ms pulse, none at a stop, a jump across two
  detents one pulse, and a knob without detents never pulses. Unit: the detent-crossing rule (`knobDetentsCrossed`).
- **Bindings** (`ui-knob-bindings.test.mjs`, `ui-knob-astro.test.mjs`): React, Vue and Astro render the markup above;
  controlled and uncontrolled values, `onValueChange` / `v-model`, the root ref, `class` and `style`.
- **Unit** (`strata-knob.unit.test.mjs`): the value and angle maths, marks and styles; the knob's and a key's objects
  validated by core's `validateInstrumentScene`, the knob contained over its whole travel in a corner of the reference
  stage at every depth (core's `checkContainment`), and the springs.
- **Not yet:** a parity budget between the Instrument and Objects or CSS renderings, a low-end GPU, and the manual
  screen-reader script.
