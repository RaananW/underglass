/**
 * Core's custom parts on plain DOM (no UI framework), for `tests/browser/core-custom.test.mjs` and a headful look
 * (`docs/ui-library/instrument-phase2.md`, core work item 5). One enrolled panel of seventeen native range inputs, each with
 * an Instrument object of a base plate and a custom part (inline meshes and references to `public/custom/parts.glb`,
 * three of them failing on purpose; see `scene.ts`), a heading and a caption under each: the text the contrast guard
 * protects. The panel's material is `{ kind: "instrument", scene }` through the public `setMaterial`; a control's value
 * sets its object's `t` through `handle.update`, so poses never recapture.
 *
 * Query: `?material=0` starts with no material; `?map=off` draws no shadow map (darkness 1).
 *
 * `window.customCore.ready` resolves with the test API (see `api` below).
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type InstrumentObject, type InstrumentProfile, type InstrumentScene, type MaterialHandle } from "@underglass/core";
import { BOX, objectOf, SPECS, sceneOf, type Spec, type SceneOptions } from "./scene.ts";

const params = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const options: SceneOptions = { custom: true, casters: true, objects: true };
// Padding for the budget cases: pin parts (one tiny kind) or copies of the dense mesh.
const extras = { pins: 0, dense: 0 };
// The controls of the grid: every spec, or (the bench) `count` of one spec.
let layoutName: "grid" | "bench" = "grid";
let bench: { spec: Spec; count: number } | undefined;

let panel!: HTMLElement;
const stage = () => ({ width: frame.clientWidth, height: frame.clientHeight });

function layout() {
  const { width, height } = stage();
  panel.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Custom parts";
  heading.dataset.text = "";
  const grid = document.createElement("div");
  grid.className = "cc-grid";
  panel.append(heading, grid);
  if (layoutName === "grid") {
    Object.assign(panel.style, { left: "40px", top: "40px", width: "940px", height: "590px" });
    grid.style.gridTemplateColumns = "repeat(6, 150px)";
    grid.style.gridAutoRows = "170px";
  } else {
    Object.assign(panel.style, { left: "24px", top: "24px", width: `${width - 48}px`, height: `${height - 48}px` });
    grid.style.gridTemplateColumns = `repeat(${Math.floor((width - 80) / 116)}, 116px)`;
    grid.style.gridAutoRows = "112px";
  }
  const specs: Spec[] = layoutName === "grid" ? [...SPECS] : Array.from({ length: bench!.count }, () => bench!.spec);
  specs.forEach((spec, index) => {
    const cell = document.createElement("div");
    cell.className = "cc-cell";
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min: "0", max: "100", value: "50" });
    input.setAttribute("aria-label", `${spec} ${index + 1}`);
    Object.assign(input.style, { width: `${BOX}px`, height: `${BOX}px` });
    input.id = layoutName === "grid" ? `c-${spec}` : `b-${index}`;
    input.dataset.part = "control";
    input.dataset.spec = spec;
    cell.append(input);
    if (layoutName === "grid") {
      const caption = document.createElement("span");
      caption.className = "cc-caption";
      caption.dataset.text = "";
      caption.textContent = spec;
      cell.append(caption);
    }
    grid.append(cell);
  });
}

const hosts = createCanvasHosts(frame);
const controller: CanvasController = mountApplicationModule({ ...hosts, budgets: { layers: 4, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.dataset.core = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  panel = document.createElement("section");
  panel.id = "panel"; panel.className = "cc-panel"; panel.setAttribute("drawable", ""); panel.setAttribute("aria-label", "custom parts");
  container.append(panel);
  layout();
  const release = enroll({ id: "panel", element: panel, layout: {}, transform: {} });
  return () => { release(); container.replaceChildren(); };
} });

let scene: InstrumentScene | undefined;
let handle: MaterialHandle | undefined;
const ts = new Map<string, number>();
const tOf = (element: HTMLInputElement) => (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min));
const boxOf = (element: HTMLElement): [number, number, number, number] => {
  const box = element.getBoundingClientRect(), base = panel.getBoundingClientRect();
  return [box.left - base.left, box.top - base.top, box.width, box.height];
};

/** The scene from the DOM: one object per control, the padding, and the protected text. */
function build(): InstrumentScene {
  const size = stage(), profiles: Record<string, InstrumentProfile> = {};
  const objects: InstrumentObject[] = [];
  const inputs = [...panel.querySelectorAll<HTMLInputElement>("input[data-part]")];
  // The lamp's lens is the emitter's: one point light above its centre, on the parts only (`face: 0`).
  const emitters: NonNullable<InstrumentScene["emitters"]> = [];
  if (options.objects) for (const input of inputs) {
    const spec = input.dataset.spec as Spec, rect = boxOf(input);
    if (spec === "lamp") emitters.push({ position: [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2, 14], colour: [1, 0.62, 0.22], strength: 3200, radius: 120, reach: "outset", face: 0 });
    objects.push(objectOf(input.id, spec, rect, ts.get(input.id) ?? tOf(input), size, options, profiles, spec === "lamp" ? emitters.length - 1 : undefined));
  }
  // Padding for the budgets: copies of the dense mesh (triangles) and pins (parts), each in an object of its own.
  const dense = inputs.find(input => input.dataset.spec === "dense");
  if (options.objects && dense) for (let index = 0; index < extras.dense; index++) objects.push(objectOf(`dense-${index}`, "dense", boxOf(dense), 0, size, options, profiles));
  if (options.objects && extras.pins && inputs[0]) {
    profiles.pin = { type: "prism", width: 1, length: 1, radius: 0, height: 0.2 };
    const [x, y, w, h] = boxOf(inputs[0]);
    for (let left = extras.pins, index = 0; left > 0; index++) {
      const count = Math.min(64, left);
      left -= count;
      objects.push({ id: `pins-${index}`, rect: [x, y, w, h], bounds: { rect: [x, y, w, h], radius: 0 }, t: 0,
        parts: Array.from({ length: count }, (_, at): InstrumentPart => ({ kind: "pivot", profile: "pin", at: [x + w / 2 + (at % 8) - 4, y + h / 2 + Math.floor(at / 8) - 4, 0], material: "pin", caster: null })),
        relief: { face: "raised", rect: [x, y, w, h], radius: 0, height: 2, material: "pin" } });
    }
  }
  const base = panel.getBoundingClientRect();
  const text = [...panel.querySelectorAll<HTMLElement>("[data-text]")].map((element): [number, number, number, number] => {
    const box = element.getBoundingClientRect();
    return [Math.floor(box.left - base.left) - 1, Math.floor(box.top - base.top) - 1, Math.ceil(box.width) + 2, Math.ceil(box.height) + 2];
  });
  return sceneOf({ width: panel.offsetWidth, height: panel.offsetHeight }, objects, profiles, text, size, emitters);
}
type InstrumentPart = InstrumentObject["parts"][number];
function refresh() {
  scene = build();
  if (handle?.state().active) handle.update(scene);
  else handle = controller.setMaterial("panel", { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
}
/** Changes one object's `t` (poses: no capture, no layout). */
function pose(id: string, t: number) {
  if (!scene || !handle?.state().active) return;
  ts.set(id, t);
  scene = { ...scene, objects: scene.objects.map(object => (object.id === id ? { ...object, t } : object)) };
  handle.update(scene);
}
panel.addEventListener("input", event => { const input = event.target as HTMLInputElement; if (input.dataset.part) pose(input.id, tOf(input)); });

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; steppedDown: unknown[]; customParts: { status: string }[]; drawnParts: number; parts: number }[]; compile: { building: boolean } } | null };
const state = () => controller.state() as unknown as State;
/** Waits for core to settle and the instrument layer to finish building, then for three frames. */
async function settle(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    await controller.settle();
    const instrument = state().instrument;
    const pending = !!instrument && (instrument.compile.building || instrument.layers.some(layer => layer.status === "pending"));
    if (!pending && (!handle || !instrument || instrument.layers.length >= 1)) break;
    if (performance.now() > deadline) throw new Error(`The instrument layer did not settle: ${JSON.stringify(instrument?.layers.map(layer => [layer.id, layer.status]))}`);
    await nextFrame();
  }
  for (let index = 0; index < 3; index++) await nextFrame();
  describe();
}
/** Waits until no custom part is loading (then settles); resolves with the parts' states. */
async function loaded(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    const parts = state().instrument?.layers[0]?.customParts ?? [];
    if (parts.length && parts.every(part => part.status !== "loading")) break;
    if (performance.now() > deadline) throw new Error(`Custom parts still loading: ${JSON.stringify(parts)}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await settle();
  return state().instrument!.layers[0]!.customParts;
}
const counts = () => {
  const value = state() as unknown as { mode: string; reason: string; metrics: { captures: number; uploads: number; gpuFrames: number; geometryUpdates: number } };
  return { mode: value.mode, reason: value.reason, captures: value.metrics.captures, uploads: value.metrics.uploads, gpuFrames: value.metrics.gpuFrames, geometryUpdates: value.metrics.geometryUpdates };
};
function describe() {
  const layer = state().instrument?.layers[0];
  status.textContent = `instrument-custom-core: ${layer ? `${layer.status}, ${layer.customParts.map(part => part.status).join(" ")}` : "no layer"}\n${status.dataset.core ?? ""}`;
}
const controls = () => [...panel.querySelectorAll<HTMLElement>("input[data-part]")].map(element => {
  const box = element.getBoundingClientRect();
  return { id: element.id, spec: element.dataset.spec, x: box.left, y: box.top, width: box.width, height: box.height };
});
const panelBox = () => { const box = panel.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height, radius: 14 }; };
const texts = () => [...panel.querySelectorAll<HTMLElement>("[data-text]")].map(element => {
  const box = element.getBoundingClientRect();
  return { text: element.textContent, x: box.left, y: box.top, width: box.width, height: box.height };
});

/** Poses every control through a sine for `frames` frames; returns the counters and the cost over it. */
async function animate(frames: number) {
  await settle();
  const before = counts(), intervals: number[] = [], updates: number[] = [];
  const started = performance.now();
  let previous: number | undefined;
  for (let index = 0; index < frames; index++) {
    const now = await nextFrame();
    if (previous !== undefined) intervals.push(now - previous);
    previous = now;
    const at = performance.now();
    scene = { ...scene!, objects: scene!.objects.map((object, which) => ({ ...object, t: 0.5 + 0.5 * Math.sin(index / 12 + which) })) };
    handle!.update(scene);
    updates.push(performance.now() - at);
  }
  await nextFrame();
  const after = counts();
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
  const q = (values: number[], at: number) => sorted(values)[Math.floor(values.length * at)] ?? 0;
  const work = (state() as unknown as { metrics: { frameWorkMs: number[] } }).metrics.frameWorkMs.slice(-frames);
  const layer = (state().instrument as unknown as { layers: { gpu: { p50Ms: number | null; p95Ms: number | null; samples: number } }[] }).layers[0]!;
  return { frames, ms: performance.now() - started, captures: after.captures - before.captures, uploads: after.uploads - before.uploads, geometryUpdates: after.geometryUpdates - before.geometryUpdates,
    gpuFrames: after.gpuFrames - before.gpuFrames, mode: after.mode, reason: after.reason, intervalP50: q(intervals, 0.5), intervalP95: q(intervals, 0.95),
    updateP50: q(updates, 0.5), updateP95: q(updates, 0.95), frameWork: { p50: q(work, 0.5), p95: q(work, 0.95) }, gpu: { p50: layer.gpu.p50Ms, p95: layer.gpu.p95Ms, samples: layer.gpu.samples } };
}

const boot = { started: performance.now(), readyMs: 0, mode: "", reason: "" };
if (params.get("material") !== "0") refresh();
await controller.enable();
try { await settle(); } catch (error) { boot.reason = String(error); }
boot.readyMs = performance.now() - boot.started;
boot.mode = counts().mode;
if (!boot.reason) boot.reason = counts().reason;

const api = {
  dpr: devicePixelRatio,
  boot: () => ({ ...boot }),
  settle, loaded, counts, controls, texts, panel: panelBox,
  state: () => state(),
  instrument: () => state().instrument,
  /** The control (or the panel) native hit testing finds at each client point. */
  hits: (points: { x: number; y: number }[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.closest<HTMLElement>("section")?.id ?? hit?.id ?? ""; }),
  /** The scene's objects with every custom part (or only their base plates). */
  async setCustom(on: boolean) { options.custom = on; refresh(); await settle(); },
  /** The `fb-*` controls as the plain lathe cap their fallback is, or as they are. */
  async setParametric(on: boolean) { options.asParametric = on; refresh(); await settle(); },
  async setShadows(on: boolean) { options.casters = on; refresh(); await settle(); },
  /** No objects at all: the face only. */
  async setObjects(on: boolean) { options.objects = on; refresh(); await settle(); },
  /** An explicit caster for every custom part, or core's own again (undefined). */
  async setCaster(caster: SceneOptions["caster"]) { delete options.caster; if (caster !== undefined) options.caster = caster; refresh(); await settle(); },
  async pose(id: string, t: number) { pose(id, t); await settle(); },
  /** Poses every control to `t`. */
  async poseAll(t: number) { for (const control of controls()) ts.set(control.id, t); refresh(); await settle(); },
  animate,
  /** Hands core a scene with a bad mesh added; returns the message it threw, or null if it accepted it. */
  async tryUpdate(kind: "vertices" | "triangles" | "nan" | "degenerate" | "normals" | "bounds") {
    const good = scene!;
    const side = 130, grid: number[] = [], indices: number[] = [];
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) grid.push(x * 0.1, y * 0.1, 0);
    for (let y = 0; y + 1 < side; y++) for (let x = 0; x + 1 < side; x++) indices.push(y * side + x, y * side + x + 1, (y + 1) * side + x, y * side + x + 1, (y + 1) * side + x + 1, (y + 1) * side + x);
    const bad: Record<typeof kind, InstrumentProfile> = {
      vertices: { type: "mesh", positions: grid, indices: indices.slice(0, 30), normals: "compute" },
      triangles: { type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: Array.from({ length: 3 * 33000 }, (_, at) => at % 3), normals: "compute" },
      nan: { type: "mesh", positions: [0, 0, 0, 1, Number.NaN, 0, 0, 1, 0], indices: [0, 1, 2], normals: "compute" },
      degenerate: { type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 1], normals: "compute" },
      normals: { type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      bounds: { type: "mesh", positions: [0, 0, 0, 40, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: "compute", bounds: { low: [0, 0, 0], high: [1, 1, 1] } },
    };
    const first = good.objects[0]!;
    const next = { ...good, profiles: { ...good.profiles, bad: bad[kind] }, objects: [...good.objects, { ...first, id: "bad", parts: [{ ...first.parts[0]!, kind: "custom" as const, profile: "bad", material: "metal" }] }] };
    try { handle!.update(next as InstrumentScene); return { error: null }; }
    catch (error) { await settle(); return { error: String((error as Error).message) }; }
  },
  /** Pads the scene with pin parts to `total` parts (the layer's parts budget is 2,048). */
  async budget(total: number | null) {
    extras.pins = 0; extras.dense = 0; refresh(); await settle();
    const base = state().instrument!.layers[0]!.parts;
    extras.pins = total === null ? 0 : Math.max(0, total - base);
    refresh(); await settle();
    return state().instrument;
  },
  /** Adds `copies` more objects with the dense mesh (4,800 triangles each): the layer's custom-triangle budget is 1,000,000. */
  async triangles(copies: number) { extras.pins = 0; extras.dense = copies; refresh(); await settle(); return state().instrument; },
  /** `count` controls of one cap (the file's, or the parametric lathe of the same rings), for the cost comparison. */
  async bench(kind: "custom" | "parametric", count: number) {
    layoutName = "bench"; bench = { spec: kind === "custom" ? "cap" : "cap-lathe", count };
    extras.pins = 0; extras.dense = 0; ts.clear();
    layout(); refresh(); await settle();
    if (kind === "custom") await loaded();
    return state().instrument;
  },
  async grid() { layoutName = "grid"; bench = undefined; ts.clear(); layout(); refresh(); await settle(); },
  async disable() { await controller.disable(); return counts(); },
  async enable() { await controller.enable(); await settle(); return counts(); },
};
type CustomCoreApi = typeof api;
declare global { interface Window { customCore: { ready: Promise<CustomCoreApi> } } }
window.customCore = { ready: Promise.resolve(api) };
describe();
