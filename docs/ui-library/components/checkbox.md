# Checkbox

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Turns one option on or off, independently of other options. Renders a native `<input type="checkbox">` with
a `<label>`, following the WAI-ARIA [Checkbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/).
The mixed state uses the native `indeterminate` property, which the browser exposes as `aria-checked="mixed"`.
A control that applies a setting at once, like a light switch, is a [Switch](switch.md).

A set of related checkboxes goes in a `<fieldset>` with a `<legend>`. Tier A has no separate CheckboxGroup.

## 2. Object

A **small well** with a **raised mark** when checked. The well's base is the input's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | Rounded box (`radius.small`) sunk by `elevation.well` (2) | −`elevation.well` | No |
| Check mark | Check glyph raised in the well, inset `object.taper` from the box edge | `elevation.raised` (3) | Rises from the well floor on check, sinks on uncheck |
| Indeterminate mark | A horizontal bar, same height and inset | `elevation.raised` | As the check mark |

The input's border box is `size.indicator` square: 16, 20 (default) or 24 px for `data-strata-size` small,
medium or large (section 13). At large it meets the target size on its own; at every size the label row is at least `target.min` (24) high and covers the whole row, so the row is the target (WCAG 2.5.8). The well fills the whole box and the mark stays inside the inset, so every drawn pixel
is inside the native element (the footprint rule).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Well floor, unchecked | `field` | — | `field` (`matte`) |
| Mark (checked or mixed) | `accent` | — | `indicator` (`emissive`) |
| Well outline | `edge`, 1 px | — | None |
| Label | None (sits on the panel) | `text` | None |

The well's `edge` outline keeps its shape at 3:1 against the panel, and the mark against the well floor keeps
at least 3:1 (non-text contrast, section 8). `data-strata-material` on the input
overrides the well material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, unchecked | Well at `−elevation.well`; no mark | Empty well | Inset shadow |
| Hover | Interior `+state.hoverLift` (clamped by `interior.max`) | Same | `brightness(1.04)` |
| Pressed (`:active`) | Interior `−state.pressSink` | Same | `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, outside the box | Emissive glow on the well | `outline: focus.width solid accent` |
| Checked or mixed | Mark `emissive` at `elevation.raised`, `motion.fast` | Mark rises | Accent fill with a white mark |
| Disabled | Well and mark at height 0, content at 38% | Flattened to the face | Flat, `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on the well | Same | `outline` in `danger` |

Busy does not apply. Under `prefers-reduced-motion`, the mark appears with no rise.

## 5. Relief primitives

Two: the `<input>` is a `well` (`radius.small`); the check or bar is a `mark`, shown when `:checked` or
`:indeterminate`. The mark is drawn from a child `<span data-strata-face="mark">`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.field`, `colour.edge`, `colour.accent`, `colour.text`, `colour.danger` | — |
| `radius.small` | — (theme or scope) |
| `elevation.well`, `elevation.raised`, `object.taper`, `state.*`, `interior.max` | — |
| `material.roles.field`, `material.roles.indicator` | `material` |
| `target.min` (box size), `density` (label row height), `space.*` | — |
| `font.size.body` | — |
| `focus.width`, `focus.offset`, `motion.fast` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<label class="ug-checkbox">
  <input class="ug-checkbox__input" data-strata-face="well" type="checkbox" name="news" />
  <span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span>
  <span class="ug-checkbox__label">Send me the newsletter</span>
</label>
```

- The `<input>` is the boundary element (`appearance: none`, `size.indicator` square). Refs and `checked` reach it.
- The wrapping `<label>` extends the hit target: the whole row, at least the density's control height tall,
  toggles the input. The mark is `pointer-events: none` and lies over the input.
- `indeterminate` is set as a property on every render (it has no attribute). A click clears it and toggles
  `checked`, as native.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Space | Toggle (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `checkbox` (native). Name from the label text; state from `checked` and `indeterminate`.
- A single checkbox with help or error text uses `aria-describedby` through [Field](field.md) without a
  `label`. A group's question is the `<legend>`.
- Space is the only toggle key; Enter submits a form, as native.

## 9. CSS presentation

The `well` recipe at `radius.small`, with the mark as an inline SVG or masked shape in `accent`. The box
is `size.indicator` square and the row is at least the density's control height and never under 24. Under `forced-colors`:
`Field` background, a `ButtonBorder` border, the mark in `FieldText`, `GrayText` when disabled, and a
`Highlight` focus outline. The mark's shape, not its colour, shows the state, so it survives.

## 10. Tests

- **Plain DOM:** click on the box and on the label toggles once; Space toggles; `indeterminate` shows and a
  click clears it; form data includes the value only when checked; disabled does not toggle.
- **GPU:** at Relief and Objects, GPU stays active through check, uncheck and indeterminate; pixels are fresh
  after each (mark present or gone); a hit at the box's edge pixel and on the label reaches the input.
- **Accessibility:** axe on all states, in light, dark and high contrast; accessibility snapshot equal in DOM
  and GPU modes (`checked`, `mixed`); focus ring in decoded pixels; mark contrast against the lit well floor.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, checked and mixed.

## 11. Latching form: `latching`

Instrument, everyday forms ([plan](../instrument.md#everyday-components-at-the-instrument-level)). `form="latching"` draws the same native
checkbox as a **small latching square button**: a key on a polished bezel with a lit ring, that goes down and lights when the box is
checked. It is the [ToggleButton's latching push button](toggle-button.md#11-push-button-form-latching) in the shape of a checkbox, with
no LED (the ring is the light), and it reuses that button's host class, numbers, spring and emitters. `flush`, or no `form`, is the checkbox
above, in the markup and the look it had before, pixel for pixel; any other `form` string is the native `form` attribute (the id of the
input's form owner), as before. `colour` names the ring's role (`glowOn` by default). As with the Switch's hardware forms, the premium character's default form is reached by naming it: with no `form` the control is its flush look, so a page that does not opt in is unchanged.

| Part | Shape | Moves |
| --- | --- | --- |
| Box | A square: the cap (`size.indicator`: 16, 20 or 24 px) plus 22 px, so 38, 42 or 46 px, at least `target.min`; the native `<input>` covers it, square, as an invisible overlay | No |
| Bezel | A rounded square of polished metal, inset 4 px (the bloom's halo), 3.2 high at 50% depth, 7 px of metal round the cap at `radius.small` | No |
| Ring | The lit ring under the cap, a glass plate 0.5 px on the bezel of which the cap leaves 2.6 px showing | Lit 0 to 1 by `--strata-lit` |
| Cap | A square body in the secondary face colour, `radius.small`, 6 high (taper 0.6), carrying the printed mark | Travel 4 px at 50% depth: 1.8 (0.45) while checked, 4 while held, 0.8 (0.2) while mixed, 0 at rest |

- **State and cues.** Checked: the ring is lit, the cap rests at 0.45 of its travel and a **check** is printed on it. Mixed
  (`indeterminate`, a property with no attribute): the ring is half lit, the cap rests at 0.2 and a **dash** is printed on it. Held (the
  pointer down on the key or its label, or Space down on the key): the ring is lit and the cap all the way down. Unchecked: dark and up. Light is never the only
  cue: the cap is down, the mark is printed, and `checked` and `aria-checked="mixed"` are native. A **disabled** checkbox is never held and
  never lit, and a checked one keeps its place (the cap down, the mark at 38%), so it still says what it is set to.
- **The native control stays the control.** The `<input type="checkbox">` is the host's first child, covering the key (`opacity: 0`,
  `z-index: 1`), so every press and every key lands on it. A click on the label toggles it once (the label's text also holds the key down while pressed).
  Refs, `checked`, `indeterminate`, `name`, `value`, `form`, `required`, form data and `change` are the native checkbox's.
- **Emitters.** The ring is an emitter at every GPU level (`emitter.pushButton.*`, 2,400 at the 40 px reference cap, so 600 at the 20 px
  cap, reach 4 cap diameters), lit by `--strata-lit`; checking is a uniform write. A panel with latching checkboxes takes a version 4 scene
  with its `emitters`, the `protected` rects of its text and a `feather`, so a label beside a lit key keeps the contrast guard.
- **GPU.** Relief draws the bezel and the cap as raised faces, Objects as a slab and a key; at the Instrument level the checkbox is the
  push button's object (`pushObject`): a polished bezel, a glass ring, a body and a captured cap travelling 4 px on the CSS throw
  (`--strata-push-t`, `spring.button`), every part and shadow inside the 38 to 46 px box.
- **Presentation.** Under `prefers-contrast: more` and the contrast themes: flat colour, no glow, edges in the text colour. Under
  `forced-colors`: a Canvas bezel and ring with `ButtonText` borders, `Highlight` when lit, `GrayText` when disabled, and the mark in `Highlight`.
  Reduced motion: lights and travel change at once. Under `prefers-reduced-transparency` the ring is opaque lacquer. At 200% text the label
  wraps and the row grows; the key keeps its size.

```html
<label class="ug-checkbox" data-strata-form="latching">
  <span class="ug-push ug-latch ug-latch--key" data-strata-colour="info">
    <input class="ug-checkbox__input" type="checkbox">
    <span class="ug-push__object" aria-hidden="true">
      <span class="ug-push__bezel" data-strata-face="raised"></span>
      <span class="ug-push__socket"></span>
      <span class="ug-push__ring"></span>
    </span>
    <span class="ug-push__cap" data-strata-face="raised" aria-hidden="true"><span class="ug-checkbox__mark"></span></span>
  </span>
  <span class="ug-checkbox__label">Phantom power</span>
</label>
```

- `attachStrataPushButtons` (`attachStrata`, or the bindings, once a latching form mounts) adds only the held state (`data-strata-down` on the
  host) and the feedback: `click` once per real `change` (never for a script's assignment), where feedback is on (off by default).
  React: `<Checkbox form="latching" colour="info">`; Vue: the same props with `v-model`; Astro: `<Checkbox form="latching" colour="info">`.
- **Tests:** `ui-latching-forms.test.mjs` (plain DOM, touch, reflow, preferences, GPU at Relief, Objects and Instrument, feedback),
  `ui-latching-forms-bindings.test.mjs`, `ui-latching-forms-astro.test.mjs`.
