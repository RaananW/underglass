/**
 * Core's Instrument post chain on plain DOM (no UI framework), for `tests/browser/core-post.test.mjs` and a headful look
 * (`docs/ui-library/instrument-phase2.md`, core work item 3). Three enrolled panels of real native controls, each cell
 * with a printed faceplate label:
 * - `#lower` fills the window; `#upper` overlaps it, its left edge across one of the lower panel's knobs;
 * - `#clipped` sits in `#viewport`, a non-enrolled `overflow: hidden` box narrower than the panel, so core clips the
 *   layer at the viewport's edge, across one of its lamps (whose bloom must stop at the clip).
 * Controls: knobs, faders, switches, keys (with a captured label and an LED on the cap's corner, lit while latched),
 * lamps (lit while checked), bats (a lever thrown over its plate: the map's lever-on-plate case) and thin plates (a 2 px
 * plate on a plinth: the map's thin-plate case). Each panel's material is `{ kind: "instrument", scene }` through the
 * public `setMaterial`; native state sets each object's `t` through `handle.update`, and lights through
 * `handle.setEmitters`, so neither recaptures.
 *
 * Query: `?density=n` (controls over the two large panels, default 250), `?theme=dark`, `?post=taa,contact,ssgi` (the
 * options on), `?post=off` (every stage off), `?map=off`, `?race=1` (right after `enable`, a fourth layer with a relief
 * material joins while the scenes build), `?fail=<stage>` (core's internal test hook, not public API, makes that stage's
 * creation throw; `composite` fails the chain itself).
 *
 * `window.postCore.ready` resolves with the test API (see `api` below).
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type InstrumentScene, type MaterialHandle } from "@underglass/core";
import { litOf, panelEmitters, panelScene, themes, travelOf, type ControlKind, type SceneOptions, type Theme } from "./scene.ts";

const params = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
let theme: Theme = themes[params.get("theme") === "dark" ? "dark" : "light"];
let density = Math.max(10, Number(params.get("density") ?? 250));
// I0.8's repeat of 25, with bats and thin plates: 6 knobs, 6 keys, 3 faders, 4 switches, 2 lamps, 2 bats, 2 plates.
const pattern: ControlKind[] = ["knob", "key", "fader", "switch", "knob", "lamp", "key", "bat", "knob", "switch", "key", "thin", "fader",
  "knob", "key", "switch", "bat", "knob", "key", "fader", "lamp", "switch", "knob", "thin", "key"];
const prefix: Record<ControlKind, string> = { knob: "N", fader: "F", key: "K", switch: "S", lamp: "L", bat: "B", thin: "P" };
const pressed = new Set<HTMLElement>();
const queryPost = params.get("post");
const options: { meshes: boolean; casters: boolean; plain: boolean; lights: boolean; post?: InstrumentScene["post"]; map?: SceneOptions["map"] } = {
  meshes: true, casters: true, plain: false, lights: true,
  post: queryPost === "off" ? { smaa: false, bloom: false, taa: false, contact: false, ssgi: false }
    : queryPost ? Object.fromEntries(queryPost.split(",").map(stage => [stage.trim(), true])) : undefined,
  map: params.get("map") === "off" ? { darkness: 1 } : undefined,
};

let lower!: HTMLElement, upper!: HTMLElement, viewport!: HTMLElement, clipped!: HTMLElement;
const panels = () => [lower, upper, clipped];
const stage = () => ({ width: frame.clientWidth, height: frame.clientHeight });

/** The largest cell edge that fits `count` cells in a `width` × `height` area. */
function fitCell(width: number, height: number, count: number) {
  let cell = Math.max(8, Math.floor(Math.sqrt((width * height) / Math.max(1, count))));
  while (cell > 8 && Math.floor(width / cell) * Math.floor(height / cell) < count) cell--;
  return cell;
}
/** Fills `panel` with `count` controls of `kinds` from `first`, in cells of `cell` px (fitted when omitted). */
function fill(panel: HTMLElement, count: number, first: number, title: string, kinds: readonly ControlKind[] = pattern, cell?: number) {
  panel.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "ipc-grid";
  panel.append(heading, grid);
  const width = panel.clientWidth - 32, height = panel.clientHeight - 24 - 26;
  const size = cell ?? fitCell(width, height, count), area = size - 14;
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.floor(width / size))}, ${size}px)`;
  grid.style.gridAutoRows = `${size}px`;
  for (let index = 0; index < count; index++) {
    const kind = kinds[(first + index) % kinds.length]!;
    const wrapper = document.createElement("div");
    wrapper.className = "ipc-cell";
    let control: HTMLElement;
    const square = (side: number) => ({ width: `${side}px`, height: `${side}px`, borderRadius: "50%" });
    if (kind === "knob" || kind === "fader") {
      const input = document.createElement("input");
      Object.assign(input, { type: "range", min: "0", max: "100", value: String((index * 37 + 13) % 100) });
      input.setAttribute("aria-label", `${kind === "knob" ? "Knob" : "Fader"} ${index + 1}`);
      if (kind === "knob") Object.assign(input.style, square(Math.round(Math.min(size, area) * 0.8)));
      else { Object.assign(input.style, { width: `${Math.max(18, Math.round(size * 0.36))}px`, height: `${Math.round(area * 0.92)}px` }); input.setAttribute("aria-orientation", "vertical"); }
      control = input;
    } else if (kind === "key" || kind === "thin") {
      const button = document.createElement("button");
      button.type = "button";
      if (kind === "key") {
        const label = document.createElement("span");
        label.className = "ipc-label";
        label.textContent = `K${index + 1}`;
        button.append(label);
        // Every third key is latched: its LED is lit.
        button.dataset.latched = String(index % 3 === 0);
        Object.assign(button.style, { width: `${Math.round(size * 0.84)}px`, height: `${Math.round(area * 0.6)}px`, fontSize: `${Math.max(10, Math.round(size * 0.18))}px` });
      } else {
        button.setAttribute("aria-label", `Plate ${index + 1}`);
        Object.assign(button.style, { width: `${Math.round(size * 0.66)}px`, height: `${Math.round(area * 0.56)}px`, borderRadius: "4px" });
      }
      button.dataset.presses = "0";
      button.addEventListener("click", () => { button.dataset.presses = String(Number(button.dataset.presses) + 1); });
      control = button;
    } else {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("role", "switch");
      if (kind === "lamp") {
        input.checked = true;
        input.setAttribute("aria-label", `Lamp ${index + 1}`);
        Object.assign(input.style, square(Math.round(Math.min(size, area) * 0.86)));
      } else if (kind === "bat") {
        input.checked = index % 2 === 0;
        input.setAttribute("aria-label", `Bat ${index + 1}`);
        Object.assign(input.style, { width: `${Math.max(46, Math.round(size * 0.5))}px`, height: `${Math.max(56, Math.round(area * 0.96))}px`, borderRadius: "8px" });
      } else {
        input.checked = index % 3 === 0;
        input.setAttribute("aria-label", `Switch ${index + 1}`);
        const w = Math.max(34, Math.round(size * 0.62)), h = Math.max(18, Math.round(size * 0.32));
        Object.assign(input.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${h / 2}px` });
      }
      control = input;
    }
    control.id = `${panel.id}-${kind}-${index}`;
    control.dataset.part = kind;
    // Faceplate print: the control's short name, outside its box.
    const print = document.createElement("span");
    print.className = "ipc-print";
    print.id = `${control.id}-print`;
    print.textContent = `${prefix[kind]}${index + 1}`;
    wrapper.append(print, control);
    grid.append(wrapper);
  }
}
/** Lays out every panel; `count` controls over the lower and upper panels, six in the clipped one. */
function layout(count: number) {
  const { width, height } = stage();
  Object.assign(lower.style, { left: "16px", top: "16px", width: `${width - 32}px`, height: `${height - 32}px` });
  const upperSize = { width: Math.round(width * 0.34), height: Math.round(height * 0.42) };
  const areaLower = (width - 64) * (height - 82), areaUpper = (upperSize.width - 32) * (upperSize.height - 50);
  const upperCount = Math.max(5, Math.round((count * areaUpper) / (areaLower + areaUpper))), lowerCount = Math.max(1, count - upperCount);
  fill(lower, lowerCount, 0, "Lower panel: post chain over a relief face");
  // The upper panel's left edge crosses the knob nearest a point right of the centre.
  const knobs = [...lower.querySelectorAll<HTMLElement>("[data-part=knob]")];
  const target = { x: width * 0.5, y: height * 0.32 };
  const centre = (element: HTMLElement) => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2, top: box.top }; };
  const straddled = knobs.reduce((best, knob) => (Math.hypot(centre(knob).x - target.x, centre(knob).y - target.y) < Math.hypot(centre(best).x - target.x, centre(best).y - target.y) ? knob : best), knobs[0]!);
  const at = centre(straddled), frameBox = frame.getBoundingClientRect();
  const left = Math.round(at.x - frameBox.left), top = Math.max(24, Math.round(at.top - frameBox.top - 36));
  Object.assign(upper.style, { left: `${left}px`, top: `${top}px`, width: `${Math.min(upperSize.width, width - left - 24)}px`, height: `${Math.min(upperSize.height, height - top - 24)}px` });
  upper.dataset.straddles = straddled.id;
  fill(upper, upperCount, lowerCount, "Upper panel");
  // The clipped panel: 700 px wide in a 420 px viewport, its second lamp's centre on the viewport's right edge.
  Object.assign(viewport.style, { left: "48px", top: `${height - 48 - 150}px`, width: "420px", height: "150px" });
  Object.assign(clipped.style, { left: "0px", top: "0px", width: "700px", height: "150px" });
  fill(clipped, 6, 0, "Clipped panel", ["knob", "lamp", "key", "lamp", "switch", "fader"], 96);
  const lamp = [...clipped.querySelectorAll<HTMLElement>("[data-part=lamp]")].find(element => element.getBoundingClientRect().left - clipped.getBoundingClientRect().left > 300)
    ?? clipped.querySelector<HTMLElement>("[data-part=lamp]")!;
  const box = lamp.getBoundingClientRect(), base = clipped.getBoundingClientRect();
  clipped.querySelector<HTMLElement>(".ipc-grid")!.style.marginLeft = `${Math.round(420 - (box.left - base.left + box.width / 2))}px`;
  clipped.dataset.straddles = lamp.id;
}

const hosts = createCanvasHosts(frame);
const failing = params.get("fail");
// `?failRegistration=optional` (or `all`): core's internal test hook fails each scene's registration with its optional
// stages (or every registration, the minimal chain's too) while `failRegistration` is set (`api.setFailRegistration`).
let failRegistration = params.get("failRegistration") as "optional" | "all" | null;
const instrumentTestHook = failing || failRegistration ? {
  failStage: (_id: string, name: string) => name === failing,
  failRegistration: (_id: string, minimal: boolean) => failRegistration === "all" || failRegistration === "optional" && !minimal,
} : undefined;
const runtimeOptions = { ...hosts, budgets: { layers: 8, pixels: 4_000_000 }, instrumentTestHook,
  onStatusChange: (value: { mode: string; reason: string }) => { status.dataset.core = `${value.mode}: ${value.reason}`; } };
const controller: CanvasController = mountApplicationModule(runtimeOptions, { mount({ container, enroll }) {
  lower = document.createElement("section");
  upper = document.createElement("section");
  viewport = document.createElement("div");
  clipped = document.createElement("section");
  lower.id = "lower"; upper.id = "upper"; viewport.id = "viewport"; clipped.id = "clipped";
  for (const panel of [lower, upper, clipped]) { panel.className = "ipc-panel"; panel.setAttribute("drawable", ""); panel.setAttribute("aria-label", `${panel.id} panel`); }
  viewport.append(clipped);
  container.append(lower, upper, viewport);
  document.body.dataset.theme = theme.name;
  layout(density);
  const releases = [lower, upper, clipped].map(panel => enroll({ id: panel.id, element: panel, layout: {}, transform: {} }));
  return () => { for (const release of releases) release(); container.replaceChildren(); };
} });

const scenes = new Map<string, InstrumentScene>();
const handles = new Map<string, MaterialHandle>();
// Panels drawn with their face only (no objects), for pixel references.
const faceOnly = new Set<string>();
const sceneOf = (panel: HTMLElement) => panelScene(panel, theme, stage(), pressed,
  { casters: options.casters, objects: options.meshes && !faceOnly.has(panel.id), lights: options.lights, post: options.post, map: options.map });
/** Rebuilds a panel's scene from the DOM and hands it to core (`setMaterial` once, then `update`). */
function refresh(panel: HTMLElement) {
  if (options.plain) {
    handles.get(panel.id)?.cancel();
    handles.delete(panel.id);
    return;
  }
  const scene = sceneOf(panel);
  scenes.set(panel.id, scene);
  const handle = handles.get(panel.id);
  if (handle?.state().active) handle.update(scene);
  else handles.set(panel.id, controller.setMaterial(panel.id, { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" }));
}
const refreshAll = () => { for (const panel of panels()) refresh(panel); };
/** Changes one object's `t` without reading the DOM again (poses: no capture, no layout). */
function pose(panel: HTMLElement, id: string, t: number) {
  const scene = scenes.get(panel.id), handle = handles.get(panel.id);
  if (!scene || !handle?.state().active) return;
  const next = { ...scene, objects: scene.objects.map(object => (object.id === id ? { ...object, t } : object)) };
  scenes.set(panel.id, next);
  handle.update(next);
}
/** Writes a panel's lights from native state (`setEmitters`: uniform writes only). */
function relight(panel: HTMLElement) {
  const handle = handles.get(panel.id), scene = scenes.get(panel.id);
  if (!handle?.state().active || !scene) return;
  const emitters = panelEmitters(panel, stage(), options.lights);
  scenes.set(panel.id, { ...scene, emitters });
  handle.setEmitters(emitters);
}
// Native state drives the poses and the lights: a value, a check or a press changes `t` or an emitter only.
for (const panel of panels()) {
  const sync = (event: Event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-part]");
    if (!element || !panel.contains(element)) return;
    if (element.dataset.part === "lamp") relight(panel);
    else pose(panel, element.id, travelOf(element, pressed));
  };
  panel.addEventListener("input", sync);
  panel.addEventListener("change", sync);
  panel.addEventListener("pointerdown", event => { const key = (event.target as HTMLElement).closest<HTMLElement>("button[data-part]"); if (key) { pressed.add(key); sync(event); } });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) panel.addEventListener(type, event => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("button[data-part]");
    if (key && pressed.delete(key)) sync(event);
  }, true);
}
window.addEventListener("resize", () => { layout(density); refreshAll(); });

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
type PostState = { layers: { id: string; stages: Record<string, { status: string; error?: string }>; map: { renders: number; timedRenders: number } | null;
  gpu: Record<string, { p50Ms: number | null; p95Ms: number | null; samples: number; total: number }> }[] };
type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; steppedDown: { object: string; reason: string }[]; gpu: { p50Ms: number | null; p95Ms: number | null } }[];
  compile: { building: boolean }; post: PostState } | null };
const state = () => controller.state() as unknown as State;
/** Waits for core to settle and every instrument layer to finish building, then for three frames. */
async function settle(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    await controller.settle();
    const instrument = state().instrument;
    const pending = !!instrument && (instrument.compile.building || instrument.layers.some(layer => layer.status === "pending"));
    if (!pending && (options.plain || !instrument || instrument.layers.length >= handles.size)) break;
    if (performance.now() > deadline) throw new Error(`Instrument layers did not settle: ${JSON.stringify(instrument?.layers.map(layer => [layer.id, layer.status]))}`);
    await nextFrame();
  }
  for (let index = 0; index < 3; index++) await nextFrame();
  describe();
}
const counts = () => {
  const value = state() as unknown as { mode: string; reason: string; metrics: { captures: number; uploads: number; gpuFrames: number; geometryUpdates: number } };
  return { mode: value.mode, reason: value.reason, captures: value.metrics.captures, uploads: value.metrics.uploads, gpuFrames: value.metrics.gpuFrames, geometryUpdates: value.metrics.geometryUpdates };
};
function describe() {
  const instrument = state().instrument;
  status.textContent = `instrument-post-core: ${density} controls, theme ${theme.name}\n${status.dataset.core ?? ""}\n${(instrument?.layers ?? [])
    .map(layer => `${layer.id}: ${layer.status}, ${layer.steppedDown.length} at Relief`).join("\n")}`;
}
const client = (element: Element) => { const box = element.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
/** Client boxes of every control, with its layer. */
const controls = () => panels().flatMap(panel => [...panel.querySelectorAll<HTMLElement>("[data-part]")].map(element => ({
  id: element.id, kind: element.dataset.part, layer: panel.id, ...client(element), radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
  lit: litOf(element) })));
const boxes = () => Object.fromEntries([lower, upper, clipped, viewport].map(element => [element.id, { ...client(element), radius: element === viewport ? 0 : 14 }]));
/** The text: every faceplate print and every key's captured label, as client boxes with their layer. */
const labels = () => panels().flatMap(panel => [
  ...[...panel.querySelectorAll<HTMLElement>(".ipc-print")].map(print => ({ id: print.id, kind: "print", layer: panel.id, ...client(print) })),
  ...[...panel.querySelectorAll<HTMLElement>("button[data-part=key] .ipc-label")].map(label => ({ id: label.parentElement!.id, kind: "cap", layer: panel.id, ...client(label) })),
]);
/** The map's cases in client px: each bat's plate (from its scene) and each thin plate and its plinth. */
function cases() {
  const result: { id: string; kind: "bat" | "thin"; layer: string; t: number; plate: { x: number; y: number; width: number; height: number }; top?: { x: number; y: number; width: number; height: number } }[] = [];
  for (const panel of panels()) {
    const scene = scenes.get(panel.id);
    if (!scene) continue;
    const base = panel.getBoundingClientRect();
    for (const object of scene.objects) {
      const element = document.getElementById(object.id)!;
      if (element.dataset.part !== "bat" && element.dataset.part !== "thin") continue;
      const box = (index: number) => {
        const part = object.parts[index]!, shape = scene.profiles[part.profile] as { width: number; length: number };
        return { x: base.left + part.at[0] - shape.width / 2, y: base.top + part.at[1] - shape.length / 2, width: shape.width, height: shape.length };
      };
      result.push({ id: object.id, kind: element.dataset.part as "bat" | "thin", layer: panel.id, t: object.t ?? 0, plate: box(0), ...(element.dataset.part === "thin" ? { top: box(1) } : {}) });
    }
  }
  return result;
}

/** Animates every knob, fader and bat of the large panels as poses only for `frames` frames; returns the counters over it. */
async function animate(frames: number) {
  await settle();
  const moving = new Set([lower, upper].flatMap(panel => [...panel.querySelectorAll<HTMLElement>("[data-part=knob], [data-part=fader], [data-part=bat]")].map(element => element.id)));
  const before = counts();
  for (let index = 0; index < frames; index++) {
    await nextFrame();
    for (const panel of [lower, upper]) {
      const scene = scenes.get(panel.id), handle = handles.get(panel.id);
      if (!scene || !handle) continue;
      const next = { ...scene, objects: scene.objects.map((object, which) => (moving.has(object.id) ? { ...object, t: 0.5 + 0.45 * Math.sin(index / 12 + which) } : object)) };
      scenes.set(panel.id, next);
      handle.update(next);
    }
  }
  await nextFrame();
  const after = counts();
  for (const panel of [lower, upper]) refresh(panel);
  return { frames, moving: moving.size, captures: after.captures - before.captures, uploads: after.uploads - before.uploads,
    geometryUpdates: after.geometryUpdates - before.geometryUpdates, gpuFrames: after.gpuFrames - before.gpuFrames, mode: after.mode, reason: after.reason };
}
/**
 * Draws `frames` frames with nothing moving: every frame writes each panel's lights unchanged (`setEmitters`), which
 * asks core for a frame and changes no part. Returns the frames drawn and the map renders counted over them.
 */
async function idle(frames: number) {
  await settle();
  // Per layer: the map renders the controller counted, those Lite's timings saw, and the frames Lite timed at all (the
  // composite runs every frame), so a count of 0 timed renders is only meaningful when frames were timed.
  const renders = () => (state().instrument?.post.layers ?? []).map(layer => [layer.id, layer.map?.renders ?? 0, layer.map?.timedRenders ?? 0, layer.gpu.composite?.total ?? 0] as const);
  const before = counts(), mapBefore = renders();
  for (let index = 0; index < frames; index++) {
    await nextFrame();
    for (const panel of panels()) relight(panel);
  }
  await nextFrame();
  const after = counts(), mapAfter = renders();
  return { frames, gpuFrames: after.gpuFrames - before.gpuFrames, captures: after.captures - before.captures,
    map: mapAfter.map(([id, rendered, timed, frames]) => { const previous = mapBefore.find(entry => entry[0] === id);
      return { id, renders: rendered - (previous?.[1] ?? 0), timedRenders: timed - (previous?.[2] ?? 0), timedFrames: frames - (previous?.[3] ?? 0) }; }) };
}

const boot = { started: performance.now(), enabledMs: 0, readyMs: 0, mode: "", reason: "" };
refreshAll();
await controller.enable();
boot.enabledMs = performance.now() - boot.started;
if (params.get("race") === "1") {
  // A successor composition (a new layer and its relief pass) while the instrument scenes compile.
  const extra = document.createElement("section");
  extra.id = "extra"; extra.className = "ipc-panel"; extra.setAttribute("drawable", "");
  extra.textContent = "Relief";
  Object.assign(extra.style, { right: "40px", bottom: "40px", width: "160px", height: "60px", background: "rgb(210, 214, 220)" });
  controller.container.append(extra);
  controller.enroll(extra, { id: "extra" });
  controller.setMaterial("extra", { kind: "relief", bounds: "layer", interaction: "material", media: "identity", fallback: "static", scene: {
    format: "strata-scene", version: 1, extent: { width: 160, height: 60 }, backdrop: theme.stage, light: { azimuth: 323, elevation: 41 },
    bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 }, interior: { max: 0.04 },
    state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: { face: { base: { roughness: 0.6 } } }, primitives: [{ face: "raised", rect: [0, 0, 160, 60], radius: 10, height: 6, material: "face" }] } });
}
// `?dropAt=ms`: every instrument material is cancelled that long after the page started, while the scenes still build.
const dropAt = params.get("dropAt");
if (dropAt !== null) setTimeout(() => { options.plain = true; refreshAll(); }, Math.max(0, Number(dropAt) - (performance.now() - boot.started)));
try { await settle(); } catch (error) { boot.reason = String(error); }
boot.readyMs = performance.now() - boot.started;
boot.mode = counts().mode;
if (!boot.reason) boot.reason = counts().reason;

const api = {
  dpr: () => devicePixelRatio,
  boot: () => ({ ...boot }),
  settle, counts, controls, labels, cases, panels: boxes, animate, idle,
  state: () => state(),
  instrument: () => state().instrument,
  post: () => state().instrument?.post ?? null,
  straddled: () => ({ upper: upper.dataset.straddles, clipped: clipped.dataset.straddles }),
  /** The control (or the panel) native hit testing finds at each client point. */
  hits: (points: { x: number; y: number }[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.closest<HTMLElement>("section")?.id ?? hit?.id ?? ""; }),
  /** Draws every panel (or panel `id`) with its objects, or with its face only (the same emitters). */
  async setMeshes(on: boolean, id?: string) {
    if (id) { if (on) faceOnly.delete(id); else faceOnly.add(id); } else { options.meshes = on; faceOnly.clear(); }
    refreshAll();
    await settle();
  },
  async setShadows(on: boolean) { options.casters = on; refreshAll(); await settle(); },
  async setPlain(on: boolean) { options.plain = on; refreshAll(); await settle(); },
  /** The `post` flags of every panel (undefined: the defaults). */
  async setPost(post: InstrumentScene["post"] | undefined) { options.post = post; refreshAll(); await settle(); return state().instrument?.post ?? null; },
  /** The shadow map of every panel (undefined: the defaults; `{ darkness: 1 }`: none). */
  async setMap(map: SceneOptions["map"] | undefined) { options.map = map; refreshAll(); await settle(); },
  /** Every lamp and LED light on (native state) or off, through `setEmitters`. */
  async setLights(on: boolean) { options.lights = on; for (const panel of panels()) relight(panel); await settle(); },
  async setDensity(count: number) { density = count; layout(count); refreshAll(); await settle(); return controls().length; },
  async setOpacity(id: string, opacity: number) { controller.setTransform(id, { opacity }); await settle(); },
  async move(id: string, x: number, y: number) { controller.setTransform(id, { x, y }); await settle(); },
  /** Poses one object (`t`) and waits for the frame. */
  async pose(id: string, t: number) { const panel = panels().find(entry => entry.contains(document.getElementById(id)))!; pose(panel, id, t); await settle(); },
  /**
   * After a DPR change (CDP fires no resize here): a controller operation (a transform) makes core reconcile the
   * backing grid (an opacity change and back), and every panel is read again.
   */
  async render() {
    for (const panel of panels()) controller.setTransform(panel.id, { opacity: 0.999 });
    await settle();
    for (const panel of panels()) controller.setTransform(panel.id, { opacity: 1 });
    refreshAll();
    await settle();
  },
  /** Ends one panel's material (`cancel`), or sets it again. */
  async cancel(id: string) { handles.get(id)?.cancel(); handles.delete(id); await settle(); },
  async restore(id: string) { refresh(panels().find(panel => panel.id === id)!); await settle(); },
  setFailRegistration(mode: "optional" | "all" | null) { failRegistration = mode; },
  async disable() { await controller.disable(); return counts(); },
  async enable() { await controller.enable(); await settle(); return counts(); },
};
type PostCoreApi = typeof api;
declare global { interface Window { postCore: { ready: Promise<PostCoreApi> } } }
window.postCore = { ready: Promise.resolve(api) };
describe();
