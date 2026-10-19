# Keypad

Instrument, wave 3 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

A block of keys with printed legends, as on a phone, a calculator, a door entry panel or a hex entry pad: a set of push
buttons in a grid on one plinth. Renders a native `<fieldset>` (named by its `<legend>` or an `aria-label`) of native
`<button>`s, with the arrow keys moving through the keys by the Grid navigation pattern. Each key is a plain button: it
clicks, submits its `name` and `value`, and is disabled with `disabled`. The keys are native; the plinth and the caps are
decoration.

A pad you strike and that lights is a [Pad](pad.md); one machined key with a lit ring is a
[push button](button.md#11-push-button-form-momentary); a field's value is a [TextField](text-field.md) (a Keypad types into
it from the application's click handlers).

## 2. Object

**Machined caps on one polished plinth.** Each key is a square cap with a chamfered edge and a printed legend; a key
travels while it is held. The plinth is a single polished frame under all the keys.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Fieldset | The group; 12 px of room round the plinth for its shadow, the legend above | 0 | No |
| Plinth | One rounded frame round the keys, 2 px round the key boxes, radius 0.22 of a cap + 8 | Relief and Objects 2, Instrument 2.4 | No |
| Key box (the native button) | Square, the cap + 12 (56 at medium, over the 44 px a touch target should be), radius 0.22 of the cap + 6 | 0 | No |
| Cap | Square, side `size.keypad` (36, 44 or 52 px), radius 0.22 of its side; Relief a raised face, Objects a key, Instrument a body with a captured legend | Relief 4 (as the box lets its shadow reach), Objects ≤ 8, Instrument 6 | Down `keypad.travel` (2.5 px at 50% depth) while held |

- **The box rule.** Each key's native button covers its cap and the 6 px of room round it: every part of the key and its
  shadow lie inside the key's box at every depth and stage position. The plinth belongs to the fieldset: it and its shadow
  lie inside the fieldset's box (the 12 px of room). A press anywhere on a key's box is a press on that key.
- **Legends.** The printed legend (`ug-keypad__print`) is the key's name; an optional second legend (`shift`,
  `ug-keypad__shift`) is printed under it, smaller. On a **shifted** keypad (`shifted`, `data-strata-shifted="true"`) the second
  legend is printed large and the first small, below it. The application decides when the keypad is shifted and what each key
  does then; a key's name is its printed legends (`aria-label` says otherwise), as on a phone's "2 ABC".
- **No light.** A key has no emitter: the catalogue gives a keypad travel alone. A lit key is a [Pad](pad.md).
- **Instrument** (`data-strata-level="instrument"`): [`gpu/instrument-pad.ts`](../../../packages/ui/src/gpu/instrument-pad.ts)
  builds one object for the plinth and one per key:

  | Object | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- | --- |
  | Plinth | `bezel` | Prism the plinth's size, 2.4 high, 0.8 edge break; its shadow fitted to the fieldset's box | `pushBezel`: polished | None |
  | Key | `plinth` | The cap's body: cap size, 5 high (6 less the 1 px label), taper 0.6, chamfer 2, standing on the plinth | `key #rrggbb` (the key's face colour) | Down `keypad.travel` along `t` |
  | Key | `cap` | The captured legends: the cap inset 1.2, 1 high, `captured`, no shadow | `keyCap` | The body's |

  Each key is an object of its own, so a press moves one key; `t` is read each frame from the CSS throw
  (`--strata-push-t`, `spring.button`), a uniform write with no capture. A 4 × 3 keypad is 13 objects and 25 parts.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Plinth | `knob` metal | — | `knob` (`satin`); `polished` at Instrument |
| Cap | `secondary` | `text` | `control` (`satin`), finish `control` |
| Legend | None (printed on the cap) | `text` | None |

`data-strata-material` on a key overrides its cap's material.

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | Cap raised | Key up | Body 5 on the plinth | Raised cap |
| Held (`:active`, `data-strata-down`, Space/Enter down) | Cap sinks (press height) | Key travels | Body and legend travel 2.5 px | Cap `translate`, `--strata-push-t: 1` |
| Hover | Cap height `× state.hoverHeight` | Key rises by a quarter | No pose change | `--_lift`, `--_tone` on the cap |
| Focus-visible | An accent ring round the cap, captured (it fills the 6 px of room) | Same | Same | `outline: focus.width solid accent` |
| Disabled | Cap flat, text at 38% | Same | Same | `color` at 38% |

The throw is `spring.button`, as the Pad's and the push button's. Under `prefers-reduced-motion` travel is at once.

## 5. Relief primitives

- The plinth is a `raised` face (`data-strata-face="raised"`) in the `knob` metal; at Objects a `slab` the keys stand on
  (their `base` is its top); at Instrument claimed by the keypad's plinth object (its CSS paint is hidden, `data-strata-dome`).
- Each cap is a `raised` face; at Objects a `key` object; at Instrument claimed by the key's object. Each stands only as
  high as its box lets its shadow reach (2.8), hovered.
- No emitter: a Keypad adds nothing to a panel's lights.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.keypad` (36, 44, 52, `--strata-keypad-size`) | `size` |
| `colour.knob`, `colour.secondary`, `colour.text`, `colour.edge`, `colour.accent` (focus) | — |
| `elevation.raised`, `state.*`, `interior.max`, `bevel.*`, `shadow.*`, `object.keyTravel` | — |
| `material.roles.knob`, `material.roles.control` | `material` |
| `target.min`, `font.size.body`, `font.size.caption` | — |
| `focus.width`, `focus.offset`, `feedback.click.*` | — |
| `level` | `level` |

Props: `Keypad`: `label` (the legend), `columns` (3), `shifted`, `size`, `material`, `level`, the fieldset's attributes
(`disabled`, `aria-label`, `name`, `form`); `KeypadKey`: the legend as the children or the slot, `shift`, `size`, the native
button's attributes (`name`, `value`, `type`, `disabled`, `aria-disabled`, `aria-label`). In React the refs reach the fieldset
and the button.

## 7. DOM structure and overlay needs

A keypad with a second legend on some keys:

```html
<fieldset class="ug-keypad" style="--strata-keypad-columns: 3;">
  <legend class="ug-keypad__legend">Dial</legend>
  <div class="ug-keypad__plinth" data-strata-face="raised">
    <button class="ug-keypad__key" type="button" name="digit" value="1">
      <span class="ug-keypad__cap" data-strata-face="raised">
        <span class="ug-keypad__print">1</span>
      </span>
    </button>
    <button class="ug-keypad__key" type="button" name="digit" value="2">
      <span class="ug-keypad__cap" data-strata-face="raised">
        <span class="ug-keypad__print">2</span>
        <span class="ug-keypad__shift">ABC</span>
      </span>
    </button>
    <button class="ug-keypad__key" type="button" name="digit" value="3" disabled>
      <span class="ug-keypad__cap" data-strata-face="raised">
        <span class="ug-keypad__print">3</span>
        <span class="ug-keypad__shift">DEF</span>
      </span>
    </button>
  </div>
</fieldset>
```

A shifted keypad named with `aria-label`:

```html
<fieldset class="ug-keypad" data-strata-shifted="true" aria-label="Hex entry" style="--strata-keypad-columns: 2;">
  <div class="ug-keypad__plinth" data-strata-face="raised">
    <button class="ug-keypad__key" type="button" value="a">
      <span class="ug-keypad__cap" data-strata-face="raised">
        <span class="ug-keypad__print">A</span>
        <span class="ug-keypad__shift">10</span>
      </span>
    </button>
    <button class="ug-keypad__key" type="button" value="b">
      <span class="ug-keypad__cap" data-strata-face="raised">
        <span class="ug-keypad__print">B</span>
        <span class="ug-keypad__shift">11</span>
      </span>
    </button>
  </div>
</fieldset>
```

- The `<fieldset>` is the boundary: `class`, `style`, `data-strata-size`, `data-strata-shifted` and the ref reach it. The
  plinth is a `<div>` that wraps the keys (it is the grid), so a key stands on it in the DOM as on the page. A `disabled`
  fieldset disables every key natively.
- A key is moved by `--strata-push-t`, a registered number the recipe sets from the native state (held, disabled);
  `data-strata-down` is kept by `attachStrataKeypads` and overrides a `:active` a touch can leave behind.
- No overlay.

## 8. Keyboard and screen reader

| Input | Key |
| --- | --- |
| Click, tap | Presses and clicks once |
| Space | Held from key down to key up; clicks on key up |
| Enter | Held from key down to key up; clicks on key down (native) |
| Tab, Shift+Tab | Into and out of the keypad: **one tab stop** for the keys |
| Arrow keys | Move focus one key along the row or one row along the column (the Grid navigation pattern); nothing wraps; disabled keys are skipped; a short last row stops Down where it is |
| Home, End | The first and last key of the row |
| Control+Home, Control+End | The first and last key |

- The group is a `fieldset` (role `group`) named by its `legend`; each key is a `button` named by its printed legends. The
  navigation is the Pad's (see [its keyboard section](pad.md#8-keyboard-and-screen-reader)): a roving tabindex applied the first
  time focus enters, the columns read from the laid-out grid, right-to-left swapping left and right. Without script every key
  is a native tab stop.
- A key that types into a field is the application's: a click handler inserts the key's `value`. The keypad does not
  intercept keys; a physical keyboard types into the field itself.
- **Target size** (2.5.8): the key's box is at least 48 px square at the small size (the cap 36), 56 at medium, over the 44 px
  recommended for touch; the least a key shrinks to in a narrow container is `target.min` (24).
- **Screen readers:** the manual script for a keypad's roving arrows and its legends' names is VAL-002's, in
  [open issues](../../open-issues.md), until performed; the automated checks are the accessibility snapshot, axe and real keys.
- **Feedback** (design language section 20): where on, a key plays `click` as it goes down, once per press; a pulse (8 ms)
  answers only the visitor's own input and stops under reduced motion. Both are off by default.

## 9. CSS presentation

A polished frame (a gradient in the knob's metal) round a grid of square caps (`secondary`, raised by the shared recipe), each
cap printing its legend centred and an optional second legend under it in the caption size. The plinth is
`grid-template-columns: repeat(var(--strata-keypad-columns, 3), minmax(0, max-content))`: keys keep their width and shrink
together (never below `target.min`) when the container is narrower; a key is never lower than its box, and a legend that wraps
grows it taller. A 4-column keypad of medium
keys is 260 px wide and fits a 320 px viewport.

- **`forced-colors: active`:** the plinth is `Canvas` with a `ButtonText` edge, the caps `ButtonFace` with a `ButtonText` edge,
  a `Highlight` focus ring, `GrayText` when disabled.
- **`prefers-contrast: more`:** the plinth and caps edged in the text colour.
- **`prefers-reduced-motion: reduce`:** travel is at once.
- Face mode (`data-strata-mode="face"`, GPU on): at Instrument the plinth's paint is hidden and the caps' translation is held
  (the objects travel).

## 10. Tests

- **Plain DOM** (`ui-keypad.test.mjs`, real buttons): held from down to up (pointer, Space, Enter), one click; a disabled key is
  never held and the arrows skip it; a submit key submits its name and value; roving tabindex and every grid key (arrows,
  Home, End, Control+Home/End, a short last row); the legends and the shifted layout.
- **Mobile:** at 390 and 320 px no horizontal overflow, boxes at least 24 px; at 200% text the legends wrap without loss;
  touch taps and holds.
- **Preferences:** axe in light, dark, face mode, forced colours, more contrast and reduced motion.
- **GPU** (DPR 1 and 2, Relief, Objects and Instrument): the scene has no emitter of its own; at Instrument an object for the
  plinth and one per key with the documented parts; what the keypad draws lies inside the keys' boxes and the fieldset's box (0 px
  outside, at three depths at Instrument), native hits on those pixels find a key or the fieldset and a grid over every box has 0
  mismatches; a press changes pixels in the key's box only; 40 held frames give 0 captures and 0 hit-geometry updates; the
  accessibility snapshot is the same in DOM and GPU modes.
- **Feedback:** off by default; one click per real press.
- **Bindings and Astro** (`ui-keypad-bindings.test.mjs`, `ui-keypad-astro.test.mjs`): the two examples above rendered exactly;
  attributes, refs, `disabled`, `shifted`, a short last row.
- **Unit** (`strata-pad-keypad.unit.test.mjs`): sizes, boxes, the grid keys, the Relief and Objects entries and the Instrument
  parts validated by core's `validateInstrumentScene` and contained over the reference stage at every depth and size.
