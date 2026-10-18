# StatusLight

Instrument, wave 2 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Shows a state with a small light, as an LED on a rack: link, recording, overheating. It takes no input. Renders one of
three native forms, named by its `label` (which is always the meaning; colour and blink never carry it alone):

- **Image** (the default): `<span role="img" aria-label="Link up">`, the lens inside it `aria-hidden`.
- **Text** (`showLabel`): a `<span>` with the lens and the label as visible text.
- **Live** (`live`): an `<output>`, whose implicit role `status` is a polite live region (`aria-live="assertive"` with
  `live="assertive"`), with the lens and the label as text, visually hidden unless `showLabel`. Changing the label
  names the change to a screen reader.

An input that is also a light is a [Lamp](lamp.md); a count or a label with a colour is a [Badge](badge.md).

## 2. Object

A **small lens** on the face: a dark glass dome unlit, a glowing, blooming, emitting one lit. No bezel.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the object) | Square, the lens + 16 (26 at medium) | 0 | No |
| Socket | Disc Ø lens + 2, printed on the face at every level | 0 | No |
| Lens | Ø `size.statusLight` (8, 10 or 14 px); Relief a disc, Objects a dome up to 0.3 of its diameter, Instrument a glass lens 0.35 of its diameter high | Above | No; it lights, and blinks |
| Emitter | A point light over the lens centre | 0.8 lens diameters | Strength 0 or on |

- **Colour** is a role (`colour`): `glowOn` (amber, the default), `accent`, `success`, `warning`, `danger` or `info`; the lens
  and its emitter are those of the [Lamp](lamp.md#2-object).
- **The emitter:** `emitter.led.radius` 6 lens diameters, `emitter.led.height` 0.8 and `emitter.led.strength` 520 for the
  10 px lens, scaled with the square of the lens; `emitter.guardFeather` 4 px. Unlit (`lit` false), the strength is 0.
- **`blink`** is a tempo token: `blink.slow` 1,600 ms a cycle, `blink.normal` 1,000 and `blink.fast` 400 (0.6, 1 and 2.5
  flashes a second), lit half of each cycle in steps. No tempo is faster than 334 ms, so a light never flashes more
  than three times a second (WCAG 2.3.1); the token validation and a scope refuse a faster one. It blinks only while it is
  lit, and **not under `prefers-reduced-motion`**: a blinking light then stays lit and steady.
- **Instrument:** [`gpu/instrument-lamp.ts`](../../../packages/ui/src/gpu/instrument-lamp.ts) draws the lens alone: a
  `lens` part (glass, a 1 px wall, 0.35 of its diameter high, `lens #rrggbb`) with its `emitter`, `bounds` the object's
  box. A blink is the emitter's strength going 0, full, 0 (uniform writes, no capture); the structure never depends on
  the state. The same past-64-emitters rule as the Lamp.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Socket | The role at 16% over dark glass | — | None (printed) |
| Lens, unlit | The role at 16% over dark glass | — | `lens` (`glass`) |
| Lens, lit | The role mixed 18% towards white | — | `glowOn` (`emissive`), an emitter |
| Label (when shown) | None (sits on the panel) | `text` | None |

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Unlit (`lit` false) | A dark disc | A dark dome | A dark glass dome | The unlit gradient |
| Lit | The disc in the lit colour; the face lit | The dome in the lit colour | The glass glows, blooms and lights the face | The lit gradient with a glow shadow |
| Blinking | The disc and the pool follow `--strata-lit` frame by frame | Same | The emitter's strength follows it | The `ug-blink` animation of `--strata-lit` |

Hover, pressed, focus, invalid and disabled do not apply: a StatusLight is not a control. Under
`prefers-contrast: more` emitters are off and a lit lens is flat colour with its socket in the lit colour; under
`prefers-reduced-transparency` the Instrument lens is an opaque dome; under `forced-colors` the lens is `Canvas` with a
`CanvasText` edge, `Highlight` when lit, with no glow and no blink.

## 5. Relief primitives

The lens is a `knob` face (`data-strata-face="knob"`) the helper draws as a `ring` face as wide as the lens at Relief, a
dome at Objects and a glass part at Instrument; its CSS paint is hidden while it does (`data-strata-dome`). The socket has no
face. Every visible lens is an emitter at every level, with the protected rects of the panel's text, as for the Lamp.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.statusLight` (8, 10, 14, `--strata-status-light-size`) | `size` |
| `colour.glowOn`, or `colour.accent`, `success`, `warning`, `danger`, `info` | `colour` |
| `blink.slow` (1,600 ms), `blink.normal` (1,000), `blink.fast` (400) | `blink` |
| `emitter.led.radius` (6), `emitter.led.height` (0.8), `emitter.led.strength` (520), `emitter.guardFeather` (4) | — |
| `colour.text`, `font.size.body`, `space.2` | — |
| `material.roles.lens`, `material.roles.glowOn` | `material` |
| `level` | `level` |

Props: `label` (required), `colour`, `lit` (true), `blink`, `showLabel`, `live` (`true`, `"polite"` or `"assertive"`), `size`,
`material`, `level`.

## 7. DOM structure and overlay needs

An image-form light:

```html
<span class="ug-status-light" data-strata-colour="success" role="img" aria-label="Link up">
  <span class="ug-status-light__object" aria-hidden="true">
    <span class="ug-status-light__socket"></span>
    <span class="ug-status-light__lens" data-strata-face="knob"></span>
  </span>
</span>
```

With its label shown, blinking:

```html
<span class="ug-status-light" data-strata-colour="danger" data-strata-blink="normal">
  <span class="ug-status-light__object" aria-hidden="true">
    <span class="ug-status-light__socket"></span>
    <span class="ug-status-light__lens" data-strata-face="knob"></span>
  </span>
  <span class="ug-status-light__text">Recording</span>
</span>
```

A live region, unlit, with the label read but not shown:

```html
<output class="ug-status-light ug-status-light--bare" data-strata-colour="accent" data-strata-lit="false">
  <span class="ug-status-light__object" aria-hidden="true">
    <span class="ug-status-light__socket"></span>
    <span class="ug-status-light__lens" data-strata-face="knob"></span>
  </span>
  <span class="ug-status-light__text">Disconnected</span>
</output>
```

- The root is the boundary: `class`, `style`, the Strata attributes and refs reach it. `data-strata-colour` is absent for
  the default; `data-strata-lit="false"` is an unlit light; `data-strata-blink` names the tempo. The object is
  `aria-hidden`, `pointer-events: none`.
- `setStrataStatusLight(element, { label, lit, colour, blink })` from `@underglass/ui/dom` changes a light in plain DOM and
  keeps its form valid: the label is the `aria-label` of an image form and the text of a text or live form.
- No overlay, no script: the blink is CSS.

## 8. Keyboard and screen reader

A StatusLight takes no focus and no input.

- The image form is announced as an image named by its label ("Link up"); a live light is a `status` whose text is read
  when it changes (once, politely, or assertively with `live="assertive"`). Write labels as states ("Link up",
  "Recording"), not as colours.
- **Meaning never rides on light alone** (1.4.1): the label is the meaning, so a blinking or coloured light is also
  named; a blink is decoration and stops under reduced motion.
- **Flashing** (2.3.1): never over three flashes a second.
- **Screen readers:** the manual script for a live light's announcements is VAL-002's, in
  [open issues](../../open-issues.md), until performed.

## 9. CSS presentation

An inline row: the object (the lens + 16 square, the socket and the lens as a radial gradient from the unlit to the lit
glass by `--strata-lit`, with a glow shadow when lit) and the label as text, which wraps (`overflow-wrap: anywhere`); the
light never exceeds its container. A `--bare` live light hides its text visually (1 × 1 px, clipped), so a screen reader
reads it and nothing shows.

- **`forced-colors: active`:** the lens is `Canvas` with a `CanvasText` edge, `Highlight` when lit, no glow, no blink.
- **`prefers-contrast: more`:** emitters off; flat colour, edged in the text colour; the socket takes the lit colour.
- **`prefers-reduced-motion: reduce`:** no blink; a lit light is steady.
- Face mode: the CSS lens is hidden, the socket stays.

## 10. Tests

- **Plain DOM** (`ui-status-light.test.mjs`): the image form has the role `img` named by its label; a shown label is text;
  a live light is an `<output>` (a status, polite and atomic in the accessibility tree) whose text changes once when its
  label does; `setStrataStatusLight` keeps every form valid; every box is the lens + 16.
- **Blink:** `--strata-lit` flips at the tempo token (2, 5 and 1.25 changes a second at `normal`, `fast` and `slow`), never
  over three flashes a second; an unlit light does not blink; under reduced motion 0 changes and no animation.
- **Mobile and preferences:** 390 and 320 px without overflow, 200% text without loss; axe in light, dark, face mode, forced
  colours and more contrast.
- **GPU** (DPR 1 and 2, Relief, Objects and Instrument): the scene is version 4 with an emitter per lens, the protected
  rects, the documented parts; with every light off the objects draw inside their boxes only; a light turning on lights the
  face within its reach and not beyond it, and the label beside it stays within the guard; the native hits are the DOM's;
  **300 frames with the blinking lights add 0 captures, 0 uploads and 0 hit-geometry updates**, the emitters follow the
  tempo, and the lit and dark phases differ in pixels; under reduced motion 0 pixels change in 2 seconds; more contrast and
  reduced transparency at Instrument; the accessibility snapshot is the same in DOM and GPU modes; axe on the GPU page.
- **Bindings and Astro** (`ui-lamp-bindings.test.mjs`, `ui-lamp-astro.test.mjs`): the three examples above rendered
  exactly, the live light's tag and attributes, and the props.
- **Unit** (`strata-lamp.unit.test.mjs`): the model of each form, the blink tempos, the emitter, the Instrument lens validated
  by core's `validateInstrumentScene` and contained at every depth and size.
