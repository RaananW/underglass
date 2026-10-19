# PatchPoint and PatchBay

Instrument, wave 3 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

Shows and sets a connection, as on a patch bay or a modular synthesiser: an output routed or not, a send, a link. A
**PatchPoint** renders a native `<input type="checkbox">` in its label row, connected when it is `checked`, or, with
`button`, a native `<button aria-pressed>` that is connected while pressed. The element is native; the jack is
decoration. The state is `checked` (or `aria-pressed`), the printed label names the jack, and the plug standing out of the
hole is never the only thing that says so (WCAG 1.4.1). The optional LED under the jack is a [StatusLight](status-light.md) lens,
decoration too.

A **PatchBay** renders a `<fieldset>` of PatchPoints on one plinth, named by its `<legend>`, with the jacks' labels printed on
it. Keyboard, labels, `name`, form submission and `disabled` (a disabled fieldset disables every jack in it) are native.

A switch with a visible lever is a [Switch](switch.md), a lit state a [Lamp](lamp.md), a choice submitted with a form a
[Checkbox](checkbox.md).

## 2. Object

A **jack in a washer**: a turned ring with a hole in it, printed dark, and, while the jack is connected, a **plug**
standing out of the hole with a short **cable** running down the screen over the washer.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native control, or, for a button, its object) | Square, the washer + 20 (56 at medium) | 0 | No |
| Washer | Circle of `size.patchPoint` (28, 36 or 44 px) | Relief 2, Objects 2 (fitted), Instrument 2.2 | No |
| Hole | Circle 0.44 of the washer, to the even px (12, 16, 20), printed dark on the face | Relief a well 2 deep, Objects a pit, Instrument the ring's bore | No |
| Barrel (Instrument) | A polished ring round the hole, 3.2 wide, on the washer | 1.8 on the washer | No |
| Plug | Circle 0.34 of the washer, to the even px (10, 12, 14) | Relief a dome 5 (fitted), Objects a dome on the pit's floor; Instrument 11 | Rises out of the hole when connected |
| Cable | A stub 0.11 of the washer wide (about 3, 4 and 5 px), from the plug's centre to 2 px short of the washer's edge, running towards the bottom of the screen | Printed (Relief, Objects); Instrument at 7.8, under the plug's shoulder | Appears with the plug |
| LED (optional) | A [StatusLight](status-light.md) lens (Ø `size.statusLight`) under the jack, lit while connected | As the StatusLight's | It lights |

- **The box rule.** The native control covers the whole object: the washer, the plug, the cable and their cast shadows lie inside the
  box (10 px of room each side of the washer), at every depth and every stage position, and a press anywhere on the box is a press on the
  control. The input is a transparent square box with no face, so no corner lets a press fall to the row; a button PatchPoint's button holds
  the object, the LED and the label, and the object's pixels hit the button.
- **Decision: the cable is contained, not grown.** The cable stub runs over the washer, so the jack's box does not grow when it is
  connected (the layout never moves on a connect) and the unplugged jack needs no room for a cable it does not have. A longer cable would
  need a `cable` size token and room the unplugged jack keeps empty; the stub is short, as the plan says, and a page that wants more routes its
  own print.
- **At the Relief and Objects levels** the washer is a raised disc (Relief) or a round slab (Objects), the hole a well or a pit sunk in it, and
  the plug, shown only while connected, a knob face or a dome standing on the pit's floor
  ([`gpu/patch-forms.ts`](../../../packages/ui/src/gpu/patch-forms.ts)). Each stands only as high as its box lets its shadow reach (2.8). The cable's
  stub is printed on the page (captured), so a connect repaints the jack's box and nothing outside it.
- **At the Instrument level** (`data-strata-level="instrument"`) the jack is the [Instrument object table](../design-language.md#instrument-object-table)'s
  PatchPoint, built by [`gpu/instrument-patch.ts`](../../../packages/ui/src/gpu/instrument-patch.ts) from the laid-out washer:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `plate` | Lathe ring: outer radius = the washer's, the hole's radius inside, 2.2 high, a 0.5 edge break, the bore's wall down to the face | `knobCap`: brushed, roughness 0.3 | None |
  | `bushing` | Lathe ring on the washer round the hole, 3.2 wide, 1.8 high, a 0.4 edge break, the bore's wall continuing | `knobSkirt`: polished, roughness 0.04 | None |
  | `slot` | A flat dark disc in the hole, 0.03 above the face | `knobInk`: (38, 40, 44), roughness 0.6 | None |
  | `pivot` | The plug: a lathe cylinder Ø 0.34 of the washer, 11 high, a 1 px chamfer | `knobSkirt` | `travel` from −(plug height + 1) to 0 |
  | `lever` | The cable: a lathe tube Ø 0.11 of the washer and a rounded end, laid down by `tilt` 90° about `axis` 180° to run towards the bottom of the screen, at the plug's shoulder (it clears the barrel) | `patchCable`: satin rubber (44, 47, 54), roughness 0.42 | The same `travel`, `tilt` 90°, `axis` 180° |

  The object's `bounds` is the control's box and `t` the plug's seating, 0 unplugged and 1 connected, from `checked` (or `aria-pressed`)
  on `spring.patch` (stiffness 1,100, damping 60: 0.1 % overshoot, so it seats without a bounce, clamped at the stops), instant under reduced motion. **The parts never depend
  on the state, which would rebuild the layer:** unplugged, the plug and the cable are sunk below the hole's floor and under the washer, out of
  sight; connected, they rise out of the hole. A connect is a native change that core captures once (the plug's and the stub's CSS paint
  are hidden, so nothing else repaints); the rising frames are uniform updates with no capture. If an object could not stay in its box,
  core draws its Relief primitive (a raised circle the size of the washer) and reports it.
- **Containment is checked on core's own validator** over the whole seating, in every corner of the 1920 × 1080 reference stage at depth scales
  0.6, 1 and 1.6, for all three sizes: the closest vertex is 5.0 px inside the box at 160 % depth, and 8.1 at 100 %.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Washer | `knob` metal; `edge` ring | — | `knob` (`satin`); brushed at Instrument |
| Hole | `edge` mixed 72% to black (printed) | — | `field` (a well) |
| Plug | `knob` metal | — | `knob`; polished at Instrument |
| Cable | `edge` mixed 55% to black (printed); rubber at Instrument | — | None (printed); `patchCable` |
| Label | None (sits on the panel or the plinth) | `text` | None |
| Plinth (PatchBay) | `secondary` | — | `panel` |

`data-strata-material` on the jack overrides the washer's and the plug's material. The state is shown twice: by the plug and the cable, and by
the control's own `checked` or `aria-pressed`, which the label names. The label must not contain "connected": screen readers announce the state.

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Unplugged | A dark hole in the washer | A dark pit | The hole's floor, the plug sunk | The hole printed dark |
| Connected (`:checked`, or pressed) | A dome plug in the hole, the cable printed | A dome on the pit's floor | The plug and the cable risen | The plug and the cable shown |
| Hover | The washer's height `× state.hoverHeight` | The washer rises by a quarter | No pose change | `--_lift`, `--_tone` on the washer |
| Pressed (`:active`) | As hover | As hover | As hover | As hover |
| Focus-visible | An accent ring round the washer, captured | Same | Same | `outline: focus.width solid accent` |
| Disabled | Parts flat, the object at 38% (a connected jack keeps its plug) | Same | Same, LED unlit | `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on the washer | Same | Same | `border` in `danger` |

Busy does not apply. Under `prefers-reduced-motion` the plug is seated at once (no spring). Under `prefers-contrast: more` the washer, the hole
and the plug are edged in the text colour and the cable is the text colour; under `forced-colors` the washer is `Canvas` with a `CanvasText`
edge round a `CanvasText` hole, and a connected jack shows a `Highlight` plug and cable, so the state shows by fill (no shadows), with a
`Highlight` focus ring and `GrayText` when disabled.

## 5. Relief primitives

- The washer is a `raised` face (a circle, `data-strata-face="raised"`); at Objects a round slab.
- The hole is a `well` face (`data-strata-face="well"`); at Objects a pit sunk from the washer's top. Its dark floor is printed on the
  face at every level, so the hole reads as a recess whatever draws its edge.
- The plug is a `knob` face (`data-strata-face="knob"`), a dome at Objects, drawn by the GPU only while the jack is connected (it is
  `visibility: hidden` otherwise); its CSS paint is hidden while the GPU draws it (`data-strata-dome`).
- The stub has no face: it is printed on the page at Relief and Objects, and a part at Instrument (its CSS paint hidden).
- The optional LED is an ordinary [StatusLight](status-light.md) lens and an **emitter** at every level: its strength is its `--strata-lit`, 0 until
  the jack is connected, so a connect is a uniform write for the light ([design language section 3](../design-language.md#emitters)).

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.patchPoint` (28, 36, 44, `--strata-patch-point-size`) | `size` |
| `spring.patch` (stiffness 1,100, damping 60) | — |
| `colour.knob`, `colour.edge`, `colour.secondary`, `colour.text`, `colour.accent` (focus), `colour.danger` | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `bevel.*`, `shadow.*` | — |
| `material.roles.knob`, `material.roles.field`, `material.roles.panel` | `material` |
| `size.statusLight`, `colour.success` (the LED's default), `emitter.led.*`, `emitter.guardFeather` | `led` |
| `font.size.small`, `space.1`, `space.2`, `space.3`, `space.4`, `radius.panel`, `gap.control`, `focus.width`, `focus.offset`, `feedback.click.*`, `feedback.thunk.*` | — |
| `level` | `level` |

`spring.patch` and `size.patchPoint` are the premium character's (provisional until the look sign-off). **PatchPoint props:** `children` (the printed
label), `button` (a `<button aria-pressed>`), `connected` (for a button: its `aria-pressed`), `led` (`true` for the `success` colour, or a colour role),
`invalid`, `id`, `name`, `form`, `disabled`, `checked` / `defaultChecked` (or `v-model`), `size`, `material`, `level`; in React the ref reaches the native
control (Vue exposes `input`). **PatchBay props:** `legend`, `columns` (fixed columns; as many as fit by default), `disabled`, `size`, `material`, `level`.

## 7. DOM structure and overlay needs

A checkbox PatchPoint with an LED:

```html
<label class="ug-patch-point">
  <input class="ug-patch-point__input" type="checkbox" id="out1" name="out1">
  <span class="ug-patch-point__object" aria-hidden="true">
    <span class="ug-patch-point__washer" data-strata-face="raised"></span>
    <span class="ug-patch-point__jack" data-strata-face="well"></span>
    <span class="ug-patch-point__stub"></span>
    <span class="ug-patch-point__plug" data-strata-face="knob"></span>
  </span>
  <span class="ug-status-light ug-patch-point__led" aria-hidden="true" data-strata-colour="success">
    <span class="ug-status-light__object" aria-hidden="true">
      <span class="ug-status-light__socket"></span>
      <span class="ug-status-light__lens" data-strata-face="knob"></span>
    </span>
  </span>
  <span class="ug-patch-point__label">Out 1</span>
</label>
```

A button PatchPoint, pressed, with an amber LED:

```html
<button class="ug-patch-point ug-patch-point--button" type="button" aria-pressed="true" id="ret1">
  <span class="ug-patch-point__object" aria-hidden="true">
    <span class="ug-patch-point__washer" data-strata-face="raised"></span>
    <span class="ug-patch-point__jack" data-strata-face="well"></span>
    <span class="ug-patch-point__stub"></span>
    <span class="ug-patch-point__plug" data-strata-face="knob"></span>
  </span>
  <span class="ug-status-light ug-patch-point__led" aria-hidden="true" data-strata-colour="warning">
    <span class="ug-status-light__object" aria-hidden="true">
      <span class="ug-status-light__socket"></span>
      <span class="ug-status-light__lens" data-strata-face="knob"></span>
    </span>
  </span>
  <span class="ug-patch-point__label">Ret 1</span>
</button>
```

A PatchBay of two jacks in two columns:

```html
<fieldset class="ug-patch-bay" data-strata-face="raised" style="--strata-patch-columns: 2;">
  <legend class="ug-patch-bay__legend">Outputs</legend>
  <div class="ug-patch-bay__jacks">
    <label class="ug-patch-point">
      <input class="ug-patch-point__input" type="checkbox" id="bay1" name="bay1">
      <span class="ug-patch-point__object" aria-hidden="true">
        <span class="ug-patch-point__washer" data-strata-face="raised"></span>
        <span class="ug-patch-point__jack" data-strata-face="well"></span>
        <span class="ug-patch-point__stub"></span>
        <span class="ug-patch-point__plug" data-strata-face="knob"></span>
      </span>
      <span class="ug-patch-point__label">Bay 1</span>
    </label>
    <label class="ug-patch-point" data-strata-size="small">
      <input class="ug-patch-point__input" type="checkbox" id="bay2" name="bay2">
      <span class="ug-patch-point__object" aria-hidden="true">
        <span class="ug-patch-point__washer" data-strata-face="raised"></span>
        <span class="ug-patch-point__jack" data-strata-face="well"></span>
        <span class="ug-patch-point__stub"></span>
        <span class="ug-patch-point__plug" data-strata-face="knob"></span>
      </span>
      <span class="ug-patch-point__label">Bay 2</span>
    </label>
  </div>
</fieldset>
```

- The row (the `<label>`, or the button) is the boundary: `class`, `style`, `data-strata-size` and refs reach it (the ref reaches the native
  control). The object (`aria-hidden`, every part `pointer-events: none`) lies over the checkbox's input, which is a transparent square box with
  no face, in the same grid cell; for a button it is the first child. The row is a column: the object, the LED if there is one, the printed label.
- A jack is connected when `:checked` or `[aria-pressed="true"]`; the plug and the stub are `visibility: hidden` until then (they keep their
  boxes, so the layout never moves). The LED's `--strata-lit` is 1 then (0 when the jack is disabled).
- The button's `aria-pressed` is kept by `attachStrataPatchPoints` (below), which toggles it on click and dispatches a bubbling
  `strata-pressed-change` event with `{ pressed }`; a button has no form value (use a checkbox where the connection is submitted).
- A PatchBay is a `<fieldset>`: `data-strata-face="raised"` makes it the plinth, its `<legend>` is floated into it (it prints on the plinth,
  not across its edge), and `.ug-patch-bay__jacks` is a grid of `--strata-patch-columns` columns, or as many as fit.
- No overlay.

## 8. Keyboard and screen reader

| Input | Checkbox PatchPoint | Button PatchPoint |
| --- | --- | --- |
| Click, tap, the label | Toggles (native) | Toggles `aria-pressed` and clicks (native) |
| Space | Toggles (native) | Toggles (native click) |
| Enter | Does nothing, as a checkbox | Toggles (native click) |
| Tab, Shift+Tab | Move focus (native order; the bay is one group, not one tab stop) | Move focus |

- A checkbox PatchPoint's role is `checkbox`, its state `checked`; a button's is `button` with `aria-pressed`. The name of both is the printed label
  (inside a PatchBay, the group's name is its legend: `group` "Outputs"). Name the jack by what it is ("Out 1"), never by its state.
- Help and error through `aria-describedby` ([Field](field.md) without `label`).
- **Meaning never rides on the plug or the light alone** (WCAG 1.4.1): a connected jack is also `checked` or `aria-pressed` and named by its label; the LED's
  colour carries no meaning of its own (it is decoration, `aria-hidden`). Forced colours and more contrast draw the state as a fill.
- **Target size** (2.5.8): the box is at least 48 px square (28 px washer + 20).
- **Feedback** ([design language section 20](../design-language.md#20-feedback)): where on, a jack plays `click` as it is connected and `thunk` as it is
  disconnected (a plug seating, a plug pulled), once per change; a pulse (8 ms, then 16 ms) answers only the visitor's own input and stops under
  reduced motion. Both are off by default (`feedback.sound`, `feedback.haptics`, or `attachStrataFeedback`). `attachStrataPatchPoints` from
  `@underglass/ui/dom` (one set of passive delegated listeners per document; `attachStrata` and the React, Vue and Astro components attach it) toggles
  a button and plays the feedback.
- **Screen readers:** the manual script for a patch bay (a group of checkboxes with a legend) is VAL-002's, in [open issues](../../open-issues.md), until
  performed.

## 9. CSS presentation

A washer in the knob's metal, the hole printed dark under it, and, connected, a plug (a radial gradient disc) and a cable stub (a rubber-dark bar down the
washer). The row is a column that wraps its label (`overflow-wrap: anywhere`) and never exceeds its container; a PatchBay's jacks are a grid of as many
columns as fit (cells of at least the washer + 28), so a 320 px viewport and 200% text reflow.

- **`forced-colors: active`:** the washer is `Canvas` edged in `CanvasText` round a `CanvasText` hole; connected, a `Highlight` plug and cable; no shadows;
  a `Highlight` focus ring; `GrayText` when disabled; the plinth edged in `CanvasText`.
- **`prefers-contrast: more`:** the washer, the hole and the plug are edged in the text colour; the cable is the text colour.
- **`prefers-reduced-motion: reduce`:** nothing differs in CSS (a jack does not move there); the GPU seats the plug at once.
- Face mode (`data-strata-mode="face"`, GPU on): the plug's and the washer's CSS paint is hidden at the Instrument level (the plug's at every level), the
  stub's at the Instrument level; the printed hole, the printed cable (Relief and Objects), the legend and the focus ring stay.

## 10. Tests

- **Plain DOM** (`ui-patch-point.test.mjs`, real input): a click on the box, on its corner and on the label toggles once, one `input` and one `change`;
  Space toggles, Enter does not; form data follows `checked`; a disabled jack stays, and a disabled `fieldset` disables the bay's jacks; a button toggles
  `aria-pressed` with a click, Space and Enter and dispatches `strata-pressed-change`; every box is the washer + 20 px and a grid of `elementFromPoint`
  over every box finds the control; the plug and the stub show only while connected and the LED is lit while connected.
- **Mobile:** at 390 and 320 px no horizontal overflow, every box at least 24 px, labels whole, the bay's jacks reflow; at 200% text the labels wrap without
  loss; touch taps toggle.
- **Preferences:** axe in light, dark, face mode, forced colours (a `Highlight` plug) and more contrast.
- **GPU** (DPR 1 and 2, Relief, Objects and Instrument): the scene is the documented one (at Instrument a version 4 `instrument` scene with a `plate`,
  `bushing`, `slot`, `pivot` and `lever` per jack, in document order, and an emitter for each LED); with every jack unplugged and connected the parts draw
  inside the boxes only (0 px outside, at three depths at Instrument), native hits on those pixels find the control and a grid over every box has 0
  mismatches; a connect changes pixels inside its box (and the LED's light) only; a real click gives fresh pixels with GPU on and no hit-geometry update, and at
  the Instrument level no capture beyond the native change; the plug is sunk and hidden unplugged (the box's pixels equal the same jack's with its plug part
  removed); reduced motion seats the plug at once; the accessibility snapshot is the same in DOM and GPU modes and axe passes on the GPU page.
- **Feedback** (`ui-patch-point.test.mjs`): off by default; a connect plays `click` and a disconnect `thunk`, once each, for the visitor's own input only.
- **Bindings and Astro** (`ui-patch-point-bindings.test.mjs`, `ui-patch-point-astro.test.mjs`): the three examples above rendered exactly; controlled, uncontrolled,
  refs, attributes, Field, `led`, button; without JavaScript the Astro jack is a native checkbox that submits.
- **Unit** (`strata-jog-patch.unit.test.mjs`): the markup, sizes and boxes, the Relief and Objects entries, the spring, and the Instrument parts validated by
  core's `validateInstrumentScene` and contained over the whole reference stage at every size, depth and seating (`checkContainment`), with the plug and the
  cable sunk out of sight unplugged and the cable running towards the bottom of the screen.
