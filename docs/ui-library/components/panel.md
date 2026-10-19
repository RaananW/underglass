# Panel

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Groups a page region on one raised slab. Renders a native `<section>`. A Panel is the **GPU layer unit**:
the integration enrolls each Panel as one Underglass layer, and the controls inside it are lit as relief
primitives on that layer. Use a few large panels per page, not one per control (layer budget 32 to 64).

A `<section>` is a `region` landmark only when it has an accessible name (`aria-labelledby` or `aria-label`).
Without a name it has no role and adds no landmark. No APG pattern exists for a panel or a region of this
kind; the landmark rules of the [Landmarks pattern](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/)
apply when it is named. A slab inside a panel is a [Card](card.md). Dialogs and drawers are separate
components (enrolled panels with `role="dialog"`, later).

## 2. Object

A **raised slab**: a thin plate whose base is the panel's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate with a bevel band of `bevel.width` | `elevation.floating` (8) | No; the whole panel may travel and tilt through depth |
| Shadow | Analytic cast shadow from the light (section 7) | — | With the slab |

The shadow falls outside the panel's box (the shadow outset). It is decoration and never receives hits. The
panel's hit geometry stays its box. Controls inside do not move with the panel's pose relative to the layout.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab top | `panel` | `text` | `panel` (`matte`) |
| Slab edge | The top's colour, shaded by the bevel | — | Same as the top |
| Shadow | Black at `shadow.strength` | — | — |

`data-strata-material` on the panel overrides the role for one panel, for example `glass` (which becomes
`matte` under `prefers-reduced-transparency`).

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.floating` (8) | Slab at floating height | Relief recipe at `floating` |
| Hover, pressed | Do not apply: the panel is not a control | — | — |
| Focus-visible | Applies only if the panel has `tabindex="-1"` and is focused by script; accent edge, `focus.width` | Emissive glow on the slab edge | `outline: focus.width solid accent` |
| Busy (`aria-busy="true"`) | Rest; a child [Spinner](spinner.md) or [ProgressBar](progress-bar.md) shows the busy state | Same | Same |

Disabled, selected and invalid do not apply. A panel does not grey out its content; each control owns its
disabled state.

## 5. Relief primitives

One `raised` primitive: the `<section>` itself, from its border box and `border-radius`
(`radius.panel`), at `elevation.floating`.

- Budget: at most 256 relief primitives per panel (P0.3), this one included. The integration reports a panel
  that exceeds it and never drops primitives silently.
- Layer budget: 32 to 64 panels per page.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.panel`, `colour.text` | — |
| `radius.panel` | — |
| `elevation.floating`, `bevel.width`, `bevel.gain`, `shadow.strength`, `interior.max` | `elevation` |
| `material.roles.panel` | `material` |
| `space.*`, `density` (panel padding 12, 18 or 24) | — |
| `camera.tiltMax`, `motion.slow`, `motion.easing.standard` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<section class="ug-panel" data-strata-face="raised" data-strata-elevation="floating"
         aria-labelledby="settings-title">
  <h2 id="settings-title">Settings</h2>
  <!-- controls, cards, dividers -->
</section>
```

- The `<section>` is the boundary element and the enrolled layer. React and Vue refs, `class` and `style`
  reach it. Enrollment is done by the integration's panel helper, not by extra markup.
- Controls inside keep their own native elements and are the hit targets. The panel's shadow is not a DOM
  node.
- No overlay. A panel that floats above the page (dialog, drawer) is a separate component.

## 8. Keyboard and screen reader

The panel adds no keys and is not in the tab order.

- Named: role `region`, name from the heading or `aria-label`. Unnamed: no role.
- Use one heading per panel as its first child where the panel has a title.
- Moving a panel through depth never moves focus. Content stays inert during a depth transition.

## 9. CSS presentation

The relief recipe at `elevation.floating`: `box-shadow` derived from the light (section 7), the bevel
gradient, and the material's finish zones (section 4). Padding follows the density. The shadow may extend
past the box; the layout never reserves room for it. Under `forced-colors`: `Canvas` background and a
`CanvasText` border, no shadow. Under `prefers-reduced-motion: reduce`, entering, leaving, tilt and parallax
are instant (section 12).

## 10. Tests

- **Plain DOM:** unnamed `<section>` has no landmark; named has role `region`; focus order of children is
  unchanged.
- **GPU:** the panel is one enrolled layer and stays on through content, ref, layout, DPR and structure
  changes; pixels are fresh after a child updates; a hit inside the box reaches the native child; a hit in
  the shadow outset reaches the page below; a panel over 256 primitives is reported.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU
  modes; text contrast on the lit face at `interior.max`.
- **Parity:** Relief and CSS within the P0.6 budget at rest, including the shadow extent.

## 11. Plate and tray forms

The Panel as hardware ([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level)): `form` (prop) or `data-strata-form` (on the
`<section>`) chooses `plate` or `tray`. Without it, or with `flush`, the Panel is the slab above, in the markup and the look it had before. A
panel is the GPU layer unit, so its plate is the chassis plate of the layer; sections 1, 8 and 10 hold, and the accessibility snapshot is the same
with and without the form. The forms are those of the [Card](card.md#11-plate-and-tray-forms) on the panel.

```html
<section class="ug-panel" data-strata-face="raised" data-strata-elevation="floating" aria-labelledby="plate-panel-title" data-strata-form="plate">
  <h2 id="plate-panel-title">Plate</h2>
  Content
</section>
```

```html
<section class="ug-panel" data-strata-face="raised" data-strata-elevation="floating" aria-labelledby="tray-panel-title" data-strata-form="tray">
  <h2 id="tray-panel-title">Tray</h2>
  <div class="ug-panel__tray" data-strata-face="well">Content</div>
</section>
```

- **`plate`:** the panel's slab in the `plate` material, and at the Instrument level the rim of the Card's plate inside the panel's box: the panel's
  shadow outside the box is the slab's, unchanged (against a flush panel, no pixel outside the panel's box differs, at DPR 1 and 2).
- **`tray`:** a wrapper (`.ug-panel__tray`, a `well` face) round what follows the title, so the content sits in a recessed tray under a printed
  title; at the Instrument level it has the Card tray's wall. The wrapper adds no role: the snapshot is the flush one.
- A Panel is never a Dialog: [Dialog](dialog.md#11-plate-form) and [Drawer](drawer.md#11-tray-form) are panels that move.

**Tests.** `ui-structural-forms.test.mjs` (a plate panel against a flush one), `ui-structural-forms-bindings.test.mjs`,
`ui-structural-forms-astro.test.mjs`.
