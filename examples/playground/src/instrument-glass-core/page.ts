/**
 * Core's Instrument glass and capture probe on plain DOM (no UI framework), for `tests/browser/core-glass.test.mjs` and a
 * headful look (`docs/ui-library/instrument-phase2.md`, core work item 4). One enrolled panel over a patterned face:
 * - a **display**: a read-only text `<input>` over stripes, with a glass window over it (its text is the capture, exact);
 * - three **glass lens knobs** (`<input type="range">`) over printed target rings: clear with dispersion, clear without, amber;
 * - a **chrome knob** whose reflection of the page comes from the capture probe;
 * - a **glass plate** (a `<button>`) over a checkerboard;
 * - a **lamp** (`<input type="checkbox" role="switch">`) with a glass lens: lit it glows through its glass and blooms.
 * Faceplate prints and a paragraph stand beside the glass. Native state drives the poses and the light (`handle.update`,
 * `handle.setEmitters`), so neither recaptures.
 *
 * Query: `?glass=off` (the same parts as plain lacquer, the non-glass look), `?page=off` (no page probe), `?post=off`,
 * `?failProbe=1` and `?failGlass=1` (core's internal test hooks, not public API: the probe or the glass fails to build),
 * `?theme=dark`.
 *
 * `window.glassCore.ready` resolves with the test API (see `api` below).
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type InstrumentScene, type InstrumentObject, type InstrumentPart, type InstrumentProfile, type MaterialHandle } from "@underglass/core";

const params = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const options = { glass: params.get("glass") !== "off", page: params.get("page") !== "off", lights: true, casters: true, objects: true,
  /** The glass recipes' `reflection` (2D.6, default 1.5); 0 leaves no reflection. */
  reflection: 1.5,
  /** The glass recipes' index of refraction (1 leaves no Fresnel reflection and no refraction). */
  ior: 1.5,
  /** The faceplate and the display's field are translucent: the capture has texels with alpha below 1 under the window. */
  translucent: false,
  post: params.get("post") === "off" ? { smaa: false, bloom: false } as InstrumentScene["post"] : undefined };
const DISTANCE = 2400;
const round = (value: number) => Math.round(value * 100) / 100;
const lathe = (points: [number, number, number, number][], segments = 64): InstrumentProfile => ({ type: "lathe", points, segments });
const prism = (width: number, length: number, radius: number, height: number, chamfer = 0): InstrumentProfile =>
  ({ type: "prism", width, length, radius: Math.min(radius, width / 2, length / 2), height, chamfer });
/** A plano-convex lens of radius `r` and height `h` standing on z = 0: a 2 px wall and an elliptical dome (2D.6's lens). */
function lens(r: number, h: number): InstrumentProfile {
  const wall = 2, dome = h - wall;
  const arc = Array.from({ length: 13 }, (_, i): [number, number, number, number] => {
    const a = (i / 12) * (Math.PI / 2), n = Math.hypot(Math.cos(a) / r, Math.sin(a) / dome);
    return [round(r * Math.cos(a)), round(wall + dome * Math.sin(a)), round(Math.cos(a) / r / n), round(Math.sin(a) / dome / n)];
  });
  return lathe([[r, 0, 1, 0], ...arc], 96);
}
/** The box rule's margin for a part this tall on a 1920 × 1080 stage (I0.2): `ceil(drift + 1)`. */
const margin = (height: number) => Math.ceil((Math.hypot(1920, 1080) / 2 * height) / (DISTANCE - height) + 1);

const materials: InstrumentScene["materials"] = {
  face: { base: { roughness: 1 } },
  polished: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 0.2 } },
  chrome: { base: { colour: "#f2f3f5", metallic: 1, roughness: 0.06, direct: 0.2 } },
  glass: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#d6ede6", absorption: 0.03, reflection: 1.5 }, dispersion: { strength: 0.2 } },
  clear: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#d6ede6", absorption: 0.03, reflection: 1.5 } },
  amber: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: [1, 0.78, 0.45], absorption: 0.05, reflection: 1.5 }, dispersion: { strength: 0.1 } },
  pane: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#d6ede6", absorption: 0.03, reflection: 1.5 } },
  // The non-glass look (`?glass=off`): the same parts as an opaque pale lacquer.
  frost: { base: { colour: "#c9ced6", roughness: 0.35 }, coat: { strength: 1, roughness: 0.05, ior: 1.5 } },
};
const glassMaterials = new Set(["glass", "clear", "amber", "pane"]);

let panel!: HTMLElement;
const stage = () => ({ width: frame.clientWidth, height: frame.clientHeight });
const rectOf = (element: Element): [number, number, number, number] => {
  const box = element.getBoundingClientRect(), base = panel.getBoundingClientRect();
  return [box.left - base.left, box.top - base.top, box.width, box.height];
};
function add<T extends HTMLElement>(tag: string, attributes: Record<string, string>, style: Partial<CSSStyleDeclaration>, text?: string): T {
  const element = document.createElement(tag) as T;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  Object.assign(element.style, style);
  if (text) element.textContent = text;
  panel.append(element);
  return element;
}
const px = (x: number, y: number, w?: number, h?: number) => ({ left: `${x}px`, top: `${y}px`, ...(w ? { width: `${w}px`, height: `${h}px` } : {}) });
function build() {
  panel.className = "igc-panel";
  add("div", { class: "igc-stripes" }, {});
  add("div", { class: "igc-checks" }, {});
  const display = add<HTMLInputElement>("input", { id: "display", type: "text", readonly: "", "aria-label": "Display", "data-part": "display", value: "440.00 Hz  -3 dB" }, {});
  display.value = "440.00 Hz  -3 dB";
  const knobs = [["k1", 40, "K1 DISPERSION"], ["k2", 190, "K2 CLEAR"], ["k3", 340, "K3 AMBER"]] as const;
  for (const [id, x, label] of knobs) {
    add("div", { class: "igc-ring" }, px(x, 190));
    const input = add<HTMLInputElement>("input", { id, type: "range", min: "0", max: "100", value: "50", "aria-label": label, "data-part": "lens-knob" }, { ...px(x, 190, 100, 100) });
    input.value = "50";
    add("span", { class: "igc-print", id: `${id}-print` }, px(x, 300), label);
  }
  const chrome = add<HTMLInputElement>("input", { id: "chrome", type: "range", min: "0", max: "100", value: "30", "aria-label": "Chrome", "data-part": "chrome-knob" }, px(490, 190, 100, 100));
  chrome.value = "30";
  add("span", { class: "igc-print", id: "chrome-print" }, px(490, 300), "CHROME");
  const lamp = add<HTMLInputElement>("input", { id: "lamp", type: "checkbox", role: "switch", "aria-label": "Lamp", "data-part": "lamp" }, px(640, 208, 64, 64));
  lamp.checked = true;
  add("span", { class: "igc-print", id: "lamp-print" }, px(640, 300), "LAMP");
  add("button", { id: "plate", type: "button", "aria-label": "Plate", "data-part": "plate" }, px(535, 40, 190, 96));
  add("span", { class: "igc-print", id: "plate-print" }, px(520, 150), "PLATE OVER CHECKS");
  add("span", { class: "igc-print", id: "display-print" }, px(24, 122), "DISPLAY OVER STRIPES");
  add("span", { class: "igc-print", id: "beside" }, { ...px(24, 346), font: "13px/16px system-ui" },
    "Text beside the glass stays plain ink on the faceplate: the glass never reaches it.");
  add("span", { class: "igc-print", id: "below" }, { ...px(24, 380), font: "13px/16px system-ui" }, "Capture refresh: nothing here changes unless a test types into the display.");
}

/** The rects of text the glass must leave alone (layer px): the prints, and the display's text run. */
function protectedRects(): [number, number, number, number][] {
  const rects = [...panel.querySelectorAll<HTMLElement>(".igc-print")].map(element => rectOf(element));
  const display = rectOf(document.getElementById("display")!);
  rects.push([display[0] + 20, display[1] + 14, display[2] - 40, display[3] - 28]);
  return rects;
}
function emittersOf() {
  const lamp = document.getElementById("lamp") as HTMLInputElement, [x, y, w, h] = rectOf(lamp);
  return [{ position: [x + w / 2, y + h / 2, 34] as [number, number, number], colour: [1, 0.62, 0.22] as [number, number, number], strength: options.lights && lamp.checked ? 2400 : 0, radius: 150, reach: "outset" as const, face: 1 }];
}

function sceneOf(): InstrumentScene {
  const { width, height } = stage();
  const profiles: Record<string, InstrumentProfile> = {};
  const profile = (name: string, shape: InstrumentProfile) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
  const objects: InstrumentObject[] = [];
  const caster = options.casters ? {} : { caster: null };
  // A glass part, or (with `?glass=off`) the same shape as an opaque lacquer.
  const glassy = (part: InstrumentPart): InstrumentPart => {
    if (options.glass || !glassMaterials.has(part.material)) return part;
    const { glass: _glass, stand: _stand, finish: _finish, ...plain } = part;
    return { ...plain, material: "frost" };
  };
  const object = (id: string, rect: [number, number, number, number], radius: number, t: number, parts: InstrumentPart[], face: "knob" | "raised") =>
    objects.push({ id, rect, bounds: { rect, radius }, t, parts: parts.map(glassy), relief: { face, rect, radius, height: 0, material: "face" } });
  const display = rectOf(document.getElementById("display")!), m = margin(2.4);
  object("display", display, 8, 0, [{ kind: "window", profile: profile("display", prism(round(display[2] - 2 * m), round(display[3] - 2 * m), 6, 2.4, 2.2)),
    at: [display[0] + display[2] / 2, display[1] + display[3] / 2, 0], material: "pane", glass: "window", finish: { band: 0.3, horizon: 0.25 }, caster: null }], "raised");
  const plate = rectOf(document.getElementById("plate")!), mp = margin(3);
  object("plate", plate, 10, 0, [{ kind: "window", profile: profile("plate", prism(round(plate[2] - 2 * mp), round(plate[3] - 2 * mp), 8, 3, 2.5)),
    at: [plate[0] + plate[2] / 2, plate[1] + plate[3] / 2, 0], material: "pane", glass: "window", finish: true, ...caster }], "raised");
  for (const [id, name] of [["k1", "glass"], ["k2", "clear"], ["k3", "amber"]] as const) {
    const element = document.getElementById(id) as HTMLInputElement, rect = rectOf(element), cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
    const t = (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min));
    const stand = profile("stand", lathe([[32, 0, 1, 0], [32, 2.5, 1, 0], [32, 2.5, 0, 1], [0, 2.5, 0, 1]]));
    object(id, rect, 50, t, [
      { kind: "skirt", profile: stand, at: [cx, cy, 0], material: "polished", ...caster },
      { kind: "lens", profile: profile("lens", lens(23, 22)), at: [cx, cy, 2.5], material: name, glass: "lens", stand: { radius: 32, colour: "#fafafb" }, caster: null },
    ], "knob");
  }
  {
    const element = document.getElementById("chrome") as HTMLInputElement, rect = rectOf(element), cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
    const dome = (r: number, h: number) => lathe([[r, 0, 1, 0], ...Array.from({ length: 7 }, (_, i): [number, number, number, number] => {
      const a = (i / 6) * (Math.PI / 2); return [round(r * Math.cos(a)), round(h * Math.sin(a)), round(Math.cos(a) / r), round(Math.sin(a) / h)];
    })], 48);
    object("chrome", rect, 50, Number(element.value) / 100, [
      { kind: "skirt", profile: profile("chrome-skirt", lathe([[36, 0, 1, 0], [36, 2.5, 1, 0], [36, 2.5, 0, 1], [0, 2.5, 0, 1]])), at: [cx, cy, 0], material: "chrome", ...caster },
      { kind: "cap", profile: profile("chrome-dome", dome(30, 16)), at: [cx, cy, 2.5], material: "chrome", ...caster },
    ], "knob");
  }
  {
    const element = document.getElementById("lamp")!, rect = rectOf(element), cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
    object("lamp", rect, 32, 0, [
      { kind: "bezel", profile: profile("bezel", lathe([[24, 0, 1, 0], [24, 3, 1, 0], [24, 3, 0, 1], [19, 3, 0, 1]], 48)), at: [cx, cy, 0], material: "polished", ...caster },
      { kind: "lens", profile: profile("lamp-lens", lens(19, 14)), at: [cx, cy, 3], material: "amber", glass: "lens", emitter: 0, caster: null },
    ], "knob");
  }
  return {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance: DISTANCE, vanish: [width / 2, height / 2] },
    environment: { source: "studio", strength: 1, ...(options.page ? {} : { page: { enabled: false } }) },
    extent: { width: panel.offsetWidth, height: panel.offsetHeight }, outset: { top: 16, right: 16, bottom: 16, left: 16 },
    backdrop: "#e3e5e9", light: { azimuth: 323, elevation: 41 },
    bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 }, interior: { max: 0.04 },
    state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: Object.fromEntries(Object.entries(materials).map(([name, recipe]) => [name, recipe.glass ? { ...recipe, glass: { ...recipe.glass, reflection: options.reflection, ior: options.ior } } : recipe])),
    primitives: [{ face: "raised", rect: [0, 0, panel.offsetWidth, panel.offsetHeight], radius: 14, height: 6, material: "face" }],
    profiles, objects: options.objects ? objects : [], emitters: emittersOf(), protected: protectedRects(),
    ...(options.post ? { post: options.post } : {}),
  };
}

const hosts = createCanvasHosts(frame);
const failProbe = params.get("failProbe") === "1", failGlass = params.get("failGlass") === "1";
let failRefresh = false;
const runtimeOptions = { ...hosts, budgets: { layers: 4, pixels: 4_000_000 },
  instrumentTestHook: { failProbe: () => failProbe, failGlass: () => failGlass, failProbeRefresh: () => failRefresh },
  onStatusChange: (value: { mode: string; reason: string }) => { status.dataset.core = `${value.mode}: ${value.reason}`; } };
const controller: CanvasController = mountApplicationModule(runtimeOptions, { mount({ container, enroll }) {
  panel = document.createElement("section");
  panel.id = "glass"; panel.setAttribute("drawable", ""); panel.setAttribute("aria-label", "glass panel");
  container.append(panel);
  build();
  const release = enroll({ id: panel.id, element: panel, layout: {}, transform: {} });
  return () => { release(); container.replaceChildren(); };
} });

let scene: InstrumentScene;
let handle: MaterialHandle | undefined;
function refresh() {
  // A translucent faceplate: every texel under the window has alpha below 1 (the glyphs' edges and the field's 0.6 included).
  document.getElementById("display")!.style.background = options.translucent ? "rgba(18, 38, 24, 0.6)" : "";
  panel.style.background = options.translucent ? "rgba(223, 225, 229, 0.55)" : "";
  panel.querySelector<HTMLElement>(".igc-stripes")!.style.opacity = options.translucent ? "0.5" : "";
  scene = sceneOf();
  if (handle?.state().active) handle.update(scene);
  else handle = controller.setMaterial(panel.id, { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
}
function pose(id: string) {
  const element = document.getElementById(id) as HTMLInputElement;
  const t = (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min));
  scene = { ...scene, objects: scene.objects.map(object => (object.id === id ? { ...object, t } : object)) };
  handle?.update(scene);
}
for (const id of ["k1", "k2", "k3", "chrome"]) document.getElementById(id)!.addEventListener("input", () => pose(id));
document.getElementById("lamp")!.addEventListener("change", () => { const emitters = emittersOf(); scene = { ...scene, emitters }; handle?.setEmitters(emitters); });
refresh();
await controller.enable();

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; steppedDown: { object: string; reason: string }[];
  probe: { status: string; reason?: string; size?: number; refreshes?: number; gpuMs?: { p50Ms: number | null; p95Ms: number | null; samples: number } } | null; glass: { status: string; error?: string } | null;
  gpu: { p50Ms: number | null; p95Ms: number | null } }[]; compile: { building: boolean }; probes: { budget: number; live: number; builds: number; failures: number; refreshes: number; bytes: number };
  post: { layers: { stages: Record<string, { status: string }>; gpu: Record<string, { p50Ms: number | null; p95Ms: number | null; samples: number }> }[] } } | null };
const state = () => controller.state() as unknown as State;
async function settle(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    await controller.settle();
    const instrument = state().instrument;
    if (instrument && !instrument.compile.building && instrument.layers.length && instrument.layers.every(layer => layer.status !== "pending")) break;
    if (performance.now() > deadline) throw new Error(`Instrument layers did not settle: ${JSON.stringify(instrument?.layers.map(layer => [layer.id, layer.status]))}`);
    await nextFrame();
  }
  for (let index = 0; index < 3; index++) await nextFrame();
  status.textContent = `instrument-glass-core\n${status.dataset.core ?? ""}\n${state().instrument?.layers.map(layer => `${layer.id}: ${layer.status}; probe ${layer.probe?.status}; glass ${layer.glass?.status}`).join("\n")}`;
}
const counts = () => {
  const value = state() as unknown as { mode: string; reason: string; metrics: { captures: number; uploads: number; gpuFrames: number; geometryUpdates: number } };
  return { mode: value.mode, reason: value.reason, captures: value.metrics.captures, uploads: value.metrics.uploads, gpuFrames: value.metrics.gpuFrames, geometryUpdates: value.metrics.geometryUpdates };
};
const client = (element: Element) => { const box = element.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
try { await settle(); } catch (error) { status.textContent = String(error); }

const api = {
  dpr: () => devicePixelRatio,
  settle, counts, state: () => state(), instrument: () => state().instrument,
  controls: () => [...panel.querySelectorAll<HTMLElement>("[data-part]")].map(element => ({ id: element.id, kind: element.dataset.part, ...client(element), radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 })),
  panel: () => client(panel),
  labels: () => [...panel.querySelectorAll<HTMLElement>(".igc-print")].map(element => ({ id: element.id, ...client(element) })),
  /** The display's text run (the glass leaves it exact) and the stripes and rings under the glass, in client px. */
  patterns: () => ({ text: (() => { const d = client(document.getElementById("display")!); return { x: d.x + 20, y: d.y + 14, width: d.width - 40, height: d.height - 28 }; })(),
    stripes: client(panel.querySelector(".igc-stripes")!), checks: client(panel.querySelector(".igc-checks")!), rings: [...panel.querySelectorAll(".igc-ring")].map(client) }),
  hits: (points: { x: number; y: number }[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? ""; }),
  /** Rebuilds the scene from the DOM with other options and waits for the frame. */
  async set(next: Partial<typeof options>) { Object.assign(options, next); refresh(); await settle(); },
  /** Makes the next probe refresh throw (core's internal test hook). */
  setFailRefresh(on: boolean) { failRefresh = on; },
  async setLamp(on: boolean) { const lamp = document.getElementById("lamp") as HTMLInputElement; lamp.checked = on; lamp.dispatchEvent(new Event("change", { bubbles: true })); await settle(); },
  /** Types into the display (a real capture of the panel): returns the counters. */
  async retext(value: string) { const display = document.getElementById("display") as HTMLInputElement; display.value = value; await settle(); },
  /** `frames` frames with the pointer-light-like uniform writes only (setEmitters) and the knobs posed: no capture may follow. */
  async idle(frames: number) {
    await settle();
    const before = counts(), probe = state().instrument?.probes.refreshes ?? 0;
    for (let index = 0; index < frames; index++) {
      await nextFrame();
      const emitters = emittersOf().map(entry => ({ ...entry, position: [entry.position[0] + (index % 7), entry.position[1], entry.position[2]] as [number, number, number] }));
      handle?.setEmitters(emitters);
      // Poses are scene data (`t`), not DOM state: a range input's value would repaint and recapture the panel.
      if (index % 3 === 0) { scene = { ...scene, objects: scene.objects.map(object => (object.id === "k1" ? { ...object, t: (20 + (index % 60)) / 100 } : object)) }; handle?.update(scene); }
    }
    await nextFrame();
    const after = counts();
    return { frames, captures: after.captures - before.captures, uploads: after.uploads - before.uploads, geometryUpdates: after.geometryUpdates - before.geometryUpdates,
      gpuFrames: after.gpuFrames - before.gpuFrames, probeRefreshes: (state().instrument?.probes.refreshes ?? 0) - probe, mode: after.mode, reason: after.reason };
  },
  /** Moves the panel a little every frame for `frames` frames (transforms only: no capture); returns the probe's refreshes over it. */
  async drag(frames: number, step = 1.5) {
    await settle();
    const before = state().instrument?.probes.refreshes ?? 0, started = performance.now();
    for (let index = 1; index <= frames; index++) { controller.setTransform(panel.id, { x: index * step, y: index * step * 0.5 }); await nextFrame(); }
    return { frames, elapsedMs: performance.now() - started, refreshes: (state().instrument?.probes.refreshes ?? 0) - before, x: frames * step, y: frames * step * 0.5 };
  },
  /** After a DPR change (CDP fires no resize here): a controller operation makes core reconcile the backing grid. */
  async render() { controller.setTransform(panel.id, { opacity: 0.999 }); await settle(); controller.setTransform(panel.id, { opacity: 1 }); refresh(); await settle(); },
  async move(x: number, y: number) { controller.setTransform(panel.id, { x, y }); await settle(); },
  async setOpacity(opacity: number) { controller.setTransform(panel.id, { opacity }); await settle(); },
};
type GlassCoreApi = typeof api;
declare global { interface Window { glassCore: { ready: Promise<GlassCoreApi> } } }
window.glassCore = { ready: Promise.resolve(api) };
