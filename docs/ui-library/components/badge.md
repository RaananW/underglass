# Badge

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows a short status or count beside other content, such as "New" or "3". Renders a `<span>`. A Badge is not
interactive: it has no tab stop and no hit target, so the 24 by 24 target rule does not apply. There is no
APG pattern for a badge. A badge that must be announced when it changes sits in a live region the
application provides, or uses `role="status"`.

Variants: `neutral` (default), `accent`, `success`, `warning`, `danger` and `info`.

## 2. Object

None in 3D. A **flat pill**: a rounded shape with material only and no height, at every level. It has no
moving part.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Pill, `neutral` | `secondary` | `text` | `control` (`matte`) |
| Pill, `accent` | `accent` | `on-accent` | `control` |
| Pill, `success` | `success` | `on-success` | `control` |
| Pill, `warning` | `warning` | `on-warning` | `control` |
| Pill, `danger` | `danger` | `on-danger` | `control` |
| Pill, `info` | `info` (= `accent`) | `on-info` | `control` |

The meaning is in the text. Colour is an addition, never the only carrier (write "Failed", not a red dot).
Text against the pill is at least 4.5:1.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.ground` (0), flat | Flat | Flat fill, no shadow |

Hover, pressed, focus, selected, invalid and busy do not apply, because a Badge is not interactive. Disabled
is not a state of a Badge. A Badge inside a disabled control follows that control's 38% content opacity.

## 5. Relief primitives

One `flat` primitive: the `<span>` (`data-strata-face="flat"`), from its border box and `radius.pill`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.success`, `colour.warning`, `colour.danger`, `colour.info`, `colour.text` | `variant` |
| `radius.pill` | — |
| `material.roles.control` | `material` |
| `font.size.caption`, `font.weight.strong` | — |
| `space.*` (padding) | — |

## 7. DOM structure and overlay needs

```html
<span class="ug-badge ug-badge--success" data-strata-face="flat">Active</span>
```

- The `<span>` is the boundary element. Refs, `class` and `style` reach it.
- No overlay. A count above a limit reads "99+", with the full number in a visually hidden suffix.

## 8. Keyboard and screen reader

- No keys: a Badge is not focusable.
- No role by default. The text is read in context, so the badge sits next to the label it describes.
- With `role="status"` the content is announced politely when it changes. This is opt-in.
- A badge with an icon and no text is not allowed; it needs text or a visually hidden label.

## 9. CSS presentation

An inline-flex pill with the flat recipe: fill from the colour role and the material's base layer, no bevel
and no shadow. Padding is `space.1` vertically and `space.2` horizontally. Under `forced-colors`: `Canvas`
fill, `CanvasText` text and a `CanvasText` outline, so the pill shape stays visible.

## 10. Tests

- **Plain DOM:** the text is present for every variant; the badge is not in the tab order.
- **GPU:** GPU stays active when the badge text changes; pixels are fresh with the new text; no blank frame.
- **Accessibility:** axe in light, dark and high contrast; text contrast of at least 4.5:1 for every variant;
  the `role="status"` form announces a change once.
- **Parity:** Relief and CSS within the P0.6 budget for every variant.

## 11. Indicator form: `led`

Instrument, everyday forms ([plan](../instrument.md#everyday-components-at-the-instrument-level)). `form="led"` draws the same `<span>` as **an LED
pill**: the [StatusLight](status-light.md)'s lens before the text, on a dark pill plate, in the variant's colour. `flush`, or no `form`, is the
flat pill above, in the markup and the look it had before, pixel for pixel. The pill is still not interactive: it has no tab stop, no hit target and
no role, and a count above `max` still reads "99+" with the full number visually hidden.

| Part | Shape | Moves |
| --- | --- | --- |
| Plate | The pill, `radius.pill`, the lens plus 16 px tall (24, 26 or 30 px at the StatusLight's sizes), the panel colour darkened 12% with an `edge` border: captured content, a `flat` primitive | No |
| Socket | The dark disc under the lens, printed on the face at every level | No |
| Lens | A glass lens Ø `size.statusLight` (10 px at medium), 7 px from the pill's end and 8 px before the text, with its emitter | Lit 0 to 1 by `--strata-lit` |

- **Colour from the role.** The lens takes the variant's colour (`accent`, `success`, `warning`, `danger`, `info`) and is lit. A **neutral** badge has no
  role, so its lens is dark glass; `data-strata-colour` on the badge lights it in any lens role. The text is the badge's text on the plate, in `colour.text`
  (the plate is dark glass-neutral, not the role colour, so the text keeps its 4.5:1 for every variant): the colour is never the only carrier, as before.
  A count badge keeps its number, and "99+" its hidden full count.
- **Emitters.** One emitter (`emitter.led.*`: 520 at the 10 px reference lens, reach 6 lens diameters, height 0.8), a uniform write. The lens's bounds are
  **its own room** (the lens plus 8 px each side), not the whole pill: the text shares the pill, and the bloom is clipped to the object's box, so it never
  washes over the text. The `protected` rect of the text keeps the contrast guard (the guard holds the face to 1 ± 4% of its own, so text 8 px from a lens
  may move by up to twice that between an unlit and a lit lens; its contrast stays above 4.5:1).
- **GPU.** Relief a ring face, Objects a dome, the Instrument level a glass LED lens ([StatusLight](status-light.md)); the pill stays the captured `flat` face.
- **Presentation.** `prefers-contrast: more`: flat colour lens, no emitter, edges in the text colour. Forced colours: a `Canvas` pill with a `CanvasText` edge,
  the lens `Highlight` (lit) or `Canvas`. At 200% text the pill grows with its text; the lens keeps its size.

```html
<span class="ug-badge ug-badge--success" data-strata-face="flat" data-strata-form="led"><span class="ug-badge__lens" data-strata-face="knob" aria-hidden="true"></span>Active</span>
```

- React: `<Badge form="led" variant="success">Active</Badge>`; Vue: the same props; Astro: `<Badge form="led" variant="success">Active</Badge>`. A `count` badge is
  `<Badge form="led" count={7} />`.
- **Tests:** `ui-indicator-forms.test.mjs`, `ui-indicator-forms-bindings.test.mjs`, `ui-indicator-forms-astro.test.mjs`.
