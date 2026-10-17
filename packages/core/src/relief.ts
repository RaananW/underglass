/**
 * The built-in `relief` and `objects` materials: core's implementation of the Strata Rendering Model, versions 1
 * (Relief) and 2 (Objects) (`docs/ui-library/rendering-model.md`). It takes the model's scene format as data, packs it
 * into a second uniform binding of the layer pass (`reliefUniforms`) and shades it in WGSL (`reliefWGSL`), mirroring
 * the reference implementation in `@underglass/ui/tokens` section by section. Core never depends on Strata: the scene
 * format is the contract, and the conformance suites judge this file.
 *
 * Stage scenes (part 2C, the `stage` material, `stage.ts`) and environment maps (2C.4) share the binding too.
 *
 * Objects (part 2B) are entries of the same back-to-front list as relief primitives, in the same binding: solids are
 * shaded in screen space (their caps and sides are screen-locked), domes are ray-cast analytically. Objects never take
 * hits; one that would draw outside its control (2B.6) is packed as its Relief equivalent and reported by
 * `reliefDegraded`.
 *
 * Per-primitive values that do not depend on the pixel (section 2.3: band width, cast height, slope, profile) are
 * derived here on the CPU, so the shader only evaluates what changes per point.
 */

import { STAGE_VEC4S, stageUniforms, stageWGSL, type StageScene } from "./stage.js";
import { EMITTER_BLOCK_VEC4S, emitterWGSL, EMITTER_LIGHTS, validateLight, type ProtectedRects, type SceneEmitter } from "./emitters.js";

/** Relief primitives one layer may carry (P0.3 budget). */
export const RELIEF_PRIMITIVES = 256;
/**
 * The largest shadow outset per side, in CSS px. It covers the tallest elevation in the design language (a modal at
 * 100% depth casts about 70 px) and bounds the extra pixels a layer may shade.
 */
export const RELIEF_OUTSET = 128;
/** Distinct materials one relief scene may name. */
export const RELIEF_MATERIALS = 16;
const HEADER_VEC4S = 6;
const MATERIAL_VEC4S = 2;
const PRIMITIVE_VEC4S = 6;
/** An environment map's brightness grid (rendering model 2C.4): 32 × 16 values, four to a vec4. */
const MAP_COLUMNS = 32, MAP_ROWS = 16, MAP_VEC4S = (MAP_COLUMNS * MAP_ROWS) / 4;
const mapBase = HEADER_VEC4S + RELIEF_MATERIALS * MATERIAL_VEC4S + RELIEF_PRIMITIVES * PRIMITIVE_VEC4S;
/**
 * Where the emitter block starts in the relief binding (`emitters.ts`): the renderer writes it every frame for the
 * specular term; `reliefUniforms` leaves it empty (no emitters).
 */
export const RELIEF_EMITTER_BASE = mapBase + MAP_VEC4S;
/** vec4s in the relief binding: header, material table, primitives, environment map, emitters. A stage scene uses its start. */
export const RELIEF_VEC4S = Math.max(RELIEF_EMITTER_BASE + EMITTER_BLOCK_VEC4S, STAGE_VEC4S);

const faces = ["raised", "well", "groove", "knob", "mark", "ring", "flat"] as const;
const objects = ["key", "slab", "bezel", "well", "rail", "mark", "knob", "puck"] as const;
const domes: readonly string[] = ["knob", "puck"];
const profiles = ["quarter-round", "chamfer", "cove"] as const;

/** A material as numeric layers (rendering model, part 1). Colours come from the captured content. */
export interface ReliefMaterial {
  base?: { roughness?: number; metallic?: number };
  coat?: { strength?: number; roughness?: number; ior?: number };
  emissive?: { strength?: number };
  sheen?: { strength?: number; roughness?: number };
  iridescence?: { strength?: number; thickness?: number };
  transmission?: { strength?: number; ior?: number; frost?: number };
}
/** One relief primitive in layer-local CSS px (rendering model, part 1). */
export interface ReliefPrimitive {
  face: (typeof faces)[number];
  rect: [number, number, number, number];
  radius?: number;
  height: number;
  material: string;
  finish?: boolean;
  state?: { hover?: boolean; pressed?: boolean; focus?: boolean; disabled?: boolean };
  ring?: { thickness: number; start: number; sweep: number; colour: string };
}
/**
 * One object (rendering model 2B, version 2) in layer-local CSS px: a solid (`key`, `slab`, `bezel`, `well`, `rail`,
 * `mark`) or a dome (`knob`, `puck`) standing on its base, the native control's border box.
 */
export interface ReliefObject {
  object: (typeof objects)[number];
  rect: [number, number, number, number];
  radius?: number;
  height: number;
  base?: number;
  taper?: number;
  width?: number;
  travel?: number;
  material: string;
  colour?: string;
  finish?: boolean;
  bounds?: [number, number, number, number];
  state?: { hover?: boolean; pressed?: boolean; focus?: boolean; disabled?: boolean };
}
/**
 * A Strata scene: the input of the `relief` material (version 1) and the `objects` material (version 2, which adds the
 * camera, the environment and objects, or 3, which adds environment maps). Version 4 (`kind: "relief"`, the default)
 * adds `emitters`, `protected` and `feather` to either (Rendering Model 2D.4): without a camera it is a relief scene,
 * with one an objects scene. Core draws it over the layer's own box grown by `outset` (shadows and emitter light only;
 * hits stay on the box); `extent` and `backdrop` are informational here (the layer pass composites over what is
 * beneath it).
 */
export interface ReliefScene {
  format: "strata-scene";
  version: 1 | 2 | 3 | 4;
  /** Version 4 only: `"relief"`, the default (an Instrument scene is the `instrument` material's). */
  kind?: "relief";
  camera?: { distance: number; vanish: [number, number] };
  /** The studio (versions 2 and 3), or a 32 × 16 brightness map (version 3, rendering model 2C.4). */
  environment?: { source: "studio"; strength: number } | { source: "map"; strength: number; grid: number[] };
  extent: { width: number; height: number };
  outset?: { top: number; right: number; bottom: number; left: number };
  backdrop: string;
  light: { azimuth: number; elevation: number };
  bevel: { width: number; gain: number; profile: (typeof profiles)[number] };
  shadow: { strength: number };
  interior: { max: number };
  state: { hoverHeight: number; pressHeight: number; hoverLift: number; pressSink: number };
  focus: { colour: string; width: number; offset: number };
  materials: Record<string, ReliefMaterial>;
  primitives: (ReliefPrimitive | ReliefObject)[];
  /** Version 4: point lights (2D.4): up to 1,024 in the format, 64 drawn per layer. */
  emitters?: SceneEmitter[];
  /** Version 4: the layer's text runs, or `"extent"`: inside them the face's whole change stays within `interior.max`. */
  protected?: ProtectedRects;
  /** Version 4: px over which the guard eases off outside a protected rect, 0..16, default 4. */
  feather?: number;
}
const isObject = (entry: ReliefPrimitive | ReliefObject): entry is ReliefObject => "object" in entry;

const finite = (value: unknown, path: string, min = -Infinity, max = Infinity): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Relief scene ${path} requires a number in ${min}..${max}`);
  return value;
};
const colour = (value: unknown, path: string): string => {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Relief scene ${path} requires a #rrggbb colour`);
  return value;
};
const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Relief scene ${path} requires an object`);
  return value as Record<string, unknown>;
};
const optional = (value: unknown, path: string, min: number, max: number, fallback: number) => (value === undefined ? fallback : finite(value, path, min, max));

/**
 * Validates a scene for the `relief` material (`kind` relief: version 1, or 4 without a camera) or the `objects`
 * material (`kind` objects: version 2, 3 with an environment map, or 4 with a camera) and returns a deep, normalized
 * copy (defaults filled in). Version 4 adds `emitters`, `protected` and `feather` (Rendering Model 2D.4; earlier
 * versions refuse them). Throws on the first problem, naming its path, so an invalid scene changes nothing. Checks what
 * core relies on; the full format is `@underglass/ui/scene.schema.json`.
 */
export function validateReliefScene(input: ReliefScene, kind: "relief" | "objects" = "relief"): ReliefScene {
  const scene = object(input, "");
  const declared = scene.version as 1 | 2 | 3 | 4;
  if (declared === 4 && scene.kind !== undefined && scene.kind !== "relief") throw new Error('Relief scene kind requires "relief" (an Instrument scene is the instrument material\'s)');
  // A version 4 scene with a camera is at the Objects level; without one, at the Relief level.
  const objectsLevel = declared === 2 || declared === 3 || declared === 4 && scene.camera !== undefined;
  if (scene.format !== "strata-scene" || (kind === "relief" ? declared !== 1 && !(declared === 4 && !objectsLevel) : !objectsLevel)) {
    throw new Error(kind === "relief" ? "Relief material requires a version 1 strata-scene (or version 4 without a camera)" : "Objects material requires a version 2 or 3 strata-scene (or version 4 with a camera)");
  }
  // The rules of the level: version 4 follows version 1 (Relief) or 3 (Objects, environment maps allowed).
  const version = declared === 4 ? (objectsLevel ? 3 : 1) : declared;
  if (declared !== 4 && (scene.emitters !== undefined || scene.protected !== undefined || scene.feather !== undefined)) throw new Error("Relief scene emitters, protected and feather are only in version 4");
  const lights = declared === 4 ? validateLight(scene, "Relief scene") : {};
  const camera = version !== 1 ? object(scene.camera, "camera") : undefined;
  if (version === 1 && (scene.camera !== undefined || scene.environment !== undefined)) throw new Error("Relief scene camera and environment are only in versions 2 and 3 (or 4 with a camera)");
  if (camera && (!Array.isArray(camera.vanish) || camera.vanish.length !== 2)) throw new Error("Relief scene camera.vanish requires [x, y]");
  const environment = version !== 1 && scene.environment !== undefined ? object(scene.environment, "environment") : undefined;
  const map = environment?.source === "map" && version === 3;
  if (environment && !map && environment.source !== "studio") throw new Error(version === 3 ? 'Relief scene environment.source requires "studio" or "map"' : 'Relief scene environment.source requires "studio"');
  if (map && (!Array.isArray(environment!.grid) || environment!.grid.length !== MAP_COLUMNS * MAP_ROWS)) throw new Error(`Relief scene environment.grid requires ${MAP_COLUMNS * MAP_ROWS} numbers`);
  const extent = object(scene.extent, "extent"), light = object(scene.light, "light"), bevel = object(scene.bevel, "bevel");
  const state = object(scene.state, "state"), focus = object(scene.focus, "focus");
  if (!profiles.includes(bevel.profile as (typeof profiles)[number])) throw new Error(`Relief scene bevel.profile requires one of ${profiles.join(", ")}`);
  const materials = object(scene.materials, "materials");
  const names = Object.keys(materials);
  if (names.length > RELIEF_MATERIALS) throw new Error(`Relief scene holds more than ${RELIEF_MATERIALS} materials`);
  if (!Array.isArray(scene.primitives) || scene.primitives.length > RELIEF_PRIMITIVES) throw new Error(`Relief scene primitives requires an array of at most ${RELIEF_PRIMITIVES}`);
  const outset = scene.outset === undefined ? undefined : object(scene.outset, "outset");
  return {
    format: "strata-scene", version: declared, ...(declared === 4 ? { kind: "relief" as const } : {}),
    ...(camera ? { camera: { distance: finite(camera.distance, "camera.distance", 100, 1e6),
      vanish: (camera.vanish as unknown[]).map((part, index) => finite(part, `camera.vanish[${index}]`, -1e6, 1e6)) as [number, number] },
      environment: map
        ? { source: "map" as const, strength: finite(environment!.strength, "environment.strength", 0, 1),
          grid: (environment!.grid as unknown[]).map((cell, index) => finite(cell, `environment.grid[${index}]`, 0, 4)) }
        : { source: "studio" as const, strength: environment ? finite(environment.strength, "environment.strength", 0, 1) : 0.6 } } : {}),
    extent: { width: finite(extent.width, "extent.width", 0), height: finite(extent.height, "extent.height", 0) },
    ...(outset ? { outset: { top: finite(outset.top, "outset.top", 0, RELIEF_OUTSET), right: finite(outset.right, "outset.right", 0, RELIEF_OUTSET),
      bottom: finite(outset.bottom, "outset.bottom", 0, RELIEF_OUTSET), left: finite(outset.left, "outset.left", 0, RELIEF_OUTSET) } } : {}),
    backdrop: colour(scene.backdrop, "backdrop"),
    light: { azimuth: finite(light.azimuth, "light.azimuth", 0, 360), elevation: finite(light.elevation, "light.elevation", 1, 90) },
    bevel: { width: finite(bevel.width, "bevel.width", 0), gain: finite(bevel.gain, "bevel.gain", 0), profile: bevel.profile as (typeof profiles)[number] },
    shadow: { strength: finite(object(scene.shadow, "shadow").strength, "shadow.strength", 0, 1) },
    interior: { max: finite(object(scene.interior, "interior").max, "interior.max", 0, 0.1) },
    state: { hoverHeight: finite(state.hoverHeight, "state.hoverHeight", 0), pressHeight: finite(state.pressHeight, "state.pressHeight", 0),
      hoverLift: finite(state.hoverLift, "state.hoverLift", 0, 0.1), pressSink: finite(state.pressSink, "state.pressSink", 0, 0.1) },
    focus: { colour: colour(focus.colour, "focus.colour"), width: finite(focus.width, "focus.width", 0), offset: finite(focus.offset, "focus.offset", 0) },
    materials: Object.fromEntries(names.map(name => {
      const material = object(materials[name], `materials.${name}`);
      const layer = (key: string) => (material[key] === undefined ? undefined : object(material[key], `materials.${name}.${key}`));
      const base = layer("base"), coat = layer("coat"), emissive = layer("emissive");
      return [name, {
        base: { roughness: optional(base?.roughness, `materials.${name}.base.roughness`, 0, 1, 1), metallic: optional(base?.metallic, `materials.${name}.base.metallic`, 0, 1, 0) },
        coat: { strength: optional(coat?.strength, `materials.${name}.coat.strength`, 0, 1, 0), roughness: optional(coat?.roughness, `materials.${name}.coat.roughness`, 0, 1, 0), ior: optional(coat?.ior, `materials.${name}.coat.ior`, 1, 3, 1.5) },
        emissive: { strength: optional(emissive?.strength, `materials.${name}.emissive.strength`, 0, 4, 0) },
      } satisfies ReliefMaterial];
    })),
    primitives: (scene.primitives as unknown[]).map((value, index): ReliefPrimitive | ReliefObject => {
      const at = `primitives[${index}]`, primitive = object(value, at);
      if ("object" in primitive) {
        if (version === 1) throw new Error(`Relief scene ${at}.object requires a version 2 or 3 scene (or 4 with a camera: the objects material)`);
        return validateObject(primitive, at, names);
      }
      if (!faces.includes(primitive.face as (typeof faces)[number])) throw new Error(`Relief scene ${at}.face requires one of ${faces.join(", ")}`);
      if (!Array.isArray(primitive.rect) || primitive.rect.length !== 4) throw new Error(`Relief scene ${at}.rect requires [x, y, width, height]`);
      if (typeof primitive.material !== "string" || !names.includes(primitive.material)) throw new Error(`Relief scene ${at}.material requires one of the scene's materials`);
      const flags = primitive.state === undefined ? {} : object(primitive.state, `${at}.state`);
      const flag = (key: string) => { const v = flags[key]; if (v !== undefined && typeof v !== "boolean") throw new Error(`Relief scene ${at}.state.${key} requires a boolean`); return v === true; };
      const ring = primitive.face === "ring" ? object(primitive.ring, `${at}.ring`) : undefined;
      if (primitive.face !== "ring" && primitive.ring !== undefined) throw new Error(`Relief scene ${at}.ring is only for the ring face`);
      return {
        face: primitive.face as (typeof faces)[number],
        rect: primitive.rect.map((part, i) => finite(part, `${at}.rect[${i}]`, i < 2 ? -1e6 : 0, 1e6)) as [number, number, number, number],
        radius: optional(primitive.radius, `${at}.radius`, 0, 1e6, 0),
        height: finite(primitive.height, `${at}.height`, 0),
        material: primitive.material,
        finish: primitive.finish === undefined ? false : primitive.finish === true,
        state: { hover: flag("hover"), pressed: flag("pressed"), focus: flag("focus"), disabled: flag("disabled") },
        ...(ring ? { ring: { thickness: finite(ring.thickness, `${at}.ring.thickness`, 0), start: finite(ring.start, `${at}.ring.start`, -360, 360),
          sweep: finite(ring.sweep, `${at}.ring.sweep`, 0, 360), colour: colour(ring.colour, `${at}.ring.colour`) } } : {}),
      };
    }),
    ...lights,
  };
}

/** Validates one object (rendering model 2B.1) and returns it with its defaults. */
function validateObject(value: Record<string, unknown>, at: string, names: string[]): ReliefObject {
  const kind = value.object as ReliefObject["object"];
  if (!objects.includes(kind)) throw new Error(`Relief scene ${at}.object requires one of ${objects.join(", ")}`);
  const dome = domes.includes(kind);
  const box = (part: unknown, path: string) => {
    if (!Array.isArray(part) || part.length !== 4) throw new Error(`Relief scene ${path} requires [x, y, width, height]`);
    return part.map((n, i) => finite(n, `${path}[${i}]`, i < 2 ? -1e6 : 0, 1e6)) as [number, number, number, number];
  };
  if (typeof value.material !== "string" || !names.includes(value.material)) throw new Error(`Relief scene ${at}.material requires one of the scene's materials`);
  if (dome && (value.taper !== undefined || value.width !== undefined || value.travel !== undefined)) throw new Error(`Relief scene ${at} taper, width and travel are only for solids`);
  if (kind === "bezel" && value.width === undefined) throw new Error(`Relief scene ${at}.width is required for a bezel`);
  if (kind !== "bezel" && value.width !== undefined) throw new Error(`Relief scene ${at}.width is only for a bezel`);
  if (value.travel !== undefined && kind !== "key" && kind !== "mark") throw new Error(`Relief scene ${at}.travel is only for keys and marks`);
  if (!dome && value.colour !== undefined) throw new Error(`Relief scene ${at}.colour is only for domes`);
  const flags = value.state === undefined ? {} : object(value.state, `${at}.state`);
  const flag = (key: string) => { const v = flags[key]; if (v !== undefined && typeof v !== "boolean") throw new Error(`Relief scene ${at}.state.${key} requires a boolean`); return v === true; };
  const rect = box(value.rect, `${at}.rect`);
  return {
    object: kind, rect,
    radius: optional(value.radius, `${at}.radius`, 0, 1e6, 0),
    height: finite(value.height, `${at}.height`, 0, 1e6),
    base: optional(value.base, `${at}.base`, -1e6, 1e6, 0),
    ...(dome ? { colour: colour(value.colour, `${at}.colour`) } : { taper: optional(value.taper, `${at}.taper`, 0, 1e6, 0) }),
    ...(kind === "bezel" ? { width: finite(value.width, `${at}.width`, 0, 1e6) } : {}),
    ...(kind === "key" || kind === "mark" ? { travel: optional(value.travel, `${at}.travel`, 0, 1e6, 0) } : {}),
    material: value.material,
    finish: value.finish === true,
    bounds: value.bounds === undefined ? rect : box(value.bounds, `${at}.bounds`),
    state: { hover: flag("hover"), pressed: flag("pressed"), focus: flag("focus"), disabled: flag("disabled") },
  };
}

/** An object's heights (2B.2): the base, and the cap (a well's floor, a pressed key's sunk cap) or a dome's apex. */
/** 2B.2: an object's base and cap heights in its state, or at the highest it reaches (hovered, not pressed). */
function heights(entry: ReliefObject, highest = false): [number, number] {
  const z0 = entry.base ?? 0;
  if (entry.object === "well") return [z0, z0 - entry.height];
  const state = highest ? { hover: true } : entry.state ?? {};
  const travel = (entry.object === "key" || entry.object === "mark") && state.pressed ? Math.min(entry.travel ?? 0, entry.height) : 0;
  // Hover raises the cap by a quarter of the object's height.
  const rise = state.hover && !state.disabled ? entry.height / 4 : 0;
  return [z0, z0 + entry.height + rise - travel];
}
/**
 * Hit safety (2B.6): why an object cannot be drawn as an object, or undefined when it can. A solid's taper must cover
 * the drift at its base corner farthest from the vanishing point; a dome's projected bounding box must stay inside its
 * bounds. The highest geometry (hovered) is checked, so hover never changes how an object is drawn.
 */
function unsafe(scene: ReliefScene, entry: ReliefObject): string | undefined {
  const { distance, vanish: [vx, vy] } = scene.camera!;
  const [z0, z1] = heights(entry, true);
  const [x, y, width, height] = entry.rect;
  if (!domes.includes(entry.object)) {
    const reach = Math.max(...[[x, y], [x + width, y], [x, y + height], [x + width, y + height]].map(([px, py]) => Math.hypot(px! - vx, py! - vy)));
    return Math.abs(z1 - z0) === 0 || (entry.taper ?? 0) * (distance - Math.max(z0, z1)) >= Math.abs(z1 - z0) * reach ? undefined
      : "its taper is less than its perspective drift";
  }
  if (distance - z1 <= 0) return "its apex is behind the camera";
  const [bx, by, bw, bh] = entry.bounds ?? entry.rect;
  for (const z of [z0, z1]) for (const px of [x, x + width]) for (const py of [y, y + height]) {
    const scale = distance / (distance - z), sx = vx + (px - vx) * scale, sy = vy + (py - vy) * scale;
    if (sx < bx - 1e-6 || sy < by - 1e-6 || sx > bx + bw + 1e-6 || sy > by + bh + 1e-6) return "its projection leaves its bounds";
  }
  return undefined;
}
/** 2B.6: the Relief equivalent of an object that cannot be drawn as one (a bezel has none). */
function equivalent(entry: ReliefObject): ReliefPrimitive | undefined {
  const common = { rect: entry.rect, radius: entry.radius ?? 0, height: entry.height, material: entry.material, finish: false, state: entry.state ?? {} };
  switch (entry.object) {
    case "bezel": return undefined;
    case "well": return { ...common, face: "well" };
    case "knob": case "puck": return { ...common, face: "knob" };
    case "mark": return { ...common, face: "mark" };
    default: return { ...common, face: "raised", finish: entry.finish === true };
  }
}
/**
 * The objects of a validated version 2 scene that are drawn at the Relief level instead (rendering model 2B.6), with
 * why. Empty for version 1 scenes and for scenes whose objects are all safe.
 */
export function reliefDegraded(scene: ReliefScene): { index: number; object: string; reason: string }[] {
  if (scene.version === 1 || !scene.camera) return [];
  return scene.primitives.flatMap((entry, index) => {
    if (!isObject(entry)) return [];
    const reason = unsafe(scene, entry);
    return reason ? [{ index, object: entry.object, reason }] : [];
  });
}

const rgb = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
const packed = new WeakMap<ReliefScene | StageScene, Float32Array>();
/**
 * Packs a validated scene into the relief binding: a header (light vector, bevel, shadow, interior budget, state
 * multipliers, focus edge, counts, camera and environment), the material table, and each entry with its derived
 * values: a relief primitive, an object, or an object's Relief equivalent. Cached per scene object, so an unchanged
 * scene is packed once.
 */
export function reliefUniforms(scene: ReliefScene | StageScene): Float32Array {
  const cached = packed.get(scene);
  if (cached) return cached;
  if (scene.format === "strata-stage") {
    const stage = stageUniforms(scene, RELIEF_VEC4S * 4);
    packed.set(scene, stage);
    return stage;
  }
  const values = new Float32Array(RELIEF_VEC4S * 4);
  const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
  const names = Object.keys(scene.materials);
  values.set([Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e), scene.bevel.width,
    scene.bevel.gain, profiles.indexOf(scene.bevel.profile), scene.shadow.strength, scene.interior.max,
    scene.state.hoverHeight, scene.state.pressHeight, scene.state.hoverLift, scene.state.pressSink,
    ...rgb(scene.focus.colour), scene.focus.width,
    // vec4 4.w: 0 for the studio, 2 when an environment map is packed after the primitives (1 marks a stage scene).
    scene.focus.offset, scene.primitives.length, names.length, scene.environment?.source === "map" ? 2 : 0,
    scene.camera?.distance ?? 1600, ...(scene.camera?.vanish ?? [0, 0]), scene.environment?.strength ?? 0], 0);
  if (scene.environment?.source === "map") values.set(scene.environment.grid, mapBase * 4);
  names.forEach((name, index) => {
    const material = scene.materials[name]!;
    values.set([material.base?.roughness ?? 1, material.base?.metallic ?? 0, material.coat?.strength ?? 0, material.coat?.roughness ?? 0,
      (material.emissive?.strength ?? 0) > 0 ? 1 : 0, 0, 0, 0], (HEADER_VEC4S + index * MATERIAL_VEC4S) * 4);
  });
  scene.primitives.forEach((entry, index) => {
    const at = (HEADER_VEC4S + RELIEF_MATERIALS * MATERIAL_VEC4S + index * PRIMITIVE_VEC4S) * 4;
    let primitive: ReliefPrimitive;
    let surface: string | undefined;
    if (isObject(entry)) {
      if (!unsafe(scene, entry)) { values.set(packObject(scene, entry, names), at); return; }
      // 2B.6: drawn at the Relief level; a dome keeps its colour on its footprint, and a bezel is not drawn.
      const fallback = equivalent(entry);
      if (!fallback) { values.set([0, 0, 0, 0, 0, 0, 0, 6], at); return; }
      primitive = fallback;
      surface = entry.colour;
    } else primitive = entry;
    const [x, y, width, height] = primitive.rect;
    const state = primitive.state ?? {};
    const material = scene.materials[primitive.material] ?? {};
    const inradius = Math.min(width, height) / 2;
    const knob = primitive.face === "knob", ring = primitive.face === "ring";
    // 2.3: lit unless flat, disabled or emissive; the band; the cast height after the state multipliers.
    const lit = !state.disabled && (material.emissive?.strength ?? 0) <= 0 && primitive.face !== "flat";
    const band = !lit ? 0 : knob ? inradius : Math.min(scene.bevel.width, ring ? (primitive.ring?.thickness ?? 0) / 2 : inradius);
    const lifted = primitive.face === "raised" || knob || primitive.face === "mark";
    const cast = lifted && !state.disabled ? primitive.height * (1 + (scene.state.hoverHeight - 1) * (state.hover ? 1 : 0)) * (1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0)) : 0;
    const sunk = primitive.face === "well" || primitive.face === "groove" || ring;
    // 2.4: a band narrower than the bevel is a shallower bevel; its slope scales by band / bevel.width (packed with the sign).
    const steep = knob || band <= 0 || scene.bevel.width <= 0 ? 1 : Math.min(1, band / scene.bevel.width);
    values.set([
      x, y, width, height,
      knob ? inradius : Math.min(Math.max(primitive.radius ?? 0, 0), inradius), band, cast, faces.indexOf(primitive.face),
      state.hover ? 1 : 0, state.pressed ? 1 : 0, state.focus && !state.disabled ? 1 : 0, state.disabled ? 1 : 0,
      primitive.finish && lit ? 1 : 0, primitive.ring?.thickness ?? 0, primitive.ring?.start ?? 0, primitive.ring?.sweep ?? 0,
      ...(primitive.ring ? rgb(primitive.ring.colour) : surface ? rgb(surface) : [0, 0, 0]), names.indexOf(primitive.material),
      knob ? 0 : profiles.indexOf(scene.bevel.profile), (sunk ? -1 : 1) * steep, knob ? 1 : 0, ring && primitive.ring && !state.disabled ? 1 : surface ? 2 : 0,
    ], at);
  });
  packed.set(scene, values);
  return values;
}

/**
 * An object's six vec4s (2B.2): rect; radius, guard band, cast height and its code (7 solid, 8 bezel, 9 dome);
 * states; finish, bezel width, base and cap heights; a dome's colour and the material; lit, taper, and how far a
 * dome's drawing may reach past its footprint.
 */
function packObject(scene: ReliefScene, entry: ReliefObject, names: string[]): number[] {
  const [x, y, width, height] = entry.rect;
  const state = entry.state ?? {};
  const material = scene.materials[entry.material] ?? {};
  const inradius = Math.min(width, height) / 2;
  const dome = domes.includes(entry.object);
  const lit = !state.disabled && (material.emissive?.strength ?? 0) <= 0;
  const [z0, z1] = heights(entry);
  const travels = entry.object === "key" || entry.object === "mark";
  // 2B.2: the cast height is the cap's height, which hover already raises and a key's travel already lowers.
  const cast = z1 > z0 && !state.disabled ? (z1 - z0) * (travels ? 1 : 1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0)) : 0;
  let drift = 0;
  if (dome && scene.camera) {
    const { distance, vanish: [vx, vy] } = scene.camera, scale = distance / (distance - z1);
    for (const [px, py] of [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]) drift = Math.max(drift, Math.hypot((px! - vx) * (scale - 1), (py! - vy) * (scale - 1)));
  }
  return [
    x, y, width, height,
    dome ? inradius : Math.min(Math.max(entry.radius ?? 0, 0), inradius), !lit ? 0 : dome ? inradius : entry.taper ?? 0, cast, dome ? 9 : entry.object === "bezel" ? 8 : 7,
    state.hover ? 1 : 0, state.pressed ? 1 : 0, state.focus && !state.disabled ? 1 : 0, state.disabled ? 1 : 0,
    entry.finish && lit ? 1 : 0, entry.width ?? 0, z0, z1,
    ...(entry.colour ? rgb(entry.colour) : [0, 0, 0]), names.indexOf(entry.material),
    lit ? 1 : 0, entry.taper ?? 0, drift + 1, 0,
  ];
}

const primitiveBase = HEADER_VEC4S + RELIEF_MATERIALS * MATERIAL_VEC4S;
/**
 * WGSL for the relief binding (`@binding(3)`) and `reliefShade(p, captured)`, which returns the shaded colour as
 * straight RGB with alpha, ready for the layer pass to blend over what is beneath (rendering model 2.11). Section
 * numbers refer to the rendering model. Entries with code 7 and above are objects (part 2B).
 */
export const reliefWGSL = /* wgsl */ `
@group(0) @binding(3) var<uniform> relief: array<vec4f, ${RELIEF_VEC4S}>;
${stageWGSL}
${emitterWGSL("relief", RELIEF_EMITTER_BASE)}
// Emitter highlights (the specular term at Relief and Objects, docs/ui-library/instrument-phase2.md): each emitter's
// irradiance at full strength times the lobe of 2.5 for its own direction; a layer-reach emitter (the pointer light) only
// on the layer's own content. Zero when the scene has no emitters.
fn reliefLamp(p: vec2f, z: f32, n: vec3f, material: vec4f, alpha: f32) -> vec3f {
  if (lampData(0u).x < 0.5) { return vec3f(0.0); }
  let x = vec3f(p, z);
  let masks = lampTile(p);
  var sum = vec3f(0.0);
  for (var w = 0u; w < 4u; w++) {
    var mask = masks[w];
    while (mask != 0u) {
      let bit = firstTrailingBit(mask);
      mask = mask ^ (1u << bit);
      let j = w * 16u + bit;
      let irradiance = lampLight(j, x, n);
      if (all(irradiance <= vec3f(0.0))) { continue; }
      let a = lampData(${EMITTER_LIGHTS}u + 2u * j);
      let facing = max(dot(n, normalize(normalize(a.xyz - x) + vec3f(0.0, 0.0, 1.0))), 0.0);
      let lobe = pow(facing, mix(160.0, 6.0, material.x)) * (1.0 - material.x) * mix(0.35, 1.0, material.y) * 1.2
        + material.z * pow(facing, mix(90.0, 10.0, material.w)) * 0.9;
      sum += irradiance * lobe * select(1.0, alpha, a.w < 0.0);
    }
  }
  return sum;
}
fn reliefBox(p: vec2f, centre: vec2f, half: vec2f, radius: f32) -> f32 {
  let q = abs(p - centre) - half + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
// 2.2 and 2B.3: signed distance to entry i (a relief primitive's shape, or an object's footprint).
fn reliefDistance(p: vec2f, i: u32) -> f32 {
  let base = ${primitiveBase}u + i * ${PRIMITIVE_VEC4S}u;
  let rect = relief[base];
  let shape = relief[base + 1u];
  let half = rect.zw * 0.5;
  let centre = rect.xy + half;
  if (shape.w == 5.0) {
    let thickness = relief[base + 3u].y;
    return abs(length(p - centre) - (min(half.x, half.y) - thickness * 0.5)) - thickness * 0.5;
  }
  let d = reliefBox(p, centre, half, shape.x);
  if (shape.w == 8.0) {
    let width = relief[base + 3u].y;
    return abs(d + width * 0.5) - width * 0.5;
  }
  return d;
}
// The finish-zone profile (design language section 4): (brighten, darken) at \`along\`.
fn reliefFinish(along: f32, material: vec4f) -> vec2f {
  let rise = 0.008 + (0.05 - 0.008) * material.w;
  let band = material.z * 0.6 * smoothstep(0.03, 0.03 + rise, along) * (1.0 - smoothstep(0.15, 0.26, along));
  let horizon = material.z * 0.16 * smoothstep(0.24, 0.27, along) * (1.0 - smoothstep(0.28, 0.32, along));
  let sheen = max(0.0, 0.5 - material.x) * 0.8 * (1.0 - smoothstep(0.0, 0.27, along));
  let metalTop = material.y * 0.4 * (1.0 - smoothstep(0.05, 0.28, along));
  let metalBottom = material.y * 0.36 * smoothstep(0.72, 0.97, along);
  return vec2f(max(band, max(sheen, metalTop)), max(metalBottom, horizon));
}
// 2.5: the bevel light of a normal, shared by relief bevels and object sides and domes.
fn reliefLight(n: vec3f, material: vec4f) -> f32 {
  let light = relief[0].xyz;
  let halfway = normalize(light + vec3f(0.0, 0.0, 1.0));
  let facing = max(dot(n, halfway), 0.0);
  let lambert = dot(n, light) - light.z;
  let specular = pow(facing, mix(160.0, 6.0, material.x)) * (1.0 - material.x) * mix(0.35, 1.0, material.y);
  let rim = 1.0 - clamp(n.z, 0.0, 1.0);
  let fresnel = 0.04 + 0.96 * rim * rim * rim * rim * rim;
  let coat = material.z * (pow(facing, mix(90.0, 10.0, material.w)) * 0.9 + fresnel * 0.6);
  return lambert * relief[1].x * (1.0 + material.y) + specular * 1.2 + coat;
}
// 2B.7: the studio environment, relative to a flat face.
fn reliefStudio(z: f32) -> f32 { return mix(0.18, 0.92, smoothstep(-0.35, 0.65, z)); }
// 2C.4: an environment map's grid cell, wrapping columns and clamping rows.
fn reliefMapCell(column: i32, row: i32) -> f32 {
  let index = u32(clamp(row, 0, ${MAP_ROWS - 1}) * ${MAP_COLUMNS} + ((column % ${MAP_COLUMNS}) + ${MAP_COLUMNS}) % ${MAP_COLUMNS});
  return relief[${mapBase}u + index / 4u][index % 4u];
}
// 2C.4: the map's brightness in direction r, bilinear between cell centres.
fn reliefMap(r: vec3f) -> f32 {
  let u = (atan2(r.x, -r.y) / 6.283185307179586 + 0.5) * ${MAP_COLUMNS}.0 - 0.5;
  let v = clamp(acos(clamp(r.z, -1.0, 1.0)) / 3.141592653589793 * ${MAP_ROWS}.0 - 0.5, 0.0, ${MAP_ROWS - 1}.0);
  let column = i32(floor(u));
  let row = i32(floor(v));
  let f = vec2f(u - floor(u), v - floor(v));
  return mix(mix(reliefMapCell(column, row), reliefMapCell(column + 1, row), f.x), mix(reliefMapCell(column, row + 1), reliefMapCell(column + 1, row + 1), f.x), f.y);
}
fn reliefEnvironment(n: vec3f, material: vec4f) -> f32 {
  let weight = relief[5].w * mix(0.04, 1.0, material.y) * (1.0 - material.x);
  if (relief[4].w == 2.0) { return weight * (reliefMap(vec3f(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0)) - reliefMap(vec3f(0.0, 0.0, 1.0))); }
  return weight * (reliefStudio(2.0 * n.z * n.z - 1.0) - reliefStudio(1.0));
}
// 2B.4: a solid's side normal at p, from the screen-locked base and cap points across the band.
fn reliefSide(p: vec2f, i: u32, d: f32) -> vec3f {
  let base = ${primitiveBase}u + i * ${PRIMITIVE_VEC4S}u;
  let heights = relief[base + 3u];
  let taper = relief[base + 5u].y;
  let camera = relief[5];
  let e = 0.5;
  var g = vec2f(reliefDistance(p + vec2f(e, 0.0), i) - reliefDistance(p - vec2f(e, 0.0), i),
    reliefDistance(p + vec2f(0.0, e), i) - reliefDistance(p - vec2f(0.0, e), i));
  g = select(vec2f(0.0), g / length(g), length(g) > 1e-9);
  let b = p - d * g;
  let t = b - taper * g;
  let vanish = camera.yz;
  let delta = (vanish + (t - vanish) * ((camera.x - heights.w) / camera.x)) - (vanish + (b - vanish) * ((camera.x - heights.z) / camera.x));
  return normalize(vec3f((heights.w - heights.z) * g, -dot(g, delta)));
}
// 2B.5: a dome ray-cast at p, as (coverage, normal).
fn reliefDome(p: vec2f, i: u32) -> vec4f {
  let base = ${primitiveBase}u + i * ${PRIMITIVE_VEC4S}u;
  let rect = relief[base];
  let heights = relief[base + 3u];
  let camera = relief[5];
  let half = rect.zw * 0.5;
  let u = (p - camera.yz) / camera.x;
  let e = p - (rect.xy + half);
  let rise = max(heights.w - heights.z, 1e-3);
  let s = vec3f(1.0 / (half * half), 1.0 / (rise * rise));
  let z0 = heights.z;
  let a = u.x * u.x * s.x + u.y * u.y * s.y + s.z;
  let b = -2.0 * (e.x * u.x * s.x + e.y * u.y * s.y) - 2.0 * z0 * s.z;
  let c = e.x * e.x * s.x + e.y * e.y * s.y + z0 * z0 * s.z - 1.0;
  let least = c - b * b / (4.0 * a);
  let silhouette = (sqrt(max(least + 1.0, 0.0)) - 1.0) * min(half.x, half.y);
  let discriminant = b * b - 4.0 * a * c;
  let z = select(z0 - 1.0, (-b + sqrt(max(discriminant, 0.0))) / (2.0 * a), discriminant >= 0.0);
  if (z < z0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let hit = e - u * z;
  return vec4f(1.0 - smoothstep(-0.5, 0.5, silhouette), normalize(vec3f(hit * s.xy, (z - z0) * s.z)));
}
fn reliefShade(p: vec2f, captured: vec4f) -> vec4f {
  // A stage scene (2C) draws its backdrop and particles; the decorative layer's own content is empty.
  if (relief[4].w == 1.0) { return stageShade(p); }
  let light = relief[0].xyz;
  let m = relief[1].w;
  let states = relief[2];
  let focusColour = relief[3].xyz;
  let focusWidth = relief[3].w;
  let focusOffset = relief[4].x;
  let count = u32(relief[4].y);
  var shade = 0.0;
  var lamp = vec3f(0.0);
  var offsets = 0.0;
  var shadow = 0.0;
  var band = 0.0;
  var dark = 0.0;
  var edge = 0.0;
  var arcColour = vec3f(0.0);
  var arcAlpha = 0.0;
  var surfaceColour = vec3f(0.0);
  var surfaceAlpha = 0.0;
  var inside = false;
  var clearance = 1e9;
  for (var i = 0u; i < count; i++) {
    let base = ${primitiveBase}u + i * ${PRIMITIVE_VEC4S}u;
    let rect = relief[base];
    let shape = relief[base + 1u];
    let flags = relief[base + 2u];
    let ring = relief[base + 3u];
    let extra = relief[base + 4u];
    let kind = relief[base + 5u];
    let bandWidth = shape.y;
    let lift = shape.z;
    let object = shape.w >= 7.0;
    let dome = shape.w == 9.0;
    // An entry farther than every term's reach contributes nothing, so it is skipped. The box distance is a lower
    // bound of the shape's distance, so the skip is exact: no coverage (0.5 px), no effect on the guard's clearance
    // beyond its 2 px ramp, no shadow (offset plus softness), no focus edge, and no dome drawn past its footprint.
    var reach = bandWidth + 2.0;
    if (lift > 0.0) { reach = max(reach, length(light.xy) / light.z * lift + 1.5 * lift + 1.0); }
    if (flags.z > 0.5) { reach = max(reach, focusOffset + focusWidth + 0.5); }
    if (dome) { reach = max(reach, kind.z); }
    if (length(max(abs(p - rect.xy - rect.zw * 0.5) - rect.zw * 0.5, vec2f(0.0))) > reach) { continue; }
    let d = reliefDistance(p, i);
    let material = relief[${HEADER_VEC4S}u + u32(extra.w) * ${MATERIAL_VEC4S}u];
    var cover = 1.0 - smoothstep(-0.5, 0.5, d);
    var hit = vec4f(0.0);
    if (dome) { hit = reliefDome(p, i); cover = hit.x; }
    if (d < 0.0 || (dome && cover > 0.5)) { inside = true; }
    clearance = min(clearance, abs(d) - bandWidth);
    // 2.4 Occlusion: this entry hides the relief, interior offset, finish, arcs, dome colour and shadows beneath it.
    shade *= 1.0 - cover; lamp *= 1.0 - cover; offsets *= 1.0 - cover; band *= 1.0 - cover; dark *= 1.0 - cover; shadow *= 1.0 - cover;
    arcColour *= 1.0 - cover; arcAlpha *= 1.0 - cover;
    surfaceColour *= 1.0 - cover; surfaceAlpha *= 1.0 - cover;
    if (dome) {
      // 2B.5 A dome: its colour over what is beneath, lit by its own normal.
      surfaceColour += extra.xyz * cover;
      surfaceAlpha += cover * (1.0 - surfaceAlpha);
      if (kind.x > 0.5 && cover > 0.0) {
        shade += (reliefLight(hit.yzw, material) + reliefEnvironment(hit.yzw, material)) * cover;
        lamp += reliefLamp(p, (ring.z + ring.w) * 0.5, hit.yzw, material, captured.a) * cover;
      }
    } else if (object) {
      // 2B.4 A solid: a side within its taper of the footprint's edge, its cap beyond.
      if (kind.x > 0.5) {
        if (bandWidth > 0.0 && d > -bandWidth) {
          let n = reliefSide(p, i, d);
          shade += (reliefLight(n, material) + reliefEnvironment(n, material)) * cover;
          lamp += reliefLamp(p, (ring.z + ring.w) * 0.5, n, material, captured.a) * cover;
        } else if (d <= -bandWidth) {
          offsets += states.z * flags.x - states.w * flags.y + material.z * 0.02 + (1.0 - material.x) * 0.01;
          if (ring.x > 0.5) {
            let zones = reliefFinish(clamp((p.y - rect.y) / max(rect.w, 1.0), 0.0, 1.0), material);
            band = max(band, zones.x);
            dark = max(dark, zones.y);
          }
        }
      }
    } else {
      if (kind.w == 2.0) {
        // 2B.6 A dome drawn at the Relief level keeps its colour on its footprint.
        surfaceColour += extra.xyz * cover;
        surfaceAlpha += cover * (1.0 - surfaceAlpha);
      }
      if (bandWidth > 0.0) {
        let s = clamp(-d / bandWidth, 0.0, 1.0);
        if (s < 1.0 || kind.z > 0.5) {
          // 2.4 Normal from the profile; 2.5 bevel light.
          let e = 0.5;
          var g = vec2f(reliefDistance(p + vec2f(e, 0.0), i) - reliefDistance(p - vec2f(e, 0.0), i),
            reliefDistance(p + vec2f(0.0, e), i) - reliefDistance(p - vec2f(0.0, e), i));
          g = select(vec2f(0.0), g / length(g), length(g) > 1e-9);
          var theta = 1.2 * (1.0 - s);
          if (kind.x == 1.0) { theta = 0.6; }
          if (kind.x == 2.0) { theta = 1.2 * s; }
          // kind.y is the slope sign times the steepness of a band narrower than the bevel.
          theta *= abs(kind.y);
          let normal = vec3f(g * sign(kind.y) * sin(theta), cos(theta));
          shade += reliefLight(normal, material) * cover;
          lamp += reliefLamp(p, 0.0, normal, material, captured.a) * cover;
        } else {
          // 2.6 Interior offset and finish zones.
          offsets += states.z * flags.x - states.w * flags.y + material.z * 0.02 + (1.0 - material.x) * 0.01;
          if (ring.x > 0.5) {
            let zones = reliefFinish(clamp((p.y - rect.y) / max(rect.w, 1.0), 0.0, 1.0), material);
            band = max(band, zones.x);
            dark = max(dark, zones.y);
          }
        }
      }
      // 2.7 Ring arc, accumulated as an overlay.
      if (kind.w == 1.0) {
        var arc = 1.0;
        if (ring.w < 360.0) {
          let centre = rect.xy + rect.zw * 0.5;
          let radius = min(rect.z, rect.w) * 0.5 - ring.y * 0.5;
          let angle = (degrees(atan2(p.x - centre.x, -(p.y - centre.y))) + 360.0) % 360.0;
          let along = ((angle - ring.z) % 360.0 + 360.0) % 360.0;
          let inArc = along <= ring.w;
          let distance = select(min(along - ring.w, 360.0 - along), -min(along, ring.w - along), inArc);
          arc = 1.0 - smoothstep(-0.5, 0.5, radians(distance) * radius);
        }
        let c = cover * arc;
        arcColour = arcColour * (1.0 - c) + extra.xyz * c;
        arcAlpha = arcAlpha + c * (1.0 - arcAlpha);
      }
    }
    // 2.8 Cast shadow, outside the caster only.
    if (lift > 0.0) {
      let shifted = reliefDistance(p + light.xy / light.z * lift, i);
      shadow = max(shadow, relief[1].z * (1.0 - smoothstep(-0.5 * lift, 1.5 * lift + 1.0, shifted)) * smoothstep(-1.0, 0.5, d));
    }
    // 2.10 Focus edge.
    if (flags.z > 0.5) {
      edge = max(edge, smoothstep(focusOffset - 0.5, focusOffset + 0.5, d) * (1.0 - smoothstep(focusOffset + focusWidth - 0.5, focusOffset + focusWidth + 0.5, d)));
    }
  }
  // 2B.8 Domes' colour goes over the captured content before light.
  let alphaIn = captured.a * (1.0 - surfaceAlpha) + surfaceAlpha;
  let colourIn = select(vec3f(0.0), (captured.rgb * captured.a * (1.0 - surfaceAlpha) + surfaceColour) / alphaIn, alphaIn > 1e-5);
  // 2.9 Guard and 2.11 compositing.
  let interior = 1.0 + clamp(offsets, -m, m);
  let guard = select(0.0, smoothstep(0.0, 2.0, clearance), inside);
  // On a guarded face a cast shadow is scaled to darken by at most m, so it keeps its soft profile.
  let scaled = shadow * select(1.0, m / relief[1].z, relief[1].z > m);
  let k = clamp(interior * (1.0 - scaled), 1.0 - m, 1.0 + m);
  // Emitter highlights stay off protected text (2D.4), and the guard (w) keeps them off guarded faces.
  if (any(lamp > vec3f(0.0))) { lamp *= 1.0 - lampProtect(p); }
  var content = mix((colourIn * interior + vec3f(shade) + lamp) * (1.0 - shadow), colourIn * k, guard);
  content = content * (1.0 - arcAlpha) + arcColour;
  content = clamp(mix(mix(content, vec3f(1.0), band), vec3f(0.0), dark), vec3f(0.0), vec3f(1.0));
  var premultiplied = content * alphaIn;
  var alpha = alphaIn + shadow * (1.0 - alphaIn);
  premultiplied = premultiplied * (1.0 - edge) + focusColour * edge;
  alpha = alpha * (1.0 - edge) + edge;
  return vec4f(select(vec3f(0.0), premultiplied / alpha, alpha > 1e-5), alpha);
}
`;
