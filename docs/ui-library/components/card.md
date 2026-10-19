# Card

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Groups related content on a slab inside a [Panel](panel.md). Renders a native `<article>` when the content
is self-contained (a list item, a result, a post), or a native `<section>` when it is a titled part of the
page. A Card is **not its own GPU layer**: it is a relief primitive on its Panel's layer, so Cards count
against the Panel's 256 primitives.

No APG pattern exists for a card. `<article>` has the `article` role. `<section>` is a `region` landmark
only when it has an accessible name. A Card is not interactive. A clickable Card contains one
[Link](link.md) or [Button](button.md), which is the only target.

## 2. Object

As [Panel](panel.md), except: a **raised slab** that is lower than the panel it sits on.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate, `bevel.width` band | `elevation.raised` (3) | No |
| Shadow | Analytic cast shadow onto the panel | — | With the slab |

The slab and its shadow stay inside the Panel's layer. A Card does not tilt or travel on its own.

## 3. Faces and materials

As [Panel](panel.md), except:

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab top | `secondary` | `text` | `control` (`matte`) |
| Slab edge | The top's colour, shaded by the bevel | — | Same as the top |

`secondary` keeps the Card readable against the `panel` colour it sits on. `data-strata-material` overrides
the role for one Card.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.raised` (3) | Slab at raised height | Relief recipe at `raised` |
| Hover, pressed | Do not apply to the Card; the contained Link or Button owns them | — | — |
| Focus-visible | When a contained control has focus (`:has(:focus-visible)`): accent edge, `focus.width`, around the Card | Emissive glow on the slab edge | `outline: focus.width solid accent` on the Card |
| Disabled | Height 0, no bevel gain, content at 38%, only if the Card is made unavailable as a whole | Flattened to the panel | Flat, content `opacity: 0.38` |

Selected, invalid and busy do not apply. A busy Card shows a child [Spinner](spinner.md) or
[ProgressBar](progress-bar.md). A Card has no `disabled` attribute; "unavailable" is set by disabling its
controls and, optionally, by `aria-disabled="true"` on a clickable Card's link.

## 5. Relief primitives

One `raised` primitive: the Card element, from its border box and `border-radius` (`radius.panel`), at
`elevation.raised`. Content inside has its own primitives (buttons, fields). A Card never holds another Card.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text` | — |
| `radius.panel` | — |
| `elevation.raised`, `bevel.width`, `bevel.gain`, `shadow.strength`, `interior.max` | `elevation` |
| `material.roles.control` | `material` |
| `space.*`, `density` (padding) | — |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<article class="ug-card" data-strata-face="raised" aria-labelledby="card-1-title">
  <h3 id="card-1-title" class="ug-card__title">Latency</h3>
  <div class="ug-card__body">…</div>
  <div class="ug-card__footer"><!-- optional actions --></div>
</article>
```

- The Card element is the boundary element: React and Vue refs, `class` and `style` reach it.
- A Card needs a heading to be named. Without one, the `<article>` has no name and is announced as
  "article" only.
- `ug-card__title`, `ug-card__body` and `ug-card__footer` are optional parts and carry no relief.
- No overlay. A Card outside any Panel is reported in development builds, because it would have no layer.

## 8. Keyboard and screen reader

The Card adds no keys and is not in the tab order. Keyboard behaviour belongs to the controls inside it.

- `<article>`: role `article`. `<section>` with a name: role `region`.
- Do not give the Card `role="button"` or an `onclick`. The whole Card is clickable through a Link whose
  `::after` covers the Card, so the only tab stop is the Link.

## 9. CSS presentation

As [Panel](panel.md), except: the relief recipe at `elevation.raised`, with a smaller shadow. Padding follows
the density. In GPU mode the CSS paints the flat face only. Under `forced-colors`: `Canvas` background and a
`CanvasText` border, no shadow. Hover and press have no motion, so reduced motion changes nothing here.

## 10. Tests

- **Plain DOM:** `<article>` role; named `<section>` is a `region`; a stretched Link is the only tab stop
  and activates once.
- **GPU:** the Card adds no layer; GPU stays on when Card content changes; pixels are fresh; a hit on a
  contained control reaches it, and a hit on the Card body reaches the Card.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU
  modes; text contrast on the `secondary` face at `interior.max`; focus edge visible in decoded pixels.
- **Parity:** Relief and CSS within the P0.6 budget at rest and with a focused child.

## 11. Plate and tray forms

The Card as hardware ([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level),
[design language section 6](../design-language.md#instrument-object-table)): `form` (prop) or `data-strata-form` (on the `<article>`) chooses
`plate` or `tray`. Without it, or with `flush`, the Card is the raised slab above in the markup and the look it had before, at every level; the
premium character's default, `plate`, is reached by naming it. Sections 1, 6, 8 and 10 hold: a Card is still a named `<article>`, adds no keys
and no layer, and the accessibility snapshot is the same with and without the form.

```html
<article class="ug-card" data-strata-face="raised" aria-labelledby="plate-card-title" data-strata-form="plate">
  <h3 id="plate-card-title" class="ug-card__title">Plate</h3>
  <div class="ug-card__body">A machined plate.</div>
</article>
```

```html
<article class="ug-card" data-strata-face="raised" aria-labelledby="tray-card-title" data-strata-form="tray">
  <h3 id="tray-card-title" class="ug-card__title">Tray</h3>
  <div class="ug-card__body" data-strata-face="well">The body sits in a tray.</div>
</article>
```

| Form | Object | At Relief and Objects | At Instrument |
| --- | --- | --- | --- |
| `plate` | A machined plate: the card's slab with an edge break, no screws | The slab in the `plate` material role (`metal` on light themes and `gunmetal` on dark in the premium character, `satin` where no character gives one), and in CSS a tight bevel and a brushed finish | The slab as ever, with a **rim**: a mesh swept along the card's rounded outline, 4 wide and 3 high (× 0.6, 1, 1.6 with depth) with a 1.4 chamfer on its outer edge, in polished aluminium (`plateEdge`, gunmetal on a dark faceplate), standing inside the box by the box rule's margin |
| `tray` | The body is a recessed well with a groove wall; the content sits in it | The body is a `well` primitive (an Objects well has its bezel ring), in the field's colour | The well as ever, with a **wall**: the same sweep as a lip, a vertical outer face, a flat top 4 wide and an inner face running 3 px down into the recess, in a satin lip (`trayWall`) |

- **Content is captured, never covered.** Nothing is drawn over the text: the rim and the wall are on the box's edge (the margin 2 to 4 px, the
  part 4 wide, against the card's 20 px padding and the tray's 16 px), and the face inside them is the card's own captured face, so the title,
  body, footer and every control keep their pixels and their hits. The rim and the wall cast no shadow on the face (`caster: null`); the slab's
  and the well's own Relief shadow stay. At 50% depth the closest any vertex comes to the box's edge is 1.9 px (plate) and 1.6 px (tray),
  over the whole rise, at every corner of the reference stage and every depth.
- **A card too small for its margin** (under 22 px a side at 50% depth) stays a Relief slab or well. Each distinct size is one part kind (one draw
  call); core warns past 16 kinds in a layer, so a panel of many differently sized plate cards is better a few sizes.
- **The tray is the body.** `.ug-card__body` carries `data-strata-face="well"` and the tray's padding (`space.4`), radius (`radius.control`) and
  the field's colour; the footer stays on the plate. Under `forced-colors` the tray is a `CanvasText` outline on `Canvas`.
- Props: `form`, with the others of section 6. React, Vue and Astro render the same markup.

**Tests.** `ui-structural-forms.test.mjs` (the cards' forms change pixels only inside their boxes at DPR 1 and 2, at all three levels),
`ui-structural-forms-bindings.test.mjs`, `ui-structural-forms-astro.test.mjs`.
