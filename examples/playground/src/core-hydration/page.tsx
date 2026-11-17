/**
 * Hydrates the prerendered application of `core-hydration.html`, for `tests/browser/hydration.test.mjs`. The elements the
 * page was served with are remembered before any React code runs, so the test can tell whether hydration kept them.
 *
 * - `?manual` waits for `window.hydrationProbe.mount()` (the test first uses the page as served).
 * - `?label=...` renders a different button label than the server did: a mismatch React recovers from by rendering on
 *   the client.
 * - `?strict` mounts under `StrictMode`, and `?default` uses the adapter's own `hydrateRoot` instead of one that records
 *   recoverable errors.
 * - `?throw` makes the application throw in the browser only: a first render that fails.
 */
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { canvasHostsMarkup, createCanvasHosts, mountApplicationModule, mountCanvasApp, type CanvasController } from "@underglass/react";
import { App } from "./app";

const frame = document.querySelector<HTMLElement>("#frame")!;
const ids = ["count", "primary", "enrolled", "art"];
const served = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const servedContainer = frame.querySelector(".app-container");
const query = new URLSearchParams(location.search);
const recoverable: string[] = [];
let controller: CanvasController | undefined;
let layersAtMount: string[] = [];
let mountError: string | null = null;

function Throws(): never { throw new Error("The application failed in the browser"); }
function mount() {
  const hosts = createCanvasHosts(frame);
  try {
    controller = mountCanvasApp({
      ...hosts, hydrate: true, strict: query.has("strict"),
      ...(query.has("default") ? {} : { hydrateRoot: (container: HTMLDivElement, tree: ReactNode) =>
        hydrateRoot(container, tree, { onRecoverableError: error => recoverable.push(String(error)) }) }),
      onStatusChange(status) { document.querySelector("#status")!.textContent = `${status.mode}: ${status.reason}`; },
    }, query.has("throw") ? <Throws /> : <App label={query.get("label") ?? undefined} />);
    // Read in the same task as the mount: hydration has registered the layers by now, or it has not.
    layersAtMount = controller.state().layers.map(layer => layer.id);
  } catch (error) { mountError = String(error); }
  return report();
}
/** Which served elements are still the document's, and what hydration reported. */
function report() {
  return { same: Object.fromEntries(ids.map(id => [id, !!served[id] && served[id] === document.getElementById(id)])),
    container: !!servedContainer && servedContainer === controller?.container, layersAtMount, recoverable: [...recoverable],
    mountError, servedContainerConnected: !!servedContainer?.isConnected, servedMarkupKept: !!served.count?.isConnected,
    overlay: document.querySelector("#overlay-note")?.parentElement?.getAttribute("data-underglass-host") ?? null };
}
/** A frame of its own holding `markup`, for the mounts below. */
function box(markup: string) {
  const element = document.body.appendChild(Object.assign(document.createElement("div"), { innerHTML: markup }));
  Object.assign(element.style, { position: "relative", width: "100px", height: "100px" });
  return element;
}
/** Tries the mounts that must be refused or accepted, each in a frame of its own, and returns what happened. */
async function faults() {
  const attempt = async (markup: string, hydrate: boolean) => {
    const element = box(markup);
    try {
      const mounted = mountCanvasApp({ ...createCanvasHosts(element), hydrate }, <p>fault</p>);
      await mounted.dispose();
      return "accepted";
    } catch (error) { return String(error); } finally { element.remove(); }
  };
  const prerendered = canvasHostsMarkup("<p>fault</p>");
  const formatted = prerendered
    .replace('<div data-underglass-host="ordinary"', '\n  <div data-underglass-host="ordinary"')
    .replace('<div class="app-container"', '\n    <!-- root -->\n    <div class="app-container"')
    .replace('</div></div><div data-underglass-host="overlay">', '</div>\n  </div>\n  <div data-underglass-host="overlay">');
  return {
    // Hydration with hosts that were created empty, not prerendered.
    hydrateEmpty: await attempt("", true),
    // A client render into prerendered hosts.
    renderPrerendered: await attempt(prerendered, false),
    // Prerendered hosts with one missing, with a stray element beside them, and with stray text beside them.
    missingHost: await attempt(prerendered.replace(/<div data-underglass-host="overlay"><\/div>$/, ""), true),
    strayElement: await attempt(`${prerendered}<p>stray</p>`, true),
    strayText: await attempt(`${prerendered}stray`, true),
    // Something beside the prerendered container inside the ordinary host.
    strayInHost: await attempt(prerendered.replace('<div class="app-container"', '<p>stray</p><div class="app-container"'), true),
    // The prerendered hosts as they should be, and with the whitespace and comments an HTML formatter adds: accepted.
    valid: await attempt(prerendered, true),
    formatted: await attempt(formatted, true),
  };
}
/** Hydrates prerendered hosts in a frame of its own, disposes the application and removes the hosts. */
async function retire() {
  const element = box(canvasHostsMarkup("<p>retire</p>"));
  const hosts = createCanvasHosts(element);
  const paragraph = element.querySelector("p");
  const mounted = mountCanvasApp({ ...hosts, hydrate: true }, <p>retire</p>);
  const hydrated = paragraph === element.querySelector("p");
  await mounted.dispose();
  const afterDispose = { container: element.querySelectorAll(".app-container").length, hosts: element.children.length, mode: mounted.state().mode };
  hosts.remove();
  const afterRemove = element.childNodes.length;
  element.remove();
  return { hydrated, afterDispose, afterRemove };
}
/** A plain-DOM module with `hydrate` is handed the prerendered container, with its markup in place. */
async function plainModule() {
  const element = box(canvasHostsMarkup("<p>module</p>"));
  const paragraph = element.querySelector("p");
  const received: (Element | null)[] = [];
  const mounted = mountApplicationModule({ ...createCanvasHosts(element), hydrate: true }, { mount({ container }) { received.push(container.querySelector("p")); return () => {}; } });
  await mounted.dispose();
  element.remove();
  return !!paragraph && received[0] === paragraph;
}

const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
async function lifecycle(operation: "enable" | "disable") {
  await controller![operation]();
  await controller!.settle();
  await frames();
  const state = controller!.state();
  return { mode: state.mode, reason: state.reason, ...report() };
}
document.querySelector("#enable")!.addEventListener("click", () => void lifecycle("enable"));
document.querySelector("#disable")!.addEventListener("click", () => void lifecycle("disable"));
declare global { interface Window { hydrationProbe: unknown } }
window.hydrationProbe = { mount, report, faults, retire, plainModule, enable: () => lifecycle("enable"), disable: () => lifecycle("disable"),
  state: () => controller!.state(),
  box: (id: string) => { const rect = document.getElementById(id)!.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; } };
if (!query.has("manual")) mount();
