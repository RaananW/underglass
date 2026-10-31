/**
 * Entry point of the showcase site. `App` is ordinary React page chrome (hero, catalog, status,
 * browser help) that lives outside the Underglass root. Its effect loads Underglass, `demos.tsx` and the
 * opening example (separate chunks, so the page itself loads with only React and the catalog), then creates
 * the canvas hosts and mounts a second tree with `mountCanvasApp`, which renders `Demo`. The two sides
 * talk through the controller (enable, disable, dispose), `onStatusChange` and the URL path.
 */
import { useCallback, useEffect, useRef, useState, version, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { version as reactDOMVersion } from "react-dom";
import type { CanvasController } from "@underglass/react";
import { loadExample } from "./examples";
import { examplePath, exampleFromPath, examples, pageMeta, previews as previewNames, route, searchExamples, site, type ExampleId } from "./catalog";
import { detectSupport, explain, flags, type Support } from "./support";
import { analyticsEnabled, startAnalytics, track, trackSupport } from "./analytics";
import "./style.css";

/** GPU-mode screenshots (Chrome Canary) shown to visitors whose browser cannot run it, by example. */
const previewFiles = import.meta.glob<string>("./previews/*.jpg", { eager: true, import: "default" });
const previews = Object.fromEntries(Object.entries(previewNames).map(([id, name]) => [id, previewFiles[`./previews/${name}.jpg`]])) as Partial<Record<ExampleId, string>>;

// Routing: the home page is the site base and opens the first example; each example has its own page,
// `<base>examples/<id>`, which the build writes as static HTML with its own metadata (`seo.ts`). Links
// switch examples in place with `history.pushState`, so the running runtime and its GPU mode survive.
const base = import.meta.env.BASE_URL;
/** The example the current URL names, or `undefined` on the home page. */
const pageExample = () => exampleFromPath(location.pathname, base);
/** The URL of the home page (no id) or an example's page. */
const pageURL = (id?: ExampleId) => id ? `${base}${examplePath(id)}` : base;
/** Moves an old `#/motion` link (the site's first URLs) to the example's own page, keeping history clean. */
function upgradeHashLink() {
  if (location.hash.startsWith("#/")) history.replaceState(null, "", pageURL(route(location.hash)));
}
/** Keeps the title, description and canonical URL in step with the page in the URL. */
function applyHead(id?: ExampleId) {
  const meta = pageMeta(id);
  document.title = meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", `${site.origin}/${meta.path}`);
}
// An old hash link loads the home page's HTML, so its head is set for the example it moved to.
upgradeHashLink();
applyHead(pageExample());
/** True for a click the browser should handle itself: another button, or a modifier that opens a new tab or window. */
const ownClick = (event: MouseEvent) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
startAnalytics();
trackSupport(detectSupport());

/** The whole page: marketing sections, the example catalog and the live studio with its stage. */
function App() {
  const [selected, setSelected] = useState<ExampleId>(() => pageExample() ?? "layers");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  // `mode` and `diagnostic` mirror the runtime: `onStatusChange` and the result of each action.
  const [mode, setMode] = useState("dom");
  const [diagnostic, setDiagnostic] = useState("Ordinary DOM startup; admission pending.");
  // A guess made once at load; see `detectSupport`. Admission still decides.
  const [support] = useState<Support>(detectSupport);
  // `busy` disables the buttons while an action is in flight. `disposed` lasts until reload.
  const [busy, setBusy] = useState(false);
  const [disposed, setDisposed] = useState(false);
  // False until the Underglass root is mounted: the lifecycle buttons wait for it.
  const [mounted, setMounted] = useState(false);
  // Set when the runtime is disposed or the page is going away; URL changes are then ignored.
  const retired = useRef(false);
  // Reads the URL and shows its example (set by the effect; `go` calls it after `pushState`).
  const navigate = useRef<() => void>(undefined);
  // The runtime's last reported mode, and whether the visitor asked to leave GPU mode: for `GPU Lost`.
  const lastMode = useRef("dom");
  const leaving = useRef(false);
  // The `.stage` element that the canvas and DOM hosts are created in.
  const frame = useRef<HTMLDivElement>(null);
  // The studio section, scrolled into view when a catalog card is chosen.
  const studio = useRef<HTMLElement>(null);
  const controller = useRef<CanvasController>(undefined);
  // The example in the URL, kept by the effect below.
  const shown = useRef<ExampleId>(selected);
  // Setter registered by `Demo` (through `onReady`) to switch examples inside the running root. It is
  // called once on registration too, in case the URL changed while the root was loading.
  const change = useRef<(id: ExampleId) => void>(undefined);
  const ready = useCallback((update: (id: ExampleId) => void) => { change.current = update; update(shown.current); }, []);
  const current = examples.find(example => example.id === selected)!;
  useEffect(() => {
    const host = frame.current!;
    let app: CanvasController | undefined;
    let cancelled = false;
    // The URL's example is selected in the page chrome and in the running `Demo`. Page anchors such as
    // `#examples` also fire `popstate`; they leave the path, and so the example, as it is.
    const show = () => {
      if (retired.current) return;
      upgradeHashLink();
      const page = pageExample(), id = page ?? "layers";
      applyHead(page);
      if (id === shown.current) return;
      shown.current = id; setSelected(id); change.current?.(id);
    };
    navigate.current = show;
    // Marks the app retired and disposes the runtime (page hide, or unmount of this effect).
    const close = () => {
      retired.current = true; leaving.current = true;
      void app?.dispose().catch(error => console.error("Showcase disposal failed", error));
    };
    // A page restored from the back/forward cache comes back after `pagehide` disposed its runtime,
    // so it is shown as disposed instead of half alive.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { setDisposed(true); setMode("disposed"); setBusy(false); setDiagnostic("Restored a retired page. Reload to start a fresh session."); }
    };
    // Mount after the Underglass chunks and the opening example have loaded, which also keeps the mount
    // outside this effect's React commit (the adapter flushes its own root synchronously).
    // The captured-pixel budget is raised from 2M to 4M CSS px for the Strata gallery: at its Scene level with a dialog
    // open, the stage holds three full-stage layers (the backdrop, Strata's lit backdrop and the dialog's scrim) and two
    // panels, about 3.1M px with their shadows. It is 6M for the Instrument gallery: its stage is a wall of the stage's size under four or five
    // panels, and an open dialog adds a scrim the stage's size, about 5M px on the tallest tab (the everyday forms) at a 1090 px stage.
    const opening = shown.current;
    Promise.all([import("@underglass/react"), import("./demos"), loadExample(opening)]).then(([{ createCanvasHosts, mountCanvasApp }, { Demo }]) => {
      if (cancelled) return;
      // The output canvas must not be aria-hidden: GPU mode moves the original controls inside it.
      const { outputCanvas, ordinaryHost, overlayHost } = createCanvasHosts(host);
      outputCanvas.className = "output"; ordinaryHost.className = "ordinary"; overlayHost.className = "overlay";
      app = mountCanvasApp({ outputCanvas, ordinaryHost, overlayHost, budgets: { layers: 32, pixels: 6_000_000 },
        onStatusChange(status) {
          setDiagnostic(status.reason); setMode(status.mode);
          if (lastMode.current === "gpu" && status.mode !== "gpu" && !leaving.current && !retired.current) track("GPU Lost", { example: shown.current, status: explain(status.reason).title });
          lastMode.current = status.mode;
        } }, <Demo id={opening} onReady={ready} />);
      controller.current = app;
      setMounted(true);
      // Handle for inspecting the running example from the console.
      window.showcase = { state: () => app!.state(), controller: app, react: version, reactDOM: reactDOMVersion };
    }, error => {
      if (cancelled) return;
      setDiagnostic(`The live example failed to load: ${String(error)}`);
      console.error("Showcase failed to load", error);
    });
    // `hashchange` catches a `#/motion` typed into the address bar of an open page.
    window.addEventListener("popstate", show);
    window.addEventListener("hashchange", show);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", restore);
    return () => { cancelled = true; window.removeEventListener("popstate", show); window.removeEventListener("hashchange", show);
      window.removeEventListener("pagehide", close); window.removeEventListener("pageshow", restore); close(); };
  }, [ready]);
  // Opens the home page (no id) or an example's page in place.
  function go(id?: ExampleId) {
    history.pushState(null, "", pageURL(id));
    navigate.current?.();
  }
  // A plain click on an in-site link switches in place; modified clicks open the page's own URL.
  function follow(event: MouseEvent<HTMLAnchorElement>, id?: ExampleId) {
    if (disposed) { event.preventDefault(); return; }
    if (ownClick(event)) return;
    event.preventDefault();
    go(id);
    if (id) requestAnimationFrame(() => studio.current?.scrollIntoView({ block: "start" }));
  }
  // Runs a caller-owned lifecycle action on the controller, then shows the resulting mode and
  // reason. A rejection is shown in the status line.
  async function action(operation: "enable" | "disable" | "dispose") {
    setBusy(true);
    leaving.current = operation !== "enable";
    try {
      await controller.current![operation]();
      const state = controller.current!.state();
      setMode(state.mode);
      setDiagnostic(state.reason);
      lastMode.current = state.mode;
      if (operation === "enable") track("GPU Enable", { example: selected, result: state.mode, status: explain(state.reason).title, support });
      else track("Studio Action", { example: selected, action: operation });
      if (operation === "dispose") { retired.current = true; setDisposed(true); }
    } catch (error) {
      setDiagnostic(`Action rejected: ${String(error)}`);
      console.error("Showcase action rejected", error);
      if (operation === "enable") track("GPU Enable", { example: selected, result: "rejected", status: String(error), support });
    } finally { setBusy(false); leaving.current = false; }
  }
  const filtered = searchExamples(query, category);
  // The page reflects the runtime's actual mode, not what was requested.
  const gpu = mode === "gpu";
  return <>
    <a className="skip-link" href="#studio">Skip to live example</a>
    <div className="hero-shell">
      <header className="site-header"><a className="brand" href={base} onClick={event => follow(event)}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Underglass<span className="tag">EXPERIMENTAL</span></a>
        <nav aria-label="Site"><a href="#examples">Examples</a><a href="#about">About the experiment</a><a href={site.docs}>Docs</a>
          <a href={site.repository} onClick={() => track("Outbound Link", { target: "github" })}>GitHub <span aria-hidden="true">&#8599;</span></a></nav></header>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-text">
          <p className="hero-badge"><span className="pulse" aria-hidden="true" />HTML-in-Canvas · WebGPU · React</p>
          <h1 id="hero-title">Real React controls.<br /><span className="hero-gradient">Painted by the GPU.</span></h1>
          <p className="hero-copy">Underglass draws your <em>original</em> React DOM into one shared WebGPU compositor through Chrome's
            HTML-in-Canvas API. Layers fly, spin and shimmer on the GPU, while typing, focus and clicks stay with the native controls.</p>
          <div className="hero-cta"><a className="cta primary" href="#studio">Open the live studio</a><a className="cta ghost" href="#how-it-works">How it works</a></div>
          <ul className="hero-notes" aria-label="Highlights"><li>Original React state</li><li>Native inputs and hits</li><li>One shared compositor</li><li>DOM by default</li></ul>
        </div>
        <HeroVisual />
      </section>
    </div>
    <main>
      <section className="how" id="how-it-works" aria-labelledby="how-title">
        <p className="eyebrow">HOW IT WORKS</p>
        <h2 id="how-title">Three steps, no clones.</h2>
        <ol className="how-steps">
          <li><span className="step-art step-react" aria-hidden="true"><b /><b /><b /></span><strong>React renders real DOM</strong>
            <span>Typed <code>Surface</code> layers hold ordinary inputs, buttons and text. Their state never leaves React.</span></li>
          <li><span className="step-art step-canvas" aria-hidden="true"><b /><b /></span><strong>Chrome paints it into a canvas</strong>
            <span>HTML-in-Canvas captures each surface as a texture and keeps native hit testing on the original elements.</span></li>
          <li><span className="step-art step-gpu" aria-hidden="true"><b /><b /><b /></span><strong>One GPU pass composes it</strong>
            <span>Transforms, staggered motion and decorative shaders run in a shared WebGPU compositor on top.</span></li>
        </ol>
      </section>
      <section className="catalog" id="examples" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2 id="catalog-title">Pick a playground</h2></div>
          <span className="count-pill">{examples.length} live examples</span></div>
        <div className="filters"><label>Find an example<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try motion, WGSL or presence" /></label>
          <label>Category<select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>
            {["All", ...new Set(examples.map(example => example.category))].map(value => <option key={value}>{value}</option>)}
          </select></label></div>
        <div className="example-grid">{filtered.map(example => <a key={example.id} className={`example-card accent-${example.accent}`}
          href={pageURL(example.id)} aria-current={selected === example.id ? "page" : undefined} onClick={event => follow(event, example.id)}>
          <span className={`card-art art-${example.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="card-top"><span>{example.category}</span><span>{example.number}</span></span>
          <h3>{example.title}</h3><p>{example.summary}</p>
          <span className="card-tags">{example.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
          <span className="card-link">{selected === example.id ? "Now in the studio" : "Open in the studio"} <span aria-hidden="true">&#8594;</span></span>
        </a>)}</div>
        {filtered.length === 0 && <p role="status" className="empty">No matching examples. Try another search or category.</p>}
      </section>
      <section className={`studio ${gpu ? "is-gpu" : ""}`} id="studio" ref={studio} tabIndex={-1} aria-labelledby="studio-title-heading">
        <div className="studio-head">
          <div><p className="eyebrow">LIVE STUDIO · {current.number}</p><h2 id="studio-title-heading">{current.title}</h2></div>
          <div className="studio-actions">
            {/* Switches examples without scrolling back to the catalog. */}
            <label className="example-switch">Example
              <select aria-label="Example" value={selected} disabled={disposed} onChange={event => go(event.target.value as ExampleId)}>
                {examples.map(example => <option key={example.id} value={example.id}>{example.number} · {example.title}</option>)}
              </select></label>
            <span className={`mode-pill ${gpu ? "active" : ""}`}><span className="dot" aria-hidden="true" />{gpu ? "GPU active" : disposed ? "Disposed" : "Ordinary DOM"}</span>
          </div>
        </div>
        <p className="studio-detail">{current.detail}</p>
        <div className="control-bar">
          <p className="stage-note" id="gpu-requirement"><strong>GPU demos require Chrome Canary with HTML-in-Canvas enabled.</strong> Ordinary DOM mode works without experimental flags.</p>
          <div className="toolbar"><button aria-describedby="gpu-requirement" disabled={busy || disposed || !mounted} onClick={() => void action("enable")}>Enable experimental GPU</button>
            <button disabled={busy || disposed || !mounted} onClick={() => void action("disable")}>Use ordinary DOM</button>
            <button disabled={busy || disposed || !mounted} onClick={() => void action("dispose")}>Dispose example</button></div>
        </div>
        {!gpu && !disposed && support !== "likely" && <GpuHelp support={support} preview={previews[selected]} title={current.title} example={selected} />}
        <Status reason={diagnostic} />
        {disposed && <p className="disposed-note">The example is disposed. Reload this page to start a fresh session.</p>}
        <div className="stage-frame">
          <div className="stage-chrome" aria-hidden="true"><i /><i /><i /><span>{gpu ? "webgpu · shared compositor" : "ordinary dom"}</span></div>
          <div className="stage-scroll" role="region" aria-label="Live example canvas; scroll horizontally on small screens" tabIndex={0}>
            <div className={selected === "instrument" ? "stage stage-fluid" : "stage"} ref={frame} /></div>
        </div>
        <section className="why-gpu" aria-labelledby="why-gpu-heading">
          <div className="why-col">
            <p className="eyebrow">WHY THE GPU HERE</p>
            <h3 id="why-gpu-heading">{current.gpu.headline}</h3>
            <ul>{current.gpu.points.map(point => <li key={point}>{point}</li>)}</ul>
            {!gpu && <p className="why-hint">Enable experimental GPU above to see these parts; ordinary DOM shows the same controls without them.</p>}
          </div>
          <div className="why-col why-css">
            <p className="eyebrow">WITH CSS ALONE</p>
            <p>{current.gpu.css}</p>
          </div>
        </section>
        <p className="stage-note">Same original controls in DOM and GPU. {selected === "instrument" ? "This example reflows to the width of your screen." : "On smaller screens, scroll the studio horizontally."} Nothing you type or film leaves your browser.</p>
      </section>
      <section className="about" id="about"><p className="eyebrow">AN HONEST EXPERIMENT</p><h2>Progressive presentation, not pretend compatibility.</h2>
        <div className="about-grid">
          <div><h3>What it is</h3><p>Underglass layers GPU presentation over React's original controls. The examples use the public Surface, Box, Presence, motion and effect APIs. Typed layout and appearance compile to browser CSS; the browser still owns layout and editing.</p></div>
          <div><h3>What it needs</h3><p>Ordinary DOM works by default. Experimental GPU needs a compatible browser with HTML-in-Canvas and native geometry support. Missing capabilities are diagnosed, not disguised. Decorative shaders never replace essential controls.</p></div>
          <div><h3>What it is not</h3><p>This is a prepared showcase, not a production certification. Accessibility, physical-device and broader browser qualification remain open. Your reduced-motion preference is respected.</p></div>
        </div>
      </section>
    </main>
    <footer><span><span className="brand-mark small" aria-hidden="true"><i /><i /><i /></span>Underglass / Example studio</span>
      <span><a href={site.docs}>Documentation</a> · <a href={site.repository} onClick={() => track("Outbound Link", { target: "github" })}>Source on GitHub</a> · <a href={site.npm}
        onClick={() => track("Outbound Link", { target: "npm" })}>@underglass/react on npm</a> · Apache-2.0.{analyticsEnabled && " Anonymous visit counts by Vercel Web Analytics, no cookies."}</span></footer>
  </>;
}

/** Purely decorative hero illustration: three "layers" of a UI floating above a GPU glow. */
function HeroVisual() {
  return <div className="hero-visual" aria-hidden="true">
    <div className="hv-glow" />
    <div className="hv-grid" />
    <div className="hv-layer hv-art"><i className="sun" /><i className="hill one" /><i className="hill two" /></div>
    <div className="hv-layer hv-card"><span className="hv-kicker">A NOTE FROM YOUR STUDIO</span><span className="hv-title">Greetings from the GPU</span>
      <span className="hv-line" /><span className="hv-line short" /><span className="hv-stamp" /></div>
    <div className="hv-layer hv-form"><span className="hv-label">Postcard title</span><span className="hv-input">Greetings from the GPU<i className="caret" /></span>
      <span className="hv-chips"><i /><i /><i /><i /></span><span className="hv-button">Save postcard</span></div>
    <span className="hv-tag t1">&lt;input&gt;</span><span className="hv-tag t2">transitionGroup()</span><span className="hv-tag t3">WGSL</span>
  </div>;
}

// Types the `window.showcase` inspection handle.
declare global {
  interface Window { showcase: { state(): ReturnType<CanvasController["state"]>; controller: CanvasController; react: string; reactDOM: string } }
}
// The page chrome is a normal React root; the Underglass root is created separately in `App`.
createRoot(document.getElementById("app")!).render(<App />);

/** Plain-language status with the runtime's exact reason one click away. */
function Status({ reason }: { reason: string }) {
  const { title, hint } = explain(reason);
  return <div className="diagnostic" role="status" aria-live="polite">
    <span className="diagnostic-label">Status</span>
    <span className="diagnostic-text"><strong>{title}</strong>{hint && <> {hint}</>}
      {title !== reason && <details><summary>Details</summary><code>{reason}</code></details>}</span>
  </div>;
}

/** Shown when this browser cannot run GPU mode: how to get it, and what it looks like. */
function GpuHelp({ support, preview, title, example }: { support: Support; preview?: string; title: string; example: ExampleId }) {
  const [copied, setCopied] = useState<string>();
  const [showPreview, setShowPreview] = useState(false);
  const copy = (url: string) => { track("GPU Help", { example, action: "copy-flag" }); void navigator.clipboard?.writeText(url).then(() => setCopied(url), () => setCopied(undefined)); };
  return <section className="gpu-help" aria-labelledby="gpu-help-title">
    <div className="gpu-help-text">
      <h3 id="gpu-help-title">{support === "chrome-flags" ? "Turn on GPU mode in Chrome Canary" : "You're seeing the ordinary DOM version"}</h3>
      <p>{support === "chrome-flags"
        ? "This browser doesn't have HTML-in-Canvas turned on. Everything below works as ordinary DOM; GPU mode adds the effects described under the stage."
        : "GPU mode needs Chrome Canary's experimental HTML-in-Canvas. Every example below still works here as plain DOM, with the same controls."}</p>
      <ol>
        <li>Install <a href="https://www.google.com/chrome/canary/" target="_blank" rel="noreferrer" onClick={() => track("GPU Help", { example, action: "canary" })}>Chrome Canary</a>.</li>
        {flags.map(flag => <li key={flag.url}>Open <code>{flag.url}</code>
          <button type="button" className="copy" onClick={() => copy(flag.url)}>{copied === flag.url ? "Copied" : "Copy"}</button>
          and set it to <strong>Enabled</strong>.</li>)}
        <li>Restart Canary, come back here and press <strong>Enable experimental GPU</strong>.</li>
      </ol>
    </div>
    {preview && <div className="gpu-help-preview">
      <button type="button" className="preview-toggle" aria-expanded={showPreview} onClick={() => { if (!showPreview) track("GPU Help", { example, action: "preview" }); setShowPreview(value => !value); }}>
        {showPreview ? "Hide GPU preview" : "Show what GPU mode looks like"}</button>
      {showPreview && <img src={preview} alt={`${title} in GPU mode, captured in Chrome Canary`} width={1040} height={700} />}
    </div>}
  </section>;
}
