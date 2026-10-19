# SegmentedControl

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

One choice from two to five short, mutually exclusive options shown side by side, where the choice changes a view at
once (Day, Week, Month; List, Grid). Native radios in a `<fieldset>`, so it follows the WAI-ARIA
[Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) natively: one tab stop, arrow keys move the
selection, and the value takes part in a form. Each radio is visually hidden over its key, so the key is the radio's
hit area. For longer options, or more of them, use a [RadioGroup](radio.md) or a [Select](select.md); for actions, a
[ButtonGroup](button-group.md); for panels of content, [Tabs](tabs.md).

## 2. Object

**Keys on one plinth**, as a [ButtonGroup](button-group.md): the selected key is held down, as a pressed
[ToggleButton](toggle-button.md).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Plinth | `ug-segmented__plinth`: a rounded box `space.2` larger than the keys, in `panel` colour | Flat (on its panel) | No |
| Key | A button-sized key, `radius.control` | `elevation.raised` | Rises on hover, travels on press; the selected key stays down |

Each key is at least `target.min` (24 px) high and wide (WCAG 2.5.8).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key | `secondary` | `text`, strong | `control` |
| Selected key | `accent` at 16% over `secondary`, with a 3 px `accent` strip along the bottom | `text` | `control` |

The selected key is held down, tinted and marked by its strip: never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Key at `elevation.raised` | Key | Relief recipe at `raised` |
| Hover | Height × `state.hoverHeight` | Key rises | Larger shadow |
| Pressed | Height × `state.pressHeight` | Key travels | Smaller shadow |
| Selected (`:checked`) | Held at `state.pressHeight`; tint and strip | Key held down | Tint and strip |
| Focus-visible | `outline: focus.width solid accent` on the key | Same | Same |
| Disabled | Height 0, label at 38% | Flattened | Flat, 38% |

## 5. Relief primitives

One `raised` primitive per key (`.ug-segmented__key`), from its border box. Its state comes from the radio in its
label: hover from the label, pressed from `:active` or `:checked`, focus from the radio's `:focus-visible`. At the
Objects level each key is a key object. The plinth is flat.

## 6. Tokens it reads

`colour.secondary`, `colour.accent`, `colour.panel`, `colour.text`, `elevation.raised`, `radius.control`,
`space.2`, `control.height`, `target.min`, `font.weight.strong`, `state.*`, `focus.*`, `motion.fast`.

## 7. DOM structure and overlay needs

```html
<fieldset class="ug-segmented">
  <legend class="ug-segmented__legend">View</legend>
  <div class="ug-segmented__plinth">
    <label class="ug-segmented__item">
      <input class="ug-segmented__input" type="radio" name="view" value="day" checked>
      <span class="ug-segmented__key" data-strata-face="raised">Day</span>
    </label>
    <label class="ug-segmented__item">
      <input class="ug-segmented__input" type="radio" name="view" value="week">
      <span class="ug-segmented__key" data-strata-face="raised">Week</span>
    </label>
    <label class="ug-segmented__item">
      <input class="ug-segmented__input" type="radio" name="view" value="month" disabled>
      <span class="ug-segmented__key" data-strata-face="raised">Month</span>
    </label>
  </div>
</fieldset>
```

- The `<legend>` names the group, above the plinth (a fieldset's legend is not laid out with its other children, so the
  keys sit in their own row); `ug-segmented__legend--hidden` hides it visually and keeps it for assistive
  technology, for a control whose label is shown elsewhere.
- The bindings take `options` (`{ value, label, disabled }`), `value` or `defaultValue`, a change callback, `name`
  (generated when absent) and `disabled` (on the fieldset).
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Moves to the selected key (or the first, when none is selected) and out of the group |
| Arrow keys | Select the next or previous enabled option, wrapping |
| Space | Selects the focused option |

- Announced as a radio group named by the legend, each key as "Day, radio button, checked, 1 of 3".

## 9. CSS presentation

The plinth is an inline flex row in `panel` colour with `space.2` padding and gaps; keys use the button recipe, and the
selected key the latched ToggleButton's. Under `forced-colors` keys have a `ButtonBorder` outline and the selected
key is `Highlight`.

## 10. Tests

- **Bindings:** matches this markup; arrow keys and clicks select and report the value; a disabled option is skipped;
  the value is submitted with a form; each key is at least 24 px.
- **GPU:** each key is a raised primitive (a key object at Objects); the selected key is held down; a real click on
  another key selects it, and GPU stays on.

## 11. Latching form: `latching`

Instrument, everyday forms ([plan](../instrument.md#everyday-components-at-the-instrument-level)). `form="latching"` draws the same native radios as
**interlocking latching buttons on one plinth**: the [RadioGroup's preset bank](radio.md#11-latching-form-the-preset-bank-bank) with a segmented
control's short options, the selected segment down with its LED lit. The plinth is a single part, and the keys are the bank's, one construction with the [Tabs' rail](tabs.md#11-rail-form-rail) (`gpu/instrument-bank.ts`). `flush`, or no `form`, is the control above, in the
markup and the look it had before, pixel for pixel; any other `form` string is the native `form` attribute of the fieldset, as before. `colour` names the
LEDs' role (`glowOn` by default). As with the Switch's hardware forms, the premium character's default form is reached by naming it: with no `form` the control is its flush look, so a page that does not opt in is unchanged.

| Part | Shape | Moves |
| --- | --- | --- |
| Plinth | `ug-segmented__plinth ug-bank__plinth`: one polished part, 2.4 high at 50% depth, 2 px larger than the keys all round; the fieldset has 8 px of padding for its shadow | No |
| Segment | The bank's key: a cap (28, 34 or 40 px high, `radius.control`) on a 5 high body with the captured label; box = cap + 6 px each side and 14 above | Travel 4 px at 50% depth: 0.45 while selected, 1 while held, 0 at rest |
| LED | A 6 px lens on the plinth above the cap | Lit while selected |

- Everything the bank does (the native radio group, Tab, the arrow keys, one `change` per real selection, the lights, the emitters, the GPU at every level,
  the preferences, reflow, feedback) is the [RadioGroup bank's](radio.md#11-latching-form-the-preset-bank-bank); only the markup differs, as the
  keys sit directly on the existing `ug-segmented__plinth` and carry the `ug-segmented__key` class on their caps.
- The selected segment's flush look (an accent underline and tint) is replaced by the key's travel and its LED; there is no ring.

```html
<fieldset class="ug-segmented" data-strata-form="latching">
  <legend class="ug-segmented__legend">View</legend>
  <div class="ug-segmented__plinth ug-bank__plinth" data-strata-face="raised">
    <label class="ug-segmented__item">
      <span class="ug-push ug-latch ug-latch--bank">
        <input class="ug-segmented__input" type="radio" name="view" value="day">
        <span class="ug-push__object" aria-hidden="true">
          <span class="ug-push__led-socket"></span>
          <span class="ug-push__led"></span>
        </span>
        <span class="ug-push__cap ug-segmented__key" data-strata-face="raised">Day</span>
      </span>
    </label>
    <label class="ug-segmented__item">
      <span class="ug-push ug-latch ug-latch--bank">
        <input class="ug-segmented__input" type="radio" name="view" value="week">
        <span class="ug-push__object" aria-hidden="true">
          <span class="ug-push__led-socket"></span>
          <span class="ug-push__led"></span>
        </span>
        <span class="ug-push__cap ug-segmented__key" data-strata-face="raised">Week</span>
      </span>
    </label>
    <label class="ug-segmented__item">
      <span class="ug-push ug-latch ug-latch--bank">
        <input class="ug-segmented__input" type="radio" name="view" value="month">
        <span class="ug-push__object" aria-hidden="true">
          <span class="ug-push__led-socket"></span>
          <span class="ug-push__led"></span>
        </span>
        <span class="ug-push__cap ug-segmented__key" data-strata-face="raised">Month</span>
      </span>
    </label>
  </div>
</fieldset>
```

- React: `<SegmentedControl form="latching" colour="success" options value onChange>`; Vue: the same with `v-model`; Astro: `<SegmentedControl form="latching" options value>`.
- **Tests:** `ui-latching-forms.test.mjs`, `ui-latching-forms-bindings.test.mjs`, `ui-latching-forms-astro.test.mjs`.
