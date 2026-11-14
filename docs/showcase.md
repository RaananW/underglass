# Example showcase, underglass.dev and GitHub Pages

The private `examples/showcase` npm workspace is a React SPA using the public
Underglass package. Its catalog opens ten live examples in the same app. The
engineering playground remains separate; raw reports, probes, test evidence and
private fixtures are not served.

The live stage is the top of every page, right under the site header, on the dark
band. On the home page it shows the hero scene (below); on an example's page it
shows that example, with its title (the page's `h1`), the picker, the mode, the
controls, the status line and the **Why the GPU here** panel around it. "How it
works", the catalog and "About" follow.

## The home page's scene

`src/hero.tsx` is the stage on the home page, and a scene rather than a catalog
example (`hero` in `src/catalog.ts`, number 00 in the picker). Its layers, all
enrolled with `useSurfaceRef` and laid out by CSS on a fluid stage that is as tall as
its content (as the Instrument gallery's is):

| Layer | Kind | What it is |
| --- | --- | --- |
| `hero-sky` | decorative | A night of colour blobs. Ripple (at rest), then the custom `showcase-hero-sky` shader: a hue turn and a lamp with faint caustic rings at the pointer. |
| `hero-pane-art`, `hero-pane-code` | decorative | Translucent glass panes. Ripple (at rest), a 1 px chromatic split, then the custom `showcase-hero-glass` sheen: a glint and a streak that slide with the pointer and an edge lit on the side facing it. They drift away from the pointer (`setTransform`). |
| `hero-card-glass` | decorative | The glass slab under the card, kept on the card's box, with the same chain. |
| `hero-copy` | interactive | The page's `h1`, its lede, the two links and the highlights. |
| `hero-card` | interactive | Real range inputs (**Light**, **Colour**) and a **Ripple the glass** button, whose values the shaders read. |

Effects only ever go on the decorative layers. The pointer, the scroll position and
the card's inputs only write effect parameters (`handle.update`) and transforms, so
nothing is recaptured while the light moves: the lamp eases toward the pointer (or
drifts slowly round its resting place without one), the hue turns as the stage
scrolls out of view, and a press on the sky, or the button, ripples the glass and the
sky for about a second. The frame loop runs only in GPU mode, with the stage in view
and the page visible. Under `prefers-reduced-motion` the lamp follows the pointer
without easing, and nothing drifts or ripples; the shaders' clock is paused. In
ordinary DOM the scene is the same markup with working inputs and no effects (the
button is disabled and the card says why).

The panes never rotate: a stage taller than the viewport (on a phone, or a short
window) is clipped to the viewport, and a clipped layer must stay axis-aligned
(`Viewport clipping requires positive axis-aligned layer transforms`). On a stage
narrower than 760 px the copy and the card stack, and the panes move to a strip of
their own under the card.

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
| `examples/instrument` Instrument gallery | Every Instrument component on main in its premium form, by the catalogue's groups, with its native element and anatomy page, and a synthesiser voice (five module panels: master, sound, output, pads and keys, modulation) whose controls are wired to each other. The groups are tabs (wave 1, 2 and 3, the everyday forms, the input forms), each split into panels that stay under the 16-material cap, which the notes tab counts from `StrataGpu.diagnostics`. The bar's **CSS**, **Relief**, **Objects** and **Instrument** switch, **Light** and **Dark**, **Premium**, **Studio**, **Hi-fi** and **Playful** (`data-strata-character` on the document element) and **Pointer light** (`pointer-light.ts`, a wrapper round the helper's controller that writes one emitter into every scene) change the presentation without re-enrolling; CSS (`css-level.ts`) presents the panels as plain layers. This example's stage is fluid (`stage-fluid`: its height is set from its panels) and reflows down to 320 px (at 320 px the intro is hidden: the stage may be at most 4,096 CSS px tall at DPR 2, the device's 8,192 px texture limit, and the synthesiser is the tallest page). The example raises the captured-pixel budget to 6M CSS px: an open dialog adds a scrim the size of the stage to the wall and the panels. |

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
fluid like the home page's scene. A decorative backdrop and the decorative
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

## Pages, search and social metadata

The base is the home page, whose stage shows the hero scene; each example has its own
page at `<base>examples/<id>`. Catalog cards, the brand link and the studio's example
picker (whose first entry, 00, is the home page) switch scenes in place with
`history.pushState`, so the running runtime (and
GPU mode) survives; a modified click opens the page's own URL. Old `#/motion` links
open the same example and are moved to its path. Search and categories stay in the
SPA; no iframe capture is used.

`examples/showcase/seo.ts`, a Vite plugin, writes one static HTML file per page
(`index.html` and `examples/<id>.html`, which Vercel's clean URLs and GitHub Pages
both serve without the extension), so no server rewrite rules are needed. Each page
has its own title, description and canonical URL (from `pageMeta` in
`src/catalog.ts`), Open Graph and Twitter card tags, JSON-LD (the site and the
software on the home page, a web page with breadcrumbs for each example) and a
`<noscript>` summary that links every page. The plugin also writes `sitemap.xml`,
`robots.txt` and a `noindex` `404.html`. Canonical, sitemap and social URLs always
name `https://underglass.dev`, so the GitHub Pages copy points search engines at the
canonical site. An example with a GPU preview uses it as its social card; the others,
and the home page, use `public/og.jpg` (1200x630). `scripts/showcase-social-images.mjs`
renders that card and `public/apple-touch-icon.png`; run it by hand after a brand or
headline change and commit the images. `main.tsx` keeps the title, description and
canonical URL in step when examples switch in place.

`npm run build:site` adds the documentation pages to `sitemap.xml` (below), so the one
sitemap `robots.txt` names lists the whole site.

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
cookies. Page views count each example's page. The custom events (a Pro plan feature)
are `Browser Support` (once per visit, kept to one by a `sessionStorage` flag: the
up-front guess of whether this browser can run GPU mode, `likely`, `chrome-flags` or
`unsupported`), `GPU Enable` (result mode, the status line's headline, the up-front
browser guess, `api`: `native` or `polyfill`, and `trigger`: `auto` when the page
started GPU mode by itself, `button` for a press), `GPU Lost` (GPU mode ended without
the visitor asking, with `api`), `Studio Action` (**Use ordinary DOM**, **Dispose
example**), `GPU Help` (preview, copied flag, Chrome download link, polyfill button;
the download link was the Canary link, action `canary`, until Chrome 157) and
`Outbound Link` (GitHub, npm). `api` keeps polyfilled runs out of the native numbers. No event carries anything a visitor
typed, searched or filmed. The footer says when analytics is on. The documentation
site's Vercel builds load the same script in each page's head and count page views
only, with no custom events.

## Loading

The page loads with only React, the page chrome and the catalog (about 260 kB, 82 kB
gzipped). Its effect then loads Underglass, `demos.tsx` and the opening example as
separate chunks and mounts the Underglass root; the lifecycle buttons wait for it.
Each example is its own chunk (`src/examples.ts`), loaded the first time it is
opened, so Fluent UI, Strata and Babylon Lite only download for the examples that
use them. Switching examples loads the next one before `Demo` swaps it in: nothing
inside the root suspends, and the current example stays on stage, GPU-presented,
until the next one is ready. Vite's chunk-size warning limit is 600 kB, just above
the two largest chunks (Fluent UI and the Underglass runtime with Babylon Lite).

The surrounding responsive chrome uses ordinary CSS and has no motion of its own
(the hero's motion is drawn on the GPU, above). Enrolled example surfaces
use typed layout and appearance that compile to browser CSS, not a replacement
layout engine. The shared compositor retains the original React controls/state.
The task example reuses its existing authored CSS, original component and
decorative transition helper, with owned cleanup on example retirement.
The fixed-size live studio scrolls horizontally on small screens to preserve
native control geometry; the catalog itself reflows. Choosing another example
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
the probe ran, the page tries again the next time it is in view. Any lifecycle button
cancels the automatic start. **Use ordinary DOM** also records the choice in
`sessionStorage` (`underglass-showcase-dom`), so this tab stays in DOM after a reload;
**Enable experimental GPU** clears it. Other browsers keep ordinary DOM until the
visitor presses **Enable experimental GPU** or the polyfill button. Those buttons sit
under the stage, so a press with less than 160 px of the stage in view scrolls the
stage into view first. Raw refusal reasons remain visible. The shader affects
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
**Enable experimental GPU** starts it again after **Use ordinary DOM**. A version
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
polyfill installed, **Enable experimental GPU** is disabled on them, and switching
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
