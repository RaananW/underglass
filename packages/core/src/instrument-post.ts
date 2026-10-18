/**
 * The Instrument post chain's settings and the pure parts of it (Rendering Model 2D.7 and 2D.8,
 * `docs/ui-library/instrument-phase2.md`, core work item 3): the `post` flags and the shadow map a scene resolves to,
 * the map's depth window and its bias in Lite's units, the glow colour a lens draws into the emitter target, the
 * rectangle a layer's composite covers and the world box of one placed part. No Babylon Lite and no DOM:
 * `instrument-pass.ts` builds the chain from these.
 */
import type { InstrumentPart, InstrumentScene } from "./instrument.js";

/** The optional stages of the chain, in the order they run (TAA first: it jitters the parts task). */
export const POST_STAGES = ["taa", "contact", "ssgi", "smaa", "bloom"] as const;
export type PostStage = (typeof POST_STAGES)[number];
/** 2D.1: SMAA and bloom on, the options off. */
export const POST_DEFAULTS: Readonly<Record<PostStage, boolean>> = { taa: false, contact: false, ssgi: false, smaa: true, bloom: true };
/** 2D.7 and design language section 7: PCF 4,096, a bias of 1.95 world px and a darkness of 0.1. */
export const MAP_DEFAULTS = { size: 4096, bias: 1.95, darkness: 0.1 } as const;
/**
 * The output transform of the parts: Lite's `loadHdrEnvironment` sets exposure 0.8 and contrast 1.2 (with tone mapping
 * off) as a side effect (`loader-hdr/load-hdr.js`), and the calibrated Rendering Model mirrors them. Core sets them
 * explicitly after the load, so the look no longer depends on the loader.
 */
export const INSTRUMENT_EXPOSURE = 0.8;
export const INSTRUMENT_CONTRAST = 1.2;
/**
 * The stages' settings, from I0.8 (`ui-probes/instrument-post.ts`), in CSS px (world units). The resolutions are core
 * constants, not scene fields: 2D.1 defines `post` as five booleans.
 */
export const POST_SETTINGS = {
  taa: { factor: 0.1, samples: 8 },
  smaa: { threshold: 0.05, maxSearchSteps: 16 },
  contact: { intensity: 0.7, stepCount: 12, maxDistance: 8, thickness: 3, bias: 0.15, normalBias: 0.4, resolutionScale: 1 },
  // SSGI fades by distance from the camera, not by ray length (I0.8), so the fade sits far beyond the stage camera.
  ssgi: { intensity: 0.6, stepCount: 12, rayCount: 1, rayLength: 24, thickness: 4, bias: 0.2, fadeStart: 100000, fadeEnd: 200000, resolutionScale: 0.5 },
  bloom: { threshold: 0.05, weight: 0.8, kernel: 48, bloomScale: 0.5, exposure: 1 },
} as const;
/** The budget rule (I0.8, design language section 16): a stage is on by default only at about this task p95 at DPR 2. */
export const POST_STAGE_BUDGET_MS = 2;

/** The `post` flags a scene draws with (2D.1 defaults for the ones it leaves out). */
export function postFlags(scene: Pick<InstrumentScene, "post">): Record<PostStage, boolean> {
  const post = scene.post ?? {};
  return Object.fromEntries(POST_STAGES.map(stage => [stage, post[stage] ?? POST_DEFAULTS[stage]])) as Record<PostStage, boolean>;
}
/** The shadow map a scene draws with, or null for none: a darkness of 1 leaves the whole key term, so it is no map. */
export function mapSettings(scene: Pick<InstrumentScene, "shadow">): { size: number; bias: number; darkness: number } | null {
  const map = scene.shadow.map ?? {};
  const settings = { size: map.size ?? MAP_DEFAULTS.size, bias: map.bias ?? MAP_DEFAULTS.bias, darkness: map.darkness ?? MAP_DEFAULTS.darkness };
  return settings.darkness >= 1 ? null : settings;
}
/**
 * The map's depth window, half its depth in world px (CSS px): centred on the stage centre, it holds every point within
 * the stage's half-diagonal `r` of it along any direction, plus 256 px of part height and margin, rounded up to a power
 * of two and never below 4,096. Depth precision stays far below a pixel (depth32float over 8,192 px: about 5e-4 px), so
 * the floor only spares a rebuild on ordinary resizes.
 */
export function mapWindow(stage: { width: number; height: number }): number {
  const r = Math.hypot(stage.width, stage.height) / 2;
  return Math.max(4096, 2 ** Math.ceil(Math.log2(r + 256)));
}
/**
 * The map's bias in Lite's units for a bias in world px: Lite's directional PCF offsets the caster's light-space depth
 * by `bias / 2` of the window (`pcf-shadow-task-hooks.js`, `biasViewProjection`), and the window is `2 · halfDepth` deep.
 */
export function liteMapBias(biasPx: number, halfDepth: number): number {
  return biasPx / halfDepth;
}
const encode = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
const linear = (hex: string): [number, number, number] => [1, 3, 5].map(index => {
  const c = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}) as [number, number, number];
/**
 * What a part draws into the emitter target (2D.8 step 4), or undefined when it is not a lens (no `emitter`): `lit` when
 * its emitter gives light (strength and colour above 0), and its glow, display-encoded and clamped: the part material's
 * emissive colour times its strength, or the emitter's own colour when the material has no emissive.
 */
export function partGlow(scene: Pick<InstrumentScene, "materials" | "emitters">, part: Pick<InstrumentPart, "emitter" | "material">): { lit: boolean; colour: [number, number, number] } | undefined {
  if (part.emitter === undefined) return undefined;
  const emitter = scene.emitters?.[part.emitter];
  const lit = !!emitter && emitter.strength > 0 && Math.max(...emitter.colour) > 0;
  const emissive = scene.materials[part.material]?.emissive;
  const colour: [number, number, number] = (emissive?.strength ?? 0) > 0
    ? linear(emissive!.colour ?? "#ffffff").map(value => Math.min(1, encode(Math.min(1, value * emissive!.strength!)))) as [number, number, number]
    : emitter ? emitter.colour.map(value => Math.min(1, Math.max(0, value))) as [number, number, number] : [0, 0, 0];
  return { lit, colour };
}
/**
 * The canvas rectangle (CSS px, `[x0, y0, x1, y1]`) a layer's composite covers: its box through its matrix (a
 * similarity, so the box's corners bound it), grown by 1 px and clamped to the canvas; null when nothing is left.
 */
export function compositeRect(matrix: { a: number; b: number; c: number; d: number; e: number; f: number }, extent: { width: number; height: number },
  stage: { width: number; height: number }): [number, number, number, number] | null {
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of [[0, 0], [extent.width, 0], [0, extent.height], [extent.width, extent.height]] as const) {
    xs.push(matrix.a * x + matrix.c * y + matrix.e);
    ys.push(matrix.b * x + matrix.d * y + matrix.f);
  }
  const rect: [number, number, number, number] = [Math.max(0, Math.floor(Math.min(...xs)) - 1), Math.max(0, Math.floor(Math.min(...ys)) - 1),
    Math.min(stage.width, Math.ceil(Math.max(...xs)) + 1), Math.min(stage.height, Math.ceil(Math.max(...ys)) + 1)];
  return rect[0] < rect[2] && rect[1] < rect[3] ? rect : null;
}
/**
 * The world box `[minX, minY, minZ, maxX, maxY, maxZ]` of a part placed by `matrix` (column-major 4 × 4, part px to
 * world), whose local box is `low`..`high`: what each part kind publishes as its bounds for the map's fit.
 */
export function placedBox(matrix: ArrayLike<number>, low: readonly number[], high: readonly number[], out = new Float64Array(6)): Float64Array {
  for (let row = 0; row < 3; row++) {
    let centre = matrix[12 + row]!, radius = 0;
    for (let column = 0; column < 3; column++) {
      const coefficient = matrix[column * 4 + row]!, c = (low[column]! + high[column]!) / 2, e = (high[column]! - low[column]!) / 2;
      centre += coefficient * c;
      radius += Math.abs(coefficient) * e;
    }
    out[row] = centre - radius;
    out[row + 3] = centre + radius;
  }
  return out;
}
/**
 * What of the chain is part of a scene's structure (a change rebuilds its Lite scene): the flags, the map and its window
 * on this stage, and which part kinds have lenses.
 */
export function postStructure(scene: InstrumentScene, stage: { width: number; height: number }, lensKinds: readonly string[]): string {
  const map = mapSettings(scene);
  return JSON.stringify([postFlags(scene), map, map ? mapWindow(stage) : 0, [...lensKinds].sort()]);
}
