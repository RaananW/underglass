# Probe: a pinned stage driven by scroll

The planned underglass.dev home page is one document with two layouts: a flowing page of sections in
ordinary DOM, and with GPU presentation a deck, where one stage stays in the window and the scroll
position drives the change from each section to the next. This probe checked that the runtime
supports that before any of the site is built on it.

- Page: `examples/playground/ui-probe-deck-stage.html` (`src/ui-probes/deck-stage.tsx`).
- Suite: `tests/browser/ui-probe-deck-stage.test.mjs`, a probe suite (skipped by default):
  `node scripts/test-browser.mjs tests/browser/ui-probe-deck-stage.test.mjs` after `npm run build`.
- It uses only the public React API: `createCanvasHosts`, `mountCanvasApp`, `useSurfaceRef`,
  `setTransform`, `setEffects` and `defineEffect`. Nothing in `packages/` changed.

## What was tested, and on what

| | |
| --- | --- |
| Browser | Chrome Canary 160.0.8166.0, Windows 11, with the suite's HTML-in-Canvas flags; headless and in a headed window (`--headed`, where a real scrollbar narrows the stage) |
| Window | 1280x720 at DPR 1 and DPR 2 (emulated), and a resize to 1100x650 |
| Proposal | [WICG/html-in-canvas](https://github.com/WICG/html-in-canvas) at `5d9d970` (2026-10-30). A search of its tracker for "sticky" finds no issue |
| Chromium hotlist | [6783002](https://issues.chromium.org/hotlists/6783002) could not be read: without a signed-in browser the page shows no issue list. Not checked |
| Date | 2026-11-16 |

## The page

Four sections of two layers each (a copy layer with a heading and a link, and a panel with a button
and an input) and a decorative backdrop, all enrolled with `useSurfaceRef` and laid out by CSS.

- **Flow** (ordinary DOM): the stage is the whole track, four windows tall, and each section sits one
  window further down. Only the backdrop is enrolled.
- **Deck** (GPU): `html.deck` makes the pin `position: sticky; top: 0; height: 100vh`, so the stage is one
  window tall and stays put while the track scrolls past. The sections are stacked on it.
- Both are the same height, so a section's place in the flow is its rest position in the deck.

In the deck, a frame loop reads the scroll position. At a rest position one section is enrolled.
Between two, both are, and the loop poses them: the leaving panel tilts back and shrinks
(`setTransform` with `tiltX`), the arriving panel materialises under a ripple and a custom WGSL
(`setEffects` with `interaction: "inert"`, then `handle.update`), the copy layers slide and fade, and
the backdrop ripples.

## Results

All ten tests pass, headless and headed.

| Question | Result |
| --- | --- |
| Does GPU presentation survive a `position: sticky` stage while the document scrolls? | Yes. The mode stays `gpu` through the pinned range, above it (the stage cut by the bottom of the window), below it (the stage scrolled 100 px out of the top), at a fractional offset and after a window resize. Real clicks reach the section's button in each case, and the pixels are the section's |
| Is a scroll-scrubbed change free of captures? | Yes. Six scroll steps forwards and backwards through a change leave every layer's capture count unchanged |
| Can a layer tilt while pinned? | Yes. The leaving panel tilts up to 50° through each change with no refusal. Outside the pinned range the probe poses nothing, so a tilt on a stage that is partly out of the window was not tried |
| Can sections be enrolled only while on stage? | Yes, both ways. A change starts in the frame the arriving section is enrolled: its effect chain attached with no retry |
| Is any frame blank while scrolling? | No. Of 126 screencast frames recorded while the wheel scrolled through all three changes, every one shows the backdrop's marker |
| Do parked sections stay out of the way? | Yes. A parked section (in the document, not enrolled, `opacity: 0; pointer-events: none`) is not drawn and takes no hit, with every section stacked on the same place |
| Can the layout change between flow and deck? | Yes. `enable()` from the second section gives the deck at the same scroll position, with the typed text and the counts kept; `disable()` gives the flow back the same way |
| Does a fixed box over the stage stop admission? | No (a 260 px status box in the corner) |

## What the site should take from it

1. **Keep every section in the document and enrol on demand** (`?park=unenroll`). Sections keep
   their React state, stay in the accessibility tree, and can take focus. Rendering sections on demand
   (`?park=unmount`) works too but loses all three.
2. **Bring a parked section on stage when focus enters it.** Tab from the first section's input lands
   on the second section's link; the probe scrolls to that section on `focusin`, and it is at rest and
   clickable when the scroll settles.
3. **Ordinary DOM is the flow, not a deck.** A layer enrolled with `useSurfaceRef` keeps its own CSS in
   ordinary DOM: `setTransform` on it shows nothing there. The deck's poses therefore exist only on
   the GPU, and a browser without it gets the flowing page, which is also what a crawler reads.
4. **Change to the deck layout before `enable()`**, and back to the flow when the mode returns to
   `dom` (after `disable()`, a refusal or a lost GPU). The stage must be one window tall when
   admission runs: as the flow it is four.
5. **Use a rest band, not a rest pixel.** A scroll offset is rounded to device pixels, so "exactly at
   the section" can be a pixel off. The probe treats 2 px as rest; the site should use a wider band,
   so a section is interactive when the visitor is about there.
6. **Make the leaving section inert too, or take focus out of it.** A focused input's caret repaints
   its layer as it blinks, about twice a second. That is correct (the pixels are fresh), but it is a
   capture during the change, and it showed up as one in the first run of the test.
7. **GPU presentation places a layer on whole pixels.** The panel's box moved by a fraction of a
   pixel between the flow and the deck (691.19 to 691). Not visible, but a test must allow for it.

## Not proven

- **Pacing.** No frame is blank, but how evenly frames arrive when a section is first enrolled
  (its first capture) was not measured.
- **Large stages.** A stage as wide as a 4K window is over the captured-pixel budget for one layer
  that fills it. The site plans a stage capped at about 1600x900 CSS px; that cap is not built or
  tested here.
- **Sections taller than the window**, phones, touch scrolling, and browser toolbars that change
  the window height (`100vh` against `100svh`).
- **Scroll snapping.** `?snap` turns on `scroll-snap-type: y proximity` for a look in a real
  window; no test covers it.
- **The HTML-in-Canvas polyfill**, reduced motion, and screen readers.
- **Fractional device pixel ratios** (1.25, 1.5) on a real display.
