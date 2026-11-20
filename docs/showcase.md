# Example showcase, underglass.dev and GitHub Pages

The private `examples/showcase` npm workspace is the public site, using the public
Underglass package. It is two documents:

- **The home page** (`index.html`, `src/home`): a page of eight sections which, with
  GPU presentation, is a deck with a change between each two. See
  [The home page](#the-home-page).
- **The examples** (`examples.html`, `src/main.tsx`): the gallery at `/examples` and a
  page for each of the ten live examples at `/examples/<id>`.

The engineering playground remains separate; raw reports, probes, test evidence and
private fixtures are not served.

The page around a stage has the home page's look (near-black ground, hairline rules,
one indicator colour); what a stage holds is the example's own, with its own colours.

## The gallery and an example's page

**The gallery** (`/examples`) is every example as a card and nothing else: a heading,
one line of what the examples are, whether this browser can draw them on the GPU, and
the cards in three groups (`groups` in `src/catalog.ts`: **Start here**, **Real
controls at work**, **Lit component libraries**). The first card is in the first
screen at every width. A card is the example's picture, its category and number, its
title and a sentence. The gallery loads no Underglass; a card is a link to the
example's page.

**A card's picture** is the example's own stage, GPU-presented:
`public/thumbs/<id>.jpg` (720x485) and `<id>-s.jpg` (360x243), offered together
(`srcset`) so a wide page fetches the small one. `scripts/showcase-thumbnails.mjs`
renders them from a served build; run it by hand after an example's look changes and
commit the images.

**An example's page** holds the example and the way around:

- **The bar**, one row at every width: **All examples** (back to the gallery), the
  example picker (a native select, which a phone shows as its own list), previous and
  next, and the presentation switch, **GPU** and **DOM**, whose pressed half is how the
  stage is drawn now. On a phone the back link is its arrow and previous and next are
  left to the card under the stage. The bar is part of the page and is not fixed over
  it: nothing may lie over the stage where GPU admission draws and clicks its probe.
- The example's title (the page's `h1`) and **the stage**, which starts in the first
  screen.
- **The status line** under the stage: the mode, what the runtime last said, and
  **Details** with the exact reason, what GPU mode needs and **Dispose example**.
- What the example does, the **Why the GPU here** panel, and the card of the next
  example with a link to the gallery.

The picker, previous, next and the card switch examples in place
(`history.pushState`), so the running runtime and its GPU mode survive; the gallery
is loaded as a document of its own.

| Example | What it shows |
| --- | --- |
| `examples/layers` Postcard studio | Native text input, textarea and radio swatches/stamps edit a postcard surface live; an outbox surface lists saved cards with native **Reuse** buttons. **Riso print** applies a chromatic channel shift to the landscape artwork. |
| `examples/motion` Card deck | Deal, Stack, Fan, Shuffle and Spin run one `transitionGroup` with a stagger slider; **Play layer journey** runs one `transition` on `showcase-card`. Cards use `origin="center"`. Like buttons remain native during motion. When an arrangement settles the table artwork ripples. |
| `examples/effects` Shader lab | Presets, toggles and range sliders build a 1..3 operation `setEffects` chain (ripple, chromatic, dissolve and the custom `defineEffect` WGSL "aurora") on the decorative `showcase-art` layer. |
| `examples/presence` Notification stack | Four stable toast surfaces use `Presence` enter/exit; Dismiss buttons are ordinary React buttons and `onComplete` results are logged. Each arrival ripples the phone wallpaper. |
| `examples/tasks` Small tasks | The maintained task component reused unchanged from `examples/playground`. |
| `examples/pond` Webcam pond (experimental) | An optional camera image is mirrored onto a koi pond. The pond floor, text typed into a native input, CSS-animated fish and the camera `<video>` are one decorative layer under a continuous ripple (refraction) and the custom `showcase-pond` WGSL water shader (caustics, depth, glints). A native, rotated lily-pad layer feeds the fish. |
| `examples/fluent` Fluent release board | Stock Fluent UI v9 components (`@fluentui/react-components`), one `FluentProvider` inside each layer and `PortalMountNodeProvider` pointing Fluent's menus, dropdowns, tooltips and dialog at the overlay host. Cards are thrown between lanes on JavaScript springs (`setTransform` per frame) that keep the release velocity. Transition effects run on the live components: archiving burns a card away (custom `showcase-burn` WGSL), adding one materialises it, its editor (a full Fluent form) grows out of the card under ripple, chromatic and dissolve, a hard throw lands with a shockwave, and released cards warp into the poster. Content is inert only while an effect runs. |
| `examples/compare` GPU or CSS? | Six jobs done twice, side by side: the best CSS technique in the left pane (`compare-css`), Underglass in the right pane (the decorative art layer). Glowing tiles (box-shadow/border-radius keyframes vs a custom WGSL over one capture), ripple (SVG turbulence displacement vs the ripple effect), channel split (three filtered, screen-blended copies vs chromatic), burn away (SVG noise threshold mask vs a custom WGSL burn), recolouring 2,052 heat-map cells (one custom property and `color-mix()` per cell vs a custom WGSL colour map over a grey capture) and frosted glass, where CSS wins because Underglass shaders cannot blur. A meter shows main-thread rendering work per frame (the gap between `requestAnimationFrame` and a message posted from it) and the frame rate; **Animate** runs both sides, one side or neither. **Measure both** times each side alone (both paused, CSS only, then Underglass only in GPU mode; 0.5 s settling and 1.5 s of frames each) and shows each side's ms/frame, and the part above idle, under its pane. In ordinary DOM the right pane shows the raw capture without its shader. |
| `examples/strata` Strata components | Every Tier A, B and C component of `@underglass/ui` ([Strata](ui-library/plan.md)), from its React bindings, on two Strata panels: an AppBar and a panel of Tabs over seven groups (actions, inputs, choices, content, feedback, navigation, structure). `useStrataGpu` presents both panels on the GPU. The bar's **Relief**, **Objects** and **Scene** switch and its theme select (light, dark, high contrast) set `data-strata-level` and `data-strata-theme` on the root, which the helper follows without re-enrolling. Dialog and Drawer render into the root as panels of their own; Tooltip, Toast, Popover and Menu are in the top layer, outside every layer. **Celebrate** bursts confetti at the Scene level. In ordinary DOM it is Strata's CSS presentation. |
| `examples/instrument` Instrument gallery | Every Instrument component on main in its premium form, by the catalogue's groups, with its native element and anatomy page, and a synthesiser voice (five module panels: master, sound, output, pads and keys, modulation) whose controls are wired to each other. The groups are tabs (wave 1, 2 and 3, the everyday forms, the input forms), each split into panels that stay under the 16-material cap, which the notes tab counts from `StrataGpu.diagnostics`. The bar's **CSS**, **Relief**, **Objects** and **Instrument** switch, **Light** and **Dark**, **Premium**, **Studio**, **Hi-fi** and **Playful** (`data-strata-character` on the document element) and **Pointer light** (`pointer-light.ts`, a wrapper round the helper's controller that writes one emitter into every scene) change the presentation without re-enrolling; CSS (`css-level.ts`) presents the panels as plain layers. This example's stage is fluid (`stage-fluid`: its height is set from its panels) and reflows down to 320 px (at 320 px the intro is hidden: the stage may be at most 4,096 CSS px tall at DPR 2, the device's 8,192 px texture limit, and the synthesiser is the tallest page). The example raises the captured-pixel budget to 6M CSS px: an open dialog adds a scrim the size of the stage to the wall and the panels. On a phone (600 px or less) one content panel of a group is on the stage at a time, picked by the bar's **Panel** switch (the synthesiser keeps its master panel with it): a whole group in one column was up to 3,084 CSS px tall, past the largest texture at a phone's device pixel ratio, so GPU presentation was refused there |

Under the stage, a **Why the GPU here** panel (from `src/catalog.ts`) states what the
GPU path does in that example and, next to it, what CSS alone would do, including where
CSS would be just as good. Each example has at least one GPU-only part: a per-pixel
effect on decorative artwork (channel shift, ripple displacement, dissolve or custom
WGSL), which CSS filters cannot apply to rendered HTML. Ripple pulses (`usePulse` in
`src/scene.tsx`) only run on the GPU and respect reduced motion.

**Camera privacy (pond).** The camera starts only when the visitor presses **Start
camera** and the browser grants permission. Video only, no audio. Frames go from the
`<video>` element into this page's GPU canvas; nothing is recorded, uploaded, stored
or sent anywhere, and the site has no backend. **Stop camera**, leaving the example or
closing the tab stops every track. The panel says this before the camera is started.

The examples share a 1040x700 stage, except the Instrument gallery, whose stage is
fluid: as wide as the page and as tall as its content. A decorative backdrop and the decorative
`showcase-art` layer persist across examples (only their layout/content change).
The art layer always carries the aurora definition, at identity strength unless
the shader lab asks for more, because custom WGSL is compiled per layer during
fresh GPU admission; this lets the lab use it even when GPU was enabled on
another example. After any return to ordinary DOM the chain is re-attached so
the next explicit admission compiles it again. Browsers without WebGPU skip the
custom operation silently.

Deck motion, including rotation, runs the same typed transitions in ordinary DOM
and on the GPU. Rotating surfaces avoid `overflow: hidden` on the enrolled
element (a clipped GPU layer must stay axis-aligned); clipping happens on
descendants. Descendant CSS transitions/animations are allowed: they repaint
native content and do not block declarative motion or revoke GPU.

```sh
npm run dev:showcase       # builds the library first; localhost:5190/underglass/
npm run build:showcase     # examples/showcase/dist only
npm run preview:showcase   # localhost:5191/underglass/
# For a domain-root site/local root preview:
CANVAS_SHOWCASE_BASE=/ npm run build:showcase
```

The default base is `/underglass/`. Override `CANVAS_SHOWCASE_BASE` with an absolute
directory path ending in `/` for a different project/domain (in Git Bash on Windows, also set
`MSYS2_ENV_CONV_EXCL=CANVAS_SHOWCASE_BASE`, or Git Bash turns `/` into a Windows path).

## The home page

`index.html` is the site's home page. `src/home/page.tsx` has eight sections, each making one claim about the framework (the
DOM stays the DOM, page transitions, motion, shaders, components, ordinary DOM
everywhere, getting started) beside a "specimen" panel of ordinary HTML: real controls,
tables and code. `src/home/home.css` is its whole stylesheet (near-black ground,
engraved type, hairline rules and one indicator colour); the page loads none of the
gallery's CSS or JavaScript.

### One document, two layouts

The stage is an Underglass root. Each section is two elements, its text (a
`<section>`) and its specimen (a `<figure>`), both direct children of the root, because
a GPU layer must be one. The cover is a single element with its specimen inside it.
The header, the side scale and the footer are static markup outside the root.

- **The flow** is the page in ordinary DOM, and what every browser, crawler and agent
  is served: a CSS grid with one row per section, at least a window tall on a wide
  screen and a single column on a narrow one (a phone). Nothing is enrolled as a
  layer. Sections start at the same height in their rows, as slides do.
- **The deck** is the page with GPU presentation, at every window size, a phone's
  included. `html.deck` makes the stage stick to the window, with every section in the
  one grid cell, while a track scrolls past, and `src/home/deck.ts` reads the scroll
  position. The deck is the flow with the crossing from one section to the next
  replaced by a change:
  - A section taller than the stage **pans**. While the scroll position is inside the
    section's own length, the section moves up the stage exactly as the flow would
    scroll it, by its matrix (`setTransform`), on whole pixels. A section that fits
    the stage does not pan.
  - Then comes one window of scrolling for the change to the next section. At each
    end of it is a rest band (14% of a window) where one section is alone on stage and
    interactive; between the bands both sections are on stage and the driver runs the
    change between them. With reduced motion every change is a fade.
  - The stage follows the scroll position, but runs a change in no less than 0.52 s, so
    a fast scroll (a trackpad's fling) still shows each change it passes and the stage
    catches up when the scroll stops. A stage at rest that is two sections or more
    behind the scroll jumps to it instead, with one change, as the paging keys do.
  - A scroll of the visitor's (wheel, trackpad, finger, scrolling key or scrollbar)
    that stops part way through a change, outside the rest bands, **settles**: after
    0.38 s without scrolling the page scrolls on to the next section's rest, or back
    where the change had barely begun (under 30% of it in the direction of travel). So
    the page always comes to rest on a section that takes input. A scroll made by a
    script does not settle. On the side scale a cursor shows which: lit on the section
    at rest, hollow and moving between the marks while the stage changes.
  - The track is as long as the sections' pans and the changes together, which is the
    length of the flow. The driver measures it (parked sections are laid out for the
    measurement, with nothing painted meanwhile) and sets it as `--track`.
- **In one column** (a window 920 px wide or less: a phone) the specimen is under its
  text in the flow, and a section is too tall for the screen. So there the deck works
  in **stops**: a section is two, its text and then its specimen, each a page that
  starts near the top of the stage and fits a phone's screen (checked at 384 by
  700). A change then always lands on a whole page, with nothing to scroll after it.
  - The change between a section's two pages is another of the deck's, chosen so that
    it differs from the two around it.
  - The cover is one layer where there are two columns, with its specimen inside it.
    In one column that specimen is not shown and the same one follows as a layer of
    its own (`cover-figure`), so the cover is two pages too.
  - The demonstration's controls are in the section's text. In one column the text and
    the panels are different pages, so the controls are there a second time, as a
    layer above the panels (`transitions-controls`, with ids of their own), and the
    ones in the text are not shown. Each panel is told the controls' height
    (`--above`), because in the deck every layer lies in one grid cell.
  - The text's page has no panel on it there. Its box says where the changes are to
    be seen (every change between two pages is one, and scrolling scrubs it) and has
    a link to the panels' page ("Go to the panels"), which the deck follows with a
    jump.
  - An element the layout does not show (`display: none`) is no layer. The driver
    builds its stops from what is shown, and builds them again when the window
    crosses between one column and two.
  - A page still taller than the stage (a very small phone, large text) pans, as
    above.

### The background and the light

The page's background (`.backdrop` in `home.css`) is ordinary DOM, fixed in the window
behind everything, in both presentations: the output canvas is transparent where no
layer is. It has two pools of light, a faint grid that fades toward the text, and two
lens rings that travel down the right side as the page scrolls (`flow.ts` sets
`--travel` on the backdrop itself, so nothing else restyles). During a jump the rings
travel with the change.

In the deck a light follows the pointer under the sections (`src/home/light.ts`): one
decorative layer with a custom effect. Its element is empty and an eighth of the
stage's size, drawn eight times larger, so its texture is a few thousand pixels
whatever the stage's size: the shader computes the light. With the pointer off the
stage it draws nothing, so the stage is then exactly what ordinary DOM shows, and no
frame is drawn while nothing moves.

### The live demonstration

The "Transitions" section shows what it says. Its specimen is one panel (the
comparison with View Transitions), and a second panel lies in the same place: both
are direct children of the root, so both are layers. Controls in the section's text
turn one into the other: seven buttons pick the change, a slider scrubs it, and Play
runs it on the clock in 1.3 s.

- `src/home/demo.ts` is the demonstration's state: `t` from 0 (the first panel) to 1
  (the second), and which change. It imports nothing of Underglass.
- While the section is at rest, the deck's driver poses the two panels from that
  state with the same changes it runs between sections (`transitions.ts`): the first
  panel is the leaving layer and the second the arriving one. At either end the
  other panel is hidden by its matrix.
- Each panel has a clock that counts in tenths of a second, to show that neither is
  a picture while it changes. The clocks start at the first use of the controls and
  count only while the section is at rest on stage, so a page nobody touches
  repaints nothing.
- The controls are in the section's text, another layer, so they go on working while
  the panels carry an effect (a layer with an effect takes no input).
- When the section leaves its rest part way through a change, the demonstration
  settles on the nearer panel, and the other stays hidden through the section's own
  change.
- In ordinary DOM the panel that is not showing is `visibility: hidden`, and the
  panels swap at the middle of the slider. On the GPU no class changes while the
  slider moves.
- In one column a section's text and its specimen are two grid rows. The rows are
  named (`--row`), so that the second panel shares its specimen's row, and in the
  deck the driver gives it the specimen's height (`--match`).

### The changes between sections

`src/home/transitions.ts` has one change per boundary, each a different thing the GPU
can do to a live page. The readout names the one that is running.

| From | Change | What it is |
| --- | --- | --- |
| Cover | burn | A noise front with a glowing edge burns the section away, and the next one is what it leaves |
| The DOM | tilt | Matrices only: the texts change places, the specimen tilts back and the next rises over it. The layers stay interactive: a button can be clicked mid-change |
| Transitions | water | The built-in ripple and chromatic split: the section goes under water and the next settles out of it. The ripple keeps moving when the scroll stops |
| Motion | scan | A bar of light crosses the stage, with the next section above it. The bar is a glass rod: it magnifies the page where it crosses |
| Shaders | iris | An aperture opens from the middle of the stage onto the next section, behind a shock wave that bends the page around its rim |
| Components | mosaic | Tiles of the stage turn over one after the other: each is squeezed to a line and opens again as the next section |
| Everywhere | exposure | The section is overexposed until it is gone, and the next comes out of the light |

- The tilt needs the browser's proof that native hits follow a tilted layer, which
  `enable()` makes with a probe in the stage's top left corner. Below the wide
  layout the header lies over that corner, and on a phone its brand link covered one
  of the proof's points: the proof failed, the runtime refused every tilt, and the
  change into the "Transitions" section did not run. So while the check runs the
  header takes no pointer (`html.checking`). Where the proof fails all the same, the
  driver runs a change that tilts as the flat slide.
- Every change but the tilt puts an effect chain on each layer on stage, with
  `interaction: "inert"`: the content takes no input until the chain ends, at the
  next rest. The driver writes the chain's parameters each frame (`handle.update`),
  which repaints nothing, like a transform.
- Burn, scan, iris and mosaic hand over along a **field**. The two sections stay in
  place, and the field hides the leaving section exactly where it shows the arriving
  one. The field is in stage coordinates (each layer is told its own origin), so it
  runs unbroken across a section's layers. Their WGSL is written so that both ends
  are exact: the layer untouched at one, gone at the other.
- Scan, iris and mosaic also **move pixels**. Their chains start with a custom
  displacement (`defineEffect` with `geometry: "displacement"`: a function that says
  which position of the layer each pixel is drawn from), followed by the colour
  function. The rod and the shock wave draw each side of the handover from nearer
  the line, so a side never shows the other's pixels and the handover stays where the
  mask puts it. A tile of the mosaic is squeezed about its middle, and each section
  draws it for half of its turn (a position outside the layer draws nothing). The
  colour function adds the light: the bar, the rim, a tile's face darkening as it
  turns away.
- A displacement moves pixels inside its layer's own box, never outside it. So these
  changes distort the sections where they are; one that carried a section's content
  across the stage would be cut off at each layer's edge.
- A custom effect's shader is compiled when it is first used, which stalled the page
  for 60 to 85 ms once per effect when I measured it. So after the deck starts, the
  driver puts each change's chain once on an empty 16 px layer in the stage's corner
  (`deck-warm`), one per idle moment, and ends its enrolment when all are done: about
  0.4 s in all. The first scroll into a change then has no frame gap over 34 ms.

Rules the deck keeps, most of them from the [probe](showcase-deck-probe.md):

- Only the sections on stage are enrolled: the driver calls `controller.enroll` for
  them, and `src/home/view.ts` tells React which others to park, inside `flushSync`.
  A parked section is in the document and the accessibility tree, at `opacity: 0` and
  out of the pointer's way. `page.tsx` itself imports nothing of Underglass.
- Scrolling through a change writes matrices and effect parameters only. Nothing in
  the document changes, so nothing is captured. A layer that is not seen is drawn at a hundredth of its size,
  because a layer at opacity 0 still takes native hits where it lies.
- A tilted layer stays inside the stage (the stage does not clip it); a flat one may be
  cut off by it.
- When a change ends, the layers that leave the stage are hidden, not put back as they
  rest. The GPU still draws a layer for a frame or more after its enrolment ends, until
  the stage without it is ready, and a layer put back would show whole for that long.
- When a change starts, a layer that rests hidden (the demonstration's second panel)
  is written hidden, never as it rests, before the arriving layers are enrolled. The
  runtime draws at every write, and after an enrolment it holds the last complete
  frame until the new layers are captured. So a pose written before the enrolment is
  on screen for those frames, and one written after it is not seen until they are
  over: the order of the writes around an enrolment is what the visitor sees.
- The layout changes to the deck before `enable()`, and back to the flow whenever the
  mode returns to `dom` (a refusal, the readout's switch, a lost GPU). The section in
  the window stays the same both ways, and so does every control's state.
- A link to a section, Back and Forward, and Page Up, Page Down, Space, Home and End
  **jump**: the stage changes straight from the section on it to the one asked for,
  with one change (the one that leads into the further of the two), in 0.95 s, however
  many sections lie between. The scroll position is set to the target's at once and the
  change runs on the clock, so a jump over five sections does not race through five
  changes. Scrolling during a jump ends it. Focus moving into a parked section brings
  that section on stage at once.
- A resize keeps the place, in sections, at rest or part way through a change: the
  track is one window per section, so the same place is at another offset in a window
  of another height.
- When GPU presentation ends by itself (a lost device, a paint that timed out), the
  page is the flow in ordinary DOM at once, and starts GPU presentation again 0.9 s
  later, twice at most in half a minute.
- Nothing overlays the stage: the header and the side scale sit beside it, so the
  admission probe is never covered.
- On a wide screen the stage is the window under the fixed header and beside the side
  scale, at most 2560 CSS px wide. Below 1180 px the header scrolls away with the
  page, as in the flow, and the stage is the whole window; only the header's links
  take the pointer there, so the admission probe in the stage's corner is not covered.
- The tilt needs every layer inside the stage (the stage cuts a flat layer off at its
  edge, but not a tilted one). Where a section is taller than the stage or has panned,
  that change is the flat `slide` instead.
- A parked section has no height and is clipped (`overflow: clip`), so that it does
  not reach past the stage. Not `overflow: hidden`: a box with hidden overflow scrolls
  when focus moves into it, and a scroll inside the root that is not a layer's ends
  GPU presentation.
- Page Up, Page Down and Space page through a section that is taller than the stage,
  and jump from its end.
- The frame loop never calls `controller.state()`: it copies every metric and measures
  every layer. The driver keeps the mode from `onStatusChange`, and the readout reads
  the state twice a second.

The readout in the header shows the mode (a switch) and, on the GPU, the layers on
stage, the captures so far and the runtime's work per frame. Where the browser has the
APIs the deck starts by itself; a visitor who switches it off stays in the flow for
the rest of the session (`sessionStorage`, `underglass-deck`).

Not built: CSS scroll snapping. Tried with `mandatory` snapping and
`scroll-snap-stop: always`, the browser animated each change in one quick snap, so the
change could hardly be seen; the driver's pacing and settling above replaced it. In the
deck, the browser's find-in-page can match text in a parked section, which is not
painted.

**Tried on one real phone.** On a Galaxy S25+ the deck ran with its changes, and
showed that a section was too long for the screen, which is why a section is now two
pages there. The pages themselves are checked in Chrome's emulation on a desktop: a
384 by 700 window at three device pixels per pixel, with touch. That proves the
layout, that every page fits, taps and the changes (the tilt among them). It does not prove a finger's
scrolling (a synthesised touch gesture does not scroll the emulated page at all, in
either presentation), the browser's toolbar hiding and showing, or the memory a
phone's GPU has (the capture budget is 16 million pixels; a refusal leaves the flow in
ordinary DOM). The stage is as tall as the largest viewport (`100vh`): while the
browser's toolbar is showing, the bottom of the stage is under it, so a page is made
to fit the smaller height.

In one column the deck and the flow are not the same picture: the flow shows what
follows a part under it, and the deck shows one page. A change of layout keeps the
same part of the page at the top of the window.

### The first load

The first frame needs one request, the HTML (about 10 kB compressed), and no script:

- The page is **prerendered**: `prerender.ts`, a Vite plugin, loads
  `src/home/prerender.tsx` in Node when the site is built (or served by the dev server)
  and writes the page's markup into `index.html`. The stage is rendered with
  `prerenderCanvasApp`, so the HTML holds the Underglass hosts with the application in
  them ([server rendering](guide/server-rendering.md)). In the flow the stylesheet
  lets the content size the hosts, which otherwise fill their frame.
- The stylesheet is **in the HTML**: `inline-css.ts`, another plugin, replaces the
  page's stylesheet link with a `<style>` element. The page loads no font and no image.
- The entry script, `src/home/main.ts`, is about 1 kB and only decides what to load:
  - `gpu.tsx` in a browser with the APIs, at any window size. It adopts the
    prerendered hosts (`createCanvasHosts`), hydrates with
    `mountCanvasApp({ hydrate: true })` and starts the deck. About 260 kB of
    JavaScript, compressed.
  - `dom.tsx` everywhere else: React alone hydrates the same markup, in the root
    container the hosts were served with, and the Underglass runtime is never
    requested. About 81 kB.

**Starting GPU presentation changes no pixel of the stage.** Three things make that so
(`home.css`), and `npm run test:showcase` compares the pixels:

- The flow and the deck put a section at the same place, at the same scroll
  position. A section has the same margins in both (on a wide screen the flow's top
  margin is the deck's plus the header the stage starts under), a row of the flow is
  as long as the section's pan and its change together, and the deck pans a section
  as the flow scrolls it.
- Every layer is on whole device pixels, with a size in whole pixels. The GPU draws a
  layer on whole pixels, so a layer between two pixels in ordinary DOM would have its
  text move by one. Whatever places a layer (the gutters, the gap, the first column,
  the top margin) is rounded to 4 px with CSS `round()`, which is a whole number of
  device pixels at every usual display scale, and every line of text in the stage has
  a line height in whole pixels.
- The stage's text is antialiased in grey from the first frame. Text the GPU draws is;
  ordinary DOM text on Windows is antialiased per colour channel, so it would change
  its tint. An inline script in `index.html` marks a browser that has the APIs before
  the first frame (`html.can-gpu`), and the stage is then a compositing layer of its
  own (`will-change: opacity`), where the browser antialiases text in grey.

Measured in Chrome Canary 160 at display scales 1, 1.25, 1.5 and 2: between ordinary DOM
and GPU, the only pixels that differ by more than a tenth of full scale are the
readout's own text in the header.

`npm run test:showcase` checks the served HTML (the content, the inlined stylesheet,
the small entry script) and the page without JavaScript; the flow at a desktop and a
phone width (hydration, the controls, no sideways scroll); the React-only path in a
browser without the APIs (the driver is not loaded and the scripts are under 400 kB
uncompressed); and the deck: it starts by itself, the GPU draws what a
control shows after it changes, a real click lands on a button in a tilted layer,
scrolling through a change captures nothing (the tilt and an effect change), every
change runs with GPU presentation staying on and its chains gone at the next rest, the
scan's mask shows the arriving section above the bar and the leaving one below it
exactly as they rest (its glass rod moves nothing beyond its own 40 px), the scan's
chains are a displacement and a colour function on every layer, links, keys and focus change the section,
a link jumps with one change in about a second, the lamp lights the background under
the pointer and goes out off the stage, a resize keeps the place part way through a
change, a destroyed GPU device is followed by a return to GPU presentation, the switch
returns to the flow and back with the form's state kept and no pixel of the stage
changed, and reduced motion only fades. For the live demonstration it checks that the
slider puts the chosen change's effect on both panels, that another change picked
part way through takes over, that the second panel's button takes a click, that Play
runs the change back, that scrolling on settles it, and that in ordinary DOM the
panels swap at the middle. In a short desktop window it also checks that a tall section pans by exactly the
scroll distance with no capture, that the change follows the pan, that a click lands
on a button far down a panned section, and that ordinary DOM is the same picture at
the same scroll position. On an emulated phone it checks the sixteen stops and their
layers, that no page pans, the change between a section's two pages (no capture), a
tap on a page's control, the demonstration from its controls above the panels, a
link's jump to a section's first page, and the return to the flow.

## Pages, search and social metadata

The base is the home page. The gallery is `<base>examples`, and each example has its
own page at `<base>examples/<id>`. On an example's page the picker, previous, next and
the next example's card switch examples in place with `history.pushState`, so the
running runtime (and GPU mode) survives; a modified click opens the page's own URL.
The brand goes to the home page and **All examples** to the gallery, each another
document. The home page leads to the examples from its header (at every width), its
cover (**Browse the examples**, where the page has two columns), a link in each section to the example that shows it
live, and three picture cards with a link to the gallery in its last section. Old
`#/motion` links, which named an example in the hash of the home page, are sent on to
the example's page by a line of script in the home page's head. No iframe capture is
used.

`examples/showcase/seo.ts`, a Vite plugin, writes one static HTML file per page, so no
server rewrite rules are needed: `index.html` (the home page, prerendered, given its
head), `examples/<id>.html` for each example, and the examples' index twice, as
`examples/index.html` and `examples.html`, so that `/examples` serves it on a host
that redirects to the directory and on one that tries the path with `.html`. Each
page has its own title, description and canonical URL (from `pageMeta` in
`src/catalog.ts`), Open Graph and Twitter card tags and JSON-LD (the site and the
software on the home page, a page with breadcrumbs for the examples). The studio's
pages have a `<noscript>` summary that links every page; the home page's content is
in its HTML. The plugin also writes `sitemap.xml`, `robots.txt` and a `noindex` `404.html`. In development the plugin serves
`examples.html` for every path under `/examples`. Canonical, sitemap and social URLs always
name `https://underglass.dev`, so the GitHub Pages copy points search engines at the
canonical site. An example with a GPU preview uses it as its social card; the others,
and the home page, use `public/og.jpg` (1200x630). `scripts/showcase-social-images.mjs`
takes that card as a picture of the home page's cover, from a served build, and
renders `public/apple-touch-icon.png`; run it by hand after a change to the brand or
the cover and commit the images. `main.tsx` keeps the title, description and
canonical URL in step when examples switch in place.

`npm run build:site` adds the documentation pages to `sitemap.xml` (below), so the one
sitemap `robots.txt` names lists the whole site.

Each URL in the deployed sitemap has a date (`<lastmod>`): the day the page's indexed
text last changed, which is what tells a search engine to fetch it again. A date that
moves when nothing changed is soon ignored, so it is not the build's date:

- `scripts/sitemap-dates.mjs` takes a fingerprint of each built page: its title, its
  description and the text of its `<main>`, without markup, scripts, styles or asset
  names. A build that changed only code or styling gives the same fingerprint.
- The build publishes `sitemap-dates.json` beside the sitemap, with each URL's
  fingerprint and date. The next build reads the published file from
  `https://underglass.dev/sitemap-dates.json`, keeps the date of every page whose
  fingerprint is the same and gives the others the day of the build (UTC). Vercel builds
  without `.git`, so the site carries this history itself.
- Only a deployed build does this (`VERCEL=1`), or one given an earlier record in
  `UNDERGLASS_SITEMAP_DATES` (a URL or a file). Every other build, the GitHub Pages copy
  included, writes the sitemap without dates.
- Where no earlier record can be read (the first deployment, the site not reachable
  from the build) every URL gets the day of the build, and the build's log says so.
- An example's page has little text of its own (its title, its summary and the list
  of examples), so a change to an example's code alone does not move its date.

## Documentation site

<https://underglass.dev/docs> is the private `examples/docs` workspace, an
[Astro Starlight](https://starlight.astro.build/) site. `docs/` stays the only source:
`examples/docs/pages.mjs` lists the published files (the guide, the reference, the Strata
design language and every page in `docs/ui-library/components/`), and `sync.mjs`
generates `src/content/docs/` from them before each dev or build run (git-ignored). A
page's `# H1` becomes its title and its first paragraph its description; a relative link
becomes a `/docs/...` URL when the target is published, and a GitHub URL when it is not
(contributor docs, the archive, source files). Every page has an edit link to its file in
`docs/`. Starlight adds the sidebar, Pagefind search (built at build time, no service),
light and dark themes and `docs/sitemap-index.xml`. The site has no 404 page of its own;
the showcase's root `404.html` serves.

For AI agents and other tools that read Markdown, `sync.mjs` also writes into
`examples/docs/public/` (git-ignored except the favicon):

- a Markdown copy of every page, with absolute links, at the page URL plus `.md`
  (`/docs/guide/concepts.md`, `/docs/index.md` for the home page). Each HTML page names it
  in a `<link rel="alternate" type="text/markdown">`;
- [`llms.txt`](https://llmstxt.org) at `/docs/llms.txt` and, copied by the build, at
  `/llms.txt`: a summary and a link to every page's Markdown copy with its description;
- `llms-full.txt`: the Guide and Reference pages in one file. The Strata pages are left out;
  at about 700 KB they are four times the rest, more than an agent reads in one fetch.

```sh
npm run dev:docs       # localhost:5192/docs
npm run build:docs     # examples/docs/dist only
npm run preview:docs   # localhost:5193/docs
npm run build:site     # showcase, then docs, copied to examples/showcase/dist/docs
```

`scripts/assemble-site.mjs`, the last step of `build:site`, refuses symlinks, local paths,
private keys and source-map references in the docs build, fails on any link to a missing
`/docs` page, heading or file (in the HTML pages and in the Markdown files), and then copies
the docs build into the showcase output and `llms.txt` to its root. It also adds every URL
of the documentation's sitemap to the root `sitemap.xml`, after checking that each one is a
built page, and gives the docs home as `/docs`, its canonical URL (Starlight's sitemap says
`/docs/`, which redirects). To
publish another file, add it to `pages.mjs`; a new component page is picked up by itself.
`tests/unit/docs-site.unit.test.mjs` checks the page rules and that the Instrument
gallery's anatomy-page links name headings that exist.

## Analytics

Builds made on Vercel (`VERCEL=1`) load Vercel Web Analytics (`src/analytics.ts`);
other builds, GitHub Pages included, load nothing and send nothing. It sets no
cookies. Page views count the home page and each example's page. The example studio
loads the script with its page. The home page loads it as a chunk of its own once its
entry script runs (`src/home/track.ts`), so its first frame and its entry are
unchanged, and a build that sends nothing does not contain it. The custom events (a Pro plan feature)
are `Browser Support` (once per visit, kept to one by a `sessionStorage` flag: the
up-front guess of whether this browser can run GPU mode, `likely`, `chrome-flags` or
`unsupported`), `GPU Enable` (result mode, the status line's headline, the up-front
browser guess, `api`: `native` or `polyfill`, and `trigger`: `auto` when the page
started GPU mode by itself, `button` for a press), `GPU Lost` (GPU mode ended without
the visitor asking, with `api`), `Studio Action` (a press of **DOM**, **Dispose
example**), `GPU Help` (preview, copied flag, Chrome download link, polyfill button;
the download link was the Canary link, action `canary`, until Chrome 157) and
`Outbound Link` (GitHub, npm). `api` keeps polyfilled runs out of the native numbers.
The home page sends the same events with `example: "home"`: `GPU Enable` when its
deck starts by itself (`auto`: at load, after a lost GPU, when a window grows; an
attempt that ends as the one before it did is not sent again) or by the header's
switch (`button`), `GPU Lost`, `Studio Action` (`disable`: the switch turned off) and
`Outbound Link`. It adds `Home Demo`: the live demonstration was used (`play`, or
`scrub` once per change and page load), with the change picked and whether the page
was drawn by the GPU. No event carries anything a visitor
typed, searched or filmed. Both footers say when analytics is on. The documentation
site's Vercel builds load the same script in each page's head and count page views
only, with no custom events.

## Loading

An example's page loads with only React, the page chrome and the catalog. Its effect
then loads Underglass, `demos.tsx` and the opening example as separate chunks and
mounts the Underglass root; the switch waits for it. The gallery loads the same entry
and nothing more: its pictures below the first group are fetched as they come near.
Each example is its own chunk (`src/examples.ts`), loaded the first time it is
opened, so Fluent UI, Strata and Babylon Lite only download for the examples that
use them. Switching examples loads the next one before `Demo` swaps it in: nothing
inside the root suspends, and the current example stays on stage, GPU-presented,
until the next one is ready. Vite's chunk-size warning limit is 600 kB, just above
the two largest chunks (Fluent UI and the Underglass runtime with Babylon Lite).

The surrounding responsive chrome uses ordinary CSS and has no motion of its own.
Enrolled example surfaces
use typed layout and appearance that compile to browser CSS, not a replacement
layout engine. The shared compositor retains the original React controls/state.
The task example reuses its existing authored CSS, original component and
decorative transition helper, with owned cleanup on example retirement.
The fixed-size stage scrolls sideways on small screens to preserve native control
geometry (its frame says so while it does); the page around it and the gallery
reflow. Choosing another example
resets that example's local in-memory state, deliberately. No backend, external
font/CDN or local-storage persistence is added; analytics is described above. The
one `sessionStorage` entry besides analytics' is the visitor's DOM choice (below).

The page starts in ordinary DOM. In a browser that `detectSupport` (`src/support.ts`)
judges `likely` (the HTML-in-Canvas methods and `navigator.gpu` are present), it then
starts GPU mode by itself, once, when the stage comes into view: admission draws and
clicks a probe inside the visible stage, so it waits for 160 px of the stage, or half
of it, in the viewport. Presence is only the guess that decides whether to try:
admission is the proof, and a refusal leaves ordinary DOM with its reason in the
status line. If admission is refused only because the stage left the viewport while
the probe ran, the page tries again the next time it is in view. A press of the
switch, or of **Dispose example**, cancels the automatic start. **DOM** also records
the choice in `sessionStorage` (`underglass-showcase-dom`), so this tab stays in DOM
after a reload; **GPU** clears it. Other browsers keep ordinary DOM until the visitor
presses **GPU** or the polyfill button. A press with less than 160 px of the stage in
view scrolls the stage into view first. Raw refusal reasons remain visible. The shader affects
only inert aria-hidden artwork, never essential input geometry. Explicit DOM
recovery preserves original values and focus; disposal ends the app until
reload. Reduced motion is handled by the existing runtime. Accessibility,
physical-device and broader browser/production qualification remain open.

## Experimental GPU browser requirement

**GPU demos require Chrome or Edge 157 or later**, which ship HTML-in-Canvas,
including the native geometry support Underglass needs, without flags. Ordinary
DOM mode works in any browser. On 2026-11-11, unflagged Edge 157.0.4341.42
(Windows 11, headless and headful) admitted GPU mode natively on the live site,
while Chrome stable 156.0.8078.80 did not have the API. For a visitor's Chromium
browser without the API, the help panel says to update, and keeps the
`chrome://flags` entries for older builds.

The native validation route (`npm run test:showcase`) still launches Canary with
these switches:

```text
--enable-blink-features=CanvasDrawElement,ElementCanvasTransform
--enable-experimental-web-platform-features
```

In either browser GPU mode starts by itself when the stage comes into view (above);
**GPU** starts it again after **DOM**. A version
number or the API's presence does not guarantee support; Underglass checks working
capture and geometry and reports refusal reasons.

## The opt-in polyfill

Visitors without native HTML-in-Canvas can run GPU mode through
[`@underglass/html-in-canvas-polyfill`](https://github.com/RaananW/html-in-canvas-polyfill)
(`src/polyfill.ts`). The site never loads it on its own: the help panel offers
**Run GPU mode on the polyfill**, which downloads it (its own chunk, about 61 kB),
installs it and requests admission. Admission tests the polyfill with the same
functional pixel and hit probes it runs against a browser; if it refuses, the
polyfill is removed again and the reason stays in the status line. While GPU mode
runs on it, the mode pill reads **GPU active · polyfill**, the stage chrome names
it, and a note says changes reach the GPU about a tenth of a second late and links
to the polyfill's limitations.

The offer appears only where it can work: no native support, and both WebGPU and
`Element.moveBefore`, which Underglass needs and the polyfill does not provide
(Safari has no `moveBefore` yet, so it gets no offer). Examples that don't run well
on it can be listed in `polyfillExcluded` with the reason shown to visitors; with the
polyfill installed, **GPU** is disabled on them, and switching
to one from polyfilled GPU mode returns to ordinary DOM first. None is listed today.

Measured on 2026-11-08 with polyfill 0.4.0, Chrome 156.0.8078.80 stable (no flags)
against Canary 159.0.8150.0 with the flags, at 1400×1000, headless on Windows. The
frame rate is taken while the pointer moves over the stage, so hovers cause captures;
input to paint is the median of six key presses or clicks:

| Example | Polyfill fps | Hits | Input to paint (polyfill / native) | Offered |
|---|---|---|---|---|
| layers, motion, effects, presence, tasks, pond, compare | 59–60 | all correct | 28–102 ms / 10–17 ms | yes |
| instrument | 58 | all correct | 38 ms / – | yes |
| fluent | 58 | all correct | 78 ms / 19 ms | yes |
| strata | 40 | all correct | 109 ms / 16 ms (a click in the gallery) | yes, since 0.4.0 |

0.1.0 put every Fluent card's hit region on the last card, and an endless spinner
held Strata at 6 fps; 0.1.1 fixed both. 0.2.0 recaptures on hover only when a
`:hover` rule matches different elements, which took Strata from 12 to about 30 fps
while the pointer moves. Until 0.4.0 every click in Strata's gallery, one layer of
about 500 elements, re-serialized all of it and took about 0.3 s to reach the GPU,
so Strata was not offered. 0.4.0 reuses the styles of elements that can't have
changed, which brought that click to 109 ms (291 ms on 0.3.0) and the frame rate to
about 40 fps, still the lowest of the examples.

The showcase uses 0.5.0 since 2026-11-11. That release only makes the code smaller and
moves worker messaging into an entry of its own, which the showcase doesn't use, so the
table above was not re-measured for it.

0.2.0 also drew Strata wrongly: no GPU relief on any component, square radios, a grey
disabled field, markers in the tree, a table taller than its card and a wrapped icon
button. 0.3.0 fixed all of them. On 0.4.0 every Strata tab and the Objects level
match native to within 0.1% of their pixels once the screenshots are aligned (the
page sits 2 px lower in Chrome than in Canary), and so do the frames 300 ms after a
checkbox, a radio, typing, a theme switch and a level switch, before the polyfill's
idle re-check of reused styles could repair a stale frame. The one difference left is
the invoice table's header, which the polyfill draws a little lighter.

Playwright's WebKit refused admission (no `Element.moveBefore`) and its Firefox has
no WebGPU adapter, so neither was measured; a real Firefox build has both and is
untested. `npm run test:showcase` runs the layers, Fluent and Strata scenarios on the
polyfill in Canary with HTML-in-Canvas switched off; for Strata it checks the relief
and a real click on a gallery tab.

## Deployment

The canonical site is <https://underglass.dev/>, the Vercel project `underglass` in the
Weber Tech team. Vercel builds from Git: production from `main`, a preview for each
pull request (previews are not indexed: Vercel sends `X-Robots-Tag: noindex` on them).
`vercel.json` holds the whole build: `npm ci --ignore-scripts`, then
`CANVAS_SHOWCASE_BASE=/ npm run build:site` (the showcase with the documentation site in
its `docs/` folder), publishing `examples/showcase/dist` with clean URLs, no trailing slash, a one-year immutable cache on the hashed
`/assets/` and security headers (`nosniff`, a referrer policy, same-origin framing and
a permissions policy that allows only this site's camera, for the pond). It has no
`ignoreCommand`: `.vercelignore` removes `.git` before such a command would run, so every
push builds (about a minute).
`.vercelignore` limits what Vercel uploads and builds to the workspaces, the lockfile,
`docs/` without its archive, and the three scripts the build runs. The `www` host redirects to the apex domain.

`.github/workflows/showcase-pages.yml` builds and deploys the showcase to GitHub
Pages (<https://raananw.github.io/underglass/>) on every push to `main` that touches
the showcase, the library, the compiler or the lockfile, and on manual dispatch.
It never runs for pull requests. It uses immutable action refs, restores from
the committed lockfile without browser downloads, uploads a showcase-only Pages
artifact, and confines Pages/OIDC write permissions to the deployment job. It
needs the repository's Pages source set to **GitHub Actions** (Settings → Pages);
until then the deploy job fails without publishing anything. The release workflow stays
build-only; npm publication remains a separate decision (license: Apache-2.0).

The build emits only the pages and site files above, the icons and social card, and
hashed CSS/JavaScript/JPEG assets, with source maps disabled. The build's output guard rejects unexpected files, source maps,
symlinks and known private-path/credential markers before successful completion.
Do not add `evidence`, private reports, fixtures or release
archives to its public directory. Browser compatibility still depends on the
actual current browser/API route, not the hosting.
