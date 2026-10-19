# Drawer

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions). A Drawer is a [Dialog](dialog.md) fixed to a viewport edge; everything
the Dialog page says about behaviour applies.

## 1. Purpose and native element

A modal panel that slides in from the start, end, top or bottom edge for a longer task or a detail view
(settings, a filter list, a navigation menu on a narrow screen). It follows the
[APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and, like the Dialog, is a
`<section role="dialog" aria-modal="true">`, not a native `<dialog>`, so it is a top-level Strata panel the GPU
presentation can enroll. Background inert, focus in and back, Escape and nesting come from the same
`showStrataDialog`.

## 2. Object

A **raised slab** at `elevation.modal`, square on the edge it sits on and rounded (`radius.panel`) on the
others, over a scrim.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Plate with a bevel band of `bevel.width`, square on its edge | `elevation.modal` (24) | Enters and leaves through depth ([section 12](../design-language.md#12-motion)) |
| Shadow | Analytic cast shadow from the light (section 7) | — | With the slab |
| Scrim | A flat dim layer over the page, behind the slab | — | Fades in and out |

## 3. Faces and materials

As [Dialog](dialog.md#3-faces-and-materials).

## 4. Elevation per state

As [Dialog](dialog.md#4-elevation-per-state).

## 5. Relief primitives

One `raised` primitive: the `<section>` itself, at `elevation.modal`. Same budgets as
[Panel](panel.md#5-relief-primitives).

## 6. Tokens it reads

As [Dialog](dialog.md#6-tokens-it-reads).

| Prop | Meaning |
| --- | --- |
| `side` | `end` (the default), `start`, `top` or `bottom`; logical, so `start` is the left edge in left-to-right text |
| `size`, `material`, `level` | The [Strata props](README.md#conventions) |

## 7. DOM structure and overlay needs

```html
<div class="ug-scrim" aria-hidden="true"></div>
<section class="ug-panel ug-drawer ug-drawer--end" role="dialog" aria-modal="true"
         aria-labelledby="filters-title" aria-describedby="filters-description" data-strata-face="raised"
         data-strata-elevation="modal" tabindex="-1">
  <h2 class="ug-drawer__title" id="filters-title">Filters</h2>
  <div class="ug-drawer__body">
    <p class="ug-drawer__description" id="filters-description">Narrow the list.</p>
  </div>
  <div class="ug-drawer__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Done</span>
    </button>
  </div>
</section>
```

Plain HTML and Astro render both elements closed, with the `hidden` attribute:

```html
<div class="ug-scrim" aria-hidden="true" hidden></div>
<section class="ug-panel ug-drawer ug-drawer--end" role="dialog" aria-modal="true"
         aria-labelledby="filters-title" aria-describedby="filters-description" data-strata-face="raised"
         data-strata-elevation="modal" tabindex="-1" hidden>
  <h2 class="ug-drawer__title" id="filters-title">Filters</h2>
  <div class="ug-drawer__body">
    <p class="ug-drawer__description" id="filters-description">Narrow the list.</p>
  </div>
  <div class="ug-drawer__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Done</span>
    </button>
  </div>
</section>
```

- **Top-level, rendered into a container**, exactly as the [Dialog](dialog.md#7-dom-structure-and-overlay-needs):
  the section and the scrim before it are direct children of one container (the page body, or the Underglass
  root, where `@underglass/ui/gpu` presents the drawer as its own GPU panel), never inside a layer. React and Vue render
  nothing while closed and take a `container` prop.
- The side is the class `ug-drawer--start`, `--end`, `--top` or `--bottom`.
- Plain HTML wiring and `showStrataDialog` are as for the Dialog.
- **Closing on a click outside:** off by default, as for the Dialog. Turn it on with `closeOnScrim` (React, Vue and
  Astro), `data-strata-close-on-scrim` on the section in plain HTML, or the `closeOnScrim` option of
  `showStrataDialog`. A click on the scrim, anywhere outside the drawer, then closes it with the reason `"scrim"`;
  a click inside it does not.

  ```tsx
  <Drawer open={open} onClose={() => setOpen(false)} title="Filters" closeOnScrim>…</Drawer>
  ```

## 8. Keyboard and screen reader

As [Dialog](dialog.md#8-keyboard-and-screen-reader): Tab stays inside through the inert background, Escape
closes, and focus returns to the opener. With `closeOnScrim`, a click outside the drawer closes it too.

## 9. CSS presentation

Fixed to its edge with logical insets and no transform. A start or end drawer is full height and
`min(24rem, 100vw - 2 × space.5)` wide; a top or bottom drawer is full width, as tall as its content up to
`100dvh - 2 × space.5`. Its body scrolls and its title and actions stay. Motion, scrim and preferences are as
for the Dialog.

## 10. Tests

- **Plain DOM:** each side lays out on its edge; a click outside closes a drawer only with `closeOnScrim`; the
  Dialog's focus, inert, Escape and reduced-motion checks.
- **Bindings:** React, Vue and Astro render exactly the markup above (open for React and Vue, `hidden` for
  Astro); Astro's `closeOnScrim` renders `data-strata-close-on-scrim`.
- **Accessibility:** axe in light and dark.
- **GPU:** as for the Dialog, and a real click outside a `closeOnScrim` drawer, on the scrim the GPU draws, closes
  it with GPU on.

## 11. Tray form

The Drawer as a tray that slides out of the chassis edge ([Instrument plan](../instrument.md#everyday-components-at-the-instrument-level)):
`form="tray"` (prop) or `data-strata-form="tray"` (on the `<section>`). Without it, or with `flush`, the Drawer is the panel above, in the markup, the look
and the motion it had before. Sections 1, 7 and 8 hold: the modal contract, the edge it sits on (`side`), the scrim and `closeOnScrim` are the same, and
so is the accessibility snapshot.

```html
<div class="ug-scrim" aria-hidden="true"></div>
<section class="ug-panel ug-drawer ug-drawer--end" role="dialog" aria-modal="true"
         aria-labelledby="filters-title" aria-describedby="filters-description" data-strata-face="raised"
         data-strata-elevation="modal" data-strata-form="tray" tabindex="-1">
  <h2 class="ug-drawer__title" id="filters-title">Filters</h2>
  <div class="ug-drawer__body">
    <p class="ug-drawer__description" id="filters-description">Narrow the list.</p>
  </div>
  <div class="ug-drawer__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Done</span>
    </button>
  </div>
</section>
```

- **It slides.** A tray drawer moves from beyond its edge to rest and back, in place of the depth entry: in CSS a `translate` of its own width or
  height with a fade (`ug-panel-slide-enter`, `ug-panel-slide-leave`, named for `strataEnter` and `strataLeave` to wait for), and on the GPU the layer
  itself travels (core's panel transition with `x` or `y` keyframes, `motion.slow` and `motion.easing.standard`), the start and end sides following the
  writing direction. Native hits follow the layer's travel (core keeps the hit geometry); the drawer is inert while it moves. Reduced motion: instant.
- **Its walls are parts.** At the Instrument level the drawer's box is a tray: a **wall** (the Card's tray lip: a vertical outer face, a flat top 4 wide,
  an inner face 3 px down) along the three sides that are not on the chassis edge, open on the side it slides from, rising out of the chassis with
  the same eased progress as a Dialog's plate (`rise`, a uniform update). The drawer's corners on the edge are square, so the wall runs to the edge's
  inset. The slide, like the Dialog's depth entry, captures only what changes in the DOM: a 2.4 s open makes 10 to 12 captures, none in the middle
  of the motion (`ui-dialog-motion.test.mjs`; the helper no longer rewrites the scrim's mode every frame, #165). At Relief and Objects the drawer is its slab in the `plate` material with the tight edge break.
- **Containment.** The wall stays at least 0.5 px inside the drawer's box over the whole rise at every corner of the reference stage and every depth (the
  closest is 1.6 px), and the layer's slide does not move it relative to its own box.
- A drawer's body is not a well: the tray is the drawer itself.

**Tests.** `ui-structural-forms.test.mjs` (the CSS slide and reduced motion, the GPU slide's travel and rise at DPR 1 and 2, the wall's pixels inside the drawer's
box), `ui-structural-forms-bindings.test.mjs`, `ui-structural-forms-astro.test.mjs`.
