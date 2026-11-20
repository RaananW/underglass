/**
 * Entry for `transient-structure.html`: the fixture of `tests/browser/transient-structure.test.mjs` (issue #262). On the GPU,
 * React commits pass through states that last a task: a layer's element removed before its enrollment is released, a layer
 * hidden until a later effect shows it again, a `key` swap that remounts a layer id. Four layers on one row, 110 x 110 at
 * y 20, each holding a native button that counts its clicks:
 * - `stay-0` (red, x 20) and `stay-1` (blue, x 220): `Surface` layers that never change;
 * - `passive` (x 420): the application's own element, enrolled with `useGPUHost().enroll` in a passive effect and released in
 *   its cleanup, which React runs after it has removed the element. Green in an even generation, purple in an odd one;
 * - `collapse` (x 620): a `Surface` the page hides (`hidden`, so `display: none` and 0 x 0); amber, teal after each return.
 *
 * The render of the change `act` makes takes 6 ms (`Slow`), so React yields after the commit and runs its passive effects in the next task,
 * as it does after any commit that fills its 5 ms time slice: the runtime's mutation observer sees the state in between.
 * `act` starts the change in a task right after a frame and records, after each of the next frames, the runtime's mode and
 * counters (`samples`), with the frame in which the page's own mutation observer saw the change (`committed`).
 * `window.transientProbe` drives the page.
 */
import { useEffect, useRef, useState } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, Surface, useGPUHost } from "@underglass/react";

/** What the page shows; `act` changes it. */
interface Scene { passive: boolean; generation: number; collapsed: boolean; stay: boolean; returns: number; slow: boolean }
type Action = "remove" | "swap" | "collapse" | "detach" | "zero" | "frame-zero";

let update: (change: (scene: Scene) => Scene) => void = () => { throw new Error("Not mounted"); };
/** While set, the `passive` cleanup keeps the enrollment: its release is kept here, so the layer stays enrolled after its element left. */
let leak = false;
const leaked: (() => void)[] = [];

/** Takes 6 ms to render while `active`: past the scheduler's 5 ms slice, so React yields after the commit. */
function Slow({ active }: { active: boolean }) {
  if (active) { const end = performance.now() + 6; while (performance.now() < end); }
  return null;
}
function Counter({ id, label = id }: { id: string; label?: string }) {
  const [clicks, setClicks] = useState(0);
  return <button id={`${id}-button`} onClick={() => setClicks(value => value + 1)}>{label} {clicks}</button>;
}
/** The application's own layer: enrolled in a passive effect, released in its cleanup (after React removed the element). */
function Passive({ generation }: { generation: number }) {
  const controller = useGPUHost();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const release = controller.enroll(element.current!, { id: "passive" });
    return () => { if (leak) leaked.push(release); else release(); };
  }, [controller]);
  return <div ref={element} style={{ position: "absolute", left: 420, top: 20, width: 110, height: 110, padding: 8, boxSizing: "border-box",
    background: generation % 2 ? "rgb(130,40,200)" : "rgb(20,160,80)", color: "white", fontSize: 12 }}>
    <Counter id="passive" label={`passive g${generation}`} />
  </div>;
}
function App() {
  const [scene, setScene] = useState<Scene>({ passive: true, generation: 0, collapsed: false, stay: false, returns: 0, slow: false });
  update = setScene;
  // A collapse that is not meant to stay is undone by the next effect: its size comes back one commit later.
  useEffect(() => {
    if (scene.collapsed && !scene.stay) setScene(current => ({ ...current, collapsed: false, returns: current.returns + 1, slow: false }));
  }, [scene.collapsed, scene.stay]);
  return <>
    <Slow active={scene.slow} />
    <Surface id="stay-0" layout={{ x: 20, y: 20, width: 110, height: 110, padding: 8 }} appearance={{ background: "rgb(240,30,60)", color: "black", fontSize: 12 }}>
      <Counter id="stay-0" />
    </Surface>
    <Surface id="stay-1" layout={{ x: 220, y: 20, width: 110, height: 110, padding: 8 }} appearance={{ background: "rgb(30,100,220)", color: "black", fontSize: 12 }}>
      <Counter id="stay-1" />
    </Surface>
    {scene.passive && <Passive key={scene.generation} generation={scene.generation} />}
    <Surface id="collapse" hidden={scene.collapsed} layout={{ x: 620, y: 20, width: 110, height: 110, padding: 8 }}
      appearance={{ background: scene.returns % 2 ? "rgb(20,170,170)" : "rgb(250,170,20)", color: "black", fontSize: 12 }}>
      <Counter id="collapse" />
    </Surface>
  </>;
}
const controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.getElementById("ordinary")!, createRoot, flushSync,
  budgets: { layers: 8, pixels: 2_000_000 },
  onStatus: message => { document.getElementById("status")!.textContent = message.startsWith("{") ? JSON.parse(message).mode : message; },
}, <App />);
const admitted = await controller.enable();
if (admitted.mode !== "gpu") throw new Error(`Admission failed: ${admitted.reason}`);
await controller.settle();

/** The change each action makes, and how the page sees that it was committed. */
const changes: Record<Action, { change(scene: Scene): Scene; done(): boolean }> = {
  remove: { change: scene => ({ ...scene, passive: false }), done: () => !document.getElementById("passive-button") },
  detach: { change: scene => ({ ...scene, passive: false }), done: () => !document.getElementById("passive-button") },
  swap: { change: scene => ({ ...scene, generation: scene.generation + 1 }), done: () => !!document.getElementById("passive-button")?.textContent?.startsWith("passive g1") },
  collapse: { change: scene => ({ ...scene, collapsed: true, stay: false }), done: () => !!document.getElementById("collapse")?.hidden },
  zero: { change: scene => ({ ...scene, collapsed: true, stay: true }), done: () => !!document.getElementById("collapse")?.hidden },
  "frame-zero": { change: scene => ({ ...scene, collapsed: true, stay: true }), done: () => !!document.getElementById("collapse")?.hidden },
};
/**
 * Makes one change in the first of seven frames and resolves after the seventh with a sample of each. A task action is a
 * state update made in a task right after that frame (React commits it in a task of its own and runs the passive effects
 * in the next); `frame-zero`
 * commits it synchronously inside a frame callback, after the runtime's own callbacks of that frame. Each sample is taken
 * in a task posted from a frame callback, so after that frame was presented.
 */
async function act(action: Action) {
  leak = action === "detach";
  const read = () => {
    const state = controller.state();
    return { mode: state.mode, reason: state.reason, gpuFrames: state.metrics.gpuFrames, deferredStructure: state.metrics.deferredStructure,
      heldDraws: state.metrics.heldDraws, policyPasses: state.metrics.policyPasses, layers: state.layers.map(layer => layer.id) };
  };
  const before = read();
  let frame = 0, committed: number | undefined, committedFrames: number | undefined;
  const { change, done } = changes[action];
  const observer = new MutationObserver(() => {
    if (committed !== undefined || !done()) return;
    committed = frame;
    committedFrames = controller.state().metrics.gpuFrames;
  });
  observer.observe(controller.container, { subtree: true, childList: true, attributes: true, characterData: true });
  const samples: (ReturnType<typeof read> & { frame: number; paints: number })[] = [];
  // Native paint events of the output canvas so far.
  let paints = 0;
  const output = document.querySelector<HTMLCanvasElement>("#output")!, painted = () => { paints++; };
  output.addEventListener("paint", painted);
  await new Promise<void>(resolve => {
    const watch = () => {
      const at = ++frame;
      if (at === 1) {
        if (action === "frame-zero") flushSync(() => update(scene => change({ ...scene, slow: true })));
        else setTimeout(() => update(scene => change({ ...scene, slow: true })), 0);
      }
      setTimeout(() => { samples.push({ frame: at, paints, ...read() }); if (at === 7) resolve(); }, 0);
      if (at < 7) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  observer.disconnect();
  output.removeEventListener("paint", painted);
  leak = false;
  update(scene => ({ ...scene, slow: false }));
  return { action, before, committed, committedFrames, samples };
}
window.transientProbe = {
  controller, act, state: () => controller.state(), settle: () => controller.settle(), dispose: () => controller.dispose(),
  releaseLeaked: () => { for (const release of leaked.splice(0)) release(); },
};
declare global { interface Window { transientProbe: {
  controller: typeof controller; act: typeof act; releaseLeaked(): void;
  state(): ReturnType<typeof controller.state>; settle(): Promise<void>; dispose(): ReturnType<typeof controller.dispose>;
} } }
