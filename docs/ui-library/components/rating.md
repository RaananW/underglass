# Rating

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A score out of a small maximum (5 by default), shown as stars. Two forms:

- **Input:** native radios in a `<fieldset>` named by its `<legend>`, one per score, each named "1 star", "2 stars"
  and so on. Each radio is visually hidden over its star, so the star is its hit area. The WAI-ARIA
  [Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) comes from the browser: one tab stop, arrow
  keys change the score, and the value takes part in a form.
- **Display:** a read-only score, which may be fractional (4.5), as one `role="img"` element named "4.5 out of 5 stars".

## 2. Object

**Stars printed on the panel**: captured content, not relief. A star is not a rounded box, so it has no primitive.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Star (input) | A 24 px target holding a five-point star | Flat | No |
| Stars (display) | A row of stars, `font.size.base` high, filled to the score | Flat | No |

## 3. Faces and materials

| Part | Colour |
| --- | --- |
| Star up to the score | `accent` |
| Star above the score | `edge` (3:1 against the panel) |
| Star under the pointer, and the stars before it | `accent` at 55% over `edge`: a preview of that score |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Flat stars | Same | Same |
| Hover (input) | The preview colours | Same | Same |
| Focus-visible | `outline: focus.width solid accent` around the focused star's target | Same | Same |
| Disabled | Stars at 38% | Same | Same |

## 5. Relief primitives

None. The stars are captured content in every presentation.

## 6. Tokens it reads

`colour.accent`, `colour.edge`, `colour.text`, `space.1`, `space.2`, `target.min`, `font.size.small`,
`font.weight.strong`, `focus.*`.

## 7. DOM structure and overlay needs

```html
<fieldset class="ug-rating">
  <legend class="ug-rating__legend">Your rating</legend>
  <div class="ug-rating__stars">
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="1">
      <span class="ug-rating__star" aria-hidden="true"></span>
      <span class="ug-rating__label">1 star</span>
    </label>
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="2" checked>
      <span class="ug-rating__star" aria-hidden="true"></span>
      <span class="ug-rating__label">2 stars</span>
    </label>
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="3">
      <span class="ug-rating__star" aria-hidden="true"></span>
      <span class="ug-rating__label">3 stars</span>
    </label>
  </div>
</fieldset>
<span class="ug-rating-display" role="img" aria-label="4.5 out of 5 stars" style="--strata-rating: 0.9; --strata-rating-max: 5;"></span>
```

- Each item's label is visually hidden; it names its radio. `itemLabel(score, max)` in the bindings changes the
  wording.
- `Rating` takes `label`, `max` (5), `name` (generated when absent), `value` or `defaultValue`, a change callback
  and `disabled`. `RatingDisplay` takes `value` and `max`, and an optional `label` for its name; its
  `--strata-rating` (0–1) is the score over `max`, and `--strata-rating-max` sets how many stars it shows.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Moves to the checked star (or the first) and out of the group |
| Arrow keys | Change the score by one, wrapping |
| Space | Selects the focused star |

- Announced as a radio group named by the legend, each star as "3 stars, radio button, 3 of 5". The display is an
  image named by its score.

## 9. CSS presentation

Each star is a 24 px target whose `::before` is the star shape (`clip-path`), so the focus outline is not clipped.
Stars up to the checked one are filled, through `:has()`; with none checked, all are unfilled. The display paints
two rows of stars with a mask: unfilled, and filled clipped to `--strata-rating`. Under `forced-colors` filled stars
are `Highlight` and unfilled ones `CanvasText`.

## 10. Tests

- **Bindings:** matches this markup; a click and arrow keys set and report the score; the value is submitted; filled
  stars follow the score; the display is an image named by its score.
- **GPU:** the stars are captured with no primitive; a real click on a star sets the score, and GPU stays on.

## 11. Indicator form: `lamps`

Instrument, everyday forms ([plan](../instrument.md#everyday-components-at-the-instrument-level)). `form="lamps"` draws the same native radios
as **a row of lamps**: each star's place holds a lens, lit up to the score. It is the [Lamp](lamp.md)'s lens and the
[StatusLight](status-light.md)'s emitter on the Rating's radio group. `flush`, or no `form`, is the Rating above, in the markup and the look it
had before, pixel for pixel; any other `form` string is the native `form` attribute (the id of the fieldset's form owner), as before.
`colour` names the lit lenses' role (`glowOn`, the lamp's amber, by default). As with the Switch's hardware forms, the premium character's default
form is reached by naming it: with no `form` the Rating is its flush look, so a page that does not opt in is unchanged. `RatingDisplay` stays a
printed image.

| Part | Shape | Moves |
| --- | --- | --- |
| Item | A square, the lens plus 16 px (the bloom's halo), at least `target.min`: 28, 32 or 36 px at small, medium and large; the native radio covers it | No |
| Socket | The dark disc under the lens, printed on the face at every level | No |
| Lens | A glass lens Ø `size.rating` (12, 16 or 20 px, so 0.35 of its diameter high at the Instrument level), with its emitter | Lit 0 to 1 by `--strata-lit` |

- **State and cues.** Lit up to the checked radio and dark above it, as the stars fill; the radio group's role, name, position and state are
  native, so the lamps never carry the score alone. A hovered star and the ones before it show a lens half lit (`--strata-lit: 0.55`), the
  preview of that score, while the rest of the row goes dark, as the stars do; the preview is only for a real hover (`hover: hover`), so on a
  touch screen a tap leaves the score lit, not half lit. Focus-visible is the CSS outline round the focused item (captured content, at every
  level). A **disabled** rating keeps its score, its lenses dimmed to 38% and throwing 30% of the light, so what it is set to is still said.
- **The native control stays the control.** Each `<input type="radio">` covers its item, invisible (`opacity: 0`), so every press and every key lands
  on it: one tab stop, arrows change the score, Space selects, the value takes part in a form, exactly as before. The lens is `aria-hidden` inside
  the star's `aria-hidden` span; the accessibility snapshot of a Rating is the same with and without the form.
- **Emitters.** A lit lens is an emitter at every GPU level, from the lamp's tokens (`emitter.lamp.*`: 3,200 at the 28 px reference lens, so
  1,045 at 16 px; reach 6 lens diameters, 96 px; height 0.7): **a 5-star rating is 5 emitters**, and a score is a uniform write
  (no capture, upload or hit-geometry update). A panel with lamps takes a version 4 scene with its `emitters`, the `protected` rects of its text and
  a `feather`, so a legend beside a lit lamp keeps the contrast guard. Under `prefers-contrast: more` the emitters are off and a lit lens is flat colour.
- **GPU.** Relief draws each lens as a ring face in its colour (the socket printed on the face under it), Objects as a dome standing on the face,
  fitted so its shadow stays in the item's box; at the Instrument level each lens is a glass LED lens ([StatusLight](status-light.md): 0.35 of its
  diameter high) with its emitter, its bounds the radio's box.
- **Presentation.** Forced colours: `Highlight` lit lenses and `Canvas` dark ones, each edged in `CanvasText`. Reduced motion changes nothing (nothing moves).
  Under `prefers-reduced-transparency` the lens is opaque lacquer. At 320 px the row wraps, at 200% text the legend wraps and the items keep their size.

```html
<fieldset class="ug-rating" data-strata-form="lamps">
  <legend class="ug-rating__legend">Your rating</legend>
  <div class="ug-rating__stars">
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="1">
      <span class="ug-rating__star" aria-hidden="true"><span class="ug-rating__lens" data-strata-face="knob"></span></span>
      <span class="ug-rating__label">1 star</span>
    </label>
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="2" checked>
      <span class="ug-rating__star" aria-hidden="true"><span class="ug-rating__lens" data-strata-face="knob"></span></span>
      <span class="ug-rating__label">2 stars</span>
    </label>
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="3">
      <span class="ug-rating__star" aria-hidden="true"><span class="ug-rating__lens" data-strata-face="knob"></span></span>
      <span class="ug-rating__label">3 stars</span>
    </label>
  </div>
</fieldset>
```

- `data-strata-colour` (`colour` in the bindings) is on the fieldset. React: `<Rating form="lamps" colour="success" label="Your rating" name="score">`; Vue: the
  same props with `v-model`; Astro: `<Rating form="lamps" ...>`. No behaviour script is needed.
- **Tests:** `ui-indicator-forms.test.mjs` (plain DOM, touch, reflow, preferences, GPU at Relief, Objects and Instrument),
  `ui-indicator-forms-bindings.test.mjs`, `ui-indicator-forms-astro.test.mjs`.
