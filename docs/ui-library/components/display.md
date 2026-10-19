# Display

Instrument, wave 2 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).
The editable Display is the [TextField](text-field.md#11-the-display-form)'s `display` form; this page is the read-only
Display, `<output>`, and the object both share.

## 1. Purpose and native element

Shows a value as the display of a piece of equipment does: text under a pane of glass in a bezel, lit from behind. A
read-only Display renders a native `<output>` (implicit role `status`, a polite live region); an editable one is the
TextField's native `<input>`, so typing, selection, the caret, composition (IME), autofill and form submission are the
browser's and nothing is reimplemented. The WAI-ARIA Authoring Practices have no pattern for either, because the native
elements carry the roles; the pattern is the [Status](https://www.w3.org/WAI/ARIA/apg/) role's for an `<output>` and the
textbox's for an `<input>`.

**Which element where:**

| You want | Use | Why |
| --- | --- | --- |
| A value the page computes and shows (a frame rate, a total, a clock) | `Display` (`<output>`) | A live region by itself; it is not a form value and is never submitted |
| A value the user may type | `TextField` with `form="display"` | A native `<input>` |
| A value the user may read and select but not change, which must be submitted with the form | `TextField` with `form="display"` and `readOnly` | `<input readonly>` submits; an `<output>` never does |

A label is required: a `<label for>` (or a [Field](field.md)), `aria-labelledby`, or `label` (`aria-label`). `<output>` takes
`for` (the controls its value is computed from) and `name` natively; neither changes how it looks.

## 2. Object

A **window** of glass set in a **bezel**, with the text printed under the glass and a **backlight** behind it. The native
element covers the whole display, bezel included, so every pixel of the object lies inside its box and every press lands on
it (a press on the bezel puts the caret where it is nearest, as a press on the window does).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native element) | 236 × 56 at medium (`min(100%, 236px)` wide; the window's height, `size.control` plus its offset, and 22 px) | 0 | No |
| Bezel | A frame 4 px in from the box (the room for its cast shadow), 7 px wide (`display.bezel.width`), radius 8 (`display.bezel.radius`), a 1 px `edge` border | Relief: a groove (`elevation.well`); Objects: a slab fitted to the box; Instrument: a polished prism 2.4 high, a 2 px chamfer | No |
| Window | The bezel's inside (214 × 34), radius 4, a 1 px `edge` border (2 px `danger` when invalid) | Relief and Objects: a flat face; Instrument: a glass pane 2.4 high with a 2.6 px bevel | No |
| Text | The native element's own, in the monospace family at `control.font`, a line and a half of room | Captured with the face | No |
| Backlight | A light behind the glass: 1 to 6 emitters along the window, one per two window heights of length | 0.5 window heights | Strength 0 or on |

- **The text is printed under the glass, and the GPU never draws text.** It stays captured content at every level. A pane
  of glass in the Instrument object table is a *window* (Rendering Model 2D.6): its flat region is the capture itself, so the text
  and the face under it are the DOM's own pixels, to the level, and the light never changes them. The glass shows only where it
  does not cover text: the bevel at the window's edge (3 px, which refracts the face), and the reflection band, which the
  display turns off wherever text can reach its zone (below).
- **The backlight** is an emitter ([design language section 3](../design-language.md#emitters)), as a Lamp's lens is,
  with its own tokens: `emitter.display.radius` 2.5 window heights, `emitter.display.height` 0.5 and `emitter.display.strength`
  2,200† for the 34 px window (36 px is the reference, and the strength scales with the square of the window's height),
  shared between the emitters of a window (divided by √*n*). A long window is lit along its length: `round(width / (2 · height))`
  emitters, from 1 to 6. It lights the bezel, the face round the display and the window's padding, never the text: **the text
  box is a protected rect** (below), where the light is held within `interior.max`.
- **Lit** is `--strata-lit` (the Lamp's registered number): 1 by default, 0 when the display is `backlight="off"`, switched
  off (`data-strata-lit="false"`), disabled or under `prefers-contrast: more`. Unlit keeps the emitters in place at strength 0, so
  the scene's structure never depends on it.
- **The backlight's colour** is a role (`backlight`): `glowOn` (amber, the default), `accent`, `success`, `warning`, `danger`
  or `info`, or `off`. The window carries a static tint of its role (10% over `colour.field`, part of the capture, so a toggle
  changes no captured pixel); the glow is the GPU's emitters, and in the CSS presentation a radial gradient and a shadow.
- **The protected rect** is the content box of the native element, an input's or an output's (the text's room: the window's inside, so
  the window is one even colour and the bezel is lit in full); an output's text runs are protected too. The helper never protects the bezel.
- **The finish zone** (a reflection band 0.3 and a dark horizon 0.25, `display.finish`, in the top 31% of the window) is
  turned off wherever text can reach it, as key tops do (design language section 4): an input's text can be anywhere in its
  content box, an output's is its first run, so in a 34 px window it is off. It draws on a taller window whose text sits below it
  (`finishAllowed`).
- **At Relief and Objects** the bezel is a groove (Relief) or a slab (Objects, standing only as high as the box lets its shadow
  reach) and the window a flat face; both are the face's own pixels with the GPU's relief on them. At Objects the slab's top is
  the capture lifted, so only the face round the display takes the light.
- **At the Instrument level** [`gpu/instrument-display.ts`](../../../packages/ui/src/gpu/instrument-display.ts) builds the
  object from the laid-out bezel and window, bounded by the native element's box:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `bezel` | A prism 228 × 50, radius 8, 2.4 high, a 2 px chamfer; its caster is capped where its shadow would leave the box | `displayBezel`: satin aluminium (239, 240, 241), metallic, roughness 0.28 | None |
  | `window` | A prism over the window 214 × 34, radius 4, 2.4 high, a 2.6 px bevel; `glass: "window"`, `finish` only where no text can reach its zone | `displayGlass`: glass (index 1.5, tint (232, 240, 238), absorption 0.03, reflection 1.5) | None |

  The parts never depend on the state: the backlight is the emitters' strength, so a toggle is a uniform write, and typing never
  rebuilds the layer. **The bezel is a solid under the window:** core's exact pixels cover it where the capture is opaque, so the
  window shows the capture. Under `prefers-reduced-transparency` the window shows the plain capture (the pane is left out, the bezel stays).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Window | `field`, 10% towards the backlight's role (none when off) | `text` | `field` (a flat face) |
| Bezel | `knob` metal, a 1 px `edge` border | — | `knob` (`satin`), the polished `bezel` at the Instrument level |
| Placeholder | — | `muted` | — |
| Invalid edge | `danger`, 2 px round the window | — | None (captured) |
| Glass | — | — | `display` (`glass`) |
| Backlight | The role colour, as light | — | `glowOn` (an emitter) |

`data-strata-material` on the display overrides the bezel's material. The text on the window meets 4.5:1 against the tinted
field in every theme; the glow is the GPU's light, held within `interior.max` over the text.

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | A groove and a flat window | A slab and a flat window | The bezel and the glass pane | The bezel's gradient and edge, the window's inner shadow |
| Focus-visible | An accent outline just outside the bezel (3 px, inside the box's room) | Same | Same | `outline` on the bezel, in every presentation; the native element has none |
| Disabled | Text at 38%, the backlight off | Same | Same | The bezel flattened, `--strata-lit: 0` |
| Invalid (`aria-invalid="true"`) | A 2 px `danger` edge on the window | Same | Same | `border` on the window |
| Read-only | As rest; focusable and selectable, no typing | Same | Same | Rest |
| Value change | The text is captured (once per change) | Same | Same | The browser's |
| Backlight toggled | Emitter strengths (uniforms); the attribute write itself is captured once | Same | Same | `--strata-lit` |

Hover, pressed, selected and busy do not apply: a display lifts nothing on hover (the bezel's shadow would move).

## 5. Relief primitives

A `groove` for the bezel (a slab at Objects) and a `flat` face for the window. The native element carries no
`data-strata-face`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `display.bezel.width` (7), `display.bezel.radius` (8) | — |
| `display.finish.band` (0.3), `display.finish.horizon` (0.25) | — |
| `emitter.display.radius` (2.5), `emitter.display.height` (0.5), `emitter.display.strength` (2,200†), `emitter.guardFeather` (4†) | — |
| `colour.field`, `colour.edge`, `colour.text`, `colour.muted`, `colour.danger`, `colour.knob`, `colour.glowOn`, and the status roles for `backlight` | `backlight` |
| `elevation.well`, `elevation.raised`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob`, `material.roles.field`, `material.roles.display` | `material` |
| `size.control`, `size.font`, `space.3`, `font.family.mono` | `size` |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

† Provisional, with the premium character (`emitter.display` is in its provisional list; its unprototyped `display.backlight`
is gone: the strength is the emitter token's). Props of `Display`: `children` (the value), `label`, `live` (`off`, `polite`,
`assertive`), `backlight`, `lit`, `id`, `size`, `material`, `level`, and in React the ref (the `<output>`); the TextField's
`form="display"` takes `backlight` and `lit` too.

## 7. DOM structure and overlay needs

An editable display (a TextField with `form="display"`):

```html
<span class="ug-display ug-display--input" data-strata-backlight="accent" data-strata-form="display">
  <span class="ug-display__object" aria-hidden="true">
    <span class="ug-display__bezel" data-strata-face="groove">
      <span class="ug-display__window" data-strata-face="flat"></span>
    </span>
  </span>
  <input class="ug-display__text" id="note" type="text" placeholder="Type here" />
</span>
```

A read-only display (`Display`):

```html
<span class="ug-display ug-display--output" data-strata-backlight="success" data-strata-form="display">
  <span class="ug-display__object" aria-hidden="true">
    <span class="ug-display__bezel" data-strata-face="groove">
      <span class="ug-display__window" data-strata-face="flat"></span>
    </span>
  </span>
  <output class="ug-display__text" id="rate-contract" aria-label="Frame rate">60 fps</output>
</span>
```

A read-only input, backlight off (a value that must submit):

```html
<span class="ug-display ug-display--input" data-strata-backlight="off" data-strata-form="display" data-strata-lit="false">
  <span class="ug-display__object" aria-hidden="true">
    <span class="ug-display__bezel" data-strata-face="groove">
      <span class="ug-display__window" data-strata-face="flat"></span>
    </span>
  </span>
  <input class="ug-display__text" id="serial-contract" aria-label="Serial" readonly />
</span>
```

- The `.ug-display` root is the boundary for `class`, `style`, `size`, `material` and `level`; the native element takes the ref
  and every native attribute (`id`, `name`, `type`, `value`, `readonly`, `disabled`, `required`, `aria-*`, `for`). `data-strata-form="display"`
  names the form; `data-strata-backlight` is the role (or `off`), absent for the default `glowOn`; `data-strata-lit="false"` is an unlit
  backlight, absent when lit.
- The native element is square, transparent, `padding` the bezel and the text's room, and covers the whole display above the
  object (`pointer-events: none`, `aria-hidden`). Inside a [Field](field.md) the editable one takes the Field's id, description,
  invalid, required and disabled state.
- An editable display that takes an `icon` ignores it: the display has no icon slot (the plain TextField keeps its).
- No overlay. Browser autofill and suggestion lists belong to the browser.

## 8. Keyboard and screen reader

Typing, selection, Home, End, Backspace, the clipboard and IME composition are native: the whole display is the `<input>`.
Tab and Shift+Tab move focus; an `<output>` is not a tab stop and a disabled input takes no focus.

- Roles: `textbox` (`searchbox`, `spinbutton` by `type`), named by the label; `status` for the `<output>`, named by its label.
- **Live values.** `<output>` is a polite live region natively: a changed text is announced once, after the screen reader is
  quiet, so the default suits a value that changes when something happens (a total, a status). For a value that changes faster than it can be
  read (a frame rate, a clock), give it `live="off"` (`aria-live="off"`) and let a nearby control or a slower `Display` say it; `live="assertive"` is for an urgent one.
  Changing the text is the only thing that announces: the backlight, the glass and the bezel are decoration.
- **A value at frame rate.** The text under the glass is captured content, so a changed text is a DOM mutation and a capture, one
  each: that cannot be avoided, only bounded. `driveStrataDisplay(element, text, { interval })` from `@underglass/ui/dom` writes the
  latest text at most once an `interval` (100 ms by default, so at most 10 captures a second), skips a text the display already shows,
  and shows the first text at once; `releaseStrataDisplay` writes the pending text now. The GPU never draws the text itself, so there is no
  uniform path for a value as there is for a [Meter](meter.md)'s: a number that must move every frame is a Meter or a Gauge. Measured: 60 values in
  1.03 s write 11 times; 300 frames of a driven readout write 44 to 48 times in 5.5 s, each a capture and an upload, with 0 hit-geometry updates.
- **Meaning never rides on light alone** (WCAG 1.4.1): the backlight's colour is decoration; the value is the text, and an invalid
  display's 2 px edge pairs with the message in its description.
- **Contrast.** Text on the tinted window meets 4.5:1 in every theme; the backlight is held within `interior.max` over the text (the
  guard), and is off under `prefers-contrast: more`.
- **Target size** (2.5.8): the box is at least 56 px high and the native element is all of it.

## 9. CSS presentation

A bezel of metal with an inner edge and a cast shadow in its 4 px of room, a window with an inner shadow and the role's tint, the text
in the monospace family (tabular numerals), and, lit, a glow shadow round the bezel and a radial gradient in the window.

- **Face mode** (`data-strata-mode="face"`, GPU on): the glow, the gradients and the shadows are taken away (the emitters are the
  light, the relief is the GPU's), and at the Instrument level the bezel's CSS paint is hidden (`data-strata-dome`), so toggling the
  light or typing repaints only the text.
- **Reflow:** the display is `min(100%, 236px)` wide and shrinks to its container; the text scrolls inside the window, as an input's does.
- **Text size:** the window is a line and a half of the text plus 12 px at least, so at 200% text the window grows (to 48 to 51 px
  at 320 px) and the line stays inside it.
- **`forced-colors: active`:** the bezel and window are `Canvas` with a `CanvasText` edge, no shadow and no glow, the text `CanvasText`
  (`GrayText` when disabled), the focus outline `Highlight`.
- **`prefers-contrast: more`:** the high-contrast theme applies through the tokens; the window is the plain field with a
  text-coloured edge, no tint and no glow, and its emitters are off.
- **`prefers-reduced-transparency: reduce`:** the window shows the plain capture; the Instrument pane is left out.
- **`prefers-reduced-motion: reduce`:** nothing here moves.

## 10. Tests

- **Plain DOM** (`ui-display.test.mjs`, real markup): the role and name of every display; its box (236 × 56, the bezel 4 px in and the window
  11 px in) and a grid of `elementFromPoint` over it finding the native element; typing, Home, End, Delete, Backspace, select-all, shift-arrows,
  double-click, a click on the bezel placing the caret, paste, an IME composition and a form submission (a read-only input submits, an
  output and a disabled input do not); the tab order; a live region changing once per write and `driveStrataDisplay` bounding 60 values to 11 writes;
  the backlight's `--strata-lit` for every state; the focus ring on the bezel; 390 and 320 px; 200% text; axe in light, dark, face mode,
  forced colours and more contrast.
- **GPU** (`ui-display.test.mjs`, DPR 1 and 2, Relief, Objects and Instrument): GPU stays on; the scene is version 4 with the backlight's
  emitters in document order (positions, strengths from the lit state, the role's colour), the protected rects of every text and none over
  a bezel, and the documented entries or parts; the objects draw inside the boxes only (0 px outside, over depth 0, 0.5 and 1) and native hits on
  them find the native element; the backlight lights the bezel and the face round the display and protected text stays within the guard;
  at the Instrument level **the text under the glass is the capture itself**: 0 of 30,726 px of the text boxes differ from the DOM's own
  rendering at DPR 1 and 0 of 120,700 at DPR 2, and no pixel of them changes when the backlight is toggled; the caret and the selection are visible and
  where the text puts them at every level (measured by pixels, as in the DOM); typing is captured per keystroke with 0 hit-geometry
  updates, a script's text change once, an unchanged text never; a backlight toggle is its attribute's one capture; 300 frames idle with the backlight on add 0 captures, uploads
  and hit-geometry updates; a driven display's captures are its own writes; past 64 emitters the rest are dropped with the diagnostic; more
  contrast turns the lights off and reduced transparency leaves the pane out; the accessibility snapshot is the same in DOM and GPU modes; a
  resize, a DPR change, a hidden tab and a structure change keep GPU on. Checked in a headful Canary window as well (a headful window's clipboard is closed to automation, so there the paste is an inserted text).
- **Bindings and Astro** (`ui-display-bindings.test.mjs`, `ui-display-astro.test.mjs`): React, Vue and Astro render the markup above exactly;
  typing writes the state and a changed state moves the text; the ref, `className`, `style` and attributes; a `form` that is not `display`
  stays the native form owner's id.
- **Unit** (`strata-display.unit.test.mjs`): the forms and roles, the markup model, the emitters, the tokens, the Relief and Objects entries,
  and the Instrument parts validated by core's `validateInstrumentScene` and contained over the whole stage at every depth (`checkContainment`).
- **A finding for core** (the Meter's, again): against the layer core draws with no window, no bezel and no relief (the same capture through the layer pass),
  the text boxes differ at 23,832 of 30,726 px at DPR 1 and 93,648 of 120,700 at DPR 2, by at most 10 levels: the layer pass does not reproduce the capture bit
  for bit where the exact twin does, so the comparison that is exact is the glass against the DOM's own rendering, which the suite asserts.
- **Not yet:** the `segments` look (a seven-segment or dot-matrix typeface needs a font asset: a follow-up), the manual screen-reader script
  for a live readout (VAL-002) and a real operating-system IME (VAL-001), both in [open issues](../../open-issues.md) until performed, a low-end GPU.
