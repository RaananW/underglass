/**
 * Core's `instrument` material on plain DOM (no UI framework), for `tests/browser/core-instrument.test.mjs` and a
 * headful look (`docs/ui-library/instrument-phase2.md`). Three enrolled panels of real native controls:
 * - `#lower` fills the window; `#upper` overlaps it, its left edge across one of the lower panel's knobs;
 * - `#clipped` sits in `#viewport`, a non-enrolled `overflow: hidden` box narrower than the panel, so core clips the
 *   layer (face, hits and meshes) at the viewport's edge, across one of its knobs.
 * Each panel's material is `{ kind: "instrument", scene }`, set through the public `setMaterial`; native state (values,
 * checks, presses) sets each object's `t` through `handle.update`, so poses never recapture.
 *
 * Query: `?density=n` (controls over the two large panels, default 60), `?theme=dark`, `?overshoot=1` (the lower panel's
 * first knob gets a 60 px pointer: in the stage corner it cannot stay in its box, so core draws it at the Relief level
 * and reports it), `?material=0` (start with no material), `?race=1` (right after `enable`, a fourth layer with a relief
 * material joins while the mesh scenes build, so core's successor composition and the mesh pipelines compile together).
 *
 * `window.instrumentCore.ready` resolves with the test API: `settle`, `state`, `counts`, `controls`, `panels`, `hits`,
 * `setMeshes`, `setShadows`, `setPlain`, `setDensity`, `animate`, `setOpacity`, `move`, `theme`, `budget`, `relabel`,
 * `press`, `boot`.
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type InstrumentScene, type MaterialHandle } from "@underglass/core";
import { budgetScene, panelScene, themes, travelOf, type ControlKind, type Theme } from "./scene.ts";

const params = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
let theme: Theme = themes[params.get("theme") === "dark" ? "dark" : "light"];
let density = Math.max(4, Number(params.get("density") ?? 60));
const overshoot = params.get("overshoot") === "1";
const pattern: ControlKind[] = ["knob", "key", "fader", "switch", "knob", "key", "knob", "switch", "key", "fader"];
const pressed = new Set<HTMLElement>();
const options = { meshes: true, casters: true, plain: false };
// Panels drawn with their face only (no objects), for pixel references.
const faceOnly = new Set<string>();

let lower!: HTMLElement, upper!: HTMLElement, viewport!: HTMLElement, clipped!: HTMLElement;
const panels = () => [lower, upper, clipped];
const stage = () => ({ width: frame.clientWidth, height: frame.clientHeight });

/** The largest cell edge that fits `count` cells in a `width` × `height` area. */
function fitCell(width: number, height: number, count: number) {
  let cell = Math.max(8, Math.floor(Math.sqrt((width * height) / Math.max(1, count))));
  while (cell > 8 && Math.floor(width / cell) * Math.floor(height / cell) < count) cell--;
  return cell;
}
/** Fills `panel` with `count` controls of the pattern from `first`, in cells of `cell` px (fitted when omitted). */
function fill(panel: HTMLElement, count: number, first: number, title: string, cell?: number) {
  panel.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "ic-grid";
  panel.append(heading, grid);
  const width = panel.clientWidth - 32, height = panel.clientHeight - 24 - 26;
  const size = cell ?? fitCell(width, height, count);
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.floor(width / size))}, ${size}px)`;
  grid.style.gridAutoRows = `${size}px`;
  for (let index = 0; index < count; index++) {
    const kind = pattern[(first + index) % pattern.length]!;
    const wrapper = document.createElement("div");
    wrapper.className = "ic-cell";
    let control: HTMLElement;
    if (kind === "knob" || kind === "fader") {
      const input = document.createElement("input");
      Object.assign(input, { type: "range", min: "0", max: "100", value: String((index * 37 + 13) % 100) });
      input.setAttribute("aria-label", `${kind === "knob" ? "Knob" : "Fader"} ${index + 1}`);
      if (kind === "knob") { const side = Math.round(size * 0.8); Object.assign(input.style, { width: `${side}px`, height: `${side}px`, borderRadius: "50%" }); }
      else { Object.assign(input.style, { width: `${Math.max(18, Math.round(size * 0.36))}px`, height: `${Math.round(size * 0.92)}px` }); input.setAttribute("aria-orientation", "vertical"); }
      control = input;
    } else if (kind === "key") {
      const button = document.createElement("button");
      button.type = "button";
      const label = document.createElement("span");
      label.className = "ic-label";
      label.textContent = `K${index + 1}`;
      button.append(label);
      Object.assign(button.style, { width: `${Math.round(size * 0.84)}px`, height: `${Math.round(size * 0.56)}px`, fontSize: `${Math.max(10, Math.round(size * 0.2))}px` });
      button.dataset.presses = "0";
      button.addEventListener("click", () => { button.dataset.presses = String(Number(button.dataset.presses) + 1); });
      control = button;
    } else {
      const input = document.createElement("input");
      Object.assign(input, { type: "checkbox", checked: index % 3 === 0 });
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", `Switch ${index + 1}`);
      const w = Math.max(34, Math.round(size * 0.62)), h = Math.max(18, Math.round(size * 0.32));
      Object.assign(input.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${h / 2}px` });
      control = input;
    }
    control.id = `${panel.id}-${kind}-${index}`;
    control.dataset.part = kind;
    wrapper.append(control);
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
  fill(lower, lowerCount, 0, "Lower panel");
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
  // The clipped panel: 600 px wide in a 420 px viewport, its fifth control (a knob) across the viewport's right edge.
  Object.assign(viewport.style, { left: "48px", top: `${height - 48 - 150}px`, width: "420px", height: "150px" });
  Object.assign(clipped.style, { left: "0px", top: "0px", width: "600px", height: "150px" });
  fill(clipped, 6, 0, "Clipped panel", 86);
  const cells = [...clipped.querySelectorAll<HTMLElement>(".ic-cell")];
  // Shift the grid so a knob's centre sits on the viewport's edge (x = 420 in the panel).
  const knob = [...clipped.querySelectorAll<HTMLElement>("[data-part=knob]")].find(element => element.getBoundingClientRect().left - clipped.getBoundingClientRect().left > 300)
    ?? clipped.querySelector<HTMLElement>("[data-part=knob]")!;
  const box = knob.getBoundingClientRect(), base = clipped.getBoundingClientRect();
  const grid = clipped.querySelector<HTMLElement>(".ic-grid")!;
  grid.style.marginLeft = `${Math.round(420 - (box.left - base.left + box.width / 2))}px`;
  clipped.dataset.straddles = knob.id;
  void cells;
}

const hosts = createCanvasHosts(frame);
// `?hang=1`: core's internal test hook (not public API) holds the lower panel's first scene build forever, so the build
// deadline steps that layer down while a successor composition (`?race=1`) waits at most for that deadline.
let hung = false;
const instrumentTestHook = params.get("hang") === "1"
  ? { beforeBuild: (id: string) => (id === "lower" && !hung ? (hung = true, new Promise<void>(() => {})) : undefined) } : undefined;
const runtimeOptions = { ...hosts, budgets: { layers: 8, pixels: 4_000_000 }, instrumentTestHook,
  onStatusChange: (value: { mode: string; reason: string }) => { status.dataset.core = `${value.mode}: ${value.reason}`; } };
const controller: CanvasController = mountApplicationModule(runtimeOptions, { mount({ container, enroll }) {
  lower = document.createElement("section");
  upper = document.createElement("section");
  viewport = document.createElement("div");
  clipped = document.createElement("section");
  lower.id = "lower"; upper.id = "upper"; viewport.id = "viewport"; clipped.id = "clipped";
  for (const panel of [lower, upper, clipped]) { panel.className = "ic-panel"; panel.setAttribute("drawable", ""); panel.setAttribute("aria-label", `${panel.id} panel`); }
  viewport.append(clipped);
  container.append(lower, upper, viewport);
  document.body.dataset.theme = theme.name;
  layout(density);
  // Raw registration (the module contract): the clipped panel is not a direct root child, it sits in its viewport.
  const releases = [lower, upper, clipped].map(panel => enroll({ id: panel.id, element: panel, layout: {}, transform: {} }));
  return () => { for (const release of releases) release(); container.replaceChildren(); };
} });

// The scenes as last handed to core, and the handles of their materials.
const scenes = new Map<string, InstrumentScene>();
const handles = new Map<string, MaterialHandle>();
let budgetParts: number | undefined;
// Scene changes for the review's cases: the light's azimuth, an object whose bounds leave the lower panel, and extra
// objects (copies of the lower panel's first knob) that need no new kind.
const extras = { azimuth: 323, outside: false, copies: 0, swatches: false };
/**
 * Three swatches in one matte material near the lower panel's bottom-right corner: a lathe, a prism and an extrude, each
 * with a flat top facing the viewer, so their tops must shade alike (a part's winding must not decide its light).
 */
const swatchShapes = {
  lathe: { type: "lathe", points: [[20, 0, 1, 0], [20, 8, 1, 0], [20, 8, 0, 1], [0, 8, 0, 1]], segments: 48 },
  prism: { type: "prism", width: 40, length: 40, radius: 4, height: 8 },
  extrude: { type: "extrude", outline: [[-20, 0], [20, 0], [20, 8], [-20, 8]], width: 40 },
} as const;
const swatchCentres = (panel: HTMLElement) => (Object.keys(swatchShapes) as (keyof typeof swatchShapes)[])
  .map((kind, index) => ({ kind, x: panel.offsetWidth - 300 + index * 90, y: panel.offsetHeight - 90 }));
const sceneOf = (panel: HTMLElement) => {
  const base = panelScene(panel, theme, stage(), pressed, { overshoot: overshoot && panel === lower ? lower.querySelector<HTMLElement>("[data-part=knob]")?.id : undefined,
    casters: options.casters, objects: options.meshes && !faceOnly.has(panel.id) });
  base.light = { ...base.light, azimuth: extras.azimuth };
  if (panel === lower && base.objects.length) {
    const knob = base.objects.find(object => object.id.includes("-knob-"))!;
    for (let index = 0; index < extras.copies; index++) base.objects.push({ ...knob, id: `${knob.id}-copy-${index}` });
    if (extras.swatches) {
      base.materials.swatch = { base: { colour: "#8a9099", roughness: 0.5 } };
      for (const { kind, x, y } of swatchCentres(panel)) {
        const name = `swatch-${kind}`, rect: [number, number, number, number] = [x - 30, y - 30, 60, 60];
        base.profiles[name] = structuredClone(swatchShapes[kind]) as unknown as InstrumentScene["profiles"][string];
        base.objects.push({ id: name, rect, bounds: { rect, radius: 0 }, t: 0,
          parts: [{ kind: "plate", profile: name, at: [x, y, 0], material: "swatch", caster: null }] });
      }
    }
    if (extras.outside) {
      // The same knob moved so its box reaches 40 px past the panel's right edge.
      const [, y, w, h] = knob.rect, dx = panel.offsetWidth - w + 40 - knob.rect[0];
      const rect: [number, number, number, number] = [panel.offsetWidth - w + 40, y, w, h];
      base.objects.push({ ...knob, id: "outside", rect, bounds: { rect, radius: w / 2 }, relief: { ...knob.relief!, rect: [panel.offsetWidth - w - 4, y, w, h] },
        parts: knob.parts.map(part => ({ ...part, at: [part.at[0] + dx, part.at[1], part.at[2]] as [number, number, number] })) });
    }
  }
  return budgetParts !== undefined && panel === upper ? budgetScene(base, budgetParts) : base;
};
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
// Native state drives the poses: a value, a check or a press changes `t` only; the native change itself is what core captures.
for (const panel of panels()) {
  const sync = (event: Event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-part]");
    if (element && panel.contains(element)) pose(panel, element.id, travelOf(element, pressed));
  };
  panel.addEventListener("input", sync);
  panel.addEventListener("change", sync);
  panel.addEventListener("pointerdown", event => { const key = (event.target as HTMLElement).closest<HTMLElement>("button[data-part]"); if (key) { pressed.add(key); sync(event); } });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) panel.addEventListener(type, event => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("button[data-part]");
    if (key && pressed.delete(key)) sync(event);
  }, true);
}

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; steppedDown: unknown[] }[]; compile: { building: boolean } } | null };
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
  status.textContent = `instrument-core: ${density} controls, theme ${theme.name}\n${status.dataset.core ?? ""}\n${(instrument?.layers ?? [])
    .map(layer => `${layer.id}: ${layer.status}, ${layer.steppedDown.length} at Relief`).join("\n")}`;
}
/** Client boxes of every control, with its layer and the clip it is drawn under. */
const controls = () => panels().flatMap(panel => [...panel.querySelectorAll<HTMLElement>("[data-part]")].map(element => {
  const box = element.getBoundingClientRect();
  return { id: element.id, kind: element.dataset.part, layer: panel.id, x: box.left, y: box.top, width: box.width, height: box.height,
    radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 };
}));
const boxes = () => Object.fromEntries([lower, upper, clipped, viewport].map(element => {
  const box = element.getBoundingClientRect();
  return [element.id, { x: box.left, y: box.top, width: box.width, height: box.height, radius: element === viewport ? 0 : 14 }];
}));

/** Animates every knob and fader of the large panels as poses only for `frames` frames; returns the counters over it. */
async function animate(frames: number) {
  await settle();
  const moving = [lower, upper].flatMap(panel => [...panel.querySelectorAll<HTMLElement>("[data-part=knob], [data-part=fader]")].map(element => ({ panel, element })));
  const before = counts();
  const started = performance.now();
  const intervals: number[] = [], updates: number[] = [];
  let previous: number | undefined;
  for (let index = 0; index < frames; index++) {
    const now = await nextFrame();
    if (previous !== undefined) intervals.push(now - previous);
    previous = now;
    for (const panel of [lower, upper]) {
      const scene = scenes.get(panel.id), handle = handles.get(panel.id);
      if (!scene || !handle) continue;
      const next = { ...scene, objects: scene.objects.map((object, which) => (moving.some(entry => entry.element.id === object.id)
        ? { ...object, t: 0.5 + 0.45 * Math.sin(index / 12 + which) } : object)) };
      scenes.set(panel.id, next);
      const at = performance.now();
      handle.update(next);
      updates.push(performance.now() - at);
    }
  }
  await nextFrame();
  const after = counts();
  // Back to the native state.
  for (const panel of [lower, upper]) refresh(panel);
  return { frames, moving: moving.length, ms: performance.now() - started, captures: after.captures - before.captures, uploads: after.uploads - before.uploads,
    geometryUpdates: after.geometryUpdates - before.geometryUpdates, gpuFrames: after.gpuFrames - before.gpuFrames, mode: after.mode, reason: after.reason,
    intervalP95: [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)] ?? 0,
    // The time the application spends handing core a scene per panel and frame (validation included).
    updateP50: [...updates].sort((a, b) => a - b)[Math.floor(updates.length * 0.5)] ?? 0, updateP95: [...updates].sort((a, b) => a - b)[Math.floor(updates.length * 0.95)] ?? 0,
    // Core's frame (draw) work over the last frames, from its own metrics.
    frameWork: (() => { const work = [...(state() as unknown as { metrics: { frameWorkMs: number[] } }).metrics.frameWorkMs].slice(-frames).sort((a, b) => a - b);
      return { p50: work[Math.floor(work.length * 0.5)] ?? 0, p95: work[Math.floor(work.length * 0.95)] ?? 0 }; })() };
}

const boot = { started: performance.now(), enabledMs: 0, readyMs: 0, mode: "", reason: "" };
if (params.get("material") !== "0") refreshAll();
await controller.enable();
boot.enabledMs = performance.now() - boot.started;
if (params.get("race") === "1") {
  // A successor composition (a new layer and its relief pass) while the instrument scenes compile.
  const extra = document.createElement("section");
  extra.id = "extra"; extra.className = "ic-panel"; extra.setAttribute("drawable", "");
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
let ready: Promise<void> | undefined;
try { ready = settle(); await ready; } catch (error) { boot.reason = String(error); }
boot.readyMs = performance.now() - boot.started;
boot.mode = counts().mode;
if (!boot.reason) boot.reason = counts().reason;

const api = {
  dpr: devicePixelRatio,
  boot: () => ({ ...boot }),
  settle, counts, controls, panels: boxes,
  state: () => state(),
  instrument: () => state().instrument,
  materials: () => (state() as unknown as { materials: unknown[] }).materials,
  straddled: () => ({ upper: upper.dataset.straddles, clipped: clipped.dataset.straddles }),
  /** The control (or the panel) native hit testing finds at each client point. */
  hits: (points: { x: number; y: number }[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.closest<HTMLElement>("section")?.id ?? hit?.id ?? ""; }),
  value: (id: string) => { const element = document.getElementById(id) as HTMLInputElement; return { value: element.value, checked: element.checked, presses: Number(element.dataset.presses ?? 0) }; },
  /** Draws every panel (or panel `id`) with its objects, or with its face only. */
  async setMeshes(on: boolean, id?: string) {
    if (id) { if (on) faceOnly.delete(id); else faceOnly.add(id); } else { options.meshes = on; faceOnly.clear(); }
    refreshAll();
    await settle();
  },
  /** Client boxes of every key's label. */
  labels: () => panels().flatMap(panel => [...panel.querySelectorAll<HTMLElement>("button[data-part]")].map(button => {
    const box = button.querySelector(".ic-label")!.getBoundingClientRect();
    return { id: button.id, layer: panel.id, x: box.left, y: box.top, width: box.width, height: box.height };
  })),
  async setShadows(on: boolean) { options.casters = on; refreshAll(); await settle(); },
  async setPlain(on: boolean) { options.plain = on; refreshAll(); await settle(); },
  async setDensity(count: number) { density = count; layout(count); refreshAll(); await settle(); return { controls: controls().length, objects: scenes.get("lower")!.objects.length + scenes.get("upper")!.objects.length }; },
  animate,
  async setOpacity(id: string, opacity: number) { controller.setTransform(id, { opacity }); await settle(); },
  /** A layout change: the panel moves (its transform), and its meshes must follow in the same frame. */
  async move(id: string, x: number, y: number) { controller.setTransform(id, { x, y }); await settle(); },
  async theme(name: Theme["name"]) { theme = themes[name]; document.body.dataset.theme = name; refreshAll(); await settle(); },
  async budget(parts: number | null) { budgetParts = parts ?? undefined; refresh(upper); await settle(); return state().instrument; },
  async relabel(id: string, text: string) { document.getElementById(id)!.querySelector(".ic-label")!.textContent = text; await settle(); },
  async relight(azimuth: number) { extras.azimuth = azimuth; refreshAll(); await settle(); },
  async outside(on: boolean) { extras.outside = on; refresh(lower); await settle(); },
  async copies(count: number) { extras.copies = count; refresh(lower); await settle(); },
  /** Shows the swatches (a lathe, a prism and an extrude in one material) and returns their centres in client px. */
  async swatches(on: boolean) {
    extras.swatches = on; refresh(lower); await settle();
    const box = lower.getBoundingClientRect();
    return swatchCentres(lower).map(({ kind, x, y }) => ({ kind, x: box.left + x, y: box.top + y }));
  },
  /** Ends a panel's material (`cancel`), or sets it again. */
  async cancel(id: string) { handles.get(id)?.cancel(); handles.delete(id); await settle(); },
  async restore(id: string) { refresh(panels().find(panel => panel.id === id)!); await settle(); },
  async disable() { await controller.disable(); return counts(); },
  async enable() { await controller.enable(); await settle(); return counts(); },
  async press(id: string, down: boolean) {
    const element = document.getElementById(id)!;
    if (down) pressed.add(element); else pressed.delete(element);
    const panel = panels().find(entry => entry.contains(element))!;
    pose(panel, id, travelOf(element, pressed));
    await settle();
  },
};
type InstrumentCoreApi = typeof api;
declare global { interface Window { instrumentCore: { ready: Promise<InstrumentCoreApi> } } }
window.instrumentCore = { ready: Promise.resolve(api) };
describe();
