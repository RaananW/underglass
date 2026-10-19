# Button

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Starts an action. Renders a native `<button>`, following the WAI-ARIA
[Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/). `type="button"` is the default, so
a Button inside a form never submits by accident; `type="submit"` and `type="reset"` are passed through.
A Button that navigates is a [Link](link.md), not a Button.

Variants: `secondary` (default), `accent` (the primary action) and `danger` (destructive). Sizes follow
the density's control height (section 13), never a separate size scale.

## 2. Object

A **key**: a rounded, tapered block whose base is the button's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | Frustum from the base to the top, `object.taper` inset | `object.keyHeight` (8) | Down by `object.keyTravel` (6) on press; up by `keyHeight / 4` on hover |
| Key top | The captured face, screen-locked (section 6) | — | With the body |

The label and icon are on the key top. The whole travel stays inside the border box.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key top, `secondary` | `secondary` | `text` | `control` (`matte`) |
| Key top, `accent` | `accent` | `on-accent` | `buttonPrimary` (`matte`) |
| Key top, `danger` | `danger` | `on-danger` | `control` |
| Key sides (Objects) | The top's colour, darkened by the bevel | — | Same as the top |

`data-strata-material` on the button overrides the role for one button.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.raised` (3) | Key at `keyHeight` | Relief recipe at `raised` |
| Hover | `raised × state.hoverHeight`; interior `+state.hoverLift` | Key rises `keyHeight / 4` | Larger shadow, `brightness(1.04)` |
| Pressed (`:active`) | `raised × state.pressHeight`; interior `−state.pressSink` | Key travels `keyTravel` | Smaller shadow, `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width` | Emissive glow on the key | `outline: focus.width solid accent` |
| Disabled | Height 0, no bevel gain, content at 38% | Key flattened to the face | Flat, content `opacity: 0.38` |
| Busy (`aria-busy="true"`) | Rest, with an `emissive` [Spinner](spinner.md) replacing the icon | Same | Same |

Selected and invalid do not apply; a latching button is a [ToggleButton](toggle-button.md).

## 5. Relief primitives

One `raised` primitive: the `<button>` itself, from its border box and `border-radius`
(`radius.control`).

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.danger`, `colour.text` | `variant` picks the role |
| `radius.control` | — (theme or scope) |
| `elevation.raised`, `state.*`, `object.keyHeight`, `object.keyTravel`, `object.taper` | — |
| `material.roles.control`, `material.roles.buttonPrimary` | `material` |
| `density` (control height), `space.*` (padding) | — |
| `font.size.body`, `font.weight.strong` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.press` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<button type="button" class="ug-button ug-button--accent" data-strata-face="raised">
  <span class="ug-button__icon" aria-hidden="true"><!-- optional SVG --></span>
  <span class="ug-button__label">Save</span>
</button>
```

- The `<button>` is the boundary element: React and Vue refs, `class` and `style` reach it.
- No overlay.
- Icon-only buttons are [IconButton](icon-button.md).

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter, Space | Activate (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `button` (native). The accessible name is the label text.
- `disabled` uses the native attribute, which removes the button from the tab order. A button that must stay
  focusable while unavailable uses `aria-disabled="true"`, and the binding blocks activation.
- Busy: `aria-busy="true"` on the button, and the label stays.

## 9. CSS presentation

The relief recipe at `elevation.raised`, with `box-shadow` derived from the light (section 7), the bevel
gradient, and the material's finish zones (section 4). Minimum size: the density's control height, and never
below `target.min` (24) in either dimension. A flex row never squeezes a button below its label
(`flex-shrink: 0`): a row too narrow for its buttons should wrap. Under `forced-colors`: `ButtonFace`, `ButtonText` and a
`ButtonBorder` outline; no shadows.

## 10. Tests

- **Plain DOM:** real pointer click and Enter and Space activate once; disabled does not activate; `type`
  defaults to `button` inside a form.
- **GPU:** at Relief and Objects, GPU stays active through hover, press and release; pixels are fresh after
  each; a hit at the key's edge pixel reaches the `<button>`.
- **Accessibility:** axe on every variant and state, in light, dark and high contrast; accessibility
  snapshot equal in DOM and GPU modes; focus ring visible in decoded pixels; contrast of the label on the lit
  top at `interior.max`.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover and pressed.

## 11. Push-button form: `momentary`

Instrument, wave 2 ([plan](../instrument.md#new-components)). `form="momentary"` draws the same native button as a **push
button**: a machined cap on a polished bezel, a lit ring between them that lights while the button is held, and the label on
the cap. Without `form` the button is the key above; any other `form` string is the native `form` attribute (the id of the
button's form owner), as before. `colour` names the ring's role (`glowOn` amber by default, or `accent`, `success`,
`warning`, `danger`, `info`); `variant` still picks the cap's colour (`accent` and `danger` caps). The native `<button>` is the
control, its box the hit area, and the object is decoration inside it.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native button) | The cap plus 24 px each way (64 at `size.push` 40), wider with the label | 0 | No |
| Bezel | A stadium inset 5 px for the bloom's halo, the cap + 14 high, 4.4 px of polished metal round the ring | Relief: 3; Instrument: 3.2 | No |
| Socket, ring | The dark band under the ring (printed on the face) and the lit ring over it, the cap + 5.2 high; the cap leaves 2.6 px of it showing (a 2 px ring and a 0.6 px gap) | Instrument: 0.5 on the bezel | The ring is lit 0 to 1 by `--strata-lit` |
| Cap | A pill as tall as `size.push` (32, 40 or 48), 12 px of print each side, carrying the icon and the label | Relief: 3; Instrument: 6, taper 0.6 | Down `pushButton.travel.held` (4) while held |

- **Materials.** A layer holds at most 16 materials (core's cap, `INSTRUMENT_MATERIALS`), and the helper keeps its scenes under it with named rules (`gpu/index.ts`): a push
  button's parts are added only while the scene holds fewer than `INSTRUMENT_PUSH_MATERIALS` (12) materials, and a plain Button's key body only below
  `INSTRUMENT_KEY_BODY_MATERIALS` (14); past a rule the button is a **Relief key** (a raised face, still the native button), and the lens, bezel and
  body materials that the push buttons add after the keys trim the later colours' keys the same way until the scene fits 16. It is reported, not silent:
  `strata.diagnostics(panel)` gives `{ materials: { count, cap }, keysAtRelief: [ids] }` and the helper warns once per panel with `console.warn`. A scene
  that still passes the cap is drawn at Relief by core, with `state().instrument` saying `budget`. Split a panel with many colours or many component kinds.
- **Lit ring.** The ring is lit (`--strata-lit: 1`) while the button is held (the pointer down on it, or Enter or Space down) and unlit
  otherwise; a disabled or `aria-disabled` button is never held, never lit and never moves. The light is never the only cue: the
  cap goes down as well, and the click is the native one.
- **At every GPU level** the ring is an emitter (`emitter.pushButton.*`: reach 4 cap diameters, height 0.3, strength 2,400 for
  a 40 px cap): the panel takes a version 4 scene with its `emitters`, the `protected` rects of its text and a `feather`, so core's face
  pool lights the page round the ring within the contrast guard (the label stays within `interior.max`), and a press is a uniform write
  with no capture. Relief draws the bezel and the cap as raised faces, Objects as slabs and a key that travels `object.keyTravel`.
- **At the Instrument level** the button is `instrument-push.ts`'s object: a polished `bezel`, the ring a glass `lens` plate with its
  emitter (dark glass unlit, glowing and blooming lit), and a `plinth` body in the cap's colour with the captured `cap` on it, both
  travelling 4 px (× 0.6, 1, 1.6 with depth) along `t`, which follows the CSS throw `--strata-push-t` on `spring.button` (1,600 /
  80, critically damped). The label is the capture itself (a captured cap), so it is exact. Bezel, ring and the CSS paint of the
  object are hidden while the parts draw them; the cap keeps its paint, which the captured cap shows, and its CSS motion is held,
  so a press repaints nothing. Under `prefers-reduced-transparency` the ring is opaque lacquer.
- **Preferences.** `prefers-reduced-motion`: the ring and the cap change at once. `prefers-contrast: more`: emitters off, the ring flat
  colour, edges in `colour.text`. `forced-colors: active`: `Canvas` bezel and ring with `ButtonText` borders, a `Highlight` ring while
  held, a `ButtonFace` cap, a `Highlight` focus ring, `GrayText` disabled. Reflow: the cap grows with the label (it wraps at 320 px and
  200% text); the bezel and ring follow it.

```html
<button type="button" class="ug-button ug-push" data-strata-form="momentary" data-strata-colour="danger">
  <span class="ug-push__object" aria-hidden="true">
    <span class="ug-push__bezel" data-strata-face="raised"></span>
    <span class="ug-push__socket"></span>
    <span class="ug-push__ring"></span>
  </span>
  <span class="ug-push__cap" data-strata-face="raised"><span class="ug-button__label">Record</span></span>
</button>
```

- The `<button>` is the boundary: refs, `class` and `style` reach it, and `data-strata-colour` is the ring's role. The plain-DOM
  behaviour (`attachStrataPushButtons`, loaded by `attachStrata` and by the bindings) keeps `data-strata-down="true"` on the button from the
  pointer or key going down to the pointer going up anywhere, the key going up, the button losing focus or the page being hidden; with no
  script the same look comes from `:active`.
- Keys: Enter and Space activate, as on any button; both hold the ring lit while down. Nothing about the keys changes.
- **Feedback:** the opt-in `click` plays as the button goes down (one per press, by the visitor's own gesture for the pulse); off by default.
- **Tests:** `ui-push-button.test.mjs` (plain DOM, accessibility, GPU at Relief, Objects and Instrument, feedback, touch and reflow),
  `ui-push-button-bindings.test.mjs`, `ui-push-button-astro.test.mjs`, and the unit tests in `strata-rotary-push.unit.test.mjs`.
