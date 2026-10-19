# Select

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Chooses one value from a list. Renders a native `<select>` with `<option>` and `<optgroup>` children. The
WAI-ARIA [Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) covers custom selects; a
native `<select>` already provides the behaviour, so Tier A adds no ARIA. The browser opens its own list:
Tier A has no select popup and no overlay. A searchable custom listbox is a later component.

`multiple` and `size > 1` render a native list box, which keeps the browser's look and has no key. Tier A
styles only the single-line form. Label, help and error text come from [Field](field.md).

## 2. Object

A **key with a chevron**: the [Button](button.md) key shape, holding the current value and a chevron.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | As Button | `object.keyHeight` (8) | Down by `object.keyTravel` (6) while pressed |
| Key top | Captured face: value text on the left, chevron on the right | — | With the body |

The chevron is flat line art on the key top (section 10), not a separate mesh. The browser's list is outside
the object and is never drawn by the GPU.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key top | `field` | `text` | `field` (`matte`) |
| Chevron | — | `muted`, 3:1 or better | None |
| Key sides (Objects) | The top's colour, darkened by the bevel | — | Same as the top |

A placeholder option (a disabled first option with an empty value) uses the `muted` text role.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.raised` (3) | Key at `keyHeight` | Relief recipe at `raised` |
| Hover | `raised × state.hoverHeight` | Key rises `keyHeight / 4` | Larger shadow, `brightness(1.04)` |
| Pressed (`:active`) | `raised × state.pressHeight` | Key travels `keyTravel` | Smaller shadow |
| Focus-visible | Accent edge, `focus.width` | Emissive glow | `outline: focus.width solid accent` |
| Invalid (`aria-invalid="true"`) | `danger` edge and message | Same, on the key | `outline` in `danger` |
| Disabled | Height 0, content at 38% | Key flattened | Flat, content `opacity: 0.38` |

Selected and busy do not apply. A new value is a content change, so the face is captured fresh.

## 5. Relief primitives

One `raised` primitive: the `<select>` from its border box and `radius.control`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.field`, `colour.text`, `colour.muted`, `colour.danger` | — |
| `radius.control`, `elevation.raised`, `state.*` | — |
| `object.keyHeight`, `object.keyTravel`, `object.taper` | — |
| `material.roles.field` | `material` |
| `density` (control height), `space.*` | — |
| `font.size.body` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.press` | — |
| `target.min` | — |

## 7. DOM structure and overlay needs

```html
<select class="ug-select" data-strata-face="raised" id="size" name="size">
  <option value="" disabled selected>Choose a size</option>
  <option value="s">Small</option>
  <option value="m">Medium</option>
</select>
```

- The `<select>` is the boundary element. It uses `appearance: none`, and the chevron is a background image
  on the same element, so there is no wrapper.
- No overlay. The list is the browser's own and is not captured, themed or hit-tested by Strata.

## 8. Keyboard and screen reader

The native behaviour is kept in full.

| Key | Action |
| --- | --- |
| Alt+Down, Space, Enter | Open the list (browser dependent) |
| Up, Down | Change the value, or move in the open list |
| A letter | Jump to a matching option |
| Home, End | First or last option |
| Esc | Close the list |

- Role as the browser exposes it (`combobox` or `listbox`). The name comes from the `<label>` in
  [Field](field.md), or `aria-label`.
- `aria-invalid` and `aria-describedby` point at the Field error and help.
- `change` events are native.

## 9. CSS presentation

The `raised` recipe with trailing padding for the chevron. Minimum size is the density's control height and
never below `target.min` (24); the whole box opens the list. The page's `color-scheme` follows the theme so the
browser's list matches. Under `forced-colors`: `Field`, `FieldText` and a `ButtonBorder` outline; the chevron
uses `ButtonText`; no shadows.

## 10. Tests

- **Plain DOM:** keyboard changes the value and fires `change` once; the form submits the value; disabled
  and `required` behave natively.
- **GPU:** GPU stays active while the list opens and closes and the value changes; the face shows the new
  value in fresh pixels; a hit on the key reaches the `<select>`.
- **Accessibility:** axe in light, dark and high contrast; label association; chevron contrast of at least
  3:1; accessibility snapshot equal in DOM and GPU modes.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover and focus.

## 11. Hardware forms: `selector` and `display`

The same native select drawn as a [RotarySelector](rotary-selector.md)'s dial or as a [Display](display.md) with two step buttons
([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level), [design language section 6](../design-language.md#instrument-object-table)):
`form` (prop) or `data-strata-form` (on the drawn root) chooses `selector` or `display`. Without it, or with `flush`, the Select is the key with a
chevron above, in the markup and the look it had before, at every level; the premium character's default form, `selector`, is reached by naming it (as the
Slider's `fader` is), so a page that does not opt in is unchanged. Sections 1, 6 and 8 hold: the native `<select>` is the control, with its `name`, `form`
owner, `value`, `required`, `id`, Field wiring, every native key, type-ahead and the browser's own list (which no form draws), and the accessibility
snapshot is the same with and without the form. `multiple` (a list box) is always the flush control.

```html
<div class="ug-rotary" data-strata-form="selector" style="--strata-rotary-value: 0.5;">
  <div class="ug-rotary__dial">
    <span class="ug-rotary__scale" aria-hidden="true">
      <span class="ug-rotary__mark" data-strata-value="sine" data-strata-selected="false" style="--strata-rotary-at: 0;"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">Sine</span></span>
      <span class="ug-rotary__mark" data-strata-value="saw" data-strata-selected="true" style="--strata-rotary-at: 0.5;"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">Saw</span></span>
      <span class="ug-rotary__mark" data-strata-value="square" data-strata-selected="false" style="--strata-rotary-at: 1;"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">Square</span></span>
    </span>
    <span class="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true">
      <span class="ug-rotary__cap" data-strata-face="raised"><span class="ug-rotary__pointer"></span></span>
    </span>
    <select class="ug-rotary__select" id="wave-example" name="wave" aria-label="Wave">
      <option value="sine">Sine</option>
      <option value="saw" selected>Saw</option>
      <option value="square">Square</option>
    </select>
  </div>
  <ol class="ug-rotary__legend" aria-hidden="true">
    <li data-strata-selected="false">Sine</li>
    <li data-strata-selected="true">Saw</li>
    <li data-strata-selected="false">Square</li>
  </ol>
</div>
```

```html
<span class="ug-select-display" data-strata-form="display">
  <button type="button" class="ug-button ug-push ug-select-display__step ug-select-display__step--previous" tabindex="-1" aria-hidden="true" data-strata-form="momentary" data-strata-step="-1">
    <span class="ug-push__object" aria-hidden="true"><span class="ug-push__bezel" data-strata-face="raised"></span><span class="ug-push__socket"></span><span class="ug-push__ring"></span></span>
    <span class="ug-push__cap" data-strata-face="raised"><span class="ug-select-display__glyph"></span></span>
  </button>
  <span class="ug-display ug-display--input ug-select-display__window" data-strata-form="display">
    <span class="ug-display__object" aria-hidden="true"><span class="ug-display__bezel" data-strata-face="groove"><span class="ug-display__window" data-strata-face="flat"></span></span></span>
    <select class="ug-display__text ug-select-display__select" id="preset-example" name="preset" aria-label="Preset">
      <option value="init">Init</option>
      <option value="warm-pad" selected>Warm Pad</option>
      <option value="glass-bell">Glass Bell</option>
      <option value="sub-bass">Sub Bass</option>
    </select>
  </span>
  <button type="button" class="ug-button ug-push ug-select-display__step ug-select-display__step--next" tabindex="-1" aria-hidden="true" data-strata-form="momentary" data-strata-step="1">
    <span class="ug-push__object" aria-hidden="true"><span class="ug-push__bezel" data-strata-face="raised"></span><span class="ug-push__socket"></span><span class="ug-push__ring"></span></span>
    <span class="ug-push__cap" data-strata-face="raised"><span class="ug-select-display__glyph"></span></span>
  </button>
</span>
```

- **`selector` is the RotarySelector's.** The markup is [`RotarySelector`](rotary-selector.md)'s, with the Select's own `<select>` as its select and no legend
  title (the Field's label, or `aria-label`, names it), so the CSS, the behaviour (`attachStrataRotarySelectors`: the vertical drag, ring click-to-set, cap taps,
  wheel, and the native popup on the keys) and the GPU helper at Relief, Objects and Instrument are the RotarySelector's, unchanged: the skirt, the cap and the
  pointer on `spring.detent`, one printed position and one detent per `<option>`. A change of option is a uniform update (the pointer turns on its spring) plus
  the capture core makes of the native `input`, as for the Knob. The root is a size container as wide as its dial, and the labels print as numbers with a legend
  under the dial where it is narrow, as the RotarySelector's do.
- **The limit, and the rule that decides.** A dial's labels sit on a 270° arc, which fits about eight short words. A `selector` is drawn as a `selector`
  for **up to 8 options with labels of at most 12 characters and no `<optgroup>`**; otherwise it is **drawn as a `display`**, which keeps the hardware face and
  scales to any list, and `data-strata-form` says which was drawn. So are options a binding cannot read (a component that renders them: there are no labels to
  print), and a select with no `<option>`. A list box (`multiple`) is the flush control. The rule is one function (`selectFormFor`, `shared/select-forms.ts`), shared
  by every binding.
- **`display` is a Display** (the TextField's [display form](text-field.md#11-the-display-form): the bezel, the window and the backlight, CSS and GPU alike) whose
  native element is the Select's own `<select>` (`.ug-display__text`, `appearance: none`): the selected option's label is the window's text, printed under the glass and
  captured with the face, so a change of option is one capture of the text (as typing is in the TextField's display), and the glass never shades it (the finish zone
  stays off, as for an input). The native list opens from the window (a click, Alt+Down, F4, Space), the browser's own. A chevron is printed on the glass at its end.
- **Step buttons.** Two [momentary push buttons](button.md#11-push-button-form-momentary) (the PushButton's CSS, behaviour and GPU drawing: a machined cap with a lit
  ring, a size smaller) stand either side, previous (`data-strata-step="-1"`) and next (`"1"`). A click selects the previous or next *enabled* option through
  `selectedIndex` (across optgroups), then `input` and `change` fire on the select, as a native choice does (`attachStrataSelectDisplays`, `stepStrataSelect`); at the
  end of the list nothing changes and nothing fires (the select does not wrap). A press keeps the focus where it is, and the select takes it after the step, so the
  arrow keys carry on. Holding a button is a uniform write (the ring's emitter, the cap's travel): no capture, no hit-geometry update.
- **ARIA, decided.** The select is the control, so the step buttons are **`aria-hidden="true"` with `tabindex="-1"`**: they duplicate the arrow keys the native select
  already has (the WAI-ARIA practice is not to repeat a control's own increment keys as extra tab stops), and hiding them keeps the tab order and the accessibility
  tree exactly the select's alone (`aria` unchanged). They are a pointer's way to step without opening a list, and the single-pointer alternative to the drag the
  selector needs; a disabled select disables them.
- **Props.** `form`, and for a selector `sweep` (the cap's turn, `knob.sweep` by default). `class` and `style` reach the drawn root and every other attribute the select;
  `size`, `material` and `level` go on the root. React and Vue are controlled with `value` and `onChange` (`v-model`), or uncontrolled with `defaultValue`; Astro takes
  `options` with `value`, or `<option>`s in the slot (which hold their own `selected`).
- **`form` is also the native attribute** (the id of the select's form owner). `selector`, `display` and `flush` are the form names and never an owner; any other string is
  the owner, as before, on the flush select. A drawn form has no owner prop: put the select in its `<form>`.
- **Presentations.** Relief and Objects draw the selector, the display and the buttons as the RotarySelector, the Display and the PushButton do; the Instrument level draws the
  parts of all three. Forced colours, more contrast, reduced motion and reduced transparency are theirs.

**Tests.** `ui-select-forms.test.mjs` (plain DOM, touch at 390 and 320 px, preferences, GPU at Relief, Objects and Instrument at DPR 1 and 2),
`ui-select-forms-bindings.test.mjs` (React and Vue), `ui-select-forms-astro.test.mjs`.
