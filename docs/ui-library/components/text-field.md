# TextField

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Takes one line of text. Renders a native `<input>`; `type` passes through (`text` default, `email`, `url`,
`tel`, `search`, `password`, `number`). The WAI-ARIA Authoring Practices have no text field pattern, because
the native element already has the `textbox` role, so none applies. A label is required: use a
[Field](field.md) or `aria-label`. Multi-line text is a [TextArea](text-area.md).

Sizes follow the density's control height (section 13). Prefix and suffix icons are decoration inside the
box; they never take focus.

## 2. Object

A **well** with a **bezel ring** just inside its edge. The well's base is the input's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | Rounded box sunk by `elevation.well` (2) | −`elevation.well` | No |
| Bezel | Ring of `bevel.width`, inside the edge, screen-locked (section 6) | Inside the well | No |
| Face | The captured text on `colour.field`, flat | — | No |

The text sits on the face, never on the bezel. Caret, selection and the placeholder are drawn by the browser
and captured with the face. Nothing moves, so no travel to contain.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Face (inside the bezel) | `field` | `text` | `field` (`matte`) |
| Bezel | `field`, darkened by the inverted bevel | — | `field` |
| Placeholder | `field` | `muted` | — |
| Invalid edge | `danger` on the bezel | — | `indicator` |
| Well outline | `edge`, 1 px | — | None |

The `edge` outline keeps the field's boundary at 3:1 against the panel (non-text contrast, section 8).
`data-strata-material` on the input overrides the role for one field.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Well at `−elevation.well` | Bezel ring at the sunk level | Inset shadow from the light |
| Hover | Interior `+state.hoverLift` (clamped by `interior.max`); depth unchanged | Same | `brightness(1.04)` |
| Focus-visible | Accent edge, `focus.width`, outside the shape | Emissive glow on the bezel | `outline: focus.width solid accent` |
| Disabled | Well flattened to height 0, no bevel gain, content at 38% | Bezel flattened to the face | Flat, content `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on the bezel | Same, as an emissive ring | `box-shadow` inset ring in `danger` |
| Read-only | Rest; focusable, no hover lift | Same | Rest |

Pressed, selected and busy do not apply. The invalid edge is inside the shape and the focus edge outside it,
so an invalid focused field shows both.

## 5. Relief primitives

One `well` primitive: the `<input>` itself, from its border box and `border-radius` (`radius.control`). The
bezel is the well's inverted bevel (section 5), not a second primitive.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.field`, `colour.edge`, `colour.text`, `colour.muted`, `colour.danger` | — |
| `radius.control` | — (theme or scope) |
| `elevation.well`, `bevel.width`, `bevel.profile`, `object.taper`, `state.hoverLift`, `interior.max` | — |
| `material.roles.field`, `material.roles.indicator` | `material` |
| `density` (control height), `space.*` (padding) | — |
| `font.size.body`, `font.family` | — |
| `focus.width`, `focus.offset`, `motion.fast` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<input class="ug-text-field" data-strata-face="well" type="email" id="email" name="email"
       autocomplete="email" />
```

With an icon or a clear button, the input sits in a wrapper:

```html
<span class="ug-text-field__wrap" data-strata-face="well">
  <span class="ug-text-field__icon" aria-hidden="true"><!-- SVG --></span>
  <input class="ug-text-field__input" type="search" id="q" />
</span>
```

- The `<input>` is the boundary element for refs, `class`, `style` and all native attributes. In the wrapper
  form, the wrapper carries the `well` marker and the focus edge (`:focus-within`).
- A clear button inside the field is a real [IconButton](icon-button.md) with its own name and at least
  24 by 24 px.
- No overlay. Browser autofill and suggestion lists belong to the browser.

## 8. Keyboard and screen reader

Typing, selection, Home, End, Backspace and the clipboard are native. Tab and Shift+Tab move focus.

- Role `textbox` (`searchbox` for `type="search"`, `spinbutton` for `type="number"`), all native.
- The name comes from the label; help and error come from `aria-describedby` ([Field](field.md)).
- `required`, `disabled` and `readonly` use the native attributes. `aria-invalid="true"` marks an invalid
  value, with the message in the description.
- Placeholder text is a hint and never replaces the label.

## 9. CSS presentation

The relief recipe for a `well`: an inset shadow from the light (section 7), the inverted bevel gradient for
the bezel, and `colour.field` for the face. Minimum height is the density's control height, and never below
`target.min` (24). The text caret and selection keep the browser colours. Under `forced-colors`: `Field`
background, `FieldText` text, a `ButtonBorder` border of 1 px, `GrayText` when disabled, and a `Highlight`
focus outline. The invalid state adds a second text signal (the message), as forced colours drop the hue.

## 10. Tests

- **Plain DOM:** typing, paste, selection and IME composition work; `readonly` and `disabled` behave natively;
  the label focuses the input; `type` passes through.
- **GPU:** at Relief and Objects, GPU stays active while typing and while the value changes; pixels show each
  new character with no blank frame; the caret blink does not revoke GPU; a hit at the field's edge pixel
  reaches the `<input>` and puts the caret there.
- **Accessibility:** axe on rest, focus, invalid, disabled and read-only, in light, dark and high contrast;
  accessibility snapshot equal in DOM and GPU modes; focus ring in decoded pixels; text and placeholder
  contrast on the lit face at `interior.max`.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, focus and invalid.

## 11. The display form

`form="display"` draws the same native `<input>` as a glass window in a bezel, backlit, with the text printed under the glass
([Instrument, Display](../instrument.md#new-components); the whole object, its tokens and its tests are on the [Display](display.md) page).
The input stays the control: it covers the whole display, so typing, selection, the caret, IME composition, autofill and form
submission are exactly the browser's, the caret and the selection are drawn under the glass where the text puts them, and a press on the bezel puts
the caret at the nearest character. Absent, the field is the well described above; any other `form` string is the native `form` attribute
(the id of the input's form owner), as before.

```tsx
<TextField form="display" label="Name" value={name} onChange={event => setName(event.target.value)} />
<TextField form="display" backlight="accent" placeholder="Type here" />
<TextField form="display" readOnly lit={false} defaultValue="UG-2026-0042" aria-label="Serial" />
```

- **Props:** `backlight` (a colour role, `glowOn` amber by default, or `off`) and `lit` (`false` switches the light off); the rest are the input's.
  The ref and every native attribute reach the `<input>`; `className`, `style`, `size`, `material` and `level` go on the display's root. An `icon` is ignored in this form.
- **Markup:** a `<span class="ug-display ug-display--input" data-strata-form="display">` root holding the decorative object
  (`aria-hidden`, no pointer) and `<input class="ug-display__text">`; the markup contract is [display.md section 7](display.md#7-dom-structure-and-overlay-needs).
- **Where it differs from the well:** the input is square and transparent over the window (the well's bezel ring is the display's bezel); focus is an
  accent outline round the bezel; invalid is a 2 px `danger` edge on the window; the backlight is off when the input is disabled or under more contrast.
- **Read-only:** `readOnly` keeps it focusable, selectable and submitted with its form (`<input readonly>`); a value the page only shows, and never submits, is a
  [Display](display.md) (`<output>`).
- **GPU:** Relief draws a groove and a flat window, Objects a slab and a flat window, Instrument a polished bezel and a glass pane over the printed text, which is
  the capture itself (0 of 30,726 px differ from the DOM's own rendering). Typing is captured once per keystroke with no hit-geometry update; the backlight is
  emitters, held within `interior.max` over the text. The caret's blink is captured as every text field's is.
- **Not yet:** the `segments` look (a seven-segment or dot-matrix typeface needs a font asset: a follow-up, pure CSS), and a default form per character (the premium
  character's table names `display` for TextField; today `form` is explicit, as the Switch's is).
