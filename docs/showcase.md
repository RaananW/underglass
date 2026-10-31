# Example showcase, underglass.dev and GitHub Pages

The private `examples/showcase` npm workspace is a React SPA using the public
Underglass package. Its catalog opens ten live examples in the same app. The
engineering playground remains separate; raw reports, probes, test evidence and
private fixtures are not served.

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

All examples share a 1040x700 stage. A decorative backdrop and the decorative
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

The base is the home page, which opens the first example; each example has its own
page at `<base>examples/<id>`. Catalog cards, the brand link and the studio's example
picker switch examples in place with `history.pushState`, so the running runtime (and
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
`unsupported`), `GPU Enable` (result mode, the status line's headline and the up-front
browser guess), `GPU Lost` (GPU mode ended without the visitor asking), `Studio Action`
(**Use ordinary DOM**, **Dispose example**), `GPU Help` (preview, copied flag,
Canary link) and `Outbound Link` (GitHub, npm). No event carries anything a visitor
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

The surrounding responsive chrome uses ordinary CSS; its hero motion stops
under `prefers-reduced-motion`. Enrolled example surfaces
use typed layout and appearance that compile to browser CSS, not a replacement
layout engine. The shared compositor retains the original React controls/state.
The task example reuses its existing authored CSS, original component and
decorative transition helper, with owned cleanup on example retirement.
The fixed-size live studio scrolls horizontally on small screens to preserve
native control geometry; the catalog itself reflows. Choosing another example
resets that example's local in-memory state, deliberately. No backend, external
font/CDN or local-storage persistence is added; analytics is described above.

Ordinary DOM is the default. **Enable experimental GPU** requests actual
capability admission; raw refusal reasons remain visible. The shader affects
only inert aria-hidden artwork, never essential input geometry. Explicit DOM
recovery preserves original values and focus; disposal ends the app until
reload. Reduced motion is handled by the existing runtime. Accessibility,
physical-device and broader browser/production qualification remain open.

## Experimental GPU browser requirement

**GPU demos require Chrome Canary with HTML-in-Canvas enabled.** Ordinary DOM
mode works without experimental flags. The current native validation route
launches Canary with these switches, including the required native geometry
support:

```text
--enable-blink-features=CanvasDrawElement,ElementCanvasTransform
--enable-experimental-web-platform-features
```

After opening the page in that configured Canary session, choose **Enable
experimental GPU**. Flags alone do not guarantee support in every Canary build;
Underglass checks working capture and geometry and reports refusal reasons.

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
