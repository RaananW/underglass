# Lamp

Instrument, wave 2 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Shows and sets a state with a light, as on audio and control hardware: mains, armed, link, a talkback key. Renders a
native `<input type="checkbox" role="switch">` with the lamp as part of its label row, following the WAI-ARIA
[Switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/), or, with `momentary`, a native
`<button aria-pressed>` that is lit while it is held. The element is native; the lens is decoration. The state is
`checked` (`aria-checked`) or `aria-pressed`, the label names the lamp, and light never carries the state alone
(WCAG 1.4.1).

A light that only shows a state, with no input, is a [StatusLight](status-light.md). A choice submitted later with a
form is a [Checkbox](checkbox.md); a plain switch is a [Switch](switch.md).

## 2. Object

A **lens on a bezel**: a polished ring round a glass dome. Unlit it is a dark glass dome; lit it glows, blooms and
**emits**: it lights the face around it, the objects near it and, past the panel's edge, the page.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native control, or, for a momentary lamp, its object) | Square, the lens + 28 (56 at medium) | 0 | No |
| Bezel | Ring: outer Ø lens + 8, 4 wide, 2 px edge break | Relief and Objects: 3; Instrument: 3 | No |
| Socket | Disc Ø lens + 2, printed on the face at every level (`--_off`: the role colour at 16% over dark glass) | 0 | No |
| Lens | Ø `size.lamp` (20, 28 or 36 px); Relief a disc, Objects a dome up to 0.3 of its diameter high, Instrument a glass plano-convex lens 0.4 of its diameter high | Above | No; it lights |
| Emitter | A point light over the lens centre | 0.7 lens diameters | Strength 0 or on |

- **The box rule.** The native control covers the whole object: every part, its cast shadow and the bloom's halo lie
  inside the box (10 px of room each side of the bezel), at every depth, at every stage position, and a press anywhere on
  the box is a press on the control. The input is a transparent square box with no face, so no corner lets a press fall
  to the row; a momentary lamp's button holds the object and the label, and the object's pixels hit the button.
- **Colour** is a role: `glowOn` (amber, `colour.glowOn`) by default, or `accent`, `success`, `warning`, `danger` or
  `info`. Lit, the lens is the role mixed 18% towards white; unlit, the role at 16% over dark glass. The emitter takes
  the role scaled to full brightness (a role colour is chosen to carry text; a light is chosen to be bright).
- **The emitter** (design language section 3): `emitter.lamp.radius` 6 lens diameters, `emitter.lamp.height` 0.7 and
  `emitter.lamp.strength` 3,200 for the 28 px lens, scaled with the square of the lens (a larger lens throws the same
  pool, larger); `emitter.guardFeather` 4 px. A disabled lamp is unlit, so its emitter is off.
- **Instrument** (`data-strata-level="instrument"`): [`gpu/instrument-lamp.ts`](../../../packages/ui/src/gpu/instrument-lamp.ts)
  builds the object from the laid-out lens:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `bezel` | Lathe ring: outer radius lens/2 + 4, 3 high, a 0.6 edge break, its top running in to the lens | `lampBezel`: polished (250, 250, 251), roughness 0.04 | None |
  | `lens` | Lathe: a 2 px wall and an elliptical dome, 0.4 of the diameter high, standing on the face in the bezel; `glass: "lens"` with its `emitter` | `lens #rrggbb`: glass (index 1.5, tinted by the lit colour, absorption 0.05, reflection 1.5, dispersion 0.1); `lensOpaque #rrggbb` (lacquer, the unlit colour) under `prefers-reduced-transparency` | None |

  The parts never depend on the state, which would rebuild the layer: lit or unlit is only the emitter's strength, so
  a toggle, a press or a blink is a uniform write (`setEmitters`) with no capture. The glass refracts the capture under
  it: the dark socket printed on the face, so the unlit lens is a dark dome; lit, core glows it in the emitter's colour
  and blooms it. The bezel's caster is capped where its shadow would leave the box.
- **Past 64 emitters in a layer** core draws the 64 with the most reach into the layer and drops the rest, reported
  per layer in `state().emitters` (`drawn`, `dropped`); GPU stays on and nothing is a validation error. The format takes
  1,024 emitters a scene, and the helper writes every visible lens up to that.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Bezel | `knob` metal; `edge` ring | — | `knob` (`satin`); `polished` at Instrument |
| Socket | The role at 16% over dark glass | — | None (printed) |
| Lens, unlit | The role at 16% over dark glass | — | `lens` (`glass`) |
| Lens, lit | The role mixed 18% towards white | — | `glowOn` (`emissive`), an emitter |
| Label | None (sits on the panel) | `text` | None |

`data-strata-material` on the lamp overrides the bezel's and the lens's material. The lamp's own states are shown
twice: by the lens and by the switch's `aria-checked`, which the label names. The label must not contain "on" or "off".

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Off | A dark disc in the ring | A dark dome | A dark glass dome | The unlit gradient |
| On (`:checked`, or held) | The disc in the lit colour; the face lit | The dome in the lit colour | The glass glows, blooms and lights the face and the parts | The lit gradient with a glow shadow |
| Hover | Bezel height `× state.hoverHeight` | Bezel rises by a quarter | No pose change: hardware does not rise under a finger | `--_lift`, `--_tone` on the bezel |
| Pressed (`:active`) | As hover; a held momentary lamp is lit | As hover | As hover | As hover |
| Focus-visible | An accent ring round the bezel, captured (no GPU focus edge) | Same | Same | `outline: focus.width solid accent` |
| Disabled | Unlit, parts flat, the object at 38% | Same | Same, emitter off | `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on the bezel | Same | Same | `border` in `danger` |

Busy does not apply. A lamp changes at once (hardware lamps do): `--strata-lit` has no transition, so a toggle is one
change to the scene. Under `prefers-contrast: more` emitters are off and a lit lens is flat colour with its socket in the
lit colour (so the glass shows it); under `prefers-reduced-transparency` the Instrument lens is an opaque dome; under
`forced-colors` and `prefers-reduced-motion` nothing differs (a lamp does not move).

## 5. Relief primitives

- The bezel is a `raised` face (a circle) with `data-strata-face="raised"`; at Objects a `bezel` object (a ring 4 wide). Each
  stands only as high as its box lets its shadow reach (2.8), hovered.
- The lens is a `knob` face (`data-strata-face="knob"`) that the helper draws as a **`ring` face as wide as the lens** at
  Relief (a disc in the lens's own colour, unlit, so a light turning on changes no captured pixel) and as a **dome** at
  Objects (in its colour, as high as its shadow stays in the box), and as a glass part at Instrument. Its CSS paint is
  hidden while it does (`data-strata-dome`).
- The socket has no face: it is printed on the page at every level.
- Every lens is an **emitter** at every level: a panel with a lens takes a version 4 scene with `emitters`, the
  `protected` rects of its text and a `feather`, so core's face pool lights the page within the contrast guard
  ([design language section 3](../design-language.md#emitters)). The helper reads `--strata-lit` every frame.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.lamp` (20, 28, 36, `--strata-lamp-size`) | `size` |
| `colour.glowOn`, or `colour.accent`, `success`, `warning`, `danger`, `info` | `colour` |
| `emitter.lamp.radius` (6), `emitter.lamp.height` (0.7), `emitter.lamp.strength` (3,200), `emitter.guardFeather` (4) | — |
| `colour.knob`, `colour.edge`, `colour.text`, `colour.accent` (focus), `colour.danger` | — |
| `elevation.raised`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob`, `material.roles.lens`, `material.roles.glowOn` | `material` |
| `target.min`, `space.3`, `font.size.body` | — |
| `focus.width`, `focus.offset`, `feedback.click.*` | — |
| `level` | `level` |

The emitter and `size.lamp` values are the premium character's (provisional until the look sign-off). Props: `colour`,
`momentary`, `reverse` (the label first, the DOM order kept), `invalid`, `id`, `name`, `form`, `disabled`, `checked` /
`defaultChecked` (or `v-model`), `size`, `material`, `level`, and the label as the children or the slot; in React the ref
reaches the native control (Vue exposes `input`).

## 7. DOM structure and overlay needs

A toggle lamp:

```html
<label class="ug-lamp" data-strata-colour="success">
  <input class="ug-lamp__input" type="checkbox" role="switch" name="link" />
  <span class="ug-lamp__object" aria-hidden="true">
    <span class="ug-lamp__bezel" data-strata-face="raised"></span>
    <span class="ug-lamp__socket"></span>
    <span class="ug-lamp__lens" data-strata-face="knob"></span>
  </span>
  <span class="ug-lamp__label">Link</span>
</label>
```

A momentary lamp, a button with its object and its label inside it:

```html
<button class="ug-lamp ug-lamp--momentary" type="button" aria-pressed="false" data-strata-colour="danger" name="talk">
  <span class="ug-lamp__object" aria-hidden="true">
    <span class="ug-lamp__bezel" data-strata-face="raised"></span>
    <span class="ug-lamp__socket"></span>
    <span class="ug-lamp__lens" data-strata-face="knob"></span>
  </span>
  <span class="ug-lamp__label">Talk</span>
</button>
```

- The row (the `<label>`, or the button) is the boundary: `class`, `style`, `data-strata-colour`, `data-strata-size` and
  refs reach it (the ref reaches the native control). The object (`aria-hidden`, and every part `pointer-events: none`) lies
  over the toggle's input, which is a transparent square box with no face; for a momentary lamp it is the button's first
  child, in the flow.
- `data-strata-colour` is absent for the default (`glowOn`). A lamp is lit by `--strata-lit`, a registered number the
  recipe sets from `:checked` or `[aria-pressed="true"]` (0 when disabled).
- The momentary lamp's `aria-pressed` is kept by `attachStrataLamps` (below), not by the markup, which renders it `false`.
- No overlay.

## 8. Keyboard and screen reader

| Input | Toggle lamp | Momentary lamp |
| --- | --- | --- |
| Click, tap, the label | Toggles (native) | Presses and clicks (native) |
| Space | Toggles (native) | Lit from key down to key up; one click |
| Enter | Does not toggle, as the Switch | Lit from key down to key up; one click (native) |
| Pointer down, up | — | Lit from down to up, wherever it is released; a release elsewhere is no click |
| Tab, Shift+Tab | Move focus (native order) | Move focus; a lamp that loses focus lets go |

- A toggle lamp's role is `switch`, its state `aria-checked` from `checked`: screen readers say "on" or "off". A momentary
  lamp is a `button` whose `aria-pressed` follows the hold; the name of both is the label. Name the lamp by what it is
  ("Mains"), never by its state.
- Help and error through `aria-describedby` ([Field](field.md) without `label`).
- **Meaning never rides on light alone** (WCAG 1.4.1): an on lamp is also `aria-checked` and named by its label; colours
  carry no meaning of their own. Light and glow are never the only difference: forced colours and more contrast draw the
  state as a fill.
- **Target size** (2.5.8): the box is at least 48 px square, the row at least `target.min` (24) high.
- **Feedback** ([design language section 20](../design-language.md#20-feedback)): where on, a toggle plays `click` on its
  change and a momentary lamp as it goes down (and no sound as it comes up); a pulse (8 ms) answers only the visitor's own
  input and stops under reduced motion. Both are off by default (`feedback.sound`, `feedback.haptics`, or
  `attachStrataFeedback`). `attachStrataLamps` from `@underglass/ui/dom` (one set of passive delegated listeners per
  document; `attachStrata` and the React, Vue and Astro components attach it) keeps `aria-pressed` and plays the feedback.
- **Screen readers:** the manual script for a lamp's state is VAL-002's, in [open issues](../../open-issues.md), until
  performed.

## 9. CSS presentation

A bezel (a gradient ring in the knob's metal, edged in `colour.edge`), the socket printed under the lens, and the lens
as a radial gradient from the unlit to the lit glass by `--strata-lit`, with a glow shadow when lit. The row is at
least `target.min` high; the label wraps (`overflow-wrap: anywhere`) and the lamp never exceeds its container, so a 320 px
viewport and 200% text reflow.

- **`forced-colors: active`:** the bezel and the lens are `Canvas` with a `CanvasText` edge, the lens `Highlight` when lit
  (the state shows by fill), no glow, a `Highlight` focus ring, `GrayText` when disabled.
- **`prefers-contrast: more`:** emitters off; the lens, flat colour with no glow; bezel and lens edged in the text colour;
  the socket takes the lit colour.
- **`prefers-reduced-motion: reduce`:** nothing differs: a lamp does not move.
- Face mode (`data-strata-mode="face"`, GPU on): the CSS lens is hidden, the bezel is flat (hidden at Instrument), the
  socket stays.

## 10. Tests

- **Plain DOM** (`ui-lamp.test.mjs`, real input): a click on the box and on its corner and on the label toggles once, one
  `input` and one `change`; Space toggles, Enter does not; form data follows `checked`; a disabled lamp stays; every box is
  the lens + 28 px; a grid of `elementFromPoint` over every box finds the control. A momentary lamp lights from down to up
  (mouse, label, Space, Enter, touch), lets go when released elsewhere or when focus moves, never lights when disabled, and
  clicks once.
- **Mobile:** at 390 and 320 px no horizontal overflow, every box at least 24 px, labels whole; at 200% text the labels wrap
  without loss; touch taps toggle and a held touch lights a momentary lamp.
- **Preferences:** axe in light, dark, face mode, forced colours (Canvas lens, Highlight when lit) and more contrast.
- **GPU** (DPR 1 and 2, Relief, Objects and Instrument): the scene is version 4 with an emitter per lens in document
  order, its strength from the lens and the state, a protected rect for every text, the documented parts; with every lamp
  off the objects draw inside the boxes only (0 px outside, at three depths at Instrument), native hits on those pixels find
  the control and a grid over every box has 0 mismatches; turning a lamp on changes its box, lights the face at 1.5, 2 and
  3 lens diameters and not beyond its reach (0 px), and the label beside it stays within the guard (under 1 level);
  a real click gives fresh pixels with GPU on and no hit-geometry update; hover and disabled reach the parts; past 64
  emitters the rest are dropped with the diagnostic; more contrast and reduced transparency at Instrument; the
  accessibility snapshot is the same in DOM and GPU modes and axe passes on the GPU page.
- **Feedback** (`ui-lamp.test.mjs`): off by default; created after the first gesture; each toggle and press plays once;
  pulses only for the visitor's own input, not under reduced motion; muted is silent.
- **Bindings and Astro** (`ui-lamp-bindings.test.mjs`, `ui-lamp-astro.test.mjs`): the two examples above rendered
  exactly; controlled, uncontrolled, refs, attributes, Field, disabled, momentary; without JavaScript the Astro lamp is
  a native switch that submits.
- **Unit** (`strata-lamp.unit.test.mjs`): colours, sizes, boxes, the emitter and its budget, the blink tempos, the Relief
  and Objects entries, and the Instrument parts validated by core's `validateInstrumentScene` and contained over the whole
  reference stage at every depth and size (`checkContainment`).
