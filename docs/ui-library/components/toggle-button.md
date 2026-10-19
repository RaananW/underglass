# ToggleButton

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A button with two states, on and off, such as bold or mute. Renders a native `<button type="button">` with
`aria-pressed`, following the WAI-ARIA [Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
(toggle button). The label does not change when the state changes. For a setting that is saved on submit, use
[Switch](switch.md) or [Checkbox](checkbox.md). As [Button](button.md), except where this page says otherwise.

Variants: `secondary` (default) and `accent`. An icon-only toggle carries an `aria-label` and has the same
square shape as [IconButton](icon-button.md).

## 2. Object

A **latching key**: the [Button](button.md) key that stays down while on.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | As Button | `object.keyHeight` (8) | Off: rest. On: held down by `object.keyTravel` (6) |
| Key top | Captured face, screen-locked | — | With the body |

Pressing an off key travels down and stays. Pressing an on key travels down and returns to rest.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key top, off | `secondary` | `text` | `control` |
| Key top, on, `secondary` | `secondary` tinted 16% towards `accent`, with a 3 px `accent` strip along the bottom | `text` | `control`; strip `indicator` (`emissive`) |
| Key top, on, `accent` | `accent` | `on-accent` | `buttonPrimary` |

The on state has three cues, none of them colour alone: the key is held down, its face is tinted, and the strip
is a shape (the lower edge of the top, inside the box) at 3:1 against the face. Screen readers get
`aria-pressed`.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, off | `elevation.raised` (3) | Key at `keyHeight` | Relief recipe at `raised` |
| Rest, on | `raised × state.pressHeight`; interior `−state.pressSink` | Key held at `keyTravel` | Smaller shadow, `brightness(0.96)` |
| Hover | Off: as Button. On: `pressHeight × state.hoverHeight` | Key rises `keyHeight / 4` from its position | Shadow step, `brightness(1.04)` |
| Pressed (`:active`) | `raised × state.pressHeight` | Key travels `keyTravel` | Smaller shadow |
| Focus-visible | Accent edge, `focus.width` | Emissive glow | `outline: focus.width solid accent` |
| Selected | The "on" rows above (`aria-pressed="true"`) | — | — |
| Disabled | Height 0, content at 38%, state kept | Key flattened | Flat, content `opacity: 0.38` |

Invalid and busy do not apply.

## 5. Relief primitives

One `raised` primitive: the `<button>`. The on-state strip is part of the same face, not a second primitive.

## 6. Tokens it reads

As [Button](button.md#6-tokens-it-reads), plus:

| Token | Prop |
| --- | --- |
| `colour.accent`, `colour.secondary` | `variant` |
| `state.pressHeight`, `state.pressSink`, `state.hoverHeight` | — |
| `material.roles.indicator` | — |
| — | `pressed`, `defaultPressed` (controlled or not) |

## 7. DOM structure and overlay needs

```html
<button type="button" class="ug-toggle-button" data-strata-face="raised" aria-pressed="false">
  <span class="ug-toggle-button__label">Bold</span>
</button>
```

- The `<button>` is the boundary element. The binding keeps `aria-pressed` and the state in step.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter, Space | Toggle (native) |
| Tab, Shift+Tab | Move focus |

- Role `button` with `aria-pressed` `true` or `false`. A screen reader announces "toggle button, pressed".
- Never `aria-pressed="mixed"` in Tier A.
- The label stays the same in both states.

## 9. CSS presentation

As [Button](button.md#9-css-presentation), with the held-down recipe selected by `[aria-pressed="true"]`.
Minimum size as Button, never below `target.min` (24). Under `forced-colors`: off uses `ButtonFace` and
`ButtonText`; on uses `Highlight` and `HighlightText`, so the state is visible without shadows.

## 10. Tests

- **Plain DOM:** each activation flips `aria-pressed` once; disabled does not toggle; the state survives a
  re-render.
- **GPU:** GPU stays active through toggling on and off; pixels are fresh after each; the held-down key
  matches `aria-pressed`; a native hit at the key's edge pixel reaches the `<button>`.
- **Accessibility:** axe in light, dark and high contrast, in both states; the on state is distinguishable
  without colour; accessibility snapshot equal in DOM and GPU modes.
- **Parity:** Relief and CSS within the P0.6 budget in both states.

## 11. Push-button form: `latching`

Instrument, wave 2 ([plan](../instrument.md#new-components)). `form="latching"` draws the same native toggle as a **latching push
button**: the [Button's push button](button.md#11-push-button-form-momentary), a machined cap on a polished bezel with a lit ring, that
stays down while pressed in, with an LED on the bezel that shows the latched state. Without `form` the toggle is the key above; any
other `form` string is the native `form` attribute. `colour` names the ring's and the LED's role (`glowOn` by default).

| Part | Shape | Moves |
| --- | --- | --- |
| Box, bezel, ring, cap | As the [Button's](button.md#11-push-button-form-momentary) | The cap rests at 0.45 of its 4 px travel (1.8) while `aria-pressed="true"`, goes all the way down while held, and returns to rest when unpressed |
| LED | A 6 px lens (8 px socket) on the bezel's top edge, centred | Lit 0 to 1 by `--strata-led`: lit while latched |

- **Lights.** The ring is lit while the button is held or latched (`--strata-lit`), the LED while it is latched (`--strata-led`); a disabled
  toggle keeps its state and is unlit and still. Three cues, none of them light alone: the cap stays down, the LED shows, and `aria-pressed` is
  `true`; the label never changes.
- **Emitters.** At every GPU level the ring is an emitter and the LED another (`emitter.led.*`), so a panel with a latching button has two
  per button; toggling is a uniform write. At the Instrument level the LED is a small glass `lens` part of the same object, standing on the bezel.
- Everything else, the GPU, the preferences, reflow and feedback, is as the Button's.

```html
<button type="button" class="ug-toggle-button ug-push" data-strata-form="latching" data-strata-colour="warning" aria-pressed="true">
  <span class="ug-push__object" aria-hidden="true">
    <span class="ug-push__bezel" data-strata-face="raised"></span>
    <span class="ug-push__socket"></span>
    <span class="ug-push__ring"></span>
    <span class="ug-push__led-socket"></span>
    <span class="ug-push__led"></span>
  </span>
  <span class="ug-push__cap" data-strata-face="raised"><span class="ug-toggle-button__label">Mute</span></span>
</button>
```

- The behaviour that toggles `aria-pressed` is the ToggleButton's own (`attachStrata`, or the binding's state); `attachStrataPushButtons` adds
  only the held state and the feedback. Enter and Space toggle, as on any button.
- **Tests:** `ui-push-button.test.mjs`, `ui-push-button-bindings.test.mjs`, `ui-push-button-astro.test.mjs`.
