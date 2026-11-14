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
import { examplePath, exampleFromPath, examples, hero, pageMeta, previews as previewNames, route, searchExamples, site, type ExampleId, type SceneId } from "./catalog";
import { detectSupport, explain, flags, type Support } from "./support";
import { analyticsEnabled, startAnalytics, track, trackSupport, type Api } from "./analytics";
import { installPolyfill, polyfillExcluded, polyfillLinks, polyfillOffers, polyfillPossible, removePolyfill } from "./polyfill";
import "./style.css";

/** GPU-mode screenshots (Chrome Canary) shown to visitors whose browser cannot run it, by example. */
const previewFiles = import.meta.glob<string>("./previews/*.jpg", { eager: true, import: "default" });
const previews = Object.fromEntries(Object.entries(previewNames).map(([id, name]) => [id, previewFiles[`./previews/${name}.jpg`]])) as Partial<Record<ExampleId, string>>;

// Routing: the home page is the site base and shows the hero scene (`hero.tsx`) on the stage; each example has its own page,
// `<base>examples/<id>`, which the build writes as static HTML with its own metadata (`seo.ts`). Links
// switch examples in place with `history.pushState`, so the running runtime and its GPU mode survive.
const base = import.meta.env.BASE_URL;
/** The example the current URL names, or `undefined` on the home page. */
const pageExample = () => exampleFromPath(location.pathname, base);
/** The URL of the home page (no id, or the hero scene) or an example's page. */
const pageURL = (id?: SceneId) => id && id !== hero.id ? `${base}${examplePath(id)}` : base;
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
// A visitor who presses **Use ordinary DOM** keeps ordinary DOM in this tab: the page then doesn't turn GPU mode on
// by itself, even after a reload. **Enable experimental GPU** clears the choice. Blocked storage just forgets it.
const domChoiceKey = "underglass-showcase-dom";
function prefersDom() {
  try { return sessionStorage.getItem(domChoiceKey) === "1"; } catch { return false; }
}
function rememberDom(on: boolean) {
  try { if (on) sessionStorage.setItem(domChoiceKey, "1"); else sessionStorage.removeItem(domChoiceKey); } catch { /* storage blocked */ }
}
/** Admission draws and clicks a probe inside the visible stage, so the automatic start waits for this much of it in view. */
const autoVisiblePx = 160;
startAnalytics();
trackSupport(detectSupport());

/** The whole page: marketing sections, the example catalog and the live studio with its stage. */
function App() {
  const [selected, setSelected] = useState<SceneId>(() => pageExample() ?? hero.id);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  // `mode` and `diagnostic` mirror the runtime: `onStatusChange` and the result of each action.
  const [mode, setMode] = useState("dom");
  const [diagnostic, setDiagnostic] = useState("Ordinary DOM startup; admission pending.");
  // A guess made once at load; see `detectSupport`. Admission still decides.
  const [support] = useState<Support>(detectSupport);
  // Whether the help panel offers the HTML-in-Canvas polyfill (see `polyfill.ts`), and whether it is
  // installed. The ref mirrors the state for the effect's callbacks and for analytics.
  const [offerPolyfill] = useState(() => support !== "likely" && polyfillPossible());
  const [polyfilled, setPolyfilled] = useState(false);
  const polyfillActive = useRef(false);
  const api = (): Api => polyfillActive.current ? "polyfill" : "native";
  // `busy` disables the buttons while an action is in flight. `disposed` lasts until reload.
  const [busy, setBusy] = useState(false);
  const [disposed, setDisposed] = useState(false);
  // False until the Underglass root is mounted: the lifecycle buttons wait for it.
  const [mounted, setMounted] = useState(false);
  // GPU mode starts by itself, once, when the stage comes into view in a browser that likely has HTML-in-Canvas,
  // unless the visitor chose ordinary DOM in this tab. Any lifecycle button press cancels it. `autoArmed` re-arms
  // the observer when the automatic admission was refused only because the stage had left the viewport.
  const autoStart = useRef(support === "likely" && !prefersDom());
  const [autoArmed, setAutoArmed] = useState(0);
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
  const shown = useRef<SceneId>(selected);
  // Setter registered by `Demo` (through `onReady`) to switch examples inside the running root. It is
  // called once on registration too, in case the URL changed while the root was loading.
  const change = useRef<(id: SceneId) => void>(undefined);
  const ready = useCallback((update: (id: SceneId) => void) => { change.current = update; update(shown.current); }, []);
  // The example on stage, or `undefined` on the home page, where the stage shows the hero scene.
  const current = examples.find(example => example.id === selected);
  const home = !current;
  useEffect(() => {
    const host = frame.current!;
    let app: CanvasController | undefined;
    let cancelled = false;
    // The URL's example is selected in the page chrome and in the running `Demo`. Page anchors such as
    // `#examples` also fire `popstate`; they leave the path, and so the example, as it is.
    const show = () => {
      if (retired.current) return;
      upgradeHashLink();
      const page = pageExample(), id: SceneId = page ?? hero.id;
      applyHead(page);
      if (id === shown.current) return;
      shown.current = id; setSelected(id);
      // An example not offered on the polyfill is never shown GPU-presented by it: GPU mode is left first
      // (a caller-owned disable), then the example switches in ordinary DOM.
      if (polyfillActive.current && lastMode.current === "gpu" && !polyfillOffers(id) && app) {
        leaving.current = true; setBusy(true);
        void app.disable().then(state => { setMode(state.mode); setDiagnostic(state.reason); lastMode.current = state.mode; },
          error => console.error("Showcase disable failed", error))
          .finally(() => { leaving.current = false; setBusy(false); change.current?.(shown.current); });
        return;
      }
      change.current?.(id);
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
          if (lastMode.current === "gpu" && status.mode !== "gpu" && !leaving.current && !retired.current) track("GPU Lost", { example: shown.current, status: explain(status.reason).title, api: polyfillActive.current ? "polyfill" : "native" });
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
  function go(id?: SceneId) {
    history.pushState(null, "", pageURL(id));
    navigate.current?.();
  }
  // A plain click on an in-site link switches in place; modified clicks open the page's own URL.
  function follow(event: MouseEvent<HTMLAnchorElement>, id?: SceneId) {
    if (disposed) { event.preventDefault(); return; }
    if (ownClick(event)) return;
    event.preventDefault();
    go(id);
    if (id) requestAnimationFrame(() => studio.current?.scrollIntoView({ block: "start" }));
  }
  // Starts GPU mode by itself when enough of the stage is in view (see `autoStart`). Admission is the proof, as for a
  // press of Enable: a refusal is shown in the status line and the page stays ordinary DOM.
  useEffect(() => {
    if (!mounted || !autoStart.current || disposed) return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (!autoStart.current || !entry.isIntersecting || (entry.intersectionRect.height < autoVisiblePx && entry.intersectionRatio < 0.5)) return;
      observer.disconnect();
      autoStart.current = false;
      void action("enable", "auto").then(result => {
        // Scrolled away while the probe ran: try again the next time the stage is in view.
        if (result === "dom" && /inside the viewport|enable again when visible/.test(controller.current?.state().reason ?? "")) {
          autoStart.current = true; setAutoArmed(count => count + 1);
        }
      });
    }, { threshold: [0, 0.05, 0.1, 0.25, 0.5, 1] });
    observer.observe(frame.current!);
    return () => observer.disconnect();
    // `action` is recreated every render; the call above only reads refs and state setters, so it is not a dependency.
  }, [mounted, autoArmed, disposed]);
  // Runs a caller-owned lifecycle action on the controller, then shows the resulting mode and
  // reason, and resolves with that mode. A rejection is shown in the status line. A press of a button
  // (`trigger: "button"`) cancels the automatic start and records a DOM choice for this tab.
  async function action(operation: "enable" | "disable" | "dispose", trigger: "auto" | "button" = "button") {
    if (trigger === "button") { autoStart.current = false; if (operation !== "dispose") rememberDom(operation === "disable"); }
    // Admission draws and clicks a probe inside the visible stage, and the buttons are under the stage: a press with too
    // little of the stage in view brings it into view first, rather than failing with "explicitly enable again when visible".
    if (operation === "enable" && frame.current) {
      const box = frame.current.getBoundingClientRect(), visible = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
      if (visible < Math.min(autoVisiblePx, box.height)) frame.current.scrollIntoView({ block: "nearest" });
    }
    setBusy(true);
    leaving.current = operation !== "enable";
    // `shown` rather than `selected`: the automatic start runs from an observer set up in an earlier render.
    const example = shown.current;
    try {
      await controller.current![operation]();
      const state = controller.current!.state();
      setMode(state.mode);
      setDiagnostic(state.reason);
      lastMode.current = state.mode;
      if (operation === "enable") track("GPU Enable", { example, result: state.mode, status: explain(state.reason).title, support, api: api(), trigger });
      else track("Studio Action", { example, action: operation });
      if (operation === "dispose") { retired.current = true; setDisposed(true); }
      return state.mode;
    } catch (error) {
      setDiagnostic(`Action rejected: ${String(error)}`);
      console.error("Showcase action rejected", error);
      if (operation === "enable") track("GPU Enable", { example, result: "rejected", status: String(error), support, api: api(), trigger });
      return undefined;
    } finally { setBusy(false); leaving.current = false; }
  }
  // The help panel's polyfill button: downloads and installs the polyfill, then requests GPU admission, which
  // tests the polyfill like any browser. If admission refuses, the polyfill is removed again.
  async function tryPolyfill() {
    track("GPU Help", { example: selected, action: "polyfill" });
    setBusy(true);
    try {
      polyfillActive.current = (await installPolyfill()).polyfilled;
      setPolyfilled(polyfillActive.current);
    } catch (error) {
      setDiagnostic(`The polyfill failed to load: ${String(error)}`);
      console.error("Showcase polyfill failed to load", error);
      setBusy(false);
      return;
    }
    if (await action("enable") === "gpu" || !polyfillActive.current) return;
    await removePolyfill().catch(error => console.error("Showcase polyfill removal failed", error));
    polyfillActive.current = false; setPolyfilled(false);
  }
  const filtered = searchExamples(query, category);
  // The page reflects the runtime's actual mode, not what was requested.
  const gpu = mode === "gpu";
  // With the polyfill installed, examples it doesn't run well are not offered GPU mode at all.
  const polyfillRefused = polyfilled ? polyfillExcluded[selected] : undefined;
  // The studio's own controls: the example picker, the mode and the lifecycle buttons.
  const picker = <label className="example-switch">{home ? "Open" : "Example"}
    <select aria-label="Example" value={selected} disabled={disposed} onChange={event => go(event.target.value as SceneId)}>
      <option value={hero.id}>{hero.number} · Home</option>
      {examples.map(example => <option key={example.id} value={example.id}>{example.number} · {example.title}</option>)}
    </select></label>;
  const modePill = <span className={`mode-pill ${gpu ? "active" : ""}`}><span className="dot" aria-hidden="true" />{gpu ? polyfilled ? "GPU active · polyfill" : "GPU active" : disposed ? "Disposed" : "Ordinary DOM"}</span>;
  const toolbar = <div className="toolbar"><button aria-describedby="gpu-requirement" disabled={busy || disposed || !mounted || !!polyfillRefused} onClick={() => void action("enable")}>Enable experimental GPU</button>
    <button disabled={busy || disposed || !mounted} onClick={() => void action("disable")}>Use ordinary DOM</button>
    <button disabled={busy || disposed || !mounted} onClick={() => void action("dispose")}>Dispose example</button></div>;
  const stageClass = selected === "instrument" ? "stage stage-fluid" : home ? "stage stage-hero" : "stage";
  return <>
    <a className="skip-link" href="#studio">Skip to the live stage</a>
    <div className="hero-shell">
      <header className="site-header"><a className="brand" href={base} onClick={event => follow(event)}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Underglass<span className="tag">EXPERIMENTAL</span></a>
        <nav aria-label="Site"><a href="#examples">Examples</a><a href="#about">About the experiment</a><a href={site.docs}>Docs</a>
          <a href={site.repository} onClick={() => track("Outbound Link", { target: "github" })}>GitHub <span aria-hidden="true">&#8599;</span></a></nav></header>
      {/* The live stage is the top of every page. On the home page it shows the hero scene, whose headline (the
          page's h1) is inside the stage; on an example's page the example's title is the h1. */}
      <section className={`studio ${gpu ? "is-gpu" : ""} ${home ? "studio-home" : ""}`} id="studio" ref={studio} tabIndex={-1}
        aria-labelledby={home ? undefined : "studio-title-heading"} aria-label={home ? "Live stage" : undefined}>
        {current && <>
          <div className="studio-head">
            <div><p className="eyebrow">LIVE STUDIO · {current.number}</p><h1 id="studio-title-heading">{current.title}</h1></div>
            <div className="studio-actions">{picker}{modePill}</div>
          </div>
          <p className="studio-detail">{current.detail}</p>
        </>}
        <div className="stage-frame">
          {current && <div className="stage-chrome" aria-hidden="true"><i /><i /><i /><span>{gpu ? polyfilled ? "webgpu · html-in-canvas polyfill" : "webgpu · shared compositor" : "ordinary dom"}</span></div>}
          <div className="stage-scroll" role="region" aria-label={home ? "Live stage" : "Live example canvas; scroll horizontally on small screens"} tabIndex={0}>
            <div className={stageClass} ref={frame} /></div>
        </div>
        <div className="control-bar">
          {home && modePill}
          <p className="stage-note" id="gpu-requirement"><strong>GPU mode needs Chrome or Edge 157 or later{offerPolyfill && ", or the polyfill offered below"}.</strong> Ordinary DOM works in any browser.</p>
          {home && picker}
          {toolbar}
        </div>
        <Status reason={diagnostic} />
        {disposed && <p className="disposed-note">The example is disposed. Reload this page to start a fresh session.</p>}
        {!gpu && !disposed && support !== "likely" && <GpuHelp support={support} preview={current && previews[current.id]} title={current?.title ?? "The header"} example={selected}
          polyfill={offerPolyfill ? { excluded: polyfillExcluded[selected], ready: mounted && !busy, run: () => void tryPolyfill() } : undefined} />}
        {gpu && polyfilled && <p className="polyfill-note" role="note"><strong>Running on the HTML-in-Canvas polyfill.</strong> GPU mode here uses
          a JavaScript stand-in for the browser API, not Chrome's own HTML-in-Canvas: changes reach the GPU about a tenth of a second late,
          and some details differ. Chrome or Edge 157 or later shows the real thing. <a href={polyfillLinks.limitations} target="_blank" rel="noreferrer">What
          the polyfill can't do <span aria-hidden="true">&#8599;</span></a></p>}
        {current && <>
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
        </>}
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
      <section className="about" id="about"><p className="eyebrow">AN HONEST EXPERIMENT</p><h2>Progressive presentation, not pretend compatibility.</h2>
        <div className="about-grid">
          <div><h3>What it is</h3><p>Underglass layers GPU presentation over React's original controls. The examples use the public Surface, Box, Presence, motion and effect APIs. Typed layout and appearance compile to browser CSS; the browser still owns layout and editing.</p></div>
          <div><h3>What it needs</h3><p>Experimental GPU needs a compatible browser with HTML-in-Canvas and native geometry support; in one, the studio turns it on by itself when the stage comes into view, and <strong>Use ordinary DOM</strong> turns it off for this tab. Ordinary DOM works everywhere else. In other Chromium browsers, an opt-in polyfill can stand in for that API, and the page says so while it does. Missing capabilities are diagnosed, not disguised. Decorative shaders never replace essential controls.</p></div>
          <div><h3>What it is not</h3><p>This is a prepared showcase, not a production certification. Accessibility, physical-device and broader browser qualification remain open. Your reduced-motion preference is respected.</p></div>
        </div>
      </section>
    </main>
    <footer><span><span className="brand-mark small" aria-hidden="true"><i /><i /><i /></span>Underglass / Example studio</span>
      <span><a href={site.docs}>Documentation</a> · <a href={site.repository} onClick={() => track("Outbound Link", { target: "github" })}>Source on GitHub</a> · <a href={site.npm}
        onClick={() => track("Outbound Link", { target: "npm" })}>@underglass/react on npm</a> · Apache-2.0.{analyticsEnabled && " Anonymous visit counts by Vercel Web Analytics, no cookies."}</span></footer>
  </>;
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

/** What the help panel's polyfill offer needs: why this example is excluded, if it is, and the button's action. */
interface PolyfillOffer { excluded?: string; ready: boolean; run(): void }

/** Shown when this browser cannot run GPU mode: how to get it, what it looks like, and the polyfill where it can work. */
function GpuHelp({ support, preview, title, example, polyfill }: { support: Support; preview?: string; title: string; example: SceneId; polyfill?: PolyfillOffer }) {
  const [copied, setCopied] = useState<string>();
  const [showPreview, setShowPreview] = useState(false);
  const copy = (url: string) => { track("GPU Help", { example, action: "copy-flag" }); void navigator.clipboard?.writeText(url).then(() => setCopied(url), () => setCopied(undefined)); };
  return <section className="gpu-help" aria-labelledby="gpu-help-title">
    <div className="gpu-help-text">
      <h3 id="gpu-help-title">{support === "chrome-flags" ? "Update your browser to turn on GPU mode" : "You're seeing the ordinary DOM version"}</h3>
      <p>{support === "chrome-flags"
        ? "This browser doesn't have HTML-in-Canvas yet. Everything below works as ordinary DOM; GPU mode adds the effects described under the stage."
        : "GPU mode needs HTML-in-Canvas, which Chrome and Edge have from version 157. Every example below still works here as plain DOM, with the same controls."}</p>
      <ol>
        <li>Use <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer" onClick={() => track("GPU Help", { example, action: "download" })}>Chrome</a> or
          Edge 157 or later. Already have one? Open <code>chrome://settings/help</code> or <code>edge://settings/help</code> to update it.</li>
        <li>Restart the browser, come back here and press <strong>Enable experimental GPU</strong>.</li>
      </ol>
      {support === "chrome-flags" && <>
        <p className="gpu-help-flags">On an older build, open each of these, set it to <strong>Enabled</strong> and restart:</p>
        <ul>{flags.map(flag => <li key={flag.url}><code>{flag.url}</code>
          <button type="button" className="copy" onClick={() => copy(flag.url)}>{copied === flag.url ? "Copied" : "Copy"}</button></li>)}</ul>
      </>}
      {polyfill && <div className="polyfill-offer">
        <h4>Or try GPU mode here, through a polyfill</h4>
        <p>The <a href={polyfillLinks.repository} target="_blank" rel="noreferrer">HTML-in-Canvas polyfill</a> imitates the browser API in
          JavaScript, so this browser can run GPU mode without updating. It is slower than the real thing: changes reach the GPU about a tenth of
          a second late, and some details differ.</p>
        {polyfill.excluded
          ? <p className="polyfill-off">{title} isn't offered on the polyfill: {polyfill.excluded}.</p>
          : <button type="button" disabled={!polyfill.ready} onClick={polyfill.run}>Run GPU mode on the polyfill</button>}
      </div>}
    </div>
    {preview && <div className="gpu-help-preview">
      <button type="button" className="preview-toggle" aria-expanded={showPreview} onClick={() => { if (!showPreview) track("GPU Help", { example, action: "preview" }); setShowPreview(value => !value); }}>
        {showPreview ? "Hide GPU preview" : "Show what GPU mode looks like"}</button>
      {showPreview && <img src={preview} alt={`${title} in GPU mode, captured in Chrome Canary`} width={1040} height={700} />}
    </div>}
  </section>;
}
