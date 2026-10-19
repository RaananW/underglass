# Radio and RadioGroup

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Picks one option from a set. Radio renders a native `<input type="radio">` with a `<label>`. RadioGroup
renders a `<fieldset>` with a `<legend>` and gives all its radios one `name`. It follows the WAI-ARIA
[Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/). The native `<fieldset>` has the
`group` role, and the grouping and keys come from the browser, so no `role="radiogroup"` is added.

A set where several options may be on is a group of [Checkboxes](checkbox.md). A set that acts like buttons
is a [ButtonGroup](button-group.md).

## 2. Object

A **round well** with a **knob** (the dot) when selected. The well's base is the input's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | Circle (`radius.pill`) sunk by `elevation.well` (2) | −`elevation.well` | No |
| Dot | Sphere of diameter box − 4 · `object.taper` (12 at the default), centred | `elevation.raised` (3) | Rises from the well floor on select, sinks when another radio is chosen |

The input's border box is `size.indicator` square: 16, 20 (default) or 24 px by `data-strata-size` (section
13), and the label row is at least `target.min` (24) high and covers the whole row, so the row is the target (WCAG 2.5.8). The dot is half the box. The dot is centred and well inside the box.

The section 6 vocabulary lists "Checkbox, radio: small well with a raised mark". Radio uses the `knob`
primitive for the dot, as the [README](README.md) index says: a round dot reads as a sphere, not a glyph.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Well floor | `field` | — | `field` (`matte`) |
| Dot (selected) | `accent` | — | `indicator` (`emissive`) |
| Well outline | `edge`, 1 px | — | None |
| Label | None (sits on the panel) | `text` | None |
| Legend | None | `text` | None |

The well's `edge` outline keeps its shape at 3:1 against the panel, and the dot against the well floor keeps
at least 3:1 (non-text contrast, section 8).

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, unselected | Round well at `−elevation.well`; no dot | Empty well | Inset shadow |
| Hover | Interior `+state.hoverLift` (clamped by `interior.max`) | Same | `brightness(1.04)` |
| Pressed (`:active`) | Interior `−state.pressSink` | Same | `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, outside the circle | Emissive glow on the well | `outline: focus.width solid accent` |
| Selected (`:checked`) | Dot `emissive` at `elevation.raised`, `motion.fast` | Dot rises | Accent dot |
| Disabled | Well and dot at height 0, content at 38% | Flattened to the face | Flat, `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on every well in the group | Same | `outline` in `danger` |

Busy does not apply. Under `prefers-reduced-motion`, the dot appears with no rise.

## 5. Relief primitives

Two per radio: the `<input>` is a `well` (circle); the dot is a `knob`, drawn from a child
`<span data-strata-face="knob">` shown when `:checked`. The `<fieldset>` has no primitive.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.field`, `colour.edge`, `colour.accent`, `colour.text`, `colour.danger` | — |
| `radius.pill` | — (theme or scope) |
| `elevation.well`, `elevation.raised`, `object.taper`, `state.*`, `interior.max` | — |
| `material.roles.field`, `material.roles.indicator` | `material` |
| `target.min` (box size), `density` (label row height), `space.*` | — |
| `font.size.body`, `font.weight.strong` (legend) | — |
| `focus.width`, `focus.offset`, `motion.fast` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<fieldset class="ug-radio-group" aria-describedby="plan-help plan-error">
  <legend class="ug-radio-group__legend">Plan</legend>
  <label class="ug-radio">
    <input class="ug-radio__input" data-strata-face="well" type="radio" name="plan" value="free" checked
           aria-invalid="true" />
    <span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span>
    <span class="ug-radio__label">Free</span>
  </label>
  <label class="ug-radio">
    <input class="ug-radio__input" data-strata-face="well" type="radio" name="plan" value="pro" aria-invalid="true" />
    <span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span>
    <span class="ug-radio__label">Pro</span>
  </label>
  <p class="ug-field__help" id="plan-help">You can change it later.</p>
  <p class="ug-field__error" id="plan-error">Error: choose a plan.</p>
</fieldset>
```

- The `<fieldset>` is the group's boundary element; each `<input>` is a radio's. Layout (row or column) is
  a CSS prop and never changes the DOM order, which sets the arrow-key order.
- The wrapping `<label>` extends the hit target to the whole row, at least the density's control height.
- The group owns `name`, `value` and `onChange`. `required` on the radios makes the group required natively.
- `aria-invalid="true"` goes on each radio. The message is in the fieldset's description.
- `disabled` on the `<fieldset>` disables every radio natively.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Enter or leave the group, landing on the selected radio (or the first, if none) |
| Arrow Down, Right | Select the next radio, wrapping (native) |
| Arrow Up, Left | Select the previous radio, wrapping (native) |
| Space | Select the focused radio, if not already selected |

- Role `radio` (native), inside the `group` of the `<fieldset>`, named by the `<legend>`. The browser
  announces the position ("2 of 3") and the checked state.
- Disabled radios inside an enabled group are skipped by the arrow keys, as native.
- Home and End are not part of native radio behaviour and Strata does not add them.

## 9. CSS presentation

The `well` recipe as a circle, the dot as a sphere shaded from the light, the dot in `accent`. The box is
`size.indicator` square and the row at least the density's control height. Legend and options sit on `space.2` gaps.
Under `forced-colors`: `Field` background, a `ButtonBorder` border, the dot in `FieldText`, `GrayText`
when disabled, a `Highlight` focus outline. The dot's presence shows the state.

## 10. Tests

- **Plain DOM:** click on the circle and on the label selects; arrows move and select with wrap; Tab enters
  once and lands on the selected radio; form data holds the selected value; disabled radios are skipped.
- **GPU:** at Relief and Objects, GPU stays active through selecting and arrowing; pixels are fresh (the old
  dot gone, the new one present); a hit at the circle's edge pixel and on the label reaches the input.
- **Accessibility:** axe on selected, unselected, disabled and invalid, in light, dark and high contrast;
  accessibility snapshot equal in DOM and GPU modes (group name, checked, position); focus ring in decoded
  pixels; dot contrast against the lit well floor.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, focus and selected.

## 11. Hardware forms: the preset bank (`bank`) and the rotary selector (`selector`)

Instrument, everyday forms ([plan](../instrument.md#everyday-components-at-the-instrument-level)). `form="bank"` on a RadioGroup draws the
same native radios as a **preset bank**: interlocking latching buttons on one plinth, exactly one down at a time (the radio buttons of
a car radio, where the name comes from), each label printed on its cap, and an LED above the key that is down. The group's `<legend>`
stays on the faceplate above the plinth. `flush`, or no `form`, is the group above, in the markup and the look it had before, pixel for pixel;
any other `form` string is the native `form` attribute of the fieldset, as before. `form="selector"` is the other hardware form (below). `colour` names the LEDs' role. As with the Switch's hardware forms, the premium character's default form is reached by naming it: with no `form` the control is its flush look, so a page that does not opt in is unchanged.

| Part | Shape | Moves |
| --- | --- | --- |
| Plinth | One polished part, `ug-bank__plinth`: a rounded box 2 px larger than the keys all round, 2.4 high at 50% depth, on a fieldset with 8 px of padding for its shadow | No |
| Key | A button-sized cap (`control` height, at least `target.min`: 28, 34 or 40 px high), `radius.control`, as wide as its label plus 32 px (at least 24), on a body 5 high with the captured label. The key's box (the native `<input>`'s) is the cap plus 6 px each side and 14 above, so neighbours touch and the hit areas leave no gap | Travel 4 px at 50% depth: 0.45 while selected, 1 while held, 0 at rest |
| LED | A 6 px glass lens (8 px socket) on the plinth, centred above the cap | Lit 0 to 1 by `--strata-led`: lit while selected |

- **Interlocking.** The native radio group is the interlock: one `name`, one selected, the others up. Selecting another key brings the one that was
  down back up (both are CSS numbers on their own key, so both are uniform writes). Tab lands on the selected key (or the first), the arrow keys move
  and select (wrapping, skipping a disabled key, one `change` per real selection), Space selects, exactly as the group above.
- **Cues.** The selected key is down, its LED is lit, and `checked` is native; under more contrast and forced colours it also has a bar under its label
  (`Highlight` fill in forced colours). A disabled key is never held or lit, and a selected disabled one stays down. A group with nothing
  selected has every key up and every LED dark (a radio is `:indeterminate` then, and the form does not treat it as mixed).
- **The native controls stay the controls.** Each `<input type="radio">` covers its key (`opacity: 0`, `z-index: 1`) inside its `<label>`, whose text is
  the cap's label (the accessible name); the group is the `<fieldset>`, named by its `<legend>`. The plinth, the LEDs and the keys' bodies are
  decoration (`aria-hidden`, `pointer-events: none`).
- **Emitters.** Each key's LED is an emitter at every GPU level (`emitter.led.*`), so a bank has one per key; there is no ring. At the Instrument
  level the plinth is an object of its own (one `bezel` part in the polished bezel material, its shadow fitted to the fieldset's box), and each key an
  object of a body, a captured cap and an LED lens (`pushObject` with a `base` on the plinth). Relief and Objects: the plinth a raised face or a slab, the caps
  raised faces or keys standing on it. This is the one construction for keys on a plinth (`gpu/instrument-bank.ts`): the SegmentedControl's latching form and the
  [Tabs' rail](tabs.md#11-rail-form-rail) are built with it too, and a bank key's body is registered with the key registry, so the scene can trim it to core's material cap.
- **Presentation.** As the Checkbox's (section 11 of its page), with the bank wrapping to rows in a narrow viewport (320 px) or at 200% text, the caps growing and
  wrapping their labels.

```html
<fieldset class="ug-radio-group" data-strata-form="bank">
  <legend class="ug-radio-group__legend">Preset</legend>
  <div class="ug-bank__plinth" data-strata-face="raised">
    <label class="ug-radio">
      <span class="ug-push ug-latch ug-latch--bank">
        <input class="ug-radio__input" type="radio" name="preset" value="piano">
        <span class="ug-push__object" aria-hidden="true">
          <span class="ug-push__led-socket"></span>
          <span class="ug-push__led"></span>
        </span>
        <span class="ug-push__cap" data-strata-face="raised"><span class="ug-radio__label">Piano</span></span>
      </span>
    </label>
    <label class="ug-radio">
      <span class="ug-push ug-latch ug-latch--bank">
        <input class="ug-radio__input" type="radio" name="preset" value="organ">
        <span class="ug-push__object" aria-hidden="true">
          <span class="ug-push__led-socket"></span>
          <span class="ug-push__led"></span>
        </span>
        <span class="ug-push__cap" data-strata-face="raised"><span class="ug-radio__label">Organ</span></span>
      </span>
    </label>
    <label class="ug-radio">
      <span class="ug-push ug-latch ug-latch--bank">
        <input class="ug-radio__input" type="radio" name="preset" value="strings">
        <span class="ug-push__object" aria-hidden="true">
          <span class="ug-push__led-socket"></span>
          <span class="ug-push__led"></span>
        </span>
        <span class="ug-push__cap" data-strata-face="raised"><span class="ug-radio__label">Strings</span></span>
      </span>
    </label>
  </div>
</fieldset>
```

- The group's `help` and `error` stay below the plinth (in the fieldset's description), and the group's `required` and an `error` mark every radio, as above.
- `attachStrataPushButtons` adds only the held state and the feedback (`click` once per real selection, including an arrow key's).
  React: `<RadioGroup form="bank" colour="success" legend="Preset" value onChange>`; Vue: the same with `v-model`; Astro renders the radios from `options`.
- **Tests:** `ui-latching-forms.test.mjs`, `ui-latching-forms-bindings.test.mjs`, `ui-latching-forms-astro.test.mjs`.

### The rotary selector (`selector`)

`form="selector"` draws the same native radios as the [RotarySelector](rotary-selector.md)'s dial: **one detent per radio**, each radio's own label printed
round the dial at its position, a cap whose pointer turns to the checked one on `spring.detent`. The group's `<legend>` stays above it. The native radios stay
the control: each `<input type="radio">` lies inside its printed label's text as an invisible overlay at least 24 px square, so **a click on a printed
position is a click on that radio**, and Tab, the arrow keys (which move and check, wrapping, skipping a disabled radio) and Space are the group's, exactly
as above; `aria` is unchanged (the fieldset and its legend name the group, each label its radio) and the dial, the ticks and the numbered legend are `aria-hidden`
decoration. A group with nothing checked has its cap at the first position and no print selected.

```html
<fieldset class="ug-radio-group" data-strata-form="selector">
  <legend class="ug-radio-group__legend">Mode</legend>
  <div class="ug-rotary ug-rotary--group" style="--strata-rotary-value: 0;">
    <div class="ug-rotary__dial">
      <span class="ug-rotary__scale">
        <label class="ug-rotary__mark" style="--strata-rotary-at: 0;" data-strata-value="mix" data-strata-selected="false"><span class="ug-rotary__tick" aria-hidden="true"></span><span class="ug-rotary__text"><input class="ug-rotary__radio" type="radio" name="mode-example" value="mix">Mix</span></label>
        <label class="ug-rotary__mark" style="--strata-rotary-at: 0.3333;" data-strata-value="solo" data-strata-selected="false"><span class="ug-rotary__tick" aria-hidden="true"></span><span class="ug-rotary__text"><input class="ug-rotary__radio" type="radio" name="mode-example" value="solo">Solo</span></label>
        <label class="ug-rotary__mark" style="--strata-rotary-at: 0.6667;" data-strata-value="mute" data-strata-selected="false"><span class="ug-rotary__tick" aria-hidden="true"></span><span class="ug-rotary__text"><input class="ug-rotary__radio" type="radio" name="mode-example" value="mute">Mute</span></label>
        <label class="ug-rotary__mark" style="--strata-rotary-at: 1;" data-strata-value="bypass" data-strata-selected="false"><span class="ug-rotary__tick" aria-hidden="true"></span><span class="ug-rotary__text"><input class="ug-rotary__radio" type="radio" name="mode-example" value="bypass">Bypass</span></label>
      </span>
      <span class="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-rotary__cap" data-strata-face="raised"><span class="ug-rotary__pointer"></span></span></span>
    </div>
    <ol class="ug-rotary__legend" aria-hidden="true">
      <li data-strata-selected="false">Mix</li>
      <li data-strata-selected="false">Solo</li>
      <li data-strata-selected="false">Mute</li>
      <li data-strata-selected="false">Bypass</li>
    </ol>
  </div>
</fieldset>
```

- **The Select's limits.** The same as the [Select's selector](select.md#11-hardware-forms-selector-and-display): a dial's labels sit on a 270° arc, which fits **at most 8 radios of at
  most 12 characters**. A group asked as a selector that does not fit (nine radios, a longer label, one radio, or radios a binding cannot read: a child that is not a `Radio`, a label that is
  not plain text) is **drawn as a `bank`**, which keeps the hardware face and takes any group; `data-strata-form` says which. React and Vue read the `Radio` children
  (directly or through fragments), Astro its `options`.
- **Gestures.** The radios take their own clicks and the keys. The dial adds what they do not cover, each ending in a radio's native `click()` (so `input` and `change` fire as for a
  click on it): a click on the ring where no label is checks the radio nearest that angle; a click on the skirt or cap steps to the next radio on its upper half and the previous
  one on its lower half (the single-pointer alternative, WCAG 2.5.7); the wheel over the dial steps one radio and the page does not scroll. There is no drag: the dial is
  the group's decoration, and a vertical drag over radios has no native meaning. A changed radio plays `tick` through `strataFeedback` (off unless the page or scope turns it on).
- **Presentations.** The RotarySelector's, unchanged: its CSS (`ug-rotary__*`, `ug-rotary--group` on the root; at under 104 px + 7em the positions are numbers on the dial and the
  labels a numbered legend under it, for 320 px and 200% text), its Relief and Objects faces, and at the Instrument level the **Knob's object** (`gpu/instrument.ts`) over the dial's box,
  turned to the checked radio on `spring.detent`; a turn is a uniform update with no capture and no hit-geometry update, and the printed labels (captured content) change
  colour with the selection, as the Select's do. The group's `<fieldset>` is the native element the object lies in (its box holds the dial, as the bank's holds its plinth), so a
  click on a part lands on the group and, where a label is, on its radio.
- **Props.** `form`, `sweep` (the cap's turn from the first to the last radio in degrees; `knob.sweep`, 270). React and Vue keep the group controlled with `value` and `onChange`
  (`v-model`) or uncontrolled with `defaultValue`; a selector keeps its own value when uncontrolled so the dial follows it.
- **Tests:** `ui-deferred-forms.test.mjs`, `ui-deferred-forms-bindings.test.mjs`, `ui-deferred-forms-astro.test.mjs`, `strata-deferred-forms.unit.test.mjs`.
