/**
 * Instrument probe I0.5, object-on-object shadows (docs/ui-library/instrument.md, Phase I0, decision 4): does a
 * per-layer shadow map from the key light give a clean lever-on-plate shadow without touching the captured face?
 *
 * One enrolled panel fills the stage. Six kinds of real native control, each drawn by meshes in the panel's layer scene
 * (`instrument-harness.ts`), each with a label printed on the faceplate above it:
 * - bat (`<input type="checkbox" role="switch">`): a mounting plate, a washer, a hex nut and a lever with a ball,
 *   swinging ±25° over centre; the cases layout poses the bats at both stops and mid-travel;
 * - rocker (checkbox switch): a bezel and two plates in a shallow V tipping ±13° (I0.2's rocker);
 * - knob (`<input type="range">`): a collar, a skirt, a cap and a pointer (I0.1's knob);
 * - fader (vertical `<input type="range">`): a track plate, a slot and a cap with a grip sliding on the plate;
 * - key (`<button>`): a plinth and a cap standing on it;
 * - plate (`<button>`, a membrane key): a mount and a 2 px thin plate on it, the case whose shadow maps cut and
 *   detached at the Objects level (design language section 7).
 *
 * Three shadow paths, switchable at run time (`setPaths`):
 * - **analytic** (a): the Relief formula (rendering model 2.8) under each part's footprint, drawn on the face as a shader
 *   quad per control on the mesh pass (not by core's relief pass). Each quad loads its control's casters (rounded boxes
 *   with a height, rewritten from the pose) from a storage buffer and takes the darkest, so overlap is max, not sum.
 *   The quads write no depth and lie on the face, so parts cover them;
 * - **map** (b): a shadow map from the key light (PCF by default; CSM and ESM as alternatives), with every part a caster
 *   and every part a receiver. Nothing on the face receives: the captured face is not a mesh of the layer scene, so the
 *   map is masked off the face by construction. The light stands `lightDistance` behind the stage and the light-space
 *   depth range is fitted to the stage, so a bias is a fraction of a px; each part kind publishes the union of its
 *   placements as its bounds, which is what the directional fit reads for thin instances;
 * - **contact** (c): `createScreenSpaceContactShadowsPostProcessTask` on the mesh pass. With `post` the layer scene
 *   draws its meshes into an offscreen colour target (cleared transparent) with its own depth, the contact task
 *   multiplies that target by its occlusion into a second target, and a present quad composites the result over the
 *   captured face with premultiplied alpha. Face pixels have alpha 0 there, so the post chain cannot touch them
 *   (decision 10: the post chain runs before the mesh pass is composited). The harness's own direct pass is disabled
 *   in this mode (the one internal read in this file: `getFrameGraph(scene)._tasks`, to find that task).
 * Switching the generator kind, map size, bias, refresh policy or `post` rebuilds the layer scene (`configure`).
 *
 * `window.shadowsProbe` drives the browser test (`tests/browser/ui-probe-instrument-shadows.test.mjs`): `setLayout`
 * (`cases`, 60 controls with 20 bats; `dense`, 250), `configure`, `setPaths`, `setPose`, `snap` (a named decoded frame),
 * the pixel analyses `compare`, `containment`, `leverShadow`, `contactLines`, `thinPlate`, `labelContrast`, the hit
 * checks `gridHits` and `shadowHits`, `measure` (GPU timings with and without 20 bats snapping), `counts` and
 * `diagnostics`.
 */
import {
  addMeshToTask, addTask, addToScene, createCsmDirectionalShadowGenerator, createEsmDirectionalShadowGenerator, createPbrMaterial,
  createPcfDirectionalShadowGenerator, createRenderTarget, createRenderTargetTexture, createRenderTask, createScreenSpaceContactShadowsPostProcessTask,
  createShaderMaterial, createStorageBuffer, disposeRenderTargetTexture, disposeStorageBuffer, enableShaderMaterialInstanceWorld, flushThinInstances, getFrameGraph, getRenderTaskGpuTimings,
  isGpuTimingSupported, onSceneDispose, registerSceneWithShadowSupport, setGpuTimingEnabled, setPbrEmissive, setRenderTaskGpuTimingEnabled, setShaderStorageBuffer,
  setMeshVisible, setShaderTexture, setShadowGeneratorEnabled, setShadowTaskCasterMeshes, setThinInstances, updateStorageBuffer,
  type EngineContext, type Material, type Mesh, type PbrMaterialProps, type RenderTask, type Screenshot, type ScreenSpaceContactShadowsPostProcessTask,
  type ShadowGenerator, type StorageBuffer,
} from "@babylonjs/lite";
import { sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { bar, frustum, merge, offset, partMesh, plate, revolve, sphere, turnX, type PartData } from "./instrument-parts.ts";
import { startInstrument, type Envelope, type InstrumentLayer, type PartKind, type Rect } from "./instrument-harness.ts";
import type { Point } from "./common.ts";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
const settings = sceneSettings(strataTokens, { theme: "light", depth: 0.5 });
document.body.style.setProperty("--stage", settings.backdrop);
const deg = Math.PI / 180;

/** Probe tokens (Phase I1 sets the real values), in CSS px and radians. */
const tokens = {
  light: settings.light,
  /** `shadow.strength` at the default depth: the analytic face shadow's darkest value. */
  strength: settings.shadow.strength,
  /** The stage and camera distance the box margins are sized for (I0.2's box sizing rule). */
  reference: { width: 1920, height: 1080, distance: 2400 },
  bat: { plateRise: 1.5, plateTaper: 0.8, plateWidth: 44, plateLength: 60, radius: 5, washer: 10, washerRise: 1, nut: 6.5, nutRise: 3,
    lever: 17, rodBase: 2, rodTip: 1.4, ball: 4.2, throw: 25 * deg },
  rocker: { width: 20, length: 30, thickness: 3, valley: 6 * deg, throw: 13 * deg, pivot: 4.5, bezelRise: 2.5, bezelTaper: 1.5, radius: 5 },
  knob: { box: 48, collar: 1.8, skirt: 8, cap: 14.2, pointer: 14.8, sweep: 270 * deg, collarInset: 1, skirtInset: 4.5, capInset: 9 },
  fader: { capWidth: 16, capLength: 12, rise: 9, taper: 2.5, grip: 0.5, travel: 50, radius: 4, plateRise: 1, plateTaper: 0.5, slot: 3 },
  key: { width: 44, height: 36, radius: 5, plinthRise: 3, plinthTaper: 1, capInset: 5, capRise: 6, capTaper: 2 },
  plate: { width: 112, height: 52, radius: 4, mountRise: 1.5, mountTaper: 0.6, plateWidth: 72, plateHeight: 26, plateRadius: 3, plateRise: 2, plateTaper: 0.4 },
  /** The shadow map's light stands this far behind the stage centre, against the light direction. */
  lightDistance: 4000,
  snapMs: 140, samples: 33,
};
const batPivot = tokens.bat.plateRise + tokens.bat.washerRise + tokens.bat.nutRise;

const kinds = ["bat", "rocker", "knob", "fader", "key", "plate"] as const;
type Kind = (typeof kinds)[number];
const abbreviation: Record<Kind, string> = { bat: "BAT", rocker: "RKR", knob: "KNB", fader: "FDR", key: "KEY", plate: "PLT" };
/** How a part moves with travel `t` (0 off or minimum, 1 on or maximum). */
type Motion = "fixed" | "tilt" | "slideY" | "turn";
interface PartSpec { name: string; data: PartData; colour: [number, number, number]; metallic: number; roughness: number; emissive?: [number, number, number]; motion: Motion; pivot: number; reach: number }
interface KindSpec { kind: Kind; box: { width: number; height: number; radius: number }; parts: PartSpec[]; margins: Record<string, number> }

const reference = { radius: Math.hypot(tokens.reference.width, tokens.reference.height) / 2, distance: tokens.reference.distance };
const marginFor = (h: number) => Math.ceil((reference.radius * h) / (reference.distance - h) + 1);

/** Column-major 4 × 4 pose of a part at travel `t`, relative to its control's centre (world axes: y up, z = −h); I0.2's. */
function local(spec: PartSpec, t: number): number[] {
  const amount = spec.reach * (spec.motion === "turn" ? 0.5 - t : spec.motion === "slideY" ? t - 0.5 : 2 * t - 1);
  if (spec.motion === "tilt") {
    const c = Math.cos(amount), s = Math.sin(amount), pv = spec.pivot;
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, -s * pv, (c - 1) * pv, 1];
  }
  if (spec.motion === "turn") { const c = Math.cos(amount), s = Math.sin(amount); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, spec.motion === "slideY" ? amount : 0, 0, 1];
}
const apply = (m: number[], x: number, y: number, z: number): [number, number, number] =>
  [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
const travels = (count = tokens.samples) => Array.from({ length: count }, (_, index) => index / (count - 1));
/** Orthographic footprint (half extents) and highest point of a part over its whole travel. */
function footprint(spec: PartSpec) {
  let x = 0, y = 0, h = 0;
  for (const t of spec.motion === "fixed" ? [0] : travels()) {
    const m = local(spec, t);
    for (let index = 0; index < spec.data.positions.length; index += 3) {
      const [px, py, pz] = apply(m, spec.data.positions[index]!, spec.data.positions[index + 1]!, spec.data.positions[index + 2]!);
      x = Math.max(x, Math.abs(px)); y = Math.max(y, Math.abs(py)); h = Math.max(h, -pz);
    }
  }
  return { x, y, h };
}
const part = (name: string, data: PartData, motion: Motion, colour: [number, number, number], metallic: number, roughness: number, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ name, data, motion, colour, metallic, roughness, pivot: 0, reach: 0, ...extra });

// The rocker's two plates, kept apart for the analytic casters (one footprint and height per plate).
const rockerHalf = (sign: number) => {
  const r = tokens.rocker;
  return turnX(offset(frustum(r.width, r.length / 2, 2, r.thickness, 0.8, r.pivot), 0, (sign * r.length) / 4), -sign * r.valley, r.pivot);
};
const rockerHalves = [rockerHalf(1), rockerHalf(-1)] as const;

/** Builds one kind: its moving parts from tokens, its box by I0.2's sizing rule (or the form's minimum), its static parts from the box. */
function kindSpec(kind: Kind): KindSpec {
  let moving: PartSpec[] = [], form = { width: 0, height: 0 }, radius = 4;
  let fixed: (box: { width: number; height: number; radius: number }) => PartSpec[];
  if (kind === "bat") {
    const b = tokens.bat;
    moving = [
      part("lever", revolve([[b.rodBase, batPivot], [b.rodTip, batPivot + b.lever]], 24), "tilt", [214, 216, 222], 0.4, 0.22, { pivot: batPivot, reach: b.throw }),
      part("ball", sphere(b.ball, batPivot + b.lever), "tilt", [232, 234, 238], 0.4, 0.18, { pivot: batPivot, reach: b.throw }),
    ];
    form = { width: b.plateWidth, height: b.plateLength };
    radius = b.radius;
    const top = b.plateRise + b.washerRise;
    fixed = box => [
      part("plate", frustum(box.width - 2, box.height - 2, box.radius - 1, b.plateRise, b.plateTaper), "fixed", [196, 198, 204], 0.15, 0.45),
      part("washer", revolve([[b.washer, b.plateRise], [b.washer, top - 0.4], [b.washer - 0.4, top], [b.nut + 0.5, top]]), "fixed", [70, 72, 78], 0.3, 0.5),
      part("nut", revolve([[b.nut, top], [b.nut, batPivot - 0.6], [b.nut - 0.8, batPivot], [0, batPivot]], 6), "fixed", [150, 152, 158], 0.35, 0.4),
    ];
  } else if (kind === "rocker") {
    const r = tokens.rocker;
    moving = [part("plates", merge(...rockerHalves), "tilt", [26, 27, 30], 0.15, 0.3, { pivot: r.pivot, reach: r.throw })];
    radius = r.radius;
    fixed = box => [part("bezel", frustum(box.width - 2, box.height - 2, box.radius - 1, r.bezelRise, r.bezelTaper), "fixed", [168, 170, 176], 0.3, 0.45)];
  } else if (kind === "knob") {
    const k = tokens.knob, r = k.box / 2, rc = r - k.capInset;
    moving = [
      part("skirt", revolve([[r - k.skirtInset, k.collar], [r - k.skirtInset, k.skirt - 1], [r - k.skirtInset - 1, k.skirt], [rc + 0.5, k.skirt]]), "turn", [28, 29, 32], 0.2, 0.45, { reach: k.sweep }),
      part("cap", revolve([[rc, k.skirt], [rc, k.cap - 1.2], [rc - 1.2, k.cap], [0, k.cap]]), "turn", [200, 202, 207], 0.25, 0.32, { reach: k.sweep }),
      part("pointer", offset(bar(1.6, rc * 0.55, k.cap, k.pointer), 0, rc * 0.4), "turn", [250, 250, 250], 0, 0.6, { emissive: [0.35, 0.35, 0.35], reach: k.sweep }),
    ];
    form = { width: k.box, height: k.box };
    radius = r;
    fixed = () => [part("collar", revolve([[r - k.collarInset, 0], [r - k.collarInset, k.collar - 0.6], [r - k.collarInset - 0.6, k.collar], [r - k.skirtInset, k.collar]]), "fixed", [150, 152, 158], 0.3, 0.5)];
  } else if (kind === "fader") {
    const f = tokens.fader, top = f.plateRise + f.rise;
    moving = [
      part("cap", frustum(f.capWidth, f.capLength, 2.5, f.rise, f.taper, f.plateRise), "slideY", [52, 54, 60], 0.2, 0.4, { reach: f.travel }),
      part("grip", bar(f.capWidth - 2 * f.taper - 4, 1.4, top, top + f.grip), "slideY", [245, 245, 245], 0, 0.5, { emissive: [0.3, 0.3, 0.3], reach: f.travel }),
    ];
    radius = f.radius;
    fixed = box => [
      part("track", frustum(box.width - 2, box.height - 2, box.radius - 1, f.plateRise, f.plateTaper), "fixed", [188, 190, 196], 0.1, 0.5),
      part("slot", frustum(f.slot, f.travel + f.capLength, 1.5, 0.3, 0, f.plateRise), "fixed", [8, 8, 10], 0, 0.9),
    ];
  } else if (kind === "key") {
    const k = tokens.key;
    form = { width: k.width, height: k.height };
    radius = k.radius;
    fixed = box => [
      part("plinth", frustum(box.width - 2, box.height - 2, box.radius - 1, k.plinthRise, k.plinthTaper), "fixed", [120, 124, 132], 0.1, 0.55),
      part("cap", frustum(box.width - 2 * k.capInset, box.height - 2 * k.capInset, box.radius - 2, k.capRise, k.capTaper, k.plinthRise), "fixed", [238, 238, 234], 0.05, 0.4),
    ];
  } else {
    const p = tokens.plate;
    form = { width: p.width, height: p.height };
    radius = p.radius;
    fixed = box => [
      part("mount", frustum(box.width - 2, box.height - 2, box.radius - 1, p.mountRise, p.mountTaper), "fixed", [200, 202, 207], 0.1, 0.55),
      part("thin", frustum(p.plateWidth, p.plateHeight, p.plateRadius, p.plateRise, p.plateTaper, p.mountRise), "fixed", [234, 235, 238], 0.05, 0.35),
    ];
  }
  // The rule: footprint over the travel plus the drift margin of the part's highest point, on every side.
  let halfWidth = 0, halfHeight = 0;
  const margins: Record<string, number> = {};
  for (const spec of moving) {
    const { x, y, h } = footprint(spec), margin = marginFor(h);
    margins[spec.name] = margin;
    halfWidth = Math.max(halfWidth, x + margin); halfHeight = Math.max(halfHeight, y + margin);
  }
  const width = Math.max(Math.ceil(2 * halfWidth), form.width), height = Math.max(Math.ceil(2 * halfHeight), form.height);
  const box = { width, height, radius };
  return { kind, box, margins, parts: [...fixed(box), ...moving] };
}
const specs = Object.fromEntries(kinds.map(kind => [kind, kindSpec(kind)])) as Record<Kind, KindSpec>;

/** Each part's binding point over its travel (I0.2's rule): the camera distance follows from these. */
const envelopes: Envelope[] = kinds.flatMap(kind => specs[kind].parts.map(spec => {
  const box = specs[kind].box;
  let binding: Envelope = { height: 0, inset: 1 };
  for (const t of spec.motion === "fixed" ? [0] : travels()) {
    const m = local(spec, t);
    for (let index = 0; index < spec.data.positions.length; index += 3) {
      const [x, y, z] = apply(m, spec.data.positions[index]!, spec.data.positions[index + 1]!, spec.data.positions[index + 2]!);
      const inset = Math.max(0.25, Math.min(box.width / 2 - Math.abs(x), box.height / 2 - Math.abs(y)));
      if (-z / inset > binding.height / binding.inset) binding = { height: -z, inset };
    }
  }
  return binding;
}));

// The key light in panel axes (x right, y down, z towards the viewer) and the analytic shadow's offset per px of
// height, −L.xy / L.z (design language sections 3 and 7).
const towardsLight = (() => {
  const a = tokens.light.azimuth * deg, e = tokens.light.elevation * deg;
  return { x: Math.sin(a) * Math.cos(e), y: -Math.cos(a) * Math.cos(e), z: Math.sin(e) };
})();
const shadowOffset = { x: -towardsLight.x / towardsLight.z, y: -towardsLight.y / towardsLight.z };

/** One analytic caster: a rounded box in layer-local px (y down), standing `h` above the face. */
interface Caster { x: number; y: number; hw: number; hh: number; r: number; h: number }
const castersPerControl = 6;
const roundedBox = (qx: number, qy: number, hw: number, hh: number, r: number) => {
  const radius = Math.min(r, hw, hh), ax = Math.abs(qx) - hw + radius, ay = Math.abs(qy) - hh + radius;
  return Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) - radius;
};
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The analytic shadow of one caster at a layer-local point (rendering model 2.8), and whether the point is in its support. */
function casterShadow(caster: Caster, x: number, y: number) {
  const d = roundedBox(x - caster.x - shadowOffset.x * caster.h, y - caster.y - shadowOffset.y * caster.h, caster.hw, caster.hh, caster.r);
  const support = d < 1.5 * caster.h + 1;
  const value = tokens.strength * (1 - smoothstep(-0.5 * caster.h, 1.5 * caster.h + 1, d)) * smoothstep(-1, 0.5, roundedBox(x - caster.x, y - caster.y, caster.hw, caster.hh, caster.r));
  return { support, value };
}

/** Which shadow paths draw. */
interface Paths { analytic: boolean; map: boolean; contact: boolean }
/** What a rebuild sets: the map generator and its parameters, its refresh policy, and the post chain. */
interface Config {
  generator: "none" | "pcf" | "csm" | "esm";
  /** `bias` offsets the caster's light-space NDC depth by bias / 2 (world px: bias / 2 × the fitted depth range); Lite 1.33's
   *  directional PCF accepts `normalBias` but does not use it. */
  mapSize: number; bias: number; normalBias: number;
  /** Fraction of the key light left in a mapped shadow (Lite's `darkness`: 0 is black). */
  darkness: number;
  /** `change`: the map is re-rendered when a caster's pose changes (Lite's default); `frame`: every frame. */
  policy: "change" | "frame";
  /** The offscreen mesh pass with the contact-shadow task and the present composite. */
  post: boolean;
  csm: { numCascades: number; lambda: number; worldSpaceBias?: number; stabilizeCascades: boolean };
  esm: { depthScale: number; blurKernel: number };
  contact: { intensity: number; stepCount: number; maxDistance: number; thickness: number; bias: number; normalBias: number; tint: [number, number, number] };
}
const defaults: Config = {
  generator: "pcf", mapSize: 4096, bias: 1.5e-3, normalBias: 0, darkness: 0.35, policy: "change", post: true,
  csm: { numCascades: 2, lambda: 0.5, stabilizeCascades: false },
  esm: { depthScale: 50, blurKernel: 1 },
  contact: { intensity: 1, stepCount: 16, maxDistance: 12, thickness: 6, bias: 0.15, normalBias: 0.3, tint: [0.42, 0.42, 0.45] },
};
let config: Config = { ...structuredClone(defaults), ...JSON.parse(params.get("config") ?? "{}") as Partial<Config> };
let paths: Paths = { analytic: params.get("analytic") !== "0", map: params.get("map") !== "0", contact: params.get("contact") !== "0" };

// Layout: one panel filling the stage, a flex flow of cells (label above control). `cases`: 60 controls, 20 of them
// bats; `dense`: 250 controls in the repeating six-kind pattern.
let panel!: HTMLElement;
let layoutName = params.get("layout") ?? "cases";
function sequence(name: string): Kind[] {
  if (name === "cases") {
    const group: Kind[] = ["bat", "rocker", "knob", "bat", "fader", "key", "plate"];
    return [...Array.from({ length: 8 }, () => group).flat(), "bat", "bat", "bat", "bat"];
  }
  if (name === "dense") return Array.from({ length: 250 }, (_, index) => kinds[index % kinds.length]!);
  throw new Error(`Unknown layout ${name}`);
}
/** Deterministic values, so every run lays out the same states. */
function seeded(seed: number) { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function control(kind: Kind, id: string, number: number, random: () => number) {
  const box = specs[kind].box;
  let element: HTMLInputElement | HTMLButtonElement;
  if (kind === "bat" || kind === "rocker") {
    element = Object.assign(document.createElement("input"), { type: "checkbox", checked: false });
    element.setAttribute("role", "switch");
  } else if (kind === "knob" || kind === "fader") {
    element = Object.assign(document.createElement("input"), { type: "range", min: "0", max: "100", step: "1", value: String(Math.round(10 + random() * 80)) });
    element.dataset.initial = element.value;
    if (kind === "fader") {
      element.setAttribute("aria-orientation", "vertical");
      element.style.setProperty("--thumb-width", `${box.width}px`);
      element.style.setProperty("--thumb-height", `${box.height - tokens.fader.travel}px`);
    }
  } else {
    element = Object.assign(document.createElement("button"), { type: "button" });
  }
  element.id = id;
  element.dataset.part = kind;
  element.setAttribute("aria-label", `${kind[0]!.toUpperCase()}${kind.slice(1)} ${number}`);
  Object.assign(element.style, { width: `${box.width}px`, height: `${box.height}px`, borderRadius: `${box.radius}px` });
  return element;
}
function layout(name: string) {
  layoutName = name;
  const heading = document.createElement("h2");
  heading.textContent = `I0.5 object-on-object shadows: ${name}`;
  const cells = document.createElement("div");
  cells.className = "cells";
  if (name === "dense") { cells.style.setProperty("--row-gap", "6px"); cells.style.setProperty("--column-gap", "10px"); }
  const numbers = new Map<Kind, number>(), random = seeded(5);
  for (const kind of sequence(name)) {
    const number = (numbers.get(kind) ?? 0) + 1;
    numbers.set(kind, number);
    const cell = document.createElement("div");
    cell.className = "cell";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `${abbreviation[kind]} ${number}`;
    cell.append(label, control(kind, `${kind}-${number}`, number, random));
    cells.append(cell);
  }
  panel.replaceChildren(heading, cells);
  layoutPose();
}
/** The layout's own pose: bats at the low stop, the high stop and mid-travel in turn, rockers alternating, ranges at their seeded values. */
function layoutPose() {
  let bat = 0, rocker = 0;
  for (const element of panel.querySelectorAll<HTMLInputElement>("input[data-part]")) {
    if (element.dataset.part === "bat") { element.checked = bat % 3 === 1; if (bat % 3 === 2) override.set(element, 0.5); bat++; }
    else if (element.dataset.part === "rocker") element.checked = rocker++ % 2 === 1;
    else if (element.dataset.initial !== undefined) element.value = element.dataset.initial;
  }
}

const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const material = (spec: PartSpec) => {
  const [r, g, b] = spec.colour;
  const created = createPbrMaterial({ baseColorFactor: [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1], metallicFactor: spec.metallic, roughnessFactor: spec.roughness, doubleSided: true });
  if (spec.emissive) setPbrEmissive(created as unknown as PbrMaterialProps, spec.emissive);
  return created as unknown as Material;
};

/** A thin-instanced part kind with full pose matrices (I0.2's: the harness's `Pose` has no tilt about an in-plane axis). */
interface Instanced extends PartKind { place(index: number, matrix: number[]): void }
function instanced(layer: InstrumentLayer, name: string, data: PartData, partMaterial: Material, capacity: number): Instanced {
  const mesh = partMesh(layer.scene.surface.engine, `${layer.id}-${name}`, data);
  mesh.material = partMaterial;
  const matrices = new Float32Array(Math.max(1, capacity) * 16);
  setThinInstances(mesh, matrices, Math.max(1, capacity));
  addToScene(layer.scene, mesh);
  let dirty = false;
  const kind: Instanced = {
    name, mesh, capacity,
    place(index, matrix) { matrices.set(matrix, index * 16); dirty = true; },
    pose() { throw new Error("Parts are placed with full matrices"); },
    hide(index) { matrices.fill(0, index * 16, index * 16 + 16); dirty = true; },
    flush() { if (dirty) { flushThinInstances(mesh); dirty = false; } },
  };
  layer.kinds.push(kind);
  return kind;
}

// The analytic face shadow: one quad per control on the face, loading that control's casters from a storage buffer.
const analyticVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
@vertex fn mainVertex(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  out.slot = instance;
  return out;
}`;
const analyticFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
fn roundedBox(q: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
  let radius = min(r, min(half.x, half.y));
  let a = abs(q) - half + vec2<f32>(radius);
  return length(max(a, vec2<f32>(0.0))) + min(max(a.x, a.y), 0.0) - radius;
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  // Layer-local CSS px of this pixel: the quad lies on the face, which the stage camera maps 1:1.
  let p = input.position.xy / shaderUniforms.frame.z - shaderUniforms.frame.xy;
  var s = 0.0;
  for (var i = 0u; i < ${castersPerControl}u; i++) {
    let a = shapes[(input.slot * ${castersPerControl}u + i) * 2u];
    let b = shapes[(input.slot * ${castersPerControl}u + i) * 2u + 1u];
    let h = b.y;
    if (h <= 0.0) { continue; }
    let q = p - a.xy;
    let fall = roundedBox(q - shaderUniforms.offset.xy * h, a.zw, b.x);
    let value = shaderUniforms.frame.w * (1.0 - smoothstep(-0.5 * h, 1.5 * h + 1.0, fall)) * smoothstep(-1.0, 0.5, roundedBox(q, a.zw, b.x));
    s = max(s, value);
  }
  return vec4<f32>(0.0, 0.0, 0.0, s);
}`;
// Darkens what is beneath by the alpha, and accumulates coverage in alpha (so the present composite does the same).
const shadeBlend: GPUBlendState = { color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
// The present composite: the post-processed mesh target over the captured face, premultiplied.
const presentVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = vec4<f32>(input.position.xy, 0.0, 1.0);
  return out;
}`;
const presentFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureLoad(meshColour, vec2<i32>(floor(input.position.xy)), 0);
}`;
const premultiplied: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };

interface Control { element: HTMLElement; kind: Kind; index: number; slot: number; rect: Rect; label?: HTMLElement }
interface Built {
  layer: InstrumentLayer; parts: Map<string, Instanced>; controls: Map<HTMLElement, Control>;
  analytic: { mesh: Mesh; data: Float32Array; buffer: StorageBuffer; dirty: boolean; quads: Float32Array };
  generator?: ShadowGenerator; mapRendered?: boolean; contact?: ScreenSpaceContactShadowsPostProcessTask; config: Config;
}
let built: Built | undefined;
/** Switch travel, eased between the native states; `override` holds a travel per control (tests, the cases pose, animation). */
const motion = new Map<HTMLElement, { t: number; from: number; to: number; start: number }>();
const override = new Map<HTMLElement, number>();
const target = (element: HTMLElement) => {
  const input = element as HTMLInputElement;
  if (input.type === "checkbox") return Number(input.checked);
  if (input.type === "range") return (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  return 0;
};
const travelOf = (element: HTMLElement) => override.get(element) ?? ((element as HTMLInputElement).type === "checkbox" ? motion.get(element)?.t ?? target(element) : target(element));

/** The analytic casters of one control at travel `t`, in layer-local px (y down). */
function casters(entry: Control, t: number): Caster[] {
  const box = specs[entry.kind].box, cx = entry.rect.x + entry.rect.width / 2, cy = entry.rect.y + entry.rect.height / 2;
  const base = (h: number, inset = 1, r = box.radius - inset): Caster => ({ x: cx, y: cy, hw: box.width / 2 - inset, hh: box.height / 2 - inset, r, h });
  const circle = (radius: number, h: number, dy = 0): Caster => ({ x: cx, y: cy + dy, hw: radius, hh: radius, r: radius, h });
  if (entry.kind === "bat") {
    const b = tokens.bat, a = b.throw * (2 * t - 1), s = Math.sin(a), c = Math.cos(a);
    // The lever is a rounded box along its swing, at its mean height; the ball a disc at its centre's height.
    return [base(b.plateRise), circle(b.washer, b.plateRise + b.washerRise), circle(b.nut, batPivot),
      { x: cx, y: cy - (s * b.lever) / 2, hw: b.rodBase, hh: Math.abs(s * b.lever) / 2 + b.rodBase, r: b.rodBase, h: batPivot + (c * b.lever) / 2 },
      circle(b.ball, batPivot + c * b.lever, -s * b.lever)];
  }
  if (entry.kind === "rocker") {
    const r = tokens.rocker, spec = specs.rocker.parts.find(candidate => candidate.name === "plates")!, m = local(spec, t);
    // Each plate's orthographic footprint and highest point at this pose.
    const plates = rockerHalves.map(data => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, h = 0;
      for (let index = 0; index < data.positions.length; index += 3) {
        const [x, y, z] = apply(m, data.positions[index]!, data.positions[index + 1]!, data.positions[index + 2]!);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, -y); y1 = Math.max(y1, -y); h = Math.max(h, -z);
      }
      return { x: cx + (x0 + x1) / 2, y: cy + (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2, r: 2, h };
    });
    return [base(r.bezelRise), ...plates];
  }
  if (entry.kind === "knob") {
    const k = tokens.knob, radius = k.box / 2;
    return [circle(radius - k.collarInset, k.collar), circle(radius - k.skirtInset, k.skirt), circle(radius - k.capInset, k.cap)];
  }
  if (entry.kind === "fader") {
    const f = tokens.fader;
    return [base(f.plateRise), { x: cx, y: cy - f.travel * (t - 0.5), hw: f.capWidth / 2, hh: f.capLength / 2, r: 2.5, h: f.plateRise + f.rise }];
  }
  if (entry.kind === "key") {
    const k = tokens.key;
    return [base(k.plinthRise), base(k.plinthRise + k.capRise, k.capInset, box.radius - 2)];
  }
  const p = tokens.plate;
  return [base(p.mountRise), { x: cx, y: cy, hw: p.plateWidth / 2, hh: p.plateHeight / 2, r: p.plateRadius, h: p.mountRise + p.plateRise }];
}
/** How far a control's analytic shadow can reach past its box. */
const reach = (list: Caster[]) => Math.max(...list.map(caster => Math.hypot(shadowOffset.x, shadowOffset.y) * caster.h + 1.5 * caster.h + 2));

async function build(layer: InstrumentLayer) {
  const engine = layer.scene.surface.engine as EngineContext;
  const current = structuredClone(config);
  const controls = new Map<HTMLElement, Control>(), counts = new Map<Kind, number>();
  let slot = 0;
  for (const element of layer.element.querySelectorAll<HTMLElement>("[data-part]")) {
    const kind = element.dataset.part as Kind, index = counts.get(kind) ?? 0;
    counts.set(kind, index + 1);
    controls.set(element, { element, kind, index, slot: slot++, rect: layer.rectOf(element), label: element.previousElementSibling as HTMLElement | undefined });
  }
  const { width, height } = { width: frame.clientWidth, height: frame.clientHeight };
  // (b) The shadow map from the key light, its depth range fitted to the stage.
  const light = layer.light, direction = light.direction, length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  // The light and its generator exist before any part is added, and parts receive only when there is a generator (a
  // receiver built without one keeps that state: see the report).
  let generator: ShadowGenerator | undefined;
  if (current.generator !== "none") {
    const L = tokens.lightDistance, R = Math.hypot(width, height) / 2 + 200;
    light.position.set(-(direction.x / length) * L, -(direction.y / length) * L, -(direction.z / length) * L);
    const refresh = current.policy === "frame";
    generator = current.generator === "pcf"
      ? createPcfDirectionalShadowGenerator(engine, light, { mapSize: current.mapSize, bias: current.bias, normalBias: current.normalBias, darkness: current.darkness, orthoMinZ: L - R, orthoMaxZ: L + R, forceRefreshEveryFrame: refresh })
      : current.generator === "esm"
        ? createEsmDirectionalShadowGenerator(engine, light, { mapSize: current.mapSize, bias: current.bias, darkness: current.darkness, depthScale: current.esm.depthScale, blurKernel: current.esm.blurKernel, orthoMinZ: L - R, orthoMaxZ: L + R, forceRefreshEveryFrame: refresh })
        : createCsmDirectionalShadowGenerator(engine, light, { mapSize: current.mapSize, numCascades: current.csm.numCascades, lambda: current.csm.lambda, stabilizeCascades: current.csm.stabilizeCascades,
          bias: current.bias, ...(current.csm.worldSpaceBias === undefined ? {} : { worldSpaceBias: current.csm.worldSpaceBias }), darkness: current.darkness,
          shadowMaxZ: layer.camera.position.z * -1 + 200, forceRefreshEveryFrame: refresh });
    light.shadowGenerator = generator;
  }
  // Every part casts and receives; each kind's bounds are the union of its placements (the directional fit reads them).
  const parts = new Map<string, Instanced>(), casterMeshes: Mesh[] = [];
  for (const kind of kinds) {
    const count = counts.get(kind) ?? 0;
    if (!count) continue;
    const entries = [...controls.values()].filter(entry => entry.kind === kind);
    for (const spec of specs[kind].parts) {
      const kindPart = instanced(layer, `${kind}-${spec.name}`, spec.data, material(spec), count);
      const { x, y, h } = footprint(spec);
      const lo = [Infinity, Infinity, -h - 1], hi = [-Infinity, -Infinity, 1];
      for (const entry of entries) {
        const [wx, wy] = layer.world(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2);
        lo[0] = Math.min(lo[0]!, wx - x - 1); lo[1] = Math.min(lo[1]!, wy - y - 1); hi[0] = Math.max(hi[0]!, wx + x + 1); hi[1] = Math.max(hi[1]!, wy + y + 1);
      }
      kindPart.mesh.boundMin = lo as [number, number, number];
      kindPart.mesh.boundMax = hi as [number, number, number];
      kindPart.mesh.receiveShadows = !!generator;
      casterMeshes.push(kindPart.mesh);
      parts.set(`${kind}.${spec.name}`, kindPart);
    }
  }
  // The analytic quads: a unit square per control, scaled over its box and its shadow's reach, just above the face.
  const capacity = Math.max(1, controls.size);
  const quad = partMesh(engine, `${layer.id}-analytic`, plate(2, 2, 0, 0));
  const shade = createShaderMaterial({ name: `${layer.id}-analytic`, vertexSource: analyticVertex, fragmentSource: analyticFragment, attributes: ["position"],
    uniforms: ["world", "view", "projection",
      { name: "frame", type: "vec4<f32>", defaultValue: [layer.origin.x, layer.origin.y, window.devicePixelRatio, tokens.strength] },
      { name: "offset", type: "vec4<f32>", defaultValue: [shadowOffset.x, shadowOffset.y, 0, 0] }],
    storageBuffers: [{ name: "shapes", type: "array<vec4<f32>>" }], needAlphaBlending: true, blend: shadeBlend, depthWrite: false, backFaceCulling: false });
  enableShaderMaterialInstanceWorld(shade);
  const data = new Float32Array(capacity * castersPerControl * 8);
  const buffer = createStorageBuffer(engine, data, `${layer.id}-analytic-casters`);
  setShaderStorageBuffer(shade, "shapes", buffer);
  onSceneDispose(layer.scene, () => disposeStorageBuffer(buffer));
  quad.material = shade as unknown as Material;
  const quads = new Float32Array(capacity * 16);
  setThinInstances(quad, quads, capacity);
  addToScene(layer.scene, quad);
  setMeshVisible(quad, paths.analytic);
  built = { layer, parts, controls, analytic: { mesh: quad, data, buffer, dirty: true, quads }, generator, config: current };
  if (generator) setShadowTaskCasterMeshes(generator, casterMeshes);
  for (const element of controls.keys()) pose(element);
  flushAll();

  // (c) The post chain: the mesh pass offscreen, contact shadows, and the present composite over the captured face.
  if (current.post) {
    const tasks = (getFrameGraph(layer.scene) as unknown as { _tasks: RenderTask[] })._tasks;
    const direct = tasks.find(task => task.name === "scene");
    if (!direct) throw new Error("The harness's direct mesh pass was not found");
    direct.enabled = false;
    const canvas = layer.scene.surface.canvas as HTMLCanvasElement, size = { width: canvas.width, height: canvas.height }, format = layer.scene.surface.format;
    const colour = createRenderTargetTexture(engine, { lbl: `${layer.id}-mesh-colour`, format, samples: 1, size });
    const depth = createRenderTarget({ lbl: `${layer.id}-mesh-depth`, dFormat: "depth24plus-stencil8", samples: 1, size });
    addTask(layer.scene, createRenderTask({ name: "mesh", rt: colour.rt, depth, clr: true, clrColor: { r: 0, g: 0, b: 0, a: 0 } }, engine, layer.scene));
    const composite = createRenderTargetTexture(engine, { lbl: `${layer.id}-mesh-composite`, format, samples: 1, size });
    onSceneDispose(layer.scene, () => { disposeRenderTargetTexture(colour); disposeRenderTargetTexture(composite); });
    const c = current.contact;
    const contact = createScreenSpaceContactShadowsPostProcessTask({ name: "contact", sourceTexture: colour.rt, depthTexture: depth, camera: layer.camera,
      lightDirection: { x: direction.x / length, y: direction.y / length, z: direction.z / length }, targetTexture: composite.rt, composition: "multiply",
      intensity: c.intensity, tint: c.tint, stepCount: c.stepCount, maxDistance: c.maxDistance, thickness: c.thickness, bias: c.bias, normalBias: c.normalBias,
      temporalWeight: 1, temporalSamples: 1, spatialRadius: 0 }, engine, layer.scene);
    contact.enabled = paths.contact;
    addTask(layer.scene, contact);
    built.contact = contact;
    const present = createRenderTask({ name: "present", rt: engine.scRT, clr: false, autoMirror: false }, engine, layer.scene);
    const presentMaterial = createShaderMaterial({ name: `${layer.id}-present`, vertexSource: presentVertex, fragmentSource: presentFragment, attributes: ["position"],
      samplers: ["meshColour"], needAlphaBlending: true, blend: premultiplied, depthWrite: false, backFaceCulling: false });
    setShaderTexture(presentMaterial, "meshColour", composite.texture);
    const screen = partMesh(engine, `${layer.id}-present`, plate(2, 2, 0, 0));
    screen.material = presentMaterial as unknown as Material;
    addMeshToTask(present, screen);
    addTask(layer.scene, present);
  }
  // The generator is built enabled: Lite 1.33 draws a receiver black when its generator is disabled before its first
  // shadow pass, so `applyPaths` turns the map off only after a frame has rendered it.
  if (built.generator) await registerSceneWithShadowSupport(layer.scene);
}
/**
 * Applies the current paths to the built scene; a map is rendered once (a core frame with meshes on) before it may be
 * turned off. `strict` (`setPaths`) refuses a path the build lacks; after a rebuild such a path is turned off.
 */
function applyPaths(strict = false) {
  if (!built) throw new Error("Not built");
  if (strict && paths.map && !built.generator) throw new Error("The map path needs a generator: configure({ generator })");
  if (strict && paths.contact && !built.contact) throw new Error("The contact path needs the post chain: configure({ post: true })");
  paths = { ...paths, map: paths.map && !!built.generator, contact: paths.contact && !!built.contact };
  setMeshVisible(built.analytic.mesh, paths.analytic);
  if (built.generator) {
    if (!paths.map && !built.mapRendered) { setShadowGeneratorEnabled(built.generator, true); harness.draw(); }
    built.mapRendered = true;
    setShadowGeneratorEnabled(built.generator, paths.map);
  }
  if (built.contact) built.contact.enabled = paths.contact;
}

/** The world matrix of one part of one control at travel `t`. */
function world(entry: Control, spec: PartSpec, t: number, layer = built!.layer) {
  const m = local(spec, t), [wx, wy] = layer.world(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2);
  m[12] = m[12]! + wx; m[13] = m[13]! + wy;
  return m;
}
/** Writes one control's parts and analytic casters from its native state (or its override). */
function pose(element: HTMLElement) {
  const entry = built?.controls.get(element);
  if (!entry) return;
  const t = travelOf(entry.element);
  for (const spec of specs[entry.kind].parts) built!.parts.get(`${entry.kind}.${spec.name}`)!.place(entry.index, world(entry, spec, t));
  const list = casters(entry, t), { data, quads } = built!.analytic, start = entry.slot * castersPerControl * 8;
  data.fill(0, start, start + castersPerControl * 8);
  list.forEach((caster, index) => data.set([caster.x, caster.y, caster.hw, caster.hh, caster.r, caster.h, 0, 0], start + index * 8));
  const pad = reach(list), [wx, wy] = built!.layer.world(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2, 0.02);
  quads.set([entry.rect.width / 2 + pad, 0, 0, 0, 0, entry.rect.height / 2 + pad, 0, 0, 0, 0, 1, 0, wx, wy, -0.02, 1], entry.slot * 16);
  built!.analytic.dirty = true;
}
const poseAll = () => { if (built) for (const element of built.controls.keys()) pose(element); };
function flushAll() {
  if (!built) return;
  for (const kind of built.parts.values()) kind.flush();
  if (built.analytic.dirty) {
    updateStorageBuffer(built.layer.scene.surface.engine as EngineContext, built.analytic.buffer, built.analytic.data);
    flushThinInstances(built.analytic.mesh);
    built.analytic.dirty = false;
  }
}

// A switch snaps to its new state: eased, never past either stop (I0.2's easing).
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
let ticking = false;
function tick() {
  ticking = true;
  requestAnimationFrame(now => {
    let active = false;
    for (const [element, state] of motion) {
      const progress = Math.min(1, (now - state.start) / tokens.snapMs);
      state.t = state.from + (state.to - state.from) * ease(progress);
      if (progress < 1) active = true;
      pose(element);
    }
    flushAll();
    harness.draw();
    if (active) tick(); else ticking = false;
  });
}
function snapSwitch(element: HTMLInputElement) {
  override.delete(element);
  const state = motion.get(element) ?? { t: 1 - target(element), from: 0, to: 0, start: 0 };
  Object.assign(state, { from: state.t, to: target(element), start: performance.now() });
  motion.set(element, state);
  if (!ticking) tick();
}

// The test waits for `window.shadowsProbe` and then for `ready`, which rejects with the reason if the probe cannot start.
let resolveReady!: (api: ShadowsProbeApi) => void;
let readyFailed!: (error: unknown) => void;
window.shadowsProbe = { ready: new Promise<ShadowsProbeApi>((resolve, reject) => { resolveReady = resolve; readyFailed = reject; }) };
const harness = await startInstrument({
  frame, light: tokens.light, envelopes, budgets: { layers: 8, pixels: 4_000_000 },
  onStatus: message => { status.dataset.core = message; },
  mount(root) {
    panel = document.createElement("section");
    panel.id = "panel";
    panel.setAttribute("aria-label", "Shadow cases");
    root.append(panel);
    layout(layoutName);
    return [panel];
  },
  build,
}).catch(error => {
  status.textContent = `Probe unavailable: ${error}`;
  window.shadowsProbe.error = String(error);
  readyFailed(error);
  throw error;
});

// Native state drives the parts: a check snaps a switch, a value poses a range at once.
const refresh = (event: Event) => {
  const element = event.target as HTMLInputElement;
  if (!built?.controls.has(element)) return;
  if (element.type === "checkbox") snapSwitch(element);
  else { pose(element); flushAll(); harness.draw(); }
};
panel.addEventListener("input", refresh);
panel.addEventListener("change", refresh);

const canvasBox = () => harness.hosts.outputCanvas.getBoundingClientRect();
const describe = () => {
  const camera = harness.camera();
  status.textContent = `I0.5 shadows, ${layoutName}: ${built?.controls.size ?? 0} controls, camera ${camera.distance} px; paths `
    + `${Object.entries(paths).filter(([, on]) => on).map(([name]) => name).join(" + ") || "none"}; map ${built?.config.generator} ${built?.config.mapSize} ${built?.config.policy}, post ${built?.config.post}\n${status.dataset.core ?? ""}`;
};
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const snaps = new Map<string, Screenshot>();
let shot: Screenshot | undefined;
/** Draws until the GPU is idle, then resolves a decoded frame. */
async function settle(frames = 3) {
  while (ticking) await nextFrame();
  await harness.idle();
  for (let index = 0; index < frames; index++) { harness.draw(); await nextFrame(); }
  shot = await harness.readback();
  describe();
  return shot;
}

/** Client-space boxes of the controls, with the analytic casters of their current pose in client px. */
const controls = () => {
  const canvas = canvasBox(), panelBox = panel.getBoundingClientRect();
  return [...(built?.controls.values() ?? [])].map(entry => {
    const box = entry.element.getBoundingClientRect();
    const list = casters(entry, travelOf(entry.element)).map(caster => ({ ...caster, x: caster.x + panelBox.left, y: caster.y + panelBox.top }));
    return { id: entry.element.id, kind: entry.kind, x: box.left, y: box.top, width: box.width, height: box.height, radius: parseFloat(getComputedStyle(entry.element).borderTopLeftRadius) || 0,
      casters: list, reach: reach(list), canvas: { left: canvas.left, top: canvas.top } };
  });
};
type Box = ReturnType<typeof controls>[number];
/** Signed distance from a point to a rounded rectangle, negative inside (I0.1's measure). */
const rounded = (point: Point, box: { x: number; y: number; width: number; height: number; radius: number }) =>
  roundedBox(point.x - box.x - box.width / 2, point.y - box.y - box.height / 2, box.width / 2, box.height / 2, box.radius);
/** Controls whose box or analytic shadow can reach a client point, binned by 64 px rows. */
function binned(list: Box[]) {
  const band = 64, rows = new Map<number, Box[]>();
  for (const entry of list) {
    const top = entry.y - entry.reach, bottom = entry.y + entry.height + entry.reach;
    for (let row = Math.floor(top / band); row <= Math.floor(bottom / band); row++) { if (!rows.has(row)) rows.set(row, []); rows.get(row)!.push(entry); }
  }
  return (point: Point) => rows.get(Math.floor(point.y / band)) ?? [];
}
const luminance = (data: Uint8ClampedArray, offset: number) => {
  const channel = (value: number) => srgbToLinear(value);
  return 0.2126 * channel(data[offset]!) + 0.7152 * channel(data[offset + 1]!) + 0.0722 * channel(data[offset + 2]!);
};
const level = (data: Uint8ClampedArray, offset: number) => 0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!;
const clientOf = (x: number, y: number) => { const box = canvasBox(), dpr = harness.dpr; return { x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr }; };
const hitId = (point: Point) => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? hit?.className ?? ""; };

/**
 * Every pixel that differs between snapshots `a` and `b`, by where it lies: inside a control's rounded box, outside every
 * box but inside some control's analytic shadow support, or outside both (the face that must stay untouched).
 */
function compare(a: string, b: string, options: { samples?: number } = {}) {
  const on = snaps.get(a)!, off = snaps.get(b)!, list = controls(), near = binned(list);
  const result = { changed: 0, insideBoxes: 0, outsideBoxes: 0, outsideFootprints: 0, maxDelta: 0, outsideSamples: [] as { x: number; y: number; delta: number }[],
    perKind: {} as Record<string, number>, outsideBoxSamples: [] as { x: number; y: number; id: string; distance: number; square: number }[] };
  const inner: { x: number; y: number; id: string }[] = [];
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    const delta = Math.max(Math.abs(on.data[offset]! - off.data[offset]!), Math.abs(on.data[offset + 1]! - off.data[offset + 1]!), Math.abs(on.data[offset + 2]! - off.data[offset + 2]!));
    if (!delta) continue;
    result.changed++;
    result.maxDelta = Math.max(result.maxDelta, delta);
    const point = clientOf(x, y), candidates = near(point);
    let owner: Box | undefined, distance = Infinity;
    for (const entry of candidates) { const d = rounded(point, entry); if (d < distance) { distance = d; owner = entry; } }
    if (owner && distance <= 0) {
      result.insideBoxes++;
      result.perKind[owner.kind] = (result.perKind[owner.kind] ?? 0) + 1;
      if (distance <= -1) inner.push({ ...point, id: owner.id });
      continue;
    }
    result.outsideBoxes++;
    // `square`: the distance from the nearest control's box ignoring its corner radius.
    const square = Math.min(Infinity, ...candidates.map(entry => roundedBox(point.x - entry.x - entry.width / 2, point.y - entry.y - entry.height / 2, entry.width / 2, entry.height / 2, 0)));
    if (result.outsideBoxSamples.length < 4000) result.outsideBoxSamples.push({ ...point, id: owner?.id ?? "", distance, square });
    const panelBox = panel.getBoundingClientRect(), lx = point.x - panelBox.left, ly = point.y - panelBox.top;
    const supported = candidates.some(entry => entry.casters.some(caster => casterShadow({ ...caster, x: caster.x - panelBox.left, y: caster.y - panelBox.top }, lx, ly).support));
    if (!supported) {
      result.outsideFootprints++;
      if (result.outsideSamples.length < 20) result.outsideSamples.push({ x: point.x, y: point.y, delta });
    }
  }
  const step = Math.max(1, Math.floor(inner.length / (options.samples ?? 2000)));
  let hitSamples = 0, hitMismatches = 0;
  const mismatchSamples: unknown[] = [];
  for (let index = 0; index < inner.length; index += step) {
    const point = inner[index]!, hit = hitId(point);
    hitSamples++;
    if (hit !== point.id) { hitMismatches++; if (mismatchSamples.length < 10) mismatchSamples.push({ ...point, hit }); }
  }
  const { outsideBoxSamples, ...summary } = result;
  return { a, b, ...summary, hitSamples, hitMismatches, mismatchSamples, outsideBoxPoints: outsideBoxSamples };
}
/**
 * Native hits at pixels a shadow darkened more than 1.5 px outside every control's box, judged against the square box:
 * Chrome hit-tests these range inputs over their corners too (a round knob's box hits up to 4.8 px outside the circle,
 * measured), so a shadow pixel in a rounded corner may legitimately hit its control. They must not find a control.
 */
function shadowHits(a: string, b: string) {
  const outsideBoxPoints = compare(a, b, { samples: 1 }).outsideBoxPoints.filter(point => point.square > 1.5);
  const step = Math.max(1, Math.floor(outsideBoxPoints.length / 1500));
  let points = 0, onControl = 0;
  const samples: unknown[] = [];
  for (let index = 0; index < outsideBoxPoints.length; index += step) {
    const point = outsideBoxPoints[index]!, hit = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-part]");
    points++;
    if (hit) { onControl++; if (samples.length < 10) samples.push({ ...point, hit: hit.id }); }
  }
  return { points, onControl, samples };
}
/** Native hits on a 7 × 7 grid 1.5 px inside every control's box, and 1.5 px outside each edge's middle (I0.2's). */
function gridHits() {
  const misses: { point: Point; id: string; hit: string; inside: boolean }[] = [];
  let points = 0;
  for (const entry of controls()) {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const point = { x: entry.x + 1.5 + ((entry.width - 3) * i) / 6, y: entry.y + 1.5 + ((entry.height - 3) * j) / 6 };
      if (rounded(point, entry) > -1) continue;
      points++;
      const hit = hitId(point);
      if (hit !== entry.id) misses.push({ point, id: entry.id, hit, inside: true });
    }
    const cx = entry.x + entry.width / 2, cy = entry.y + entry.height / 2;
    for (const point of [{ x: entry.x - 1.5, y: cy }, { x: entry.x + entry.width + 1.5, y: cy }, { x: cx, y: entry.y - 1.5 }, { x: cx, y: entry.y + entry.height + 1.5 }]) {
      if (point.x < 0 || point.y < 0 || point.x >= innerWidth || point.y >= innerHeight) continue;
      points++;
      const hit = hitId(point);
      if (hit === entry.id) misses.push({ point, id: entry.id, hit, inside: false });
    }
  }
  return { points, misses: misses.length, missSamples: misses.slice(0, 20) };
}

/** Client point of a world point (the harness camera: z = 0 maps 1:1, perspective about the stage centre). */
function project([x, y, z]: [number, number, number]) {
  const { width, height, distance } = harness.camera(), box = canvasBox(), k = distance / (distance + z);
  return { x: box.left + width / 2 + x * k, y: box.top + height / 2 - y * k };
}
/** Where light leaving a world point lands on the plane `h` above the face, as a client point. */
function along([x, y, z]: [number, number, number], h: number) {
  // Light travels opposite `towardsLight` (panel axes), losing height `towardsLight.z` per unit; world axes flip y.
  const s = (-z - h) / towardsLight.z;
  return project([x - towardsLight.x * s, y + towardsLight.y * s, -h]);
}
/** Convex hull (Andrew's monotone chain) of client points, counter-clockwise. */
function hull(points: Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y), cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [], upper: Point[] = [];
  for (const point of sorted) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop(); lower.push(point); }
  for (const point of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop(); upper.push(point); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
const insideHull = (polygon: Point[], point: Point, grow = 0) => {
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!, b = polygon[(index + 1) % polygon.length]!, length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length < -grow) return false;
  }
  return true;
};
/** World vertices of one part of one control at its current pose. */
function vertices(entry: Control, name: string) {
  const spec = specs[entry.kind].parts.find(candidate => candidate.name === name)!, m = world(entry, spec, travelOf(entry.element)), out: [number, number, number][] = [];
  for (let index = 0; index < spec.data.positions.length; index += 3) out.push(apply(m, spec.data.positions[index]!, spec.data.positions[index + 1]!, spec.data.positions[index + 2]!));
  return out;
}
/** Device-pixel bounds of a client rect, clamped to the frame. */
function pixelRange(rect: { x: number; y: number; width: number; height: number }, shotWidth: number, shotHeight: number) {
  const box = canvasBox(), dpr = harness.dpr;
  return { x0: Math.max(0, Math.floor((rect.x - box.left) * dpr)), y0: Math.max(0, Math.floor((rect.y - box.top) * dpr)),
    x1: Math.min(shotWidth - 1, Math.ceil((rect.x + rect.width - box.left) * dpr)), y1: Math.min(shotHeight - 1, Math.ceil((rect.y + rect.height - box.top) * dpr)) };
}

/**
 * The lever's shadow on its plate, per bat: the region the lever and ball project to along the light on the plate's top
 * (their hulls, grown by `grow` px for the filter), less the drawn hulls of the lever, ball and nut, inside the plate's
 * top. Counts pixels darker by `threshold` levels between `on` and `off` inside that region, inside the washer's and
 * nut's own shadow region, and elsewhere on the plate, where no part can cast (acne).
 */
function leverShadow(a: string, b: string, options: { threshold?: number; grow?: number } = {}) {
  const on = snaps.get(a)!, off = snaps.get(b)!, threshold = options.threshold ?? 4, grow = options.grow ?? 1.5;
  return [...built!.controls.values()].filter(entry => entry.kind === "bat").map(entry => {
    const rod = vertices(entry, "lever"), ball = vertices(entry, "ball"), top = tokens.bat.plateRise;
    const shadows = [hull(rod.map(point => along(point, top))), hull(ball.map(point => along(point, top)))];
    const others = ["washer", "nut"].map(name => hull(vertices(entry, name).map(point => along(point, top))));
    const own = [hull(rod.map(project)), hull(ball.map(project)), hull(vertices(entry, "nut").map(project))];
    const box = entry.element.getBoundingClientRect(), plateTop = { x: box.left + 1 + tokens.bat.plateTaper + 1, y: box.top + 1 + tokens.bat.plateTaper + 1,
      width: box.width - 2 * (2 + tokens.bat.plateTaper), height: box.height - 2 * (2 + tokens.bat.plateTaper) };
    const range = pixelRange(plateTop, on.width, on.height);
    let region = 0, darkened = 0, sum = 0, lit = 0, otherArea = 0, otherDarkened = 0, remoteArea = 0, acne = 0, plateArea = 0, remoteSum = 0;
    for (let y = range.y0; y <= range.y1; y++) for (let x = range.x0; x <= range.x1; x++) {
      const point = clientOf(x, y);
      if (point.x < plateTop.x || point.y < plateTop.y || point.x > plateTop.x + plateTop.width || point.y > plateTop.y + plateTop.height) continue;
      if (own.some(polygon => insideHull(polygon, point, 0.5))) continue;
      const offset = (y * on.width + x) * 4, delta = level(on.data, offset) - level(off.data, offset), dark = delta <= -threshold;
      plateArea++;
      if (shadows.some(polygon => insideHull(polygon, point))) { region++; sum += delta; lit += level(off.data, offset); if (dark) darkened++; }
      else if (shadows.some(polygon => insideHull(polygon, point, grow)) || others.some(polygon => insideHull(polygon, point, grow))) { otherArea++; if (dark) otherDarkened++; }
      else { remoteArea++; remoteSum += delta; if (dark) acne++; }
    }
    // `ratio`: the shadowed plate's mean level over its lit level (the analytic face shadow's is 1 − shadow.strength at its core).
    return { id: entry.element.id, travel: travelOf(entry.element), plateArea, region, darkened, meanDelta: region ? sum / region : 0, ratio: region ? (lit + sum) / lit : 1, otherArea, otherDarkened,
      remoteArea, acne, remoteMeanDelta: remoteArea ? remoteSum / remoteArea : 0 };
  });
}

/**
 * The contact line where a cap meets what it stands on: a band `width` px wide just outside the cap's base on the side
 * away from the light (knob cap on its skirt, key cap on its plinth, fader cap on its plate), unprojected to the
 * receiving plane. Counts pixels darker by `threshold` levels between `on` and `off` in the band.
 */
function contactLines(a: string, b: string, options: { width?: number; threshold?: number } = {}) {
  const on = snaps.get(a)!, off = snaps.get(b)!, band = options.width ?? 3, threshold = options.threshold ?? 3;
  const { width, height, distance } = harness.camera(), canvas = canvasBox(), panelBox = panel.getBoundingClientRect();
  // Layer-local point on the plane `h` above the face that a client point shows.
  const onPlane = (point: Point, h: number) => {
    const vx = canvas.left + width / 2, vy = canvas.top + height / 2, k = (distance - h) / distance;
    return { x: vx + (point.x - vx) * k - panelBox.left, y: vy + (point.y - vy) * k - panelBox.top };
  };
  const result: Record<string, { caps: number; band: number; darkened: number; meanDelta: number }> = {};
  for (const entry of built!.controls.values()) {
    if (entry.kind !== "knob" && entry.kind !== "key" && entry.kind !== "fader") continue;
    const list = casters(entry, travelOf(entry.element)), cap = list.at(-1)!, receiver = list.at(-2)!;
    const plane = receiver.h, box = entry.element.getBoundingClientRect(), range = pixelRange(box, on.width, on.height);
    const record = (result[entry.kind] ??= { caps: 0, band: 0, darkened: 0, meanDelta: 0 });
    record.caps++;
    for (let y = range.y0; y <= range.y1; y++) for (let x = range.x0; x <= range.x1; x++) {
      const p = onPlane(clientOf(x, y), plane), qx = p.x - cap.x, qy = p.y - cap.y;
      const d = roundedBox(qx, qy, cap.hw, cap.hh, cap.r);
      // Outside the cap's base, within the band, on the far side from the light, and on the receiver.
      if (d < 0.5 || d > 0.5 + band || qx * shadowOffset.x + qy * shadowOffset.y <= 0 || roundedBox(p.x - receiver.x, p.y - receiver.y, receiver.hw, receiver.hh, receiver.r) > -1) continue;
      const offset = (y * on.width + x) * 4, delta = level(on.data, offset) - level(off.data, offset);
      record.band++; record.meanDelta += delta;
      if (delta <= -threshold) record.darkened++;
    }
  }
  for (const record of Object.values(result)) record.meanDelta = record.band ? record.meanDelta / record.band : 0;
  return result;
}

/**
 * The thin plate's shadow on its mount: pixels of the mount's top, outside the thin plate's base, darker by `threshold`
 * levels between `on` and `off`. Reports the shadow's 8-connected components, and per scanline across the plate's
 * right and bottom edges (the side away from the light) the gap from the plate's base edge to the shadow's near edge
 * and the rows with no shadow within 8 px (a cut). With `face`, the same for the mount's own shadow on the face.
 */
function thinPlate(a: string, b: string, options: { threshold?: number; face?: boolean } = {}) {
  const on = snaps.get(a)!, off = snaps.get(b)!, threshold = options.threshold ?? 3, dpr = harness.dpr, p = tokens.plate;
  return [...built!.controls.values()].filter(entry => entry.kind === "plate").map(entry => {
    const box = entry.element.getBoundingClientRect(), canvas = canvasBox();
    // The caster's base outline on screen (projected at the receiving plane) and the receiving area.
    const [wx, wy] = built!.layer.world(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2);
    const caster = options.face ? { hw: box.width / 2 - 1, hh: box.height / 2 - 1, h: 0 } : { hw: p.plateWidth / 2, hh: p.plateHeight / 2, h: p.mountRise };
    const corner = (sx: number, sy: number) => project([wx + sx * caster.hw, wy - sy * caster.hh, -caster.h]);
    const base = { left: corner(-1, -1).x, top: corner(-1, -1).y, right: corner(1, 1).x, bottom: corner(1, 1).y };
    const area = options.face
      ? { x: base.left - 4, y: base.top - 4, width: base.right - base.left + 40, height: base.bottom - base.top + 40 }
      : { x: box.left + 2 + p.mountTaper, y: box.top + 2 + p.mountTaper, width: box.width - 4 - 2 * p.mountTaper, height: box.height - 4 - 2 * p.mountTaper };
    const range = pixelRange(area, on.width, on.height), w = range.x1 - range.x0 + 1, h = range.y1 - range.y0 + 1;
    const mask = new Uint8Array(w * h);
    const inBase = (point: Point) => point.x >= base.left && point.x <= base.right && point.y >= base.top && point.y <= base.bottom;
    // Pixels more than `far` px from the base cannot be in the caster's shadow: darkening there is acne.
    const far = 6;
    let shadowPixels = 0, farArea = 0, farShadow = 0;
    for (let y = range.y0; y <= range.y1; y++) for (let x = range.x0; x <= range.x1; x++) {
      const point = clientOf(x, y);
      if (inBase(point)) continue;
      const distance = Math.hypot(Math.max(base.left - point.x, 0, point.x - base.right), Math.max(base.top - point.y, 0, point.y - base.bottom)), remote = distance > far;
      if (remote) farArea++;
      const offset = (y * on.width + x) * 4;
      if (level(on.data, offset) - level(off.data, offset) <= -threshold) { mask[(y - range.y0) * w + (x - range.x0)] = 1; shadowPixels++; if (remote) farShadow++; }
    }
    // 8-connected components.
    const labels = new Int32Array(w * h), sizes: number[] = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      const id = sizes.length + 1, stack = [start];
      labels[start] = id;
      let size = 0;
      while (stack.length) {
        const index = stack.pop()!, x = index % w, y = Math.floor(index / w);
        size++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, next = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[next] || labels[next]) continue;
          labels[next] = id; stack.push(next);
        }
      }
      sizes.push(size);
    }
    // Scanlines across the right edge (rows) and the bottom edge (columns), away from the corners' radius.
    const toDevice = (value: number, axis: "x" | "y") => (value - (axis === "x" ? canvas.left : canvas.top)) * dpr;
    const gaps: number[] = [], widths: number[] = [];
    let lines = 0, cut = 0;
    const scan = (axis: "x" | "y") => {
      const from = axis === "x" ? base.top + 4 : base.left + 4, to = axis === "x" ? base.bottom - 4 : base.right - 4;
      const edge = toDevice(axis === "x" ? base.right : base.bottom, axis);
      for (let along = Math.ceil(toDevice(from, axis === "x" ? "y" : "x")); along <= Math.floor(toDevice(to, axis === "x" ? "y" : "x")); along++) {
        lines++;
        let first = -1, last = -1;
        for (let step = Math.floor(edge) - 1; step <= Math.floor(edge) + 8 * dpr; step++) {
          const x = axis === "x" ? step : along, y = axis === "x" ? along : step;
          if (x < range.x0 || x > range.x1 || y < range.y0 || y > range.y1) continue;
          if (mask[(y - range.y0) * w + (x - range.x0)]) { if (first < 0) first = step; last = step; }
        }
        if (first < 0) { cut++; continue; }
        gaps.push(Math.max(0, (first + 0.5 - edge) / dpr));
        widths.push((last - first + 1) / dpr);
      }
    };
    scan("x"); scan("y");
    const sorted = (values: number[]) => [...values].sort((x, y) => x - y), median = (values: number[]) => sorted(values)[Math.floor(values.length / 2)] ?? null;
    return { id: entry.element.id, receiver: options.face ? "face" : "mount", shadowPixels, components: sizes.length, componentSizes: sorted(sizes).reverse().slice(0, 8),
      lines, cut, gapMedian: median(gaps), gapMax: gaps.length ? Math.max(...gaps) : null, widthMedian: median(widths), acne: farArea ? farShadow / farArea : 0 };
  });
}

/** Contrast of every label in snapshot `name`: its darkest 2% of pixels (the glyphs) against the ring just outside it. */
function labelContrast(name: string) {
  const image = snaps.get(name)!;
  const values = [...built!.controls.values()].filter(entry => entry.label).map(entry => {
    const rect = entry.label!.getBoundingClientRect(), range = pixelRange(rect, image.width, image.height);
    const text: number[] = [], ring: number[] = [];
    for (let y = range.y0 - 2; y <= range.y1 + 2; y++) for (let x = range.x0 - 2; x <= range.x1 + 2; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const value = luminance(image.data, (y * image.width + x) * 4);
      if (x >= range.x0 && x <= range.x1 && y >= range.y0 && y <= range.y1) text.push(value); else ring.push(value);
    }
    text.sort((x, y) => x - y); ring.sort((x, y) => x - y);
    const dark = text[Math.floor(text.length * 0.02)] ?? 1, background = ring[Math.floor(ring.length * 0.1)] ?? 0;
    return { id: entry.element.id, contrast: (background + 0.05) / (dark + 0.05) };
  });
  const worst = values.reduce((low, value) => (value.contrast < low.contrast ? value : low), values[0]!);
  return { labels: values.length, min: worst.contrast, worst: worst.id, mean: values.reduce((sum, value) => sum + value.contrast, 0) / values.length };
}

/** Meshes on (with the current paths) against meshes off: pixels outside every control's box, and hits on drawn pixels. */
async function containment() {
  harness.setMeshes(false);
  snaps.set("__off", await settle());
  harness.setMeshes(true);
  snaps.set("__on", await settle());
  const result = compare("__on", "__off", { samples: 3000 });
  const { outsideBoxPoints, ...summary } = result;
  return { ...summary, outsideBoxSamples: outsideBoxPoints.slice(0, 10) };
}

const statistics = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { frames: values.length, mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
};
/**
 * Runs `frames` animation frames and returns Lite's GPU frame time, the per-task GPU time by task name (mean per frame),
 * and the frame work (pose, core frame, GPU done). With `snapping`, the first 20 bats snap over centre and back
 * (10 frames each way, held 20, phases 7 frames apart), so the analytic casters and the casters' pose change each frame.
 */
async function measure(frames: number, options: { snapping?: boolean; bats?: number } = {}) {
  const engine = harness.engine()!;
  const timed = isGpuTimingSupported(engine);
  if (timed) setGpuTimingEnabled(engine, true);
  await setRenderTaskGpuTimingEnabled(engine, true).catch(() => undefined);
  const bats = [...built!.controls.values()].filter(entry => entry.kind === "bat").slice(0, options.bats ?? 20);
  const device = (harness.hosts.outputCanvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const before = harness.counts();
  const gpu: number[] = [], work: number[] = [], tasks = new Map<string, number[]>();
  let lastIndex = 0, renders = 0;
  for (let index = -10; index < frames; index++) {
    await nextFrame();
    const started = performance.now();
    if (options.snapping) bats.forEach((entry, which) => {
      const phase = ((index + 10) + which * 7) % 60, t = phase < 10 ? ease(phase / 10) : phase < 30 ? 1 : phase < 40 ? 1 - ease((phase - 30) / 10) : 0;
      override.set(entry.element, t); pose(entry.element);
    });
    flushAll();
    harness.draw();
    await device.queue.onSubmittedWorkDone();
    if (index < 0) continue;
    work.push(performance.now() - started);
    if (timed && engine.gpuFrameTimeMs > 0) gpu.push(engine.gpuFrameTimeMs);
    const timing = getRenderTaskGpuTimings(engine);
    if (timing.status === "available" && timing.frameIndex !== lastIndex) {
      lastIndex = timing.frameIndex;
      const sums = new Map<string, number>();
      for (const task of timing.tasks) sums.set(task.name, (sums.get(task.name) ?? 0) + task.durationMs);
      for (const [name, value] of sums) { if (!tasks.has(name)) tasks.set(name, []); tasks.get(name)!.push(value); }
      if (sums.has("shadow")) renders++;
    }
  }
  const after = harness.counts();
  if (options.snapping) { for (const entry of bats) override.delete(entry.element); layoutPose(); poseAll(); flushAll(); harness.draw(); }
  const sampled = Math.max(1, Math.max(0, ...[...tasks.values()].map(values => values.length)));
  return { frames, snapping: !!options.snapping, bats: options.snapping ? bats.length : 0, gpu: gpu.length ? statistics(gpu) : null, work: statistics(work),
    // Mean per measured frame: a task absent from a frame (a map not re-rendered) counts as 0 there.
    tasks: Object.fromEntries([...tasks].map(([name, values]) => [name, { frames: values.length, meanPerFrame: values.reduce((sum, value) => sum + value, 0) / sampled, meanWhenRun: statistics(values).mean }])),
    shadowRenders: renders, sampledFrames: sampled, captures: after.captures - before.captures, uploads: after.uploads - before.uploads,
    geometryUpdates: after.geometryUpdates - before.geometryUpdates, mode: after.mode };
}

/** `layout`: the layout's own pose; `low`, `mid`, `high`: every switch and range at that travel. */
async function setPose(name: "layout" | "low" | "mid" | "high") {
  override.clear(); motion.clear();
  if (name === "layout") layoutPose();
  else for (const entry of built!.controls.values()) {
    const element = entry.element as HTMLInputElement;
    if (element.type === "checkbox") { element.checked = name === "high"; if (name === "mid") override.set(element, 0.5); }
    else if (element.type === "range") element.value = name === "low" ? element.min : name === "high" ? element.max : "50";
  }
  poseAll(); flushAll();
  await settle();
  return { pose: name };
}
async function setLayout(name: string) {
  // A new layout replaces every control: the old parts leave the surface first, so no frame draws them over it.
  harness.setMeshes(false);
  override.clear(); motion.clear();
  layout(name);
  await harness.controller.settle();
  await harness.rebuild();
  harness.setMeshes(true);
  applyPaths();
  await settle();
  const last = [...panel.querySelectorAll<HTMLElement>("[data-part]")].at(-1)!.getBoundingClientRect(), box = panel.getBoundingClientRect();
  if (last.bottom > box.bottom || last.right > box.right) throw new Error(`Layout ${name} overflows its panel`);
  return { layout: name, controls: built!.controls.size, bats: [...built!.controls.values()].filter(entry => entry.kind === "bat").length, camera: harness.camera(), counts: harness.counts() };
}
/** Rebuilds the layer scene with `changes` applied to the configuration. */
async function configure(changes: Partial<Config> = {}) {
  config = { ...config, ...structuredClone(changes) };
  await harness.rebuild();
  applyPaths();
  await settle(4);
  return { config: built!.config, counts: harness.counts() };
}
/** Turns paths on or off without a rebuild (the map and contact paths need a generator and the post chain built). */
async function setPaths(changes: Partial<Paths>) {
  paths = { ...paths, ...changes };
  applyPaths(true);
  await settle(4);
  return { ...paths };
}
/** Client rect around the first cell of each kind (for close-up screenshots). */
function closeUp() {
  const cells = kinds.map(kind => document.getElementById(`${kind}-1`)!.parentElement!.getBoundingClientRect());
  const left = Math.min(...cells.map(cell => cell.left)) - 12, top = Math.min(...cells.map(cell => cell.top)) - 12;
  const right = Math.max(...cells.map(cell => cell.right)) + 60, bottom = Math.max(...cells.map(cell => cell.bottom)) + 60;
  return { x: Math.max(0, left), y: Math.max(0, top), width: Math.min(innerWidth, right) - Math.max(0, left), height: Math.min(innerHeight, bottom) - Math.max(0, top) };
}

applyPaths();
await settle();
const api = {
  dpr: harness.dpr,
  tokens: () => ({ ...tokens, batPivot, shadowOffset, towardsLight, defaults, envelopes, camera: harness.camera(),
    specs: Object.fromEntries(kinds.map(kind => [kind, { box: specs[kind].box, margins: specs[kind].margins, parts: specs[kind].parts.map(spec => ({ name: spec.name, motion: spec.motion, ...footprint(spec) })) }])) }),
  settle: async () => { await settle(); },
  snap: async (name: string, frames = 4) => { snaps.set(name, await settle(frames)); return { name, width: shot!.width, height: shot!.height }; },
  drop: (name: string) => snaps.delete(name),
  setLayout, setPose, configure, setPaths, paths: () => ({ ...paths }), config: () => structuredClone(built?.config ?? config),
  compare: (a: string, b: string) => { const { outsideBoxPoints, ...rest } = compare(a, b); return { ...rest, outsideBoxSamples: outsideBoxPoints.slice(0, 10) }; },
  containment, leverShadow, contactLines, thinPlate, labelContrast, gridHits, shadowHits, measure, closeUp,
  controls: () => controls().map(({ casters: list, ...entry }) => ({ ...entry, casters: list.length })),
  counts: () => harness.counts(),
  camera: () => harness.camera(),
  showStatus: (show: boolean) => { status.hidden = !show; },
  diagnostics: () => [...harness.diagnostics],
  browser: () => navigator.userAgent,
};
type ShadowsProbeApi = typeof api;
declare global { interface Window { shadowsProbe: { ready: Promise<ShadowsProbeApi>; error?: string } } }
resolveReady(api);
