/**
 * Entry for `surface.html` (native capture / Lite WebGPU integration gate): exercises the library's surface renderer
 * (`createSurfaceRenderer`, re-exported by `surface-renderer.ts`) directly, without the `CanvasController` API.
 * A small React app with two `drawable` layers is mounted through the renderer's `mount` hook. The page shows
 * the renderer's diagnostics and offers enable/disable, a tint effect, motion and dispose. `window.surfaceProbe`
 * is the browser-test hook (`slowPolicy(ms)` makes the renderer's policy check that slow); `?dom` skips automatic
 * enabling and `?strict` uses StrictMode.
 */
import { Profiler, StrictMode, useEffect, useLayoutEffect, useState, type ProfilerOnRenderCallback } from "react";
import { createRoot } from "./demo/react-root";
import { createSurfaceRenderer } from "./surface-renderer";

// React commit counters, filled from a `Profiler` and merged into the probe's metrics.
const commits = { reactCommits: 0, commitEvents: [] as { phase: "mount" | "update" | "nested-update"; commitTime: number }[], mounts: 0, cleanups: 0 };
const actionRemovers: (() => void)[] = [];
// Pending startup `requestAnimationFrame` id, tracked so `dispose` can cancel it.
let startupFrame = 0;
// Milliseconds the renderer's `policy` check busy-waits each time it runs (`surfaceProbe.slowPolicy`); it never fails.
let policyCost = 0;
const recordCommit: ProfilerOnRenderCallback = (_id, phase, _actual, _base, _start, commitTime) => {
  commits.reactCommits++;
  commits.commitEvents.push({ phase, commitTime });
};
// Layers re-capture only when the renderer is told to: every commit that can change pixels calls
// `renderer.invalidate()` from a layout effect.
function NestedCounter() {
  const [count, setCount] = useState(0);
  useLayoutEffect(() => renderer.invalidate());
  return <button id="nested-count" onClick={() => setCount(count + 1)}>Nested {count}</button>;
}
function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("original");
  const [submitted, setSubmitted] = useState("");
  const [visible, setVisible] = useState(true);
  useEffect(() => { commits.mounts++; return () => { commits.cleanups++; }; }, []);
  useLayoutEffect(() => renderer.invalidate());
  return <div className="layers">
    <section id="card-layer" className="card" {...{ drawable: "" }}>
      <h2>Original React controls</h2>
      <button id="count" onClick={() => setCount(count + 1)}>Count {count}</button>
      <form onSubmit={event => { event.preventDefault(); setSubmitted(name); }}>
        <p><input id="controlled" aria-label="Controlled input" value={name} onChange={event => setName(event.target.value)} /><button id="submit">Save</button></p>
      </form>
      <p><input id="uncontrolled" aria-label="Uncontrolled input" defaultValue="native" /></p>
      <p id="submitted">{submitted || "Not saved"}</p>
      <button id="toggle" aria-label="Toggle child" onClick={() => setVisible(!visible)}>Child</button>
      {visible && <NestedCounter />}
    </section>
    <aside id="badge-layer" className="badge" {...{ drawable: "" }}><button id="badge" onClick={() => setCount(count + 1)}>Badge {count}</button></aside>
  </div>;
}
// Layer matrices place the two layers at fixed canvas positions (CSS px). `mount` receives the container that the
// renderer moves between the ordinary host and the canvas.
const renderer = createSurfaceRenderer({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture-host")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#gpu-output")!,
  ordinaryHost: document.querySelector<HTMLElement>("#ordinary-host")!,
  size: () => ({ width: 480, height: 360, dpr: 1 }),
  layers: () => [["card-layer", 20, 20], ["badge-layer", 180, 180]].map(([id, x, y]) => ({
    id: String(id),
    element: renderer.container.querySelector<HTMLElement>(`#${id}`)!,
    matrix: () => new DOMMatrix().translate(Number(x), Number(y)),
    opacity: () => 1,
  })),
  mount(container) {
    const root = createRoot(container);
    const specimen = <Profiler id="surface-specimen" onRender={recordCommit}><App /></Profiler>;
    root.render(new URLSearchParams(location.search).has("strict") ? <StrictMode>{specimen}</StrictMode> : specimen);
    return () => root.unmount();
  },
  onStatus(message) { document.querySelector<HTMLElement>("#diagnostics")!.textContent = message; },
  policy() {
    const started = performance.now();
    while (performance.now() - started < policyCost);
    return undefined;
  },
});
// Renderer state plus React commit metrics and a snapshot of the control values and focus.
function state() {
  const input = renderer.container.querySelector<HTMLInputElement>("#controlled");
  const result = renderer.state();
  return {
    ...result, resources: { ...result.resources, demoListeners: actionRemovers.length, demoScheduledFrames: startupFrame ? 1 : 0 }, metrics: { ...result.metrics, ...structuredClone(commits) },
    reactCommitInstrumentation: "Specimen subtree Profiler.onRender; react-dom/profiling enables production callbacks",
    count: renderer.container.querySelector("#count")?.textContent,
    nestedCount: renderer.container.querySelector("#nested-count")?.textContent,
    controlled: input?.value,
    uncontrolled: renderer.container.querySelector<HTMLInputElement>("#uncontrolled")?.value,
    submitted: renderer.container.querySelector("#submitted")?.textContent,
    focus: document.activeElement?.id,
    selection: input ? [input.selectionStart, input.selectionEnd] : null,
  };
}
// Settles, then runs the renderer's diagnostic frame loop; returns before/after states with React commit counts.
async function frames(count?: number, shift?: number, shade?: number) {
  await renderer.settle();
  const reactCommits = commits.reactCommits;
  const result = await renderer.frames(count, shift, shade);
  return { before: { ...result.before, reactCommits }, after: { ...result.after, reactCommits: commits.reactCommits }, state: state() };
}
async function enable() { await renderer.enable(); return state(); }
async function disable() { await renderer.disable(); return state(); }
async function dispose() {
  if (startupFrame) { cancelAnimationFrame(startupFrame); startupFrame = 0; }
  await renderer.dispose();
  for (const remove of actionRemovers.splice(0)) remove();
  return state();
}
// Makes every policy check cost at least `milliseconds` of main-thread time (0 restores the free check).
function slowPolicy(milliseconds: number) { policyCost = milliseconds; }
// Test hook.
window.surfaceProbe = { enable, disable, frames, settle: renderer.settle, state, dispose, slowPolicy };
for (const [id, operation] of [
  ["enable", enable], ["disable", disable], ["effect", renderer.toggleTint],
  ["motion", renderer.toggleMotion], ["dispose", dispose],
] as const) {
  const button = document.getElementById(id)!;
  const listener = () => {
    void operation().catch(error => { document.querySelector<HTMLElement>("#diagnostics")!.textContent += `\nAction failed: ${String(error)}`; console.error(error); });
  };
  button.addEventListener("click", listener);
  actionRemovers.push(() => button.removeEventListener("click", listener));
}
// Enable GPU one frame after load unless `?dom` is set.
startupFrame = requestAnimationFrame(() => {
  startupFrame = 0;
  if (!new URLSearchParams(location.search).has("dom")) {
    void enable().catch(error => {
      document.querySelector<HTMLElement>("#diagnostics")!.textContent += `\nStartup failed: ${String(error)}`;
      console.error(error);
    });
  }
});

declare global {
  interface Window {
    surfaceProbe: { enable: typeof enable; disable: typeof disable; frames: typeof frames; settle: typeof renderer.settle; state: typeof state; dispose: typeof dispose; slowPolicy: typeof slowPolicy };
  }
}
