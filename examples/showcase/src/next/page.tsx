/**
 * The preview of the new home page, served at `/next` until it replaces the home page. Eight sections, each making one
 * claim about the framework and showing it in a "specimen" panel beside the text. Written with no browser globals at
 * render, and nothing of Underglass at all: the build renders it to HTML (`prerender.tsx`) and the browser hydrates
 * that, with the Underglass runtime where the deck can run (`gpu.tsx`) and with React alone elsewhere (`dom.tsx`).
 *
 * The page has two parts:
 *
 * - `Header`, `Rail` and `Footer` are static markup around the stage. They are rendered once, at build time, and are
 *   not part of any React root in the browser (`gpu.tsx` and `dom.tsx` wire their few controls by hand).
 * - `Stage` is the application inside the stage's root. Each section is two elements, its text (`<section>`) and its
 *   specimen (`<figure>`), both direct children of the root, because a GPU layer must be one (the cover is a single
 *   element, with its specimen inside it under the headline). In the **flow** they are
 *   ordinary DOM laid out by a CSS grid, one section under the other. In the **deck** (GPU) they are stacked on a stage
 *   that stays in the window, the sections on stage are enrolled as layers, and the others are parked: still in the
 *   document and the accessibility tree, unpainted (`view.ts`, `deck.ts`, `docs/showcase.md`).
 */
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { examples, site } from "../catalog";
import { flow, viewStore } from "./view";

/** The sections in page order: `id` is the anchor and the text layer's id, `rail` the short name on the side scale. */
export const sections = [
  { id: "cover", rail: "Cover" },
  { id: "dom", rail: "The DOM" },
  { id: "transitions", rail: "Transitions" },
  { id: "motion", rail: "Motion" },
  { id: "shaders", rail: "Shaders" },
  { id: "depth", rail: "Depth" },
  { id: "everywhere", rail: "Everywhere" },
  { id: "start", rail: "Start" },
] as const;
type SectionId = typeof sections[number]["id"];
const number = (index: number) => String(index).padStart(2, "0");
/** The id of a section's specimen, which is also its layer id. */
export const figureId = (id: string) => `${id}-figure`;

/** A specimen's caption and body. */
function Specimen({ index, caption, children }: { index: number; caption: string; children: ReactNode }) {
  return <><figcaption><span>FIG. {number(index)}</span>{caption}</figcaption><div className="specimen-body">{children}</div></>;
}
/**
 * One section: its text and, with `specimen`, its specimen as a sibling. `--row` places both in the section's row of
 * the flow. While the section is on the deck's stage the driver enrols them as layers (`deck.ts`; the layer ids are the
 * element ids); in the deck, a section that is not on stage is parked.
 */
function Slide({ id, label, children, specimen, figure }: { id: SectionId; label: string; children: ReactNode; specimen?: ReactNode; figure?: string }) {
  const index = sections.findIndex(section => section.id === id);
  const view = useSyncExternalStore(viewStore.subscribe, viewStore.get, () => flow);
  const live = view.deck && (index === view.from || index === view.to);
  const parked = view.deck && !live ? " parked" : "";
  const row = { "--row": index + 1 } as CSSProperties;
  return <>
    <section className={`slide-text slide-${id}${parked}`} id={id} data-section={index} aria-labelledby={`${id}-title`} style={row}>
      <p className="label"><span className="label-number">{number(index)}</span>{label}</p>
      {children}
    </section>
    {specimen !== undefined && <figure className={`specimen${parked}`} id={figureId(id)} data-section={index} style={row}>
      <Specimen index={index} caption={figure ?? ""}>{specimen}</Specimen>
    </figure>}
  </>;
}
/** Short claims under a section's text: a bold lead and one sentence each. */
function Facts({ items }: { items: readonly (readonly [string, string])[] }) {
  return <ul className="facts">{items.map(([lead, text]) => <li key={lead}><strong>{lead}</strong><span>{text}</span></li>)}</ul>;
}
/** A code sample. `lines` are plain text; a line starting with `//` or `#` is dimmed as a comment. */
function Code({ lines, label }: { lines: readonly string[]; label: string }) {
  return <pre className="code" aria-label={label}><code>{lines.map((line, index) =>
    <span key={index} className={/^\s*(\/\/|#)/.test(line) ? "comment" : undefined}>{line}{"\n"}</span>)}</code></pre>;
}

/** Real controls, to make the point that nothing on the page is a picture. */
function LiveForm() {
  const [name, setName] = useState("Ada");
  const [level, setLevel] = useState(60);
  const [pressed, setPressed] = useState(0);
  return <form className="live-form" onSubmit={event => event.preventDefault()}>
    <label>Name<input value={name} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
    <label>Role<select defaultValue="engineer"><option value="engineer">Engineer</option><option value="designer">Designer</option><option value="writer">Writer</option></select></label>
    <label className="live-range">Level<input type="range" min={0} max={100} value={level} onChange={event => setLevel(Number(event.target.value))} /><output>{level}</output></label>
    <label className="live-check"><input type="checkbox" defaultChecked /> Keep me in the accessibility tree</label>
    <div className="live-row"><button type="button" onClick={() => setPressed(value => value + 1)}>Press</button>
      <p role="status">Hello, {name || "nobody"}. Pressed {pressed} {pressed === 1 ? "time" : "times"}.</p></div>
  </form>;
}

const Mark = () => <span className="mark" aria-hidden="true"><i /><i /><i /></span>;

/**
 * The bar at the top: the brand, the site's links and the presentation readout. The readout says how the stage is
 * drawn and what it costs; `gpu.tsx` fills it and enables its switch once the deck's driver has started.
 */
export function Header({ base }: { base: string }) {
  return <>
    <a className="skip" href="#cover">Skip to content</a>
    <header className="top">
      <a className="brand" href={base}><Mark />Underglass</a>
      <div className="readout" role="group" aria-label="Presentation">
        <button id="deck-switch" type="button" aria-pressed="false" disabled><i aria-hidden="true" /><span id="deck-mode">Ordinary DOM</span></button>
        <p id="deck-figures" hidden><span><b id="deck-layers">0</b> layers</span><span><b id="deck-captures">0</b> captures</span><span><b id="deck-frame">0.0</b> ms a frame</span>
          <span id="deck-change" className="change" hidden /></p>
        <p id="deck-note" className="visually-hidden" role="status" />
      </div>
      <nav aria-label="Site"><a href="#transitions">Transitions</a><a href="#examples-title">Examples</a><a href={site.docs}>Docs</a>
        <a href={site.repository}>GitHub <span aria-hidden="true">&#8599;</span></a></nav>
    </header>
  </>;
}
/** The side scale: one numbered mark per section. */
export function Rail() {
  return <nav className="rail" aria-label="Sections">
    <ol>{sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span>{number(index)}</span>{section.rail}</a></li>)}</ol>
  </nav>;
}
export function Footer() {
  return <footer className="bottom"><span><Mark />Underglass</span>
    <span><a href={site.docs}>Documentation</a><a href={site.repository}>GitHub</a><a href={site.npm}>npm</a>Apache-2.0</span></footer>;
}

/** The stage's application: every section's text and specimen, in page order. `base` is the site's base path. */
export function Stage({ base }: { base: string }) {
  const docs = site.docs;
  return <>
    {/* Nothing to see: the deck compiles its changes' shaders on this layer before they are first used (`deck.ts`). */}
    <div id="deck-warm" className="warm" aria-hidden="true" inert />
    {/* The cover is one layer: the headline runs across the page, with the text and the specimen under it. */}
    <Slide id="cover" label="A GPU-first React framework">
      <h1 id="cover-title">Real React controls.<br /><span className="glass">Painted by the GPU<i>.</i></span></h1>
      <div className="cover-grid">
      <div className="cover-body">
        <p className="lede">Underglass draws your original React DOM into one WebGPU compositor through the browser's HTML-in-Canvas API.
          Inputs, focus and clicks stay native. What you gain is everything a shader can do to a live page.</p>
        <div className="actions"><a className="button primary" href={`${docs}/guide/getting-started`}>Get started</a>
          <a className="button" href="#transitions">See the transitions</a></div>
        <p className="install"><code>npm install @underglass/react</code></p>
        <p className="chip"><i aria-hidden="true" />GPU in Chrome and Edge 157 or later. Ordinary DOM everywhere else.</p>
      </div>
      <figure className="specimen">
        <Specimen index={0} caption="One tree, three steps">
          <ol className="stack">
            <li><span>01</span><strong>React renders real DOM</strong><p>Ordinary inputs, buttons and text, with their state in React.</p></li>
            <li><span>02</span><strong>The browser paints it into a canvas</strong><p>HTML-in-Canvas captures each layer as a texture.</p></li>
            <li><span>03</span><strong>One GPU pass composes it</strong><p>Transforms, motion and your shaders on top.</p></li>
          </ol>
        </Specimen>
      </figure>
      </div>
    </Slide>

    <Slide id="dom" label="The DOM" figure="Every control here is the element React rendered" specimen={<LiveForm />}>
      <h2 id="dom-title">The page is still the page.</h2>
      <p className="lede">Nothing is cloned and nothing is redrawn by hand. The elements React rendered are the elements on screen:
        select the text, tab through the form, open the inspector.</p>
      <Facts items={[
        ["Native hit testing.", "A click lands on the real button, wherever the GPU drew it, even while it moves."],
        ["State survives.", "Switching the GPU on or off moves the same React root. Values, focus and selection stay where they were."],
        ["It is ordinary HTML.", "The accessibility tree, the form and the text are the DOM's own."],
      ]} />
    </Slide>

    <Slide id="transitions" label="Page transitions" figure="A snapshot against the live page" specimen={
      <table className="compare">
        <thead><tr><th scope="col"><span className="visually-hidden">Question</span></th><th scope="col">View Transitions</th><th scope="col">Underglass</th></tr></thead>
        <tbody>
          <tr><th scope="row">What moves</th><td>Images of the old and the new view</td><td>The page's own elements</td></tr>
          <tr><th scope="row">While it runs</th><td>The view that leaves is a still image</td><td>Both views keep running: video plays, counters count</td></tr>
          <tr><th scope="row">The effect</th><td>CSS animations on those images</td><td>Your shader on the pixels</td></tr>
          <tr><th scope="row">You write</th><td>CSS for two pseudo-elements</td><td>Numbers, and WGSL when you want it</td></tr>
        </tbody>
      </table>}>
      <h2 id="transitions-title">Transitions on the live page, not on a picture of it.</h2>
      <p className="lede">A view transition animates images of the old and the new view, and the old one is a still. Underglass
        animates the page itself: the view that leaves keeps running until it is gone.</p>
      <Facts items={[
        ["Per pixel.", "Burn a view away, ripple it, refract it, split its colour channels."],
        ["Scrubbable.", "Tie a transition to the scroll position and run it forwards and backwards."],
        ["No repaint.", "A transition writes matrices and shader parameters. It captures nothing of its own."],
      ]} />
    </Slide>

    <Slide id="motion" label="Motion" figure="What a moving layer costs per frame" specimen={<>
      <ol className="pipeline" aria-label="Browser work per frame for a moving layer">
        <li className="skipped"><span>React render</span><em>skipped</em></li>
        <li className="skipped"><span>Style</span><em>skipped</em></li>
        <li className="skipped"><span>Layout</span><em>skipped</em></li>
        <li className="skipped"><span>Paint</span><em>skipped</em></li>
        <li className="done"><span>GPU draw</span><em>one matrix</em></li>
      </ol>
      <Code label="Staggered motion" lines={[
        "// Deal a hand: one call, 90 ms apart.",
        "const deal = cards.map(card => (",
        "  { id: card.id, motion: dealTo(card) }",
        "));",
        "gpu.transitionGroup(deal, 90);",
      ]} />
    </>}>
      <h2 id="motion-title">Move it without touching React.</h2>
      <p className="lede">A moving layer is one matrix. The GPU draws the same texture somewhere else: no render, no style
        recalculation, no layout and no paint.</p>
      <Facts items={[
        ["Typed motion.", "Transitions, staggered groups, enter and exit with Presence, and per-frame transforms for springs and drags."],
        ["The same in ordinary DOM.", "The numbers that drive the GPU become CSS transforms when it is off."],
        ["Clicks follow.", "A control stays clickable where it is drawn, tilted and mid-flight."],
      ]} />
    </Slide>

    <Slide id="shaders" label="Shaders" figure="A fragment function over rendered HTML" specimen={
      <Code label="A custom effect" lines={[
        "import { defineEffect } from \"@underglass/react\";",
        "",
        "export const sepia = defineEffect({",
        "  name: \"sepia-glow\",",
        "  parameters: { amount: { min: 0, max: 1 } },",
        "  geometry: \"color\", bounds: \"layer\",",
        "  capabilities: [\"webgpu\"],",
        "  wgsl: `",
        "    let r = dot(color.rgb, vec3f(0.393, 0.769, 0.189));",
        "    let g = dot(color.rgb, vec3f(0.349, 0.686, 0.168));",
        "    let b = dot(color.rgb, vec3f(0.272, 0.534, 0.131));",
        "    let tone = mix(color.rgb, vec3f(r, g, b), parameters.x);",
        "    return vec4f(tone, color.a);`,",
        "});",
      ]} />}>
      <h2 id="shaders-title">Your WGSL, on your markup.</h2>
      <p className="lede">Write a fragment function and hand it a layer. It runs on the rendered pixels of real HTML: text, form
        controls, video, a camera feed.</p>
      <Facts items={[
        ["Built in.", "Ripple and refraction, chromatic split and noise dissolve, chained with your own."],
        ["Materials.", "Relight a layer of working controls without moving a pixel, with its contrast protected."],
        ["Live parameters.", "Change them every frame. Nothing recompiles and nothing is captured again."],
      ]} />
    </Slide>

    <Slide id="depth" label="Components" figure="Four levels of one control" specimen={
      <ol className="levels">
        <li><span>CSS</span><p>Flat and fast: gradients and shadows from the same tokens. What every browser gets.</p></li>
        <li><span>Relief</span><p>One shader lights every raised face, bevel and well from a single light.</p></li>
        <li><span>Objects</span><p>Buttons become keys that travel into their bezels; sliders, a rail with a puck.</p></li>
        <li><span>Instrument</span><p>Machined parts: knobs, faders and switches as lit meshes, with lamps that light the panel.</p></li>
      </ol>}>
      <h2 id="depth-title">Controls that are lit, not painted.</h2>
      <p className="lede">Strata is a component library built on Underglass. The same native inputs become keys that travel, knobs
        that turn and lamps that light the panel around them.</p>
      <Facts items={[
        ["Native underneath.", "Every knob is a native input and every key a button. They take every click and key press."],
        ["One attribute away.", "Levels, themes and characters change the presentation without touching the markup."],
      ]} />
      <p className="links"><a href={`${base}examples/instrument`}>Open the Instrument gallery</a><a href={`${base}examples/strata`}>Open the Strata components</a></p>
    </Slide>

    <Slide id="everywhere" label="Everywhere" figure="One tree, two presentations" specimen={<>
      <table className="compare">
        <thead><tr><th scope="col"><span className="visually-hidden">Question</span></th><th scope="col">Ordinary DOM</th><th scope="col">GPU</th></tr></thead>
        <tbody>
          <tr><th scope="row">Draws it</th><td>The browser, as usual</td><td>WebGPU, from live captures of the same elements</td></tr>
          <tr><th scope="row">Where</th><td>Every browser</td><td>Chrome and Edge 157 or later</td></tr>
          <tr><th scope="row">When</th><td>At startup, and whenever the GPU is off</td><td>After a check passes in this browser, in this window</td></tr>
          <tr><th scope="row">Your code</th><td colSpan={2}>The same components, state and event handlers</td></tr>
        </tbody>
      </table>
      <p className="note">Underglass is experimental. Screen-reader testing, physical devices and wider browser qualification are still open.</p>
    </>}>
      <h2 id="everywhere-title">One codebase. Two ways to draw it.</h2>
      <p className="lede">The GPU is a presentation, not a platform. Without it the same tree is ordinary DOM, in every browser.</p>
      <Facts items={[
        ["Proven before it shows.", "Enabling the GPU first draws and clicks a probe, to prove pixels and hit testing on this machine."],
        ["Diagnosed, never disguised.", "If the GPU cannot present something correctly, the page returns to DOM and says why."],
        ["What it needs.", "HTML-in-Canvas and WebGPU. An opt-in polyfill covers other Chromium browsers, more slowly."],
      ]} />
    </Slide>

    <Slide id="start" label="Get started" figure="A first layer" specimen={
      <Code label="A first layer" lines={[
        "import {",
        "  createCanvasHosts, mountCanvasApp, Surface,",
        "} from \"@underglass/react\";",
        "",
        "function Profile() {",
        "  return (",
        "    <Surface id=\"profile\"",
        "      layout={{ x: 40, y: 40, width: 280, height: 160 }}>",
        "      <label htmlFor=\"name\">Name</label>",
        "      <input id=\"name\" defaultValue=\"Ada\" />",
        "    </Surface>",
        "  );",
        "}",
        "",
        "const stage = document.getElementById(\"stage\")!;",
        "const hosts = createCanvasHosts(stage);",
        "const gpu = mountCanvasApp(hosts, <Profile />);",
        "const state = await gpu.enable();",
        "// state.mode is \"gpu\", or \"dom\" with state.reason",
      ]} />}>
      <h2 id="start-title">Install it, mount a layer, enable the GPU.</h2>
      <p className="install"><code>npm install @underglass/react</code></p>
      <p className="lede">React 18.3 or 19. There is a Vue adapter, and the core runs without a framework.</p>
      <p className="links"><a href={`${docs}/guide/getting-started`}>Read the guide</a><a href={`${docs}/reference/api`}>API reference</a>
        <a href={site.repository}>Source on GitHub</a><a href={site.npm}>npm</a></p>
      <h3 id="examples-title">Live examples</h3>
      <ul className="examples" aria-labelledby="examples-title">{examples.map(example =>
        <li key={example.id}><a href={`${base}examples/${example.id}`}><span>{example.number}</span>{example.title}</a></li>)}</ul>
    </Slide>
  </>;
}
