/**
 * The reference implementation of the Strata Rendering Model's Instrument part (`docs/ui-library/rendering-model.md`,
 * part 2D, version 4): plain TypeScript with no GPU and no DOM, written to be read next to the standard, not to be fast.
 * Its comments carry the standard's section numbers. It is the oracle `instrument-4.json` is generated from.
 *
 * - **The format (2D.1, 2D.2):** `validateInstrumentScene` accepts exactly the scenes core's `instrument` material
 *   accepts (`packages/core/src/instrument.ts`), with the same paths in its errors, and returns the same normalized copy.
 * - **Geometry (2D.2, 2D.3, 2D.9):** `profileMesh` builds the triangles core draws, `poseAt` and `poseMatrix` place them,
 *   and `objectContained` decides containment over the whole travel.
 * - **Light (2D.4 to 2D.8):** the emitter term, the guarded face factor `Φ`, the studio as radiance, the reference
 *   shading of a part in linear light, glass, and the compositing order of an Instrument layer (`shadeInstrument`).
 *
 * Coordinates are layer-local CSS px: x to the right, y down and z towards the viewer (2D.2). A part's profile is built in
 * part-local px with its origin at the centre of the part's base.
 */
import { parseHex } from "./contrast.ts";
import { lightVector, shadePoint, shadingTerms, type CapturedColour, type Rgb01 } from "./shade.ts";
import { bevelProfiles, sceneFaces, type ScenePrimitive, type StrataScene } from "./scene.ts";

// ---------------------------------------------------------------------------------------------------------------------
// The format (2D.1, 2D.2). Limits are core's, so the reference accepts exactly what core accepts.

/** Parts a scene may describe; the per-layer budget (2,048) is a renderer's step-down, not a format error. */
export const INSTRUMENT_SCENE_PARTS = 8192;
/** The parts budget of one layer (design language section 6): above it a renderer draws the layer at Relief. */
export const INSTRUMENT_PARTS_PER_LAYER = 2048;
/** Objects per scene; with the face's primitives at most 256 in all, so every step-down fits the face's list. */
export const INSTRUMENT_OBJECTS = 256;
export const INSTRUMENT_OBJECT_PARTS = 64;
export const INSTRUMENT_EMITTERS = 64;
export const INSTRUMENT_PROTECTED = 64;
export const INSTRUMENT_PROFILES = 64;
export const INSTRUMENT_MATERIALS = 16;
/** The containment margin of 2D.9: every vertex projects at least this far inside `bounds`. */
export const CONTAINMENT_MARGIN = 0.5;
/** The camera rule's floor (2D.3). */
export const CAMERA_FLOOR = 2400;
/** The reference stage of the box rule (design language section 6). */
export const REFERENCE_STAGE = { width: 1920, height: 1080 } as const;

/** The part vocabulary of design language section 6. `custom` waits for core's custom parts. */
export const partKinds = ["cap", "skirt", "collar", "chamfer", "pointer", "carriage", "slot", "grip", "lever", "pivot", "ball", "nut",
  "bushing", "plate", "paddle", "bezel", "lens", "window", "needle", "dial", "segment", "plinth"] as const;
export type PartKind = (typeof partKinds)[number];

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** `[x, y, width, height]` in layer px. */
export type Box = [number, number, number, number];

/** A pose (2D.2); every field defaults to 0. Angles in degrees, lengths in px. */
export interface InstrumentPose {
  /** Along the face normal; negative sinks. */
  travel?: number;
  /** In the face plane. */
  slide?: Vec2;
  /** About the face normal, clockwise as seen. */
  turn?: number;
  /** About the in-plane axis at `axis` degrees clockwise from +x; positive raises the side at `axis + 90°`. */
  tilt?: number;
  axis?: number;
  /** Part-local: the point `turn` and `tilt` are about. */
  pivot?: Vec3;
}
/** A part shape (2D.2), in part-local px with the origin at the centre of the part's base. */
export type InstrumentProfile =
  /** `points` are `[r, z, nr, nz]`, outermost first; a repeated point with another normal is a crease. */
  | { type: "lathe"; points: [number, number, number, number][]; segments?: number }
  /** A rounded rectangle raised to `height`, its top inset by `taper`, with a `chamfer` at the top edge. */
  | { type: "prism"; width: number; length: number; radius?: number; height: number; taper?: number; chamfer?: number }
  /** An `[x, z]` side outline (star-shaped from its mean point) extruded across `width` along y. */
  | { type: "extrude"; outline: Vec2[]; width: number };
/** What a part casts on the face (2D.7), in layer px. */
export interface InstrumentCaster { rect: Box; radius: number; height: number }
export interface InstrumentPart {
  kind: PartKind;
  profile: string;
  /** Where the profile's origin stands; `z` is the height of the surface below it. */
  at: Vec3;
  /** Moving parts only: the poses at the two stops. */
  pose?: { from: InstrumentPose; to: InstrumentPose };
  material: string;
  /** A cap that carries the layer's capture (2D.8); it may only travel. */
  captured?: boolean;
  /** Glass parts (2D.6). */
  glass?: "lens" | "window";
  /** Lenses only: the polished disc the lens stands on, centred on the part at the height of its `at`. */
  stand?: { radius: number; colour: string };
  /** `true`: finish zones on a captured cap (2.6), and on a window the band and horizon with their defaults; `{ band, horizon }`: a window's finish zone (2D.6). */
  finish?: boolean | { band?: number; horizon?: number };
  /** Omitted: resolved from the posed part (`partCaster`). `null`: the part casts nothing on the face. */
  caster?: InstrumentCaster | null;
  /** The emitter this part is the lens of. */
  emitter?: number;
  state?: { hover?: boolean; pressed?: boolean; focus?: boolean; disabled?: boolean };
}
export interface InstrumentObject {
  /** Unique in the scene; diagnostics name it. */
  id: string;
  /** The native control's border box. */
  rect: Box;
  /** The rounded box every drawn pixel must stay inside (2D.9); default `rect`, radius 0. */
  bounds?: { rect: Box; radius?: number };
  /** The position along the travel, clamped to 0–1. */
  t?: number;
  parts: InstrumentPart[];
  /** Drawn in the face's list instead when the object fails containment; default a raised box over `bounds`. */
  relief?: ScenePrimitive;
}
/** A material recipe (2D.5); colours are sRGB `#rrggbb`. */
export interface InstrumentRecipe {
  base?: { colour?: string; roughness?: number; metallic?: number; direct?: number };
  coat?: { strength?: number; roughness?: number; ior?: number };
  reflectance?: { f0?: number; tint?: string };
  emissive?: { strength?: number; colour?: string };
  sheen?: { strength?: number; roughness?: number; colour?: string };
  iridescence?: { strength?: number; thickness?: number };
  brush?: { strength?: number; direction?: "radial" | "linear" | "circular" };
  grain?: { kind?: "hairline" | "knurl" | "fluted" | "sandblast"; strength?: number; scale?: number };
  glass?: { ior?: number; tint?: string | Vec3; absorption?: number; reflection?: number };
  dispersion?: { strength?: number };
  subsurface?: { strength?: number; tint?: string; thickness?: number };
}
/** An emitter (2D.4): a point light a lit part carries, or the pointer light. */
export interface InstrumentEmitter { position: Vec3; colour: Vec3; strength: number; radius: number; reach?: "outset" | "layer"; face?: number }
/** The studio's radiance tokens (design language section 4). */
export interface StudioTokens { key: number; keyRadius: number; fill: number; front: number; strip: number; floor: number; ceiling: number }
/** A version 4 Instrument scene (2D.1). */
export interface InstrumentScene {
  format: "strata-scene";
  version: 4;
  kind: "instrument";
  camera: { distance: number; vanish: Vec2 };
  environment: { source: "studio"; strength: number; studio?: Partial<StudioTokens>; page?: { enabled?: boolean; size?: number; height?: number } };
  extent: { width: number; height: number };
  outset?: { top: number; right: number; bottom: number; left: number };
  backdrop: string;
  light: { azimuth: number; elevation: number; intensity?: number; ambient?: number };
  bevel: StrataScene["bevel"];
  shadow: { strength: number; map?: { size?: number; bias?: number; darkness?: number } };
  interior: { max: number };
  state: StrataScene["state"];
  focus: StrataScene["focus"];
  materials: Record<string, InstrumentRecipe>;
  /** The face's relief primitives (part 2), back to front. */
  primitives: ScenePrimitive[];
  profiles: Record<string, InstrumentProfile>;
  objects: InstrumentObject[];
  emitters?: InstrumentEmitter[];
  protected?: Box[] | "extent";
  feather?: number;
  post?: { smaa?: boolean; bloom?: boolean; taa?: boolean; contact?: boolean; ssgi?: boolean };
}

/** The first problem with a scene: its path (`objects[3].parts[1].pose.to.turn`) and the rule it breaks. */
export class InstrumentSceneError extends Error {
  readonly path: string;
  readonly rule: string;
  constructor(path: string, rule: string) {
    super(`Instrument scene ${path} ${rule}`);
    this.name = "InstrumentSceneError";
    this.path = path;
    this.rule = rule;
  }
}

const fail = (path: string, rule: string): never => { throw new InstrumentSceneError(path, rule); };
const record = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path || "(root)", "requires an object");
  return value as Record<string, unknown>;
};
const number = (value: unknown, path: string, min = -1e6, max = 1e6): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(path, `requires a number in ${min}..${max}`);
  return value as number;
};
const optional = (value: unknown, path: string, min: number, max: number, fallback: number) => (value === undefined ? fallback : number(value, path, min, max));
const integer = (value: unknown, path: string, min: number, max: number, fallback: number) => {
  const result = optional(value, path, min, max, fallback);
  if (!Number.isInteger(result)) fail(path, "requires an integer");
  return result;
};
const flag = (value: unknown, path: string, fallback = false) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(path, "requires a boolean");
  return value as boolean;
};
const hex = (value: unknown, path: string, fallback?: string): string => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) fail(path, "requires a #rrggbb colour");
  return value as string;
};
const tuple = (value: unknown, path: string, length: number, min = -1e6, max = 1e6): number[] => {
  if (!Array.isArray(value) || value.length !== length) fail(path, `requires ${length} numbers`);
  return (value as unknown[]).map((part, index) => number(part, `${path}[${index}]`, min, max));
};
const box = (value: unknown, path: string): Box => {
  const [x, y, width, height] = tuple(value, path, 4);
  if (width! < 0 || height! < 0) fail(path, "requires [x, y, width, height] with a width and height of at least 0");
  return [x!, y!, width!, height!];
};
const choice = <T extends string>(value: unknown, path: string, options: readonly T[], fallback?: T): T => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!options.includes(value as T)) fail(path, `requires one of ${options.join(", ")}`);
  return value as T;
};
/** Refuses any key `allowed` does not name, so a typo is an error. */
const known = (value: Record<string, unknown>, path: string, allowed: readonly string[]) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path ? `${path}.${key}` : key, "is not a field of this part of the format");
};

/**
 * Validates a version 4 Instrument scene (2D.1, 2D.2) and returns a deep, normalized copy: defaults filled in, `t`
 * clamped to its stops, every object's Relief primitive resolved. Throws `InstrumentSceneError` on the first problem,
 * naming its path. It accepts exactly the scenes core's `instrument` material accepts; where that differs from the
 * draft of 2D it follows core, as the change log records (`mesh` profiles and `custom` parts wait for custom parts).
 */
export function validateInstrumentScene(input: unknown): InstrumentScene {
  const scene = record(input, "");
  if (scene.format !== "strata-scene" || scene.version !== 4 || scene.kind !== "instrument") {
    throw new InstrumentSceneError("(root)", 'requires a version 4 strata-scene with kind "instrument"');
  }
  known(scene, "", ["format", "version", "kind", "camera", "environment", "extent", "outset", "backdrop", "light", "bevel", "shadow", "interior",
    "state", "focus", "materials", "primitives", "profiles", "objects", "emitters", "protected", "feather", "post"]);
  // 2D.3: the camera of 2B.1, at least 100 px away.
  const camera = record(scene.camera, "camera");
  const distance = number(camera.distance, "camera.distance", 100, 1e6);
  const vanish = tuple(camera.vanish, "camera.vanish", 2) as Vec2;
  const light = record(scene.light, "light");
  // 2D.5: an Instrument layer always has the studio.
  const environment = record(scene.environment, "environment");
  if (environment.source !== "studio") fail("environment.source", 'requires "studio" (an Instrument layer always has an environment)');
  const studio = environment.studio === undefined ? undefined : record(environment.studio, "environment.studio");
  const page = environment.page === undefined ? undefined : record(environment.page, "environment.page");
  const shadow = record(scene.shadow, "shadow");
  const map = shadow.map === undefined ? undefined : record(shadow.map, "shadow.map");
  if (map?.size !== undefined && map.size !== 2048 && map.size !== 4096) fail("shadow.map.size", "requires 2048 or 4096");
  const materials = record(scene.materials, "materials");
  const names = Object.keys(materials);
  if (names.length > INSTRUMENT_MATERIALS) fail("materials", `holds more than ${INSTRUMENT_MATERIALS} materials`);
  const recipes = Object.fromEntries(names.map(name => [name, recipe(record(materials[name], `materials.${name}`), `materials.${name}`)]));
  const profiles = record(scene.profiles, "profiles");
  const profileNames = Object.keys(profiles);
  if (profileNames.length > INSTRUMENT_PROFILES) fail("profiles", `holds more than ${INSTRUMENT_PROFILES} profiles`);
  const shapes = Object.fromEntries(profileNames.map(name => [name, profile(record(profiles[name], `profiles.${name}`), `profiles.${name}`)]));
  // 2D.4: emitters and protected rects.
  if (scene.emitters !== undefined && (!Array.isArray(scene.emitters) || scene.emitters.length > INSTRUMENT_EMITTERS)) fail("emitters", `requires an array of at most ${INSTRUMENT_EMITTERS}`);
  const emitters = ((scene.emitters ?? []) as unknown[]).map((value, index): InstrumentEmitter => {
    const at = `emitters[${index}]`, emitter = record(value, at);
    known(emitter, at, ["position", "colour", "strength", "radius", "reach", "face"]);
    return { position: tuple(emitter.position, `${at}.position`, 3) as Vec3, colour: tuple(emitter.colour, `${at}.colour`, 3, 0, 1) as Vec3,
      strength: number(emitter.strength, `${at}.strength`, 0), radius: number(emitter.radius, `${at}.radius`, 1e-6),
      reach: choice(emitter.reach, `${at}.reach`, ["outset", "layer"] as const, "outset"), face: optional(emitter.face, `${at}.face`, 0, 1, 1) };
  });
  let shielded: Box[] | "extent" | undefined;
  if (scene.protected === "extent") shielded = "extent";
  else if (scene.protected !== undefined) {
    if (!Array.isArray(scene.protected) || scene.protected.length > INSTRUMENT_PROTECTED) fail("protected", `requires "extent" or an array of at most ${INSTRUMENT_PROTECTED} rects`);
    shielded = (scene.protected as unknown[]).map((rect, index) => box(rect, `protected[${index}]`));
  }
  // 2D.2: objects and their parts.
  if (!Array.isArray(scene.objects) || scene.objects.length > INSTRUMENT_OBJECTS) fail("objects", `requires an array of at most ${INSTRUMENT_OBJECTS}`);
  const primitivesIn = scene.primitives;
  if (!Array.isArray(primitivesIn)) fail("primitives", "requires an array");
  if ((primitivesIn as unknown[]).length + (scene.objects as unknown[]).length > INSTRUMENT_OBJECTS) {
    fail("primitives", `and objects together exceed ${INSTRUMENT_OBJECTS}, so every object's Relief primitive could not fit the face's list`);
  }
  const ids = new Set<string>();
  let partCount = 0;
  const objects = (scene.objects as unknown[]).map((value, index) => {
    const at = `objects[${index}]`, entry = record(value, at);
    known(entry, at, ["id", "rect", "bounds", "t", "parts", "relief"]);
    if (typeof entry.id !== "string" || !entry.id || entry.id.length > 64) fail(`${at}.id`, "requires a non-empty string of at most 64 characters");
    if (ids.has(entry.id as string)) fail(`${at}.id`, `"${entry.id as string}" is not unique`);
    ids.add(entry.id as string);
    const rect = box(entry.rect, `${at}.rect`);
    const bounds = entry.bounds === undefined ? undefined : record(entry.bounds, `${at}.bounds`);
    const boundsRect = bounds ? box(bounds.rect, `${at}.bounds.rect`) : rect;
    const radius = bounds ? optional(bounds.radius, `${at}.bounds.radius`, 0, 1e6, 0) : 0;
    // 2D.2: `t` stays within the travel, so a pose never passes a stop.
    const t = Math.min(1, Math.max(0, optional(entry.t, `${at}.t`, -1e6, 1e6, 0)));
    if (!Array.isArray(entry.parts) || !entry.parts.length || entry.parts.length > INSTRUMENT_OBJECT_PARTS) fail(`${at}.parts`, `requires 1..${INSTRUMENT_OBJECT_PARTS} parts`);
    partCount += (entry.parts as unknown[]).length;
    if (partCount > INSTRUMENT_SCENE_PARTS) fail("objects", `hold more than ${INSTRUMENT_SCENE_PARTS} parts`);
    const parts = (entry.parts as unknown[]).map((part, partIndex) => validatePart(record(part, `${at}.parts[${partIndex}]`), `${at}.parts[${partIndex}]`, shapes, names, emitters.length));
    return { id: entry.id as string, rect, bounds: { rect: boundsRect, radius: Math.min(radius, boundsRect[2] / 2, boundsRect[3] / 2) }, t, parts,
      relief: entry.relief };
  });
  // Part 2: the face, a version 1 scene of the primitives and every object's Relief primitive in the same list (2D.9).
  const reliefOf = (object: (typeof objects)[number]): unknown => object.relief ?? { face: "raised", rect: object.bounds.rect, radius: object.bounds.radius,
    height: Math.min(16, Math.max(1, ...object.parts.map(part => part.at[2] + profileHeight(shapes[part.profile]!)))), material: object.parts[0]!.material };
  const face = validateFace({ extent: scene.extent, outset: scene.outset, backdrop: scene.backdrop, light, bevel: scene.bevel, shadow, interior: scene.interior,
    state: scene.state, focus: scene.focus }, names, [...(primitivesIn as unknown[]), ...objects.map(reliefOf)], (primitivesIn as unknown[]).length);
  const count = (primitivesIn as unknown[]).length;
  return {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance, vanish },
    environment: { source: "studio", strength: number(environment.strength, "environment.strength", 0, 3),
      ...(studio ? { studio: studioTokens(studio) } : {}),
      ...(page ? { page: { enabled: flag(page.enabled, "environment.page.enabled", true), size: integer(page.size, "environment.page.size", 128, 1024, 512),
        height: optional(page.height, "environment.page.height", 0, 1e5, 300) } } : {}) },
    extent: face.extent, ...(face.outset ? { outset: face.outset } : {}), backdrop: face.backdrop,
    // 2D.1: the key light's strength (1.6) and a diffuse fill that is 0 by default: the studio is the fill.
    light: { ...face.light, intensity: optional(light.intensity, "light.intensity", 0, 20, 1.6), ambient: optional(light.ambient, "light.ambient", 0, 4, 0) },
    bevel: face.bevel,
    shadow: { strength: face.shadow.strength, ...(map ? { map: { size: (map.size as number | undefined) ?? 4096, bias: optional(map.bias, "shadow.map.bias", 0, 100, 1.95),
      darkness: optional(map.darkness, "shadow.map.darkness", 0, 1, 0.1) } } : {}) },
    interior: face.interior, state: face.state, focus: face.focus,
    materials: recipes,
    primitives: face.primitives.slice(0, count),
    profiles: shapes,
    objects: objects.map((object, index) => ({ ...object, relief: face.primitives[count + index]! })),
    ...(scene.emitters !== undefined ? { emitters } : {}),
    ...(shielded !== undefined ? { protected: shielded, feather: optional(scene.feather, "feather", 0, 1e3, 4) } : {}),
    ...(scene.post !== undefined ? { post: post(record(scene.post, "post")) } : {}),
  };
}

/** One part (2D.2), with its pose's stops checked against each other. */
function validatePart(part: Record<string, unknown>, at: string, profiles: Record<string, InstrumentProfile>, materials: string[], emitters: number): InstrumentPart {
  known(part, at, ["kind", "profile", "at", "pose", "material", "captured", "glass", "stand", "finish", "caster", "emitter", "state"]);
  if (part.kind === "custom") fail(`${at}.kind`, "custom parts need core work item 5 (custom parts)");
  const kind = choice(part.kind, `${at}.kind`, partKinds);
  if (typeof part.profile !== "string" || !(part.profile in profiles)) fail(`${at}.profile`, "requires one of the scene's profiles");
  if (typeof part.material !== "string" || !materials.includes(part.material)) fail(`${at}.material`, "requires one of the scene's materials");
  const position = tuple(part.at, `${at}.at`, 3) as Vec3;
  let pose: InstrumentPart["pose"];
  if (part.pose !== undefined) {
    const stops = record(part.pose, `${at}.pose`);
    known(stops, `${at}.pose`, ["from", "to"]);
    const from = validatePose(record(stops.from, `${at}.pose.from`), `${at}.pose.from`), to = validatePose(record(stops.to, `${at}.pose.to`), `${at}.pose.to`);
    // 2D.2: `axis` and `pivot` are the same at both stops.
    if (from.axis !== to.axis) fail(`${at}.pose.to.axis`, "must equal pose.from.axis");
    if (from.pivot!.some((value, index) => value !== to.pivot![index])) fail(`${at}.pose.to.pivot`, "must equal pose.from.pivot");
    pose = { from, to };
  }
  const captured = flag(part.captured, `${at}.captured`);
  // Design language section 6: only parts that stay parallel to the face carry captured content.
  if (captured && pose && [pose.from, pose.to].some(stop => stop.turn || stop.tilt || stop.slide![0] || stop.slide![1])) {
    fail(`${at}.captured`, "is only for parts that travel: turning, tilting and sliding parts never carry captured content");
  }
  const glass = part.glass === undefined ? undefined : choice(part.glass, `${at}.glass`, ["lens", "window"] as const);
  if (part.stand !== undefined && glass !== "lens") fail(`${at}.stand`, "is only for lenses");
  const stand = part.stand === undefined ? undefined : record(part.stand, `${at}.stand`);
  let finish: InstrumentPart["finish"];
  if (part.finish === undefined || typeof part.finish === "boolean") finish = part.finish === true;
  else {
    const zones = record(part.finish, `${at}.finish`);
    finish = { band: optional(zones.band, `${at}.finish.band`, 0, 1, 0.3), horizon: optional(zones.horizon, `${at}.finish.horizon`, 0, 1, 0.25) };
  }
  let caster: InstrumentCaster | null | undefined;
  if (part.caster === null) caster = null;
  else if (part.caster !== undefined) {
    const shape = record(part.caster, `${at}.caster`);
    caster = { rect: box(shape.rect, `${at}.caster.rect`), radius: optional(shape.radius, `${at}.caster.radius`, 0, 1e6, 0), height: number(shape.height, `${at}.caster.height`, 0, 1e4) };
  }
  if (part.emitter !== undefined && (!Number.isInteger(part.emitter) || (part.emitter as number) < 0 || (part.emitter as number) >= emitters)) fail(`${at}.emitter`, "requires an index into emitters");
  const states = part.state === undefined ? {} : record(part.state, `${at}.state`);
  return { kind, profile: part.profile as string, at: position, ...(pose ? { pose } : {}), material: part.material as string,
    ...(captured ? { captured } : {}), ...(glass ? { glass } : {}),
    ...(stand ? { stand: { radius: number(stand.radius, `${at}.stand.radius`, 0), colour: hex(stand.colour, `${at}.stand.colour`) } } : {}),
    ...(finish ? { finish } : {}), ...(caster !== undefined ? { caster } : {}),
    ...(part.emitter !== undefined ? { emitter: part.emitter as number } : {}),
    state: { hover: flag(states.hover, `${at}.state.hover`), pressed: flag(states.pressed, `${at}.state.pressed`),
      focus: flag(states.focus, `${at}.state.focus`), disabled: flag(states.disabled, `${at}.state.disabled`) } };
}
function validatePose(pose: Record<string, unknown>, at: string): Required<InstrumentPose> {
  known(pose, at, ["travel", "slide", "turn", "tilt", "axis", "pivot"]);
  return { travel: optional(pose.travel, `${at}.travel`, -1e4, 1e4, 0), slide: pose.slide === undefined ? [0, 0] : tuple(pose.slide, `${at}.slide`, 2, -1e4, 1e4) as Vec2,
    turn: optional(pose.turn, `${at}.turn`, -720, 720, 0), tilt: optional(pose.tilt, `${at}.tilt`, -90, 90, 0),
    axis: optional(pose.axis, `${at}.axis`, -360, 360, 0), pivot: pose.pivot === undefined ? [0, 0, 0] : tuple(pose.pivot, `${at}.pivot`, 3, -1e4, 1e4) as Vec3 };
}
function profile(value: Record<string, unknown>, at: string): InstrumentProfile {
  if (value.type === "mesh") fail(`${at}.type`, "mesh needs core work item 5 (custom parts)");
  const type = choice(value.type, `${at}.type`, ["lathe", "prism", "extrude"] as const);
  if (type === "lathe") {
    known(value, at, ["type", "points", "segments"]);
    if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 256) fail(`${at}.points`, "requires 2..256 points [r, z, nr, nz]");
    const points = (value.points as unknown[]).map((point, index) => {
      const [r, z, nr, nz] = tuple(point, `${at}.points[${index}]`, 4, -1e4, 1e4);
      if (r! < 0) fail(`${at}.points[${index}][0]`, "requires a radius of at least 0");
      if (Math.hypot(nr!, nz!) < 1e-9) fail(`${at}.points[${index}]`, "requires a non-zero normal");
      return [r!, z!, nr!, nz!] as [number, number, number, number];
    });
    return { type, points, segments: integer(value.segments, `${at}.segments`, 3, 256, 48) };
  }
  if (type === "prism") {
    known(value, at, ["type", "width", "length", "radius", "height", "taper", "chamfer"]);
    const width = number(value.width, `${at}.width`, 1e-3, 1e4), length = number(value.length, `${at}.length`, 1e-3, 1e4), height = number(value.height, `${at}.height`, 1e-3, 1e4);
    const taper = optional(value.taper, `${at}.taper`, 0, 1e4, 0), chamfer = optional(value.chamfer, `${at}.chamfer`, 0, 1e4, 0);
    if (2 * (taper + chamfer) >= Math.min(width, length)) fail(`${at}.taper`, "and chamfer must leave a top: 2 · (taper + chamfer) < min(width, length)");
    if (chamfer >= height) fail(`${at}.chamfer`, "must be less than the height");
    return { type, width, length, radius: Math.min(optional(value.radius, `${at}.radius`, 0, 1e4, 0), width / 2, length / 2), height, taper, chamfer };
  }
  known(value, at, ["type", "outline", "width"]);
  if (!Array.isArray(value.outline) || value.outline.length < 3 || value.outline.length > 256) fail(`${at}.outline`, "requires 3..256 points [x, z]");
  return { type, outline: (value.outline as unknown[]).map((point, index) => tuple(point, `${at}.outline[${index}]`, 2, -1e4, 1e4) as Vec2),
    width: number(value.width, `${at}.width`, 1e-3, 1e4) };
}
/** One material recipe (2D.5) with its defaults. */
function recipe(value: Record<string, unknown>, at: string): InstrumentRecipe {
  known(value, at, ["base", "coat", "reflectance", "emissive", "sheen", "iridescence", "brush", "grain", "glass", "dispersion", "subsurface", "transmission"]);
  const layer = (key: string) => (value[key] === undefined ? undefined : record(value[key], `${at}.${key}`));
  const base = layer("base"), coat = layer("coat"), reflectance = layer("reflectance"), emissive = layer("emissive"), sheen = layer("sheen");
  const iridescence = layer("iridescence"), brush = layer("brush"), grain = layer("grain"), glass = layer("glass"), dispersion = layer("dispersion"), subsurface = layer("subsurface");
  const result: InstrumentRecipe = {
    base: { colour: hex(base?.colour, `${at}.base.colour`, "#ffffff"), roughness: optional(base?.roughness, `${at}.base.roughness`, 0, 1, 1),
      metallic: optional(base?.metallic, `${at}.base.metallic`, 0, 1, 0), direct: optional(base?.direct, `${at}.base.direct`, 0, 1, 1) },
    coat: { strength: optional(coat?.strength, `${at}.coat.strength`, 0, 1, 0), roughness: optional(coat?.roughness, `${at}.coat.roughness`, 0, 1, 0), ior: optional(coat?.ior, `${at}.coat.ior`, 1, 3, 1.5) },
    emissive: { strength: optional(emissive?.strength, `${at}.emissive.strength`, 0, 4, 0), colour: hex(emissive?.colour, `${at}.emissive.colour`, "#ffffff") },
  };
  if (reflectance) result.reflectance = { f0: optional(reflectance.f0, `${at}.reflectance.f0`, 0, 1, 1), tint: hex(reflectance.tint, `${at}.reflectance.tint`, "#ffffff") };
  if (sheen) result.sheen = { strength: optional(sheen.strength, `${at}.sheen.strength`, 0, 1, 0), roughness: optional(sheen.roughness, `${at}.sheen.roughness`, 0, 1, 0.5), colour: hex(sheen.colour, `${at}.sheen.colour`, "#ffffff") };
  if (iridescence) result.iridescence = { strength: optional(iridescence.strength, `${at}.iridescence.strength`, 0, 1, 0), thickness: optional(iridescence.thickness, `${at}.iridescence.thickness`, 100, 1200, 400) };
  if (brush) result.brush = { strength: optional(brush.strength, `${at}.brush.strength`, 0, 1, 0), direction: choice(brush.direction, `${at}.brush.direction`, ["radial", "linear", "circular"] as const, "circular") };
  if (grain) result.grain = { kind: choice(grain.kind, `${at}.grain.kind`, ["hairline", "knurl", "fluted", "sandblast"] as const, "hairline"),
    strength: optional(grain.strength, `${at}.grain.strength`, 0, 1, 0), scale: optional(grain.scale, `${at}.grain.scale`, 0.1, 1e3, 1) };
  if (glass) result.glass = { ior: optional(glass.ior, `${at}.glass.ior`, 1, 3, 1.5),
    tint: Array.isArray(glass.tint) ? tuple(glass.tint, `${at}.glass.tint`, 3, 0, 1) as Vec3 : hex(glass.tint, `${at}.glass.tint`, "#d6ede6"),
    absorption: optional(glass.absorption, `${at}.glass.absorption`, 0, 10, 0.03), reflection: optional(glass.reflection, `${at}.glass.reflection`, 0, 10, 1.5) };
  if (dispersion) result.dispersion = { strength: optional(dispersion.strength, `${at}.dispersion.strength`, 0, 1, 0) };
  if (subsurface) result.subsurface = { strength: optional(subsurface.strength, `${at}.subsurface.strength`, 0, 1, 0), tint: hex(subsurface.tint, `${at}.subsurface.tint`, "#ffffff"),
    thickness: optional(subsurface.thickness, `${at}.subsurface.thickness`, 0, 1e3, 1) };
  return result;
}
function studioTokens(value: Record<string, unknown>): Partial<StudioTokens> {
  known(value, "environment.studio", ["key", "keyRadius", "fill", "front", "strip", "floor", "ceiling"]);
  const ranges: Record<keyof StudioTokens, [number, number]> = { key: [0, 40], keyRadius: [0.05, 0.6], fill: [0, 10], front: [0, 2], strip: [0, 10], floor: [0, 1], ceiling: [0, 2] };
  return Object.fromEntries(Object.entries(ranges).filter(([key]) => value[key] !== undefined)
    .map(([key, [min, max]]) => [key, number(value[key], `environment.studio.${key}`, min, max)]));
}
function post(value: Record<string, unknown>) {
  known(value, "post", ["smaa", "bloom", "taa", "contact", "ssgi"]);
  return { smaa: flag(value.smaa, "post.smaa", true), bloom: flag(value.bloom, "post.bloom", true), taa: flag(value.taa, "post.taa", false),
    contact: flag(value.contact, "post.contact", false), ssgi: flag(value.ssgi, "post.ssgi", false) };
}

/** The relief outset a face may carry, as core's relief pass packs it. */
const FACE_OUTSET = 128;
/**
 * The face (part 2) as core validates it: a version 1 scene. `entries` are the scene's primitives followed by every
 * object's Relief primitive; a problem in the latter is reported at `objects[i].relief`.
 */
function validateFace(face: Record<string, unknown>, materials: string[], entries: unknown[], count: number) {
  const where = (index: number) => (index >= count ? `objects[${index - count}].relief` : `primitives[${index}]`);
  const finite = (value: unknown, path: string, min = -Infinity, max = Infinity) => number(value, path, min, max);
  const extent = record(face.extent, "extent"), light = record(face.light, "light"), bevel = record(face.bevel, "bevel");
  const state = record(face.state, "state"), focus = record(face.focus, "focus");
  if (!bevelProfiles.includes(bevel.profile as (typeof bevelProfiles)[number])) fail("bevel.profile", `requires one of ${bevelProfiles.join(", ")}`);
  const outset = face.outset === undefined ? undefined : record(face.outset, "outset");
  return {
    extent: { width: finite(extent.width, "extent.width", 0), height: finite(extent.height, "extent.height", 0) },
    ...(outset ? { outset: { top: finite(outset.top, "outset.top", 0, FACE_OUTSET), right: finite(outset.right, "outset.right", 0, FACE_OUTSET),
      bottom: finite(outset.bottom, "outset.bottom", 0, FACE_OUTSET), left: finite(outset.left, "outset.left", 0, FACE_OUTSET) } } : {}),
    backdrop: hex(face.backdrop, "backdrop"),
    light: { azimuth: finite(light.azimuth, "light.azimuth", 0, 360), elevation: finite(light.elevation, "light.elevation", 1, 90) },
    bevel: { width: finite(bevel.width, "bevel.width", 0), gain: finite(bevel.gain, "bevel.gain", 0), profile: bevel.profile as StrataScene["bevel"]["profile"] },
    shadow: { strength: finite(record(face.shadow, "shadow").strength, "shadow.strength", 0, 1) },
    interior: { max: finite(record(face.interior, "interior").max, "interior.max", 0, 0.1) },
    state: { hoverHeight: finite(state.hoverHeight, "state.hoverHeight", 0), pressHeight: finite(state.pressHeight, "state.pressHeight", 0),
      hoverLift: finite(state.hoverLift, "state.hoverLift", 0, 0.1), pressSink: finite(state.pressSink, "state.pressSink", 0, 0.1) },
    focus: { colour: hex(focus.colour, "focus.colour"), width: finite(focus.width, "focus.width", 0), offset: finite(focus.offset, "focus.offset", 0) },
    primitives: entries.map((value, index): ScenePrimitive => {
      const at = where(index), primitive = record(value, at);
      // A layer has one renderer (design language section 16): version 2 objects never appear in an Instrument scene.
      if ("object" in primitive) fail(`${at}.object`, "requires a version 2 or 3 scene (the objects material)");
      if (!sceneFaces.includes(primitive.face as (typeof sceneFaces)[number])) fail(`${at}.face`, `requires one of ${sceneFaces.join(", ")}`);
      if (!Array.isArray(primitive.rect) || primitive.rect.length !== 4) fail(`${at}.rect`, "requires [x, y, width, height]");
      if (typeof primitive.material !== "string" || !materials.includes(primitive.material)) fail(`${at}.material`, "requires one of the scene's materials");
      const flags = primitive.state === undefined ? {} : record(primitive.state, `${at}.state`);
      const state = (key: string) => flag(flags[key], `${at}.state.${key}`);
      const ring = primitive.face === "ring" ? record(primitive.ring, `${at}.ring`) : undefined;
      if (primitive.face !== "ring" && primitive.ring !== undefined) fail(`${at}.ring`, "is only for the ring face");
      return {
        face: primitive.face as ScenePrimitive["face"],
        rect: (primitive.rect as unknown[]).map((part, i) => finite(part, `${at}.rect[${i}]`, i < 2 ? -1e6 : 0, 1e6)) as Box,
        radius: optional(primitive.radius, `${at}.radius`, 0, 1e6, 0),
        height: finite(primitive.height, `${at}.height`, 0),
        material: primitive.material as string,
        finish: primitive.finish === true,
        state: { hover: state("hover"), pressed: state("pressed"), focus: state("focus"), disabled: state("disabled") },
        ...(ring ? { ring: { thickness: finite(ring.thickness, `${at}.ring.thickness`, 0), start: finite(ring.start, `${at}.ring.start`, -360, 360),
          sweep: finite(ring.sweep, `${at}.ring.sweep`, 0, 360), colour: hex(ring.colour, `${at}.ring.colour`) } } : {}),
      };
    }),
  };
}

/** The studio's default tokens (design language section 4; I0.4's generator). */
export const STUDIO_DEFAULTS: StudioTokens = { key: 12, keyRadius: 0.24, fill: 1.2, front: 0.12, strip: 2.5, floor: 0.03, ceiling: 0.25 };

// ---------------------------------------------------------------------------------------------------------------------
// Geometry (2D.2): the triangles are the part. The builders are core's, triangle for triangle.

/**
 * A part's triangles in part-local px (x right, y down, z up), with normals, UVs and a smoothing group per triangle:
 * triangles of one group share interpolated normals, and a change of group is a crease or facet edge (2D.10).
 */
export interface PartMesh { positions: Float64Array; normals: Float64Array; uvs: Float64Array; indices: Uint32Array; groups: Uint16Array }
const meshes = new Map<string, PartMesh>();
const unit = (x: number, y: number, z: number): Vec3 => { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; };

/** The tallest point of a profile above its base. */
export function profileHeight(shape: InstrumentProfile): number {
  if (shape.type === "lathe") return Math.max(...shape.points.map(point => point[1]));
  if (shape.type === "prism") return shape.height;
  return Math.max(...shape.outline.map(point => point[1]));
}

/**
 * A profile's triangles (2D.2): `lathe`, `prism` and `extrude`, cached by their parameters.
 *
 * **Normals and winding (2D.2).** A part is shaded with its vertex normals, which point out of the part; its winding
 * never decides its light (the reference's ray casts and shading ignore it). Every triangle is still wound the same way
 * against those normals, as core's `profileGeometry` winds them: in layer axes, `(b − a) × (c − a)` points against the
 * outward normal, which is a front face for a renderer that culls back faces or flips their normals (Lite's
 * double-sided PBR). `triangle` orients each triangle by its vertices' normals, whatever order a builder lists them in;
 * a degenerate triangle (a crease's empty band) keeps its order.
 */
export function profileMesh(shape: InstrumentProfile): PartMesh {
  const key = JSON.stringify(shape);
  const cached = meshes.get(key);
  if (cached) return cached;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [], groups: number[] = [];
  const vertex = (p: Vec3, n: Vec3, uv: Vec2) => { positions.push(...p); normals.push(...n); uvs.push(...uv); return positions.length / 3 - 1; };
  const triangle = (a: number, b: number, c: number, group: number) => {
    const at = (index: number, axis: number) => positions[index * 3 + axis]!, normal = (axis: number) => normals[a * 3 + axis]! + normals[b * 3 + axis]! + normals[c * 3 + axis]!;
    const e1 = [0, 1, 2].map(axis => at(b, axis) - at(a, axis)), e2 = [0, 1, 2].map(axis => at(c, axis) - at(a, axis));
    const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    if (cross[0]! * normal(0) + cross[1]! * normal(1) + cross[2]! * normal(2) > 0) indices.push(a, c, b); else indices.push(a, b, c);
    groups.push(group);
  };
  if (shape.type === "lathe") {
    // One ring per profile point, each with that point's normal revolved, so bands are smooth across the profile and a
    // repeated point with another normal is a crease: the band between them is empty and the next one is a new group.
    const segments = shape.segments ?? 48, count = shape.points.length;
    shape.points.forEach(([r, z, nr, nz], index) => {
      for (let step = 0; step <= segments; step++) {
        const angle = (step / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
        vertex([r * cos, r * sin, z], unit(nr * cos, nr * sin, nz), [step / segments, index / (count - 1)]);
      }
    });
    let group = 0;
    for (let index = 0; index + 1 < count; index++) {
      const [r0, z0] = shape.points[index]!, [r1, z1] = shape.points[index + 1]!;
      if (r0 === r1 && z0 === z1) group++;
      for (let step = 0; step < segments; step++) {
        const a = index * (segments + 1) + step, b = a + segments + 1;
        triangle(a, b, a + 1, group); triangle(a + 1, b, b + 1, group);
      }
    }
  } else if (shape.type === "prism") {
    const { width, length, height } = shape, radius = shape.radius ?? 0, taper = shape.taper ?? 0, chamfer = shape.chamfer ?? 0;
    // Three outlines: the base, the top of the side (inset by the taper), the top (inset by the chamfer as well).
    const rings = [{ inset: 0, z: 0 }, { inset: taper, z: height - chamfer }, { inset: taper + chamfer, z: height }]
      .map(({ inset, z }) => ({ z, ...outline(width - 2 * inset, length - 2 * inset, Math.max(0, radius - inset)) }));
    const count = rings[0]!.points.length;
    for (let band = 0; band < 2; band++) {
      const lower = rings[band]!, upper = rings[band + 1]!, start = positions.length / 3;
      if (upper.z - lower.z <= 1e-9) continue;
      for (let index = 0; index < count; index++) {
        const [x0, y0] = lower.points[index]!, [x1, y1] = upper.points[index]!, [nx, ny] = lower.normals[index]!;
        // The side leans in by its inset over its rise; the normal is perpendicular to that slope.
        const rise = upper.z - lower.z, run = Math.hypot(x1 - x0, y1 - y0);
        const normal = unit(nx * rise, ny * rise, run);
        vertex([x0, y0, lower.z], normal, [index / count, band / 2]);
        vertex([x1, y1, upper.z], normal, [index / count, (band + 1) / 2]);
      }
      for (let index = 0; index < count; index++) {
        const next = (index + 1) % count, a = start + index * 2, b = a + 1, c = start + next * 2, d = c + 1;
        triangle(a, c, b, band); triangle(b, c, d, band);
      }
    }
    // The top, fanned from its centre.
    const top = rings[2]!, centre = vertex([0, 0, height], [0, 0, 1], [0.5, 0.5]);
    for (const [x, y] of top.points) vertex([x, y, height], [0, 0, 1], [x / width + 0.5, y / length + 0.5]);
    for (let index = 0; index < count; index++) triangle(centre, centre + 1 + index, centre + 1 + ((index + 1) % count), 2);
  } else {
    // An [x, z] outline swept along y; flat facets, each its own group, both ends fanned from the outline's mean point.
    const { outline: points, width } = shape, half = width / 2, count = points.length;
    const [cx, cz] = points.reduce((sum, [x, z]) => [sum[0] + x / count, sum[1] + z / count], [0, 0]);
    const span = Math.max(1e-6, Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])));
    const minX = Math.min(...points.map(point => point[0]));
    for (let index = 0; index < count; index++) {
      const [x0, z0] = points[index]!, [x1, z1] = points[(index + 1) % count]!;
      let nx = z1 - z0, nz = -(x1 - x0);
      if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      const normal = unit(nx, 0, nz), start = positions.length / 3;
      for (const [px, py, pz] of [[x0, -half, z0], [x0, half, z0], [x1, half, z1], [x1, -half, z1]] as const) {
        vertex([px, py, pz], normal, [(px - minX) / span, (py + half) / width]);
      }
      triangle(start, start + 1, start + 2, index); triangle(start, start + 2, start + 3, index);
    }
    for (const [end, side] of [[0, -1], [1, 1]] as const) {
      const centre = vertex([cx, side * half, cz], [0, side, 0], [(cx - minX) / span, side < 0 ? 0 : 1]);
      for (const [x, z] of points) vertex([x, side * half, z], [0, side, 0], [(x - minX) / span, side < 0 ? 0 : 1]);
      for (let index = 0; index < count; index++) triangle(centre, centre + 1 + index, centre + 1 + ((index + 1) % count), count + end);
    }
  }
  const result = { positions: new Float64Array(positions), normals: new Float64Array(normals), uvs: new Float64Array(uvs), indices: new Uint32Array(indices), groups: new Uint16Array(groups) };
  meshes.set(key, result);
  return result;
}

/** Points of a rounded rectangle centred on the origin, clockwise on screen (y down), with outward unit normals. */
function outline(width: number, length: number, radius: number, segments = 8) {
  const rad = Math.max(0, Math.min(radius, width / 2, length / 2));
  const hx = width / 2 - rad, hy = length / 2 - rad;
  const corners: [number, number, number][] = [[hx, -hy, -Math.PI / 2], [hx, hy, 0], [-hx, hy, Math.PI / 2], [-hx, -hy, Math.PI]];
  const points: Vec2[] = [], normals: Vec2[] = [];
  for (const [cx, cy, start] of corners) for (let step = 0; step <= segments; step++) {
    const angle = start + (step / segments) * (Math.PI / 2), nx = Math.cos(angle), ny = Math.sin(angle);
    points.push([cx + nx * rad, cy + ny * rad]);
    normals.push([nx, ny]);
  }
  return { points, normals };
}

// ---------------------------------------------------------------------------------------------------------------------
// Poses (2D.2).

/** A part's pose at `t` (clamped to 0–1): `mix(from, to, t)` field by field; `axis` and `pivot` from `from`. */
export function poseAt(part: InstrumentPart, t: number): Required<InstrumentPose> {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const from = part.pose?.from ?? {}, to = part.pose?.to ?? from;
  const mix = (a = 0, b = 0) => a + (b - a) * k;
  return { travel: mix(from.travel, to.travel), slide: [mix(from.slide?.[0], to.slide?.[0]), mix(from.slide?.[1], to.slide?.[1])],
    turn: mix(from.turn, to.turn), tilt: mix(from.tilt, to.tilt), axis: from.axis ?? 0, pivot: [...(from.pivot ?? [0, 0, 0])] as Vec3 };
}

/** 4 × 4 matrices, column-major (`m[column * 4 + row]`), mapping column vectors. */
export type Matrix = Float64Array;
const identity = (): Matrix => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
const translation = (x: number, y: number, z: number): Matrix => { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; };
/** Rotation by `angle` radians about the unit axis `(x, y, z)` (Rodrigues). */
function rotation(x: number, y: number, z: number, angle: number): Matrix {
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c, m = identity();
  m[0] = c + x * x * k; m[1] = y * x * k + z * s; m[2] = z * x * k - y * s;
  m[4] = x * y * k - z * s; m[5] = c + y * y * k; m[6] = z * y * k + x * s;
  m[8] = x * z * k + y * s; m[9] = y * z * k - x * s; m[10] = c + z * z * k;
  return m;
}
export function multiply(a: Matrix, b: Matrix): Matrix {
  const m = new Float64Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
    m[column * 4 + row] = sum;
  }
  return m;
}
/** `m` applied to a point. */
export function transform(m: Matrix, x: number, y: number, z: number): Vec3 {
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}
/** `m`'s rotation applied to a direction (placements are rigid, so it maps normals too). */
export function rotate(m: Matrix, x: number, y: number, z: number): Vec3 {
  return [m[0]! * x + m[4]! * y + m[8]! * z, m[1]! * x + m[5]! * y + m[9]! * z, m[2]! * x + m[6]! * y + m[10]! * z];
}

/**
 * A part's placement for a pose, in layer px (2D.2), rigid with no scale or shear:
 * `M = T(at) · T(slide.x, slide.y, travel) · T(pivot) · R(axis, tilt) · R(z, turn) · T(−pivot)`.
 * In the layer's axes (y down) a positive turn takes +x towards +y, clockwise as seen; a positive tilt about the axis
 * at `axis` degrees raises the side at `axis + 90°`.
 */
export function poseMatrix(part: InstrumentPart, pose: Required<InstrumentPose>): Matrix {
  const [px, py, pz] = pose.pivot, deg = Math.PI / 180, axis = pose.axis * deg;
  let m = translation(part.at[0] + pose.slide[0], part.at[1] + pose.slide[1], part.at[2] + pose.travel);
  m = multiply(m, translation(px, py, pz));
  if (pose.tilt) m = multiply(m, rotation(Math.cos(axis), Math.sin(axis), 0, pose.tilt * deg));
  if (pose.turn) m = multiply(m, rotation(0, 0, 1, pose.turn * deg));
  return multiply(m, translation(-px, -py, -pz));
}
/** A part's placement at `t`. */
export const partMatrix = (part: InstrumentPart, t: number): Matrix => poseMatrix(part, poseAt(part, t));

/** Every vertex of a part at `t`, in layer px. */
export function posedVertices(part: InstrumentPart, shape: InstrumentProfile, t: number): Float64Array {
  const mesh = profileMesh(shape), m = partMatrix(part, t), out = new Float64Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const [x, y, z] = transform(m, mesh.positions[index]!, mesh.positions[index + 1]!, mesh.positions[index + 2]!);
    out[index] = x; out[index + 1] = y; out[index + 2] = z;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Camera and projection (2D.3).

/** Where a point appears on the screen (2B.1): `V + (X.xy − V) · D / (D − X.z)`. */
export function project(camera: InstrumentScene["camera"], [x, y, z]: Vec3): Vec2 {
  const [vx, vy] = camera.vanish, k = camera.distance / (camera.distance - z);
  return [vx + (x - vx) * k, vy + (y - vy) * k];
}
/** How far a point at height `h`, `r` from the vanishing point, moves outward on the screen: `r · h / (D − h)` (2D.3). */
export function drift(camera: InstrumentScene["camera"], [x, y, z]: Vec3): number {
  return (Math.hypot(x - camera.vanish[0], y - camera.vanish[1]) * z) / (camera.distance - z);
}
/** Signed distance from a point to a rounded box `[x, y, width, height]` with `radius`; negative inside. */
export function boxDistance(x: number, y: number, rect: Box, radius = 0): number {
  const [left, top, width, height] = rect, r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const qx = Math.abs(x - left - width / 2) - width / 2 + r, qy = Math.abs(y - top - height / 2) - height / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * The travel steps 2D.9 asks for: at least 32, and enough that a turning or tilting vertex's chord strays less than
 * 0.45 px from its arc (core's rule: the 0.5 px of 2D.9, with room for the projection's scale).
 */
export function travelSteps(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): number {
  let steps = 32;
  for (const part of object.parts) {
    if (!part.pose) continue;
    const { from, to } = part.pose, mesh = profileMesh(profiles[part.profile]!), pivot = from.pivot ?? [0, 0, 0];
    const angle = (Math.abs((to.turn ?? 0) - (from.turn ?? 0)) + Math.abs((to.tilt ?? 0) - (from.tilt ?? 0))) * (Math.PI / 180);
    if (!angle) continue;
    let reach = 0;
    for (let index = 0; index < mesh.positions.length; index += 3) {
      reach = Math.max(reach, Math.hypot(mesh.positions[index]! - pivot[0], mesh.positions[index + 1]! - pivot[1], mesh.positions[index + 2]! - pivot[2]));
    }
    if (reach > 0.45) steps = Math.max(steps, Math.ceil(angle / (2 * Math.acos(1 - 0.45 / reach))));
  }
  return Math.min(steps, 4096);
}

/** A vertex over the travel: where it is, at which `t`, and how far inside `bounds` it lies (px, negative outside). */
export interface TravelVertex { part: number; t: number; point: Vec3; inset: number }
/** Calls `visit` for every vertex of every part at every travel step (static parts once, at `t` 0). */
function eachVertex(object: InstrumentObject, profiles: Record<string, InstrumentProfile>, visit: (part: number, t: number, x: number, y: number, z: number) => void) {
  const steps = travelSteps(object, profiles);
  object.parts.forEach((part, index) => {
    const moving = !!part.pose;
    for (let step = 0; step <= (moving ? steps : 0); step++) {
      const t = moving ? step / steps : 0, vertices = posedVertices(part, profiles[part.profile]!, t);
      for (let at = 0; at < vertices.length; at += 3) visit(index, t, vertices[at]!, vertices[at + 1]!, vertices[at + 2]!);
    }
  });
}

/**
 * The binding vertex of each part (2D.3): over the whole travel, the vertex whose orthographic position comes closest
 * to the edge of `bounds`, with its height and its orthographic inset. Ties go to the taller vertex.
 */
export function bindingVertex(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): TravelVertex[] {
  const bounds = object.bounds ?? { rect: object.rect, radius: 0 };
  const best: TravelVertex[] = object.parts.map((_, part) => ({ part, t: 0, point: [0, 0, 0], inset: Infinity }));
  eachVertex(object, profiles, (part, t, x, y, z) => {
    const inset = -boxDistance(x, y, bounds.rect, bounds.radius), current = best[part]!;
    if (inset < current.inset - 1e-9 || (Math.abs(inset - current.inset) <= 1e-9 && z > current.point[2])) best[part] = { part, t, point: [x, y, z], inset };
  });
  return best;
}

/**
 * The camera rule (2D.3): `max(2400, max over parts of r · h / (inset − 0.5) + h)`, with `r` the stage's half-diagonal
 * and `h` and `inset` the part's binding vertex. A raised binding vertex 0.5 px or less inside its bounds cannot be
 * contained at any distance (Infinity).
 */
export function cameraDistance(stage: { width: number; height: number }, objects: readonly InstrumentObject[], profiles: Record<string, InstrumentProfile>): number {
  const r = Math.hypot(stage.width, stage.height) / 2;
  let distance = CAMERA_FLOOR;
  for (const object of objects) for (const { point: [, , h], inset } of bindingVertex(object, profiles)) {
    if (h <= 0) continue;
    distance = Math.max(distance, inset > CONTAINMENT_MARGIN ? (r * h) / (inset - CONTAINMENT_MARGIN) + h : Infinity);
  }
  return distance;
}

/** The orthographic footprint of an object's moving parts (all parts when none moves) over the whole travel. */
export function travelFootprint(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): { rect: Box; height: number } {
  const moving = object.parts.some(part => part.pose);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, height = 0;
  eachVertex(object, profiles, (part, _t, x, y, z) => {
    if (moving && !object.parts[part]!.pose) return;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); height = Math.max(height, z);
  });
  return { rect: [left, top, right - left, bottom - top], height };
}
/**
 * The box rule (design language section 6): the moving parts' footprint over the whole travel, plus
 * `ceil(drift(h_max) + 1)` on every side, with the drift taken at the corner of the reference stage at `D` = 2,400.
 */
export function boxForTravel(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): { rect: Box; margin: number } {
  const { rect: [x, y, w, h], height } = travelFootprint(object, profiles);
  const r = Math.hypot(REFERENCE_STAGE.width, REFERENCE_STAGE.height) / 2;
  const margin = Math.ceil((r * height) / (CAMERA_FLOOR - height) + 1);
  return { rect: [x - margin, y - margin, w + 2 * margin, h + 2 * margin], margin };
}

/** The outcome of 2D.9's containment check for one object. */
export interface ObjectContainment {
  contained: boolean;
  /** Why it is not: a vertex too close to or past `bounds`, or `bounds` leaving the layer's box. */
  reason?: "vertex" | "layer";
  steps: number;
  /** The closest approach: the vertex (projected) nearest the edge of `bounds`, over the whole travel. */
  closest: TravelVertex & { projected: Vec2 };
  /** How far that vertex lies past `bounds`, px (0 when it is inside). */
  overshoot: number;
}
/** How far past the layer's box `bounds` may reach and still be drawn as parts (core's `BOUNDS_TOLERANCE`). */
export const BOUNDS_TOLERANCE = 0.5;
/**
 * Containment over the whole travel (2D.9, rule 1): at every step every vertex of every part, projected through the
 * scene's camera, lies at least 0.5 px inside `bounds`. An object whose `bounds` leave the layer's box (by more than half
 * a pixel) is not contained either: no clip could keep its parts off other content (core's rule).
 */
export function objectContained(object: InstrumentObject, scene: Pick<InstrumentScene, "camera" | "profiles" | "extent">): ObjectContainment {
  const bounds = object.bounds ?? { rect: object.rect, radius: 0 };
  let closest: ObjectContainment["closest"] = { part: 0, t: 0, point: [0, 0, 0], inset: Infinity, projected: [0, 0] };
  eachVertex(object, scene.profiles, (part, t, x, y, z) => {
    if (z >= scene.camera.distance) { if (closest.inset > -Infinity) closest = { part, t, point: [x, y, z], inset: -Infinity, projected: [NaN, NaN] }; return; }
    const projected = project(scene.camera, [x, y, z]), inset = -boxDistance(projected[0], projected[1], bounds.rect, bounds.radius);
    if (inset < closest.inset) closest = { part, t, point: [x, y, z], inset, projected };
  });
  const steps = travelSteps(object, scene.profiles), overshoot = Math.max(0, -closest.inset);
  const [bx, by, bw, bh] = bounds.rect, { width, height } = scene.extent;
  if (bx < -BOUNDS_TOLERANCE || by < -BOUNDS_TOLERANCE || bx + bw > width + BOUNDS_TOLERANCE || by + bh > height + BOUNDS_TOLERANCE) {
    return { contained: false, reason: "layer", steps, closest, overshoot };
  }
  const contained = closest.inset >= CONTAINMENT_MARGIN;
  return { contained, ...(contained ? {} : { reason: "vertex" as const }), steps, closest, overshoot };
}

/** Indices of the objects that fail containment, and so are drawn as their Relief primitives (2D.9, rule 2). */
const steppedCache = new WeakMap<InstrumentScene, number[]>();
export function steppedDown(scene: InstrumentScene): number[] {
  let stepped = steppedCache.get(scene);
  if (!stepped) { stepped = scene.objects.flatMap((object, index) => (objectContained(object, scene).contained ? [] : [index])); steppedCache.set(scene, stepped); }
  return stepped;
}

/**
 * The face as a version 1 scene (part 2): the scene's primitives, then the Relief primitive of every stepped-down object
 * in object order (2D.9, rule 2). `stepped` defaults to the objects that fail containment.
 */
export function instrumentFaceScene(scene: InstrumentScene, stepped: readonly number[] = steppedDown(scene)): StrataScene {
  return {
    format: "strata-scene", version: 1, extent: scene.extent, ...(scene.outset ? { outset: scene.outset } : {}), backdrop: scene.backdrop,
    light: { azimuth: scene.light.azimuth, elevation: scene.light.elevation }, bevel: scene.bevel, shadow: { strength: scene.shadow.strength },
    interior: scene.interior, state: scene.state, focus: scene.focus,
    materials: Object.fromEntries(Object.entries(scene.materials).map(([name, layers]) => [name, {
      base: { roughness: layers.base?.roughness ?? 1, metallic: layers.base?.metallic ?? 0 },
      coat: { strength: layers.coat?.strength ?? 0, roughness: layers.coat?.roughness ?? 0, ior: layers.coat?.ior ?? 1.5 },
      emissive: { strength: layers.emissive?.strength ?? 0 } }])),
    primitives: [...scene.primitives, ...stepped.map(index => scene.objects[index]!.relief!)],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Emitters, part shadows and the face factor (2D.4, 2D.7).

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mixValue = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const normalize = (v: readonly number[]): Vec3 => unit(v[0]!, v[1]!, v[2]!);

/**
 * The emitter term at a point `X` with unit normal `n`, per channel (2D.4):
 * `E = I · colour · max(n · d / ‖d‖, 0) / (π · ‖d‖²) · clamp(1 − (‖d‖² / R²)², 0, 1)²`, `d = position − X`.
 */
export function emitterTerm(emitter: InstrumentEmitter, point: Vec3, normal: Vec3, strength = emitter.strength): Vec3 {
  const d: Vec3 = [emitter.position[0] - point[0], emitter.position[1] - point[1], emitter.position[2] - point[2]];
  const squared = dot(d, d), length = Math.sqrt(squared);
  if (length < 1e-9) return [0, 0, 0];
  const window = clamp(1 - (squared / (emitter.radius * emitter.radius)) ** 2, 0, 1) ** 2;
  const scale = (strength * Math.max(dot(normal, d) / length, 0)) / (Math.PI * squared) * window;
  return [emitter.colour[0] * scale, emitter.colour[1] * scale, emitter.colour[2] * scale];
}
/** `Eᶠ(p)`: the emitter light on the face at `(x, y)`, each emitter at `face` of its strength; `"layer"` ones × `a(p)`. */
export function faceEmitters(scene: InstrumentScene, x: number, y: number, alpha: number): Vec3 {
  const sum: Vec3 = [0, 0, 0];
  for (const emitter of scene.emitters ?? []) {
    const term = emitterTerm(emitter, [x, y, 0], [0, 0, 1], emitter.strength * (emitter.face ?? 1));
    const share = emitter.reach === "layer" ? alpha : 1;
    for (let channel = 0; channel < 3; channel++) sum[channel]! += term[channel]! * share;
  }
  return sum;
}

/** A profile's local bounds: x, y and z ranges, and its largest radius about the z axis. */
const boundsCache = new WeakMap<PartMesh, { low: Vec3; high: Vec3; radius: number }>();
export function profileBounds(shape: InstrumentProfile) {
  const mesh = profileMesh(shape), cached = boundsCache.get(mesh);
  if (cached) return cached;
  const values = mesh.positions;
  const low: Vec3 = [Infinity, Infinity, Infinity], high: Vec3 = [-Infinity, -Infinity, -Infinity];
  let radius = 0;
  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis]!, values[index + axis]!); high[axis] = Math.max(high[axis]!, values[index + axis]!); }
    radius = Math.max(radius, Math.hypot(values[index]!, values[index + 1]!));
  }
  const result = { low, high, radius };
  boundsCache.set(mesh, result);
  return result;
}
/**
 * What a part casts on the face at `t` (2D.7): its `caster`, `null` for none, or (omitted) the rounded box bounding the
 * posed part's orthographic footprint at the part's mean height. A lathe that does not tilt is a disc about its posed
 * axis (a ball is a disc at its centre's height); any other part takes the box around its posed local bounds.
 */
export function partCaster(part: InstrumentPart, shape: InstrumentProfile, t: number): InstrumentCaster | null {
  if (part.caster !== undefined) return part.caster;
  const bounds = profileBounds(shape), m = partMatrix(part, t), tilted = (part.pose?.from.tilt ?? 0) !== 0 || (part.pose?.to.tilt ?? 0) !== 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  if (shape.type === "lathe" && !tilted) {
    const [cx, cy, z0] = transform(m, 0, 0, bounds.low[2]);
    minX = cx - bounds.radius; maxX = cx + bounds.radius; minY = cy - bounds.radius; maxY = cy + bounds.radius;
    minZ = z0; maxZ = z0 + bounds.high[2] - bounds.low[2];
  } else {
    for (const x of [bounds.low[0], bounds.high[0]]) for (const y of [bounds.low[1], bounds.high[1]]) for (const z of [bounds.low[2], bounds.high[2]]) {
      const [px, py, pz] = transform(m, x, y, z);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    }
  }
  const height = (minZ + maxZ) / 2, width = maxX - minX, length = maxY - minY;
  if (!(height > 0) || !(width > 0) || !(length > 0)) return null;
  const radius = shape.type === "lathe" ? Math.min(width, length) / 2 : shape.type === "prism" ? Math.min(shape.radius ?? 0, width / 2, length / 2) : 0;
  return { rect: [minX, minY, width, length], radius, height };
}
/** `Sₚ(p)` (2D.4): the darkest of 2.8's `Sᵢ` over the casters of the drawn objects' parts, at each object's `t`. */
export function partShadow(scene: InstrumentScene, x: number, y: number, stepped: readonly number[] = steppedDown(scene)): number {
  const L = lightVector(scene.light.azimuth, scene.light.elevation), ox = -L[0] / L[2], oy = -L[1] / L[2];
  let shadow = 0;
  scene.objects.forEach((object, index) => {
    if (stepped.includes(index)) return;
    for (const part of object.parts) {
      const caster = partCaster(part, scene.profiles[part.profile]!, object.t ?? 0);
      if (!caster || caster.height <= 0) continue;
      const h = caster.height;
      const d = boxDistance(x, y, caster.rect, caster.radius), shifted = boxDistance(x - ox * h, y - oy * h, caster.rect, caster.radius);
      shadow = Math.max(shadow, scene.shadow.strength * (1 - smoothstep(-0.5 * h, 1.5 * h + 1, shifted)) * smoothstep(-1, 0.5, d));
    }
  });
  return shadow;
}

/** The face factor at a point and its parts (2D.4). */
export interface FaceFactor {
  /** `Φ`, per channel. */
  factor: Vec3;
  /** `Φ₀ = (1 − Sₚ) · (1 + Eᶠ)`, before the guard. */
  unguarded: Vec3;
  shadow: number;
  light: Vec3;
  /** `q`: the distance to the nearest protected rect (0 inside one, Infinity with none). */
  distance: number;
  /** 2.9's `k` at the point, or 1 where the guard's weight is 0. */
  k: number;
}
/** The distance from a point to the nearest protected rect (0 inside one, and everywhere with `"extent"`). */
export function protectedDistance(scene: InstrumentScene, x: number, y: number, grow = 0): number {
  if (scene.protected === "extent") return 0;
  let distance = Infinity;
  for (const [left, top, width, height] of scene.protected ?? []) {
    distance = Math.min(distance, Math.max(0, boxDistance(x, y, [left - grow, top - grow, width + 2 * grow, height + 2 * grow])));
  }
  return distance;
}
/**
 * The guarded face factor `Φ` (2D.4): part shadows and emitter light multiply the layer's result; inside protected
 * rects the face's whole change (relief, part shadows and emitter light together) stays within `interior.max`:
 *
 * ```text
 * Φ₀ = (1 − Sₚ) · (1 + Eᶠ)
 * Φᵍ = clamp(Φ₀, (1 − m) / k, (1 + m) / k)
 * Φ  = mix(Φᵍ, Φ₀, smoothstep(0, feather, q))
 * ```
 */
export function faceFactor(scene: InstrumentScene, captured: CapturedColour, x: number, y: number, face = instrumentFaceScene(scene)): FaceFactor {
  const within = x >= 0 && y >= 0 && x <= scene.extent.width && y <= scene.extent.height;
  const alpha = within ? captured(x, y)[3] : 0;
  const shadow = partShadow(scene, x, y), light = faceEmitters(scene, x, y, alpha);
  const unguarded = light.map(e => (1 - shadow) * (1 + e)) as Vec3;
  // 2.9's guarded factor of the face beneath, so that k · Φ stays within 1 ± m.
  const terms = shadingTerms(face, x, y), m = scene.interior.max;
  const scaled = terms.shadow * (scene.shadow.strength > m ? m / scene.shadow.strength : 1);
  const k = terms.guard > 0 ? clamp(terms.interior * (1 - scaled), 1 - m, 1 + m) : 1;
  const distance = protectedDistance(scene, x, y), feather = scene.feather ?? 4;
  const ease = distance === Infinity ? 1 : feather > 0 ? smoothstep(0, feather, distance) : distance > 0 ? 1 : 0;
  const factor = unguarded.map(value => mixValue(clamp(value, (1 - m) / k, (1 + m) / k), value, ease)) as Vec3;
  return { factor, unguarded, shadow, light, distance, k };
}
/** Step 2 of 2D.8 at a point: the layer's result (part 2, with the stepped-down objects) times `Φ`, over the backdrop. */
export function shadeFace(scene: InstrumentScene, captured: CapturedColour, x: number, y: number, face = instrumentFaceScene(scene)): Rgb01 {
  const out = shadePoint(face, captured, x, y), { factor } = faceFactor(scene, captured, x, y, face);
  return out.map((channel, index) => clamp(channel * factor[index]!, 0, 1)) as unknown as Rgb01;
}

// ---------------------------------------------------------------------------------------------------------------------
// Materials and the studio (2D.5).

/** sRGB decoding and encoding, per channel. */
export const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const enc = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const linear = (colour: string): Vec3 => parseHex(colour).map(channel => lin(channel / 255)) as unknown as Vec3;
const angleBetween = (a: Vec3, b: Vec3) => Math.acos(clamp(dot(a, b), -1, 1));

/**
 * The studio's radiance in a world direction (2D.5): a room rising from floor to ceiling, a softbox at the key light,
 * a broad fill across the vertical from it below the horizon, a dim front on the key's side and a strip all around
 * 12–20° above the horizon, slightly cool. `up(ω) = −ω.y`, the screen's up.
 */
export function studioRadiance(direction: Vec3, studio: Partial<StudioTokens> = {}, light: { azimuth: number; elevation: number }): Vec3 {
  const s = { ...STUDIO_DEFAULTS, ...studio };
  const L = lightVector(light.azimuth, light.elevation), l = Math.hypot(L[0], L[2]) || 1, w = normalize(direction), up = -w[1];
  const toKey: Vec3 = L, toFill: Vec3 = [(-0.937 * L[0]) / l, 0.35, (-0.937 * L[2]) / l], toFront: Vec3 = [L[0] / l, 0, L[2] / l];
  const room = s.floor + (s.ceiling - s.floor) * smoothstep(-0.35, 0.65, up);
  const value = room
    + s.key * smoothstep(s.keyRadius + 0.1, s.keyRadius, angleBetween(w, toKey))
    + 0.5 * s.fill * smoothstep(0.85, 0.55, angleBetween(w, toFill))
    + s.front * smoothstep(1.3, 0.9, angleBetween(w, toFront))
    + s.strip * smoothstep(0.16, 0.2, up) * smoothstep(0.38, 0.34, up);
  return [value * 0.97, value * 0.99, value];
}
/**
 * The rotation about the screen's vertical that brings `studioHdr`'s canonical image (its softbox at longitude 0) to the
 * key light, in radians, for an engine that loads the studio as an image (Lite's `setEnvironmentRotation`; I0.4).
 */
export function studioRotation(light: { azimuth: number; elevation: number }): number {
  const L = lightVector(light.azimuth, light.elevation);
  // Lite's world is y up and +z away from the viewer: the direction towards the light is (L.x, −L.y, −L.z).
  return Math.atan2(L[0], L[2]);
}
/**
 * The studio as a Radiance `.hdr` (RLE scanlines of literal runs), `width` × `width / 2`, for engines that load an
 * equirectangular image (2D.5). It is authored in core's canonical frame (y up, +z away from the viewer): the first row
 * is +y, file column longitude `l` is the direction `(sin l, ·, cos l)`, and the softbox lies at longitude 0 at the key
 * light's height. Turned by `studioRotation(light)` about the vertical, it is `studioRadiance` exactly.
 */
export function studioHdr(studio: Partial<StudioTokens> = {}, light: { azimuth: number; elevation: number }, width = 512): Uint8Array {
  const height = width / 2;
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const runsPerChannel = Math.ceil(width / 128), rowBytes = 4 + 4 * (width + runsPerChannel);
  const bytes = new Uint8Array(header.length + height * rowBytes);
  bytes.set(header);
  let offset = header.length;
  // A world direction w reads the image at rotateY(w, θ) (Lite: `rotateY(v, θ) = (x cos θ + z sin θ, y, −x sin θ + z
  // cos θ)`), so the image holds, at its own direction c, the radiance of w = rotateY(c, −θ): (w.x, −w.y, −w.z) in the
  // model's axes. The softbox then lies at c = (0, −L.y, −ℓ) in the file, the light's height, on the viewer's side.
  const theta = studioRotation(light), cos = Math.cos(theta), sin = Math.sin(theta);
  const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  for (let row = 0; row < height; row++) {
    const polar = ((row + 0.5) / height) * Math.PI;
    for (let column = 0; column < width; column++) {
      const longitude = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
      const c: Vec3 = [Math.sin(polar) * Math.sin(longitude), Math.cos(polar), Math.sin(polar) * Math.cos(longitude)];
      const w: Vec3 = [c[0] * cos - c[2] * sin, c[1], c[0] * sin + c[2] * cos];
      const [r, g, b] = studioRadiance([w[0], -w[1], -w[2]], studio, light), peak = Math.max(r, g, b);
      if (peak < 1e-32) { for (const channel of channels) channel[column] = 0; continue; }
      const exponent = Math.floor(Math.log2(peak)) + 1, scale = 256 / 2 ** exponent;
      channels[0]![column] = Math.min(255, Math.floor(r * scale)); channels[1]![column] = Math.min(255, Math.floor(g * scale));
      channels[2]![column] = Math.min(255, Math.floor(b * scale)); channels[3]![column] = exponent + 128;
    }
    bytes.set([2, 2, width >> 8, width & 255], offset);
    offset += 4;
    for (const channel of channels) for (let start = 0; start < width; start += 128) {
      const count = Math.min(128, width - start);
      bytes[offset++] = count;
      bytes.set(channel.subarray(start, start + count), offset);
      offset += count;
    }
  }
  return bytes.subarray(0, offset);
}

/** A recipe's values for the reference shading, with every default of 2D.5. */
interface Shading {
  rho: Vec3; albedo: Vec3; F0: Vec3; roughness: number; alpha: number; metallic: number; direct: number;
  coat: number; coatRoughness: number; coatAlpha: number; coatF0: number; emissive: Vec3;
}
/** The dielectric reflectance at normal incidence (2D.5): Lite's `reflectance`, 0.04. */
export const DIELECTRIC_F0 = 0.04;
function shadingOf(recipe: InstrumentRecipe): Shading {
  const base = recipe.base ?? {}, metallic = base.metallic ?? 0, rho = linear(base.colour ?? "#ffffff"), roughness = clamp(base.roughness ?? 1, 0, 1);
  const f0 = recipe.reflectance?.f0 ?? 1, tint = linear(recipe.reflectance?.tint ?? "#ffffff");
  const coat = recipe.coat?.strength ?? 0, coatRoughness = clamp(recipe.coat?.roughness ?? 0, 0, 1), ior = recipe.coat?.ior ?? 1.5;
  const emissive = linear(recipe.emissive?.colour ?? "#ffffff").map(c => c * (recipe.emissive?.strength ?? 0)) as Vec3;
  let F0 = tint.map((c, i) => mixValue(DIELECTRIC_F0 * f0 * c, rho[i]!, metallic)) as Vec3;
  // A coat remaps the base's F0 to its reflectance under the coat's index (`getR0RemappedForClearCoat`), by its strength.
  if (coat > 0) F0 = F0.map(f => { const s = Math.sqrt(f), a = 1 - ior, b = 1 + ior; return mixValue(f, clamp(((a + b * s) / (b + a * s)) ** 2, 0, 1), coat); }) as Vec3;
  return {
    rho, metallic, direct: base.direct ?? 1, roughness, alpha: roughness * roughness + 0.0005, F0,
    albedo: rho.map(c => c * (1 - DIELECTRIC_F0) * (1 - metallic)) as Vec3,
    coat, coatRoughness, coatAlpha: coatRoughness * coatRoughness + 0.0005, coatF0: ((1 - ior) / (1 + ior)) ** 2, emissive,
  };
}
const ggx = (nh: number, alpha: number) => { const a2 = alpha * alpha, d = nh * nh * (a2 - 1) + 1; return a2 / (Math.PI * d * d); };
const smith = (nl: number, nv: number, alpha: number) => {
  const a2 = alpha * alpha, denominator = nl * Math.sqrt(nv * nv * (1 - a2) + a2) + nv * Math.sqrt(nl * nl * (1 - a2) + a2);
  return denominator > 0 ? 0.5 / denominator : 0;
};
const schlick = (cosine: number, f0: number) => f0 + (1 - f0) * (1 - cosine) ** 5;
/** The base-2 radical inverse: the second coordinate of the Hammersley points of the prefilter and the LUT. */
const radical = (index: number) => { let result = 0, fraction = 0.5; for (let i = index; i > 0; i = Math.floor(i / 2)) { result += (i % 2) * fraction; fraction /= 2; } return result; };
/** An orthonormal frame about `n`. */
function frame(n: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const t = normalize([a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]]);
  return [t, [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]];
}
const along = (n: Vec3, [t, b]: [Vec3, Vec3], x: number, y: number, z: number): Vec3 => [t[0] * x + b[0] * y + n[0] * z, t[1] * x + b[1] * y + n[1] * z, t[2] * x + b[2] * y + n[2] * z];
/** The GGX half vector of Hammersley point `i` of `count` at `alpha` about `n`: azimuth `2π i / count`, polar angle from `radical(i)`. */
function halfVector(n: Vec3, basis: [Vec3, Vec3], i: number, count: number, alpha: number): Vec3 {
  const phi = (2 * Math.PI * i) / count, u = radical(i), cosH = Math.sqrt((1 - u) / (1 + (alpha * alpha - 1) * u)), sinH = Math.sqrt(Math.max(0, 1 - cosH * cosH));
  return along(n, basis, sinH * Math.cos(phi), sinH * Math.sin(phi), cosH);
}

/** The point count of the prefilter and of the reflectance table (2D.5). */
export const ENVIRONMENT_SAMPLES = 1024;
/** The prefilter's mips: mip `k` holds GGX alpha `2^(k / 0.8) / 256`; a lookup at alpha `α` reads lod `0.8 · log2(256 · α)`. */
export const PREFILTER_MIPS = 9;
const mipAlpha = (k: number) => 2 ** (k / 0.8) / 256;

/**
 * The turn the prefiltered mips see the studio through (2D.5, *Lite's environment orientation*): Lite 1.33 copies the
 * first mip of its specular cube as loaded, but computes every other mip at the direction its prefilter shader's cube
 * face table gives each texel (`hdr-prefilter-cube.compute.wgsl`), which is a 180° turn from the direction WebGPU samples
 * that texel at. So a lookup that reads mip 0 (a mirror) sees the studio where it is, while one that reads mips 1 and up
 * sees `studio(T(ω))`, with `T` the 180° turn about the horizontal axis `((cos θ − sin θ), 0, −(sin θ + cos θ)) / √2`
 * (layer axes; `θ = studioRotation(light)`): the screen's up becomes its down. The irradiance (spherical harmonics, from
 * the image itself) is not turned. It is an engine defect the model follows until it is fixed upstream (change log).
 */
export function environmentTurn(direction: Vec3, light: { azimuth: number; elevation: number }): Vec3 {
  const theta = studioRotation(light), c = Math.cos(theta), s = Math.sin(theta);
  const axis: Vec3 = [(c - s) / Math.SQRT2, 0, -(s + c) / Math.SQRT2], d = dot(direction, axis);
  return [2 * d * axis[0] - direction[0], 2 * d * axis[1] - direction[1], 2 * d * axis[2] - direction[2]];
}
/**
 * The prefiltered studio at alpha `q` about `d` (2D.5): `Σ studio(ω_i) · (d · ω_i) / Σ (d · ω_i)` over the 1,024 GGX
 * reflections `ω_i` of `d` about half vectors at alpha `q`, with `n = v = d` (split-sum's assumption).
 */
function prefilter(d: Vec3, q: number, radiance: (w: Vec3) => Vec3): Vec3 {
  const basis = frame(d), sum: Vec3 = [0, 0, 0];
  let weight = 0;
  for (let i = 0; i < ENVIRONMENT_SAMPLES; i++) {
    const h = halfVector(d, basis, i, ENVIRONMENT_SAMPLES, q), dh = Math.max(dot(d, h), 0);
    const w: Vec3 = [2 * dh * h[0] - d[0], 2 * dh * h[1] - d[1], 2 * dh * h[2] - d[2]], l = dot(d, w);
    if (l <= 0) continue;
    const value = radiance(w);
    for (let channel = 0; channel < 3; channel++) sum[channel]! += value[channel]! * l;
    weight += l;
  }
  return sum.map(value => value / weight) as Vec3;
}
/**
 * The specular environment `Lspec(r, α)` (2D.5): the prefiltered studio at lod `clamp(0.8 · log2(256 · α), 0, 8)`,
 * linear between the two mips about it. Mip 0 is the studio at `r`; mip `k ≥ 1` is the prefilter at alpha
 * `2^(k / 0.8) / 256` of the studio seen through `T` (`environmentTurn`).
 */
export function specularEnvironment(r: Vec3, alpha: number, studio: Partial<StudioTokens>, light: { azimuth: number; elevation: number }): Vec3 {
  const direct = (w: Vec3) => studioRadiance(w, studio, light), turned = (w: Vec3) => direct(environmentTurn(w, light));
  const mip = (k: number) => (k === 0 ? direct(r) : prefilter(r, mipAlpha(k), turned));
  const lod = clamp(0.8 * Math.log2(256 * alpha), 0, PREFILTER_MIPS - 1), k = Math.floor(lod), f = lod - k;
  const low = mip(k);
  if (f <= 0) return low;
  const high = mip(Math.min(PREFILTER_MIPS - 1, k + 1));
  return low.map((value, i) => mixValue(value, high[i]!, f)) as Vec3;
}

/** The order-2 spherical-harmonic irradiance of a studio, over π (2D.5), cached per studio and light. */
const irradianceCache = new Map<string, (n: Vec3) => Vec3>();
/**
 * `E(n)` (2D.5): the studio projected on the nine real spherical harmonics over a 512 × 256
 * equirectangular grid, convolved with the clamped cosine and divided by π, then evaluated at `n` as Lite evaluates its
 * pre-scaled harmonics. It is "average radiance": a white Lambertian surface under a uniform studio of 1 gets 1.
 */
export function studioIrradiance(n: Vec3, studio: Partial<StudioTokens>, light: { azimuth: number; elevation: number }): Vec3 {
  const key = JSON.stringify([studio, light.azimuth, light.elevation]);
  let evaluate = irradianceCache.get(key);
  if (!evaluate) {
    const width = 512, height = 256, sh = [new Float64Array(9), new Float64Array(9), new Float64Array(9)];
    let total = 0;
    for (let row = 0; row < height; row++) {
      const polar = ((row + 0.5) / height) * Math.PI, s = Math.sin(polar), c = Math.cos(polar), dOmega = s * (Math.PI / height) * ((2 * Math.PI) / width);
      for (let column = 0; column < width; column++) {
        const azimuth = ((2 * (column + 0.5)) / width - 1) * Math.PI, x = s * Math.sin(azimuth), y = c, z = s * Math.cos(azimuth);
        // (x, y, z) is in Lite's axes (y up, +z away); the layer's are (x, −y, −z).
        const value = studioRadiance([x, -y, -z], studio, light);
        const basis = [0.282094791773878, 0.48860251190292 * y, 0.48860251190292 * z, 0.48860251190292 * x, 1.092548430592079 * x * y, 1.092548430592079 * y * z,
          0.31539156525252 * (3 * z * z - 1), 1.092548430592079 * x * z, 0.54627421529604 * (x * x - y * y)];
        total += dOmega;
        for (let channel = 0; channel < 3; channel++) for (let i = 0; i < 9; i++) sh[channel]![i]! += value[channel]! * basis[i]! * dOmega;
      }
    }
    // The cosine convolution (1, 2/3, 1/4), then Babylon's polynomial over π and its pre-scaled harmonics.
    const convolve = [1, 2 / 3, 2 / 3, 2 / 3, 0.25, 0.25, 0.25, 0.25, 0.25].map(k => (k * 4 * Math.PI) / total);
    const harmonics = sh.map(channel => {
      const c = channel.map((value, i) => value * convolve[i]!), p = 1 / Math.PI;
      const px = c[3]! * 1.02333 * p, py = c[1]! * 1.02333 * p, pz = c[2]! * 1.02333 * p;
      const xx = (c[0]! * 0.886227 - c[6]! * 0.247708 + c[8]! * 0.429043) * p, yy = (c[0]! * 0.886227 - c[6]! * 0.247708 - c[8]! * 0.429043) * p, zz = (c[0]! * 0.886227 + c[6]! * 0.495417) * p;
      const yz = c[5]! * 0.858086 * p, zx = c[7]! * 0.858086 * p, xy = c[4]! * 0.858086 * p;
      return { L00: (xx + yy) * 0.3333338747897695 + zz * 0.33333298856284405, L1_1: py * 1.4999984284682104, L10: pz * 1.4999984284682104, L11: px * 1.4999984284682104,
        L2_2: xy * 3.999982863580422, L2_1: yz * 3.999982863580422, L20: zz * 1.3333326611423701 - (xx + yy) * 0.6666653397393608, L21: zx * 3.999982863580422, L22: (xx - yy) * 1.999991431790211 };
    });
    evaluate = ([nx, ny, nz]: Vec3) => {
      const x = nx, y = -ny, z = -nz;
      return harmonics.map(h => h.L00 + h.L1_1 * y + h.L10 * z + h.L11 * x + h.L2_2 * (y * x) + h.L2_1 * (y * z) + h.L20 * (3 * z * z - 1) + h.L21 * (z * x) + h.L22 * (x * x - y * y)) as Vec3;
    };
    if (irradianceCache.size > 16) irradianceCache.clear();
    irradianceCache.set(key, evaluate);
  }
  return evaluate(n);
}

/** The split-sum reflectance table (2D.5) at `(n · v, roughness)`: `[A, B]`, with `F0 · A + B` the specular reflectance. */
const tableCache = new Map<string, [number, number]>();
export function reflectanceTable(nv: number, roughness: number): [number, number] {
  const b = Math.max(nv, 0.001), r = Math.max(roughness, 0.04), key = `${b},${r}`;
  const cached = tableCache.get(key);
  if (cached) return cached;
  const v: Vec3 = [Math.sqrt(1 - b * b), 0, b], a2 = (r * r) ** 2, n: Vec3 = [0, 0, 1], basis: [Vec3, Vec3] = [[1, 0, 0], [0, 1, 0]];
  let A = 0, B = 0;
  for (let i = 0; i < ENVIRONMENT_SAMPLES; i++) {
    const h = halfVector(n, basis, i, ENVIRONMENT_SAMPLES, Math.sqrt(a2)), vh = Math.max(dot(v, h), 0);
    const l = 2 * vh * h[2] - v[2], nh = Math.max(h[2], 0);
    if (l <= 0 || nh <= 0) continue;
    const g = (0.5 / Math.max(l * Math.sqrt(b * b * (1 - a2) + a2) + b * Math.sqrt(l * l * (1 - a2) + a2), 1e-6)) * l * ((4 * vh) / nh), m = (1 - vh) ** 5;
    A += (1 - m) * g; B += m * g;
  }
  const result: [number, number] = [A / ENVIRONMENT_SAMPLES, B / ENVIRONMENT_SAMPLES];
  if (tableCache.size > 4096) tableCache.clear();
  tableCache.set(key, result);
  return result;
}

/** The output transform of a part (2D.5): Lite's image processing as core leaves it: exposure 0.8, gamma 2.2, contrast 1.2. */
export const PART_EXPOSURE = 0.8;
export const PART_CONTRAST = 1.2;
/** A part's linear colour to its displayed channel: `x = clamp((0.8 · c)^(1/2.2), 0, 1)`, then `x + 0.2 · (x²(3 − 2x) − x)`. */
export const encodePart = (c: number) => { const x = clamp(Math.max(c * PART_EXPOSURE, 0) ** (1 / 2.2), 0, 1); return Math.max(x + (PART_CONTRAST - 1) * (x * x * (3 - 2 * x) - x), 0); };

/** Where a part point stands and how it is lit: whether the map shadows it, and whether emitters count. */
export interface PartShadingOptions {
  /** `σ`'s case: whether the shadow map (2D.7) shadows the point; default: traced (`mapShadowed`). */
  shadowed?: boolean;
  /** Leave the emitters out (for presence checks). */
  emitters?: boolean;
}
/** The terms of the reference shading of a part point, linear, before the output transform (2D.5). */
export interface PartTerms { key: Vec3; lamp: Vec3; fill: Vec3; env: Vec3; emissive: Vec3 }
/**
 * The reference shading of a part (2D.5): the key light and the environment by the split-sum approximation, in linear
 * light, with `X` the point, `n` its interpolated normal (turned towards the viewer), `v` towards the camera and `h` the
 * half vector of `v` and `L`:
 *
 * ```text
 * albedo = ρ · (1 − 0.04) · (1 − metallic)        α = roughness² + 0.0005        [A, B] = table(n · v, roughness)
 * Ec     = 1 + F0 · (1 / (A + B) − 1)                                             energy compensation
 * key    = intensity · direct · σ · (albedo / π + F(v · h) · ndf · vis · Ec) · max(n · L, 0)
 * env    = strength · (E(n) · albedo + mix(Lspec(r, α), E(n), α) · (F0 · A + B) · Ec)        r = reflect(−v, n)
 * out    = encodePart(key + lamp + fill + env + emissive)
 * ```
 *
 * with a coat as Lite layers it (its own F0, a Kelemen visibility for the key light, its own table and lobe, and the
 * base attenuated by the coat's Fresnel). `lamp` keeps 2D.4's emitter term, `fill` the diffuse fill of 2D.5.
 */
export function partTerms(scene: InstrumentScene, part: InstrumentPart, point: Vec3, normal: Vec3, options: PartShadingOptions = {}): PartTerms {
  const s = shadingOf(scene.materials[part.material] ?? {});
  const C: Vec3 = [scene.camera.vanish[0], scene.camera.vanish[1], scene.camera.distance];
  const v = normalize([C[0] - point[0], C[1] - point[1], C[2] - point[2]]);
  let n = normalize(normal);
  if (dot(n, v) < 0) n = [-n[0], -n[1], -n[2]];
  const L = lightVector(scene.light.azimuth, scene.light.elevation) as Vec3, studio = scene.environment.studio ?? {}, strength = scene.environment.strength;
  const darkness = scene.shadow.map?.darkness ?? 0.1, shadowed = options.shadowed ?? mapShadowed(scene, point), sigma = shadowed ? darkness : 1;
  const nv = Math.abs(dot(n, v)) + 1e-7, intensity = (scene.light.intensity ?? 1.6) * s.direct * sigma;
  const [A, B] = reflectanceTable(nv, s.roughness), Ec = s.F0.map(f => 1 + f * (1 / Math.max(A + B, 0.001) - 1));
  // The specular lobe of one light direction, with its energy compensation, and the coat's own lobe.
  const lobe = (w: Vec3) => {
    const nl = Math.max(dot(n, w), 0), h = normalize([v[0] + w[0], v[1] + w[1], v[2] + w[2]]), nh = clamp(dot(n, h), 1e-7, 1), vh = clamp(dot(v, h), 0, 1);
    const specular = s.F0.map((f, i) => schlick(vh, f) * ggx(nh, s.alpha) * smith(nl, nv, s.alpha) * nl * Ec[i]!) as Vec3;
    const diffuse = s.albedo.map(a => (a / Math.PI) * nl) as Vec3;
    if (s.coat <= 0) return specular.map((value, i) => value + diffuse[i]!) as Vec3;
    const Fc = schlick(vh, s.coatF0), coat = Fc * ggx(nh, s.coatAlpha) * (0.25 / (vh * vh + 1e-7)) * nl * s.coat, keep = 1 - Fc * s.coat;
    return specular.map((value, i) => (value + diffuse[i]!) * keep + coat) as Vec3;
  };
  const key = lobe(L).map(value => value * intensity) as Vec3;
  const lamp: Vec3 = [0, 0, 0];
  if (options.emitters !== false) for (const emitter of scene.emitters ?? []) {
    const towards = normalize([emitter.position[0] - point[0], emitter.position[1] - point[1], emitter.position[2] - point[2]]);
    const E = emitterTerm(emitter, point, n), nl = Math.max(dot(n, towards), 0), f = lobe(towards);
    // 2D.4's E carries cos θ / π; the lobe carries cos θ itself.
    if (nl > 0) for (let channel = 0; channel < 3; channel++) lamp[channel]! += (Math.PI * f[channel]! * E[channel]!) / nl;
  }
  const fill = s.rho.map(rho => (scene.light.ambient ?? 0) * (1 - s.metallic) * rho * (0.5 + 0.5 * n[2])) as Vec3;
  const r: Vec3 = [2 * dot(n, v) * n[0] - v[0], 2 * dot(n, v) * n[1] - v[1], 2 * dot(n, v) * n[2] - v[2]];
  const E = studioIrradiance(n, studio, scene.light).map(value => value * strength) as Vec3;
  const radiance = specularEnvironment(r, s.alpha, studio, scene.light).map((value, i) => mixValue(value * strength, E[i]!, s.alpha)) as Vec3;
  let env = s.F0.map((f, i) => E[i]! * s.albedo[i]! + radiance[i]! * (f * A + B) * Ec[i]!) as Vec3;
  if (s.coat > 0) {
    const [cA, cB] = reflectanceTable(nv, s.coatRoughness), keep = 1 - schlick(nv, s.coatF0) * s.coat;
    const coat = specularEnvironment(r, s.coatAlpha, studio, scene.light).map(value => value * strength * (s.coatF0 * (cA + cB) + (1 - s.coatF0) * cB) * s.coat);
    env = env.map((value, i) => value * keep + coat[i]!) as Vec3;
  }
  return { key, lamp, fill, env, emissive: s.emissive };
}
/** The reference shading of a part point (2D.5), displayed channels 0–1. */
export function shadePart(scene: InstrumentScene, part: InstrumentPart, point: Vec3, normal: Vec3, options: PartShadingOptions = {}): Rgb01 {
  const { key, lamp, fill, env, emissive } = partTerms(scene, part, point, normal, options);
  return key.map((_, i) => encodePart(key[i]! + lamp[i]! + fill[i]! + env[i]! + emissive[i]!)) as unknown as Rgb01;
}


// ---------------------------------------------------------------------------------------------------------------------
// The posed scene: ray casting the parts' triangles (2D.3), and the shadow map along the light (2D.7).

/** One posed triangle. */
interface Triangle { object: number; part: number; group: number; a: Vec3; b: Vec3; c: Vec3; na: Vec3; nb: Vec3; nc: Vec3 }
/** A 2D grid of triangles by their projected bounding boxes, for point queries. */
interface Grid { cell: number; cells: Map<string, number[]> }
interface Posed { triangles: Triangle[]; screen: Grid; light: Grid; basis: [Vec3, Vec3, Vec3]; stepped: number[] }
const posedCache = new WeakMap<InstrumentScene, Posed>();
const grid = (cell: number, triangles: Triangle[], project2: (p: Vec3) => Vec2): Grid => {
  const cells = new Map<string, number[]>();
  triangles.forEach((triangle, index) => {
    const points = [project2(triangle.a), project2(triangle.b), project2(triangle.c)];
    const x0 = Math.floor(Math.min(...points.map(p => p[0])) / cell), x1 = Math.floor(Math.max(...points.map(p => p[0])) / cell);
    const y0 = Math.floor(Math.min(...points.map(p => p[1])) / cell), y1 = Math.floor(Math.max(...points.map(p => p[1])) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const key = `${gx},${gy}`, list = cells.get(key);
      if (list) list.push(index); else cells.set(key, [index]);
    }
  });
  return { cell, cells };
};
/** The scene's parts posed at each object's `t`, objects that fail containment left out (they are drawn as Relief). */
function posed(scene: InstrumentScene): Posed {
  const cached = posedCache.get(scene);
  if (cached) return cached;
  const stepped = steppedDown(scene), triangles: Triangle[] = [];
  scene.objects.forEach((object, objectIndex) => {
    if (stepped.includes(objectIndex)) return;
    object.parts.forEach((part, partIndex) => {
      const mesh = profileMesh(scene.profiles[part.profile]!), m = partMatrix(part, object.t ?? 0);
      const point = (i: number) => transform(m, mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!);
      const normal = (i: number) => rotate(m, mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!);
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const [i, j, k] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
        const a = point(i), b = point(j), c = point(k);
        // Degenerate triangles (a crease's empty band) are never hit.
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        if (Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) < 1e-12) continue;
        triangles.push({ object: objectIndex, part: partIndex, group: mesh.groups[t / 3]!, a, b, c, na: normal(i), nb: normal(j), nc: normal(k) });
      }
    });
  });
  const L = lightVector(scene.light.azimuth, scene.light.elevation) as Vec3, [e1, e2] = frame(L);
  const result: Posed = {
    triangles, stepped, basis: [e1, e2, L],
    screen: grid(4, triangles, p => project(scene.camera, p)),
    light: grid(4, triangles, p => [dot(p, e1), dot(p, e2)]),
  };
  posedCache.set(scene, result);
  return result;
}
/** Möller–Trumbore: the ray `origin + s · direction`'s hit on a triangle, with its barycentrics, or undefined. */
function intersect(origin: Vec3, direction: Vec3, { a, b, c }: Triangle): { s: number; u: number; v: number } | undefined {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p: Vec3 = [direction[1] * e2[2] - direction[2] * e2[1], direction[2] * e2[0] - direction[0] * e2[2], direction[0] * e2[1] - direction[1] * e2[0]];
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-14) return undefined;
  const inverse = 1 / det, tv: Vec3 = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = dot(tv, p) * inverse;
  if (u < -1e-12 || u > 1 + 1e-12) return undefined;
  const q: Vec3 = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
  const v = dot(direction, q) * inverse;
  if (v < -1e-12 || u + v > 1 + 1e-12) return undefined;
  return { s: dot(e2, q) * inverse, u, v };
}

/** The part a screen point sees: the nearest posed triangle's hit, with its interpolated normal. */
export interface PartHit {
  object: number;
  part: number;
  /** The triangle's smoothing group (`PartMesh.groups`). */
  group: number;
  point: Vec3;
  normal: Vec3;
}
/**
 * The part the camera sees at the screen point `(x, y)` (2D.3), or undefined where no part is drawn. The ray runs from
 * the camera `C = (V.x, V.y, D)` through the point on the face plane; the nearest hit wins, as a depth buffer of the
 * layer's parts decides (2D.8, step 3). Objects that fail containment are not drawn as parts.
 */
export function partHit(scene: InstrumentScene, x: number, y: number): PartHit | undefined {
  const { triangles, screen } = posed(scene), C: Vec3 = [scene.camera.vanish[0], scene.camera.vanish[1], scene.camera.distance];
  const direction: Vec3 = [x - C[0], y - C[1], -C[2]];
  let best: PartHit | undefined, nearest = Infinity;
  for (const index of screen.cells.get(`${Math.floor(x / screen.cell)},${Math.floor(y / screen.cell)}`) ?? []) {
    const triangle = triangles[index]!, hit = intersect(C, direction, triangle);
    if (!hit || hit.s <= 0 || hit.s >= nearest) continue;
    nearest = hit.s;
    const w = 1 - hit.u - hit.v, { na, nb, nc } = triangle;
    best = { object: triangle.object, part: triangle.part, group: triangle.group,
      point: [C[0] + direction[0] * hit.s, C[1] + direction[1] * hit.s, C[2] + direction[2] * hit.s],
      normal: normalize([na[0] * w + nb[0] * hit.u + nc[0] * hit.v, na[1] * w + nb[1] * hit.u + nc[1] * hit.v, na[2] * w + nb[2] * hit.u + nc[2] * hit.v]) };
  }
  return best;
}
/**
 * Whether the shadow map (2D.7) shadows a part point: some part lies between it and the key light by more than
 * `map.bias` along the light, as an orthographic depth map along `−L` compares. Filtering is not part of the model; the
 * suite keeps its points 3 px from a mapped shadow's edge (2D.10).
 */
export function mapShadowed(scene: InstrumentScene, point: Vec3): boolean {
  const { triangles, light, basis: [e1, e2, L] } = posed(scene), bias = scene.shadow.map?.bias ?? 1.95;
  const u = dot(point, e1), w = dot(point, e2);
  for (const index of light.cells.get(`${Math.floor(u / light.cell)},${Math.floor(w / light.cell)}`) ?? []) {
    const hit = intersect(point, L, triangles[index]!);
    if (hit && hit.s > bias) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Glass (2D.6).

/** GLSL's `refract`: zero beyond the critical angle. */
function refract(i: Vec3, n: Vec3, eta: number): Vec3 {
  const ni = dot(n, i), k = 1 - eta * eta * (1 - ni * ni);
  if (k < 0) return [0, 0, 0];
  const s = eta * ni + Math.sqrt(k);
  return [eta * i[0] - s * n[0], eta * i[1] - s * n[1], eta * i[2] - s * n[2]];
}
const reflect = (i: Vec3, n: Vec3): Vec3 => { const d = 2 * dot(n, i); return [i[0] - d * n[0], i[1] - d * n[1], i[2] - d * n[2]]; };

/**
 * The capture as a texture at a device scale: `c(q)` read exactly at the texel when `q` is a texel centre, and
 * bilinearly (premultiplied, as core's layer pass samples) otherwise (2D.6).
 */
export function captureTexture(captured: CapturedColour, scale = 1, extent?: { width: number; height: number }): CapturedColour {
  const texels = new Map<string, readonly [number, number, number, number]>();
  const columns = extent ? Math.ceil(extent.width * scale) : Infinity, rows = extent ? Math.ceil(extent.height * scale) : Infinity;
  const texel = (i: number, j: number) => {
    const ci = clamp(i, 0, columns - 1), cj = clamp(j, 0, rows - 1), key = `${ci},${cj}`;
    let value = texels.get(key);
    if (!value) { const [r, g, b, a] = captured((ci + 0.5) / scale, (cj + 0.5) / scale); value = [r * a, g * a, b * a, a]; texels.set(key, value); }
    return value;
  };
  return (x, y) => {
    const px = x * scale - 0.5, py = y * scale - 0.5, i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
    const value = [0, 1, 2, 3].map(c => mixValue(mixValue(texel(i, j)[c]!, texel(i + 1, j)[c]!, fx), mixValue(texel(i, j + 1)[c]!, texel(i + 1, j + 1)[c]!, fx), fy));
    const a = value[3]!;
    return a > 1e-9 ? [value[0]! / a, value[1]! / a, value[2]! / a, a] : [0, 0, 0, 0];
  };
}

/** The radiance along a reflected ray `r` from a glass point (2D.6): the studio, the part's stand, or the face. */
function reflected(scene: InstrumentScene, capture: CapturedColour, part: InstrumentPart, centre: Vec3, point: Vec3, r: Vec3): Vec3 {
  const studio = scene.environment.studio ?? {}, z = point[2];
  if (r[2] >= 0) return studioRadiance(r, studio, scene.light);
  const b = centre[2];
  if (part.stand) {
    const s = (z - b) / -r[2], g = [point[0] + r[0] * s, point[1] + r[1] * s];
    if (Math.hypot(g[0]! - centre[0], g[1]! - centre[1]) <= part.stand.radius) {
      const colour = linear(part.stand.colour), sky = studioRadiance([r[0], r[1], -r[2]], studio, scene.light);
      return colour.map((c, i) => c * sky[i]!) as Vec3;
    }
  }
  const s = z / -r[2], [cr, cg, cb] = capture(point[0] + r[0] * s, point[1] + r[1] * s);
  return [lin(cr), lin(cg), lin(cb)];
}

/** What `glassSample` gives at a point: the colour and, for tests, the terms it came from. */
export interface GlassSample {
  colour: Rgb01;
  /** Where each channel's transmitted ray read the capture (a lens's landing point, a window's `p + δ`). */
  reads: [Vec2, Vec2, Vec2];
  /** Total internal reflection at a lens's bottom (the dark rim). */
  internal: boolean;
  fresnel: number;
  /** Exactly the captured texel: a window's flat region outside its finish zone, or its text. */
  exact: boolean;
}
/**
 * Glass (2D.6) at the screen point `(x, y)`, where `hit` is the glass part the camera sees. The capture is read at the
 * device scale `scale`, exactly at texel centres. A lens refracts in at its surface and out at its flat bottom (total
 * internal reflection, decided on green, gives the dark rim); a window shifts the capture by the difference from a flat
 * pane, so a flat window is the capture texel. Both add the Fresnel reflection of the studio, the stand or the face.
 */
export function glassSample(scene: InstrumentScene, captured: CapturedColour, hit: PartHit, x: number, y: number, scale = 1): GlassSample {
  const object = scene.objects[hit.object]!, part = object.parts[hit.part]!, material = scene.materials[part.material] ?? {};
  const glass = { ior: 1.5, tint: [0.84, 0.93, 0.9] as Vec3 | string, absorption: 0.03, reflection: 1.5, ...material.glass };
  // The tint is a 0–1 factor per channel; a `#rrggbb` tint (core accepts one) is its channels over 255, not decoded.
  const tint: Vec3 = typeof glass.tint === "string" ? parseHex(glass.tint).map(channel => channel / 255) as unknown as Vec3 : glass.tint;
  const spread = 0.1 * (material.dispersion?.strength ?? 0), indices = [glass.ior - spread, glass.ior, glass.ior + spread];
  const capture = captureTexture(captured, scale, scene.extent), strength = scene.environment.strength;
  const C: Vec3 = [scene.camera.vanish[0], scene.camera.vanish[1], scene.camera.distance], X = hit.point;
  const d = normalize([X[0] - C[0], X[1] - C[1], X[2] - C[2]]);
  let n = hit.normal;
  if (dot(n, d) > 0) n = [-n[0], -n[1], -n[2]];
  const F0 = ((glass.ior - 1) / (glass.ior + 1)) ** 2, Fr = (normal: Vec3) => F0 + (1 - F0) * (1 - clamp(-dot(d, normal), 0, 1)) ** 5;
  const absorb = (length: number) => tint.map(t => Math.exp(-(1 - t) * glass.absorption * length)) as Vec3;
  const centre = transform(partMatrix(part, object.t ?? 0), 0, 0, 0), r = reflect(d, n);
  const R = reflected(scene, capture, part, centre, X, r), z = X[2];
  const encode = (value: Vec3) => value.map(c => enc(clamp(c, 0, 1))) as unknown as Rgb01;
  if (part.glass === "lens") {
    // A plano-convex lens with its flat bottom at b: into the glass, down to the bottom, out, onto the face.
    const b = centre[2];
    const paths = indices.map(eta => {
      const t1 = refract(d, n, 1 / eta), length = (z - b) / Math.max(-t1[2], 1e-3);
      const Q: Vec3 = [X[0] + length * t1[0], X[1] + length * t1[1], X[2] + length * t1[2]], t2 = refract(t1, [0, 0, 1], eta);
      const zero = t2[0] === 0 && t2[1] === 0 && t2[2] === 0, k = b / Math.max(-t2[2], 1e-3);
      return { length, zero, read: [Q[0] + t2[0] * k, Q[1] + t2[1] * k] as Vec2 };
    });
    const internal = paths[1]!.zero, fresnel = Fr(n);
    const T: Vec3 = internal ? [0.015, 0.015, 0.018] : paths.map((path, channel) => lin(capture(path.read[0], path.read[1])[channel]!)) as Vec3;
    const transmitted = absorb(internal ? 0 : paths[1]!.length);
    const value = T.map((c, i) => (1 - fresnel) * c * transmitted[i]! + fresnel * strength * glass.reflection * R[i]!) as Vec3;
    return { colour: encode(value), reads: paths.map(path => path.read) as [Vec2, Vec2, Vec2], internal, fresnel, exact: false };
  }
  // A window: the text under it is exact, whatever else applies (2D.9, rule 7).
  const plain = capture(x, y);
  if (protectedDistance(scene, x, y, 2) === 0) return { colour: [plain[0], plain[1], plain[2]], reads: [[x, y], [x, y], [x, y]], internal: false, fresnel: 0, exact: true };
  const flat: Vec3 = [0, 0, 1];
  const s = (normal: Vec3, eta: number): Vec2 => { const t = refract(d, normal, eta), k = z / Math.max(-t[2], 0.15); return [t[0] * k, t[1] * k]; };
  const reads = indices.map(ior => { const eta = 1 / ior, a = s(n, eta), b = s(flat, eta); return [x + a[0] - b[0], y + a[1] - b[1]] as Vec2; });
  const T = reads.map((read, channel) => lin(capture(read[0], read[1])[channel]!)) as Vec3;
  const fresnel = Math.max(Fr(n) - Fr(flat), 0), transmitted = absorb(12 * (1 - n[2]));
  let col = T.map((c, i) => mixValue(c * transmitted[i]!, strength * glass.reflection * R[i]!, fresnel)) as Vec3;
  let zone = false;
  if (part.finish) {
    // `finish: true` is the zone with its defaults (band 0.3, horizon 0.25).
    const finish = typeof part.finish === "object" ? part.finish : {};
    // The window's top finish zone: v from its top, u from its edge on the key light's side, as fractions of its size.
    const caster = partCaster({ ...part, caster: undefined }, scene.profiles[part.profile]!, object.t ?? 0);
    if (caster) {
      const [left, top, width, height] = caster.rect, L = lightVector(scene.light.azimuth, scene.light.elevation);
      const v = (y - top) / height, u = L[0] < 0 ? (x - left) / width : (left + width - x) / width;
      const band = (finish.band ?? 0.3) * smoothstep(0.03, 0.06, v) * (1 - smoothstep(0.06, 0.26, v)) * (1.25 - 0.6 * u);
      const horizon = (finish.horizon ?? 0.25) * (smoothstep(0.25, 0.27, v) - smoothstep(0.28, 0.31, v));
      zone = band > 0 || horizon > 0;
      col = col.map((c, i) => c * (1 - horizon) + [0.86, 0.9, 0.95][i]! * band) as Vec3;
    }
  }
  // A window's flat region is exact: δ = 0, F′ = 0 and the path is 0, so outside the finish zone the pixel is c(p).
  const exact = !zone && reads.every(read => read[0] === x && read[1] === y) && fresnel === 0 && n[2] === 1;
  return { colour: exact ? [plain[0], plain[1], plain[2]] : encode(col), reads: reads as [Vec2, Vec2, Vec2], internal: false, fresnel, exact };
}

// ---------------------------------------------------------------------------------------------------------------------
// Compositing (2D.8).

/** A captured cap's colour at a pixel (2D.8, step 6): a version 2 cap, the captured colour times its interior factor. */
export function capColour(scene: InstrumentScene, part: InstrumentPart, captured: CapturedColour, x: number, y: number, scale = 1): Rgb01 {
  const material = scene.materials[part.material] ?? {}, state = part.state ?? {}, m = scene.interior.max;
  const offset = scene.state.hoverLift * (state.hover ? 1 : 0) - scene.state.pressSink * (state.pressed ? 1 : 0)
    + (material.coat?.strength ?? 0) * 0.02 + (1 - (material.base?.roughness ?? 1)) * 0.01;
  // 2.9: no shadow reaches a cap, so the guard's k is the interior factor itself; a disabled cap is as captured.
  const k = state.disabled ? 1 : 1 + clamp(offset, -m, m);
  const [r, g, b] = captureTexture(captured, scale, scene.extent)(x, y);
  return [r, g, b].map(c => clamp(c * k, 0, 1)) as unknown as Rgb01;
}

/** What `shadeInstrument` gives at a point. */
export type InstrumentPoint =
  /** The face, with `Φ` (step 2); `clipped` when the point lies outside every object's bounds (2D.9, rule 5). */
  | { source: "face"; colour: Rgb01; clipped: boolean }
  /** A captured cap (step 6). */
  | { source: "cap"; colour: Rgb01; hit: PartHit }
  /** A window's exact pixel: its text, or its flat region (2D.9, rule 7). */
  | { source: "glass"; colour: Rgb01; hit: PartHit }
  /** A part (or a lens, or a window's bevel or finish zone): the model fixes it only within the sampled tolerance. */
  | { source: "part"; hit: PartHit };
/**
 * The exactly defined colour at a screen point of an Instrument layer (2D.8), at device scale `scale`: in order, the
 * layer (part 2, with the stepped-down objects' Relief primitives), the face factor, the parts (the nearest one the
 * camera sees) and captured caps. Where the point shows a part whose colour the model fixes only by sampling, the
 * result names the part instead (`shadePart` and `glassSample` give the reference for it).
 */
export function shadeInstrument(scene: InstrumentScene, captured: CapturedColour, x: number, y: number, scale = 1): InstrumentPoint {
  const hit = partHit(scene, x, y);
  if (!hit) {
    const clipped = scene.objects.every(object => { const bounds = object.bounds ?? { rect: object.rect, radius: 0 }; return boxDistance(x, y, bounds.rect, bounds.radius) > 0; });
    return { source: "face", colour: shadeFace(scene, captured, x, y), clipped };
  }
  const part = scene.objects[hit.object]!.parts[hit.part]!;
  if (part.captured) return { source: "cap", colour: capColour(scene, part, captured, x, y, scale), hit };
  if (part.glass === "window") {
    const sample = glassSample(scene, captured, hit, x, y, scale);
    if (sample.exact) return { source: "glass", colour: sample.colour, hit };
  }
  return { source: "part", hit };
}
/**
 * The reference colour of a part point the camera sees (2D.5, 2D.6): `glassSample` for glass parts, `shadePart`
 * otherwise. For sampled expectations (2D.10).
 */
export function partColour(scene: InstrumentScene, captured: CapturedColour, hit: PartHit, x: number, y: number, scale = 1, options: PartShadingOptions = {}): Rgb01 {
  const part = scene.objects[hit.object]!.parts[hit.part]!;
  if (part.glass) return glassSample(scene, captured, hit, x, y, scale).colour;
  if (part.captured) return capColour(scene, part, captured, x, y, scale);
  return shadePart(scene, part, hit.point, hit.normal, options);
}
