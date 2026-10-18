# RotarySelector

Instrument, wave 2 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Picks one option from a short list by turning, as on a mixer's input selector or a synth's waveform switch: a filter
type, a source, a mode. Renders a native `<select>` that covers a printed dial, with one hard detent per `<option>`.
There is no WAI-ARIA pattern to follow beyond the native one: the `<select>` has the role (`combobox`, a listbox in
the browser's popup), the value, the keys, type-ahead and form participation; Strata adds the round pointer behaviour
(section 8), the knob that turns to the chosen option, and the options' labels printed round it.

**Decision (the plan left it open): a `<select>`, not a radio group.** The plan lists the RotarySelector as a `<select>`
whose "native popup stays in the overlay host, as Select does today", and a radio group presented as a selector is the
[RadioGroup](radio.md)'s `selector` form (a later phase). A `<select>` is one tab stop with one value, submits as one
form field and names its options by text, which is what a hardware selector is. Use it for two to about eight options;
for a long list use [Select](select.md) or [Combobox](combobox.md), and for a continuous value use [Knob](knob.md).

## 2. Object

A **machined knob on a printed faceplate**, as the [Knob](knob.md): a skirt, a cap on it with an engraved pointer, and the
positions printed on the face round it, each with a tick and its label. The pointer does not sweep freely: it stands on
one position at a time, and a change turns it to the next on `spring.detent` (design language section 12).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Dial (the native box) | The root's width (at most 2 × (the skirt's radius + 12 px + 5 em), 208 px at the medium size) and 2 × (that radius + 1.5 em) high | 0 | No |
| Scale | One mark per option: a tick at r + 2 to r + 8 (1.6 × 6 px) and the label printed upright from r + 12, on the side its angle faces, up to 6 em wide (wraps) | 0 | No |
| Skirt, cap, pointer | As the Knob's: Ø `size.rotary` (48, 64 or 80), the cap 0.8 of it, the pointer 2.2 px wide | As the Knob's | The pointer turns to the selected position |
| Legend | The select's label, printed under the dial; when the dial is narrow, a numbered list of the options above it | 0 | No |

- **Positions.** Option *i* of *n* sits at fraction *i* / (*n* − 1) of the sweep (`knob.sweep`, 270° by default, or the
  `sweep` prop) from the first at −135° to the last at +135°, 0° at the top and clockwise; a lone option sits at the top. The
  pointer's angle is `--strata-rotary-value` × the sweep − sweep / 2. A disabled option keeps its place and is printed at 45%;
  nothing selects it. The selected option's print is `colour.text`, the others `colour.muted`.
- **Only the pointer turns,** as on the Knob: the skirt and the cap keep their boxes at every position, so their faces never
  change size, and every part lies inside the dial at every position.
- **At the Instrument level** (`data-strata-level="instrument"`) the selector is the Knob's object, built by
  [`gpu/instrument.ts`](../../../packages/ui/src/gpu/instrument.ts) (`knobObject`) from the laid-out skirt and cap, with the
  select's box as `bounds` and `t` the selected position's place along the sweep. The detent spring (`spring.detent`, 900 /
  42, fixed 4 ms steps, instant under reduced motion) turns the pointer to the chosen position as uniform updates: no capture
  and no hit-geometry update, however many positions it passes. The printed positions stay on the face.

## 3. Faces and materials

As the [Knob](knob.md#3-faces-and-materials): the skirt and the cap are `knob` (`satin`); the pointer and the ticks are
printed; the labels are `muted`, the selected one `text`; the legend is `text`. The pointer keeps at least 3:1 against the
cap in every theme. `data-strata-material` on the selector overrides the skirt's and the cap's material.

## 4. Elevation per state

As the [Knob](knob.md#4-elevation-per-state), with *value change* meaning a new position: the pointer turns to it and the
selected print changes (captured content, so fresh pixels), and at the Instrument level the parts turn on the detent spring.
Selected and busy do not apply. Invalid draws a 2 px `danger` ring on the skirt.

## 5. Relief primitives

As the Knob: two `raised` faces, the skirt and the cap, both round, the cap inside the skirt (two `slab`s at the Objects
level). The `<select>` carries no `data-strata-face` (a select with one is drawn as a Select's key); the skirt and the cap take its
hover and disabled state.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.rotary` (48, 64, 80, `--strata-rotary-size`) | `size` |
| `knob.sweep` (270), `knob.dragPx` (200), `knob.fine` (0.1), `knob.tapSlop` (4) | `sweep` (per selector, `--strata-knob-sweep`) |
| `colour.knob`, `colour.edge`, `colour.text`, `colour.muted`, `colour.accent` (focus), `colour.danger` (invalid) | — |
| `elevation.raised`, `state.*`, `interior.max`, `bevel.*`, `shadow.*`, `light.azimuth` | — |
| `material.roles.knob` | `material` |
| `font.size.caption` (labels), `font.size.small` (legend), `font.weight.strong`, `space.1` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `spring.detent` | — |
| `feedback.tick.*`, `feedback.sound`, `feedback.haptics` | — |
| `level` | `level` |

`size.rotary` is this page's (the Knob's sizes, †, provisional). Props: `label` (the legend), `options` (`{ value, label,
disabled? }` in order round the dial), `value` / `defaultValue` (an option's `value`; or `v-model`), `sweep`, `id`, `name`,
`form`, `required`, `invalid`, `disabled`, and in React `selectRef` (Vue exposes `root` and `select`). Inside a Field it takes
the Field's id, description, invalid and disabled state.

## 7. DOM structure and overlay needs

```html
<div class="ug-rotary" style="--strata-rotary-value: 0.5;">
  <div class="ug-rotary__dial">
    <span class="ug-rotary__scale" aria-hidden="true">
      <span class="ug-rotary__mark" data-strata-value="lp" data-strata-selected="false" style="--strata-rotary-at: 0;"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">LP</span></span>
      <span class="ug-rotary__mark" data-strata-value="hp" data-strata-selected="true" style="--strata-rotary-at: 0.5;"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">HP</span></span>
      <span class="ug-rotary__mark" data-strata-value="bp" data-strata-selected="false" data-strata-disabled="true" style="--strata-rotary-at: 1;"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">BP</span></span>
    </span>
    <span class="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true">
      <span class="ug-rotary__cap" data-strata-face="raised"><span class="ug-rotary__pointer"></span></span>
    </span>
    <select class="ug-rotary__select" id="filter" name="filter">
      <option value="lp">LP</option>
      <option value="hp" selected>HP</option>
      <option value="bp" disabled>BP</option>
    </select>
  </div>
  <ol class="ug-rotary__legend" aria-hidden="true">
    <li data-strata-selected="false">LP</li>
    <li data-strata-selected="true">HP</li>
    <li data-strata-selected="false">BP</li>
  </ol>
  <label class="ug-rotary__label" for="filter">Filter</label>
</div>
```

- The `.ug-rotary` root is the boundary and a size container: React and Vue refs, `class` and `style` reach it.
  `--strata-rotary-value` (0–1) turns the pointer; a `sweep` prop adds `--strata-knob-sweep`. The behaviour keeps
  `--strata-rotary-value` and every `data-strata-selected` in step with the selected option; call
  `syncStrataRotarySelector(select)` after setting `value` or `selectedIndex` from script.
- The select is transparent (`appearance: none`, `color: transparent`, `touch-action: none`) and covers the whole dial, above the
  drawn parts, which take no pointer events: every press lands on the original control. Its options take the page's colours in
  the native popup.
- A mark is an overlay at its angle: its tick (`__tick`) and its label (`__text`), both decoration. The legend (`ol`, decoration,
  hidden unless the dial is narrow) repeats the labels in order; the select's own options are what a screen reader reads.
- The legend line is a `<label for>` printed under the dial. No overlay: the native popup is the browser's.

## 8. Keyboard and screen reader

| Input | Action |
| --- | --- |
| Up, Left / Down, Right | Previous / next option (native; the select changes without opening) |
| Home, End, a typed letter | First, last, the next option beginning with it (native) |
| Alt+Down, F4, Space | Opens the native popup, which stays the browser's |
| Vertical drag (mouse, pen or touch) | `knob.dragPx` (200) per full sweep, up moves to the next option; `× knob.fine` (0.1) with Shift; snaps to the nearest enabled option; a press moving under `knob.tapSlop` (4) is a tap |
| Tap on the ring or a printed label | Selects the option nearest the pressed angle (0° at the top, clockwise over the sweep; the bottom gap goes to the nearer end) |
| Tap on the skirt or cap | Steps to the next enabled option on the upper half, the previous on the lower half (the single-pointer alternative, WCAG 2.5.7) |
| Wheel over the dial | One option per wheel notch (touchpads add up to one); the page does not scroll. Ctrl+wheel zooms as usual |
| Tab, Shift+Tab | Move focus (native order) |

- Role `combobox` (the native select, named by the legend), with the selected option as its value; the popup's options have
  role `option`. The printed marks, the legend and the dial's parts are `aria-hidden`.
- A press with the pointer never opens the popup (`pointerdown` is cancelled, as the Knob does for the range); the press focuses the
  select. Every change goes through `selectedIndex`, then `input` and `change` fire on the select once per option passed to, as a
  native choice does, so forms and bindings see native events. The behaviour is `attachStrataRotarySelectors` from
  `@underglass/ui/dom` (one set of delegated listeners per document, among them the blocking document-level wheel listener);
  `attachStrata` and the React, Vue and Astro components attach it.
- `disabled` uses the native attribute, which removes the selector from the tab order and from the pointer behaviour; a
  disabled `<option>` is skipped by every gesture and by the keys.

## 9. CSS presentation

The Knob's recipe on the skirt and the cap, and the positions printed by `sin()` and `cos()` from `--strata-rotary-at`: ticks
rotated about the dial's centre, labels placed on one radius (r + 12) with the anchor following the side, so a label on the right
starts at its point and a label on the left ends at it, and the top and bottom ones centre on it. In face mode the faces are
flat `colour.knob` and the GPU paints the relief. The dial is at least 108 px high, far above `target.min` (24).

- **Reflow:** the root is as wide as its dial, at most 208 px at medium, and never wider than its container, so it fits a 320 px
  viewport. Below 104 px + 7 em of width (a narrow container, or text at 200%: the labels would not fit round the knob) the
  positions are printed as numbers on the dial and the labels move to the numbered legend under it (`@container`); nothing is
  lost and nothing overflows. The radius and the dial grow with the caption size.
- **`forced-colors: active`:** `Canvas` skirt and cap with a 1 px `CanvasText` border, the pointer, ticks, labels and legend
  `CanvasText`, focus a `Highlight` ring, `GrayText` when disabled.
- **`prefers-contrast: more`:** the pointer and the labels take `colour.text`, and the skirt and cap an `edge` border.
- **`prefers-reduced-motion: reduce`:** the detent settle is off; the pointer turns at once.
- **Feedback** ([design language section 20](../design-language.md#20-feedback)): a selector plays `tick` as a change moves the
  pointer to another position (one per change, however many positions it passes; the Knob's rule). Sound and haptics are both off
  by default (`feedback.sound`, `feedback.haptics`, or `attachStrataFeedback`), so nothing plays unless the application or a
  scope turns them on.

## 10. Tests

- **Plain DOM** (`ui-rotary-selector.test.mjs`, real select): ring clicks on printed labels select their options; cap taps step
  to the next enabled option and back; drag with and without Shift; the wheel steps and the page does not scroll; native keys and
  type-ahead; a disabled option is never selected by any gesture; `input` and `change` fire once per option; the form submits the
  value; touch taps and a touch drag (Playwright touch emulation); 320 and 390 px viewports (no horizontal overflow, targets at
  least 24 px, print inside the viewport); 200% text (labels or the numbered legend: nothing overlaps or leaves the dial); axe in
  light, dark and face mode; forced colours; reduced motion.
- **GPU** (`ui-rotary-selector.test.mjs`, DPR 1 and 2, Relief, Objects and Instrument): GPU stays active through every
  change; at every option position the selector's parts and nothing else change pixels, and every pixel they draw lies inside the
  dial; native hits over the dial land on the select (0 mismatches); a real change changes pixels inside the dial only; the
  detent snap adds 0 captures and 0 hit-geometry updates at the Instrument level while frames are moving; the accessibility
  snapshot is the same in DOM and GPU modes.
- **Feedback:** off by default; with haptics on, one pulse per change by the visitor's own gesture, none by script.
- **Bindings** (`ui-rotary-selector-bindings.test.mjs`, `ui-rotary-selector-astro.test.mjs`): React, Vue and Astro render the
  markup above; controlled and uncontrolled values, `onValueChange` / `v-model`, the root ref, `class` and `style`, a Field.
- **Unit** (`strata-rotary-push.unit.test.mjs`): the position and angle maths and the markup model; the selector's object
  (the Knob's) validated by core's `validateInstrumentScene` and contained.
