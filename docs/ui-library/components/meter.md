# Meter

Instrument, wave 2 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Shows a measurement within a range, as on mixing desks and rack equipment: a channel's level, a tuner's offset, a
temperature. Renders a native `<meter>` (implicit role `meter`) with `min`, `max`, `low`, `high` and `optimum`,
following the WAI-ARIA [Meter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/). The native element has the
role, the value, the range and the zones; Strata adds `aria-valuetext` for units and the drawn object over it. A meter is
read-only: it takes no pointer and no keys, and the drawing is decoration.

`form="bar"` (the default) is a bar of LED segments lit from the value; `form="needle"` is a needle on a printed arc. A
round dial is the [Gauge](gauge.md). A task's progress is a [ProgressBar](progress-bar.md), a wait a
[Spinner](spinner.md): a meter is for a bounded measurement, never for progress.

## 2. Object

A **window set in the faceplate**: a bar of round LED segments with a printed scale under them, or a needle on a printed
arc. Labels are printed on the face, never on the object (design language principle 2).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native meter) | Bar: 16 segments × 15 px + 2 × `max(10 px, 1.6em)` + 8 (286 × 58 at medium). Needle: `size.gauge` × 1.5 + 24 wide, 0.8 × `size.gauge` + 24 high (264 × 152) | 0 | No |
| Window | A well set in the faceplate, 4 px inside the bar's box (a needle meter's inside its bezel), radius 8, a 1 px `edge` border | Relief: `elevation.well`; Objects: a well object | No |
| Bezel (needle) | A raised rounded slab round the window, 6 px in from the box | Relief and Objects: fitted to the box (2.06 at most), a cast shadow inside it | No |
| Segment (bar) | A round LED lens Ø `size.meter` (8, 10 or 12), on a socket printed on the face; its colour is its zone's | Relief a disc, Objects a dome, Instrument a glass lens 0.35 of its diameter high | No; it lights |
| Scale | A tick (5 × 1.2 px) and a numeral at the value's place, printed under the segments (bar) or inside the arc (needle) | 0 | No |
| Needle | A blade 2.2 wide from a 12 px tail behind the pivot to the ticks | Captured at Relief and Objects; a part 2.4 high on the glass at Instrument | Turns through `meter.sweep` (100°) on `spring.meter` |
| Hub | Ø 12, at the pivot | Relief: a dome | No |
| Emitter (bar) | A point light over each lit segment | 0.8 lens diameters | Strength 0 or on |

- **Zones** are the native meter's (HTML standard): the region of `optimum` (below `low`, between `low` and `high`, or
  above `high`) is good, the next is suboptimal, the far one is the worst. A segment takes the zone of the value at
  the middle of the share of the range it stands for: `colour.success`, `colour.warning`, `colour.danger`. A level
  meter that is green to 70, amber to 90 and red above is `low=70 high=90 optimum=0`. A needle meter prints a band in
  `colour.danger` outside the ticks below `low` and above `high` when they are given, and no zone otherwise. Colour
  carries no meaning alone: the value is the number of lit segments or the needle's place, read from the printed scale
  and `aria-valuetext`.
- **Lit segments.** Segment `i` of `n` is lit when `value · n − i − ½` is above 0 (half the range lights half the
  segments; `segmentsLit` in [`shared/meter.ts`](../../../packages/ui/src/shared/meter.ts)); the CSS computes the same
  with one `clamp()` and the helper reads the native meter itself, so every presentation follows one number.
- **Peak hold** (`peak`): a bar holds its highest lit segment for `meter.peakHold` (600 ms), then lets it fall at
  `meter.peakDecay` (half the range a second), never below the value (`advancePeak`). The held segment is lit like any
  other.
- **The segment's emitter** (design language section 3): `emitter.segment.radius` 3 lens diameters,
  `emitter.segment.height` 0.8 and `emitter.segment.strength` 260 for the 10 px lens, scaled with the square of the lens.
  A bar throws many small pools, so each reaches less than an LED's (6): the face round a lit bar is lit within 30 px
  of its segments, and protected text stays within the contrast guard.
- **At the Instrument level** (`level: "instrument"`, core's `instrument` material)
  [`gpu/instrument-meter.ts`](../../../packages/ui/src/gpu/instrument-meter.ts) builds the object from the laid-out
  window, segments and needle, bounded by the native meter's box:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `window` (bar) | A prism over the printed scale (the strip under the segments), 2.4 high, a 2.2 px bevel, clear | `meterGlass`: glass (index 1.5, tint (214, 237, 230), absorption 0.03, reflection 1.5) | None |
  | `window` (needle) | A prism over the whole window, 2.4 high, radius 8, a 2.2 px bevel | `meterGlass` | None |
  | `segment` | Lathe: a 1 px wall and an elliptical dome 0.35 of the diameter high; `glass: "lens"` with its `emitter` | `meterGlass` (`lensOpaque #rrggbb` under `prefers-reduced-transparency`) | None |
  | `needle` | Extruded blade: 2.2 wide, from 12 px behind the pivot to the tip, 2.4 high at the tail, standing 2.4 over the glass | `knobInk` (38, 40, 44), roughness 0.6 | Turn `−sweep/2 − 90°` to `sweep/2 − 90°` about the pivot |
  | `pivot` | Lathe: a hub Ø 12, 4 high, a 0.8 edge break | `knobCap`: brushed (239, 240, 241) | None |

  The parts never depend on the value, which would rebuild the layer: lit or dark is only the emitter's strength, and the
  needle is a pose, so a live level is a uniform write with no capture. **Why the glass covers the scale and not the
  segments:** core's glass lenses do not write depth, and a window's exact pixels (text under glass is the capture itself)
  are drawn over every glass part that lies under them where the capture is opaque, which is everywhere on a panel. A pane
  over the LEDs would hide them and the light of the lit ones, so the pane covers the printed scale, whose text it keeps
  exact, and the lenses stand in the open above it. A needle meter's pane covers the whole window: the needle and the hub are
  not glass, they write depth and stand over it.
- **At Relief and Objects** the window is a well (a well object at Objects), a needle meter's bezel a raised face or slab
  standing only as high as its box lets its shadow reach, the segments the Lamp's LED lens (a disc in the zone's lit or
  unlit colour, a dome at Objects) with an emitter each, and the hub a dome. The needle, the scale and the zones are
  captured content (as the Knob's pointer is), so a value change refreshes the layer's capture there; it turns on
  `spring.meter` as a CSS transition the helper follows frame by frame.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Window | `panel`, a 1 px `edge` border | — | `field` (a well) |
| Bezel (needle) | `knob` metal, a 1 px `edge` border | — | `knob` (`satin`) |
| Segment, unlit | The zone's role at 16% over dark glass | — | `lens` (`glass`) |
| Segment, lit | The zone's role mixed 18% towards white | — | `glowOn` (`emissive`), an emitter |
| Needle | `edge` mixed 55% towards black (`text` in the high-contrast themes) | — | None (captured) |
| Ticks | `text` | — | None (printed) |
| Numerals | — | `muted` | None (printed) |
| Zone band (needle) | `danger` | — | None (printed) |
| Legend | — | `text` (small, strong, uppercase) | None (printed) |

The needle keeps at least 3:1 against the window in every theme. `data-strata-material` on the meter overrides the
bezel's and the window's material.

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | A well; the segments discs, the lit ones in colour | A well object; domes | The window, glass lenses | The window's inner shadow, the segments' gradients |
| Value change | The lit segments change (captured), their emitters follow; the needle turns on its spring (captured) | As Relief | Emitter strengths (uniforms) and the needle's pose: no capture | `--strata-meter-value` lights the segments; the needle follows `--strata-meter-t` on `spring.meter` |

Hover, pressed, focus-visible, disabled, selected, invalid and busy do not apply: a meter takes no input and is not
focusable. Under `prefers-reduced-motion` the needle moves at once and a lit segment has no glow. At the Instrument level the
needle's spring is clamped at the stops (it never swings past minimum or maximum).

## 5. Relief primitives

- A bar: one `well` (the window) and a `knob` per segment, drawn by the helper as a `ring` disc in its own colour (Relief)
  or a dome (Objects), each hidden from the CSS while it does (`data-strata-dome`).
- A needle meter: a `raised` bezel (a slab at Objects), a `well` window and a `knob` hub; the needle has no face (it is
  captured content, a part at Instrument).
- The `<meter>` carries no `data-strata-face`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.meter` (8, 10, 12, `--strata-meter-size`): the segment lens; `size.gauge` (`--strata-gauge-size`): the needle meter's scale | `size` |
| `meter.sweep` (100°, 40–160), `meter.peakHold` (600 ms), `meter.peakDecay` (0.5 a second) | `peak` |
| `spring.meter` (stiffness 360, damping 28†) | — |
| `emitter.segment.radius` (3), `emitter.segment.height` (0.8), `emitter.segment.strength` (260†), `emitter.guardFeather` (4) | — |
| `colour.success`, `colour.warning`, `colour.danger`, `colour.edge`, `colour.text`, `colour.muted`, `colour.knob` | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob`, `material.roles.lens`, `material.roles.glowOn`, `material.roles.field` | `material` |
| `font.size.caption` (scale), `font.size.small` (legend), `font.weight.strong`, `space.1` | — |
| `level` | `level` |

† Provisional, with the premium character. Props: `label` (the legend), `value`, `min` (0), `max` (100), `low`, `high`,
`optimum`, `form` (`bar` or `needle`), `segments` (16, from 2 to 32), `marks` (a count, or values with labels; 5 for a bar,
3 for a needle meter), `unit` or `format` (`aria-valuetext`), `peak`, `id`, `size`, `material`, `level`, and in React
`meterRef` (Vue exposes `root` and `meter`).

## 7. DOM structure and overlay needs

A bar meter:

```html
<div class="ug-meter ug-meter--bar" style="--strata-meter-value: 0.62; --strata-meter-count: 8;">
  <div class="ug-meter__body">
    <span class="ug-meter__object" aria-hidden="true">
      <span class="ug-meter__window" data-strata-face="well">
        <span class="ug-meter__segments">
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="good" style="--_i: 0;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="good" style="--_i: 1;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="good" style="--_i: 2;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="good" style="--_i: 3;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="good" style="--_i: 4;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="good" style="--_i: 5;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="warn" style="--_i: 6;"></span>
          <span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="bad" style="--_i: 7;"></span>
        </span>
        <span class="ug-meter__scale">
        <span class="ug-meter__mark" data-strata-value="0" style="--strata-meter-at: 0;">0</span>
        <span class="ug-meter__mark" data-strata-value="50" style="--strata-meter-at: 0.5;">50</span>
        <span class="ug-meter__mark" data-strata-value="100" style="--strata-meter-at: 1;">100</span>
        </span>
      </span>
    </span>
    <meter class="ug-meter__native" id="level" min="0" max="100" value="62" low="70" high="90" optimum="0" data-strata-unit=" %" aria-valuetext="62 %">62 %</meter>
  </div>
  <label class="ug-meter__label" for="level">Level</label>
</div>
```

A needle meter, with a red zone from `high`:

```html
<div class="ug-meter ug-meter--needle" style="--strata-meter-value: 0.6087; --strata-meter-hi: 0.8696;">
  <div class="ug-meter__body">
    <span class="ug-meter__object" aria-hidden="true">
      <span class="ug-meter__bezel" data-strata-face="raised">
        <span class="ug-meter__window" data-strata-face="well">
          <span class="ug-meter__zones"></span>
          <span class="ug-meter__scale">
        <span class="ug-meter__mark" data-strata-value="-20" style="--strata-meter-at: 0;">−20</span>
        <span class="ug-meter__mark" data-strata-value="-10" style="--strata-meter-at: 0.4348;">−10</span>
        <span class="ug-meter__mark" data-strata-value="0" style="--strata-meter-at: 0.8696;">0</span>
        <span class="ug-meter__mark" data-strata-value="3" style="--strata-meter-at: 1;">3</span>
          </span>
          <span class="ug-meter__needle"></span>
          <span class="ug-meter__hub" data-strata-face="knob"></span>
        </span>
      </span>
    </span>
    <meter class="ug-meter__native" id="vu" min="-20" max="3" value="-6" high="0" data-strata-unit=" dB" aria-valuetext="−6 dB">−6 dB</meter>
  </div>
  <label class="ug-meter__label" for="vu">VU</label>
</div>
```

- The `.ug-meter` root is the boundary: React and Vue refs, `class` and `style` reach it. `--strata-meter-value` (0–1)
  is the value's place, `--strata-meter-count` a bar's segment count, `--strata-meter-lo` and `--strata-meter-hi` a
  needle meter's zone bands; `ug-meter--peak` makes a bar hold its peak (the behaviour writes `--strata-meter-peak-index`,
  the held segment). Each segment's `data-strata-zone` is `good`, `warn` or `bad`, and `--_i` its index.
- The native `<meter>` is transparent (`appearance: none`) and covers the whole object, above the drawn parts, which take
  no pointer events. It carries the value, the range, the zones and the name (the legend, a `<label for>`); its text is
  the value text, for browsers that do not draw a meter. `data-strata-unit` makes the behaviour keep `aria-valuetext` in
  step with the value ("−18 dB", with U+2212).
- A mark is a numeral with its tick; `data-strata-value` is its value. No overlay.

## 8. Keyboard and screen reader

A meter has no keyboard interaction: it is not focusable and takes no input.

- Role `meter` (native), named by the legend, with the value, minimum, maximum and `aria-valuetext` when a unit or a
  format gives one. Automation cannot hear `aria-valuetext` on a native meter (the accessibility tree reports the
  number), so the manual screen-reader script for "a meter with units" is VAL-002's, in
  [open issues](../../open-issues.md), until performed.
- **Meaning never rides on colour alone** (WCAG 1.4.1): the value is the number of lit segments or the needle's place
  against a printed scale, and the zone is also the thresholds' positions on that scale; forced colours and more contrast
  draw lit segments as a fill and the needle in the text colour.
- **Live values:** a meter driven at frame rate changes its `value` property; its accessible value changes with it. A
  screen reader reading the number every frame is a nuisance, not a failure: set `aria-live` nowhere, and update the DOM
  value at a low rate for assistive technology where a signal is faster than people can read (design language section 6).
  The drawn object follows every write.
- **Target size** (2.5.8) does not apply (no input); the box is at least 58 px high.

## 9. CSS presentation

A window (a well with an inner shadow and a 1 px `edge` border), the segments as radial-gradient beads on their sockets, lit
by `--strata-lit` computed from the value (`clamp()`), with a glow shadow when lit, and the needle a 2.2 px blade turning with
`--strata-meter-t`, the value's place on its spring (`transition` on a `linear()` sampled from `spring.meter`: 192 ms).
Marks sit on whole pixels (CSS `round()`).

- **Reflow:** a bar is as wide as its segments (286 px at medium, 16 segments) and shrinks to its container
  (`max-width: 100%`, the segments in a grid of equal columns); a needle meter's geometry is in container units, so it
  scales with its width. The legend wraps.
- **Text size:** the window's padding is `max(10px, 1.6em)`, the scale's band `1em + 8px`, and a bar's box grows with the
  caption size, so 200% text keeps every numeral inside the window.
- **`forced-colors: active`:** the window and bezel are `Canvas` with a `CanvasText` edge, a lit segment `Highlight`, an
  unlit one `Canvas`, the needle, the ticks and the numerals `CanvasText`, the zone bands `CanvasText`.
- **`prefers-contrast: more`:** the high-contrast theme applies through the tokens; the needle, the numerals and the
  window's edge take `colour.text`; the segments are flat colour with no glow, edged in the text colour, and their emitters
  are off.
- **`prefers-reduced-motion: reduce`:** the needle moves at once; a lit segment has no glow.
- Face mode (`data-strata-mode="face"`, GPU on): the window is flat, the segments' CSS lens is hidden (the socket stays),
  and at the Instrument level the CSS needle is hidden too.

## 10. Tests

- **Plain DOM** (`ui-meter.test.mjs`, real markup): role `meter`, the name, `value`, `min`, `max`, `low`, `high`,
  `optimum` and `aria-valuetext`; the lit segments at 0, 25, 50, 75 and 100 and their zones (11 good, 3 suboptimal, 2 worst);
  a written `value` moves `--strata-meter-value` and the unit's `aria-valuetext`; a held peak stays 600 ms and falls to
  the value; every box is as documented and a grid of `elementFromPoint` over it finds the meter; 320 and 390 px (no
  horizontal overflow, the window holds its numerals); 200% text; axe in light and dark, face mode, forced colours and more
  contrast; reduced motion puts the needle at its target at once.
- **GPU** (`ui-meter.test.mjs`, DPR 1 and 2, Relief, Objects and Instrument): GPU stays on; the scene is version 4 with an
  emitter per segment in document order, its strength from the value, the protected rects of every text and the documented
  parts; with the value at 0, 25, 50, 75 and 100 the objects draw inside the boxes (0 pixels outside, the light within its
  reach) and native hits on every part pixel find the meter; a value change changes pixels in its box and its reach only;
  the face is lit round a lit bar within the outset and protected text stays within the guard; at the Instrument level the
  printed scale under the glass is the capture itself (0 mismatched pixels against the layer without the window); 300
  frames of a sweeping value add no capture, upload or hit-geometry update while the needle moves on its spring; reduced
  motion puts the needle on its target in the first frame; the accessibility snapshot is the same in DOM and GPU modes. Checked
  in a headful Canary window as well.
- **Bindings and Astro** (`ui-meter-bindings.test.mjs`, `ui-meter-astro.test.mjs`): React, Vue and Astro render the markup
  above exactly (and the Gauge's); a changed value moves the drawing and the native meter; the root ref, `meterRef`,
  `class`, `style` and attributes.
- **Unit** (`strata-meter.unit.test.mjs`): the zone rule, the lit segments (against the CSS's rule), the peak, the model,
  the springs and the CSS curves, the tokens, the Relief and Objects entries, and the Instrument parts validated by core's
  `validateInstrumentScene` and contained over the whole travel in every corner of the reference stage at every depth
  (`checkContainment`).
- **Not yet:** a source prop (live audio through Lite's analyser), a vertical bar, a low-end GPU, and the manual
  screen-reader script.
