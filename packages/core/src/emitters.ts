/**
 * Emitters (Rendering Model 2D.4, design language section 3): lamps, LEDs, lit rings and the pointer light as light
 * sources on scenes of every GPU level (`docs/ui-library/instrument-phase2.md`, core work item 2). This module has no
 * GPU and no DOM: it validates the scene fields (`emitters`, `protected`, `feather`), keeps a layer's budget (the 64
 * emitters with the most reach into its draw rectangle), bins them into a 16 × 9 tile grid, bounds the guard per
 * protected rect, and packs all of it into the **emitter block** that the face pool pass and the relief shading read.
 * `renderer.ts` draws the pool; `relief.ts` adds the specular term; `instrument-pass.ts` lights the parts with Lite
 * clustered lights and guards their face shadows.
 *
 * Coordinates are layer-local CSS px, x right, y down, z up from the face.
 */
import type { ReliefObject, ReliefPrimitive, ReliefScene } from "./relief.js";

/** One point light (2D.4), in layer px; `z` is the height above the face. */
export interface SceneEmitter {
  position: [number, number, number];
  /** Light colour, each channel 0..1. */
  colour: [number, number, number];
  /** Intensity `I` of the falloff, at least 0. */
  strength: number;
  /** Reach `R`, px: no light beyond it. */
  radius: number;
  /** `outset` (default): the extent and the outset. `layer`: the layer's own captured content only (the pointer light). */
  reach?: "outset" | "layer";
  /** The share of `strength` that lights the face, 0..1, default 1; parts take all of it (the pointer light's is 0.3). */
  face?: number;
}
/** A layer's protected text rects `[x, y, width, height]`, or its whole box. */
export type ProtectedRects = [number, number, number, number][] | "extent";
/** The light fields of a version 4 scene. */
export interface SceneLight { emitters?: SceneEmitter[]; protected?: ProtectedRects; feather?: number }

/** Emitters one layer draws (I0.3); the rest are dropped by reach, with a diagnostic. */
export const EMITTERS_PER_LAYER = 64;
/** Emitters a scene may carry; the budget is the renderer's, not the format's. */
export const SCENE_EMITTERS = 1024;
/** Protected rects one layer's guard holds; a layer with more protects its whole box. */
export const PROTECTED_PER_LAYER = 64;
/** Protected rects a scene may carry. */
export const SCENE_PROTECTED = 4096;
/** The guard's default and largest feather, px (design language `emitter.guardFeather`, `pointerLight.guardFeather`). */
export const DEFAULT_FEATHER = 4;
export const MAX_FEATHER = 16;
/** The tile grid over a layer's draw rectangle. */
export const EMITTER_TILES = { x: 16, y: 9 } as const;

/** The guard's cell grid over a layer's extent, used when the whole box is protected (`"extent"`, or more than 64 rects). */
export const GUARD_CELLS = { x: 16, y: 9 } as const;
/** Rects the emitter block holds: the layer's own protected rects, then lower layers' text under its outset. */
export const BLOCK_RECTS = PROTECTED_PER_LAYER;

// The emitter block, in vec4s: a header, the tile grid, the extent guard, the protected rects and their caps, two vec4s
// per emitter, one vec4 per tile holding four 16-bit masks of the drawn emitters (exact in f32, so no bit casts of uniform
// floats), and one vec4 of caps per guard cell.
export const EMITTER_GRID = 1;
export const EMITTER_EXTENT = 2;
export const EMITTER_RECTS = 3;
export const EMITTER_CAPS = EMITTER_RECTS + BLOCK_RECTS;
export const EMITTER_LIGHTS = EMITTER_CAPS + BLOCK_RECTS;
export const EMITTER_TILE_BASE = EMITTER_LIGHTS + 2 * EMITTERS_PER_LAYER;
export const EMITTER_CELLS = EMITTER_TILE_BASE + EMITTER_TILES.x * EMITTER_TILES.y;
/** vec4s in the emitter block. */
export const EMITTER_BLOCK_VEC4S = EMITTER_CELLS + GUARD_CELLS.x * GUARD_CELLS.y;

type Box = [number, number, number, number];
/** A rectangle by its corners, layer px. */
export interface Bounds { x0: number; y0: number; x1: number; y1: number }

const number = (value: unknown, path: string, prefix: string, min = -1e6, max = 1e6): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${prefix} ${path} requires a number in ${min}..${max}`);
  return value;
};
const tuple = (value: unknown, path: string, prefix: string, length: number, min = -1e6, max = 1e6): number[] => {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${prefix} ${path} requires ${length} numbers`);
  return (value as unknown[]).map((part, index) => number(part, `${path}[${index}]`, prefix, min, max));
};

/** Validates an emitter list (2D.4) and returns normalized copies; `prefix` starts every error ("Relief scene"). */
export function validateEmitters(value: unknown, prefix: string, path = "emitters"): SceneEmitter[] {
  if (!Array.isArray(value) || value.length > SCENE_EMITTERS) throw new Error(`${prefix} ${path} requires an array of at most ${SCENE_EMITTERS}`);
  return value.map((entry, index): SceneEmitter => {
    const at = `${path}[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error(`${prefix} ${at} requires an object`);
    const emitter = entry as Record<string, unknown>;
    for (const key of Object.keys(emitter)) if (!["position", "colour", "strength", "radius", "reach", "face"].includes(key)) throw new Error(`${prefix} ${at}.${key} is not a field of this part of the format`);
    const reach = emitter.reach ?? "outset";
    if (reach !== "outset" && reach !== "layer") throw new Error(`${prefix} ${at}.reach requires one of outset, layer`);
    return {
      position: tuple(emitter.position, `${at}.position`, prefix, 3) as [number, number, number],
      colour: tuple(emitter.colour, `${at}.colour`, prefix, 3, 0, 1) as [number, number, number],
      strength: number(emitter.strength, `${at}.strength`, prefix, 0),
      radius: number(emitter.radius, `${at}.radius`, prefix, 1e-6),
      reach, face: emitter.face === undefined ? 1 : number(emitter.face, `${at}.face`, prefix, 0, 1),
    };
  });
}

/**
 * Validates the light fields of a version 4 scene and returns those present, normalized: `emitters`, `protected` (up to
 * 4,096 rects, or `"extent"`) and `feather` (0..16, default 4 wherever `emitters` or `protected` is present).
 */
export function validateLight(scene: Record<string, unknown>, prefix: string): SceneLight {
  const result: SceneLight = {};
  if (scene.emitters !== undefined) result.emitters = validateEmitters(scene.emitters, prefix);
  if (scene.protected === "extent") result.protected = "extent";
  else if (scene.protected !== undefined) {
    if (!Array.isArray(scene.protected) || scene.protected.length > SCENE_PROTECTED) throw new Error(`${prefix} protected requires "extent" or an array of at most ${SCENE_PROTECTED} rects`);
    result.protected = (scene.protected as unknown[]).map((rect, index) => {
      const [x, y, width, height] = tuple(rect, `protected[${index}]`, prefix, 4);
      if (width! < 0 || height! < 0) throw new Error(`${prefix} protected[${index}] requires [x, y, width, height] with a width and height of at least 0`);
      return [x!, y!, width!, height!] as Box;
    });
  }
  if (scene.feather !== undefined) result.feather = number(scene.feather, "feather", prefix, 0, MAX_FEATHER);
  else if (result.emitters || result.protected) result.feather = DEFAULT_FEATHER;
  return result;
}

/** Whether an emitter gives any light at all. */
export const emitterLit = (emitter: SceneEmitter) => emitter.strength > 0 && Math.max(...emitter.colour) > 0;
/** How far an emitter's light reaches into `rect`, px: its reach in the face plane minus its distance to the rectangle. */
export function reachMargin(emitter: SceneEmitter, rect: Bounds): number {
  const [x, y, z] = emitter.position;
  const horizontal = Math.sqrt(Math.max(0, emitter.radius * emitter.radius - z * z));
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1), dy = Math.max(rect.y0 - y, 0, y - rect.y1);
  return horizontal - Math.hypot(dx, dy);
}

/** What one layer draws in one frame: the emitters kept by the budget, in scene order, and what was left out. */
export interface LayerEmitters {
  /** The drawn emitters with their index in the scene, at most 64. */
  drawn: { index: number; emitter: SceneEmitter }[];
  /** Emitters that light and reach the layer but fell outside the budget, farthest by reach. */
  dropped: { index: number; margin: number }[];
  /** Emitters in the scene, emitters that give light, and emitters that give light but do not reach the layer. */
  total: number; lit: number; outOfReach: number;
}
/**
 * The budget (design language section 3): of the emitters that give light and reach `rect` (the layer's draw
 * rectangle), the 64 with the largest reach margin, ties in scene order; the rest are dropped and reported.
 */
export function selectEmitters(emitters: readonly SceneEmitter[] | undefined, rect: Bounds): LayerEmitters {
  const list = emitters ?? [];
  const candidates: { index: number; emitter: SceneEmitter; margin: number }[] = [];
  let lit = 0, outOfReach = 0;
  list.forEach((emitter, index) => {
    if (!emitterLit(emitter)) return;
    lit++;
    const margin = reachMargin(emitter, rect);
    if (margin <= 0) { outOfReach++; return; }
    candidates.push({ index, emitter, margin });
  });
  if (candidates.length <= EMITTERS_PER_LAYER) return { drawn: candidates.map(({ index, emitter }) => ({ index, emitter })), dropped: [], total: list.length, lit, outOfReach };
  const ranked = [...candidates].sort((a, b) => b.margin - a.margin || a.index - b.index);
  const kept = new Set(ranked.slice(0, EMITTERS_PER_LAYER).map(entry => entry.index));
  return {
    drawn: candidates.filter(entry => kept.has(entry.index)).map(({ index, emitter }) => ({ index, emitter })),
    dropped: ranked.slice(EMITTERS_PER_LAYER).map(({ index, margin }) => ({ index, margin: Math.round(margin * 100) / 100 })),
    total: list.length, lit, outOfReach,
  };
}

/**
 * The tile masks of `drawn` over `rect`: per tile (16 × 9, row-major), four 16-bit masks of the drawn emitters whose
 * reach in the face plane meets the tile.
 */
export function tileMasks(drawn: readonly { emitter: SceneEmitter }[], rect: Bounds): Uint16Array {
  const masks = new Uint16Array(EMITTER_TILES.x * EMITTER_TILES.y * 4);
  const width = Math.max(1e-6, rect.x1 - rect.x0) / EMITTER_TILES.x, height = Math.max(1e-6, rect.y1 - rect.y0) / EMITTER_TILES.y;
  const clamp = (value: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor(value)));
  drawn.forEach(({ emitter }, slot) => {
    const [x, y, z] = emitter.position, reach = Math.sqrt(Math.max(0, emitter.radius * emitter.radius - z * z));
    if (x + reach < rect.x0 || x - reach > rect.x1 || y + reach < rect.y0 || y - reach > rect.y1) return;
    const tx0 = clamp((x - reach - rect.x0) / width, EMITTER_TILES.x), tx1 = clamp((x + reach - rect.x0) / width, EMITTER_TILES.x);
    const ty0 = clamp((y - reach - rect.y0) / height, EMITTER_TILES.y), ty1 = clamp((y + reach - rect.y0) / height, EMITTER_TILES.y);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      // The tile's nearest point to the emitter: a tile the reach circle misses keeps its bit clear.
      const cx = Math.min(Math.max(x, rect.x0 + tx * width), rect.x0 + (tx + 1) * width), cy = Math.min(Math.max(y, rect.y0 + ty * height), rect.y0 + (ty + 1) * height);
      if (Math.hypot(cx - x, cy - y) > reach) continue;
      masks[(ty * EMITTER_TILES.x + tx) * 4 + (slot >> 4)]! |= 1 << (slot & 15);
    }
  });
  return masks;
}

/** Caps of one guarded area: the most emitter light may add there, and the most part shadows may take away together. */
export interface GuardCaps { light: number; shadow: number }
/**
 * A layer's guard: its protected rects (corners, layer px), each with its caps; or, when the whole box is protected
 * (`"extent"`, or more than 64 rects), `cells`: the caps of each cell of a 16 × 9 grid over the extent, so one stack of
 * controls or one shadow lowers the caps of its own cells only.
 */
export interface Guard {
  rects: ({ rect: Bounds } & GuardCaps)[];
  /** Whether the guard protects the layer's whole box. */
  extent: boolean;
  /** Rects the scene gave beyond the 64 the guard holds (then it protects the extent). */
  overflow: number;
  /** The extent's cells (row-major, `GUARD_CELLS`), when `extent`. */
  cells: GuardCaps[] | null;
}
const guards = new WeakMap<ReliefScene, WeakMap<object, Guard>>();
const extentKey = {};
const unguarded: Guard = Object.freeze({ rects: [], extent: false, overflow: 0, cells: null });
/** The caps that keep `k · (1 − Sₚ) · (1 + E)` within `1 ± m` where `k` lies in `[low, high]`. */
const capsOf = ([low, high]: [number, number], m: number): GuardCaps => ({ light: Math.max(0, (1 + m) / high - 1), shadow: Math.max(0, 1 - (1 - m) / low) });
/** The extent's guard cells as rects, row-major. */
export function guardCells(extent: { width: number; height: number }): Bounds[] {
  const width = extent.width / GUARD_CELLS.x, height = extent.height / GUARD_CELLS.y, cells: Bounds[] = [];
  for (let row = 0; row < GUARD_CELLS.y; row++) for (let column = 0; column < GUARD_CELLS.x; column++) {
    cells.push({ x0: column * width, y0: row * height, x1: (column + 1) * width, y1: (row + 1) * height });
  }
  return cells;
}
/**
 * The guard of a layer (2D.4, `docs/ui-library/instrument-phase2.md`): for each protected rect (or each cell of the
 * extent), bounds of the relief's guarded factor `k` over it from `face` (the layer's relief scene as drawn: an Instrument
 * layer's primitives and the objects drawn at Relief), and from them the caps that keep the face's whole change there
 * within `m`:
 * - `light`: emitter light is capped at `(1 + m) / k_hi − 1` per channel;
 * - `shadow`: part shadows on the face may darken it by at most `1 − (1 − m) / k_lo` together.
 * Cached per face scene and protected list.
 */
export function layerGuard(face: ReliefScene, protect: ProtectedRects | undefined): Guard {
  if (protect === undefined) return unguarded;
  const key = protect === "extent" ? extentKey : protect;
  let byFace = guards.get(face);
  if (!byFace) { byFace = new WeakMap(); guards.set(face, byFace); }
  const cached = byFace.get(key);
  if (cached) return cached;
  const m = face.interior.max;
  const whole = protect === "extent" || protect.length > PROTECTED_PER_LAYER;
  const result: Guard = whole
    ? { extent: true, overflow: protect === "extent" ? 0 : protect.length - PROTECTED_PER_LAYER, rects: [], cells: guardCells(face.extent).map(cell => capsOf(interiorBounds(face, cell), m)) }
    : { extent: false, overflow: 0, cells: null, rects: (protect as Box[]).map(([x, y, width, height]) => {
      const rect = { x0: x, y0: y, x1: x + width, y1: y + height };
      return { rect, ...capsOf(interiorBounds(face, rect), m) };
    }) };
  byFace.set(key, result);
  return result;
}

/**
 * An object's heights (2B.2): the base, and the cap (a well's floor, a pressed key's sunk cap) or a dome's apex, in its
 * state or (`highest`) at the highest it reaches (hovered, not pressed). Shared by the relief packing and the guard.
 */
export function objectHeights(entry: ReliefObject, highest = false): [number, number] {
  const z0 = entry.base ?? 0;
  if (entry.object === "well") return [z0, z0 - entry.height];
  const state = highest ? { hover: true } : entry.state ?? {};
  const travel = (entry.object === "key" || entry.object === "mark") && state.pressed ? Math.min(entry.travel ?? 0, entry.height) : 0;
  // Hover raises the cap by a quarter of the object's height.
  const rise = state.hover && !(state as { disabled?: boolean }).disabled ? entry.height / 4 : 0;
  return [z0, z0 + entry.height + rise - travel];
}
/**
 * The height a relief entry casts its shadow from in its state (2.3 and 2B.2), exactly as the relief pass packs it: a
 * lifted face's height times the hover and press multipliers; an object's cap above its base (a key's travel already
 * lowers it; any other object takes the press multiplier). 0 for an entry that casts nothing.
 */
export function castHeight(scene: Pick<ReliefScene, "state">, entry: ReliefPrimitive | ReliefObject): number {
  const state = entry.state ?? {};
  if ("object" in entry) {
    const [z0, z1] = objectHeights(entry), travels = entry.object === "key" || entry.object === "mark";
    return z1 > z0 && !state.disabled ? (z1 - z0) * (travels ? 1 : 1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0)) : 0;
  }
  const lifted = entry.face === "raised" || entry.face === "knob" || entry.face === "mark";
  return lifted && !state.disabled ? entry.height * (1 + (scene.state.hoverHeight - 1) * (state.hover ? 1 : 0)) * (1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0)) : 0;
}

/** A relief entry as the guard sees it: its box, corner radius, interior offset, and its cast shadow when lifted. */
interface GuardShape { box: Bounds; radius: number; offset: number; cast: number }
const shapeCache = new WeakMap<ReliefScene, GuardShape[]>();
function guardShapes(face: ReliefScene): GuardShape[] {
  let shapes = shapeCache.get(face);
  if (shapes) return shapes;
  const { hoverLift, pressSink } = face.state;
  shapes = face.primitives.map(entry => {
    const [x, y, width, height] = entry.rect, state = entry.state ?? {};
    const material = face.materials[entry.material] ?? {};
    const object = "object" in entry, dome = object && (entry.object === "knob" || entry.object === "puck");
    // 2.6 and 2B.4: the interior offset of a lit face or a solid's cap (a dome has none; the guard never holds on it).
    const lit = !state.disabled && (material.emissive?.strength ?? 0) <= 0 && !dome && (object || entry.face !== "flat");
    const offset = lit ? hoverLift * (state.hover ? 1 : 0) - pressSink * (state.pressed ? 1 : 0) + (material.coat?.strength ?? 0) * 0.02 + (1 - (material.base?.roughness ?? 1)) * 0.01 : 0;
    // Its cast height in its state, as the relief pass packs it. An object drawn at the Relief level instead (2B.6) casts
    // as its Relief equivalent, a face of the same height: the guard takes the larger.
    const cast = object ? Math.max(castHeight(face, entry), castHeight(face, { face: "raised", rect: entry.rect, height: entry.height, material: entry.material, state }))
      : castHeight(face, entry);
    const round = !object && entry.face === "knob" || dome;
    return { box: { x0: x, y0: y, x1: x + width, y1: y + height }, radius: round ? Math.min(width, height) / 2 : Math.min(entry.radius ?? 0, width / 2, height / 2), offset, cast };
  });
  shapeCache.set(face, shapes);
  return shapes;
}
const overlap = (a: Bounds, b: Bounds, grow = 0) => a.x0 - grow <= b.x1 && a.x1 + grow >= b.x0 && a.y0 - grow <= b.y1 && a.y1 + grow >= b.y0;
const intersect = (a: Bounds, b: Bounds): Bounds | undefined => {
  const box = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return box.x0 < box.x1 && box.y0 < box.y1 ? box : undefined;
};
/** Whether `area` lies at least `by` px inside a shape's rounded box (the box is convex, so its corners decide). */
function within(shape: GuardShape, area: Bounds, by: number) {
  const { box, radius } = shape, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, hx = (box.x1 - box.x0) / 2, hy = (box.y1 - box.y0) / 2;
  const distance = (px: number, py: number) => {
    const qx = Math.abs(px - cx) - hx + radius, qy = Math.abs(py - cy) - hy + radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  };
  return [distance(area.x0, area.y0), distance(area.x1, area.y0), distance(area.x0, area.y1), distance(area.x1, area.y1)].every(value => value <= -by);
}

/**
 * Bounds `[k_lo, k_hi]` of the relief's guarded factor `k` (2.9) over `rect`:
 * - **Offsets by the largest stack.** In the shading a covering entry replaces the offset beneath it; only within its
 *   antialiased edge do offsets add up. So the bound is, over the entries that overlap the rect, the largest of an
 *   entry's offset plus the offsets of the earlier entries it overlaps there, by sign, within `m`. Entries side by side
 *   never add.
 * - **Shadows where they can fall on a guarded face.** An entry's cast shadow counts only where it can reach a point of
 *   the rect that lies on an earlier entry (a guarded face beneath it; the shading drops shadows under later covers) and
 *   not a pixel inside the caster itself (2.8). A face's own drop shadow, outside the face, never counts. Where one
 *   counts, `k` may be as low as `1 − min(strength, m)` (2.9's `g`).
 */
export function interiorBounds(face: ReliefScene, rect: Bounds): [number, number] {
  const m = face.interior.max, shapes = guardShapes(face);
  const a = (face.light.azimuth * Math.PI) / 180, e = (face.light.elevation * Math.PI) / 180;
  const lx = Math.sin(a) * Math.cos(e), ly = -Math.cos(a) * Math.cos(e), lz = Math.sin(e);
  let up = 0, down = 0, shadowed = false;
  shapes.forEach((shape, index) => {
    if (overlap(shape.box, rect, 1)) {
      let stackUp = Math.max(0, shape.offset), stackDown = Math.max(0, -shape.offset);
      // Inside the cover's interior (half a pixel clear of its edge) the entry's offset replaces what is beneath it.
      if (!within(shape, rect, 0.5)) for (let below = 0; below < index; below++) {
        const other = shapes[below]!;
        if (!overlap(other.box, shape.box, 1) || !overlap(other.box, rect, 1)) continue;
        stackUp += Math.max(0, other.offset); stackDown += Math.max(0, -other.offset);
      }
      up = Math.max(up, stackUp); down = Math.max(down, stackDown);
    }
    // Every caster, overlapping the rect or not: its shadow reaches past its own box.
    if (shadowed || shape.cast <= 0) return;
    // The shadow's region: the caster moved against the light by up to its cast height, grown by its softness.
    const ox = -(lx / lz) * shape.cast, oy = -(ly / lz) * shape.cast, grow = 1.5 * shape.cast + 1;
    const region = { x0: shape.box.x0 + Math.min(0, ox) - grow, y0: shape.box.y0 + Math.min(0, oy) - grow, x1: shape.box.x1 + Math.max(0, ox) + grow, y1: shape.box.y1 + Math.max(0, oy) + grow };
    for (let below = 0; below < index && !shadowed; below++) {
      const ground = intersect(intersect(rect, region) ?? { x0: 0, y0: 0, x1: 0, y1: 0 }, shapes[below]!.box);
      if (ground && !within(shape, ground, 1)) shadowed = true;
    }
  });
  const high = 1 + Math.min(m, up);
  const low = Math.max(1 - m, (1 - Math.min(m, down)) * (1 - (shadowed ? Math.min(face.shadow.strength, m) : 0)));
  return [low, high];
}

/**
 * The scale of each object's face shadow inside each guarded area (a protected rect or an extent cell): the `n` objects
 * whose shadows reach the area (its box grown by the feather) may darken it together by at most its shadow cap, so each
 * one's shadow is scaled to `1 − (1 − cap)^(1 / n)` of the shadow strength (2.9's `g`: the profile stays soft). `reaches`
 * holds each object's shadow reach as left, top, right, bottom (layer px; right ≤ left when it casts nothing).
 */
export function shadowScales(areas: readonly ({ rect: Bounds } & GuardCaps)[], reaches: ArrayLike<number>, objects: number, feather: number, strength: number): number[] {
  return areas.map(({ rect, shadow }) => {
    let count = 0;
    for (let index = 0; index < objects; index++) {
      const l = reaches[index * 4]!, t = reaches[index * 4 + 1]!, r = reaches[index * 4 + 2]!, b = reaches[index * 4 + 3]!;
      if (r > l && l <= rect.x1 + feather && r >= rect.x0 - feather && t <= rect.y1 + feather && b >= rect.y0 - feather) count++;
    }
    const each = count > 1 ? 1 - (1 - shadow) ** (1 / count) : shadow;
    return strength > each ? each / strength : 1;
  });
}

/** Rects of lower layers' text under a layer's outset (layer px), where the layer adds no light: their own layer guards them. */
export interface BeneathRects { rects: Bounds[]; overflow: boolean }
/**
 * Packs the emitter block at `offset` (in floats) of `out`: the drawn emitters (at full strength: the face pool scales by
 * the layer's opacity itself), their tiles over `rect` (the draw rectangle), the guard, `beneath` (lower layers' text
 * under the outset, cap 0, or the whole outset when they overflow the block) and the feather, with `m` the scene's
 * `interior.max` and `extent` the layer's box.
 */
export function packEmitters(out: Float32Array, offset: number, light: LayerEmitters, guard: Guard, beneath: BeneathRects, rect: Bounds, extent: { width: number; height: number }, feather: number, m: number): { beneath: number; merged: boolean; overflow: boolean } {
  out.fill(0, offset, offset + EMITTER_BLOCK_VEC4S * 4);
  const drawn = light.drawn;
  const own = guard.rects.slice(0, BLOCK_RECTS), room = BLOCK_RECTS - own.length;
  // Lower layers' text that does not fit is merged into its bounding box (no light there, and only there); with no room
  // at all, the whole outset gets no light. Either is reported (`state().emitters.layers[].beneath`).
  let lower = beneath.rects;
  const merged = lower.length > room && room > 0;
  if (merged) lower = [{ x0: Math.min(...lower.map(box => box.x0)), y0: Math.min(...lower.map(box => box.y0)), x1: Math.max(...lower.map(box => box.x1)), y1: Math.max(...lower.map(box => box.y1)) }];
  const overflow = beneath.overflow || lower.length > room;
  if (overflow) lower = [];
  out.set([drawn.length, feather, own.length + lower.length, m], offset);
  out.set([rect.x0, rect.y0, Math.max(1e-6, rect.x1 - rect.x0) / EMITTER_TILES.x, Math.max(1e-6, rect.y1 - rect.y0) / EMITTER_TILES.y], offset + EMITTER_GRID * 4);
  // The extent guard: on, the extent, and whether the whole outset is protected (lower layers' text overflowed).
  out.set([guard.extent ? 1 : 0, extent.width, extent.height, overflow ? 1 : 0], offset + EMITTER_EXTENT * 4);
  own.forEach(({ rect: box, light: cap, shadow }, index) => {
    out.set([box.x0, box.y0, box.x1, box.y1], offset + (EMITTER_RECTS + index) * 4);
    out.set([cap, shadow, 0, 0], offset + (EMITTER_CAPS + index) * 4);
  });
  lower.forEach((box, index) => out.set([box.x0, box.y0, box.x1, box.y1], offset + (EMITTER_RECTS + own.length + index) * 4));
  drawn.forEach(({ emitter }, index) => {
    const [x, y, z] = emitter.position, [r, g, b] = emitter.colour, strength = emitter.strength;
    out.set([x, y, z, emitter.reach === "layer" ? -emitter.radius : emitter.radius, r * strength, g * strength, b * strength, emitter.face ?? 1], offset + (EMITTER_LIGHTS + 2 * index) * 4);
  });
  if (drawn.length) out.set(tileMasks(drawn, rect), offset + EMITTER_TILE_BASE * 4);
  guard.cells?.forEach(({ light: cap, shadow }, index) => out.set([cap, shadow, 0, 0], offset + (EMITTER_CELLS + index) * 4));
  return { beneath: beneath.rects.length, merged, overflow };
}

/**
 * The face pool pass's header, in vec4s: the frame, its draw bounds, the inverse matrix rows, the draw rectangle, the
 * capture grid and the layer's extent.
 */
export const POOL_HEADER_VEC4S = 8;
/** vec4s in the face pool pass's binding: the header and the emitter block. */
export const POOL_VEC4S = POOL_HEADER_VEC4S + EMITTER_BLOCK_VEC4S;
/** `dst · src + dst`: what is on the canvas is multiplied by `1 + E` (I0.3); alpha is kept. */
export const poolBlend: GPUBlendState = {
  color: { srcFactor: "dst", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
};
/**
 * Writes the face pool's header at the start of `out`: `dpr`, the frame size and the layer's opacity; the canvas-space
 * bounds it draws (CSS px); the rows of the inverse matrix (canvas to layer px, a homography); the draw rectangle; the
 * capture grid (texels per CSS px, captured texels), for `reach: "layer"` emitters; the layer's extent.
 */
export function packPoolHeader(out: Float32Array, header: { dpr: number; frame: { width: number; height: number }; opacity: number;
  bounds: [number, number, number, number]; rows: [number[], number[], number[]]; draw: Bounds; grid: [number, number, number, number]; extent: { width: number; height: number } }) {
  out.set([header.dpr, header.frame.width, header.frame.height, header.opacity, ...header.bounds,
    ...header.rows[0].slice(0, 3), 0, ...header.rows[1].slice(0, 3), 0, ...header.rows[2].slice(0, 3), 0,
    header.draw.x0, header.draw.y0, header.draw.x1, header.draw.y1, ...header.grid, header.extent.width, header.extent.height, 0, 0], 0);
}
/**
 * The face pool pass (`docs/ui-library/instrument-phase2.md`, item 2): one triangle over the layer's canvas-space draw
 * bounds; each pixel is mapped to layer px, and inside the draw rectangle the canvas is multiplied by `1 + E`, the sum of
 * the emitters of its tile on the face (2D.4) times their `face` share, a `reach: "layer"` emitter times the layer's
 * captured alpha, then capped per protected rect (the guard). In the outset the light eases out over the outer half of
 * its width, so a lamp whose reach passes the outset leaves no edge on what lies beneath.
 */
export const poolWGSL = {
  vertex: /* wgsl */ `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
// The pool binding is declared with the fragment stage (Lite builds one module from both).
@vertex fn effectFullscreenVertex(@builtin(vertex_index) vertex: u32) -> EffectVertexOutput {
  let bounds = pool[1];
  let size = max(pool[0].yz, vec2f(1.0));
  let corner = vec2f(f32(vertex == 1u), f32(vertex == 2u)) * 2.0;
  let at = bounds.xy + corner * (bounds.zw - bounds.xy);
  var output: EffectVertexOutput;
  output.position = vec4f(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
  output.uv = corner;
  return output;
}`,
  fragment: /* wgsl */ `@group(0) @binding(0) var<uniform> pool: array<vec4f, ${POOL_VEC4S}>;
@group(0) @binding(1) var capture: texture_2d<f32>;
${emitterWGSL("pool", POOL_HEADER_VEC4S)}
// The layer's captured alpha at p (layer px), bilinear between texel centres, as the layer pass samples it; 0 outside the
// layer's box (the outset holds no content).
fn poolAlpha(p: vec2f) -> f32 {
  if (any(p < vec2f(0.0)) || any(p > pool[7].xy)) { return 0.0; }
  let grid = pool[6];
  let texel = clamp(p * grid.xy, vec2f(0.5), max(grid.zw - vec2f(0.5), vec2f(0.5))) - vec2f(0.5);
  let base = floor(texel);
  let w = texel - base;
  let last = vec2i(textureDimensions(capture)) - vec2i(1);
  let at = vec2i(base);
  let a = textureLoad(capture, clamp(at, vec2i(0), last), 0).a;
  let b = textureLoad(capture, clamp(at + vec2i(1, 0), vec2i(0), last), 0).a;
  let c = textureLoad(capture, clamp(at + vec2i(0, 1), vec2i(0), last), 0).a;
  let d = textureLoad(capture, clamp(at + vec2i(1, 1), vec2i(0), last), 0).a;
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
  let q = vec3f(input.position.xy / pool[0].x, 1.0);
  let p = vec2f(dot(pool[2].xyz, q), dot(pool[3].xyz, q)) / dot(pool[4].xyz, q);
  let draw = pool[5];
  if (any(p < draw.xy) || any(p > draw.zw)) { discard; }
  let header = lampData(0u);
  let masks = lampTile(p);
  let x = vec3f(p, 0.0);
  var e = vec3f(0.0);
  var alpha = -1.0;
  for (var w = 0u; w < 4u; w++) {
    var mask = masks[w];
    while (mask != 0u) {
      let bit = firstTrailingBit(mask);
      mask = mask ^ (1u << bit);
      let j = w * 16u + bit;
      var light = lampLight(j, x, vec3f(0.0, 0.0, 1.0)) * lampData(${EMITTER_LIGHTS + 1}u + 2u * j).w;
      if (lampData(${EMITTER_LIGHTS}u + 2u * j).w < 0.0) {
        if (alpha < 0.0) { alpha = poolAlpha(p); }
        light *= alpha;
      }
      e += light;
    }
  }
  if (all(e <= vec3f(0.0))) { discard; }
  // Past the layer's box, the light eases out over the outer half of the outset on that side.
  let extent = pool[7].xy;
  let beyond = max(max(-p, p - extent), vec2f(0.0));
  let room = max(select(-draw.xy, draw.zw - extent, p > extent * 0.5), vec2f(1e-3));
  e *= (1.0 - smoothstep(0.5, 1.0, beyond.x / room.x)) * (1.0 - smoothstep(0.5, 1.0, beyond.y / room.y));
  // Lower layers' text overflowed the block: no light past the box at all.
  if (lampData(${EMITTER_EXTENT}u).w > 0.5 && any(beyond > vec2f(0.0))) { discard; }
  // The guard, easing off over the feather: a protected box caps the light by the cap of p's cell; a protected rect by
  // its own cap (0 for a lower layer's text under the outset).
  let extentWeight = lampExtentWeight(p);
  if (extentWeight > 0.0) { e = mix(e, min(e, vec3f(lampCell(p).x)), extentWeight); }
  for (var k = 0u; k < u32(header.z); k++) {
    let weight = lampWeight(p, k, header.y);
    if (weight > 0.0) { e = mix(e, min(e, vec3f(lampData(${EMITTER_CAPS}u + k).x)), weight); }
  }
  // A fading layer's lamps fade with it.
  return vec4f(e * pool[0].w, 1.0);
}`,
};

/**
 * WGSL helpers over an emitter block stored in `array` from vec4 `base` (`lampData`, `lampBox`, `lampWeight`,
 * `lampProtect`, `lampTile`, `lampLight`), shared by the face pool and the relief shading.
 */
export function emitterWGSL(array: string, base: number) {
  return /* wgsl */ `
fn lampData(i: u32) -> vec4f { return ${array}[${base}u + i]; }
// Signed distance to a box given by its corners.
fn lampBox(p: vec2f, rect: vec4f) -> f32 {
  let half = (rect.zw - rect.xy) * 0.5;
  let q = abs(p - (rect.xy + half)) - half;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
}
// The guard's weight of a protected rect: 1 inside, easing to 0 over the feather outside it.
fn lampWeight(p: vec2f, k: u32, feather: f32) -> f32 {
  let t = clamp(lampBox(p, lampData(${EMITTER_RECTS}u + k)) / max(feather, 1e-6), 0.0, 1.0);
  return 1.0 - t * t * (3.0 - 2.0 * t);
}
// The guard's weight of a protected box (the extent guard): 1 inside the layer's box, easing to 0 over the feather.
fn lampExtentWeight(p: vec2f) -> f32 {
  let extent = lampData(${EMITTER_EXTENT}u);
  if (extent.x < 0.5) { return 0.0; }
  let t = clamp(lampBox(p, vec4f(0.0, 0.0, extent.yz)) / max(lampData(0u).y, 1e-6), 0.0, 1.0);
  return 1.0 - t * t * (3.0 - 2.0 * t);
}
// The caps of the extent guard's cell at p (light, shadow).
fn lampCell(p: vec2f) -> vec4f {
  let size = max(lampData(${EMITTER_EXTENT}u).yz / vec2f(${GUARD_CELLS.x}.0, ${GUARD_CELLS.y}.0), vec2f(1e-6));
  let cell = clamp(vec2i(floor(p / size)), vec2i(0), vec2i(${GUARD_CELLS.x - 1}, ${GUARD_CELLS.y - 1}));
  return lampData(${EMITTER_CELLS}u + u32(cell.y) * ${GUARD_CELLS.x}u + u32(cell.x));
}
// How much any protected rect or a protected box holds p: 0 clear of them all, 1 inside one.
fn lampProtect(p: vec2f) -> f32 {
  let header = lampData(0u);
  var protect = lampExtentWeight(p);
  for (var k = 0u; k < u32(header.z); k++) { protect = max(protect, lampWeight(p, k, header.y)); }
  return protect;
}
// The four 16-bit masks of the emitters whose reach meets p's tile.
fn lampTile(p: vec2f) -> vec4u {
  let grid = lampData(${EMITTER_GRID}u);
  let cell = clamp(vec2i(floor((p - grid.xy) / max(grid.zw, vec2f(1e-6)))), vec2i(0), vec2i(${EMITTER_TILES.x - 1}, ${EMITTER_TILES.y - 1}));
  return vec4u(lampData(${EMITTER_TILE_BASE}u + u32(cell.y) * ${EMITTER_TILES.x}u + u32(cell.x)));
}
// Emitter j's irradiance at x with unit normal n (2D.4), at full strength: I · colour · max(n · l, 0) / (π d²), windowed
// to 0 at the radius (Lite's clustered falloff).
fn lampLight(j: u32, x: vec3f, n: vec3f) -> vec3f {
  let a = lampData(${EMITTER_LIGHTS}u + 2u * j);
  let d = a.xyz - x;
  let d2 = max(dot(d, d), 1e-6);
  let range2 = a.w * a.w;
  if (d2 >= range2) { return vec3f(0.0); }
  let f = d2 / range2;
  let window = (1.0 - f * f) * (1.0 - f * f);
  return lampData(${EMITTER_LIGHTS + 1}u + 2u * j).rgb * (max(dot(n, d), 0.0) / sqrt(d2) * window / (3.141592653589793 * d2));
}`;
}
