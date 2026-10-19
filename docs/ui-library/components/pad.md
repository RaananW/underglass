# Pad

Instrument, wave 3 ([plan](../instrument.md#new-components)). Follows the
[anatomy template](../design-language.md#17-component-anatomy-template) and the [conventions](README.md#conventions).

## 1. Purpose and native element

A trigger you play with a finger, as on drum machines, samplers and launch controllers: a square soft cap in a grid that
lights from below while it is struck. Renders a native `<button>`: momentary (it is lit and down while it is held, and
clicks once), or, with `aria-pressed`, latching (a toggle that stays down and lit while on). The element is native; the
cap and its light are decoration. A pad's state is `:active` / `aria-pressed`, its label names it, and light never
carries the state alone (WCAG 1.4.1: the cap also goes down, and a latching pad says `aria-pressed`).

A **PadGrid** is the `<div role="group">` the pads stand in. A single machined key with a lit ring is a
[push button](button.md#11-push-button-form-momentary); a toggle is a [ToggleButton](toggle-button.md); keys on one plinth
are a [Keypad](keypad.md).

## 2. Object

A **soft cap on a lit socket**: a rounded square of lacquer-soft material standing in a dark well, with a rim of light
under it. Unlit the rim is dark glass; lit it glows, blooms and **emits**: it lights the face around it, the objects near
it and, past the panel's edge, the page. A struck pad's cap travels down.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Box (the native button) | Square, the cap + 18 (82 at medium), corner radius 0.22 of the cap + 9 | 0 | No |
| Socket | Rounded square, the cap + 6, printed on the face at every level (`--_off`) | 0 | No |
| Glow | The same shape: the lit rim 3 px wide round the cap (`--_glass`, by `--strata-lit`) | Instrument: 0.5 | No; it lights |
| Cap | Rounded square, side `size.pad` (48, 64 or 80 px), radius 0.22 of its side; Relief a raised face, Objects a key, Instrument a body with a captured label | Relief 4, Objects ≤ 8, Instrument 5 | Down `pad.travel` (3 px at 50% depth) while held; 0.45 of it while latched |
| Emitter | A point light over the cap centre | 0.25 cap sides | Strength 0 or on |

- **The box rule.** The native button covers the whole object: every part, its cast shadow and the bloom's halo lie inside
  the box (9 px of room each side of the cap), at every depth, at every stage position, and a press anywhere on the box is
  a press on the button. The pad's corners outside the box's radius fall to the grid.
- **Colour** is a role: `glowOn` (amber) by default, or `accent`, `success`, `warning`, `danger` or `info` (`colour`). Lit,
  the glow is the role mixed 18% towards white; unlit, the role at 16% over dark glass. The emitter takes the role scaled
  to full brightness.
- **The emitter** (design language section 3): `emitter.pad.radius` 3 cap sides, `emitter.pad.height` 0.25 and
  `emitter.pad.strength` 3,600 for the 64 px cap, scaled with the square of the cap; `emitter.guardFeather` 4 px. A
  disabled pad is unlit. Under `prefers-contrast: more` emitters are off.
- **The cap's material.** The plan's table names subsurface scattering for silicone pads. The core's PBR recipe has no
  subsurface layer yet, so the premium cap is a **satin lacquer** in the pad's own face colour with the translucent look
  carried by the lit glass rim under it; a `subsurface` layer replaces the body's recipe when core has one, with no change
  to the parts.
- **Instrument** (`data-strata-level="instrument"`): [`gpu/instrument-pad.ts`](../../../packages/ui/src/gpu/instrument-pad.ts)
  builds the object from the laid-out boxes:

  | Part | Profile (50% depth; heights × 0.6, 1, 1.6 with depth) | Material (premium) | Pose |
  | --- | --- | --- | --- |
  | `lens` | Prism plate as wide as the glow, 0.5 high, on the face; `glass: "lens"` with its `emitter` | `lens #rrggbb` (glass, tinted by the lit colour); `lensOpaque #rrggbb` under `prefers-reduced-transparency` | None |
  | `plinth` | The cap's body: the cap's size, 4 high (cap 5 less the 1 px label), taper 0.6, chamfer 1.5 | `key #rrggbb` (the pad's face colour, in its material's roughness) | Down `pad.travel` along `t` |
  | `cap` | The captured label: the cap inset 1.2, 1 high, `captured` (it shows the label as the capture has it), no shadow | `keyCap` | The body's |

  The parts never depend on the state: lit or unlit is only the emitter's strength and the pose is `t`, which the helper
  reads each frame from the CSS throw (`--strata-push-t`, `spring.button`), so a strike is a uniform write with no capture.
  The body's and the rim's shadows are capped where they would leave the box.
- **Past 64 emitters in a layer** core draws the 64 with the most reach and reports the rest in `state().emitters`
  (`drawn`, `dropped`); GPU stays on. A 4 × 4 grid is 16 emitters and 48 parts.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Cap | `secondary` | `text` | `control` (`satin`), finish `control` |
| Socket | The role at 16% over dark glass | — | None (printed) |
| Glow, unlit | The role at 16% over dark glass | — | `lens` (`glass`) |
| Glow, lit | The role mixed 18% towards white | — | `glowOn` (`emissive`), an emitter |

`data-strata-material` on the pad overrides the cap's material.

## 4. Elevation per state

| State | Relief | Objects | Instrument | CSS |
| --- | --- | --- | --- | --- |
| Rest | Cap raised 4 | Key ≤ 8 | Body 4 on the rim | Raised cap, dark rim |
| Held (`:active`, `data-strata-down`, Space/Enter down) | Cap sinks (press height), rim lit | Key travels, rim lit | Body and label travel 3 px, rim glows | Cap `translate`, `--strata-push-t: 1`, `--strata-lit: 1` |
| Latched (`aria-pressed="true"`) | Cap sunk, rim lit | Key at 0.45 | Travel 0.45, rim glows | `--strata-push-t: 0.45`, `--strata-lit: 1` |
| Hover | Cap height `× state.hoverHeight` | Key rises by a quarter | No pose change | `--_lift`, `--_tone` on the cap |
| Focus-visible | An accent ring round the glow, captured | Same | Same | `outline: focus.width solid accent` |
| Disabled | Parts flat, object at 38%, unlit | Same | Same, emitter off | `opacity: 0.38` |

The throw is `spring.button` (1,600 stiffness, 80 damping, critically damped), sampled into a `linear()` curve for the CSS
transition (the PushButton's). Under `prefers-reduced-motion` lights and travel change at once.

## 5. Relief primitives

- The cap is a `raised` face (`data-strata-face="raised"`) a rounded square; at Objects a `key` object standing on the face,
  at Instrument claimed by the pad's object. Each stands only as high as its box lets its shadow reach (2.8), hovered.
- The socket and the glow have no face: they are CSS paint, captured at Relief and Objects (the glow's bloom is the
  emitter instead of a `box-shadow`), the socket always printed; at Instrument the glow's paint is hidden (`data-strata-dome`)
  and the rim lens takes its place.
- Every pad is an **emitter** at every level: a panel with a pad takes a version 4 scene with `emitters`, the `protected`
  rects of its text and a `feather`, so core's face pool lights the page within the contrast guard.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `size.pad` (48, 64, 80, `--strata-pad-size`) | `size` |
| `colour.glowOn`, or `colour.accent`, `success`, `warning`, `danger`, `info` | `colour` |
| `emitter.pad.radius` (3), `emitter.pad.height` (0.25), `emitter.pad.strength` (3,600), `emitter.guardFeather` (4) | — |
| `colour.secondary`, `colour.text`, `colour.edge`, `colour.accent` (focus) | — |
| `elevation.raised`, `state.*`, `interior.max`, `bevel.*`, `shadow.*`, `object.keyTravel` | — |
| `material.roles.control`, `material.roles.lens`, `material.roles.glowOn` | `material` |
| `target.min`, `space.1`, `font.size.body` | — |
| `focus.width`, `focus.offset`, `feedback.click.*` | — |
| `level` | `level` |

Props: `colour`, `latching`, `pressed` / `defaultPressed` / `onPressedChange` (or `v-model:pressed`), `icon`, `onVelocity`
(Vue: the `velocity` event), `size`, `material`, `level`, the native button's attributes (`name`, `value`, `form`, `type`,
`disabled`, `aria-disabled`), and the label as the children or the slot. `PadGrid`: `label` (required), `columns` (4), `size`,
`material`, `level`. In React the ref reaches the button (Vue exposes `button`).

## 7. DOM structure and overlay needs

A momentary pad:

```html
<button class="ug-pad" type="button" data-strata-colour="danger" name="kick" value="1">
  <span class="ug-pad__object" aria-hidden="true">
    <span class="ug-pad__socket"></span>
    <span class="ug-pad__glow"></span>
  </span>
  <span class="ug-pad__cap" data-strata-face="raised">
    <span class="ug-pad__label">Kick</span>
  </span>
</button>
```

A latching pad (`aria-pressed`):

```html
<button class="ug-pad" type="button" aria-pressed="false" data-strata-colour="accent">
  <span class="ug-pad__object" aria-hidden="true">
    <span class="ug-pad__socket"></span>
    <span class="ug-pad__glow"></span>
  </span>
  <span class="ug-pad__cap" data-strata-face="raised">
    <span class="ug-pad__label">Loop</span>
  </span>
</button>
```

A grid of pads:

```html
<div class="ug-pad-grid" role="group" aria-label="Drum pads" style="--strata-pad-columns: 2;">
  <button class="ug-pad" type="button">
    <span class="ug-pad__object" aria-hidden="true">
      <span class="ug-pad__socket"></span>
      <span class="ug-pad__glow"></span>
    </span>
    <span class="ug-pad__cap" data-strata-face="raised">
      <span class="ug-pad__label">Snare</span>
    </span>
  </button>
  <button class="ug-pad" type="button" data-strata-colour="success">
    <span class="ug-pad__object" aria-hidden="true">
      <span class="ug-pad__socket"></span>
      <span class="ug-pad__glow"></span>
    </span>
    <span class="ug-pad__cap" data-strata-face="raised">
      <span class="ug-pad__label">Hat</span>
    </span>
  </button>
</div>
```

- The `<button>` is the boundary: `class`, `style`, `data-strata-colour`, `data-strata-size` and the ref reach it. The object
  (`aria-hidden`, every part `pointer-events: none`) lies behind the cap, which is in the flow and carries the icon
  (`<span class="ug-pad__icon" aria-hidden="true">` before the label) and the label.
- A pad is lit by `--strata-lit` and moved by `--strata-push-t`, registered numbers the recipe sets from the native state
  (held, latched, disabled); `data-strata-down` (`"true"` while held, `"false"` after) is kept by `attachStrataPads` and
  overrides a `:active` a touch can leave behind. `data-strata-colour` is absent for the default.
- A latching pad's `aria-pressed` is kept by the framework bindings, and in plain markup by `attachStrata` (which dispatches
  a bubbling `strata-pressed-change` with `{ pressed }`, as the ToggleButton).
- No overlay.

## 8. Keyboard and screen reader

| Input | Pad |
| --- | --- |
| Click, tap | Presses and clicks once (a latching pad toggles) |
| Space | Held from key down to key up; clicks on key up |
| Enter | Held from key down to key up; clicks on key down (native) |
| Pointer down, up | Held from down to up, wherever it is released; a release elsewhere is no click |
| Tab, Shift+Tab | Into and out of the grid: **one tab stop** for the pads of a `PadGrid` |
| Arrow keys | Move focus one pad along the row or one row along the column; nothing wraps; disabled pads are skipped |
| Home, End | The first and last pad of the row |
| Control+Home, Control+End | The first and last pad of the grid |

- **Decision (the plan left it open): the grid pattern for arrows.** A drum-pad grid is a two-dimensional set of
  buttons, so the pads are one tab stop with a **roving tabindex** (applied the first time focus enters, as the Toolbar's),
  and the arrow keys move in both axes, as the WAI-ARIA [Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) navigation
  keys and the Toolbar's roving tabindex do. The pads keep their role `button`: there is no `role="grid"`, since there are no
  rows, cells or headers to announce, and a pad is not a cell. Without script every pad is a native tab stop. The number of
  columns is read from the laid-out grid, so a grid that reflows keeps its arrows right; right-to-left text swaps left and
  right. Arrows do not wrap: a keypad you tab out of is quicker than one that loops.
- A pad's role is `button`; a latching pad's `aria-pressed` is its state, announced "pressed". The name is the label; name a
  pad by what it plays ("Kick"), never by its state or colour. The group is named by the grid's `aria-label`.
- **Velocity (optional).** At each press `data-strata-velocity` is set to a number from 0 to 1 and a bubbling
  `strata-pad-velocity` event carries `{ velocity, source }`, before the click. A pen or a finger on hardware that reports
  force gives its `pressure` (`source: "pressure"`; a pressure of exactly 0.5 is what a pointer without sensing reports, so
  it is not taken); otherwise **where on the cap the press lands** decides (`"position"`): the middle gives 1 and the edge
  0.25 (the farther of the two axes counts); the keys give 1 (`"keyboard"`). Nothing depends on it, it does not change the
  light, and a script is free to ignore it: it is for an application's sampler.
- **Meaning never rides on light alone** (WCAG 1.4.1): the cap goes down, and a latching pad says `aria-pressed`.
- **Target size** (2.5.8): the box is at least 66 px square at the small size (the cap 48); the least a pad shrinks to in a
  narrow grid is `target.min` (24).
- **Screen readers:** the manual script for a pad grid's roving arrows and a latching pad's "pressed" is VAL-002's, in
  [open issues](../../open-issues.md), until performed; the automated checks are the accessibility snapshot, axe and real keys.
- **Feedback** ([design language section 20](../design-language.md#20-feedback)): where on, a pad plays `click` as it goes
  down, once per press; a pulse (8 ms) answers only the visitor's own input and stops under reduced motion. Both are off
  by default.

## 9. CSS presentation

A rounded-square cap (the `secondary` colour, raised by the shared recipe) over a rim lit by `--strata-lit`: the glow is the
role's colour mixed with dark glass by the number, with a bloom (`box-shadow`) in CSS and none in face mode, where the
emitter is the light. The grid is `grid-template-columns: repeat(var(--strata-pad-columns, 4), minmax(0, max-content))`:
pads keep their size and shrink together, still square, when the container is narrower, down to `target.min`; a label that
wraps grows its pad taller. At 320 px a 4 × 4 grid of small pads (66 px boxes) fits with no horizontal scrolling.

- **`forced-colors: active`:** the glow and cap are `Canvas`/`ButtonFace` with a `ButtonText` edge, the glow `Highlight`
  when lit, no glow, a `Highlight` focus ring, `GrayText` when disabled.
- **`prefers-contrast: more`:** emitters off; the glow flat colour with no bloom; the glow and cap edged in the text colour.
- **`prefers-reduced-motion: reduce`:** lights and travel change at once.
- Face mode (`data-strata-mode="face"`, GPU on): the glow's bloom is dropped (the emitter lights), the cap stays; at Instrument
  the cap's translation is held (the object travels) and the glow's paint is hidden.

## 10. Tests

- **Plain DOM** (`ui-pad.test.mjs`, real buttons): held from down to up (pointer, Space, Enter) and released elsewhere, one
  click; a latching pad toggles `aria-pressed`; disabled and `aria-disabled` never held or lit; a submit pad submits its name
  and value; roving tabindex and every arrow, Home, End and Control+Home/End key of the grid, skipping a disabled pad;
  velocity from the pointer's position and pressure and from the keys.
- **Mobile:** at 390 and 320 px no horizontal overflow, boxes at least 24 px, a 4 × 4 grid of small pads fits 320 px; at
  200% text the cap grows and nothing overflows; touch taps and holds.
- **Preferences:** axe in light, dark, face mode, forced colours, more contrast and reduced motion.
- **GPU** (DPR 1 and 2, Relief, Objects and Instrument): the scene is version 4 with an emitter per pad in document order,
  its strength from the state, a protected rect for every text; at Instrument the documented parts; what the pads draw lies
  inside their boxes (0 px outside, at three depths at Instrument), native hits on those pixels find the pad and a grid over
  every box has 0 mismatches; a press changes pixels in its box and lights the face within the reach and not beyond it, with
  the protected text within the guard; 40 held frames give 0 captures and 0 hit-geometry updates; a 4 × 4 grid at Instrument
  stays within the budgets (16 emitters, 48 parts, 16 objects); the accessibility snapshot is the same in DOM and GPU modes.
- **Feedback:** off by default; one click per real press.
- **Bindings and Astro** (`ui-pad-bindings.test.mjs`, `ui-pad-astro.test.mjs`): the three examples above rendered exactly;
  controlled, uncontrolled, refs, attributes, velocity, disabled.
- **Unit** (`strata-pad-keypad.unit.test.mjs`): sizes, boxes, travel, the emitter, the velocity rule, the grid keys, the
  Relief and Objects entries and the Instrument parts validated by core's `validateInstrumentScene` and contained over the
  reference stage at every depth and size (`checkContainment`).
