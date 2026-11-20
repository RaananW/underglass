/**
 * React application on `@underglass/react`: the shared framework-adapter app written with `Surface`, `Box` and
 * `useSurfaceRef`, mounted by `mountCanvasApp` with the adapter's own React root and updated only through React
 * state. It exposes `window.frameworkProbe` for `tests/helpers/framework-contract.mjs`; with `?cases` it also renders
 * the case layers and `Presence` layers that `frameworkCases` drives (see `framework-probe.ts`). `?strict` wraps the
 * tree in `StrictMode`.
 *
 * Probe updates are plain React updates made from outside React, as an application's own timers and network
 * callbacks make them: React commits them in a task and runs their passive effects later. Each resolves from a
 * passive effect of the commit that applied it.
 */
import { useEffect, useLayoutEffect, useState, version, type ReactNode } from "react";
import { mountCanvasApp, createCanvasHosts, Surface, Box, Presence, useSurfaceRef, type CanvasController, type TransitionResult } from "@underglass/react";
import {
  caseColor, caseGeometry, caseId, changed, initialCase, presenceMotion, withCases,
  type CaseCompletion, type CaseLayer, type CaseLayerState, type CaseProbe, type SecondMount,
} from "./framework-probe";

const swatches = { blue: "rgb(20, 120, 220)", yellow: "rgb(250, 200, 20)" };
const params = new URLSearchParams(location.search);
let mounts = 0, cleanups = 0;
// The app state as last committed, for `state()`.
const committed = { count: 0, name: "original", swatch: "blue" as "blue" | "yellow" };
const completions: CaseCompletion[] = [];

/** What the probe changes from outside React. */
interface Scene {
  extra: boolean;
  ref: CaseLayerState; surface: CaseLayerState;
  stage: { present: boolean; mounted: boolean }; host: { present: boolean; mounted: boolean };
}
const scene: Scene = {
  extra: false, ref: initialCase(), surface: initialCase(),
  stage: { present: true, mounted: true }, host: { present: true, mounted: true },
};
let setScene: (next: Scene) => void = () => { throw new Error("Not mounted"); };
// Resolvers of probe updates, called by the passive effect of the next commit.
const waiting: (() => void)[] = [];
/** Applies `change` to the scene with a plain React update and resolves after that commit's passive effects. */
function update(change: (current: Scene) => Scene) {
  const next = change(scene);
  Object.assign(scene, next);
  return new Promise<void>(resolve => { waiting.push(resolve); setScene({ ...next }); });
}
// React 19 reads `inert` as a boolean; React 18 passes it through as an attribute, where any string sets it.
const inert = (Number(version.split(".")[0]) >= 19 ? { inert: true } : { inert: "" }) as object;

function Counter({ id, label }: { id: string; label: string }) {
  const [clicks, setClicks] = useState(0);
  return <button id={`${id}-button`} type="button" onClick={() => setClicks(value => value + 1)}>{label} {clicks}</button>;
}
/** A case layer's content: its counting button, or a plain label while decorative. */
function CaseContent({ layer, state }: { layer: CaseLayer; state: CaseLayerState }) {
  return state.decorative ? <span>decorative</span> : <Counter id={layer} label={`${layer} g${state.generation}`} />;
}
const caseStyle = { padding: 8, boxSizing: "border-box", color: "white", fontSize: 12 } as const;
/** The `ref` case layer: the app's own section, enrolled by `useSurfaceRef`. */
function RefLayer({ state }: { state: CaseLayerState }) {
  const ref = useSurfaceRef<HTMLElement>({ id: caseId("ref", state), decorative: state.decorative });
  const { x, y, width, height } = caseGeometry.ref;
  return <section ref={ref} id="ref-layer" {...(state.decorative ? { ...inert, "aria-hidden": true } : {})}
    style={{ position: "absolute", left: x, top: y, width, height, background: caseColor(state), ...caseStyle }}>
    <CaseContent layer="ref" state={state} />
  </section>;
}
/** The `surface` case layer, rendered by `Surface`. */
function SurfaceLayer({ state }: { state: CaseLayerState }) {
  return <Surface id={caseId("surface", state)} decorative={state.decorative} layout={{ ...caseGeometry.surface, padding: 8 }}
    appearance={{ background: caseColor(state), color: "white", fontSize: 12 }}>
    <CaseContent layer="surface" state={state} />
  </Surface>;
}
const record = (presence: "stage" | "host") => ({ status, reason }: TransitionResult) => { completions.push({ status, reason, presence }); };
/** An enrolled section at `x` holding a `Presence` card of `background` (and, for the stage, a counting button). */
function PresenceLayer({ id, x, background, present, mounted, children }: {
  id: "stage" | "host"; x: number; background: string; present: boolean; mounted: boolean; children?: ReactNode;
}) {
  const ref = useSurfaceRef<HTMLElement>({ id });
  return <section ref={ref} id={id} style={{ position: "absolute", left: x, top: 270, width: 160, height: 130 }}>
    {mounted && <Presence id={id} present={present} enter={presenceMotion.enter} exit={presenceMotion.exit} onComplete={record(id)}>
      <div id={`${id}-card`} style={{ width: 160, height: 130, padding: 8, boxSizing: "border-box", background, color: "black", fontSize: 12 }}>{children}</div>
    </Presence>}
  </section>;
}
function Side({ onClick }: { onClick(): void }) {
  const side = useSurfaceRef<HTMLElement>({ id: "side" });
  return <section ref={side} id="side" style={{ position: "absolute", left: 340, top: 20, width: 160, height: 100, padding: 8, boxSizing: "border-box", background: "rgb(20,200,90)" }}>
    <button id="side-button" type="button" onClick={onClick}>Side</button>
  </section>;
}

function App() {
  const [current, set] = useState<Scene>(scene);
  setScene = set;
  const [count, setCount] = useState(0);
  const [name, setName] = useState("original");
  const [swatch, setSwatch] = useState<"blue" | "yellow">("blue");
  useLayoutEffect(() => { Object.assign(committed, { count, name, swatch }); });
  useEffect(() => { mounts++; return () => { cleanups++; }; }, []);
  // After every commit, once its passive effects have run, the probe updates it applied resolve.
  useEffect(() => { for (const resolve of waiting.splice(0)) resolve(); });
  return <>
    <Surface id="panel" layout={{ x: 20, y: 20, width: 280, height: 220, padding: 12 }} appearance={{ background: "rgb(240,30,60)", color: "black" }}>
      <Box layout={{ direction: "column", gap: 8 }}>
        <strong id="text">Original native controls</strong>
        <button id="count" type="button" onClick={() => setCount(value => value + 1)}>Count {count}</button>
        <input id="name" aria-label="Name" value={name} onChange={event => setName(event.target.value)} />
        <button id="toggle" type="button" onClick={() => setSwatch(value => value === "blue" ? "yellow" : "blue")}>Swap color</button>
      </Box>
      <div id="swatch" style={{ position: "absolute", right: 12, bottom: 12, width: 60, height: 40, background: swatches[swatch] }} />
    </Surface>
    <Side onClick={() => setCount(value => value + 1)} />
    {current.extra && <Surface id="extra" layout={{ x: 520, y: 20, width: 80, height: 40 }} appearance={{ background: "rgb(38,104,215)" }}>Extra</Surface>}
    {withCases && <>
      {current.ref.mounted && <RefLayer key={`ref-${current.ref.generation}`} state={current.ref} />}
      {current.surface.mounted && <SurfaceLayer key={`surface-${current.surface.generation}`} state={current.surface} />}
      <PresenceLayer id="stage" x={20} background="rgb(20,170,170)" {...current.stage}><Counter id="stage" label="stage" /></PresenceLayer>
      {current.host.mounted && <PresenceLayer id="host" x={220} background="rgb(220,120,20)" {...current.host} mounted />}
    </>}
  </>;
}

const host = (id: string) => document.getElementById(id)!;
const controller: CanvasController = mountCanvasApp({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  strict: params.has("strict"), onStatus: message => { host("status").textContent = message; },
}, <App />);

function Throws(): never { throw new Error("The application failed in its first render"); }
const secondLayer = <Surface id="second" layout={{ x: 10, y: 10, width: 100, height: 60 }} appearance={{ background: "rgb(240,30,60)" }}>Second</Surface>;
let secondHosts: ReturnType<typeof createCanvasHosts> | undefined;
async function mountSecond(kind: "throws" | "healthy"): Promise<SecondMount> {
  const frame = host("second");
  secondHosts ??= createCanvasHosts(frame);
  const before = frame.innerHTML;
  let error: string | null = null, second: CanvasController | undefined;
  try { second = mountCanvasApp({ ...secondHosts }, kind === "throws" ? <>{secondLayer}<Throws /></> : secondLayer); }
  catch (caught) { error = String(caught); }
  const after = frame.innerHTML, layers = second?.state().layers.map(layer => layer.id) ?? [];
  await second?.dispose();
  return { error, mounted: !!second, layers, before, after };
}

const originalRoot = controller.container, originalInput = document.getElementById("name");
// The React page's probe adds the React version to the shared contract's state.
const probe: CaseProbe & { state(): ReturnType<CaseProbe["state"]> & { react: string } } = {
  controller,
  state: () => ({
    ...controller.state(), framework: "react", react: version, ...committed, mounts, cleanups,
    sameRoot: controller.container === originalRoot, sameInput: document.getElementById("name") === originalInput,
  }),
  addLayer: () => update(current => ({ ...current, extra: true })),
  removeLayer: () => update(current => ({ ...current, extra: false })),
  get cases() { return { ref: { ...scene.ref }, surface: { ...scene.surface }, completions: completions.map(entry => ({ ...entry })) }; },
  changeLayer: (layer, change) => update(current => ({ ...current, [layer]: changed(current[layer], change) })),
  presence: (target, change) => update(current => ({ ...current,
    [target]: change === "unmount" ? { ...current[target], mounted: false } : { ...current[target], present: change === "show" } })),
  mountSecond,
  async dispose() { await controller.dispose(); return probe.state(); },
};
window.frameworkProbe = probe;
for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", probe.dispose]] as const) {
  host(id).addEventListener("click", () => { void operation().catch(error => { host("status").textContent = String(error); }); });
}
