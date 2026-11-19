/**
 * Entry point of the examples (`examples.html`: `/examples` and each example's page; the home page is `src/home`).
 * `/examples` is the `Gallery`: every example as a card with its picture, in the catalog's groups, and nothing
 * else; it loads no Underglass. An example's page is the `Studio`: a bar to find the way (back to the gallery, the
 * example picker, previous and next, the GPU or DOM switch), the live stage, its status and what the GPU does there.
 * Both are ordinary React page chrome outside the Underglass root. The studio's effect loads Underglass, `demos.tsx`
 * and the opening example (separate chunks, so the page itself loads with only React and the catalog), then creates
 * the canvas hosts and mounts a second tree with `mountCanvasApp`, which renders `Demo`. The two sides
 * talk through the controller (enable, disable, dispose), `onStatusChange` and the URL path.
 */
import { useCallback, useEffect, useRef, useState, version, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { version as reactDOMVersion } from "react-dom";
import type { CanvasController } from "@underglass/react";
import { loadExample } from "./examples";
import { examplePath, examplesPath, exampleFromPath, examples, exampleOf, groups, neighbours, pageMeta, previews as previewNames, route, site, thumbnail, thumbnailSize, type ExampleId } from "./catalog";
import { detectSupport, explain, flags, type Support } from "./support";
import { analyticsEnabled, startAnalytics, track, trackSupport, type Api } from "./analytics";
import { installPolyfill, polyfillExcluded, polyfillLinks, polyfillOffers, polyfillPossible, removePolyfill } from "./polyfill";
import "./style.css";

/** GPU-mode screenshots (Chrome Canary) shown to visitors whose browser cannot run it, by example. */
const previewFiles = import.meta.glob<string>("./previews/*.jpg", { eager: true, import: "default" });
const previews = Object.fromEntries(Object.entries(previewNames).map(([id, name]) => [id, previewFiles[`./previews/${name}.jpg`]])) as Partial<Record<ExampleId, string>>;

// Routing: the examples' index is `<base>examples` (the gallery); each example has its own page,
// `<base>examples/<id>`. The build writes each as static HTML with its own metadata (`seo.ts`). On an example's
// page, links to other examples switch in place with `history.pushState`, so the running runtime and its GPU mode
// survive. The gallery and the site's home page (`<base>`) are loaded as documents of their own.
const base = import.meta.env.BASE_URL;
/** The example the current URL names, or `undefined` on the examples' index. */
const pageExample = () => exampleFromPath(location.pathname, base);
/** The URL of the examples' index (no id) or an example's page. */
const pageURL = (id?: ExampleId) => `${base}${id ? examplePath(id) : examplesPath}`;
/** Moves a `#/motion` link (the site's first URLs, and the Strata example's breadcrumb) to the example's own page, keeping history clean. */
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

/** The page's fixed background and its header: the brand (the way home) and the site's links. */
function Chrome({ gallery = false, skip }: { gallery?: boolean; skip: { href: string; text: string } }) {
  return <>
    <a className="skip-link" href={skip.href}>{skip.text}</a>
    <div className="page-backdrop" aria-hidden="true"><i /><i /></div>
    {/* The brand goes to the site's home page, another document. */}
    <header className="site-header"><a className="brand" href={base}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Underglass<span className="tag">CHROME · EDGE 157+</span></a>
      <nav aria-label="Site"><a href={pageURL()} aria-current={gallery ? "page" : undefined}>Examples</a><a href={site.docs}>Docs</a>
        <a href={site.repository} onClick={() => track("Outbound Link", { target: "github" })}>GitHub <span aria-hidden="true">&#8599;</span></a></nav></header>
  </>;
}
function Footer() {
  return <footer><span><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Underglass / Examples</span>
    <span><a href={site.docs}>Documentation</a> · <a href={site.repository} onClick={() => track("Outbound Link", { target: "github" })}>Source on GitHub</a> · <a href={site.npm}
      onClick={() => track("Outbound Link", { target: "npm" })}>@underglass/react on npm</a> · Apache-2.0.{analyticsEnabled && " Anonymous visit counts by Vercel Web Analytics, no cookies."}</span></footer>;
}
/** An example's card: its picture, where it belongs, its title and what it shows. `onClick` lets a page switch to it in place. */
function ExampleCard({ id, label, eager = false, onClick }: { id: ExampleId; label?: string; eager?: boolean; onClick?(event: MouseEvent<HTMLAnchorElement>): void }) {
  const example = exampleOf(id);
  return <a className="example-card" href={pageURL(id)} onClick={onClick}>
    {/* The small picture where a card is a third of a wide page, the large one where it fills a phone's width. */}
    <img src={thumbnail(id, base)} srcSet={`${thumbnail(id, base, true)} ${thumbnailSize.small.width}w, ${thumbnail(id, base)} ${thumbnailSize.width}w`}
      sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 380px" alt="" width={thumbnailSize.width} height={thumbnailSize.height} loading={eager ? "eager" : "lazy"} decoding="async" />
    <span className="card-top"><span>{label ?? example.category}</span><span>{example.number}</span></span>
    <h3>{example.title}</h3><p>{example.summary}</p>
  </a>;
}

/** `/examples`: every example, in the catalog's groups. Nothing here runs Underglass; a card opens its example's page. */
function Gallery() {
  const [support] = useState<Support>(detectSupport);
  // A `#/motion` link (the site's first URLs) followed inside the open gallery opens the example's page.
  useEffect(() => {
    const follow = () => { if (location.hash.startsWith("#/")) location.replace(pageURL(route(location.hash))); };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  return <>
    <Chrome gallery skip={{ href: "#gallery", text: "Skip to the examples" }} />
    <main className="gallery" id="gallery" tabIndex={-1}>
      <div className="gallery-head">
        <p className="eyebrow"><b>{examples.length}</b>Live examples</p>
        <h1 id="gallery-title">Examples</h1>
        <p className="gallery-lede">Each one is its original React DOM, drawn by one WebGPU compositor, with a switch back to ordinary DOM. Pick one and use it.</p>
        <p className={`mode-pill ${support === "likely" ? "active" : ""}`}><span className="dot" aria-hidden="true" />{support === "likely"
          ? "This browser can draw them on the GPU"
          : "This browser shows them as ordinary DOM · GPU needs Chrome or Edge 157+"}</p>
      </div>
      {groups.map((group, index) => <section key={group.id} className="gallery-group" aria-labelledby={`group-${group.id}`}>
        <div className="group-head"><h2 id={`group-${group.id}`}>{group.title}</h2><p>{group.note}</p></div>
        <ul className="example-grid">{group.ids.map(id => <li key={id}><ExampleCard id={id} eager={index === 0} /></li>)}</ul>
      </section>)}
    </main>
    <Footer />
  </>;
}

/** An example's page: the bar, the live stage with its status, and what the GPU does in this example. */
function Studio({ opening }: { opening: ExampleId }) {
  const [selected, setSelected] = useState<ExampleId>(opening);
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
  // The studio section, scrolled to its top when the card of the next example is followed.
  const studio = useRef<HTMLElement>(null);
  const controller = useRef<CanvasController>(undefined);
  // The example in the URL, kept by the effect below.
  const shown = useRef<ExampleId>(selected);
  // Setter registered by `Demo` (through `onReady`) to switch examples inside the running root. It is
  // called once on registration too, in case the URL changed while the root was loading.
  const change = useRef<(id: ExampleId) => void>(undefined);
  const ready = useCallback((update: (id: ExampleId) => void) => { change.current = update; update(shown.current); }, []);
  // The example on stage, and the ones before and after it in the catalog.
  const current = exampleOf(selected), { previous, next } = neighbours(selected);
  useEffect(() => {
    const host = frame.current!;
    let app: CanvasController | undefined;
    let cancelled = false;
    // The URL's example is selected in the page chrome and in the running `Demo`. Page anchors also fire
    // `popstate`; they leave the path, and so the example, as it is.
    const show = () => {
      if (retired.current) return;
      upgradeHashLink();
      const id = pageExample();
      // The gallery is another view of this document's script: the history went back to it, so it is loaded.
      if (!id) { location.reload(); return; }
      applyHead(id);
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
    // `hashchange` catches a `#/motion` link followed inside an open page.
    window.addEventListener("popstate", show);
    window.addEventListener("hashchange", show);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", restore);
    return () => { cancelled = true; window.removeEventListener("popstate", show); window.removeEventListener("hashchange", show);
      window.removeEventListener("pagehide", close); window.removeEventListener("pageshow", restore); close(); };
  }, [ready]);
  // Opens an example's page in place.
  function go(id: ExampleId) {
    history.pushState(null, "", pageURL(id));
    navigate.current?.();
  }
  // A plain click on a link to another example switches in place and shows the top of the page; modified clicks open
  // the page's own URL. A disposed page has no runtime to switch, so the link loads the example's page.
  function follow(event: MouseEvent<HTMLAnchorElement>, id: ExampleId) {
    if (disposed || ownClick(event)) return;
    event.preventDefault();
    go(id);
    requestAnimationFrame(() => { if ((studio.current?.getBoundingClientRect().top ?? 0) < 0) scrollTo({ top: 0 }); });
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
    // Admission draws and clicks a probe inside the visible stage: a press with too little of the stage in view brings
    // it into view first, rather than failing with "explicitly enable again when visible".
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
  // The page reflects the runtime's actual mode, not what was requested.
  const gpu = mode === "gpu";
  // With the polyfill installed, examples it doesn't run well are not offered GPU mode at all.
  const polyfillRefused = polyfilled ? polyfillExcluded[selected] : undefined;
  const usable = !busy && !disposed && mounted;
  const modePill = <span className={`mode-pill ${gpu ? "active" : ""}`}><span className="dot" aria-hidden="true" />{gpu ? polyfilled ? "GPU active · polyfill" : "GPU active" : disposed ? "Disposed" : "Ordinary DOM"}</span>;
  return <>
    <Chrome skip={{ href: "#stage-frame", text: "Skip to the live stage" }} />
    <main className={`studio ${gpu ? "is-gpu" : ""}`} id="studio" ref={studio} tabIndex={-1} aria-labelledby="studio-title-heading">
      {/* The way around: back to the gallery, any example by name, the ones before and after, and how the stage is drawn. */}
      <nav className="studio-bar" aria-label="Examples">
        <a className="bar-back" href={pageURL()}><span aria-hidden="true">&#8592;</span><span>All examples</span></a>
        <select className="bar-pick" aria-label="Example" value={selected} disabled={disposed} onChange={event => go(event.target.value as ExampleId)}>
          {examples.map(example => <option key={example.id} value={example.id}>{example.number} · {example.title}</option>)}
        </select>
        <span className="bar-steps">
          <a href={pageURL(previous.id)} aria-label={`Previous example: ${previous.title}`} title={`Previous: ${previous.title}`} onClick={event => follow(event, previous.id)}><span aria-hidden="true">&#8249;</span></a>
          <a href={pageURL(next.id)} aria-label={`Next example: ${next.title}`} title={`Next: ${next.title}`} onClick={event => follow(event, next.id)}><span aria-hidden="true">&#8250;</span></a>
        </span>
        <div className="mode-switch" role="group" aria-label="Presentation">
          <button type="button" aria-pressed={gpu} aria-describedby="gpu-requirement" title="Draw the stage on the GPU (experimental)"
            disabled={!usable || !!polyfillRefused} onClick={() => void action("enable")}>GPU</button>
          <button type="button" aria-pressed={!gpu && !disposed} title="Draw the stage as ordinary DOM" disabled={!usable} onClick={() => void action("disable")}>DOM</button>
        </div>
      </nav>
      <div className="studio-head">
        <p className="eyebrow"><b>{current.number}</b>{current.category}</p>
        <h1 id="studio-title-heading">{current.title}</h1>
      </div>
      <div className="stage-frame" id="stage-frame">
        <div className="stage-chrome" aria-hidden="true"><i /><i /><i /><span>{gpu ? polyfilled ? "webgpu · html-in-canvas polyfill" : "webgpu · shared compositor" : "ordinary dom"}</span>
          {selected !== "instrument" && <span className="scroll-hint">scroll sideways &#8594;</span>}</div>
        <div className="stage-scroll" role="region" aria-label="Live example canvas; scroll horizontally on small screens" tabIndex={0}>
          <div className={selected === "instrument" ? "stage stage-fluid" : "stage"} ref={frame} /></div>
      </div>
      <div className="status-row">
        {modePill}
        <Status reason={diagnostic}>
          <p className="stage-note" id="gpu-requirement"><strong>GPU mode needs Chrome or Edge 157 or later{offerPolyfill && ", or the polyfill offered below"}.</strong> Ordinary DOM works in any browser.</p>
          <p className="stage-note">Dispose ends this page's Underglass session and returns every control to ordinary DOM, until the page is reloaded.</p>
          <button type="button" className="dispose" disabled={!usable} onClick={() => void action("dispose")}>Dispose example</button>
        </Status>
      </div>
      {disposed && <p className="disposed-note">The example is disposed. Reload this page to start a fresh session.</p>}
      {!gpu && !disposed && support !== "likely" && <GpuHelp support={support} preview={previews[current.id]} title={current.title} example={selected}
        polyfill={offerPolyfill ? { excluded: polyfillExcluded[selected], ready: mounted && !busy, run: () => void tryPolyfill() } : undefined} />}
      {gpu && polyfilled && <p className="polyfill-note" role="note"><strong>Running on the HTML-in-Canvas polyfill.</strong> GPU mode here uses
        a JavaScript stand-in for the browser API, not Chrome's own HTML-in-Canvas: changes reach the GPU about a tenth of a second late,
        and some details differ. Chrome or Edge 157 or later shows the real thing. <a href={polyfillLinks.limitations} target="_blank" rel="noreferrer">What
        the polyfill can't do <span aria-hidden="true">&#8599;</span></a></p>}
      <p className="studio-detail">{current.detail}</p>
      <section className="why-gpu" aria-labelledby="why-gpu-heading">
        <div className="why-col">
          <p className="eyebrow">WHY THE GPU HERE</p>
          <h2 id="why-gpu-heading">{current.gpu.headline}</h2>
          <ul>{current.gpu.points.map(point => <li key={point}>{point}</li>)}</ul>
          {!gpu && <p className="why-hint">Switch to GPU above to see these parts; ordinary DOM shows the same controls without them.</p>}
        </div>
        <div className="why-col why-css">
          <p className="eyebrow">WITH CSS ALONE</p>
          <p>{current.gpu.css}</p>
        </div>
      </section>
      <p className="stage-note">Same original controls in DOM and GPU. {selected === "instrument" ? "This example reflows to the width of your screen." : "On smaller screens, scroll the stage sideways."} Nothing you type or film leaves your browser.</p>
      <nav className="studio-next" aria-label="More examples">
        <ExampleCard id={next.id} label="Next example" onClick={event => follow(event, next.id)} />
        <a className="all-examples" href={pageURL()}>All {examples.length} examples <span aria-hidden="true">&#8594;</span></a>
      </nav>
    </main>
    <Footer />
  </>;
}

/** The page the URL names when the document loads: the gallery, or an example's studio. */
function App() {
  const [opening] = useState(pageExample);
  return opening ? <Studio opening={opening} /> : <Gallery />;
}

// Types the `window.showcase` inspection handle.
declare global {
  interface Window { showcase: { state(): ReturnType<CanvasController["state"]>; controller: CanvasController; react: string; reactDOM: string } }
}
// The page chrome is a normal React root; the Underglass root is created separately in `Studio`.
createRoot(document.getElementById("app")!).render(<App />);

/**
 * Plain-language status, with the rest one click away under **Details**: the runtime's exact reason, and what the page
 * passes in (what GPU mode needs, and the control that ends the session).
 */
function Status({ reason, children }: { reason: string; children: ReactNode }) {
  const { title, hint } = explain(reason);
  return <div className="diagnostic">
    <span className="diagnostic-text" role="status" aria-live="polite"><strong>{title}</strong>{hint && <> {hint}</>}</span>
    <details><summary>Details</summary>
      {title !== reason && <code>{reason}</code>}
      {children}
    </details>
  </div>;
}

/** What the help panel's polyfill offer needs: why this example is excluded, if it is, and the button's action. */
interface PolyfillOffer { excluded?: string; ready: boolean; run(): void }

/** Shown when this browser cannot run GPU mode: how to get it, what it looks like, and the polyfill where it can work. */
function GpuHelp({ support, preview, title, example, polyfill }: { support: Support; preview?: string; title: string; example: ExampleId; polyfill?: PolyfillOffer }) {
  const [copied, setCopied] = useState<string>();
  const [showPreview, setShowPreview] = useState(false);
  const copy = (url: string) => { track("GPU Help", { example, action: "copy-flag" }); void navigator.clipboard?.writeText(url).then(() => setCopied(url), () => setCopied(undefined)); };
  return <section className="gpu-help" aria-labelledby="gpu-help-title">
    <div className="gpu-help-text">
      <h3 id="gpu-help-title">{support === "chrome-flags" ? "Update your browser to turn on GPU mode" : "You're seeing the ordinary DOM version"}</h3>
      <p>{support === "chrome-flags"
        ? "This browser doesn't have HTML-in-Canvas yet. The example works as ordinary DOM; GPU mode adds the effects described below."
        : "GPU mode needs HTML-in-Canvas, which Chrome and Edge have from version 157. Every example still works here as plain DOM, with the same controls."}</p>
      <ol>
        <li>Use <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer" onClick={() => track("GPU Help", { example, action: "download" })}>Chrome</a> or
          Edge 157 or later. Already have one? Open <code>chrome://settings/help</code> or <code>edge://settings/help</code> to update it.</li>
        <li>Restart the browser and come back here: the example then starts on the GPU by itself, and the <strong>GPU</strong> button above switches it on.</li>
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
