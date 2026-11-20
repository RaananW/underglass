/**
 * Entry for `adapter-parity-react.html`: the places where the React adapter must behave as the Vue one does, under
 * GPU. `window.reactParity` drives it from `tests/browser/adapter-parity-react.test.mjs`; every state change it makes
 * commits inside `flushSync`. Query flags: `?strict` (StrictMode, with the dev server).
 *
 * Layer `plain` (at (20, 20), 200x120, red or blue) is enrolled with `useSurfaceRef({ id: "plain", decorative })`,
 * where `decorative` starts `undefined`; `reactParity.setDecorative(false)` makes it `false`, which must not
 * re-enroll the layer. `#plain-button` swaps its colour.
 *
 * `reactParity.state().enrolls` lists every `controller.enroll` call made after the first render, with its id and
 * origin.
 */
import { version, useState } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, useSurfaceRef, type CanvasController, type TransformOrigin } from "@underglass/react";

const params = new URLSearchParams(location.search);
const colours = { red: "rgb(240, 30, 60)", blue: "rgb(20, 120, 220)" };
// React setters captured from `App` on render, so the probe can drive React state from outside.
let setters!: { decorative(value: boolean | undefined): void };

function App() {
  const [decorative, setDecorative] = useState<boolean | undefined>(undefined);
  const [plainColour, setPlainColour] = useState<"red" | "blue">("red");
  setters = { decorative: setDecorative };
  const plain = useSurfaceRef<HTMLElement>({ id: "plain", decorative });
  return <>
    <section ref={plain} id="plain" className="parity-layer" data-colour={plainColour} style={{ background: colours[plainColour] }}>
      <button id="plain-button" type="button" onClick={() => setPlainColour(value => value === "red" ? "blue" : "red")}>Swap</button>
    </section>
  </>;
}

const controller: CanvasController = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!,
  overlayHost: document.querySelector<HTMLElement>("#overlay")!,
  createRoot, flushSync, strict: params.has("strict"),
  onStatus: message => { document.querySelector<HTMLElement>("#status")!.textContent = message; },
}, <App />);

// `useSurfaceRef` calls `enroll` on the runtime it reads from context, which is this controller.
const enrolls: { id: string; origin?: TransformOrigin }[] = [];
const enroll = controller.enroll.bind(controller);
controller.enroll = (element, options) => { enrolls.push({ id: options.id, ...(options.origin !== undefined ? { origin: options.origin } : {}) }); return enroll(element, options); };

const probe = {
  controller,
  state: () => ({ ...controller.state(), reactVersion: version, enrolls: enrolls.map(entry => ({ ...entry })), plainColour: document.querySelector("#plain")?.getAttribute("data-colour") }),
  settle: () => controller.settle(),
  setDecorative: (value: boolean | undefined) => flushSync(() => setters.decorative(value)),
};
declare global { interface Window { reactParity: typeof probe } }
window.reactParity = probe;
