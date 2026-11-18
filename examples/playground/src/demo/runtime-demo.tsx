/**
 * Entry for `runtime.html` (typed shared runtime and native interaction): the main specimen for the browser
 * suite. It renders typed `Surface`/`Box`/`NativeScroll` layers containing real controls (controlled and
 * uncontrolled inputs, nested components, a dialog and a popover in `NativeOverlay`) and exposes
 * `window.runtimeProbe` so tests can enable/disable GPU, animate a layer, set effects and materials and inspect state. Query flags change
 * the specimen: `?strict`, `?auto`, `?dom`, `?scroll`, `?clip`, `?childclip`, `?oversized`, `?zero`, `?nested`,
 * `?editing`, `?transparent`, `?budget`, `?many=N`, `?thirdId=`.
 */
import { Profiler, version, useState, useEffect, useRef, type ProfilerOnRenderCallback } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, defineEffect, Surface, Box, NativeOverlay, NativeScroll, type ApplicationEffect, type CanvasController, type EffectDescriptor, type EffectHandle, type MaterialDescriptor, type MaterialHandle, type ParameterRange, type Transform, type TransformOrigin } from "@underglass/react";

const params = new URLSearchParams(location.search);
const commits = { count: 0, mounts: 0, cleanups: 0 };
const profile: ProfilerOnRenderCallback = () => { commits.count++; };
// `controller` is set by `mount`; `actions` are cleanup functions for the page button listeners.
let controller!: CanvasController;
const actions: (() => void)[] = [];

// A nested component with its own state, used to check that React state survives GPU enable/disable.
function Counter() {
  const [value, setValue] = useState(0);
  return <button id="nested" onClick={() => setValue(value + 1)}>Nested {value}</button>;
}
// A second, untransformed layer next to the animated one.
function Stationary() {
  const [value, setValue] = useState(0);
  return <Surface id="stationary" layout={{ x: 380, y: 60, width: 140, height: 100, padding: 12 }}
    appearance={{ background: "rgb(20,200,90)", color: "black" }}>
    <button id="badge" onClick={() => setValue(value + 1)}>Badge {value}</button>
  </Surface>;
}
// The specimen. Early returns select reduced variants (`?transparent`, `?editing`); the default tree has
// the main `primary` layer, the `Stationary` layer, optional extra tiles and a conditional third layer.
function App() {
  const [name, setName] = useState("original");
  const [count, setCount] = useState(0);
  const [saved, setSaved] = useState("");
  const [child, setChild] = useState(true);
  const [third, setThird] = useState(false);
  const [scroll, setScroll] = useState(params.has("scroll"));
  const dialog = useRef<HTMLDialogElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => { commits.mounts++; return () => { commits.cleanups++; }; }, []);
  if (params.has("transparent")) return <Surface id="primary"
    layout={{ x: 40, y: 50, width: 260, height: 300 }} appearance={{ background: "transparent" }} />;
  if (params.has("editing")) return <>
    <Surface id="primary" layout={{ x: 40, y: 50, width: 260, height: 300, padding: 12 }}
      appearance={{ background: "rgb(240,30,60)", color: "black" }}>
      <label htmlFor="controlled">Name</label>
      <input id="controlled" value={name} onChange={event => setName(event.target.value)} />
      <label htmlFor="editor">Original multiline editor</label>
      <textarea id="editor" wrap="off" rows={2} style={{ display: "block", width: 175, height: 45 }} />
      <div id="native-viewport" tabIndex={0} style={{ width: 175, height: 60, overflow: "auto" }}>
        <div style={{ height: 160, background: "rgb(30,100,220)" }}>Viewport start</div>
        <button id="viewport-control" onClick={() => setCount(count + 1)}
          style={{ display: "block", width: 160, height: 55, background: "rgb(20,200,90)" }}>Viewport count {count}</button>
      </div>
      <button id="count" onClick={() => setCount(count + 1)}>Count {count}</button>
    </Surface>
    <Stationary />
  </>;
  return <>
    <Surface id="primary" layout={{
      x: 40, y: 50, width: params.has("oversized") ? 800 : params.has("zero") ? 0 : 260,
      height: 300, padding: 12,
      overflow: params.has("clip") ? "hidden" : scroll ? "scroll" : "visible",
    }} transform={params.has("oversized") ? { scaleX: 0.6 } : undefined}
      appearance={{ background: "rgb(240,30,60)", color: "black" }}>
      <Box layout={{ direction: "column", gap: 5, overflow: params.has("childclip") ? "hidden" : "visible" }}>
        <strong>Original native controls</strong>
        <button id="count" onClick={() => setCount(count + 1)}>Count {count}</button>
        <form onSubmit={event => { event.preventDefault(); setSaved(name); }}>
          <label htmlFor="controlled" id="name-label">Name</label>
          <input id="controlled" value={name} onChange={event => setName(event.target.value)} />
          <button id="submit">Save</button>
        </form>
        <input id="uncontrolled" aria-label="Native value" defaultValue="native" />
        <output id="saved">{saved || "Not saved"}</output>
        <Box layout={{ direction: "row", gap: 5 }}>
          <button id="toggle" onClick={() => setChild(!child)}>Child</button>
          {child && <Counter />}
        </Box>
        <button id="popover-open" onClick={() => popover.current!.showPopover()}>Popover</button>
        <Box layout={{ direction: "row", gap: 5 }}>
          <button id="third" onClick={() => setThird(!third)}>Layer</button>
          <button id="scroll-toggle" onClick={() => setScroll(!scroll)}>Scroll</button>
          <button id="dialog-open" onClick={() => dialog.current!.showModal()}>Dialog</button>
        </Box>
        {scroll && <NativeScroll id="scroller" layout={{ height: 70, width: 210 }}>
          <Box layout={{ height: 180 }} appearance={{ background: "rgb(40,90,200)" }}>Native wheel content</Box>
          <button id="scroll-tail" onClick={() => setCount(count + 1)}
            style={{ height: 55, width: 180, background: "rgb(20,200,90)" }}>Scroll count {count}</button>
        </NativeScroll>}
        {params.has("nested") && <Surface id="nested-layer" layout={{ width: 30, height: 30 }} appearance={{ background: "orange" }} />}
      </Box>
    </Surface>
    <Stationary />
    {Array.from({ length: Number(params.get("many") ?? 0) }, (_, index) => <Surface key={index} id={`tile-${index}`}
      layout={{ x: 20 + index * 50, y: 380, width: 40, height: 24 }} appearance={{ background: `hsl(${index * 30} 80% 45%)` }}
      transform={index === 11 ? { x: -25, opacity: 0.5 } : undefined} />)}
    {third && <Surface id={params.get("thirdId") ?? "third-layer"} layout={{ x: 400, y: 210, width: 100, height: 50 }}
      appearance={{ background: "rgb(30,100,220)" }}><button id="third-control">Third</button></Surface>}
    <NativeOverlay><dialog ref={dialog} id="dialog">
      <form method="dialog"><label htmlFor="dialog-input">Native overlay input</label><input id="dialog-input" defaultValue="overlay" />
        <button id="dialog-close">Close</button></form>
    </dialog><div ref={popover} {...{ popover: "auto" }} id="popover">
      <label htmlFor="popover-input">Native popover</label><input id="popover-input" defaultValue="popover" />
      <button id="popover-close" onClick={() => popover.current!.hidePopover()}>Close</button>
    </div></NativeOverlay>
  </>;
}
// Mounts the specimen. `?budget` forces tiny layer/pixel budgets to test enforcement.
function mount() {
  const tree = <Profiler id="typed-specimen" onRender={profile}><App /></Profiler>;
  controller = mountCanvasApp({
    captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
    outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
    ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!,
    overlayHost: document.querySelector<HTMLElement>("#overlay")!,
    createRoot, flushSync,
    strict: params.has("strict"),
    admissionPolicy: params.has("auto") ? "automatic" : "explicit",
    budgets: params.has("budget") ? { layers: 1, pixels: 100000 } : undefined,
    onStatus(message) { document.querySelector<HTMLElement>("#status")!.textContent = message; },
  }, tree);
}
// Controller state plus React version, commit counters and a snapshot of native control state (values, focus,
// selection) so tests can show it is unchanged by GPU transitions.
function state() {
  const input = document.querySelector<HTMLInputElement>("#controlled");
  const native = document.querySelector<HTMLInputElement>("#uncontrolled");
  return { ...controller.state(), reactVersion: version, commits: { ...commits }, native: { controlled: input?.value,
    uncontrolled: native?.value, focus: document.activeElement?.id, selection: [input?.selectionStart, input?.selectionEnd],
    count: document.querySelector("#count")?.textContent, nested: document.querySelector("#nested")?.textContent,
  }, demoListeners: actions.length };
}
// Settles, then animates the `primary` layer to `target` over `frames` frames; returns state before and after.
async function animate(target: Transform = { x: 45, rotation: 10, scaleX: 0.9, scaleY: 0.9 }, frames = 300) {
  await controller.settle();
  const before = state();
  const interval = await controller.animate("primary", target, frames);
  return { before: { ...interval.before, commits: before.commits }, after: state() };
}
// Disposes the controller and button listeners, then returns the final state.
async function dispose() {
  await controller.dispose();
  for (const remove of actions.splice(0)) remove();
  return state();
}
// HMR: wait for the previous module's disposal, then recreate the capture/output canvases if missing.
const priorDisposal: unknown = import.meta.hot?.data.disposal;
if (priorDisposal instanceof Promise) {
  await priorDisposal;
  const frame = document.querySelector("#frame")!;
  for (const id of ["capture", "output"]) {
    if (!document.getElementById(id)) {
      const canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.hidden = true;
      frame.insertBefore(canvas, document.querySelector("#ordinary"));
    }
  }
}
mount();
// Test hook. `cycle` disposes the page, rebuilds its canvases, mounts again and re-enables GPU.
window.runtimeProbe = { state, animate, dispose,
  enable: () => controller.enable(), disable: () => controller.disable(), settle: () => controller.settle(),
  transform: (id: string, transform: Transform) => controller.setTransform(id, transform),
  origin: (id: string, origin?: TransformOrigin) => controller.setOrigin(id, origin),
  effects: (id: string, chain: EffectDescriptor[]) => controller.setEffects(id, chain),
  material: (id: string, material: MaterialDescriptor) => controller.setMaterial(id, material),
  // Trusted test WGSL for custom effects and materials, one parameter `strength` unless `parameters` says otherwise.
  define: (name: string, wgsl: string, parameters: Record<string, ParameterRange> = { strength: { min: -4, max: 4 } }, geometry: ApplicationEffect["geometry"] = "color") =>
    defineEffect({ name, wgsl, parameters, geometry, bounds: "layer", capabilities: ["webgpu"] }),
  invalidate: (id?: string) => controller.invalidate(id),
  async cycle() {
    const retired = await dispose();
    const frame = document.querySelector("#frame")!;
    for (const id of ["capture", "output"]) {
      const canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.hidden = true;
      frame.insertBefore(canvas, document.querySelector("#ordinary"));
    }
    mount();
    await controller.enable();
    installActions();
    return { retired, active: state() };
  },
};
// Wire the Enable / Disable / Move / Dispose buttons.
function installActions() {
  for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()],
    ["move", () => animate()], ["dispose", dispose]] as const) {
    const element = document.getElementById(id)!;
    const listener = () => { void operation().catch(error => {
      document.querySelector<HTMLElement>("#status")!.textContent += `\nAction failed: ${String(error)}`;
      console.error(error);
    }); };
    element.addEventListener("click", listener);
    actions.push(() => element.removeEventListener("click", listener));
  }
}
installActions();
// GPU is on by default; `?dom` leaves the ordinary DOM.
if (!params.has("dom")) void controller.enable().catch(error => {
  document.querySelector<HTMLElement>("#status")!.textContent += `\nStartup failed: ${String(error)}`;
  console.error(error);
});
if (import.meta.hot) {
  const hot = import.meta.hot;
  import.meta.hot.accept();
  hot.dispose(() => {
    const disposal = dispose();
    hot.data.disposal = disposal;
    void disposal.catch(error => console.error("HMR disposal retained resources or failed", error));
  });
}

declare global {
  interface Window { runtimeProbe: {
    state: typeof state; animate: typeof animate; dispose: typeof dispose;
    cycle(): Promise<{ retired: ReturnType<typeof state>; active: ReturnType<typeof state> }>;
    enable(): ReturnType<CanvasController["enable"]>; disable(): ReturnType<CanvasController["disable"]>;
    settle(): Promise<void>; transform(id: string, transform: Transform): void;
    origin(id: string, origin?: TransformOrigin): void; invalidate(id?: string): void;
    effects(id: string, chain: EffectDescriptor[]): EffectHandle;
    material(id: string, material: MaterialDescriptor): MaterialHandle;
    define(name: string, wgsl: string, parameters?: Record<string, ParameterRange>): ApplicationEffect;
  } }
}
