/**
 * Core's emitters and the pointer light (core work item 2, `docs/ui-library/instrument-phase2.md`) on plain DOM, for
 * `tests/browser/core-emitters.test.mjs` and a headful look. Four enrolled layers fill the window, bottom to top:
 * `#stage` (the page, with the page's own controls) and three overlapping panels `#a`, `#b`, `#c`, each with a lamp
 * beside its label and caption, an LED, a key, a knob and a lit ring button. `#b` overlaps `#a`'s right side, `#c`
 * overlaps `#b`'s; `#c`'s power lamp is the brightest and sits beside its label near `#c`'s left edge, over `#b`, and its
 * corner lamp sits near its bottom edge, over the stage.
 *
 * Every layer's material is set through the public `setMaterial` with a version 4 scene: `relief` (the stage, and the
 * panels at `?level=relief`), `objects` (`?level=objects`) or `instrument` (`?level=instrument`, the default), each with
 * its emitters (lit lamps, the LED, the ring when pressed), its protected rects (the text runs of the layer) and the
 * feather. **The page does what the Strata helper will do:** it tracks `pointermove`, fades the pointer light over
 * `motion.fast`, and writes the pointer light into every layer each frame with `handle.setEmitters` (the cheap path),
 * in each layer's own px; lamp state changes go through `handle.update` where the scene's look changes too.
 *
 * Query: `?level=`, `?theme=light|dark`, `?feather=` (px, default 4; 10 while the pointer light is on), `?pointer=0`
 * (no pointer light), `?density=n` (panel B's emitters replaced by `n` on a grid). `window.emittersCore.ready` resolves
 * with the test API.
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type MaterialHandle, type SceneEmitter } from "@underglass/core";
import { gridEmitters, ownEmitters, panelScene, stageScene, textRects, themes, tokens, type Level, type Theme } from "./scene.ts";

const params = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const level: Level = (["relief", "objects", "instrument"] as const).find(value => value === params.get("level")) ?? "instrument";
let theme: Theme = themes[params.get("theme") === "dark" ? "dark" : "light"];
let feather = Math.min(16, Math.max(0, Number(params.get("feather") ?? 4)));
frame.dataset.level = level;
document.body.dataset.theme = theme.name;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

let stage!: HTMLElement;
const panels: HTMLElement[] = [];
const layers = () => [stage, ...panels];
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
/** One panel: a heading, a lamp beside its label and caption, an LED, a key, a knob and a lit ring, a note, a corner lamp. */
function fillPanel(panel: HTMLElement, name: string, lampLabel: string, keyLabel: string, corner?: string) {
  const id = panel.id;
  const power = element("div", { class: "ec-row" });
  power.append(element("input", { type: "checkbox", role: "switch", id: `${id}-lamp`, class: "ec-lamp", "data-emitter": "lamp", "aria-labelledby": `${id}-lamp-label` }),
    element("span", { id: `${id}-lamp-label`, class: "ec-label" }, lampLabel), element("span", { id: `${id}-lamp-caption`, class: "ec-caption" }, "Lamp light on text stays under 4%"));
  const signal = element("div", { class: "ec-row" });
  signal.append(element("span", { role: "img", id: `${id}-led`, class: "ec-led", "data-emitter": "led", "aria-label": "Signal present" }), element("span", { id: `${id}-led-label`, class: "ec-label" }, "Signal"));
  const controls = element("div", { class: "ec-row" });
  const ring = element("button", { type: "button", id: `${id}-ring`, class: "ec-ring", "data-emitter": "ring", "aria-pressed": "true" }, "REC");
  ring.addEventListener("click", () => ring.setAttribute("aria-pressed", String(ring.getAttribute("aria-pressed") !== "true")));
  controls.append(element("button", { type: "button", id: `${id}-key`, "data-part": "key" }, keyLabel),
    element("input", { type: "range", min: "0", max: "100", value: "35", id: `${id}-knob`, class: "ec-knob", "data-part": "knob", "aria-label": `${name} gain` }),
    element("span", { id: `${id}-knob-label`, class: "ec-label" }, "Gain"), ring);
  const note = element("p", { id: `${id}-note`, class: "ec-note" }, "A lit lamp lights the faceplate, the parts near it and the page past the panel's edge.");
  panel.replaceChildren(element("h2", { id: `${id}-title` }, name), power, signal, controls, note);
  if (corner) {
    const wrapper = element("div", { class: "ec-corner" });
    Object.assign(wrapper.style, { right: "18px", bottom: "16px" });
    wrapper.append(element("span", { id: `${id}-corner-label`, class: "ec-label" }, corner),
      element("input", { type: "checkbox", role: "switch", id: `${id}-corner`, class: "ec-lamp", "data-emitter": "lamp", "aria-labelledby": `${id}-corner-label` }));
    panel.append(wrapper);
  }
  // B's edge note sits where C's outset glow falls on B (placed by `layout`): C adds no light to it, B's guard holds it.
  if (id === "b") panel.append(Object.assign(element("span", { id: "b-edge", class: "ec-caption" }, "Edge note"), { style: "position: absolute; white-space: nowrap" }));
}
/** The page's own controls on the stage: the level, the theme, the pointer light, the guard feather and the density case. */
function fillStage() {
  const toolbar = element("div", { class: "ec-toolbar", id: "toolbar" });
  const levelPick = element("select", { id: "level-pick", "aria-label": "Level" });
  for (const value of ["relief", "objects", "instrument"]) levelPick.append(Object.assign(element("option", { value }, value), { selected: value === level }));
  levelPick.addEventListener("change", () => { params.set("level", levelPick.value); location.search = params.toString(); });
  const themePick = element("select", { id: "theme-pick", "aria-label": "Theme" });
  for (const value of ["light", "dark"]) themePick.append(Object.assign(element("option", { value }, value), { selected: value === theme.name }));
  themePick.addEventListener("change", () => void setTheme(themePick.value as Theme["name"]));
  const pointerToggle = element("input", { type: "checkbox", id: "pointer-toggle" });
  pointerToggle.checked = pointer.enabled;
  pointerToggle.addEventListener("change", () => setPointer({ enabled: pointerToggle.checked }));
  const featherRange = element("input", { type: "range", id: "feather-range", min: "0", max: "16", step: "1", value: String(feather) });
  const featherValue = element("span", { id: "feather-value" }, `${feather} px`);
  featherRange.addEventListener("input", () => { featherValue.textContent = `${featherRange.value} px`; setFeather(Number(featherRange.value)); });
  const densityPick = element("select", { id: "density-pick", "aria-label": "Emitters on panel B" });
  for (const value of ["lamps", "64", "80"]) densityPick.append(element("option", { value }, value === "lamps" ? "B: its lamps" : `B: ${value} emitters`));
  densityPick.addEventListener("change", () => setDensity("b", densityPick.value === "lamps" ? null : Number(densityPick.value)));
  const label = (text: string, control: HTMLElement, after?: HTMLElement) => { const node = element("label", {}, text); node.append(control); if (after) node.append(after); return node; };
  toolbar.append(label("Level ", levelPick), label("Theme ", themePick), label("Pointer light ", pointerToggle), label("Guard feather ", featherRange, featherValue), densityPick);
  stage.replaceChildren(toolbar);
}
function layout() {
  const width = frame.clientWidth, height = frame.clientHeight;
  const place = (panel: HTMLElement, x: number, y: number, w: number, h: number) =>
    Object.assign(panel.style, { left: `${Math.round(width * x)}px`, top: `${Math.round(height * y)}px`, width: `${Math.round(width * w)}px`, height: `${Math.round(height * h)}px` });
  place(panels[0]!, 0.06, 0.2, 0.34, 0.52);
  place(panels[1]!, 0.34, 0.08, 0.32, 0.54);
  place(panels[2]!, 0.6, 0.14, 0.33, 0.58);
  const b = panels[1]!, c = panels[2]!, edge = document.getElementById("b-edge");
  if (edge) Object.assign(edge.style, { left: `${c.offsetLeft - b.offsetLeft - 64}px`, top: `${c.offsetTop - b.offsetTop + 85}px` });
}

// ---------------------------------------------------------------------------------------------------------------
// The pointer light (what the Strata helper will do): tracked here, written into every layer each frame.

const pointer = { enabled: params.get("pointer") !== "0", inside: false, client: { x: -1e4, y: -1e4 }, alpha: 0, moved: false, face: tokens.pointer.face, strength: tokens.pointer.strength };
const pointerStats = { updates: 0, intervals: [] as number[], cpu: [] as number[] };
/** Panel B's emitters replaced by a grid (the density case), or its own lamps. */
const density = new Map<string, number>();
const handles = new Map<string, MaterialHandle>();
let plain = false;

const stageBox = () => { const box = frame.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
/** A layer's emitters now: its own (or the density grid) and the pointer light, in the layer's own px. */
function emittersOf(layer: HTMLElement): SceneEmitter[] {
  const own = density.has(layer.id) ? gridEmitters(layer, density.get(layer.id)!) : layer === stage ? [] : ownEmitters(layer);
  if (!pointer.enabled) return own;
  const base = layer.getBoundingClientRect(), t = tokens.pointer;
  return [...own, { position: [pointer.client.x - base.left, pointer.client.y - base.top, t.height], colour: t.colour, strength: pointer.strength * pointer.alpha,
    radius: t.radius, reach: "layer", face: pointer.face }];
}
/** The light fields of a layer: its emitters, its text runs and the feather (10 px while the pointer light is on). */
/** How a layer protects its text: its text runs, its whole box, more than 64 rects (so its whole box), or each run twice, overlapping. */
const protection = new Map<string, "runs" | "extent" | "overflow" | "overlap">();
function protectedOf(layer: HTMLElement) {
  const runs = textRects(layer), mode = protection.get(layer.id) ?? "runs";
  if (mode === "extent") return "extent" as const;
  if (mode === "overflow") return [...runs, ...Array.from({ length: 65 }, (_, index) => [index * 3, 2, 2, 2] as [number, number, number, number])];
  if (mode === "overlap") return runs.flatMap(([x, y, w, h]) => [[x, y, w, h], [x + 3, y + 2, w, h]] as [number, number, number, number][]);
  return runs;
}
const lightOf = (layer: HTMLElement) => ({ emitters: emittersOf(layer), protected: protectedOf(layer), feather: pointer.enabled ? Math.max(feather, tokens.pointer.feather) : feather });
const sceneOf = (layer: HTMLElement) => (layer === stage ? stageScene(stage, theme, lightOf(stage)) : panelScene(layer, level, theme, stageBox(), lightOf(layer)));
const kindOf = (layer: HTMLElement) => (layer === stage || level === "relief" ? "relief" : level === "objects" ? "objects" : "instrument");
/** Hands a layer's scene to core: `setMaterial` once, then `update` (structure, layout, states). */
function refresh(layer: HTMLElement) {
  if (plain) { handles.get(layer.id)?.cancel(); handles.delete(layer.id); return; }
  const scene = sceneOf(layer), handle = handles.get(layer.id);
  if (handle?.state().active) handle.update(scene as never);
  else handles.set(layer.id, controller.setMaterial(layer.id, { kind: kindOf(layer), scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" } as never));
}
const refreshAll = () => { for (const layer of layers()) refresh(layer); };
/** The cheap path: only the emitters, every layer (the pointer light moved or faded). */
function writeEmitters() { for (const layer of layers()) handles.get(layer.id)?.setEmitters(emittersOf(layer)); }

const hosts = createCanvasHosts(frame);
const controller: CanvasController = mountApplicationModule({ ...hosts, budgets: { layers: 8, pixels: 8_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.dataset.core = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  stage = element("section", { id: "stage", "aria-label": "Stage" });
  stage.setAttribute("drawable", "");
  container.append(stage);
  for (const [id, name, lamp, key, corner] of [["a", "A · Studio", "Monitor", "Mute"], ["b", "B · Desk", "Record", "Arm"], ["c", "C · Rack", "Power", "Solo", "Standby"]] as const) {
    const panel = element("section", { id, class: "ec-panel", "aria-label": name });
    panel.setAttribute("drawable", "");
    fillPanel(panel, name, lamp, key, corner);
    container.append(panel);
    panels.push(panel);
  }
  fillStage();
  layout();
  const releases = layers().map(layer => enroll({ id: layer.id, element: layer, layout: {}, transform: {} }));
  return () => { for (const release of releases) release(); container.replaceChildren(); };
} });

// Native state drives the light: a lamp's check is its emitter, the ring button's press its ring, the knob its cap.
for (const panel of panels) {
  const sync = () => { if (handles.has(panel.id)) refresh(panel); };
  panel.addEventListener("input", sync);
  panel.addEventListener("change", sync);
  panel.addEventListener("click", event => { if ((event.target as HTMLElement).closest("[data-emitter=ring]")) queueMicrotask(sync); });
}
window.addEventListener("pointermove", event => { pointer.client = { x: event.clientX, y: event.clientY }; pointer.inside = true; pointer.moved = true; }, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { pointer.inside = false; });
let previousTick = 0, previousUpdate = 0;
// The usual idiom: the tick asks for its next frame first, then writes (core keeps its own draw after the writer).
function tick(now: number) {
  requestAnimationFrame(tick);
  const dt = previousTick ? now - previousTick : 1000 / 60;
  previousTick = now;
  if (!pointer.enabled || plain) return;
  const target = pointer.inside ? 1 : 0;
  let changed = pointer.moved && target > 0;
  pointer.moved = false;
  if (pointer.alpha !== target) {
    const step = reduced.matches ? 1 : dt / tokens.pointer.fade;
    pointer.alpha = target > pointer.alpha ? Math.min(target, pointer.alpha + step) : Math.max(target, pointer.alpha - step);
    changed = true;
  }
  if (!changed) return;
  const started = performance.now();
  writeEmitters();
  pointerStats.updates++;
  pointerStats.cpu.push(performance.now() - started);
  if (previousUpdate) pointerStats.intervals.push(now - previousUpdate);
  previousUpdate = now;
}
requestAnimationFrame(tick);

function setPointer(options: { enabled?: boolean; face?: number; strength?: number }) {
  if (options.face !== undefined) pointer.face = options.face;
  if (options.strength !== undefined) pointer.strength = options.strength;
  if (options.enabled !== undefined && options.enabled !== pointer.enabled) {
    pointer.enabled = options.enabled;
    if (!pointer.enabled) pointer.alpha = 0;
    // The feather and the emitters field change: through `update`.
    refreshAll();
  } else writeEmitters();
}
function setFeather(value: number) { feather = value; refreshAll(); }
function setDensity(id: string, count: number | null) { if (count === null) density.delete(id); else density.set(id, count); refresh(layers().find(layer => layer.id === id)!); }
async function setTheme(name: Theme["name"]) {
  theme = themes[name];
  document.body.dataset.theme = name;
  const pick = document.getElementById("theme-pick") as HTMLSelectElement | null;
  if (pick) pick.value = name;
  refreshAll();
  await settle();
}

// ---------------------------------------------------------------------------------------------------------------
// The test API.

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; gpu: { p50Ms: number | null } }[]; compile: { building: boolean } } | null;
  emitters: { layers: { id: string; drawn: number[]; dropped: { index: number; margin: number }[]; pass: string; gpu: { p50Ms: number | null; samples: number } }[] } };
const state = () => controller.state() as unknown as State;
async function settle(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    await controller.settle();
    const instrument = state().instrument;
    const pending = !!instrument && (instrument.compile.building || instrument.layers.some(layer => layer.status === "pending"));
    if (!pending) break;
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
  const lights = state().emitters?.layers ?? [];
  status.textContent = `emitters-core: ${level}, ${theme.name}, pointer ${pointer.enabled ? "on" : "off"}, feather ${feather}\n${status.dataset.core ?? ""}\n${lights
    .map(layer => `${layer.id}: ${layer.drawn.length} drawn, ${layer.dropped.length} dropped, ${layer.pass}`).join("\n")}`;
}
const clientBox = (node: { getBoundingClientRect(): DOMRect }) => { const box = node.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
/** The client box of an element's text (its text run). */
const textBox = (id: string) => { const range = document.createRange(); range.selectNodeContents(document.getElementById(id)!); return clientBox(range); };
const statistics = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { samples: values.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
};
async function setLamps(on: Record<string, boolean>) {
  for (const [id, value] of Object.entries(on)) {
    const lamp = document.getElementById(id) as HTMLInputElement;
    if (lamp.checked !== value) { lamp.checked = value; lamp.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  await settle();
}

const boot = { started: performance.now(), readyMs: 0, mode: "", reason: "" };
refreshAll();
await controller.enable();
try { await settle(); } catch (error) { boot.reason = String(error); }
boot.readyMs = performance.now() - boot.started;
boot.mode = counts().mode;
if (!boot.reason) boot.reason = counts().reason;

const api = {
  dpr: devicePixelRatio, level,
  boot: () => ({ ...boot }), settle, counts, state: () => state(),
  emitters: () => state().emitters, instrument: () => state().instrument,
  materials: () => (state() as unknown as { materials: unknown[] }).materials,
  panels: () => Object.fromEntries(layers().map(layer => [layer.id, clientBox(layer)])),
  /** Every control with its layer and client box, and whether a higher panel covers its centre. */
  controls: () => panels.flatMap(panel => [...panel.querySelectorAll<HTMLElement>("input, button, [data-emitter]")].map(node => {
    const box = clientBox(node), centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const covered = panels.slice(panels.indexOf(panel) + 1).some(other => { const b = clientBox(other); return centre.x >= b.x - 2 && centre.y >= b.y - 2 && centre.x <= b.x + b.width + 2 && centre.y <= b.y + b.height + 2; });
    return { id: node.id, layer: panel.id, kind: node.dataset.emitter ?? node.dataset.part ?? node.tagName.toLowerCase(), ...box, covered };
  })),
  lamps: () => panels.flatMap(panel => [...panel.querySelectorAll<HTMLInputElement>("[data-emitter=lamp]")].map(lamp => {
    const box = clientBox(lamp);
    return { id: lamp.id, layer: panel.id, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, diameter: box.width, on: lamp.checked, bright: lamp.id === "c-lamp" };
  })),
  /** The client boxes of each layer's text runs (its protected rects), and of one element's text. */
  textRects: () => Object.fromEntries(layers().map(layer => { const base = clientBox(layer); return [layer.id, textRects(layer).map(([x, y, width, height]) => ({ x: x + base.x, y: y + base.y, width, height }))]; })),
  textBox,
  setLamps, allOff: () => setLamps(Object.fromEntries(panels.flatMap(panel => [...panel.querySelectorAll<HTMLInputElement>("[data-emitter=lamp]")].map(lamp => [lamp.id, false])))),
  async setRing(id: string, on: boolean) { document.getElementById(id)!.setAttribute("aria-pressed", String(on)); refresh(document.getElementById(id)!.closest("section")!); await settle(); },
  async setPointer(options: { enabled?: boolean; face?: number; strength?: number }) { setPointer(options); await settle(); },
  pointerState: () => ({ ...pointer }),
  pointerStats: () => ({ updates: pointerStats.updates, intervals: statistics(pointerStats.intervals), cpu: statistics(pointerStats.cpu) }),
  resetPointerStats: () => { pointerStats.updates = 0; pointerStats.intervals = []; pointerStats.cpu = []; previousUpdate = 0; },
  /** A synthetic pointer leave (Playwright cannot move the mouse off the page), for the fade. */
  pointerLeave: () => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")),
  async setFeather(value: number) { setFeather(value); await settle(); },
  async setDensity(id: string, count: number | null) { setDensity(id, count); await settle(); return state().emitters.layers.find(layer => layer.id === id); },
  setTheme,
  /** Every material cancelled (core's plain pass, the capture as it is), or set again. */
  async setPlain(on: boolean) { plain = on; refreshAll(); await settle(); },
  /** Panel `id` grows by `by` px: a new capture size, so core builds a successor composition and retires the old passes. */
  async resize(id: string, by: number) { const panel = layers().find(layer => layer.id === id)!; panel.style.width = `${panel.offsetWidth + by}px`; refresh(panel); await settle(); },
  async setProtection(id: string, mode: "runs" | "extent" | "overflow" | "overlap") { protection.set(id, mode); refresh(layers().find(layer => layer.id === id)!); await settle(); return state().emitters.layers.find(layer => layer.id === id); },
  /**
   * A light written in one frame, then an ordinary `update` in the next (B's shadow strength `strength`), while core's lead
   * frame is pending: returns the GPU frames core drew in the two frames after the update (the update must be drawn).
   */
  async leadThenUpdate(strength: number) {
    const b = panels[1]!, handle = handles.get("b")!;
    // Quiet first: no paint or draw request left from earlier steps.
    await settle();
    for (let index = 0; index < 10; index++) await nextFrame();
    await nextFrame();
    handle.setEmitters(emittersOf(b));
    await nextFrame();
    const scene = sceneOf(b) as { shadow: { strength: number } };
    scene.shadow = { ...scene.shadow, strength };
    const metrics = () => (state() as unknown as { metrics: { paintNotifications: number; gpuFrames: number } }).metrics;
    const before = counts().gpuFrames, paints = metrics().paintNotifications;
    handle.update(scene as never);
    await nextFrame();
    await nextFrame();
    return { framesAfterUpdate: counts().gpuFrames - before, paints: metrics().paintNotifications - paints };
  },
  /**
   * A writer in the usual idiom: each animation frame it first asks for its next frame, then moves a light on B with
   * `setEmitters`; returns the writes and the GPU frames core drew meanwhile.
   */
  async writerRun(frames: number) {
    const b = panels[1]!, before = counts();
    let writes = 0;
    await new Promise<void>(resolve => {
      const loop = () => {
        if (writes >= frames) { resolve(); return; }
        requestAnimationFrame(loop);
        const own = ownEmitters(b);
        handles.get("b")?.setEmitters([...own, { position: [40 + (writes % 200) * 2, 120, 20], colour: [1, 0.9, 0.8], strength: 3200, radius: 168 }]);
        writes++;
      };
      requestAnimationFrame(loop);
    });
    await nextFrame();
    await nextFrame();
    const after = counts();
    refresh(b);
    await settle();
    return { writes, gpuFrames: after.gpuFrames - before.gpuFrames, captures: after.captures - before.captures };
  },
  hits: (points: { x: number; y: number }[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("input, button, select, [data-emitter]")?.id ?? hit?.closest("section")?.id ?? hit?.id ?? ""; }),
  /** Frames with `count` emitters on layer `id` (the cost case), for `frames` frames; GPU times from core's diagnostics. */
  async cost(id: string, count: number, frames = 120) {
    setDensity(id, count);
    await settle();
    for (let index = 0; index < 30; index++) { controller.state(); await nextFrame(); }
    const before = counts();
    const light: number[] = [], mesh: number[] = [];
    // Only samples taken during the measurement: an idle pass (no emitters) takes none.
    const totals = () => { const value = state() as unknown as { emitters: { layers: { id: string; gpu: { total: number } }[] }; instrument: { layers: { id: string; gpu: { total: number } }[] } | null };
      return [value.emitters.layers.find(layer => layer.id === id)?.gpu.total ?? 0, value.instrument?.layers.find(layer => layer.id === id)?.gpu.total ?? 0]; };
    let [lastLight, lastMesh] = totals();
    for (let index = 0; index < frames; index++) {
      // A frame per animation frame (the pointer is off, so nothing else asks for one).
      handles.get(id)?.setEmitters(emittersOf(layers().find(layer => layer.id === id)!));
      await nextFrame();
      const value = state(), lights = value.emitters.layers.find(layer => layer.id === id) as unknown as { gpu: { lastMs: number | null; total: number } } | undefined;
      const layerGpu = value.instrument?.layers.find(layer => layer.id === id) as unknown as { gpu: { lastMs: number | null; total: number } } | undefined;
      if (lights && lights.gpu.total !== lastLight && lights.gpu.lastMs !== null) { light.push(lights.gpu.lastMs); lastLight = lights.gpu.total; }
      if (layerGpu && layerGpu.gpu.total !== lastMesh && layerGpu.gpu.lastMs !== null) { mesh.push(layerGpu.gpu.lastMs); lastMesh = layerGpu.gpu.total; }
    }
    const after = counts();
    const result = { id, count, frames, light: statistics(light), mesh: statistics(mesh), captures: after.captures - before.captures, mode: after.mode,
      drawn: state().emitters.layers.find(layer => layer.id === id)?.drawn.length ?? 0 };
    setDensity(id, null);
    await settle();
    return result;
  },
  async disable() { await controller.disable(); return counts(); },
  async enable() { await controller.enable(); await settle(); return counts(); },
  browser: () => navigator.userAgent,
};
type EmittersCoreApi = typeof api;
declare global { interface Window { emittersCore: { ready: Promise<EmittersCoreApi>; api: EmittersCoreApi } } }
window.emittersCore = { ready: Promise.resolve(api), api };
describe();
