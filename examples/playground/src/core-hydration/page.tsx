/**
 * Hydrates the prerendered application of `core-hydration.html`, for `tests/browser/hydration.test.mjs`. The elements the
 * page was served with are remembered before any React code runs, so the test can tell whether hydration kept them.
 *
 * `?manual` waits for `window.hydrationProbe.mount()` (the test first uses the page as served). `?label=...` renders a
 * different button label than the server did: a mismatch React recovers from by rendering on the client.
 */
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

function mount() {
  const hosts = createCanvasHosts(frame);
  controller = mountCanvasApp({
    ...hosts, hydrate: true,
    hydrateRoot: (container, tree) => hydrateRoot(container, tree, { onRecoverableError: error => recoverable.push(String(error)) }),
    onStatusChange(status) { document.querySelector("#status")!.textContent = `${status.mode}: ${status.reason}`; },
  }, <App label={query.get("label") ?? undefined} />);
  // Read in the same task as the mount: hydration has registered the layers by now, or it has not.
  layersAtMount = controller.state().layers.map(layer => layer.id);
  return report();
}
/** Which served elements are still the document's, and what hydration reported. */
function report() {
  return { same: Object.fromEntries(ids.map(id => [id, !!served[id] && served[id] === document.getElementById(id)])),
    container: !!servedContainer && servedContainer === controller?.container, layersAtMount, recoverable: [...recoverable],
    overlay: document.querySelector("#overlay-note")?.parentElement?.getAttribute("data-underglass-host") ?? null };
}
/** Tries the mounts that must be refused, each in a frame of its own, and returns the errors. */
function faults() {
  const attempt = (markup: string, hydrate: boolean) => {
    const box = document.body.appendChild(Object.assign(document.createElement("div"), { innerHTML: markup }));
    Object.assign(box.style, { position: "relative", width: "100px", height: "100px" });
    try {
      const mounted = mountCanvasApp({ ...createCanvasHosts(box), hydrate }, <p>fault</p>);
      void mounted.dispose();
      return "accepted";
    } catch (error) { return String(error); } finally { box.remove(); }
  };
  const prerendered = canvasHostsMarkup("<p>fault</p>");
  return {
    // Hydration with hosts that were created empty, not prerendered.
    hydrateEmpty: attempt("", true),
    // A client render into prerendered hosts.
    renderPrerendered: attempt(prerendered, false),
    // Prerendered hosts with one missing, and with a stray element beside them.
    missingHost: attempt(prerendered.replace(/<div data-underglass-host="overlay"><\/div>$/, ""), true),
    strayElement: attempt(`${prerendered}<p>stray</p>`, true),
    // The prerendered hosts as they should be: accepted.
    valid: attempt(prerendered, true),
    // A plain-DOM module with `hydrate` is handed the prerendered container, with its markup in place.
    module: (() => {
      const box = document.body.appendChild(Object.assign(document.createElement("div"), { innerHTML: prerendered }));
      const served = box.querySelector("p");
      let received: Element | null = null;
      const mounted = mountApplicationModule({ ...createCanvasHosts(box), hydrate: true }, { mount({ container }) { received = container.querySelector("p"); return () => {}; } });
      void mounted.dispose();
      box.remove();
      return !!served && served === received;
    })(),
  };
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
window.hydrationProbe = { mount, report, faults, enable: () => lifecycle("enable"), disable: () => lifecycle("disable"),
  state: () => controller!.state(),
  box: (id: string) => { const box = document.getElementById(id)!.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; } };
if (!query.has("manual")) mount();
