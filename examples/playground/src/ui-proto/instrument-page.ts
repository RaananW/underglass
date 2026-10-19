/**
 * The Phase I1 prototype page (`ui-proto-instrument.html`, docs/ui-library/instrument.md, Phase I1): one chassis panel
 * of native controls in the premium character, in three presentations side by side.
 * - **Instrument:** the panel is an enrolled layer of the I0 harness (`ui-probes/instrument-harness.ts`) with core's
 *   relief material for the machined plate, and a Lite mesh scene for its parts (`instrument-mesh.ts`).
 * - **Objects:** a copy of the panel, a second root child, presented by `@underglass/ui/gpu` at `level: "objects"` on
 *   the same controller (one shared engine): what the panel looks like when it steps down.
 * - **CSS:** a third copy outside the GPU frame, styled by the skeuomorphic recipe in the page's stylesheet.
 * The copies share their control state (a change in one is mirrored to the others). The tuning bar's values live in
 * the query string, so a variant is reproducible from its URL. Every copy's knobs behave round (`instrument-behaviour.ts`),
 * a display window reads the state out under glass, and the pointer light (a tuning-bar toggle) follows the pointer
 * over the stage. `?debug` decodes Lite's numeric errors; `?glassDebug=1` shows the glass's reflected radiance alone and
 * `?glassDebug=2` its Fresnel weight.
 *
 * `window.instrumentProto` drives `tests/browser/ui-proto-instrument.test.mjs`: `ready` resolves to the API with `set`
 * (tuning values), `state` (control states), `press` (hold the push buttons down), `settle`, `screenshot` (clip rects
 * for the screenshots and the token values behind them), the checks `containment`, `labelContrast`, `capLabels` (the
 * push button's label and the display's text against core's plain pass), `glass` (rim and magnification), `hits` and
 * `counts`, and `numerals`, `native` and `pointer` for the knob and pointer-light checks. Throwaway prototype code.
 */
import "@underglass/ui/css";
import { enableErrorDecoding, type Screenshot } from "@babylonjs/lite";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";
import { contrast, sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { studioTokens } from "../ui-probes/instrument-environment.ts";
import { startInstrument } from "../ui-probes/instrument-harness.ts";
import type { Point } from "../ui-probes/common.ts";
import { cssVariables } from "./instrument-css.ts";
import { attachFader, attachKnob, attachWheel } from "./instrument-behaviour.ts";
import { displayText, initialState, panelMarkup, type ControlState, type Level } from "./instrument-markup.ts";
import { createInstrumentMeshes } from "./instrument-mesh.ts";
import { characterLook, defaults, materialNames, materials, parseValues, queryOf, resolveTokens, type CharacterName, type TuningValues } from "./instrument-tokens.ts";

// `?debug`: Lite throws numeric error codes; decode them into messages.
if (new URLSearchParams(location.search).has("debug")) enableErrorDecoding();
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
const cssStage = document.getElementById("css-stage")!;
const form = document.getElementById("tuning") as HTMLFormElement;

let values = parseValues(location.search);
let tokens = resolveTokens(values);
// The character's room (`studio.*`) is the probe's studio tokens: set before any layer builds its surfaces.
Object.assign(studioTokens, tokens.character.room);
const state: ControlState = { ...initialState };
const settings = () => sceneSettings(strataTokens, { theme: values.theme, depth: values.depth / 100 });
const rgbOf = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];

/** Theme, depth and the presentations' custom properties on the root. */
function applyStyle() {
  const root = document.documentElement;
  root.setAttribute("data-strata-theme", values.theme);
  // Premium is the default and needs no attribute; the Objects copy follows any other from the stylesheet's blocks.
  if (values.character === "premium") root.removeAttribute("data-strata-character"); else root.setAttribute("data-strata-character", values.character);
  root.style.setProperty("--strata-depth", String(values.depth / 100));
  const stage = rgbOf(settings().backdrop), text = values.theme === "dark" ? [232, 234, 240] as const : [28, 30, 36] as const;
  for (const [name, value] of Object.entries(cssVariables(tokens, stage, text))) root.style.setProperty(name, value);
}

// The tuning bar: every input names its value; changes go to the URL and re-render the panels.
const inputs = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]")];
for (const select of form.querySelectorAll<HTMLSelectElement>("select[name$=Material]")) {
  if (select.name === "plateMaterial") select.add(new Option("Auto (theme)", "auto"));
  for (const name of materialNames) select.add(new Option(materials[name].label, name));
}
function showValues() {
  for (const input of inputs) {
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = values[input.name as keyof TuningValues] === 1;
    else input.value = String(values[input.name as keyof TuningValues]);
    const output = input.parentElement?.querySelector("output");
    if (output) output.textContent = input.name === "depth" ? `${values.depth}%` : String(values[input.name as keyof TuningValues]);
  }
}
showValues();
applyStyle();

const panels = {} as Record<Level, HTMLElement>;
// Declared before the harness starts: the mesh build reads core's upload counts through it.
let harnessRef: { controller: { state(): unknown } } | undefined;
const meshes = createInstrumentMeshes(() => tokens, {
  uploads: id => (harnessRef?.controller.state() as { metrics?: { perLayer?: Record<string, { uploads: number }> } } | undefined)?.metrics?.perLayer?.[id]?.uploads ?? -1,
  stage: () => ({ width: frame.clientWidth, height: frame.clientHeight }),
  interiorMax: settings().interior.max,
});
const envelopes = meshes.envelopes(tokens);
// Declared before the harness starts: its status callback may run while it mounts.
let strata: StrataGpu | undefined;

function makePanel(level: Level) {
  const panel = document.createElement("section");
  panel.id = `ip-${level}`;
  panel.className = `ip-panel ip-${level}${level === "objects" ? " ug-panel" : ""}`;
  panel.setAttribute("aria-label", `Monitor controller (${level})`);
  if (level === "objects") { panel.setAttribute("data-strata-face", "raised"); panel.setAttribute("data-strata-elevation", "floating"); panel.style.left = "524px"; }
  else panel.style.left = "0";
  panels[level] = panel;
  return panel;
}
/** Knob behaviour (I0.7): round on every copy's knobs; the fader gets the reset. Re-attached after every render. */
function attachBehaviour() {
  for (const level of ["instrument", "objects", "css"] as const) for (const input of panels[level].querySelectorAll<HTMLInputElement>("input[type=range]")) {
    const name = input.id.split("-")[0] as "volume" | "input" | "level";
    if (name === "level") { attachFader(input, () => initialState.level); continue; }
    const k = name === "volume" ? tokens.knob : tokens.small, max = Number(input.max);
    const numerals = name === "volume" ? Array.from({ length: 11 }, (_, index) => index * 10) : Array.from({ length: max + 1 }, (_, index) => index);
    attachKnob(input, () => ({ sweep: 270, capRadius: k.size / 2, numerals, value: Math.min(initialState[name], max) }));
  }
}
function render() {
  for (const level of ["instrument", "objects", "css"] as const) panels[level].innerHTML = panelMarkup(level, tokens, state);
  attachBehaviour();
  syncAll();
}
attachWheel(element => element.closest<HTMLInputElement>("input.ip-native[type=range]") ?? undefined);

/** Writes the shared state into every copy (and the CSS custom properties that follow it). */
function syncAll() {
  for (const level of ["instrument", "objects", "css"] as const) {
    const panel = panels[level];
    const set = (name: string, apply: (element: HTMLInputElement & HTMLButtonElement) => void) => { const element = panel.querySelector<HTMLInputElement & HTMLButtonElement>(`#${name}-${level}`); if (element) apply(element); };
    for (const name of ["volume", "input", "level"] as const) set(name, element => { element.value = String(state[name]); follow(element); });
    for (const name of ["mute", "power", "phono", "lights"] as const) set(name, element => { element.checked = state[name]; });
    set("rec", element => { element.setAttribute("aria-pressed", String(state.rec)); });
    // The readout under the display glass (a native text change: one capture, never per frame).
    const readout = panel.querySelector(`#display-${level} .ip-display-text`);
    if (readout && readout.textContent !== displayText(state)) readout.textContent = displayText(state);
  }
  for (const element of panels.instrument.querySelectorAll<HTMLElement>("[data-ip]")) meshes.update(element);
}
/** A range input's printed position (`--ip-v`) and its value text. */
function follow(input: HTMLInputElement) {
  const min = Number(input.min), max = Number(input.max), value = Number(input.value);
  input.closest<HTMLElement>(".ip-box")?.style.setProperty("--ip-v", String(max > min ? (value - min) / (max - min) : 0));
  const name = input.id.split("-")[0];
  input.setAttribute("aria-valuetext", name === "volume" ? `Volume ${(value / 10).toFixed(1)} of 10` : name === "level" ? `Level ${value}%` : `Input ${value}`);
}
/** A native change in one copy: mirror it into the shared state and the other copies. */
function changed(event: Event) {
  const element = event.target as HTMLInputElement;
  const name = element.id?.split("-")[0] as keyof ControlState | undefined;
  if (!name || !(name in state)) return;
  if (element.type === "range") (state as unknown as Record<string, number>)[name] = Number(element.value);
  else if (element.type === "checkbox") (state as unknown as Record<string, boolean>)[name] = element.checked;
  syncAll();
}

const harness = await startInstrument({
  frame, light: { azimuth: tokens.light.azimuth, elevation: tokens.light.elevation }, envelopes, budgets: { layers: 8, pixels: 8_000_000 }, shadowSupport: true,
  onStatus: message => { status.dataset.core = message; strata?.refresh(); },
  mount(root) {
    // The stage behind the panels: a plain layer in the theme's stage colour (core's own background is white).
    const stage = document.createElement("div");
    stage.id = "ip-stage";
    stage.setAttribute("aria-hidden", "true");
    Object.assign(stage.style, { position: "absolute", inset: "0", background: "var(--ip-stage)" });
    root.append(stage, makePanel("instrument"), makePanel("objects"));
    cssStage.append(makePanel("css"));
    render();
    // The harness enrolls the stage and the Instrument panel, in paint order; the Objects copy is enrolled by
    // `attachStrataGpu` below.
    return [stage, panels.instrument];
  },
  build: layer => meshes.build(layer),
}).catch(error => {
  status.textContent = `Instrument presentation unavailable: ${error}`;
  window.instrumentProto = { ready: Promise.reject(error), error: String(error) };
  throw error;
});
meshes.setDraw(() => harness.draw());
// Let the mesh scene's pipelines compile (its first frames) before the relief material and the Objects copy ask core
// for a successor composition: core gives a successor's shader compilation 1,500 ms, and the GPU process compiles
// one pipeline at a time, so compiling both at once could time core out to DOM (1 start in 8 without this wait).
for (let frame = 0; frame < 8; frame++) { harness.draw(); await new Promise(resolve => requestAnimationFrame(resolve)); }
await harness.idle();
harnessRef = harness;
// The pointer light (I0.3): the pointer in canvas CSS px, the toggle from the tuning bar.
meshes.setPointer({ enabled: values.pointer === 1 });
// The light exists while the pointer is over the stage (the GPU frame); it fades out when the pointer leaves it.
window.addEventListener("pointermove", event => {
  const box = canvasBox(), x = event.clientX - box.left, y = event.clientY - box.top;
  meshes.setPointer({ at: x >= 0 && y >= 0 && x <= box.width && y <= box.height ? { x, y } : null });
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => meshes.setPointer({ at: null }));

// The chassis plate: core's relief material, lit by the one key light, gives the machined edge and the drop shadow.
const reliefScene = () => ({
  format: "strata-scene" as const, version: 1 as const, extent: { width: panels.instrument.offsetWidth, height: panels.instrument.offsetHeight },
  outset: { top: 36, right: 36, bottom: 36, left: 36 }, ...settings(),
  primitives: [{ face: "raised" as const, rect: [0, 0, panels.instrument.offsetWidth, panels.instrument.offsetHeight] as [number, number, number, number], radius: 10, height: 8 * tokens.depthScale, material: "satin" }],
});
const reliefMaterial = () => ({ kind: "relief" as const, scene: reliefScene(), bounds: "layer" as const, interaction: "material" as const, media: "identity" as const, fallback: "static" as const });
let relief: { update(scene: ReturnType<typeof reliefScene>): void; cancel(): void } | undefined = harness.controller.setMaterial("ip-instrument", reliefMaterial());
strata = attachStrataGpu(harness.controller, { level: "objects", panels: "#ip-objects" });

for (const level of ["instrument", "objects", "css"] as const) {
  const panel = panels[level];
  panel.addEventListener("input", changed);
  panel.addEventListener("change", changed);
  panel.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".ip-button");
    if (button) { state.rec = !state.rec; syncAll(); }
  });
}
// The Instrument push button travels while it is held (pointer or keyboard).
panels.instrument.addEventListener("pointerdown", event => { const button = (event.target as HTMLElement).closest<HTMLElement>(".ip-button"); if (button) meshes.press(button, true); });
for (const type of ["pointerup", "pointercancel", "pointerleave"]) panels.instrument.addEventListener(type, event => { const button = (event.target as HTMLElement).closest<HTMLElement>(".ip-button"); if (button) meshes.press(button, false); }, true);
panels.instrument.addEventListener("keydown", event => { if ((event.key === " " || event.key === "Enter") && (event.target as HTMLElement).matches(".ip-button")) meshes.press(event.target as HTMLElement, true); });
panels.instrument.addEventListener("keyup", event => { if ((event.target as HTMLElement).matches(".ip-button")) meshes.press(event.target as HTMLElement, false); });

/** Applies new tuning values: style, URL, markup, the Instrument scene and the Objects scene. */
let applying: Promise<void> = Promise.resolve();
function set(next: Partial<TuningValues>) {
  applying = applying.then(async () => {
    values = { ...values, ...next };
    tokens = resolveTokens(values);
    Object.assign(studioTokens, tokens.character.room);
    history.replaceState(null, "", `${location.pathname}${queryOf(values)}`);
    showValues();
    applyStyle();
    meshes.setPointer({ enabled: values.pointer === 1 });
    // The new layout replaces the parts: the old ones leave the surface first, so no frame draws them over it.
    harness.setMeshes(false);
    render();
    envelopes.splice(0, envelopes.length, ...meshes.envelopes(tokens));
    relief?.update(reliefScene());
    await harness.controller.settle();
    await harness.rebuild();
    harness.setMeshes(true);
    strata?.refresh();
    await settle();
  });
  return applying;
}
form.addEventListener("input", event => {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  if (!input.name) return;
  const value = input instanceof HTMLSelectElement ? input.value : input.type === "checkbox" ? (input.checked ? 1 : 0) : Number(input.value);
  if (input.name === "pointer") { values = { ...values, pointer: value as number }; history.replaceState(null, "", `${location.pathname}${queryOf(values)}`); meshes.setPointer({ enabled: value === 1 }); return; }
  // A character brings its roles' materials and the room's strength; the bar can still tune them after.
  if (input.name === "character") { void set({ character: value as CharacterName, ...characterLook(value as CharacterName, values.theme).choose }); return; }
  void set({ [input.name]: value } as Partial<TuningValues>);
});
document.getElementById("t-reset")!.addEventListener("click", () => void set({ ...defaults }));

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
let shot: Screenshot | undefined;
/** Waits for layout, springs, CSS transitions and the GPU, then reads back a decoded frame. */
async function settle() {
  await harness.idle();
  for (let guard = 0; guard < 600 && !meshes.atRest(); guard++) await nextFrame();
  // CSS transitions on the Objects and CSS copies (160 ms at most), then a few frames for the Objects scene to follow.
  await new Promise(resolve => setTimeout(resolve, 260));
  strata?.refresh();
  for (let index = 0; index < 4; index++) { harness.draw(); await nextFrame(); }
  await harness.idle();
  shot = await harness.readback();
  describe();
}
function describe() {
  const camera = harness.camera(), counts = harness.counts();
  status.textContent = `camera ${camera.distance} px · ${counts.mode} · captures ${counts.captures} · ${queryOf(values) || "defaults"}`;
}

const canvasBox = () => harness.hosts.outputCanvas.getBoundingClientRect();
const luminanceOf = (r: number, g: number, b: number) => { const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
/** The device-pixel window of a client rect in the canvas, clamped. */
function deviceRect(box: DOMRect, image: Screenshot) {
  const canvas = canvasBox(), dpr = harness.dpr;
  return { x0: Math.max(0, Math.ceil((box.left - canvas.left) * dpr)), y0: Math.max(0, Math.ceil((box.top - canvas.top) * dpr)),
    x1: Math.min(image.width, Math.floor((box.right - canvas.left) * dpr)), y1: Math.min(image.height, Math.floor((box.bottom - canvas.top) * dpr)) };
}
/** Text-bearing print of a panel (each element whose own text is not in a nested print element), and the cap labels. */
const printed = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>(".ip-print, .ip-cap-label")]
  .filter(element => element.textContent!.trim() && !element.querySelector(".ip-print"))
  .flatMap(element => (element.children.length && element.classList.contains("ip-mark") ? [...element.children] as HTMLElement[] : [element]));
/** Contrast of a text element from decoded pixels: the median colour is the face, the darkest (or lightest) 1% the ink. */
function measure(element: HTMLElement, image: Screenshot) {
  const { x0, y0, x1, y1 } = deviceRect(element.getBoundingClientRect(), image);
  const values: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const offset = (y * image.width + x) * 4; values.push(luminanceOf(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)); }
  values.sort((a, b) => a - b);
  if (values.length < 4) return { text: element.textContent!.trim(), ratio: 0, pixels: values.length };
  const face = values[Math.floor(values.length / 2)]!, dark = values[Math.floor(values.length * 0.01)]!, light = values[Math.floor(values.length * 0.99)]!;
  const ink = face - dark > light - face ? dark : light;
  return { text: element.textContent!.trim(), ratio: (Math.max(face, ink) + 0.05) / (Math.min(face, ink) + 0.05), pixels: values.length };
}
/** The rounded box of a native control, in client px. */
const controlBox = (element: Element) => {
  const box = element.getBoundingClientRect(), radius = getComputedStyle(element).borderTopLeftRadius;
  const r = radius.endsWith("%") ? (Number.parseFloat(radius) / 100) * box.width : Number.parseFloat(radius) || 0;
  return { id: element.id, x: box.left, y: box.top, width: box.width, height: box.height, radius: r };
};
const rounded = (point: Point, box: { x: number; y: number; width: number; height: number; radius: number }) => {
  const radius = Math.min(box.radius, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};

const api = {
  dpr: harness.dpr,
  values: () => ({ ...values }),
  /** The resolved numbers behind the current look (for `variants.json`). */
  tokens: () => ({ ...tokens, camera: harness.camera() }),
  set,
  /** Sets control states in every copy, as native values; resolves once everything has settled. */
  async state(next: Partial<ControlState>) { Object.assign(state, next); syncAll(); await settle(); },
  /** Holds (or releases) the Instrument push button as a pointer would, for screenshots of its travel. */
  async press(down: boolean) { meshes.press(panels.instrument.querySelector(".ip-button")!, down); await settle(); },
  settle,
  /** Client rects to clip screenshots to: the page, each presentation, and a control in every copy. */
  screenshot(name: string) {
    const rect = (element: Element, pad = 0) => { const box = element.getBoundingClientRect(); return { x: Math.max(0, box.left - pad), y: Math.max(0, box.top - pad), width: box.width + 2 * pad, height: box.height + 2 * pad }; };
    if (name === "page") return { x: 0, y: 0, width: innerWidth, height: innerHeight };
    if (name in panels) return rect(panels[name as Level], 14);
    const control = panels.instrument.querySelector(`[data-control="${name}"]`);
    if (!control) throw new Error(`No screenshot region ${name}`);
    return rect(control, 10);
  },
  /** Controls of each copy, for the test's own pointer input. */
  controls: (level: Level) => [...panels[level].querySelectorAll("[data-ip]")].map(controlBox),
  checked: (level: Level) => Object.fromEntries([...panels[level].querySelectorAll<HTMLInputElement>("input[type=checkbox]")].map(input => [input.id, input.checked])),
  /**
   * Mesh pass on (shadows off: they are face shading) against off, pixel for pixel: every changed pixel must lie in the
   * rounded box of an Instrument control, and native hit testing at a sample of them must find that control.
   */
  async containment(samples = 3000) {
    // The pointer light is face light (its pass leaves with the meshes), so it is off for the comparison.
    meshes.setPointer({ suspended: true });
    meshes.setShadows(false);
    await settle();
    const on = shot!;
    harness.setMeshes(false);
    await settle();
    const off = shot!;
    harness.setMeshes(true);
    meshes.setShadows(true);
    meshes.setPointer({ suspended: false });
    await settle();
    const canvas = canvasBox(), dpr = harness.dpr, boxes = [...panels.instrument.querySelectorAll("[data-ip]")].map(controlBox);
    const result = { changed: 0, outside: 0, outsideSamples: [] as { x: number; y: number; distance: number }[], perControl: {} as Record<string, number>, hits: 0, hitMismatches: [] as { x: number; y: number; id: string; expected: string }[] };
    const points: { x: number; y: number; id: string }[] = [];
    for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
      const offset = (y * on.width + x) * 4;
      if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
      result.changed++;
      const point = { x: canvas.left + (x + 0.5) / dpr, y: canvas.top + (y + 0.5) / dpr };
      let owner = "", distance = Infinity;
      for (const box of boxes) { const d = rounded(point, box); if (d < distance) { distance = d; owner = box.id; } }
      if (distance > 0) { result.outside++; if (result.outsideSamples.length < 12) result.outsideSamples.push({ ...point, distance }); continue; }
      result.perControl[owner] = (result.perControl[owner] ?? 0) + 1;
      if (distance <= -1) points.push({ ...point, id: owner });
    }
    const step = Math.max(1, Math.floor(points.length / samples));
    for (let index = 0; index < points.length; index += step) {
      const point = points[index]!, hit = document.elementFromPoint(point.x, point.y)?.closest("[data-ip]")?.id ?? "";
      result.hits++;
      if (hit !== point.id && result.hitMismatches.length < 10) result.hitMismatches.push({ ...point, id: hit, expected: point.id });
    }
    return result;
  },
  /** Decoded contrast of every printed label on the Instrument and Objects faceplates (GPU frame). */
  async labelContrast() {
    await settle();
    return Object.fromEntries((["instrument", "objects"] as const).map(level => [level, printed(panels[level]).map(element => measure(element, shot!))]));
  },
  /** Client rects and texts of the CSS copy's print, for the test to measure on a page screenshot. */
  cssPrint: () => printed(panels.css).map(element => { const box = element.getBoundingClientRect(); return { text: element.textContent!.trim(), x: box.left, y: box.top, width: box.width, height: box.height }; }),
  /**
   * The push button's captured label with the mesh pass on, against core's plain pass of the same layer (mesh pass
   * off, relief removed), which presents the capture texel for texel.
   */
  async capLabels() {
    meshes.setPointer({ suspended: true });
    await settle();
    const on = shot!;
    relief?.cancel();
    harness.setMeshes(false);
    await settle();
    const reference = shot!;
    relief = harness.controller.setMaterial("ip-instrument", reliefMaterial());
    harness.setMeshes(true);
    meshes.setPointer({ suspended: false });
    await settle();
    const compare = (box: DOMRect) => {
      const { x0, y0, x1, y1 } = deviceRect(box, on);
      let compared = 0, mismatched = 0;
      const colours = new Set<string>(), samples: { x: number; y: number; on: number[]; plain: number[] }[] = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const offset = (y * on.width + x) * 4;
        compared++;
        if (on.data[offset] !== reference.data[offset] || on.data[offset + 1] !== reference.data[offset + 1] || on.data[offset + 2] !== reference.data[offset + 2]) {
          mismatched++;
          if (samples.length < 6) samples.push({ x: x - x0, y: y - y0, on: [...on.data.subarray(offset, offset + 3)], plain: [...reference.data.subarray(offset, offset + 3)] });
        }
        colours.add(`${on.data[offset]},${on.data[offset + 1]},${on.data[offset + 2]}`);
      }
      return { compared, mismatched, colours: colours.size, size: [x1 - x0, y1 - y0], samples };
    };
    // The display's text region (its text runs, which the glass protects) and the window outside it, where the finish
    // zone and the bevel make the glass visible.
    const text = panels.instrument.querySelector<HTMLElement>(".ip-display-text")!, range = document.createRange();
    range.selectNodeContents(text);
    const runs = range.getBoundingClientRect(), display = panels.instrument.querySelector(".ip-display")!.getBoundingClientRect(), border = tokens.display.border;
    const windowRect = new DOMRect(display.left + border, display.top + border, display.width - 2 * border, display.height - 2 * border);
    const { x0, y0, x1, y1 } = deviceRect(windowRect, on), guard = deviceRect(new DOMRect(runs.left - 2, runs.top - 2, runs.width + 4, runs.height + 4), on);
    let pixels = 0, changed = 0, sum = 0, max = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x >= guard.x0 && x < guard.x1 && y >= guard.y0 && y < guard.y1) continue;
      const offset = (y * on.width + x) * 4, delta = Math.max(...[0, 1, 2].map(channel => Math.abs(on.data[offset + channel]! - reference.data[offset + channel]!)));
      pixels++;
      if (delta) { changed++; sum += delta; max = Math.max(max, delta); }
    }
    return { ...compare(panels.instrument.querySelector(".ip-cap-label")!.getBoundingClientRect()),
      display: { text: compare(runs), window: { pixels, changed, meanDelta: changed ? sum / changed : 0, maxDelta: max }, textContrast: measure(text, on).ratio } };
  },
  /**
   * The glass cap on the volume knob (set `capMaterial: "glass"` first), the meshes on against the plain presentation:
   * the rim (the dome's outer 2 px, projected at its height) in 8-bit luma levels, and the magnification of the
   * printed hub ring under the dome's centre (the darkest radius along 16 rays, median, on against off).
   */
  async glass() {
    meshes.setPointer({ suspended: true });
    await settle();
    const on = shot!;
    harness.setMeshes(false);
    await settle();
    const off = shot!;
    harness.setMeshes(true);
    meshes.setPointer({ suspended: false });
    await settle();
    const input = panels.instrument.querySelector<HTMLInputElement>("#volume-instrument")!, box = input.getBoundingClientRect(), canvas = canvasBox(), dpr = harness.dpr, camera = harness.camera();
    const k = tokens.knob, rc = k.dome.radius, rimHeight = k.skirtHeight + k.dome.wall;
    const centre = { x: box.left + box.width / 2 - canvas.left, y: box.top + box.height / 2 - canvas.top };
    // A point h above the face projects away from the stage centre by D / (D − h).
    const project = (h: number) => { const scale = camera.distance / (camera.distance - h); return { x: camera.width / 2 + (centre.x - camera.width / 2) * scale, y: camera.height / 2 + (centre.y - camera.height / 2) * scale, scale }; };
    const luma = (image: Screenshot, x: number, y: number) => { const offset = (Math.round(y) * image.width + Math.round(x)) * 4; return 0.2126 * image.data[offset]! + 0.7152 * image.data[offset + 1]! + 0.0722 * image.data[offset + 2]!; };
    const rim = project(rimHeight), band: { on: number; off: number }[] = [];
    for (let y = Math.floor((rim.y - rc - 2) * dpr); y <= Math.ceil((rim.y + rc + 2) * dpr); y++) for (let x = Math.floor((rim.x - rc - 2) * dpr); x <= Math.ceil((rim.x + rc + 2) * dpr); x++) {
      const r = Math.hypot((x + 0.5) / dpr - rim.x, (y + 0.5) / dpr - rim.y) / rim.scale;
      if (r < rc - 2 || r > rc) continue;
      band.push({ on: luma(on, x, y), off: luma(off, x, y) });
    }
    band.sort((a, b) => (b.on - b.off) - (a.on - a.off));
    const mean = (list: { on: number; off: number }[]) => list.reduce((total, item) => total + item.on - item.off, 0) / Math.max(1, list.length);
    const brightest = band.slice(0, Math.max(1, Math.floor(band.length / 4)));
    // The hub ring: along each ray, the radius furthest in luma from the ray's median (its ink, dark on a light plate
    // and light on a dark one), on and off.
    const ring = (image: Screenshot, at: { x: number; y: number }) => Array.from({ length: 16 }, (_, index) => {
      const angle = ((index + 0.5) / 16) * Math.PI * 2, samples: [number, number][] = [];
      for (let r = 2; r <= rc * 0.85; r += 0.25) samples.push([r, luma(image, (at.x + Math.sin(angle) * r) * dpr, (at.y - Math.cos(angle) * r) * dpr)]);
      const middle = [...samples].map(([, value]) => value).sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
      return samples.reduce((best, sample) => (Math.abs(sample[1] - middle) > Math.abs(best[1] - middle) ? sample : best))[0];
    }).sort((a, b) => a - b);
    const median = (list: number[]) => list[Math.floor(list.length / 2)]!;
    const plain = ring(off, centre), through = ring(on, project(0));
    return { pixels: band.length, rimMean: mean(band), rimArc: mean(brightest), rimMax: band.length ? band[0]!.on - band[0]!.off : 0,
      hub: { plain: median(plain), through: median(through), factor: median(through) / median(plain), rays: { plain, through } } };
  },
  /** The printed numerals of a knob (Instrument copy): text and client centre. */
  numerals: (name: "volume" | "input") => [...panels.instrument.querySelectorAll<HTMLElement>(`[data-control="${name}"] .ip-numeral`)].map(element => { const box = element.getBoundingClientRect(); return { text: element.textContent!, x: box.left + box.width / 2, y: box.top + box.height / 2 }; }),
  /** A control's native value, its value text and whether it has focus. */
  native: (id: string) => { const element = document.getElementById(id) as HTMLInputElement; return { value: Number(element.value), text: element.getAttribute("aria-valuetext"), focused: document.activeElement === element }; },
  pointer: () => meshes.pointerState(),
  info: () => meshes.info(),
  /** The control native hit testing finds at points inside each Instrument control (centre and near each edge). */
  hits() {
    return [...panels.instrument.querySelectorAll<HTMLElement>("[data-ip]")].map(element => {
      const box = element.getBoundingClientRect(), round = getComputedStyle(element).borderTopLeftRadius.endsWith("%");
      const inset = round ? box.width * 0.18 : 3;
      const points = [[box.left + box.width / 2, box.top + box.height / 2], [box.left + inset, box.top + box.height / 2], [box.right - inset, box.top + box.height / 2],
        [box.left + box.width / 2, box.top + inset], [box.left + box.width / 2, box.bottom - inset]];
      return { id: element.id, found: points.map(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-ip]")?.id ?? "") };
    });
  },
  counts: () => harness.counts(),
  diagnostics: () => [...harness.diagnostics],
  camera: () => harness.camera(),
  browser: () => navigator.userAgent,
  contrastOf: (a: [number, number, number], b: [number, number, number]) => contrast(a, b),
};
type InstrumentProtoApi = typeof api;
declare global { interface Window { instrumentProto: { ready: Promise<InstrumentProtoApi>; error?: string } } }
await settle();
window.instrumentProto = { ready: Promise.resolve(api) };
