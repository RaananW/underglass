/**
 * Entry for `presence-unmount.html`: a `Presence` taken away while its transition runs, under GPU. Three
 * `useSurfaceRef` layers are direct root children: `keep` (a native button that recolours its panel, the layer that
 * stays), `stage` (a `Presence` that can be unmounted while the section stays, and hidden by a Suspense boundary)
 * and `host` (a section unmounted together with its `Presence`). `window.presenceProbe` drives the page from
 * `tests/browser/presence-unmount.test.mjs`. Every state change takes a `mode`: "sync" commits inside `flushSync`;
 * "default" is a plain update from outside React, which React commits in a task of its own and whose passive
 * effects it runs in a later task. Query flags: `?strict` (StrictMode).
 */
import { Suspense, version, useLayoutEffect, useState } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, Presence, useSurfaceRef, type CanvasController, type MotionDescriptor, type TransitionResult } from "@underglass/react";
import "./presence-unmount.css";

const params = new URLSearchParams(location.search);
// Long motions, so an exit is still running whenever the test interrupts it.
const enter: MotionDescriptor = { keyframes: [{ offset: 0, x: 40, opacity: 0 }, { offset: 1 }], timing: { duration: 3000 } };
const exit: MotionDescriptor = { keyframes: [{ offset: 0 }, { offset: 1, x: 40, opacity: 0 }], timing: { duration: 3000 } };
type Mode = "sync" | "default";
type Completion = TransitionResult & { presence: "stage" | "host"; mounted: boolean };
// Every `onComplete` call, with whether the test had already taken that `Presence` away (`mounted: false`).
const completions: Completion[] = [];
const mounted = { stage: true, host: true };
// The runtime's running declarative motions, read inside the commit that removed or hid a `Presence`.
const atCommit: { stage?: number; host?: number; hidden?: number } = {};
let controller!: CanvasController;
// React setters captured from `App` on render, so the probe can drive React state from outside.
let setters!: {
  stagePresent(value: boolean): void; stageMounted(value: boolean): void; hostPresent(value: boolean): void;
  hostMounted(value: boolean): void; suspended(value: boolean): void;
};
// While set, `Suspender` throws its promise, so the Suspense boundary around the stage's `Presence` hides it.
let gate: { promise: Promise<void>; resolve(): void } | undefined;

function Suspender({ on }: { on: boolean }) {
  if (on && gate) throw gate.promise;
  return null;
}
function Fallback() {
  useLayoutEffect(() => { atCommit.hidden = controller.state().runtimeResources.declarativeMotions; }, []);
  return <p id="fallback">Waiting</p>;
}
function App() {
  const keep = useSurfaceRef<HTMLElement>({ id: "keep" });
  const stage = useSurfaceRef<HTMLElement>({ id: "stage" });
  const host = useSurfaceRef<HTMLElement>({ id: "host" });
  const [warm, setWarm] = useState(false);
  const [stagePresent, setStagePresent] = useState(true);
  const [stageMounted, setStageMounted] = useState(true);
  const [hostPresent, setHostPresent] = useState(true);
  const [hostMounted, setHostMounted] = useState(true);
  const [suspended, setSuspended] = useState(false);
  setters = { stagePresent: setStagePresent, stageMounted: setStageMounted, hostPresent: setHostPresent, hostMounted: setHostMounted, suspended: setSuspended };
  // Layout effects of the parent run after the commit removed the children, before any passive effect.
  useLayoutEffect(() => { if (!stageMounted) atCommit.stage = controller.state().runtimeResources.declarativeMotions; }, [stageMounted]);
  useLayoutEffect(() => { if (!hostMounted) atCommit.host = controller.state().runtimeResources.declarativeMotions; }, [hostMounted]);
  const record = (presence: "stage" | "host") => (result: TransitionResult) => { completions.push({ ...result, presence, mounted: mounted[presence] }); };
  return <>
    <section ref={keep} id="keep" className="keep-panel" style={{ background: warm ? "rgb(220,120,20)" : "rgb(30,100,220)" }}>
      <strong>Stays mounted</strong>
      <div><button id="recolour" onClick={() => setWarm(value => !value)}>Recolour</button></div>
      <output id="recoloured">{warm ? "warm" : "cool"}</output>
    </section>
    <section ref={stage} id="stage" className="presence-layer">
      <Suspense fallback={<Fallback />}>
        <Suspender on={suspended} />
        {stageMounted && <Presence id="stage" present={stagePresent} enter={enter} exit={exit}onComplete={record("stage")}>
          <div className="presence-card" id="stage-card"><strong>Stage</strong><input id="stage-input" aria-label="Stage value" defaultValue="stage" /></div>
        </Presence>}
      </Suspense>
    </section>
    {hostMounted && <section ref={host} id="host" className="presence-layer">
      <Presence id="host" present={hostPresent} enter={enter} exit={exit} onComplete={record("host")}>
        <div className="presence-card" id="host-card"><strong>Host</strong></div>
      </Presence>
    </section>}
  </>;
}
controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!,
  overlayHost: document.querySelector<HTMLElement>("#overlay")!,
  createRoot, flushSync, strict: params.has("strict"),
  onStatus: message => { document.querySelector<HTMLElement>("#status")!.textContent = message; },
}, <App />);
// Commits `update` in `flushSync` ("sync") or as an ordinary update React schedules itself ("default").
function apply(mode: Mode, update: () => void) { if (mode === "sync") flushSync(update); else update(); }
function state() {
  return { ...controller.state(), reactVersion: version, completions: completions.map(entry => ({ ...entry })), atCommit: { ...atCommit } };
}
window.presenceProbe = {
  state, settle: () => controller.settle(), dispose: () => controller.dispose(),
  showStage: (value, mode) => apply(mode, () => setters.stagePresent(value)),
  unmountStage: mode => { mounted.stage = false; apply(mode, () => setters.stageMounted(false)); },
  showHost: (value, mode) => apply(mode, () => setters.hostPresent(value)),
  unmountHost: mode => { mounted.host = false; apply(mode, () => setters.hostMounted(false)); },
  suspend: mode => {
    let resolve!: () => void;
    gate = { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
    apply(mode, () => setters.suspended(true));
  },
  resume: () => { const current = gate; gate = undefined; current?.resolve(); },
};
void controller.enable().catch(error => { document.querySelector("#status")!.textContent = String(error); console.error(error); });
declare global {
  interface Window { presenceProbe: {
    state: typeof state; settle(): Promise<void>; dispose(): ReturnType<CanvasController["dispose"]>;
    showStage(value: boolean, mode: Mode): void; unmountStage(mode: Mode): void;
    showHost(value: boolean, mode: Mode): void; unmountHost(mode: Mode): void;
    suspend(mode: Mode): void; resume(): void;
  } }
}
