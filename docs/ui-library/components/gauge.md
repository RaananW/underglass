# Gauge

Instrument, wave 2 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Shows a bounded measurement on a round dial, as on instrument panels: a temperature, a pressure, a speed. Renders a
native `<meter>` (implicit role `meter`) with `min`, `max`, `low`, `high` and `optimum`, following the WAI-ARIA
[Meter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/); Strata adds `aria-valuetext` for units. A Gauge is read-only:
it takes no pointer and no keys.

**Why `<meter>` and not `<progress>`:** the plan allows either. A gauge shows where a measurement stands within a range, with
zones, which is what a meter is; `<progress>` is a task's completion and has an indeterminate state the dial cannot show.
Indeterminate is therefore not supported: a wait is a [Spinner](spinner.md), a task's progress a
[ProgressBar](progress-bar.md). The Gauge is the [Meter](meter.md)'s round sibling: the same native element, attributes,
behaviour and markup parts (`ug-meter__*`), on a round dial.

## 2. Object

A **round dial under glass**: a polished bezel ring round a window set with the printed scale and the needle on its hub,
over the native meter. Labels are printed on the face, never on the object.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native meter) | Square, `size.gauge` + 24 (184 at medium) | 0 | No |
| Bezel | A ring 6 px in from the box, outer Ø `size.gauge` + 12, 6 wide to the window | Relief and Objects: fitted to the box (2.06 at most); Instrument: 3 | No |
| Window | A round well Ø `size.gauge` (120, 160 or 200), set in the bezel | Relief: `elevation.well`; Objects: a well object | No |
| Scale | Ticks (6 × 1.2 px) at the radius `size.gauge` / 2 − 8 and numerals inside them, over `gauge.sweep` (240°), the middle at the top | 0 | No |
| Zone band | A band 3.5 px wide outside the ticks, in `colour.danger`, below `low` and above `high` | 0 | No |
| Needle | A blade 2.2 wide from a 12 px tail to the ticks (R − 4) | Captured at Relief and Objects; a part 2.4 high on the glass at Instrument | Turns through `gauge.sweep` on `spring.gauge` |
| Hub | Ø 12 at the centre | Relief: a dome | No |

- **Zones.** A Gauge prints a **red zone** outside the ticks wherever the value is beyond `low` or `high`, when the author
  gives them: `high` is where the redline starts, `low` where a low zone ends. (The Meter's three colours come from the
  native rule with `optimum`; a dial has one warning colour, the one a redline has.) `optimum` stays on the native
  meter for assistive technology.
- **At the Instrument level** [`gpu/instrument-meter.ts`](../../../packages/ui/src/gpu/instrument-meter.ts) builds the
  object, bounded by the native meter's box:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `bezel` | Lathe ring from the window's radius out to R + 6, 3 high, a 0.6 edge break | `knobSkirt`: polished (250, 250, 251), roughness 0.04 | None |
  | `window` | A prism over the dial (a circle), 2.4 high, a 2.2 px bevel, clear: its flat region is the capture, so the scale, the zones and the legend under it are exact | `meterGlass`: glass (index 1.5, absorption 0.03, reflection 1.5) | None |
  | `needle` | Extruded blade, 2.2 wide, from 12 px behind the pivot to R − 4, standing 2.4 over the glass | `knobInk` | Turn `−120° − 90°` to `120° − 90°` about the pivot |
  | `pivot` | Lathe hub Ø 12, 4 high | `knobCap` | None |

  `t` is the value's place along the range, driven by `spring.gauge` (160 / 20†: heavier and slower than a meter's, a settle of
  about 330 ms) in fixed 4 ms steps, clamped at the stops, instant under reduced motion. The needle is a pose, so a live value
  is a uniform write with no capture. The needle and the hub write depth and stand over the glass, so the window's exact pixels
  never hide them. The caster is none (a turning blade's footprint is a large box). Every vertex stays at least 0.5 px inside the
  box over the whole travel in every corner of the reference stage at every depth (`checkContainment`).
- **At Relief and Objects** the bezel is a raised face or slab (fitted so its shadow stays in the box), the window a well,
  the hub a dome; the needle and the scale are captured content turning with `--strata-meter-t` on `spring.gauge` as a CSS
  transition (328 ms), which the helper follows frame by frame.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Bezel | `knob` metal | — | `knob` (`satin`); polished at Instrument |
| Window | `panel`, a 1 px `edge` border | — | `field` (a well) |
| Needle | `edge` mixed 55% towards black (`text` in the high-contrast themes) | — | None (captured) |
| Hub | `knob` | — | `knob` |
| Ticks | `text` | — | None (printed) |
| Numerals | — | `muted` | None (printed) |
| Red zone | `danger` | — | None (printed) |
| Legend | — | `text` (small, strong, uppercase) | None (printed) |

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | A raised bezel, a well, a hub dome | A slab, a well object, a dome | A glass window, the polished bezel, the needle | The relief recipe on the bezel; the window's inner shadow |
| Value change | The needle turns on its spring (captured) | As Relief | The needle's pose on `spring.gauge`: no capture | `--strata-meter-t` follows `--strata-meter-value` on a `linear()` |

Hover, pressed, focus-visible, disabled, selected, invalid and busy do not apply. Under `prefers-reduced-motion` the needle moves
at once.

## 5. Relief primitives

A `raised` bezel (a slab at Objects), a `well` window (a well object at Objects) and a `knob` hub. The needle has no face. The
`<meter>` carries no `data-strata-face`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.gauge` (120, 160, 200, `--strata-gauge-size`): the dial's diameter | `size` |
| `gauge.sweep` (240°, 90–330) | — |
| `spring.gauge` (stiffness 160, damping 20†) | — |
| `colour.danger`, `colour.edge`, `colour.text`, `colour.muted`, `colour.knob` | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob`, `material.roles.field` | `material` |
| `font.size.caption`, `font.size.small`, `font.weight.strong`, `space.1` | — |
| `level` | `level` |

† Provisional, with the premium character. Props: `label`, `value`, `min` (0), `max` (100), `low`, `high`, `optimum`,
`marks` (a count, or values with labels; 5 by default), `unit` or `format` (`aria-valuetext`), `id`, `size`, `material`,
`level`, and in React `meterRef` (Vue exposes `root` and `meter`).

## 7. DOM structure and overlay needs

```html
<div class="ug-meter ug-meter--dial ug-gauge" style="--strata-meter-value: 0.6; --strata-meter-lo: 0.1667; --strata-meter-hi: 0.8333;">
  <div class="ug-meter__body">
    <span class="ug-meter__object" aria-hidden="true">
      <span class="ug-meter__bezel" data-strata-face="raised">
        <span class="ug-meter__window" data-strata-face="well">
          <span class="ug-meter__zones"></span>
          <span class="ug-meter__scale">
        <span class="ug-meter__mark" data-strata-value="0" style="--strata-meter-at: 0;">0</span>
        <span class="ug-meter__mark" data-strata-value="30" style="--strata-meter-at: 0.25;">30</span>
        <span class="ug-meter__mark" data-strata-value="60" style="--strata-meter-at: 0.5;">60</span>
        <span class="ug-meter__mark" data-strata-value="90" style="--strata-meter-at: 0.75;">90</span>
        <span class="ug-meter__mark" data-strata-value="120" style="--strata-meter-at: 1;">120</span>
          </span>
          <span class="ug-meter__needle"></span>
          <span class="ug-meter__hub" data-strata-face="knob"></span>
        </span>
      </span>
    </span>
    <meter class="ug-meter__native" id="temperature" min="0" max="120" value="72" low="20" high="100" data-strata-unit=" °C" aria-valuetext="72 °C">72 °C</meter>
  </div>
  <label class="ug-meter__label" for="temperature">Temperature</label>
</div>
```

- The `.ug-meter` root (with `ug-meter--dial` and `ug-gauge`) is the boundary: refs, `class` and `style` reach it.
  `--strata-meter-value` (0–1) is the value's place, `--strata-meter-lo` and `--strata-meter-hi` the red zones' edges (set
  when `low` or `high` is given). The native `<meter>` is transparent and covers the whole object; `attachStrataMeters`
  (and `attachStrataGauges`, its Gauge entry point) from `@underglass/ui/dom` keeps the drawing and `aria-valuetext` in
  step with it.

## 8. Keyboard and screen reader

A Gauge has no keyboard interaction: it is not focusable and takes no input. Role `meter` (native), named by the legend,
with the value, minimum, maximum and `aria-valuetext` when a unit or a format gives one (the manual screen-reader script is
VAL-002's). Meaning never rides on colour alone: the needle's place against the printed scale gives the value, and the red
zone's extent is the scale's. Under forced colours and more contrast the needle, the scale and the zone band take the text
colour (the band as a `CanvasText` strip). A Gauge's **live value** goes through `driveStrataMeter(meter, value)`
(`@underglass/ui/dom`): at the Instrument level it writes nothing to the DOM, the value reaching the GPU as the needle's pose
(300 frames: 0 captures, 0 uploads, 0 hit-geometry updates), and the native `value` follows at a low rate for assistive technology;
at Relief and Objects the needle is captured content and the drawing's value is written each time.

## 9. CSS presentation

The relief recipe on the bezel (a metal gradient in the knob's colour, lit from the light), a round window with an inner
shadow, the printed scale (ticks and numerals at `calc()` angles on whole pixels), the zone band (a conic gradient masked to a
ring) and the needle turning with `--strata-meter-t`. The geometry is in container units (`cqw`), so a gauge scales with its
width and never exceeds its container: a 320 px viewport reflows. The window's padding and the numerals' radius grow with the
caption size, so 200% text keeps the numerals inside the dial. Forced colours, more contrast and reduced motion are the Meter's
([meter.md](meter.md#9-css-presentation)).

## 10. Tests

- **Plain DOM** (`ui-gauge.test.mjs`, real markup): role `meter`, name, value, range, zones and `aria-valuetext`; a written
  `value` turns the needle (`--strata-meter-value`) and the unit's `aria-valuetext`; every box and every size is as
  documented, and a grid of `elementFromPoint` over it finds the meter; 320 and 390 px; 200% text; axe in light and dark, face
  mode, forced colours and more contrast; reduced motion moves the needle at once.
- **GPU** (`ui-gauge.test.mjs`, DPR 1 and 2, Relief, Objects and Instrument): GPU stays on; at Instrument the scene is
  version 4 with a bezel, a window, a needle and a hub per gauge and the needle on `spring.gauge`; at 0, 25, 50, 75 and 100
  of the range and in flight the parts draw inside the boxes only (0 pixels outside) and native hits on every part pixel find
  the meter; a value change changes pixels in its box only; the printed scale under the glass is the capture itself (the faceplate
  pixels under the glass are the capture's colour to a level, and a needle at another value leaves the numerals it does not cross
  pixel for pixel the same); 300 frames of a live value add no capture, upload or
  hit-geometry update while the needle moves on its spring; reduced motion puts the needle on its target in the first
  frame; the accessibility snapshot is the same in DOM and GPU modes. Checked in a headful Canary window as well.
- **Bindings and Astro:** with the Meter's, `ui-meter-bindings.test.mjs` and `ui-meter-astro.test.mjs`.
- **Unit:** `strata-meter.unit.test.mjs`, with the Meter's: the dial's parts validated by core's `validateInstrumentScene` and
  contained over the whole travel (`checkContainment`).
- **Not yet:** a source prop (live audio), a low-end GPU, and the manual screen-reader script.
