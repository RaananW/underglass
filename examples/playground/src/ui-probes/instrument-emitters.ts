/**
 * Instrument probe I0.3, emitters and the pointer light (docs/ui-library/instrument.md, Phase I0): can a lit lamp light
 * the captured face, nearby objects and the outset without breaking the contrast guard or native hits, and can the
 * pointer light move across panels at 60 fps at the Relief, Objects and Instrument levels?
 *
 * Four enrolled layers fill the window, bottom to top: `#stage` (the plain page, so a dark stage is drawn and lit too)
 * and three overlapping panels `#a`, `#b`, `#c` of native controls: lamps (`<input type="checkbox" role="switch">`, the
 * lens is the control), LEDs (`<span role="img">`), keys (`<button>`), knobs (`<input type="range">`) and text labels.
 * `#c`'s power lamp is the brightest and sits right beside its label, near `#c`'s left edge, which lies over `#b`;
 * `#c`'s corner lamp sits near its bottom edge, which lies over the stage.
 *
 * **How the light is drawn (the prototype path).** Every emitter (a lit lamp or LED, the pointer light) is a point light
 * at a height above the face, with the falloff of Lite's clustered lights: radiance `I · colour / d²`, windowed by
 * `(1 − (d² / R²)²)²` so it reaches zero at the radius `R`.
 * - **The face and the outset:** one Lite effect task per layer, first in that layer's probe scene, so core draws it
 *   right after the layer's own pass (core's Phase I0 `InstrumentProbeHook`; no core change). It shades the layer's
 *   box grown by the shadow outset with blend `dst · src + dst`, so whatever is already on the canvas there (the
 *   captured face with its relief shading, the page or a lower panel past the edge) is multiplied by `1 + E`, with
 *   `E = I · colour · cos θ / (π d²) · window` per emitter: diffuse light on the captured colour as albedo. Text and its
 *   face get the same factor, and inside the protected rects (the boxes of the layer's text, grown by `feather`) `E` is
 *   capped at `interior.max` per channel. A panel's own lamps light its box and outset; the pointer light lights each
 *   layer's own rounded box only, so where layers overlap it is never applied twice.
 * - **Objects (Instrument level):** each panel's mesh scene carries a Lite clustered light container with one clustered
 *   point light per emitter of that panel plus the pointer, at the same position, colour, intensity and radius, so the
 *   PBR parts (knob caps, key bodies, lamp bezels) catch the same light.
 * - **The lamp itself:** a lens mesh, emissive when on (Instrument); a dome object coloured by state (Objects); the
 *   control's own CSS paint (Relief).
 * - **Preferences:** `prefers-contrast: more` turns every emitter off and draws a lit lens as flat unlit colour;
 *   `forced-colors: active` turns emitters and parts off (the page stays flat). The pointer light exists only under
 *   `pointer: fine`, and `prefers-reduced-motion` removes its fade.
 *
 * Levels: `relief` (core's relief material on each panel, the controls paint their faces), `objects` (core's objects
 * material: a key object and dome knobs and lenses), `instrument` (a relief face plus meshes after it). The light pass
 * is the same at every level. `?level=` and `?theme=light|dark` set the start; `window.emitterProbe` drives the browser
 * test (`tests/browser/ui-probe-instrument-emitters.test.mjs`).
 */
import {
  addClusteredLightContainer, addTaskAtStart, createClusteredLightContainer, createClusteredPointLight, createEffectRenderTask,
  createEffectWrapper, createPbrMaterial, getRenderTaskGpuTimings, isGpuTimingSupported, markClusteredLightContainerDirty, setEffectUniforms,
  setGpuTimingEnabled, setPbrEmissive, setPbrUnlit, setRenderTaskGpuTimingEnabled,
  type ClusteredLightContainer, type ClusteredPointLight, type EffectWrapper, type EngineContext, type Material, type PbrMaterialProps, type Screenshot,
} from "@babylonjs/lite";
import { sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { bar, frustum, plate, revolve } from "./instrument-parts.ts";
import { startInstrument, type InstrumentLayer, type PartKind, type Rect } from "./instrument-harness.ts";
import type { Point } from "./common.ts";

type Level = "relief" | "objects" | "instrument";
type Theme = "light" | "dark";
type Rgb = [number, number, number];
const params = new URLSearchParams(location.search);
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
let level: Level = (["relief", "objects", "instrument"] as const).find(value => value === params.get("level")) ?? "instrument";
let theme: Theme = params.get("theme") === "dark" ? "dark" : "light";
frame.dataset.level = level;
document.body.dataset.theme = theme;
let settings = sceneSettings(strataTokens, { theme, depth: 0.5 });
const media = {
  contrast: matchMedia("(prefers-contrast: more)"), forced: matchMedia("(forced-colors: active)"),
  fine: matchMedia("(pointer: fine)"), reduced: matchMedia("(prefers-reduced-motion: reduce)"),
};
const motionFast = parseFloat(String((strataTokens as unknown as { motion: { fast: { $value: string } } }).motion.fast.$value)) || 120;

/** Probe tokens (Phase I1 sets the real values), in CSS px. */
const tokens = {
  light: settings.light,
  interiorMax: settings.interior.max,
  /** The guard's ramp outside a protected rect, so the capped region has no hard edge. */
  feather: Number(params.get("feather") ?? 4),
  /** The relief outset (P0.5) and the light pass's outset: lamp light past a panel's edge draws here. */
  outset: 48,
  /** Lamps: a 28 px lens; the emitter sits `height` above the face and reaches `reach` lens diameters. */
  lamp: { diameter: 28, height: 20, reach: 6, intensity: 3200, colour: [1, 0.72, 0.38] as Rgb, bright: 1.5 },
  led: { diameter: 10, height: 8, reach: 6, intensity: 520, colour: [0.35, 1, 0.45] as Rgb },
  /** The pointer light: `pointerLight: { strength, radius, height, colour }`, faded over `motion.fast`. */
  pointer: { intensity: 16000, radius: 360, height: 120, colour: [1, 0.95, 0.88] as Rgb, fade: motionFast },
  /** Per-pass capacity of the light pass (the cost probe goes to 256); the recommended budget is decided by I0.3. */
  capacity: { emitters: 260, rects: 64 },
  key: { rise: 6, taper: 3, travel: 3 },
  knob: { collar: 2, cap: 10.4, inset: 4 },
};
// Tallest point of each part and its inset from the control's box: the camera distance follows from these.
const envelopes = [{ height: 10.5, inset: 3.5 }, { height: tokens.knob.cap + 0.6, inset: tokens.knob.inset }, { height: tokens.key.rise, inset: tokens.key.taper }, { height: 4, inset: 1.5 }];

const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = (r: number, g: number, b: number): [number, number, number, number] => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];
const pbr = (colour: [number, number, number, number], metallic: number, roughness: number, emissive?: Rgb, unlit?: Rgb) => {
  const material = createPbrMaterial({ baseColorFactor: colour, metallicFactor: metallic, roughnessFactor: roughness, doubleSided: true });
  if (emissive) setPbrEmissive(material as unknown as PbrMaterialProps, emissive);
  if (unlit) setPbrUnlit(material as unknown as PbrMaterialProps, unlit);
  return material as unknown as Material;
};
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const statistics = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { samples: values.length, mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
};

// ---------------------------------------------------------------------------------------------------------------
// The panels

let stage!: HTMLElement;
const panels: HTMLElement[] = [];
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
/** One panel: a heading, a lamp beside its label and caption, an LED, a key and a knob, a note, and a corner lamp. */
function fillPanel(panel: HTMLElement, name: string, lampLabel: string, keyLabel: string, corner?: string) {
  const id = panel.id;
  const lamp = element("input", { type: "checkbox", role: "switch", id: `${id}-lamp`, class: "emitter-lamp", "data-emitter": "lamp", "aria-labelledby": `${id}-lamp-label` });
  const powerRow = element("div", { class: "emitter-row" });
  powerRow.append(lamp, element("span", { id: `${id}-lamp-label`, class: "emitter-label" }, lampLabel), element("span", { id: `${id}-lamp-caption`, class: "emitter-caption" }, "Lamp light on text stays under 4%"));
  const ledRow = element("div", { class: "emitter-row" });
  ledRow.append(element("span", { role: "img", id: `${id}-led`, class: "emitter-led", "data-emitter": "led", "aria-label": "Signal present" }), element("span", { id: `${id}-led-label`, class: "emitter-label" }, "Signal"));
  const controlRow = element("div", { class: "emitter-row" });
  const knob = element("input", { type: "range", min: "0", max: "100", value: "35", id: `${id}-knob`, class: "emitter-knob", "data-part": "knob", "aria-label": `${name} gain` });
  controlRow.append(element("button", { type: "button", id: `${id}-key`, "data-part": "key" }, keyLabel), knob, element("span", { id: `${id}-knob-label`, class: "emitter-label" }, "Gain"));
  const note = element("p", { id: `${id}-note`, class: "emitter-note" }, "A lit lamp lights the faceplate, the parts near it and the page past the panel's edge.");
  panel.replaceChildren(element("h2", { id: `${id}-title` }, name), powerRow, ledRow, controlRow, note);
  if (corner) {
    const wrapper = element("div", { class: "emitter-corner" });
    wrapper.style.right = "18px"; wrapper.style.bottom = "16px";
    wrapper.append(element("span", { id: `${id}-corner-label`, class: "emitter-label" }, corner),
      element("input", { type: "checkbox", role: "switch", id: `${id}-corner`, class: "emitter-lamp", "data-emitter": "lamp", "aria-labelledby": `${id}-corner-label` }));
    panel.append(wrapper);
  }
}
/** Three overlapping panels: `#b` overlaps `#a`'s right side, `#c` overlaps `#b`'s right side and ends over the stage. */
function layout() {
  const width = frame.clientWidth, height = frame.clientHeight;
  const place = (panel: HTMLElement, x: number, y: number, w: number, h: number) =>
    Object.assign(panel.style, { left: `${Math.round(width * x)}px`, top: `${Math.round(height * y)}px`, width: `${Math.round(width * w)}px`, height: `${Math.round(height * h)}px` });
  place(panels[0]!, 0.06, 0.2, 0.34, 0.52);
  place(panels[1]!, 0.34, 0.08, 0.32, 0.54);
  place(panels[2]!, 0.6, 0.14, 0.33, 0.58);
}

// ---------------------------------------------------------------------------------------------------------------
// Emitters and the light pass

interface Emitter {
  id: string;
  /** The layer whose light pass and clustered container carry it; the pointer is in every layer within reach. */
  layer: string;
  element?: HTMLElement;
  /** Canvas CSS px and height above the face (CSS px). */
  x: number; y: number; height: number; radius: number;
  colour: Rgb; intensity: number;
  /** Whether it lights the layer's outset too (a panel's own lamps), or only the layer's own box (the pointer). */
  outset: boolean;
  kind: "lamp" | "led" | "pointer" | "cost";
}
const emitters = new Map<string, Emitter>();
const pointerEmitter: Emitter = { id: "pointer", layer: "*", x: -1e4, y: -1e4, height: tokens.pointer.height, radius: tokens.pointer.radius,
  colour: tokens.pointer.colour, intensity: tokens.pointer.intensity, outset: false, kind: "pointer" };
const pointer = { enabled: true, inside: false, client: { x: 0, y: 0 }, alpha: 0, moved: false };
let guardOn = true;
let costCount = 0;
const emittersAllowed = () => !media.contrast.matches && !media.forced.matches;

/**
 * Light pass uniforms (vec4s): a header (dpr, frame size, emitter count; draw bounds; box; guard; box radius and the
 * tiling switch), the protected rects, two per emitter, then the tiles: the draw bounds split into `TILES` cells, each
 * with a bit mask of the emitters that reach it, so a pixel loops over the emitters of its own tile only.
 */
const HEADER = 5;
const TILES = { x: 16, y: 9 };
const WORDS = Math.ceil(tokens.capacity.emitters / 32), TILE_VEC4S = Math.ceil(WORDS / 4);
const EMITTER_BASE = HEADER + tokens.capacity.rects, TILE_BASE = EMITTER_BASE + tokens.capacity.emitters * 2;
const VEC4S = TILE_BASE + TILES.x * TILES.y * TILE_VEC4S;
/** dst · src + dst: the canvas beneath is multiplied by 1 + E. Alpha is kept. */
const lightBlend: GPUBlendState = { color: { srcFactor: "dst", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" } };
const lightWGSL = {
  vertex: /* wgsl */ `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn effectFullscreenVertex(@builtin(vertex_index) vertex: u32) -> EffectVertexOutput {
  // light[1]: the draw bounds and light[0].yz: the frame size, in canvas CSS px.
  let bounds = light[1];
  let size = max(light[0].yz, vec2f(1.0));
  let corner = vec2f(f32(vertex == 1u), f32(vertex == 2u)) * 2.0;
  let at = bounds.xy + corner * (bounds.zw - bounds.xy);
  var output: EffectVertexOutput;
  output.position = vec4f(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
  output.uv = corner;
  return output;
}`,
  fragment: /* wgsl */ `@group(0) @binding(0) var<uniform> light: array<vec4f, ${VEC4S}>;
fn lightBox(p: vec2f, rect: vec4f, radius: f32) -> f32 {
  let half = (rect.zw - rect.xy) * 0.5;
  let q = abs(p - (rect.xy + half)) - half + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
// Emitter j's light at p: Lite's clustered falloff (inverse square, a smooth window to zero at the radius), times cos θ
// at the face, over π. An emitter with a negative radius lights only inside the layer's own box.
fn lightEmitter(p: vec2f, j: u32, inBox: bool) -> vec3f {
  let a = light[${EMITTER_BASE}u + 2u * j];
  let b = light[${EMITTER_BASE + 1}u + 2u * j];
  if (a.w < 0.0 && !inBox) { return vec3f(0.0); }
  let r = p - a.xy;
  let d2 = dot(r, r) + a.z * a.z;
  let range2 = a.w * a.w;
  if (d2 >= range2) { return vec3f(0.0); }
  let f = d2 / range2;
  let window = (1.0 - f * f) * (1.0 - f * f);
  return b.rgb * (b.w * window * a.z / (sqrt(d2) * d2 * 3.141592653589793));
}
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
  let p = input.position.xy / light[0].x;
  let bounds = light[1];
  if (p.x < bounds.x || p.y < bounds.y || p.x > bounds.z || p.y > bounds.w) { discard; }
  let inBox = lightBox(p, light[2], light[4].x) <= 0.0;
  var e = vec3f(0.0);
  let count = u32(light[0].w);
  if (light[4].y > 0.5) {
    // Tiled: only the emitters whose reach overlaps this pixel's tile.
    let cell = clamp(vec2i(floor((p - bounds.xy) / max(bounds.zw - bounds.xy, vec2f(1.0)) * vec2f(${TILES.x}.0, ${TILES.y}.0))), vec2i(0), vec2i(${TILES.x - 1}, ${TILES.y - 1}));
    let tile = u32(cell.y) * ${TILES.x}u + u32(cell.x);
    for (var w = 0u; w < (count + 31u) / 32u; w++) {
      var mask = bitcast<vec4u>(light[${TILE_BASE}u + tile * ${TILE_VEC4S}u + w / 4u])[w % 4u];
      while (mask != 0u) {
        let bit = firstTrailingBit(mask);
        mask = mask ^ (1u << bit);
        e += lightEmitter(p, w * 32u + bit, inBox);
      }
    }
  } else {
    for (var j = 0u; j < count; j++) { e += lightEmitter(p, j, inBox); }
  }
  // The contrast guard: inside a protected rect (and over the feather ramp around it) E is capped at interior.max.
  let guard = light[3];
  if (guard.w > 0.5) {
    var protect = 0.0;
    for (var k = 0u; k < u32(guard.z); k++) {
      protect = max(protect, 1.0 - smoothstep(0.0, guard.y, lightBox(p, light[${HEADER}u + k], 0.0)));
    }
    e = mix(e, min(e, vec3f(guard.x)), protect);
  }
  return vec4f(e, 1.0);
}`,
};
let tiled = params.get("tiles") !== "0";
let lightEnabled = true;

interface LightLayer {
  id: string; layer: InstrumentLayer; effect: EffectWrapper; data: Float32Array;
  /** The layer's box and its light pass's draw bounds, canvas CSS px. */
  box: Rect; bounds: [number, number, number, number]; radius: number;
  rects: Rect[]; droppedRects: number;
  container?: ClusteredLightContainer; clustered: Map<string, ClusteredPointLight>;
  parts: Record<string, PartKind>;
}
const lights = new Map<string, LightLayer>();
let clusteredMode: "clustered" | "none" | "failed" = "none";
const clusteredErrors: string[] = [];

/** The emitters a layer's light pass and container carry now, with their current intensity (0 when off). */
function emittersOf(entry: LightLayer) {
  const list: { emitter: Emitter; intensity: number }[] = [];
  const reach = (emitter: Emitter) => {
    const [x0, y0, x1, y1] = entry.bounds, dx = Math.max(x0 - emitter.x, 0, emitter.x - x1), dy = Math.max(y0 - emitter.y, 0, emitter.y - y1);
    return Math.hypot(dx, dy) < emitter.radius;
  };
  for (const emitter of emitters.values()) {
    if (emitter.layer !== entry.id) continue;
    const on = emitter.kind === "cost" || emitter.kind === "led" || (emitter.element as HTMLInputElement | undefined)?.checked === true;
    list.push({ emitter, intensity: on && emittersAllowed() ? emitter.intensity : 0 });
  }
  // The pointer light is written into every layer within its reach.
  if (pointer.enabled && reach(pointerEmitter)) list.push({ emitter: pointerEmitter, intensity: emittersAllowed() ? pointerEmitter.intensity * pointer.alpha : 0 });
  return list;
}
/** Writes a layer's light pass uniforms (with the tile masks) and its clustered lights from the current emitters. */
function writeLayer(entry: LightLayer) {
  const data = entry.data, words = new Uint32Array(data.buffer);
  const list = lightEnabled ? emittersOf(entry).filter(item => item.intensity > 0).slice(0, tokens.capacity.emitters) : [];
  data.fill(0);
  data.set([harness ? harness.dpr : window.devicePixelRatio, frame.clientWidth, frame.clientHeight, list.length], 0);
  data.set(entry.bounds, 4);
  data.set([entry.box.x, entry.box.y, entry.box.x + entry.box.width, entry.box.y + entry.box.height], 8);
  data.set([tokens.interiorMax, tokens.feather, entry.rects.length, guardOn ? 1 : 0], 12);
  data.set([entry.radius, tiled ? 1 : 0, 0, 0], 16);
  entry.rects.forEach((rect, index) => data.set([rect.x, rect.y, rect.x + rect.width, rect.y + rect.height], (HEADER + index) * 4));
  const [x0, y0, x1, y1] = entry.bounds, cell = { x: Math.max(1, x1 - x0) / TILES.x, y: Math.max(1, y1 - y0) / TILES.y };
  const clampTile = (value: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor(value)));
  list.forEach(({ emitter, intensity }, index) => {
    data.set([emitter.x, emitter.y, emitter.height, emitter.outset ? emitter.radius : -emitter.radius, ...emitter.colour, intensity], (EMITTER_BASE + index * 2) * 4);
    // Every tile the emitter's reach overlaps gets its bit.
    const reach = Math.sqrt(Math.max(0, emitter.radius ** 2 - emitter.height ** 2));
    const tx0 = clampTile((emitter.x - reach - x0) / cell.x, TILES.x), tx1 = clampTile((emitter.x + reach - x0) / cell.x, TILES.x);
    const ty0 = clampTile((emitter.y - reach - y0) / cell.y, TILES.y), ty1 = clampTile((emitter.y + reach - y0) / cell.y, TILES.y);
    if (emitter.x + reach < x0 || emitter.x - reach > x1 || emitter.y + reach < y0 || emitter.y - reach > y1) return;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const at = (TILE_BASE + (ty * TILES.x + tx) * TILE_VEC4S) * 4 + (index >> 5); words[at] = (words[at] ?? 0) | (1 << (index & 31)); }
  });
  setEffectUniforms(entry.effect, data);
  if (entry.container) {
    const current = new Map(emittersOf(entry).map(item => [item.emitter.id, item]));
    for (const [id, light] of entry.clustered) {
      const item = current.get(id), emitter = item?.emitter ?? (id === "pointer" ? pointerEmitter : emitters.get(id));
      if (emitter) light.position = entry.layer.world(emitter.x - entry.layer.origin.x, emitter.y - entry.layer.origin.y, emitter.height);
      light.intensity = lightEnabled ? item?.intensity ?? 0 : 0;
    }
    markClusteredLightContainerDirty(entry.container);
  }
}
const writeAll = () => { for (const entry of lights.values()) writeLayer(entry); };

/** Layer-local boxes of every text run in `panel` (the protected rects), at most the capacity. */
function textRects(layer: InstrumentLayer) {
  const base = layer.element.getBoundingClientRect(), rects: Rect[] = [];
  const walker = document.createTreeWalker(layer.element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) rects.push({ x: box.left - base.left, y: box.top - base.top, width: box.width, height: box.height });
  }
  return rects;
}

// ---------------------------------------------------------------------------------------------------------------
// Scenes: core's materials per level, and the probe scene per layer (the light pass first, then the parts)

const reliefScene = (panel: HTMLElement) => {
  const width = panel.offsetWidth, height = panel.offsetHeight, base = panel.getBoundingClientRect();
  const box = (id: string): [number, number, number, number] => { const r = document.getElementById(id)!.getBoundingClientRect(); return [r.left - base.left, r.top - base.top, r.width, r.height]; };
  const inset = (rect: [number, number, number, number], by: number): [number, number, number, number] => [rect[0] + by, rect[1] + by, rect[2] - 2 * by, rect[3] - 2 * by];
  const lit = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.checked === true;
  const lamps = [...panel.querySelectorAll<HTMLElement>("[data-emitter=lamp]")].map(lamp => lamp.id);
  const face = { face: "raised" as const, rect: [0, 0, width, height] as [number, number, number, number], radius: 14, height: 8, material: "matte" };
  const outset = { top: tokens.outset, right: tokens.outset, bottom: tokens.outset, left: tokens.outset };
  const common = { format: "strata-scene" as const, extent: { width, height }, outset, ...settings };
  if (level === "objects") {
    const camera = harness?.camera() ?? { distance: 3200, width: frame.clientWidth, height: frame.clientHeight };
    const vanish: [number, number] = [camera.width / 2 - (base.left - frame.getBoundingClientRect().left), camera.height / 2 - (base.top - frame.getBoundingClientRect().top)];
    return { ...common, version: 2 as const, camera: { distance: camera.distance, vanish }, environment: { source: "studio" as const, strength: 0.6 }, primitives: [
      face,
      { object: "key" as const, rect: box(`${panel.id}-key`), radius: 8, height: 6, taper: 3, material: "satin" },
      { object: "knob" as const, rect: inset(box(`${panel.id}-knob`), 4), bounds: box(`${panel.id}-knob`), height: 9, colour: theme === "light" ? "#fcfcfd" : "#eceef2", material: "metal" },
      { object: "puck" as const, rect: inset(box(`${panel.id}-led`), 1.5), bounds: box(`${panel.id}-led`), height: 2, colour: "#46dc6e", material: "emissive" },
      ...lamps.map(id => ({ object: "puck" as const, rect: inset(box(id), 3.5), bounds: box(id), height: 6, colour: lit(id) ? "#ffaa3c" : "#2a2420", material: lit(id) ? "emissive" : "glass" })),
    ] };
  }
  return { ...common, version: 1 as const, primitives: level === "instrument" ? [face] : [
    face,
    { face: "raised" as const, rect: box(`${panel.id}-key`), radius: 8, height: 4, material: "satin" },
    { face: "knob" as const, rect: box(`${panel.id}-knob`), height: 6, material: "metal" },
    ...lamps.map(id => ({ face: "knob" as const, rect: box(id), height: 3, material: "glass" })),
  ] };
};
const materialFor = (panel: HTMLElement) => ({ kind: level === "objects" ? "objects" as const : "relief" as const, scene: reliefScene(panel),
  bounds: "layer" as const, interaction: "material" as const, media: "identity" as const, fallback: "static" as const });
const materials = new Map<string, { cancel(): void }>();
function applyMaterials() {
  for (const panel of panels) {
    if (media.forced.matches) { materials.get(panel.id)?.cancel(); materials.delete(panel.id); continue; }
    materials.set(panel.id, harness.controller.setMaterial(panel.id, materialFor(panel) as never));
  }
}

/** Adds the light pass, the parts (Instrument level) and the clustered lights of one layer. */
function build(layer: InstrumentLayer) {
  const engine = layer.scene.surface as unknown as EngineContext;
  const panel = layer.element, isStage = panel === stage;
  const box = { x: layer.origin.x, y: layer.origin.y, width: panel.offsetWidth, height: panel.offsetHeight };
  const grow = isStage ? 0 : tokens.outset;
  const bounds: [number, number, number, number] = [Math.max(0, box.x - grow), Math.max(0, box.y - grow),
    Math.min(frame.clientWidth, box.x + box.width + grow), Math.min(frame.clientHeight, box.y + box.height + grow)];
  const local = isStage ? [] : textRects(layer);
  const rects = local.slice(0, tokens.capacity.rects).map(rect => ({ ...rect, x: rect.x + layer.origin.x, y: rect.y + layer.origin.y }));
  const effect = createEffectWrapper(engine, { name: `emitters-${panel.id}`, vertexWGSL: lightWGSL.vertex, fragmentWGSL: lightWGSL.fragment,
    bindings: [{ binding: 0, kind: "uniform", uniformByteLength: VEC4S * 16, visibility: 3 }], blend: lightBlend });
  // First in the layer's scene: the light pass draws over the layer's own pass, then the parts draw over it.
  addTaskAtStart(layer.scene, createEffectRenderTask({ name: `emitters-${panel.id}`, effect, target: engine.scRT, clear: false }, engine, layer.scene));
  const entry: LightLayer = { id: panel.id, layer, effect, data: new Float32Array(VEC4S * 4), box, bounds, radius: isStage ? 0 : 14,
    rects, droppedRects: Math.max(0, local.length - rects.length), clustered: new Map(), parts: {} };
  // This layer's emitters, at their lens centres.
  for (const [id, emitter] of emitters) if (emitter.layer === panel.id) emitters.delete(id);
  for (const control of panel.querySelectorAll<HTMLElement>("[data-emitter]")) {
    const rect = layer.rectOf(control), lamp = control.dataset.emitter === "lamp", spec = lamp ? tokens.lamp : tokens.led;
    const bright = control.id === "c-lamp" ? tokens.lamp.bright : 1;
    emitters.set(control.id, { id: control.id, layer: panel.id, element: control, x: layer.origin.x + rect.x + rect.width / 2, y: layer.origin.y + rect.y + rect.height / 2,
      height: spec.height, radius: spec.reach * spec.diameter, colour: spec.colour, intensity: spec.intensity * bright, outset: true, kind: lamp ? "lamp" : "led" });
  }
  if (isStage) for (let index = 0; index < costCount; index++) {
    // The cost probe: emitters on a grid over the whole stage.
    const columns = Math.ceil(Math.sqrt((costCount * box.width) / box.height)), rows = Math.ceil(costCount / columns);
    emitters.set(`cost-${index}`, { id: `cost-${index}`, layer: panel.id, x: ((index % columns) + 0.5) * (box.width / columns), y: (Math.floor(index / columns) + 0.5) * (box.height / rows),
      height: tokens.lamp.height, radius: tokens.lamp.reach * tokens.lamp.diameter, colour: [1, 0.9, 0.8], intensity: tokens.lamp.intensity, outset: false, kind: "cost" });
  }
  if (level === "instrument" && !media.forced.matches) {
    if (!isStage) addParts(entry);
    else if (costCount > 0) {
      // A full-stage PBR plate, so every pixel of the cost layer runs the clustered light loop.
      entry.parts.plate = layer.kind("cost-plate", plate(box.width, box.height, 0, 0.5), pbr(linear(70, 72, 78), 0, 0.6), 1);
      entry.parts.plate.pose(0, { x: box.width / 2, y: box.height / 2 });
    }
  }
  // Clustered point lights for the parts: one per emitter of this layer, plus the pointer. Created before the container
  // is added (Lite bakes its capacity then).
  if (Object.keys(entry.parts).length) {
    try {
      const container = createClusteredLightContainer();
      for (const emitter of [...emitters.values()].filter(emitter => emitter.layer === panel.id).concat(pointerEmitter)) {
        entry.clustered.set(emitter.id, createClusteredPointLight(container, { position: layer.world(emitter.x - layer.origin.x, emitter.y - layer.origin.y, emitter.height),
          diffuse: emitter.colour, range: emitter.radius, intensity: 0 }));
      }
      addClusteredLightContainer(layer.scene, container);
      entry.container = container;
      clusteredMode = "clustered";
    } catch (error) {
      clusteredMode = "failed";
      clusteredErrors.push(String(error));
    }
  }
  for (const kind of Object.values(entry.parts)) kind.flush();
  lights.set(panel.id, entry);
  writeLayer(entry);
}

/** The Instrument level's parts of one panel: lamp bezels and lenses, the LED lens, the knob, the key. */
function addParts(entry: LightLayer) {
  const { layer } = entry, panel = layer.element, parts = entry.parts;
  const lamps = [...panel.querySelectorAll<HTMLElement>("[data-emitter=lamp]")];
  const r = tokens.lamp.diameter / 2;
  const lensOn = media.contrast.matches ? pbr(linear(255, 170, 60), 0, 0.5, undefined, [1, 0.4, 0.05]) : pbr(linear(255, 200, 120), 0, 0.2, [1, 0.62, 0.22]);
  parts.bezel = layer.kind("lamp-bezel", revolve([[r, 0], [r, 2.5], [r - 1, 3.5], [r - 3.5, 3.5]]), pbr(linear(96, 98, 104), 0.9, 0.35), lamps.length);
  parts.lensOn = layer.kind("lamp-lens-on", revolve([[r - 3.5, 3.5], [r - 3.8, 6.5], [r - 6, 9], [r - 9, 10.2], [0, 10.5]]), lensOn, lamps.length);
  parts.lensOff = layer.kind("lamp-lens-off", revolve([[r - 3.5, 3.5], [r - 3.8, 6.5], [r - 6, 9], [r - 9, 10.2], [0, 10.5]]), pbr(linear(40, 34, 30), 0, 0.15), lamps.length);
  const led = media.contrast.matches ? pbr(linear(70, 220, 110), 0, 0.5, undefined, [0.06, 0.72, 0.15]) : pbr(linear(70, 220, 110), 0, 0.3, [0.1, 0.9, 0.3]);
  parts.led = layer.kind("led-lens", revolve([[3.5, 0], [3.3, 2], [2.2, 3.4], [0, 4]], 24), led, 1);
  const knob = layer.rectOf(document.getElementById(`${panel.id}-knob`)!), k = tokens.knob, kr = knob.width / 2;
  parts.collar = layer.kind("knob-collar", revolve([[kr - 1, 0], [kr - 1, k.collar - 0.5], [kr - 1.5, k.collar], [kr - k.inset, k.collar]]), pbr(linear(150, 152, 158), 0.3, 0.5), 1);
  parts.cap = layer.kind("knob-cap", revolve([[kr - k.inset, k.collar], [kr - k.inset, k.cap - 1.2], [kr - k.inset - 1.2, k.cap], [0, k.cap]]), pbr(linear(205, 207, 212), 0.8, 0.28), 1);
  const line = bar(1.6, (kr - k.inset) * 0.55, k.cap, k.cap + 0.6);
  parts.pointer = layer.kind("knob-pointer", { ...line, positions: line.positions.map((value, index) => (index % 3 === 1 ? value + (kr - k.inset) * 0.4 : value)) }, pbr(linear(40, 40, 44), 0, 0.6), 1);
  const key = layer.rectOf(document.getElementById(`${panel.id}-key`)!), t = tokens.key;
  parts.keyBody = layer.kind("key-body", frustum(key.width, key.height, 8, t.rise, t.taper, 0, true), pbr(theme === "light" ? linear(226, 230, 236) : linear(62, 67, 78), 0.1, 0.4), 1);
  parts.keyTop = layer.kind("key-top", plate(key.width - 2 * t.taper, key.height - 2 * t.taper, 5, t.rise), layer.capture("key-top"), 1);
  poseAll(entry);
}
/** Writes every part's pose from native state. */
function poseAll(entry: LightLayer) {
  const { layer, parts } = entry;
  if (!parts.bezel) return;
  const panel = layer.element, centre = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  [...panel.querySelectorAll<HTMLInputElement>("[data-emitter=lamp]")].forEach((lamp, index) => {
    const at = centre(layer.rectOf(lamp));
    parts.bezel!.pose(index, at);
    if (lamp.checked) { parts.lensOn!.pose(index, at); parts.lensOff!.hide(index); } else { parts.lensOff!.pose(index, at); parts.lensOn!.hide(index); }
  });
  parts.led!.pose(0, centre(layer.rectOf(document.getElementById(`${panel.id}-led`)!)));
  const knob = document.getElementById(`${panel.id}-knob`) as HTMLInputElement, at = centre(layer.rectOf(knob));
  const angle = (0.5 - Number(knob.value) / 100) * 1.5 * Math.PI;
  parts.collar!.pose(0, at); parts.cap!.pose(0, { ...at, angle }); parts.pointer!.pose(0, { ...at, angle });
  const key = centre(layer.rectOf(document.getElementById(`${panel.id}-key`)!));
  parts.keyBody!.pose(0, key); parts.keyTop!.pose(0, { ...key, locked: tokens.key.rise });
  for (const kind of Object.values(parts)) kind.flush();
}

// ---------------------------------------------------------------------------------------------------------------
// Start

let resolveReady!: (api: EmitterProbeApi) => void;
let readyFailed!: (error: unknown) => void;
window.emitterProbe = { ready: new Promise<EmitterProbeApi>((resolve, reject) => { resolveReady = resolve; readyFailed = reject; }) };
let harness!: Awaited<ReturnType<typeof startInstrument>>;
harness = await startInstrument({
  frame, light: tokens.light, envelopes, minDistance: 3200, budgets: { layers: 8, pixels: 8_000_000 },
  onStatus: message => { status.dataset.core = message; },
  mount(root) {
    stage = element("section", { id: "stage", "aria-label": "Stage" });
    root.append(stage);
    for (const [id, name, lamp, key, corner] of [["a", "A · Studio", "Monitor", "Mute"], ["b", "B · Desk", "Record", "Arm"], ["c", "C · Rack", "Power", "Solo", "Standby"]] as const) {
      const panel = element("section", { id, class: "emitter-panel", "aria-label": name });
      fillPanel(panel, name, lamp, key, corner);
      root.append(panel);
      panels.push(panel);
    }
    layout();
    return [stage, ...panels];
  },
  build,
}).catch(error => {
  status.textContent = `Probe unavailable: ${error}`;
  window.emitterProbe.error = String(error);
  readyFailed(error);
  throw error;
});
applyMaterials();
let canvasOrigin = { x: 0, y: 0 };
const measureCanvas = () => { const box = harness.hosts.outputCanvas.getBoundingClientRect(); canvasOrigin = { x: box.left, y: box.top }; };
measureCanvas();

// Native state drives the light: a lamp's check is its emitter's switch, and the knob turns its cap.
for (const panel of panels) {
  const refresh = (event: Event) => {
    const target = event.target as HTMLElement, entry = lights.get(panel.id);
    if (!entry) return;
    if (target.dataset.emitter === "lamp" && level === "objects" && materials.has(panel.id)) materials.set(panel.id, harness.controller.setMaterial(panel.id, materialFor(panel) as never));
    poseAll(entry);
    writeLayer(entry);
    harness.draw();
  };
  panel.addEventListener("input", refresh);
  panel.addEventListener("change", refresh);
}

// The pointer light: pointermove records the pointer; once per frame it is converted to canvas px and written into
// every layer within reach (uniforms and clustered lights only: no capture, no layout, no hit geometry change).
const pointerStats = { updates: 0, cpu: [] as number[], intervals: [] as number[], gpu: [] as number[] };
window.addEventListener("pointermove", event => { pointer.client = { x: event.clientX, y: event.clientY }; pointer.inside = true; pointer.moved = true; }, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { pointer.inside = false; });
let previousTick = 0, previousUpdate = 0;
function tick(now: number) {
  requestAnimationFrame(tick);
  const dt = previousTick ? now - previousTick : 1000 / 60;
  previousTick = now;
  const target = pointer.enabled && media.fine.matches && pointer.inside && emittersAllowed() ? 1 : 0;
  let changed = pointer.moved && target > 0;
  pointer.moved = false;
  if (pointer.alpha !== target) {
    const step = media.reduced.matches || tokens.pointer.fade <= 0 ? 1 : dt / tokens.pointer.fade;
    pointer.alpha = target > pointer.alpha ? Math.min(target, pointer.alpha + step) : Math.max(target, pointer.alpha - step);
    changed = true;
  }
  if (!changed) return;
  const started = performance.now();
  pointerEmitter.x = pointer.client.x - canvasOrigin.x;
  pointerEmitter.y = pointer.client.y - canvasOrigin.y;
  writeAll();
  harness.draw();
  pointerStats.updates++;
  pointerStats.cpu.push(performance.now() - started);
  if (previousUpdate) pointerStats.intervals.push(now - previousUpdate);
  previousUpdate = now;
  const engine = harness.engine();
  if (engine && engine.gpuFrameTimeMs > 0) pointerStats.gpu.push(engine.gpuFrameTimeMs);
}
requestAnimationFrame(tick);

// Preferences change what is drawn: rebuild the scenes and materials.
for (const query of [media.contrast, media.forced]) query.addEventListener("change", () => void rebuild());
async function rebuild() {
  applyMaterials();
  await harness.controller.settle();
  await harness.rebuild();
  measureCanvas();
  writeAll();
  harness.draw();
}

// ---------------------------------------------------------------------------------------------------------------
// Readback and analysis for the test

let shot: Screenshot | undefined;
async function settle() {
  await harness.idle();
  for (let index = 0; index < 3; index++) { harness.draw(); await nextFrame(); }
  shot = await harness.readback();
  describe();
}
const describe = () => {
  status.textContent = `I0.3 emitters: ${level}, ${theme}, ${[...lights.values()].reduce((sum, entry) => sum + emittersOf(entry).filter(item => item.intensity > 0).length, 0)} lit emitter slots, lights ${clusteredMode}, guard ${guardOn ? "on" : "off"}\n${status.dataset.core ?? ""}`;
};
const pixel = (point: Point) => harness.pixel(shot!, point);
const luminance = ([r, g, b]: number[]) => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const clientBox = (id: string) => { const box = document.getElementById(id)!.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
/** Client boxes of the text runs of element `id`. */
const textBox = (id: string) => {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById(id)!);
  const box = range.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height };
};
/** Every pixel of a client rect from `from` (device px). */
function region(from: Screenshot, rect: Rect) {
  const box = harness.hosts.outputCanvas.getBoundingClientRect(), dpr = harness.dpr, out: number[][] = [];
  for (let y = Math.ceil((rect.y - box.top) * dpr); y < Math.floor((rect.y + rect.height - box.top) * dpr); y++) {
    for (let x = Math.ceil((rect.x - box.left) * dpr); x < Math.floor((rect.x + rect.width - box.left) * dpr); x++) {
      const offset = (y * from.width + x) * 4;
      out.push([from.data[offset]!, from.data[offset + 1]!, from.data[offset + 2]!]);
    }
  }
  return out;
}
const lamps = () => [...emitters.values()].filter(emitter => emitter.kind === "lamp").map(emitter => ({ id: emitter.id, layer: emitter.layer,
  centre: { x: emitter.x + canvasOrigin.x, y: emitter.y + canvasOrigin.y }, diameter: tokens.lamp.diameter, intensity: emitter.intensity, on: (emitter.element as HTMLInputElement).checked }));
async function setLamp(id: string, on: boolean) {
  const lamp = document.getElementById(id) as HTMLInputElement;
  if (lamp.checked !== on) { lamp.checked = on; lamp.dispatchEvent(new Event("change", { bubbles: true })); }
}
async function setLamps(on: Record<string, boolean>) { for (const [id, value] of Object.entries(on)) await setLamp(id, value); await harness.controller.settle(); }
const allOff = () => Object.fromEntries(lamps().map(lamp => [lamp.id, false]));

/**
 * Contrast of the text of `ids` (decoded pixels, WCAG formula) with every lamp off, with `lamp` on, and with `lamp` on
 * and the guard off; and how far the emitter light's change exceeds `interior.max` (8-bit levels): the lit frame against
 * the same state with no emitter light (a lit lamp also changes its own lens and, at the Objects level, its dome's
 * material, which core's own guard governs).
 */
async function contrast(ids: string[], lamp: string) {
  const dark = theme === "dark";
  const analyse = (from: Screenshot, rect: Rect) => {
    const pixels = region(from, rect), lums = pixels.map(luminance), order = lums.map((_, index) => index).sort((a, b) => lums[a]! - lums[b]!);
    // The glyph core is the extreme pixel; the face is the 90th percentile on the other side.
    const text = pixels[dark ? order.at(-1)! : order[0]!]!, face = pixels[order[Math.floor(order.length * (dark ? 0.1 : 0.9))]!]!;
    return { text, face, ratio: ratio(luminance(text), luminance(face)), pixels: pixels.length };
  };
  await setLamps(allOff());
  await settle();
  const off = shot!;
  await setLamps({ [lamp]: true });
  await settle();
  const on = shot!;
  lightEnabled = false; writeAll();
  await settle();
  const unlit = shot!;
  lightEnabled = true; guardOn = false; writeAll();
  await settle();
  const unguarded = shot!;
  guardOn = true; writeAll();
  await settle();
  return ids.map(id => {
    const rect = textBox(id), before = region(unlit, rect), after = region(on, rect), lampOff = region(off, rect);
    let excess = 0, maxRelative = 0, sceneChange = 0;
    lampOff.forEach((pixel, index) => pixel.forEach((value, channel) => { sceneChange = Math.max(sceneChange, Math.abs(before[index]![channel]! - value)); }));
    before.forEach((pixel, index) => pixel.forEach((value, channel) => {
      const next = after[index]![channel]!;
      excess = Math.max(excess, next - value - tokens.interiorMax * value, value - next);
      if (value >= 32) maxRelative = Math.max(maxRelative, Math.abs(next / value - 1));
    }));
    return { id, rect, off: analyse(off, rect), on: analyse(on, rect), unlit: analyse(unlit, rect), unguarded: analyse(unguarded, rect), excessLevels: excess, maxRelative, sceneChange };
  });
}
/**
 * The light pool of `lamp`: brightness gains (mean of RGB, on minus off) on the face around it (points clear of text
 * and controls) and past its panel's nearest edge (`direction`), with what native hit testing finds there.
 */
async function pool(lamp: string, direction: Point) {
  await setLamps(allOff());
  await settle();
  const off = shot!;
  await setLamps({ [lamp]: true });
  await settle();
  const on = shot!;
  const info = lamps().find(item => item.id === lamp)!, panel = clientBox(info.layer), d = info.diameter;
  const blocked = [...document.getElementById(info.layer)!.querySelectorAll<HTMLElement>("input, button, [data-emitter]")].map(control => clientBox(control.id));
  const texts = (lights.get(info.layer)?.rects ?? []).map(rect => ({ x: rect.x + canvasOrigin.x - tokens.feather - 1, y: rect.y + canvasOrigin.y - tokens.feather - 1, width: rect.width + 2 * tokens.feather + 2, height: rect.height + 2 * tokens.feather + 2 }));
  const inside = (point: Point, box: Rect, by = 0) => point.x >= box.x - by && point.y >= box.y - by && point.x <= box.x + box.width + by && point.y <= box.y + box.height + by;
  const gain = (point: Point) => { const a = harness.pixel(off, point), b = harness.pixel(on, point); return (b[0]! + b[1]! + b[2]! - a[0]! - a[1]! - a[2]!) / 3; };
  const face: { distance: number; point: Point; gain: number; off: number[]; on: number[] }[] = [];
  for (const scale of [1, 1.5, 2, 3]) for (let step = 0; step < 24; step++) {
    const angle = (step / 24) * 2 * Math.PI, point = { x: info.centre.x + Math.cos(angle) * d * scale, y: info.centre.y + Math.sin(angle) * d * scale };
    if (!inside(point, { x: panel.x + 8, y: panel.y + 8, width: panel.width - 16, height: panel.height - 16 })) continue;
    if (texts.some(box => inside(point, box)) || blocked.some(box => inside(point, box, 3))) continue;
    face.push({ distance: d * scale, point, gain: gain(point), off: harness.pixel(off, point), on: harness.pixel(on, point) });
  }
  // Past the edge: from the panel's edge outwards along `direction`, on the lamp's row or column.
  const edge = direction.x < 0 ? { x: panel.x, y: info.centre.y } : direction.x > 0 ? { x: panel.x + panel.width, y: info.centre.y }
    : direction.y > 0 ? { x: info.centre.x, y: panel.y + panel.height } : { x: info.centre.x, y: panel.y };
  const past = [2, 6, 12, 20, 32, 48].map(distance => {
    const point = { x: edge.x + direction.x * distance, y: edge.y + direction.y * distance }, hit = document.elementFromPoint(point.x, point.y);
    return { distance, point, beneath: hit?.closest("section")?.id ?? hit?.id ?? "", gain: gain(point), off: harness.pixel(off, point), on: harness.pixel(on, point) };
  });
  // Nearby objects: the lamp's own bezel ring, and the centre and the lamp-facing edge band of every other control in
  // its panel (at the Instrument level these are mesh pixels lit by the clustered lights; below it, the faces the light
  // pass lights).
  const parts: { id: string; where: string; distance: number; point: Point; gain: number; off: number[]; on: number[] }[] = [];
  const sample = (id: string, where: string, point: Point) =>
    parts.push({ id, where, distance: Math.hypot(point.x - info.centre.x, point.y - info.centre.y), point, gain: gain(point), off: harness.pixel(off, point), on: harness.pixel(on, point) });
  for (let step = 0; step < 8; step++) {
    const angle = (step / 8) * 2 * Math.PI, ring = info.diameter / 2 - 1.75;
    sample(lamp, `bezel-${step}`, { x: info.centre.x + Math.cos(angle) * ring, y: info.centre.y + Math.sin(angle) * ring });
  }
  for (const control of document.getElementById(info.layer)!.querySelectorAll<HTMLElement>("input, button, [data-emitter]")) {
    if (control.id === lamp) continue;
    const box = clientBox(control.id), centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const toward = { x: info.centre.x - centre.x, y: info.centre.y - centre.y }, length = Math.hypot(toward.x, toward.y) || 1;
    // The edge band facing the lamp, 1.5 px inside the box.
    const reach = Math.min((box.width / 2 - 1.5) / Math.max(1e-6, Math.abs(toward.x / length)), (box.height / 2 - 1.5) / Math.max(1e-6, Math.abs(toward.y / length)));
    sample(control.id, "centre", centre);
    sample(control.id, "edge", { x: centre.x + (toward.x / length) * reach, y: centre.y + (toward.y / length) * reach });
  }
  return { lamp, theme, level, centre: info.centre, face, past, parts };
}
/** Visible controls (not under a higher panel) with their client boxes. */
function controls() {
  return [...frame.querySelectorAll<HTMLElement>("input, button, [data-emitter]")].map(control => ({ id: control.id, layer: control.closest("section")!.id, ...clientBox(control.id) }))
    .filter(control => {
      const centre = { x: control.x + control.width / 2, y: control.y + control.height / 2 };
      return panels.slice(panels.findIndex(panel => panel.id === control.layer) + 1).every(panel => {
        const box = clientBox(panel.id);
        return centre.x < box.x - 2 || centre.y < box.y - 2 || centre.x > box.x + box.width + 2 || centre.y > box.y + box.height + 2;
      });
    });
}
/**
 * Waits (bounded by `limit` frames) for the fonts and then for `quiet` frames in a row without a capture, so a late layout or
 * font load after the page opens is not counted as the emitters' (#136). Emitters that capture every frame still use up the bound
 * and are counted.
 */
async function quietCaptures(quiet = 10, limit = 180) {
  await document.fonts.ready;
  let last = harness.counts().captures, still = 0;
  for (let index = 0; index < limit && still < quiet; index++) {
    await nextFrame();
    harness.draw();
    const now = harness.counts().captures;
    still = now === last ? still + 1 : 0;
    last = now;
  }
}
/** GPU time of the stage layer's light pass and mesh scene with `count` emitters on it, over `frames` frames. */
async function cost(count: number, frames = 120, tiles = true) {
  costCount = count;
  tiled = tiles;
  await harness.rebuild();
  writeAll();
  await settle();
  const engine = harness.engine()!;
  if (isGpuTimingSupported(engine)) setGpuTimingEnabled(engine, true);
  await setRenderTaskGpuTimingEnabled(engine, true).catch(() => undefined);
  const device = (harness.hosts.outputCanvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const light: number[] = [], scene: number[] = [], gpu: number[] = [], work: number[] = [];
  let timing = "";
  await quietCaptures();
  const before = harness.counts();
  // Warm-up frames first, so the GPU clocks settle before the measured ones.
  for (let index = 0; index < 30; index++) { await nextFrame(); harness.draw(); }
  for (let index = 0; index < frames; index++) {
    await nextFrame();
    const started = performance.now();
    harness.draw();
    await device.queue.onSubmittedWorkDone();
    work.push(performance.now() - started);
    if (engine.gpuFrameTimeMs > 0) gpu.push(engine.gpuFrameTimeMs);
    const timings = getRenderTaskGpuTimings(engine);
    timing = timings.status;
    if (timings.status !== "available") continue;
    const at = timings.tasks.findIndex(task => task.name === "emitters-stage");
    if (at >= 0) light.push(timings.tasks[at]!.durationMs);
    const next = timings.tasks.slice(at + 1).find(task => task.name === "scene");
    if (at >= 0 && next) scene.push(next.durationMs);
  }
  const after = harness.counts();
  const result = { count, tiled, dpr: harness.dpr, level, frames, timing, lightPass: statistics(light), meshScene: statistics(scene), gpuFrame: statistics(gpu), work: statistics(work),
    clustered: clusteredMode, captures: after.captures - before.captures, mode: after.mode };
  costCount = 0;
  tiled = true;
  await harness.rebuild();
  writeAll();
  return result;
}
async function setLevel(next: Level) {
  level = next;
  frame.dataset.level = next;
  await rebuild();
  await settle();
  return { level, counts: harness.counts() };
}
async function setTheme(next: Theme) {
  theme = next;
  document.body.dataset.theme = next;
  settings = sceneSettings(strataTokens, { theme, depth: 0.5 });
  await rebuild();
  await settle();
  return { theme, counts: harness.counts() };
}

await settle();
const api = {
  dpr: harness.dpr,
  tokens: () => ({ ...tokens, envelopes, camera: harness.camera(), capacity: tokens.capacity, falloff: "I · colour · cos θ / (π d²) · (1 − (d²/R²)²)²" }),
  settle, setLevel, setTheme, setLamp: async (id: string, on: boolean) => { await setLamps({ [id]: on }); }, lamps,
  setGuard: (on: boolean) => { guardOn = on; writeAll(); harness.draw(); },
  setPointer: (on: boolean) => { pointer.enabled = on; writeAll(); harness.draw(); },
  pointerState: () => ({ ...pointer, emitter: { x: pointerEmitter.x, y: pointerEmitter.y }, fine: media.fine.matches, reduced: media.reduced.matches, fade: tokens.pointer.fade }),
  pointerStats: () => ({ updates: pointerStats.updates, cpu: statistics(pointerStats.cpu), intervals: statistics(pointerStats.intervals), gpu: statistics(pointerStats.gpu) }),
  resetPointerStats: async () => {
    const engine = harness.engine();
    if (engine && isGpuTimingSupported(engine)) setGpuTimingEnabled(engine, true);
    pointerStats.updates = 0; pointerStats.cpu = []; pointerStats.intervals = []; pointerStats.gpu = []; previousUpdate = 0;
  },
  /** Synthetic leave and return of the pointer (Playwright cannot move the mouse off the page), for the fade. */
  pointerLeave: () => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")),
  /** Alpha of the pointer light over the next `frames` frames. */
  pointerFade: async (frames: number) => { const values: number[] = []; for (let index = 0; index < frames; index++) { await nextFrame(); values.push(pointer.alpha); } return values; },
  pixels: (points: Point[]) => points.map(pixel),
  hits: (points: Point[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("input, button, [data-emitter]")?.id ?? hit?.closest("section")?.id ?? hit?.id ?? ""; }),
  controls, panels: () => Object.fromEntries([stage, ...panels].map(panel => [panel.id, clientBox(panel.id)])), textBox,
  contrast, pool, cost,
  protectedRects: () => Object.fromEntries([...lights.values()].map(entry => [entry.id, { count: entry.rects.length, dropped: entry.droppedRects }])),
  emitters: () => [...lights.values()].map(entry => ({ layer: entry.id, lit: emittersOf(entry).filter(item => item.intensity > 0).map(item => item.emitter.id), clustered: entry.clustered.size, parts: Object.keys(entry.parts) })),
  preferences: () => ({ contrastMore: media.contrast.matches, forcedColors: media.forced.matches, fine: media.fine.matches, reduced: media.reduced.matches, emitters: emittersAllowed() }),
  clustered: () => ({ mode: clusteredMode, errors: [...clusteredErrors] }),
  counts: () => harness.counts(),
  gpuTimings: () => harness.gpuTimings(),
  diagnostics: () => [...harness.diagnostics],
  camera: () => harness.camera(),
  browser: () => navigator.userAgent,
};
type EmitterProbeApi = typeof api;
declare global { interface Window { emitterProbe: { ready: Promise<EmitterProbeApi>; error?: string } } }
resolveReady(api);
