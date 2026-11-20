/**
 * Entry for `adapter-parity-react.html`: the places where the React adapter must behave as the Vue one does, under
 * GPU. `window.reactParity` drives it from `tests/browser/adapter-parity-react.test.mjs`; every state change it makes
 * commits inside `flushSync`, except the `discard*` ones, which start a transition that suspends and so is rendered
 * but not committed until `resume()`. Query flags: `?strict` (StrictMode, with the dev server).
 *
 * Layer `plain` (at (20, 20), 200x120, red or blue) is enrolled with `useSurfaceRef({ id: "plain", decorative })`,
 * where `decorative` starts `undefined`; `reactParity.setDecorative(false)` makes it `false`, which must not
 * re-enroll the layer. `#plain-button` swaps its colour.
 *
 * Layer `pivot` (at (240, 20), 160x120, green or blue) is enrolled with `origin` from `App`'s state (initially
 * "center"), but its section is rendered by the child `PivotPanel`, so `replacePivot()` gives it a new element (a new
 * `key`) in a commit in which `App` does not render. `replaceWithOrigin(origin)` changes the origin and the element in
 * one commit. `#pivot-button` swaps its colour.
 *
 * Layer `presence` (at (420, 20), 200x120, yellow) holds a `Presence` on itself around the green `#badge`; its
 * `onComplete` records the `label` of the render it came from. The exit and enter motions start and end at rest.
 *
 * `reactParity.state().enrolls` lists every `controller.enroll` call made after the first render, with its id and
 * origin.
 */
import { Suspense, startTransition, version, useLayoutEffect, useState, type RefCallback } from "react";
import { createRoot, flushSync } from "./react-root";
import {
  mountCanvasApp, useSurfaceRef, Presence, type CanvasController, type MotionDescriptor, type TransformOrigin, type TransitionResult,
} from "@underglass/react";

const params = new URLSearchParams(location.search);
const colours = { red: "rgb(240, 30, 60)", blue: "rgb(20, 120, 220)", green: "rgb(20, 200, 90)", yellow: "rgb(250, 200, 20)" };
// A small sideways step that ends where it started, so the layer is at rest once a motion completes.
const step: MotionDescriptor = { keyframes: [{ offset: 0 }, { offset: 0.5, x: 12 }, { offset: 1 }], timing: { duration: 400 } };
// React setters captured on render, so the probe can drive React state from outside.
let setters!: {
  decorative(value: boolean | undefined): void; origin(value: TransformOrigin): void; generation(update: (value: number) => number): void;
  suspended(value: boolean): void; present(value: boolean): void; label(value: string): void;
};
let replacePanel!: () => void;
// The origin and label of the last `App` render, committed or not, and of the last commit.
const rendered: { origin?: TransformOrigin; label?: string } = {}, committed: { origin?: TransformOrigin; label?: string } = {};
// Every `onComplete` call, with the label of the render whose handler React called.
const completions: { label: string; status: TransitionResult["status"] }[] = [];
// While set, `Suspender` throws its promise, so a transition that turns it on is rendered but not committed.
let gate: { promise: Promise<void>; resolve(): void } | undefined;

function Suspender({ on }: { on: boolean }) {
  if (on && gate) throw gate.promise;
  return null;
}
// Renders the `pivot` layer's section, so a new element can replace it in a commit that does not render `App`.
function PivotPanel({ panelRef, generation }: { panelRef: RefCallback<HTMLElement>; generation: number }) {
  const [own, setOwn] = useState(0);
  const [colour, setColour] = useState<"green" | "blue">("green");
  replacePanel = () => setOwn(value => value + 1);
  return <section key={`${generation}-${own}`} ref={panelRef} id="pivot" className="parity-layer" data-colour={colour} style={{ background: colours[colour] }}>
    <button id="pivot-button" type="button" onClick={() => setColour(value => value === "green" ? "blue" : "green")}>Swap</button>
  </section>;
}
function App() {
  const [decorative, setDecorative] = useState<boolean | undefined>(undefined);
  const [plainColour, setPlainColour] = useState<"red" | "blue">("red");
  const [origin, setOrigin] = useState<TransformOrigin>("center");
  const [generation, setGeneration] = useState(0);
  const [suspended, setSuspended] = useState(false);
  const [present, setPresent] = useState(true);
  const [label, setLabel] = useState("initial");
  setters = { decorative: setDecorative, origin: setOrigin, generation: setGeneration, suspended: setSuspended, present: setPresent, label: setLabel };
  Object.assign(rendered, { origin, label });
  useLayoutEffect(() => { Object.assign(committed, { origin, label }); });
  const plain = useSurfaceRef<HTMLElement>({ id: "plain", decorative });
  const pivot = useSurfaceRef<HTMLElement>({ id: "pivot", origin });
  const presence = useSurfaceRef<HTMLElement>({ id: "presence" });
  return <>
    <section ref={plain} id="plain" className="parity-layer" data-colour={plainColour} style={{ background: colours[plainColour] }}>
      <button id="plain-button" type="button" onClick={() => setPlainColour(value => value === "red" ? "blue" : "red")}>Swap</button>
    </section>
    <PivotPanel panelRef={pivot} generation={generation} />
    <section ref={presence} id="presence" className="parity-layer" style={{ background: colours.yellow }}>
      <Presence id="presence" present={present} enter={step} exit={step} onComplete={result => completions.push({ label, status: result.status })}>
        <div id="badge" style={{ height: 60, background: colours.green }} />
      </Presence>
    </section>
    <Suspense fallback={null}><Suspender on={suspended} /></Suspense>
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

/** Starts a transition that applies `update` and suspends, so React renders it but does not commit it until `resume`. */
function discard(update: () => void) {
  let resolve!: () => void;
  gate = { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
  startTransition(() => { update(); setters.suspended(true); });
}
const colour = (id: string) => document.getElementById(id)?.getAttribute("data-colour");
const probe = {
  controller,
  state: () => ({
    ...controller.state(), reactVersion: version, enrolls: enrolls.map(entry => ({ ...entry })), rendered: { ...rendered }, committed: { ...committed },
    completions: completions.map(entry => ({ ...entry })), plainColour: colour("plain"), pivotColour: colour("pivot"), badge: !!document.getElementById("badge"),
  }),
  settle: () => controller.settle(),
  setDecorative: (value: boolean | undefined) => flushSync(() => setters.decorative(value)),
  discardOrigin: (origin: TransformOrigin) => discard(() => setters.origin(origin)),
  discardLabel: (label: string) => discard(() => setters.label(label)),
  /** Lets the suspended transition commit. */
  resume: () => { const current = gate; gate = undefined; current?.resolve(); },
  replacePivot: () => flushSync(() => replacePanel()),
  replaceWithOrigin: (origin: TransformOrigin) => flushSync(() => { setters.origin(origin); setters.generation(value => value + 1); }),
  setPresent: (value: boolean) => flushSync(() => setters.present(value)),
  setLabel: (label: string) => flushSync(() => setters.label(label)),
};
declare global { interface Window { reactParity: typeof probe } }
window.reactParity = probe;
