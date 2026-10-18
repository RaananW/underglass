/**
 * The Instrument conformance suite (`docs/ui-library/rendering-model.md`, section 4, *The Instrument suite*; part 2D):
 * the cases of `@underglass/ui/conformance/instrument-4.json` and the generator that fills in their expectations from the
 * reference implementation (`instrument.ts`). Version 4 is geometric and sampled, so a case carries several kinds of
 * check, not only expected colours: `exact`, `sampled`, `contained`, `unchanged`, `presence`, `ratio` and `relief`.
 *
 * Every case is rendered at device scales 1 and 2. A sample's `at` is in layer-local CSS px; at scale `s` a renderer
 * decodes the device pixel `floor(at · s)` (layer-local device px), and `expect[s]` is the reference at that pixel's
 * centre. The generator places sampled points itself, from a seed, where 2D.10's placement rule holds at both scales,
 * and refuses any point that breaks the rule, so the committed suite is honest by construction.
 */
import { toHex } from "./contrast.ts";
import { capturedFrom, type CapturePaint } from "./conformance.ts";
import { instrumentSettings, type InstrumentSettings } from "./character.ts";
import {
  boxDistance, mapShadowed, objectContained, partColour, partHit, partTerms, protectedDistance, shadeInstrument, validateInstrumentScene,
  enc, type Box, type InstrumentEmitter, type InstrumentObject, type InstrumentProfile, type InstrumentRecipe, type InstrumentScene, type PartHit, type Vec3,
} from "./instrument.ts";
import { strataSource } from "./source.ts";
import type { TokenGroup } from "./model.ts";
import type { Rgb01 } from "./shade.ts";

/** The tolerances of version 4, per channel in 0–255: exact as version 1; sampled provisional until run against Lite (2D.10). */
export const instrumentTolerance = { exact: 3, sampled: 12 } as const;
/** The device scales every case is rendered at. */
export const instrumentScales = [1, 2] as const;
/** The quadrature's sample count for the suite's expectations (doubling it changes no channel by a level, 2D.5). */
const SAMPLES = 2048;

/** A scene variant: dotted paths into the case's scene (`objects.0.t`, `post.bloom`) and their values. */
export interface InstrumentVariant { name: string; description: string; set: Record<string, unknown> }
/** A sample's expected colour per device scale (`"1"`, `"2"`). */
export type ScaledColour = Record<string, string>;
export interface ExactSample { at: [number, number]; note: string; source?: "face" | "cap" | "glass"; expect?: ScaledColour }
export interface SampledSeed { object: string; part: number; at: [number, number]; note: string; expect?: ScaledColour }
export interface RatioSample { object: string; part: number; at: [number, number]; note: string; shadowed: boolean; expect?: Record<string, { on: string; off: string }> }
export type InstrumentCheck =
  /** Within `tolerance.exact` on every channel: the face with Φ, captured caps, flat glass. */
  | { kind: "exact"; variant?: string; samples: ExactSample[] }
  /** Within `tolerance.sampled` of the reference shading (2D.5, 2D.6), at points the generator placed by 2D.10. */
  | { kind: "sampled"; variant?: string; distinct?: string[]; samples: SampledSeed[] }
  /** Render each `t`: every pixel that changes with the parts on against off has its centre inside the object's bounds. */
  | { kind: "contained"; variant?: string; objects: string[]; t: number[]; reference?: Record<string, { inset: number; t: number; part: number }> }
  /** Pixels in `rects` are identical in every listed variant (`base` is the case's own scene). */
  | { kind: "unchanged"; variants: string[]; rects: Box[]; note: string }
  /** The feature on (the case's scene) against off (`variant`): at least `share` of the object's part pixels change by `levels`, nothing outside its bounds or in protected rects. */
  | { kind: "presence"; feature: string; object: string; variant: string; share: number; levels: number; note: string; measured?: number }
  /** With the map on (the case's scene) against off (`variant`): shadowed points at most `ratio` of their lit value, lit points within `lit` levels. */
  | { kind: "ratio"; variant: string; ratio: number; lit: number; samples: RatioSample[] }
  /** Objects that fail containment: drawn as their Relief primitive (the face's samples) and reported. */
  | { kind: "relief"; objects: { id: string; reason?: string; overshoot?: number }[]; samples: ExactSample[] };
export interface InstrumentCase {
  name: string;
  description: string;
  scene: InstrumentScene;
  capture: CapturePaint[];
  variants: InstrumentVariant[];
  checks: InstrumentCheck[];
}
export interface InstrumentSuite {
  format: "strata-conformance";
  model: "strata-scene/4";
  status: string;
  tolerance: typeof instrumentTolerance;
  scales: number[];
  description: string;
  cases: InstrumentCase[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Forms: the premium character's objects (design language section 6), built from parts.

type Lathe = [number, number, number, number][];
const r2 = Math.SQRT1_2;
const round = (value: number) => Math.round(value * 1000) / 1000;
/** A form: its object, the profiles it names and the paints it adds to the capture. */
interface Form { object: InstrumentObject; profiles: Record<string, InstrumentProfile>; paint?: CapturePaint[] }

/** A knob (Instrument object table): skirt, cap, polished chamfer and pointer, turning through 270°; `k` scales its size. */
function knob(id: string, cx: number, cy: number, k: number, t: number, materials: { cap: string; skirt: string; chamfer: string; pointer: string }): Form {
  const R = 32 * k, rc = round(0.8 * R), H = 16, top = round(rc - 2), cone = Math.tan((7.5 * Math.PI) / 180), zc = round(2.5 + (R - 0.8 - rc) * cone);
  const sc = Math.sin((7.5 * Math.PI) / 180), cc = Math.cos((7.5 * Math.PI) / 180);
  const skirt: Lathe = [[R, 0, 1, 0], [R, 1.7, 1, 0], [R, 1.7, r2, r2], [round(R - 0.8), 2.5, r2, r2], [round(R - 0.8), 2.5, sc, cc], [rc, zc, sc, cc], [rc, zc, 0, 1], [0, zc, 0, 1]];
  // The cap: a wall, a 2 px chamfer and a spun top crowned 1.2 px (z = H − 1.2 · (r / top)²).
  const crown: Lathe = [1, 0.75, 0.5, 0.25, 0].map(f => { const r = round(top * f), slope = (2 * 1.2 * r) / (top * top), n = Math.hypot(slope, 1); return [r, round(H - 1.2 * f * f), round(slope / n), round(1 / n)]; });
  const cap: Lathe = [[rc, 0, 1, 0], [rc, H - 3.2, 1, 0], [rc, H - 3.2, r2, r2], [top, H - 1.2, r2, r2], ...crown];
  const chamfer: Lathe = [[round(rc + 0.02), H - 3.2, r2, r2], [top, round(H - 1.2 + 0.02), r2, r2]];
  // The pointer: from 0.28 to 0.86 of the top's radius, along the crown, turning about the knob's axis.
  const from = 0.28 * top, to = 0.86 * top, middle = round((from + to) / 2), zp = round(2.5 + H - 1.2 * (middle / top) ** 2 - 0.3);
  const turn = { from: { turn: -135 }, to: { turn: 135 } }, pivot: Vec3 = [0, middle, 0];
  const side = round(2 * R + 76);
  const bounds: Box = [round(cx - side / 2), round(cy - side / 2), side, side];
  return {
    profiles: { [`${id}-skirt`]: { type: "lathe", points: skirt, segments: 64 }, [`${id}-cap`]: { type: "lathe", points: cap, segments: 64 },
      [`${id}-chamfer`]: { type: "lathe", points: chamfer, segments: 64 },
      [`${id}-pointer`]: { type: "prism", width: round(2.2 * k), length: round(to - from), radius: 0.4, height: 0.6 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: side / 2 }, t, parts: [
      { kind: "skirt", profile: `${id}-skirt`, at: [cx, cy, 0], material: materials.skirt, pose: turn },
      { kind: "cap", profile: `${id}-cap`, at: [cx, cy, 2.5], material: materials.cap, pose: turn },
      { kind: "chamfer", profile: `${id}-chamfer`, at: [cx, cy, 2.5], material: materials.chamfer, pose: turn, caster: null },
      { kind: "pointer", profile: `${id}-pointer`, at: [cx, round(cy - middle), zp], material: materials.pointer,
        pose: { from: { turn: -135, pivot }, to: { turn: 135, pivot } }, caster: null },
    ], relief: { face: "knob", rect: bounds, height: 0, material: "face" } },
  };
}
/** A fader: a printed slot, a carriage 30 × 42 × 12 sliding 180 px, and its index line. `t` 0 is the bottom stop. */
function fader(id: string, cx: number, cy: number, t: number, cap: string): Form {
  const travel = 180, length = travel + 42 + 14, bounds: Box = [cx - 23, round(cy - length / 2), 46, length];
  const slide = { from: { slide: [0, travel / 2] as [number, number] }, to: { slide: [0, -travel / 2] as [number, number] } };
  return {
    profiles: { [`${id}-slot`]: { type: "prism", width: 5, length: travel + 8, radius: 2.5, height: 0.4 },
      [`${id}-carriage`]: { type: "prism", width: 30, length: 42, radius: 3, height: 12, taper: 0.6, chamfer: 2 },
      [`${id}-grip`]: { type: "prism", width: 22, length: 1.6, radius: 0.4, height: 0.6 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 4 }, t, parts: [
      { kind: "slot", profile: `${id}-slot`, at: [cx, cy, 0], material: "ink", caster: null },
      { kind: "carriage", profile: `${id}-carriage`, at: [cx, cy, 0], material: cap, pose: slide },
      { kind: "grip", profile: `${id}-grip`, at: [cx, cy, 12], material: "ink", pose: slide, caster: null },
    ], relief: { face: "raised", rect: bounds, radius: 4, height: 0, material: "face" } },
  };
}
/** The `slide` switch: a printed slot and a block 24 × 20 × 6 sliding 28 px in a 64 × 28 box. */
function slide(id: string, cx: number, cy: number, t: number, block: string): Form {
  const bounds: Box = [cx - 32, cy - 14, 64, 28];
  return {
    profiles: { [`${id}-slot`]: { type: "prism", width: 56, length: 8, radius: 4, height: 0.4 },
      [`${id}-block`]: { type: "prism", width: 24, length: 20, radius: 3, height: 6, taper: 0.4, chamfer: 2 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 6 }, t, parts: [
      { kind: "slot", profile: `${id}-slot`, at: [cx, cy, 0], material: "ink", caster: null },
      { kind: "carriage", profile: `${id}-block`, at: [cx, cy, 0], material: block, pose: { from: { slide: [-14, 0] }, to: { slide: [14, 0] } } },
    ], relief: { face: "raised", rect: bounds, radius: 6, height: 0, material: "face" } },
  };
}
/** The `rocker` switch, laid along x: a polished bezel plate and a two-facet paddle tilting ±17.7° about y. */
function rocker(id: string, cx: number, cy: number, t: number, paddle: string): Form {
  const bounds: Box = [cx - 31, cy - 19, 62, 38];
  return {
    profiles: { [`${id}-bezel`]: { type: "prism", width: 58, length: 34, radius: 5, height: 2, chamfer: 0.6 },
      [`${id}-paddle`]: { type: "extrude", outline: [[-25, 0], [25, 0], [25, 3], [0, 5], [-25, 3]], width: 28 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 6 }, t, parts: [
      { kind: "bezel", profile: `${id}-bezel`, at: [cx, cy, 0], material: "polished" },
      { kind: "paddle", profile: `${id}-paddle`, at: [cx, cy, 8], material: paddle, pose: { from: { tilt: -17.7, axis: 90 }, to: { tilt: 17.7, axis: 90 } } },
    ], relief: { face: "raised", rect: bounds, radius: 6, height: 0, material: "face" } },
  };
}
/** The `bat` switch: a nut, a bushing, and a 40 px lever with its ball thrown ±40° about x on a pivot 5 px up. */
function bat(id: string, cx: number, cy: number, t: number): Form {
  const bounds: Box = [cx - 24, cy - 46, 48, 92], ball = 5.6, rise = 40 - ball;
  const sphere: Lathe = Array.from({ length: 13 }, (_, i) => { const a = -Math.PI / 2 + (i / 12) * Math.PI; return [round(Math.max(0, ball * Math.cos(a))), round(ball + ball * Math.sin(a)), round(Math.cos(a)), round(Math.sin(a))]; });
  const throw40 = (pivot: Vec3) => ({ from: { tilt: -40, pivot }, to: { tilt: 40, pivot } });
  return {
    profiles: { [`${id}-nut`]: { type: "lathe", points: [[12, 0, 1, 0], [12, 2.4, 1, 0], [12, 2.4, r2, r2], [11.4, 3, r2, r2], [11.4, 3, 0, 1], [0, 3, 0, 1]], segments: 6 },
      [`${id}-bushing`]: { type: "lathe", points: [[7, 0, 1, 0], [7, 7, 1, 0], [7, 7, 0, 1], [0, 7, 0, 1]], segments: 32 },
      [`${id}-lever`]: { type: "lathe", points: [[3.4, 0, 1, 0.0175], [2.7, rise + 1, 1, 0.0175]], segments: 24 },
      [`${id}-ball`]: { type: "lathe", points: sphere, segments: 32 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 8 }, t, parts: [
      { kind: "nut", profile: `${id}-nut`, at: [cx, cy, 0], material: "polished" },
      { kind: "bushing", profile: `${id}-bushing`, at: [cx, cy, 0], material: "polished" },
      { kind: "lever", profile: `${id}-lever`, at: [cx, cy, 5], material: "lever", pose: throw40([0, 0, 0]) },
      { kind: "ball", profile: `${id}-ball`, at: [cx, cy, 5 + rise], material: "lever", pose: throw40([0, 0, -rise]) },
    ], relief: { face: "raised", rect: bounds, radius: 8, height: 0, material: "face" } },
  };
}
/** The `wall` switch: a plate 3 px high and a paddle 30 × 54 × 7 tilting ±9° about x. */
function wall(id: string, cx: number, cy: number, t: number, plate: string, paddle: string): Form {
  const bounds: Box = [cx - 33, cy - 46, 66, 92];
  return {
    profiles: { [`${id}-plate`]: { type: "prism", width: 60, length: 86, radius: 6, height: 3, chamfer: 0.6 },
      [`${id}-paddle`]: { type: "prism", width: 30, length: 54, radius: 4, height: 7, taper: 0.6, chamfer: 2 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 6 }, t, parts: [
      { kind: "plate", profile: `${id}-plate`, at: [cx, cy, 0], material: plate },
      { kind: "paddle", profile: `${id}-paddle`, at: [cx, cy, 3], material: paddle, pose: { from: { tilt: -9 }, to: { tilt: 9 } } },
    ], relief: { face: "raised", rect: bounds, radius: 6, height: 0, material: "face" } },
  };
}
/** A push button: a polished bezel, a lit ring and a captured cap Ø40 travelling 4 px; `t` along that travel. */
function pushButton(id: string, cx: number, cy: number, t: number, pressed: boolean, ring: string): Form {
  const bounds: Box = [cx - 32, cy - 32, 64, 64];
  return {
    profiles: { [`${id}-bezel`]: { type: "lathe", points: [[27, 0, 1, 0], [27, 2.4, 1, 0], [27, 2.4, r2, r2], [26.2, 3.2, r2, r2], [26.2, 3.2, 0, 1], [22.6, 3.2, 0, 1], [22.6, 3.2, -1, 0], [22.6, 0, -1, 0]], segments: 64 },
      [`${id}-ring`]: { type: "lathe", points: [[22.6, 1, 0, 1], [20.6, 1, 0, 1]], segments: 64 },
      [`${id}-cap`]: { type: "prism", width: 40, length: 40, radius: 20, height: 6, taper: 0.6, chamfer: 2 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 32 }, t, parts: [
      { kind: "bezel", profile: `${id}-bezel`, at: [cx, cy, 0], material: "polished" },
      { kind: "lens", profile: `${id}-ring`, at: [cx, cy, 0], material: ring, caster: null },
      { kind: "cap", profile: `${id}-cap`, at: [cx, cy, 0], material: "keycap", captured: true, pose: { from: {}, to: { travel: -4 } }, state: { pressed } },
    ], relief: { face: "raised", rect: bounds, radius: 32, height: 0, material: "face" } },
  };
}
/** A lamp (or an LED): a polished bezel and a lens that is its emitter's part; `d` the lens diameter. */
function lamp(id: string, cx: number, cy: number, d: number, lens: string, emitter: number): Form {
  const r = d / 2, side = d + 20, bounds: Box = [cx - side / 2, cy - side / 2, side, side];
  const dome: Lathe = [0, 1, 2, 3, 4, 5, 6].map(i => { const a = (i / 6) * (Math.PI / 2); return [round(r * Math.cos(a)), round(1 + (d / 7) * Math.sin(a)), round(Math.cos(a) / r), round(Math.sin(a) / (d / 7))]; });
  return {
    profiles: { [`${id}-bezel`]: { type: "lathe", points: [[r + 4, 0, 1, 0], [r + 4, 2, 1, 0], [r + 4, 2, 0, 1], [r, 2, 0, 1], [r, 2, -1, 0], [r, 0, -1, 0]], segments: 48 },
      [`${id}-lens`]: { type: "lathe", points: [[r, 0, 1, 0], ...dome], segments: 48 } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: side / 2 }, t: 0, parts: [
      { kind: "bezel", profile: `${id}-bezel`, at: [cx, cy, 0], material: "polished" },
      { kind: "lens", profile: `${id}-lens`, at: [cx, cy, 0], material: lens, emitter, caster: null },
    ], relief: { face: "knob", rect: bounds, height: 0, material: "face" } },
  };
}
/** A matte plate standing on the face: a patch that emitter light on parts and the shadow map land on. */
function plate(id: string, x: number, y: number, width: number, length: number, height: number, material: string): Form {
  const bounds: Box = [x - 4, y - 4, width + 8, length + 8];
  return {
    profiles: { [`${id}-plate`]: { type: "prism", width, length, radius: 2, height, chamfer: Math.min(0.6, height / 3) } },
    object: { id, rect: bounds, bounds: { rect: bounds, radius: 4 }, t: 0, parts: [
      { kind: "plate", profile: `${id}-plate`, at: [x + width / 2, y + length / 2, 0], material },
    ], relief: { face: "raised", rect: bounds, radius: 4, height: 0, material: "face" } },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Cases.

const colourOf = (source: TokenGroup, role: string, theme = "light") =>
  (source.colour as Record<string, { $extensions?: Record<string, { themes?: Record<string, string> }> }>)[role]!.$extensions!["dev.underglass.strata"]!.themes![theme]!;

/** The Instrument conformance cases, without expectations. */
export function instrumentCases(source: TokenGroup = strataSource): InstrumentCase[] {
  const premium = (theme = "light") => instrumentSettings(source, { theme, depth: 0.5, character: "premium" });
  const colour = (role: string, theme = "light") => colourOf(source, role, theme);
  /** The materials a case names: the premium presets it uses, the face, the ink of printed parts and captured caps. */
  const materials = (settings: InstrumentSettings, names: string[], extra: Record<string, InstrumentRecipe> = {}) => ({
    face: { base: { roughness: 0.45 } }, ...Object.fromEntries(names.map(name => [name, structuredClone(settings.materials[name]!)])), ...extra,
  } as Record<string, InstrumentRecipe>);
  /** Brushed metal without its brush and grain: the base layers the reference shades, for sampled points. */
  const plain = (recipe: InstrumentRecipe): InstrumentRecipe => { const copy = structuredClone(recipe); delete copy.brush; delete copy.grain; return copy; };
  const ink = (theme = "light"): InstrumentRecipe => ({ base: { colour: theme === "light" ? "#2b2d31" : "#d4d7dc", roughness: 0.55 } });
  /** One layer on a stage: the layer stands at `origin` on a 1920 × 1080 stage, so its vanishing point is the stage centre less `origin`. */
  const layer = (width: number, height: number, forms: Form[], options: { theme?: string; light?: { azimuth: number; elevation: number }; origin?: [number, number];
    materials: Record<string, InstrumentRecipe>; emitters?: InstrumentEmitter[]; protected?: Box[]; feather?: number; post?: InstrumentScene["post"] }): InstrumentScene => {
    const settings = premium(options.theme), [ox, oy] = options.origin ?? [200, 150];
    return {
      format: "strata-scene", version: 4, kind: "instrument",
      camera: { distance: 2400, vanish: [960 - ox, 540 - oy] },
      environment: { ...settings.environment, page: { enabled: false } },
      extent: { width, height }, outset: { top: 24, right: 24, bottom: 24, left: 24 },
      backdrop: settings.backdrop, light: { ...settings.light, ...(options.light ?? {}) }, bevel: settings.bevel, shadow: settings.shadow,
      interior: settings.interior, state: settings.state, focus: settings.focus,
      materials: options.materials,
      primitives: [{ face: "raised", rect: [0, 0, width, height], radius: 14, height: 6, material: "face" }],
      profiles: Object.assign({}, ...forms.map(form => form.profiles)),
      objects: forms.map(form => form.object),
      ...(options.emitters ? { emitters: options.emitters } : {}),
      ...(options.protected ? { protected: options.protected, feather: options.feather ?? 4 } : {}),
      ...(options.post ? { post: options.post } : {}),
    };
  };
  const panel = (width: number, height: number, theme = "light"): CapturePaint => ({ rect: [0, 0, width, height], radius: 14, colour: colour("panel", theme) });
  const text = (rect: Box, theme = "light"): CapturePaint => ({ rect, colour: colour("text", theme) });
  const variantT = (index: number, t: number): InstrumentVariant => ({ name: `${index}-t${t}`, description: `objects[${index}] at t = ${t}`, set: { [`objects.${index}.t`]: t } });
  const settings = premium(), dark = premium("dark");
  const glow = settings.materials.emissive!, glowLit = (strength: number): InstrumentRecipe => ({ ...structuredClone(glow), emissive: { ...glow.emissive, strength } });
  const glowColour: Vec3 = [1, 146 / 255, 40 / 255];
  const cases: InstrumentCase[] = [];

  // 1. Knobs: a large continuous knob at three turns, and a detented one on a detent.
  {
    const big = knob("knob", 130, 130, 1.5, 0.5, { cap: "metal", skirt: "polished", chamfer: "polished", pointer: "ink" });
    const detent = knob("detent", 375, 130, 1.2, 0.3, { cap: "metal", skirt: "polished", chamfer: "polished", pointer: "ink" });
    const scene = layer(540, 260, [big, detent], { materials: materials(settings, ["metal", "polished"], { ink: ink() }) });
    cases.push({
      name: "knob",
      description: "A large knob (1.5 × the premium knob) turning through 270°, at t = 0, 0.5 and 1, and a detented knob (1.2 ×) on detent 3 of 11: containment over the whole travel, the cap and the polished skirt cone at sampled points (the cap without its brush), brush and grain by presence, and the parts' shadows on the dial face. The 2.2 px pointer is under the 3 px placement rule, so containment checks it.",
      scene, capture: [panel(540, 260)],
      variants: [variantT(0, 0), variantT(0, 1), { name: "unbrushed", description: "The cap metal without brush and grain", set: { "materials.metal": plain(settings.materials.metal!) } },
        { name: "no-grain", description: "The cap metal's grain off", set: { "materials.metal.grain.strength": 0 } }],
      checks: [
        { kind: "contained", objects: ["knob", "detent"], t: [0, 0.3, 0.5, 1] },
        { kind: "sampled", variant: "unbrushed", samples: [
          { object: "knob", part: 1, at: [130.5, 130.5], note: "the cap's crowned top at its centre" },
          { object: "knob", part: 1, at: [120.5, 118.5], note: "the cap's top towards the light" },
          { object: "knob", part: 0, at: [130.5, 175.5], note: "the polished skirt cone, below the cap" },
          { object: "knob", part: 0, at: [172.5, 138.5], note: "the polished skirt cone, right of the cap (the side facing the vanishing point)" },
          { object: "detent", part: 1, at: [375.5, 130.5], note: "the detented knob's cap" } ] },
        { kind: "presence", feature: "brush", object: "knob", variant: "unbrushed", share: 0.05, levels: 2, note: "Anisotropy with its grain (I0.4: 10k of 43k px changed, by up to 128 levels); provisional" },
        { kind: "presence", feature: "grain", object: "knob", variant: "no-grain", share: 0.05, levels: 2, note: "The hairline grain map (I0.4: 9k of 43k px); provisional" },
        { kind: "exact", samples: [
          { at: [130.5, 196.5], note: "the dial face below the skirt, inside the knob's bounds" },
          { at: [175.5, 172.5], note: "the dial face in the cap and skirt's shadow, towards the lower right" },
          { at: [255.5, 30.5], note: "the face between the knobs, outside every bounds" },
          { at: [8.5, 130.5], note: "the panel's left bevel" },
          { at: [270.5, 268.5], note: "the outset below the panel: the panel's shadow on the backdrop" } ] },
        { kind: "exact", variant: "0-t0", samples: [{ at: [175.5, 172.5], note: "the same shadow at t = 0: a lathe's footprint does not turn" }] },
      ],
    });
  }
  // 2. A fader at both stops and mid-travel.
  {
    const form = fader("fader", 60, 140, 0.5, "metal");
    const scene = layer(240, 280, [form], { materials: materials(settings, ["metal"], { ink: ink() }) });
    cases.push({
      name: "fader",
      description: "A fader's carriage (30 × 42 × 12, taper 0.6, chamfer 2) on its printed slot, sliding 180 px: at the bottom stop, mid-travel and the top stop. The carriage's top is sampled without its brush; the face it leaves at one stop is exact at the other.",
      scene, capture: [panel(240, 280), { rect: [28, 50, 8, 2], colour: colour("text") }, { rect: [28, 228, 8, 2], colour: colour("text") }],
      variants: [variantT(0, 0), variantT(0, 1), { name: "unbrushed", description: "The carriage metal without brush and grain", set: { "materials.metal": plain(settings.materials.metal!) } }],
      checks: [
        { kind: "contained", objects: ["fader"], t: [0, 0.5, 1] },
        { kind: "sampled", variant: "unbrushed", samples: [
          { object: "fader", part: 1, at: [55.5, 131.5], note: "the carriage's top, above its index line" },
          { object: "fader", part: 1, at: [66.5, 150.5], note: "the carriage's top, below its index line" } ] },
        { kind: "exact", variant: "0-t1", samples: [{ at: [48.5, 140.5], note: "beside the slot where the carriage stands at mid-travel: the face again at the top stop" }] },
        { kind: "exact", variant: "0-t0", samples: [{ at: [48.5, 40.5], note: "beside the slot near the top: the face at the bottom stop" }] },
        { kind: "exact", samples: [
          { at: [80.5, 120.5], note: "the face right of the carriage at mid-travel, in its shadow" },
          { at: [120.5, 260.5], note: "the face, outside every bounds" } ] },
      ],
    });
  }
  // 3. The switch forms at both stops and mid-travel, with a bat whose ball binds at mid-travel.
  {
    const forms = [slide("slide", 60, 50, 0.5, "metal"), rocker("rocker", 60, 130, 0.5, "metal"), bat("bat", 170, 90, 0.5), wall("wall", 270, 90, 0.5, "metal", "metal")];
    // The bat stands 600 px right of the vanishing point, so its ball (tallest at mid-travel) drifts most there.
    const scene = layer(330, 180, forms, { origin: [960 - (170 - 600), 540 - 90], materials: materials(settings, ["metal", "polished"], { ink: ink(), lever: { base: { colour: "#fafafb", metallic: 1, roughness: 0.06 } } }) });
    cases.push({
      name: "switches",
      description: "The slide, rocker, bat and wall switches at t = 0, 0.5 and 1. The layer stands so that the bat lies 600 px right of the vanishing point: its ball is tallest at mid-travel, where it comes closest to its box (the reference's closest approach is at t = 0.5), though both stops are farther in. Sampled: the slide's block, the rocker's paddle and the wall's paddle and plate, without brush. A metal top facing the viewer reflects the studio's strip and front, and some sampled points saturate (#ffffff): the clamp of 2D.5 is part of the model.",
      scene, capture: [panel(330, 180)],
      variants: [{ name: "t0", description: "Every switch at t = 0", set: Object.fromEntries(forms.map((_, i) => [`objects.${i}.t`, 0])) },
        { name: "t1", description: "Every switch at t = 1", set: Object.fromEntries(forms.map((_, i) => [`objects.${i}.t`, 1])) },
        { name: "unbrushed", description: "The metal without brush and grain", set: { "materials.metal": plain(settings.materials.metal!) } }],
      checks: [
        { kind: "contained", objects: ["slide", "rocker", "bat", "wall"], t: [0, 0.5, 1] },
        { kind: "sampled", variant: "unbrushed", samples: [
          { object: "slide", part: 1, at: [60.5, 50.5], note: "the slide's block, mid-travel" },
          { object: "rocker", part: 1, at: [48.5, 130.5], note: "the rocker paddle's raised facet" },
          { object: "wall", part: 1, at: [270.5, 80.5], note: "the wall paddle's top" },
          { object: "wall", part: 0, at: [270.5, 124.5], note: "the wall plate below the paddle" } ] },
        { kind: "exact", samples: [
          { at: [115.5, 20.5], note: "the face between the switches, outside every bounds" },
          { at: [115.5, 160.5], note: "the face below, outside every bounds" } ] },
      ],
    });
  }
  // 4. Push buttons, held and latched, with captured labels.
  {
    const held = pushButton("held", 60, 60, 1, true, "lit"), latched = pushButton("latched", 160, 60, 0.45, false, "lit");
    const scene = layer(220, 120, [held, latched], { materials: materials(settings, ["polished"], { lit: glowLit(1), keycap: { base: { roughness: 1 } } }), protected: [[48, 55, 24, 10], [148, 55, 24, 10]] });
    const label = (x: number): CapturePaint[] => [{ rect: [x - 17, 43, 34, 34], radius: 17, colour: colour("secondary") }, text([x - 12, 55, 24, 10])];
    cases.push({
      name: "push-buttons",
      description: "Two push buttons with captured labels: one held (t = 1, 4 px in, pressed) and one latched (t = 0.45, 1.8 px in). A captured cap is the capture texel times its interior factor (−pressSink when pressed), drawn after the post chain; the lit rings feed the bloom, which never reaches the caps.",
      scene, capture: [panel(220, 120), ...label(60), ...label(160)],
      variants: [{ name: "post-off", description: "Every post stage off", set: { post: { smaa: false, bloom: false, taa: false, contact: false, ssgi: false } } },
        { name: "post-all", description: "Every post stage on", set: { post: { smaa: true, bloom: true, taa: true, contact: true, ssgi: true } } }],
      checks: [
        { kind: "contained", objects: ["held", "latched"], t: [0, 0.5, 1] },
        { kind: "exact", samples: [
          { at: [54.5, 59.5], note: "the held cap's label: text × (1 − pressSink)" },
          { at: [60.5, 72.5], note: "the held cap below its label" },
          { at: [154.5, 59.5], note: "the latched cap's label, not pressed: text × (1 + gloss)" },
          { at: [160.5, 48.5], note: "the latched cap above its label" },
          { at: [110.5, 108.5], note: "the face between the buttons, outside every bounds" } ] },
        { kind: "unchanged", variants: ["base", "post-off", "post-all"], rects: [[50, 56, 20, 8], [150, 56, 20, 8]], note: "Captured caps and protected text are unchanged by every post stage" },
      ],
    });
  }
  // 5. A lamp beside a label, on and off: the face pool, the outset past the panel's edge and the guard.
  {
    const d = 28, emitter: InstrumentEmitter = { position: [200, 50, round(0.7 * d)], colour: glowColour, strength: 3200, radius: 6 * d };
    const scene = layer(230, 110, [lamp("lamp", 200, 50, d, "lens", 0), plate("patch", 110, 66, 48, 28, 3, "paint")],
      { materials: materials(settings, ["polished"], { lens: glowLit(1), paint: { base: { colour: "#a9adb4", roughness: 0.6 } } }), emitters: [emitter], protected: [[136, 42, 36, 16]] });
    cases.push({
      name: "lamp",
      description: "A lit lamp (lens 28, strength 3,200, R 168) near the panel's right edge, beside a label in a protected rect, and a matte plate it lights. The face pool brightens the face around it and the backdrop in the outset past the panel's edge; inside the protected rect the face's whole change stays within interior.max (the guard). Off: the emitter's strength 0 and the lens unlit (0.12).",
      scene, capture: [panel(230, 110), text([140, 46, 28, 8])],
      variants: [{ name: "off", description: "The lamp off", set: { "emitters.0.strength": 0, "materials.lens.emissive.strength": 0.12 } },
        { name: "emitters-off", description: "Emitters off, the lens still lit", set: { "emitters.0.strength": 0 } }],
      checks: [
        { kind: "exact", samples: [
          { at: [200.5, 87.5], note: "the face below the lamp: its pool" },
          { at: [236.5, 50.5], note: "the outset past the panel's right edge, lit by the pool" },
          { at: [143.5, 49.5], note: "the label in its protected rect: the guard limits the change to interior.max" },
          { at: [170.5, 44.5], note: "the panel inside the protected rect, by the label: the same factor" },
          { at: [40.5, 50.5], note: "the face far from the lamp" } ] },
        { kind: "exact", variant: "off", samples: [
          { at: [200.5, 87.5], note: "below the lamp, off" }, { at: [236.5, 50.5], note: "the outset, off: the backdrop" },
          { at: [143.5, 49.5], note: "the label, off" } ] },
        { kind: "presence", feature: "emitter light on parts", object: "patch", variant: "emitters-off", share: 0, levels: 4, note: "The lamp lights the plate beside it" },
        { kind: "sampled", samples: [{ object: "patch", part: 0, at: [134.5, 80.5], note: "the matte plate, lit by the lamp" }] },
      ],
    });
  }
  // 6. An LED and the pointer light over text.
  {
    const led: InstrumentEmitter = { position: [40, 40, 8], colour: glowColour, strength: 520, radius: 60 };
    const pointer: InstrumentEmitter = { position: [140, 46, 120], colour: [1, 0.95, 0.88], strength: 16000, face: 0.3, radius: 360, reach: "layer" };
    const scene = layer(240, 100, [lamp("led", 40, 40, 10, "lens", 0), plate("patch", 170, 30, 44, 36, 3, "paint")],
      { materials: materials(settings, ["polished"], { lens: glowLit(1), paint: { base: { colour: "#7d828a", roughness: 0.7 } } }), emitters: [led, pointer], protected: [[110, 38, 60, 16]], feather: 10 });
    cases.push({
      name: "led-pointer",
      description: "An LED (lens 10, strength 520, R 60) and the pointer light (16,000 on parts, 0.3 of it on the face, R 360, 120 px up, reach layer) over a label in a protected rect with a 10 px feather. The pointer light lights the layer's own content only, so the outset beyond the panel stays the backdrop; the LED's light reaches the outset.",
      scene, capture: [panel(240, 100), text([114, 42, 52, 8])],
      variants: [{ name: "pointer-off", description: "The pointer light off", set: { "emitters.1.strength": 0 } }],
      checks: [
        { kind: "exact", samples: [
          { at: [118.5, 45.5], note: "the label under the pointer light: guarded" },
          { at: [140.5, 80.5], note: "the face under the pointer light, past the feather" },
          { at: [140.5, 104.5], note: "the outset below the panel: no pointer light (reach layer)" },
          { at: [-4.5, 40.5], note: "the outset left of the LED: its pool reaches it" },
          { at: [40.5, 62.5], note: "the face below the LED" } ] },
        { kind: "exact", variant: "pointer-off", samples: [{ at: [118.5, 45.5], note: "the label without the pointer light" }, { at: [140.5, 80.5], note: "the face without it" }] },
        { kind: "presence", feature: "emitter light on parts", object: "patch", variant: "pointer-off", share: 0, levels: 4, note: "The pointer light on a plate: the highlight it carries" },
        { kind: "sampled", samples: [{ object: "patch", part: 0, at: [192.5, 48.5], note: "the plate under the pointer light" }] },
      ],
    });
  }
  // 7. Glass: a display window over text, and a lens on a polished stand over a printed target.
  {
    const window: Form = {
      profiles: { "display-window": { type: "prism", width: 200, length: 44, radius: 2, height: 2.4, chamfer: 2.2 } },
      object: { id: "display", rect: [16, 16, 208, 52], bounds: { rect: [16, 16, 208, 52], radius: 8 }, t: 0, parts: [
        { kind: "window", profile: "display-window", at: [120, 42, 0], material: "glass", glass: "window", finish: { band: 0.3, horizon: 0.25 }, caster: null },
      ], relief: { face: "well", rect: [16, 16, 208, 52], radius: 8, height: 1, material: "face" } },
    };
    const ellipse: Lathe = Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * (Math.PI / 2), n = Math.hypot(Math.cos(a) / 23, Math.sin(a) / 20);
      return [round(23 * Math.cos(a)), round(2 + 20 * Math.sin(a)), round(Math.cos(a) / 23 / n), round(Math.sin(a) / 20 / n)]; });
    const lens: Form = {
      profiles: { "lens-stand": { type: "lathe", points: [[32, 0, 1, 0], [32, 2.5, 1, 0], [32, 2.5, 0, 1], [0, 2.5, 0, 1]], segments: 64 },
        "lens-cap": { type: "lathe", points: [[23, 0, 1, 0], ...ellipse], segments: 96 } },
      object: { id: "lens", rect: [60, 82, 120, 120], bounds: { rect: [60, 82, 120, 120], radius: 60 }, t: 0, parts: [
        { kind: "skirt", profile: "lens-stand", at: [120, 142, 0], material: "polished" },
        { kind: "lens", profile: "lens-cap", at: [120, 142, 2.5], material: "glass", glass: "lens", stand: { radius: 32, colour: "#fafafb" }, caster: null },
      ], relief: { face: "knob", rect: [60, 82, 120, 120], height: 0, material: "face" } },
    };
    const runs: Box[] = [[36, 34, 70, 12], [36, 50, 44, 10]];
    const scene = layer(240, 220, [window, lens], { materials: materials(settings, ["glass", "polished"]), protected: runs.map(([x, y, w, h]) => [x - 2, y - 2, w + 4, h + 4] as Box) });
    // A display's own colours (I0.4's light display: light text on a dark field), so the finish band does not saturate.
    const field = "#122618", lit = "#d6e4ce";
    const hub: CapturePaint[] = [{ rect: [112.25, 134.25, 15.5, 15.5], radius: 7.75, colour: colour("text") }, { rect: [113.75, 135.75, 12.5, 12.5], radius: 6.25, colour: colour("panel") },
      { rect: [86, 140, 16, 4], colour: colour("accent") }, { rect: [138, 140, 16, 4], colour: colour("accent") }];
    cases.push({
      name: "glass",
      description: "A display window (2.4 high, a 2.2 px bevel, finish band 0.3 and horizon 0.25) over text in protected rects, and a plano-convex glass lens (r 23, a 2 px wall, an elliptical dome to 22) on a polished stand (r 32) over a printed hub ring. Text under the window and its flat region outside the finish zone are the capture texel; the lens (magnification, the dark rim of total internal reflection, the stand's reflection) are sampled; the finish band, dispersion and the lens's reflection by presence.",
      scene, capture: [panel(240, 220), { rect: [16, 16, 208, 52], radius: 8, colour: field }, ...runs.map(rect => ({ rect, colour: lit })), ...hub],
      variants: [{ name: "no-dispersion", description: "Glass without dispersion", set: { "materials.glass.dispersion.strength": 0 } },
        { name: "no-reflection", description: "Glass without its reflection", set: { "materials.glass.glass.reflection": 0 } },
        { name: "no-band", description: "The window without its finish band and horizon", set: { "objects.0.parts.0.finish": { band: 0, horizon: 0 } } }],
      checks: [
        { kind: "exact", samples: [
          { at: [40.5, 39.5], note: "text under the window: the capture texel" },
          { at: [70.5, 55.5], note: "the second text run" },
          { at: [160.5, 56.5], note: "the window's flat region outside its finish zone: the capture texel" },
          { at: [200.5, 52.5], note: "the flat region near its right end" },
          { at: [20.5, 212.5], note: "the face, outside every bounds" } ] },
        { kind: "sampled", samples: [
          { object: "lens", part: 1, at: [120.5, 142.5], note: "the lens's centre: the hub magnified" },
          { object: "lens", part: 1, at: [106.5, 128.5], note: "the dome towards the light" },
          { object: "lens", part: 1, at: [139.5, 152.5], note: "the dome away from the light" },
          { object: "lens", part: 1, at: [99.5, 142.5], note: "the dome's left flank" },
          { object: "lens", part: 0, at: [120.5, 170.5], note: "the polished stand below the lens" } ] },
        { kind: "presence", feature: "a window's finish band", object: "display", variant: "no-band", share: 0, levels: 4, note: "The band and horizon in the window's top zone: on a dark display they change by far more than 4 levels per px, so they are checked by presence, not sampled" },
        { kind: "presence", feature: "dispersion", object: "lens", variant: "no-dispersion", share: 0, levels: 2, note: "A prism fringe where the lens refracts an edge" },
        { kind: "presence", feature: "a lens's reflection", object: "lens", variant: "no-reflection", share: 0, levels: 4, note: "The Fresnel reflection of the studio, the stand and the face" },
        { kind: "unchanged", variants: ["base", "no-dispersion", "no-reflection"], rects: runs, note: "Text under the window is the capture in every variant" },
      ],
    });
  }
  // 8. The presets at sampled points.
  {
    const names = ["metal", "polished", "lacquer", "gold", "gunmetal", "chrome"];
    const cap = (index: number): Form => {
      const cx = 40 + index * 72, crown: Lathe = [1, 0.75, 0.5, 0.25, 0].map(f => { const r = round(22 * f), slope = (2 * 3 * r) / (22 * 22), n = Math.hypot(slope, 1); return [r, round(10 - 3 * f * f), round(slope / n), round(1 / n)]; });
      return { profiles: { [`preset-${index}`]: { type: "lathe", points: [[26, 0, 1, 0], [26, 5, 1, 0], [26, 5, r2, r2], [22, 7, r2, r2], ...crown], segments: 64 } },
        object: { id: names[index]!, rect: [cx - 34, 6, 68, 68], bounds: { rect: [cx - 34, 6, 68, 68], radius: 34 }, t: 0,
          parts: [{ kind: "cap", profile: `preset-${index}`, at: [cx, 40, 0], material: names[index]! }], relief: { face: "knob", rect: [cx - 34, 6, 68, 68], height: 0, material: "face" } } };
    };
    const recipes = materials(settings, names);
    const plainRecipes = Object.fromEntries(Object.entries(recipes).map(([name, recipe]) => [name, name === "face" ? recipe : plain(recipe)]));
    const scene = layer(440, 80, names.map((_, i) => cap(i)), { materials: plainRecipes });
    cases.push({
      name: "presets",
      description: "The metal, polished, lacquer, gold, gunmetal and chrome presets on crowned caps, at sampled points placed where each differs from every other compared preset by at least 24 levels in some channel. Metal and gunmetal are sampled without their brush and grain, which the brushed variant adds back for a presence check. Chrome and polished share a recipe (roughness 0.04, colours within 2 levels), so neither is compared with the other.",
      scene, capture: [panel(440, 80)],
      variants: [{ name: "brushed", description: "Metal and gunmetal with brush 0.9 and grain 0.15", set: { "materials.metal": recipes.metal, "materials.gunmetal": recipes.gunmetal } }],
      checks: [
        // Seeds where every compared pair differs by 24 levels: gunmetal has one such patch on its crown, the others two.
        { kind: "sampled", distinct: ["metal", "polished|chrome", "lacquer", "gold", "gunmetal"], samples: names.flatMap((name, i) =>
          ({ metal: [[2.5, -1.5], [-8.5, 0.5]], polished: [[11.5, 10.5], [-4.5, 13.5]], lacquer: [[0.5, -8.5], [-4.5, -5.5]], gold: [[2.5, 9.5], [-7.5, 13.5]],
            gunmetal: [[11.5, -10.5]], chrome: [[11.5, 5.5], [-2.5, 12.5]] } as Record<string, [number, number][]>)[name]!.map(([dx, dy]) =>
            ({ object: name, part: 0, at: [40 + i * 72 + dx, 40 + dy] as [number, number], note: `${name}: the crown, (${dx}, ${dy}) px from its centre` }))) },
        { kind: "presence", feature: "brush", object: "metal", variant: "brushed", share: 0.05, levels: 2, note: "Brushed metal against plain metal (brush 0.9, grain 0.15); provisional" },
      ],
    });
  }
  // 9. Shadows: a lever's shadow on its plate (the map), and the map never reaching the face.
  {
    const lever = bat("bat", 80, 70, 1), base = plate("plate", 20, 14, 120, 112, 3, "paint"), plinth = plate("plinth", 160, 20, 64, 48, 3, "paint");
    // The bat stands on the plate, and a 2 px plate on the plinth.
    for (const part of lever.object.parts) part.at = [part.at[0], part.at[1], part.at[2] + 3];
    lever.object.rect = [44, 18, 72, 104]; lever.object.bounds = { rect: [44, 18, 72, 104], radius: 8 };
    plinth.profiles["plinth-thin"] = { type: "prism", width: 30, length: 20, radius: 1, height: 2 };
    plinth.object.parts.push({ kind: "plate", profile: "plinth-thin", at: [188, 40, 3], material: "paint" });
    const scene = layer(240, 150, [base, lever, plinth], { materials: materials(settings, ["polished"], { paint: { base: { colour: "#6b7079", roughness: 0.55 } }, lever: { base: { colour: "#fafafb", metallic: 1, roughness: 0.06 } } }) });
    cases.push({
      name: "shadows",
      description: "A bat's lever thrown to t = 1 over a matte plate: the shadow map darkens the plate under the lever and its ball (2D.7), at most 0.95 of its lit value; lit plate points change by at most 3; face pixels are the same with the map on and off. A 2 px plate on a plinth casts a mapped band about 2.3 px wide, narrower than the 3 px placement rule, so it is checked by presence: the map on against off changes the plinth beside it. The parts' analytic shadows fall on the face beside the plates.",
      scene, capture: [panel(240, 150)],
      variants: [{ name: "map-off", description: "The shadow map off: darkness 1 keeps the whole key term", set: { "shadow.map.darkness": 1 } }],
      checks: [
        { kind: "ratio", variant: "map-off", ratio: 0.95, lit: 3, samples: [
          { object: "plate", part: 0, at: [104.5, 77.5], note: "the plate in the ball's mapped shadow", shadowed: true },
          { object: "plate", part: 0, at: [40.5, 40.5], note: "the plate in the light", shadowed: false } ] },
        { kind: "presence", feature: "the shadow map", object: "plinth", variant: "map-off", share: 0, levels: 4, note: "The 2 px plate's mapped shadow on its plinth" },
        { kind: "exact", samples: [
          { at: [150.5, 128.5], note: "the face beside the plate, outside every bounds" },
          { at: [200.5, 110.5], note: "the face, outside every bounds" } ] },
        { kind: "unchanged", variants: ["base", "map-off"], rects: [[150, 80, 80, 60]], note: "The map never reaches the face" },
      ],
    });
  }
  // 10. The post chain on and off, and the clip.
  {
    const forms = [knob("knob", 70, 70, 1, 0.5, { cap: "polished", skirt: "polished", chamfer: "polished", pointer: "ink" }), pushButton("button", 190, 70, 0, false, "lit")];
    const scene = layer(260, 140, forms, { materials: materials(settings, ["polished"], { ink: ink(), lit: glowLit(1), keycap: { base: { roughness: 1 } } }), protected: [[176, 64, 28, 12], [16, 122, 60, 10]] });
    cases.push({
      name: "post-and-clip",
      description: "A knob and a push button with the default post chain (SMAA and bloom), with every stage off and with every stage on (TAA, contact shadows and SSGI too). Outside every object's bounds, and inside protected rects where no part is drawn, the result is the face with Φ in every configuration (the clip, 2D.9 rules 4 and 5); captured caps are drawn after the chain.",
      scene, capture: [panel(260, 140), { rect: [173, 53, 34, 34], radius: 17, colour: colour("secondary") }, text([180, 66, 20, 8]), text([18, 124, 56, 6])],
      variants: [{ name: "post-off", description: "Every post stage off", set: { post: { smaa: false, bloom: false, taa: false, contact: false, ssgi: false } } },
        { name: "post-all", description: "Every post stage on", set: { post: { smaa: true, bloom: true, taa: true, contact: true, ssgi: true } } }],
      checks: [
        { kind: "exact", samples: [{ at: [20.5, 127.5], note: "protected text on the face, outside every bounds" }, { at: [130.5, 10.5], note: "the face between the objects, outside every bounds" },
          { at: [182.5, 69.5], note: "the button's captured label" }] },
        { kind: "exact", variant: "post-all", samples: [{ at: [20.5, 127.5], note: "the same text with every stage on" }, { at: [130.5, 10.5], note: "the same face" }, { at: [182.5, 69.5], note: "the same label" }] },
        { kind: "unchanged", variants: ["base", "post-off", "post-all"], rects: [[16, 122, 60, 10], [126, 4, 10, 120], [180, 66, 20, 8]], note: "The clip, protected text and captured caps under every post configuration" },
        { kind: "contained", variant: "post-all", objects: ["knob", "button"], t: [0, 0.5, 1] },
      ],
    });
  }
  // 11. Objects that fail containment, drawn as their Relief primitives.
  {
    const tall = knob("tall", 40, 40, 0.6, 0.5, { cap: "polished", skirt: "polished", chamfer: "polished", pointer: "ink" });
    // A pointer drawn far too tall leaves the knob's box near the stage corner (the layer stands at the top left).
    tall.profiles["tall-pointer"] = { type: "prism", width: 2, length: 8, radius: 0.4, height: 60 };
    // A box just round the skirt (19.2 px), inside the layer, so only the pointer's drift breaks it.
    tall.object.rect = [17, 17, 46, 46]; tall.object.bounds = { rect: [17, 17, 46, 46], radius: 23 };
    tall.object.relief = { face: "knob", rect: [17, 17, 46, 46], height: 0, material: "face" };
    const outside = slide("outside", 150, 40, 0.5, "polished");
    outside.object.rect = [118, 26, 64, 28]; outside.object.bounds = { rect: [140, 26, 64, 28], radius: 6 };
    outside.object.relief = { face: "raised", rect: [118, 26, 64, 28], radius: 6, height: 2, material: "face" };
    const scene = layer(190, 90, [tall, outside], { origin: [20, 20], materials: materials(settings, ["polished"], { ink: ink() }) });
    cases.push({
      name: "relief-step-down",
      description: "A knob whose pointer is drawn 60 px tall near the stage's corner (its drift leaves the box) and a slide whose bounds reach past the layer's right edge: neither is drawn as parts. Each is drawn as its Relief primitive, in its place in the face's list, and reported. (Custom parts outside their bounds wait for core's custom parts; built-in parts stand in.)",
      scene, capture: [panel(190, 90)],
      variants: [],
      checks: [
        { kind: "relief", objects: [{ id: "tall" }, { id: "outside" }], samples: [
          { at: [40.5, 40.5], note: "the tall knob's Relief primitive: a knob face at its centre" }, { at: [24.5, 30.5], note: "the knob primitive towards the light" },
          { at: [150.5, 40.5], note: "the slide's raised primitive" }, { at: [150.5, 27.5], note: "the raised primitive's top bevel" } ] },
      ],
    });
  }
  // 12. The dark theme.
  {
    const forms = [knob("knob", 90, 90, 1.5, 0.25, { cap: "metal", skirt: "polished", chamfer: "polished", pointer: "ink" }), wall("wall", 250, 90, 0, "gunmetal", "metal")];
    const scene = layer(310, 180, forms, { theme: "dark", materials: materials(dark, ["metal", "polished", "gunmetal"], { ink: ink("dark") }) });
    cases.push({
      name: "dark",
      description: "The dark theme: a large knob and a wall switch on a gunmetal plate (the plate role's dark preset), sampled without brush, with the dark face exact.",
      scene, capture: [panel(310, 180, "dark")],
      variants: [{ name: "unbrushed", description: "Metal and gunmetal without brush and grain", set: { "materials.metal": plain(dark.materials.metal!), "materials.gunmetal": plain(dark.materials.gunmetal!) } }],
      checks: [
        { kind: "sampled", variant: "unbrushed", samples: [
          { object: "knob", part: 1, at: [90.5, 90.5], note: "the cap's top" }, { object: "knob", part: 0, at: [90.5, 135.5], note: "the polished skirt cone" },
          { object: "wall", part: 0, at: [250.5, 125.5], note: "the gunmetal plate" }, { object: "wall", part: 1, at: [250.5, 82.5], note: "the paddle" } ] },
        { kind: "exact", samples: [{ at: [180.5, 20.5], note: "the dark face, outside every bounds" }, { at: [8.5, 90.5], note: "the dark panel's left bevel" },
          { at: [130.5, 140.5], note: "the dial face beside the knob, inside its bounds" }] },
        { kind: "contained", objects: ["knob", "wall"], t: [0, 0.5, 1] },
      ],
    });
  }
  // 13. Another light direction.
  {
    const forms = [knob("knob", 90, 90, 1.5, 0.75, { cap: "metal", skirt: "polished", chamfer: "polished", pointer: "ink" }), fader("fader", 230, 120, 0.2, "metal")];
    const scene = layer(290, 260, forms, { light: { azimuth: 135, elevation: 30 }, materials: materials(settings, ["metal", "polished"], { ink: ink() }) });
    cases.push({
      name: "light-direction",
      description: "The key light from the bottom right (azimuth 135°, elevation 30°): the studio's softbox moves with it (2D.5), the parts' shadows on the face fall towards the top left, and the same parts shade differently.",
      scene, capture: [panel(290, 260)],
      variants: [{ name: "unbrushed", description: "The metal without brush and grain", set: { "materials.metal": plain(settings.materials.metal!) } }],
      checks: [
        { kind: "sampled", variant: "unbrushed", samples: [
          { object: "knob", part: 1, at: [90.5, 90.5], note: "the cap's top" }, { object: "knob", part: 1, at: [101.5, 102.5], note: "the cap's top towards the light" },
          { object: "knob", part: 0, at: [132.5, 98.5], note: "the polished skirt cone, right of the cap" },
          { object: "fader", part: 1, at: [230.5, 164.5], note: "the fader's carriage top, above its index line" } ] },
        { kind: "exact", samples: [{ at: [45.5, 45.5], note: "the dial face in the knob's shadow, towards the top left" }, { at: [160.5, 15.5], note: "the face, outside every bounds" }] },
        { kind: "contained", objects: ["knob", "fader"], t: [0, 0.5, 1] },
      ],
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------------------------------------------------
// The generator.

/** Applies a variant's dotted paths to a copy of a scene. */
export function applyVariant<T extends object>(scene: T, variant?: Pick<InstrumentVariant, "set">): T {
  const copy = structuredClone(scene);
  for (const [path, value] of Object.entries(variant?.set ?? {})) {
    const keys = path.split(".");
    let node = copy as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) {
      if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    node[keys[keys.length - 1]!] = structuredClone(value);
  }
  return copy;
}
const hex8 = (colour: Rgb01) => toHex(colour.map(channel => channel * 255) as unknown as [number, number, number]);
/** The centre of the device pixel containing `at` at a scale, in CSS px. */
const centre = (at: [number, number], scale: number): [number, number] => [(Math.floor(at[0] * scale) + 0.5) / scale, (Math.floor(at[1] * scale) + 0.5) / scale];
const ring = (x: number, y: number, radius: number, count = 16): [number, number][] =>
  [[x, y], ...Array.from({ length: count }, (_, i) => [x + radius * Math.cos((i / count) * 2 * Math.PI), y + radius * Math.sin((i / count) * 2 * Math.PI)] as [number, number])];
const levels = (a: Rgb01, b: Rgb01) => Math.max(...a.map((value, index) => Math.abs(value - b[index]!) * 255));
const sameHit = (a: PartHit | undefined, b: PartHit | undefined) => !!a && !!b && a.object === b.object && a.part === b.part && a.group === b.group;

/** One case's scenes: the case's own (`base`) and each variant, validated. */
function scenes(entry: InstrumentCase): Map<string, InstrumentScene> {
  const result = new Map<string, InstrumentScene>([["base", validateInstrumentScene(entry.scene)]]);
  for (const variant of entry.variants) result.set(variant.name, validateInstrumentScene(applyVariant(entry.scene, variant)));
  return result;
}
const fail = (entry: InstrumentCase, what: string): never => { throw new Error(`instrument conformance, case ${entry.name}: ${what}`); };
const objectIndex = (entry: InstrumentCase, scene: InstrumentScene, id: string) => {
  const index = scene.objects.findIndex(object => object.id === id);
  return index >= 0 ? index : fail(entry, `no object ${id}`);
};
/** Whether any lit emitter lens could bloom (2D.8, step 4): an emissive part while bloom is on. */
const blooms = (scene: InstrumentScene) => (scene.post?.bloom ?? true) && scene.objects.some(object => object.parts.some(part => (scene.materials[part.material]?.emissive?.strength ?? 0) > 0));
const insideBounds = (scene: InstrumentScene, x: number, y: number) => scene.objects.some(object => boxDistance(x, y, object.bounds!.rect, object.bounds!.radius) <= 0);

/** An exact sample's expectations, after checking that 2D.9 fixes its colour at both scales. */
function exact(entry: InstrumentCase, scene: InstrumentScene, sample: ExactSample, relief = false): ExactSample {
  const captured = capturedFrom(entry.capture), expect: ScaledColour = {};
  let source: ExactSample["source"];
  for (const scale of instrumentScales) {
    const [x, y] = centre(sample.at, scale), point = shadeInstrument(scene, captured, x, y, scale);
    if (point.source === "part") return fail(entry, `exact point ${sample.at} shows a part whose colour is only sampled`);
    if (point.source === "face") {
      // A face pixel is exact outside every bounds (the clip), or 3 px clear of every part where nothing blooms.
      const clear = ring(x, y, insideBounds(scene, x, y) ? 3 : 2).every(([px, py]) => !partHit(scene, px, py));
      if (!clear) fail(entry, `exact face point ${sample.at} is within reach of a part`);
      if (insideBounds(scene, x, y) && (blooms(scene) && !relief)) fail(entry, `exact face point ${sample.at} lies inside bounds in a case that blooms`);
    } else {
      const hit = point.hit;
      if (!ring(x, y, 2).every(([px, py]) => sameHit(partHit(scene, px, py), hit))) fail(entry, `exact ${point.source} point ${sample.at} is within 2 px of its part's edge`);
    }
    // 1.5 px clear of the capture's edges, as in version 1.
    const [cr, cg, cb, ca] = captured(x, y);
    if (!ring(x, y, 1.5).every(([px, py]) => { const c = captured(px, py); return c[0] === cr && c[1] === cg && c[2] === cb && c[3] === ca; })) fail(entry, `exact point ${sample.at} is within 1.5 px of a capture edge`);
    source = point.source;
    expect[String(scale)] = hex8(point.colour);
  }
  return { at: sample.at, note: sample.note, source, expect };
}

/** A sampled point: placed by 2D.10's rule within 4 px of its seed, with its reference colour at both scales. */
function sampled(entry: InstrumentCase, scene: InstrumentScene, seed: SampledSeed, distinct?: string[]): SampledSeed {
  const captured = capturedFrom(entry.capture), objectAt = objectIndex(entry, scene, seed.object);
  const part = scene.objects[objectAt]!.parts[seed.part]!, recipe = scene.materials[part.material]!;
  if (!part.glass && (recipe.brush || recipe.grain || recipe.sheen || recipe.iridescence || recipe.subsurface || recipe.dispersion)) fail(entry, `sampled part ${seed.object}[${seed.part}] uses a layer the model checks by presence`);
  if (scene.environment.page?.enabled !== false) fail(entry, "sampled points need the page reflection off");
  const memo = new Map<string, Rgb01>();
  const colourAt = (x: number, y: number, scale: number) => {
    const key = `${x},${y},${scale}`;
    let value = memo.get(key);
    if (!value) { const hit = partHit(scene, x, y)!; value = partColour(scene, captured, hit, x, y, scale, { samples: SAMPLES }); memo.set(key, value); }
    return value;
  };
  const reason = (at: [number, number]): string | undefined => {
    for (const scale of instrumentScales) {
      const [x, y] = centre(at, scale), hit = partHit(scene, x, y);
      if (!hit || hit.object !== objectAt || hit.part !== seed.part) return "shows another part";
      // At least 3 px from any silhouette or facet edge, from any mapped shadow's edge and from protected rects.
      if (!ring(x, y, 3).every(([px, py]) => sameHit(partHit(scene, px, py), hit)) || !ring(x, y, 1.5, 8).every(([px, py]) => sameHit(partHit(scene, px, py), hit))) return "is within 3 px of an edge";
      if (!part.glass) {
        const shadowed = mapShadowed(scene, hit.point);
        if (!ring(x, y, 3, 8).every(([px, py]) => mapShadowed(scene, partHit(scene, px, py)!.point) === shadowed)) return "is within 3 px of a mapped shadow's edge";
      }
      if (protectedDistance(scene, x, y) < 3) return "is within 3 px of a protected rect";
    }
    // At most 4 levels per px of change (at scale 1, between neighbouring pixel centres).
    const [x, y] = centre(at, 1), here = colourAt(x, y, 1);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
      const hit = partHit(scene, x + dx, y + dy);
      if (!hit || hit.object !== objectAt || hit.part !== seed.part) return "has a neighbour on another part";
      if (levels(here, colourAt(x + dx, y + dy, 1)) > 4 * Math.hypot(dx, dy)) return "changes by more than 4 levels per px";
    }
    if (distinct) {
      // Each compared material differs from the point's by at least 24 levels in some channel, at the same point and normal.
      const hit = partHit(scene, x, y)!, own = distinct.find(group => group.split("|").includes(part.material));
      for (const group of distinct) {
        if (group === own) continue;
        for (const other of group.split("|")) {
          const swapped = partTerms(scene, { ...part, material: other }, hit.point, hit.normal, { samples: SAMPLES });
          const otherColour = swapped.key.map((_, i) => enc(Math.min(1, Math.max(0, swapped.key[i]! + swapped.lamp[i]! + swapped.fill[i]! + swapped.env[i]! + swapped.emissive[i]!)))) as unknown as Rgb01;
          if (levels(here, otherColour) < 24) return `differs from ${other} by under 24 levels`;
        }
      }
    }
    return undefined;
  };
  const offsets: [number, number][] = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) offsets.push([dx, dy]);
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const reasons: string[] = [];
  for (const [dx, dy] of offsets) {
    const at: [number, number] = [seed.at[0] + dx, seed.at[1] + dy], why = reason(at);
    if (why) { if (reasons.length < 3) reasons.push(`${at}: ${why}`); continue; }
    const expect: ScaledColour = {};
    for (const scale of instrumentScales) expect[String(scale)] = hex8(colourAt(...centre(at, scale), scale));
    return { object: seed.object, part: seed.part, at, note: seed.note, expect };
  }
  return fail(entry, `no point within 4 px of ${seed.object}[${seed.part}] at ${seed.at} meets 2D.10's placement rule (${reasons.join("; ")})`);
}

/** The share of an object's part pixels (every second pixel centre of its bounds, at scale 1) that change by `levels`. */
function presence(entry: InstrumentCase, on: InstrumentScene, off: InstrumentScene, id: string, levelsNeeded: number): number {
  const captured = capturedFrom(entry.capture), index = objectIndex(entry, on, id), [bx, by, bw, bh] = on.objects[index]!.bounds!.rect;
  let total = 0, changed = 0;
  for (let y = Math.floor(by) + 0.5; y < by + bh; y += 2) for (let x = Math.floor(bx) + 0.5; x < bx + bw; x += 2) {
    const a = partHit(on, x, y), b = partHit(off, x, y);
    if (!a || a.object !== index || !b) continue;
    total++;
    const ca = partColour(on, captured, a, x, y, 1, { samples: 128 }), cb = partColour(off, captured, b, x, y, 1, { samples: 128 });
    if (levels(ca, cb) >= levelsNeeded) changed++;
  }
  return total ? changed / total : 0;
}

/** Fills in a case's expectations, refusing any check the reference cannot stand behind. */
export function instrumentExpectations(entry: InstrumentCase): InstrumentCase {
  const all = scenes(entry), sceneOf = (name = "base") => all.get(name) ?? fail(entry, `no variant ${name}`);
  const captured = capturedFrom(entry.capture);
  const checks = entry.checks.map((check): InstrumentCheck => {
    switch (check.kind) {
      case "exact": return { ...check, samples: check.samples.map(sample => exact(entry, sceneOf(check.variant), sample)) };
      case "sampled": return { ...check, samples: check.samples.map(seed => sampled(entry, sceneOf(check.variant), seed, check.distinct)) };
      case "contained": {
        const scene = sceneOf(check.variant), reference: Record<string, { inset: number; t: number; part: number }> = {};
        for (const id of check.objects) {
          const result = objectContained(scene.objects[objectIndex(entry, scene, id)]!, scene);
          if (!result.contained) fail(entry, `${id} fails containment (${result.reason}, inset ${result.closest.inset})`);
          reference[id] = { inset: round(result.closest.inset), t: round(result.closest.t), part: result.closest.part };
        }
        return { ...check, reference };
      }
      case "unchanged": {
        // The reference agrees: no part is drawn at the rects' centres in any variant.
        for (const name of check.variants) for (const [x, y, w, h] of check.rects) {
          const scene = sceneOf(name), hit = partHit(scene, x + w / 2, y + h / 2);
          if (hit && !scene.objects[hit.object]!.parts[hit.part]!.captured && scene.objects[hit.object]!.parts[hit.part]!.glass !== "window") fail(entry, `unchanged rect ${[x, y, w, h]} shows a part in ${name}`);
        }
        return check;
      }
      case "presence": {
        const measured = presence(entry, sceneOf(), sceneOf(check.variant), check.object, check.levels);
        // Features the reference shades are measured, and the check asks for half of what it measured.
        if (check.share > 0) return check;
        if (measured <= 0) fail(entry, `presence of ${check.feature}: the reference measures no change`);
        return { ...check, share: Math.floor(measured * 50) / 100, measured: round(measured) };
      }
      case "ratio": {
        const on = sceneOf(), off = sceneOf(check.variant);
        return { ...check, samples: check.samples.map(sample => {
          const expect: Record<string, { on: string; off: string }> = {};
          for (const scale of instrumentScales) {
            const [x, y] = centre(sample.at, scale), hit = partHit(on, x, y);
            if (!hit || hit.object !== objectIndex(entry, on, sample.object) || hit.part !== sample.part) fail(entry, `ratio point ${sample.at} does not show ${sample.object}[${sample.part}]`);
            const shadowed = mapShadowed(on, hit!.point);
            if (shadowed !== sample.shadowed) fail(entry, `ratio point ${sample.at} is ${shadowed ? "" : "not "}in the map's shadow`);
            if (!ring(x, y, 3, 8).every(([px, py]) => { const h = partHit(on, px, py); return !!h && mapShadowed(on, h.point) === shadowed; })) fail(entry, `ratio point ${sample.at} is within 3 px of the map's edge`);
            const a = partColour(on, captured, hit!, x, y, scale, { samples: SAMPLES }), b = partColour(off, captured, hit!, x, y, scale, { samples: SAMPLES });
            // Decoded (sRGB) channels, as a renderer compares its own two renders.
            if (shadowed && !a.every((value, i) => value <= check.ratio * b[i]!)) fail(entry, `ratio point ${sample.at}: the reference's shadow is not at most ${check.ratio} of its lit value`);
            if (!shadowed && levels(a, b) > check.lit) fail(entry, `ratio point ${sample.at}: a lit point changes by more than ${check.lit}`);
            expect[String(scale)] = { on: hex8(a), off: hex8(b) };
          }
          return { ...sample, expect };
        }) };
      }
      case "relief": {
        const scene = sceneOf();
        const objects = check.objects.map(({ id }) => {
          const result = objectContained(scene.objects[objectIndex(entry, scene, id)]!, scene);
          if (result.contained) fail(entry, `${id} is contained, so it is not drawn as Relief`);
          return { id, reason: result.reason!, overshoot: round(result.overshoot) };
        });
        return { ...check, objects, samples: check.samples.map(sample => exact(entry, scene, sample, true)) };
      }
    }
  });
  return { ...entry, checks };
}

/** The version 4 (Instrument) suite with every expectation computed by the reference implementation. */
export function buildInstrumentConformance(source: TokenGroup = strataSource): InstrumentSuite {
  return {
    format: "strata-conformance",
    model: "strata-scene/4",
    status: "Version 4 is a draft. The sampled tolerance (12) is provisional until the suite first runs against core's Instrument material on Lite (rendering model 2D.10); raising it is a change of version 4.",
    tolerance: instrumentTolerance,
    scales: [...instrumentScales],
    description: "Strata rendering model, version 4: Instrument. Paint each case's capture (rounded rectangles in order, over transparent) as the layer's content and render the scene, and each variant (the scene with `set`'s dotted paths changed), over its backdrop at device scales 1 and 2. The layer stands at a whole device pixel, its vanishing point at the scene's camera.vanish. At scale s, a sample's pixel is the device pixel floor(at · s), layer-local, and expect[s] is the reference at its centre. Checks: exact (every channel within tolerance.exact), sampled (within tolerance.sampled), contained (at each t, every pixel the parts change lies inside the object's bounds), unchanged (identical pixels in every listed variant), presence (the feature on against off changes at least share of the object's part pixels by at least levels, and nothing outside its bounds or in protected rects), ratio (with the map on, shadowed points at most ratio of their lit value in every channel, lit points within lit levels) and relief (the objects are drawn as their Relief primitives and reported). A renderer conforms to version 4 when it passes this suite, scene-3.json, objects-2.json and relief-1.json.",
    cases: instrumentCases(source).map(instrumentExpectations),
  };
}
