/**
 * Fixture app for the worker compositor validation (`scripts/worker-validation.mjs`). One page serves
 * several variants chosen by `?variant=`: `css` (plain CSS animation), `main` and `main-ripple` (main-thread
 * GPU), `worker` and `worker-ripple` (experimental worker). Tests use `window.workerFixture`; `?fault=`
 * injects a worker construction failure (`factory`) or a delayed shutdown reply (`stop-delay`). `firstRender` mounts a
 * second application, whose first render throws, into hosts of its own.
 */
import { Component, Profiler, useState, version, type ReactNode } from "react";
import { flushSync, version as domVersion } from "react-dom";
import { mountCanvasApp, Surface, Box } from "@underglass/react";
import { mountWorkerCanvasApp, WorkerSurface, type WorkerProgram } from "@underglass/react/experimental-worker";
import program from "./program.json";

// Variant and fault are read from the page URL so one build covers every case.
const params = new URLSearchParams(location.search);
const variant = params.get("variant") ?? "css";
if (!["css", "main", "worker", "main-ripple", "worker-ripple"].includes(variant)) throw new Error("Unknown worker fixture variant");
const isWorker = variant.startsWith("worker"), ripple = variant.endsWith("ripple");
let commits = 0, renders = 0, changeStructure: () => void, changeLayout: () => void;
const operations: { kind: string; durationMs: number }[] = [];
function App() {
  renders++;
  const [value, setValue] = useState("original");
  const [saved, setSaved] = useState("original");
  const [present, setPresent] = useState(true);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(0);
  changeStructure = () => setPresent(previous => !previous);
  changeLayout = () => setOffset(previous => previous ? 0 : 8);
  // Eight similar layers; layer 0 holds the native controls, the others are decorative.
  const Layer = isWorker ? WorkerSurface : Surface;
  // Lets `collect` trigger React commits from outside to create main-thread contention.
  (window as unknown as { updateBusy: () => void }).updateBusy = () => setBusy(previous => previous + 1);
  return <>{Array.from({ length: 8 }, (_, index) => index === 7 && !present ? null : <Layer key={index}
    id={`layer-${index}`} decorative={index > 0}
    {...(isWorker ? { animation: index > 0 ? ripple ? "ripple" as const : "opacity" as const : "none" as const } : {})}
    layout={{ x: 20 + index % 4 * 150 + (index === 6 ? offset : 0), y: 20 + Math.floor(index / 4) * 150, width: 130, height: 130, padding: 4 }}
    appearance={{ background: index === 0 ? "rgb(245,196,41)" : "rgb(38,104,215)", fontSize: 12 }}>
    <Box>Layer {index + 1}: same content</Box>
    {index === 0 ? <Box layout={{ direction: "column", gap: 3 }}>
      <label htmlFor="native-input">Original native input</label>
      <input id="native-input" size={10} value={value} onChange={event => setValue(event.target.value)} />
      <button id="save" onClick={() => setSaved(value)}>Save</button>
      <Box id="saved">{saved}</Box><Box id="busy">React commits: {busy}</Box>
    </Box> : <svg width="120" height="80" aria-hidden="true">{Array.from({ length: 12 }, (_, stripe) =>
      <rect key={stripe} x={stripe * 10} width="5" height="80" fill="white" />)}</svg>}
  </Layer>)}</>;
}
const status = (message: string) => { document.getElementById("status")!.textContent = message; };
const originalHost = document.getElementById("ordinary")!;
// Worker variants mount through the experimental worker entry; the others use the regular main-thread mount.
const controller = isWorker ? mountWorkerCanvasApp({
  ordinaryHost: originalHost, canvasHost: document.getElementById("worker-host")!,
  width: 640, height: 320, program: program as WorkerProgram, strict: true, onStatus: status,
  createWorker: () => {
    if (params.get("fault") === "factory") throw new Error("Injected worker construction failure");
    const worker = new Worker(new URL("./thread.ts", import.meta.url), { type: "module" });
    // Fault injection: hold back the first `stop` message for 11 seconds, longer than the controller's 10 second
    // reply timeout (`request` in `experimental-worker.tsx`), so the first disable() fails with a timeout.
    if (params.get("fault") === "stop-delay") {
      const post = worker.postMessage.bind(worker);
      let delayed = false;
      worker.postMessage = (message: unknown, transfer?: StructuredSerializeOptions | Transferable[]) => {
        const send = () => { if (Array.isArray(transfer)) post(message, transfer); else post(message, transfer); };
        if (!delayed && message && typeof message === "object" && Reflect.get(message, "type") === "stop") {
          delayed = true; setTimeout(send, 11_000);
        } else send();
      };
    }
    return worker;
  },
}, <Profiler id="worker" onRender={() => commits++}><App /></Profiler>) : mountCanvasApp({
  ordinaryHost: originalHost, captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!, strict: true,
  onStatus: status, budgets: { layers: 8, pixels: 2_000_000 },
  onMeasure: sample => {
    if (operations.length < 100_000) operations.push({ kind: sample.kind, durationMs: sample.durationMs });
  },
}, <Profiler id="main" onRender={() => commits++}><App /></Profiler>);
// Only the main-thread controller has `createMotion`; it starts the decorative layers' ripple or opacity motion.
if ("createMotion" in controller) for (let slot = 1; slot < 8; slot++) {
  if (ripple) controller.setRipple(`layer-${slot}`, { amplitude: 6, seconds: 0, playing: true });
  else {
    const motion = controller.createMotion(`layer-${slot}`, {
      keyframes: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0.35 }],
      timing: { duration: 1000, direction: "alternate", iterations: 1000, easing: "linear" },
    });
    if (variant === "main") motion.own();
    motion.play();
  }
}
function Throws(): never { throw new Error("The worker application failed in its first render"); }
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p id="first-render-fallback">Caught</p> : this.props.children; }
}
/**
 * Mounts an application whose first render throws (inside an error boundary when `caught`) into new hosts of its own
 * with `mountWorkerCanvasApp`, and reports what the mount threw and what it left: observers that observe and were not
 * disconnected, listeners still on the window, the document, a media query or a host, the hosts' content and the status
 * calls. Then a healthy application mounts into the same hosts and is disposed.
 */
async function firstRender(caught: boolean) {
  const frame = document.body.appendChild(document.createElement("div"));
  frame.style.cssText = "position:relative;width:200px;height:120px";
  const ordinaryHost = frame.appendChild(document.createElement("div")), canvasHost = frame.appendChild(document.createElement("div"));
  const observing = new Set<object>(), listening: [EventTarget, string, unknown, boolean][] = [];
  const watched = (target: EventTarget) => target === window || target === document || target instanceof MediaQueryList || target === ordinaryHost || target === canvasHost;
  const capture = (options: unknown) => typeof options === "boolean" ? options : !!(options as { capture?: boolean } | undefined)?.capture;
  const find = (target: EventTarget, type: string, listener: unknown, options: unknown) =>
    listening.findIndex(([t, y, l, c]) => t === target && y === type && l === listener && c === capture(options));
  const observers = [MutationObserver, ResizeObserver].map(Observer => Observer.prototype as unknown as { observe(...args: unknown[]): void; disconnect(): void });
  const originals = observers.map(prototype => ({ observe: prototype.observe, disconnect: prototype.disconnect }));
  const { addEventListener, removeEventListener } = EventTarget.prototype;
  observers.forEach((prototype, index) => {
    prototype.observe = function (this: object, ...args: unknown[]) { observing.add(this); return originals[index]!.observe.apply(this, args); };
    prototype.disconnect = function (this: object) { observing.delete(this); return originals[index]!.disconnect.call(this); };
  });
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener && watched(this) && find(this, type, listener, options) < 0) listening.push([this, type, listener, capture(options)]);
    return addEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const index = find(this, type, listener, options);
    if (index >= 0) listening.splice(index, 1);
    return removeEventListener.call(this, type, listener, options);
  };
  let statuses = 0, mountError: string | null = null, mounted: ReturnType<typeof mountWorkerCanvasApp> | undefined;
  const options = { ordinaryHost, canvasHost, width: 200, height: 120, program: program as WorkerProgram, strict: true,
    onStatus: () => { statuses++; }, createWorker: () => new Worker(new URL("./thread.ts", import.meta.url), { type: "module" }) };
  try {
    try { mounted = mountWorkerCanvasApp(options, caught ? <Boundary><Throws /></Boundary> : <Throws />); }
    catch (error) { mountError = String(error); }
  } finally {
    observers.forEach((prototype, index) => Object.assign(prototype, originals[index]));
    Object.assign(EventTarget.prototype, { addEventListener, removeEventListener });
  }
  const left = { mountError, statuses, observers: observing.size, listeners: listening.map(([, type]) => type),
    hosts: [ordinaryHost.outerHTML, canvasHost.outerHTML], fallback: document.getElementById("first-render-fallback")?.textContent ?? null };
  if (mounted) await mounted.dispose();
  // The same hosts take a healthy application.
  const healthy = mountWorkerCanvasApp(options, <WorkerSurface id="first-render-healthy" layout={{ x: 10, y: 10, width: 100, height: 60 }}
    appearance={{ background: "rgb(245,196,41)" }}><button>Healthy</button></WorkerSurface>);
  const afterwards = healthy.state();
  const disposed = await healthy.dispose();
  frame.remove();
  return { ...left, afterwards: { mode: afterwards.mode, enrolledLayers: afterwards.enrolledLayers }, disposed: { mode: disposed.mode, resources: disposed.resources } };
}
// Worker controllers report `statistics()` asynchronously; the main-thread controller reports `state()`.
const getState = async () => ({ ...("statistics" in controller ? await controller.statistics() : controller.state()), commits, renders,
  focused: document.activeElement?.id });
const api = {
  version, domVersion, variant, controller,
  state: getState,
  enable: () => controller.enable(),
  disable: () => controller.disable(),
  dispose: () => controller.dispose(),
  structure: () => flushSync(() => changeStructure()),
  layout: () => flushSync(() => changeLayout()),
  settle: () => controller.settle(),
  firstRender,
  // Asks the controller to validate a moved surface and returns the error text plus layout before and after, to show nothing moved.
  fixedGeometryGuard() {
    if (!("validateSurface" in controller)) throw new Error("Worker fixture required");
    const before = document.getElementById("layer-0")!.getBoundingClientRect().toJSON();
    let reason: string | undefined;
    try { controller.validateSurface("layer-0", { x: 21, y: 20, width: 130, height: 130 }, false, "none"); }
    catch (error) { reason = String(error); }
    return { reason, before, after: document.getElementById("layer-0")!.getBoundingClientRect().toJSON() };
  },
  // Injects content the worker path must refuse (running animation, new control, picker, shifted geometry or unenrolled node).
  sourceFault(kind: string) {
    const decoration = document.getElementById("layer-1")!;
    if (kind === "animation") decoration.firstElementChild!.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: 1000, iterations: Infinity });
    else if (kind === "interactive") decoration.append(document.createElement("button"));
    else if (kind === "picker") {
      const input = document.createElement("input"); input.type = "color";
      document.getElementById("layer-0")!.append(input);
    } else if (kind === "geometry") document.getElementById("native-input")!.style.marginTop = "8px";
    else if (kind === "unenrolled") controller.container.append(document.createElement("div"));
    else throw new Error("Unknown synthetic worker source fault");
    controller.invalidate();
  },
  // Simulates a tab becoming hidden or visible by overriding `document.hidden` and firing `visibilitychange`.
  visibility(hidden: boolean) {
    if (hidden) Object.defineProperty(document, "hidden", { configurable: true, value: true });
    else Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  },
  // Measures frame intervals, long tasks and controller operations for a fixed window; `contention` adds busy React commits.
  async collect(milliseconds: number, contention: boolean) {
    if (!Number.isFinite(milliseconds) || milliseconds < 500 || milliseconds > 5000) throw new Error("Invalid benchmark duration");
    const before = await getState(), intervals: number[] = [];
    const longTasks: number[] = [];
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    observer.observe({ type: "longtask", buffered: false });
    operations.length = 0;
    let previous: number | undefined, timer: ReturnType<typeof setInterval> | undefined;
    const start = performance.now();
    // Every 80 ms commit a React update and block the main thread for 45 ms.
    if (contention) timer = setInterval(() => {
      flushSync(() => (window as unknown as { updateBusy(): void }).updateBusy());
      const until = performance.now() + 45;
      while (performance.now() < until) Math.sqrt(performance.now());
    }, 80);
    await new Promise<void>(resolve => {
      const frame = (now: number) => {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        if (performance.now() - start >= milliseconds) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    clearInterval(timer); observer.disconnect();
    return { before, after: await getState(), milliseconds: performance.now() - start, intervals, longTasks, operations: [...operations] };
  },
};
(window as unknown as { workerFixture: typeof api }).workerFixture = api;
// Wire the page's buttons to the same operations the tests call.
for (const key of ["enable", "disable", "dispose", "structure", "layout"] as const) {
  document.getElementById(key)!.onclick = () => { void api[key](); };
}
