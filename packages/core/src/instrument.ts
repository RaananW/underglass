/**
 * The `instrument` material's scene: Rendering Model part 2D (version 4, `kind: "instrument"`), as data and geometry.
 * This module has no GPU and no DOM: it validates a scene, builds each profile's triangles, poses parts as rigid
 * transforms, resolves face casters, checks containment over the whole travel (2D.9) and derives the face's relief
 * scene, with the objects that cannot be drawn as parts stepped down to their Relief primitives. `instrument-pass.ts`
 * draws the parts with Babylon Lite; `renderer.ts` runs both. Design: `docs/ui-library/instrument-phase2.md`.
 *
 * Coordinates are layer-local CSS px: x to the right, y down, z up from the face towards the viewer (the scene's own
 * axes, 2D.2). A part's profile is built in part-local px with its origin at the centre of the part's base.
 */
import { validateReliefScene, type ReliefPrimitive, type ReliefScene } from "./relief.js";
import { validateLight, type ProtectedRects, type SceneEmitter } from "./emitters.js";
import { capCasterHeight, meshFootprint, meshGeometry, placeholderGeometry, validateMeshProfile, type InstrumentMeshProfile, type MeshProfile, type PartGeometry } from "./instrument-mesh.js";
export type { InstrumentMeshProfile, InstrumentMeshSource, PartGeometry } from "./instrument-mesh.js";

/** Parts one layer may draw (I0.1); above it the layer is drawn at the Relief level and reported. */
export const INSTRUMENT_PARTS_PER_LAYER = 2048;
/** Parts all instrument layers of one stage may draw together (I0.1). */
export const INSTRUMENT_PARTS_PER_STAGE = 6000;
/** Part kinds (draw calls) per layer before a warning; the design language's "about 16". */
export const INSTRUMENT_KINDS_PER_LAYER = 16;
/** Part kinds per layer above which the layer is drawn at the Relief level. */
export const INSTRUMENT_KINDS_CEILING = 64;
/** Objects per scene; with the face's primitives at most 256 in all, so every step-down fits the relief list. */
export const INSTRUMENT_OBJECTS = 256;
/** Parts a scene may describe; the budget (2,048 per layer) is the renderer's, not the format's. */
export const INSTRUMENT_SCENE_PARTS = 8192;
/** Parts per object. */
export const INSTRUMENT_OBJECT_PARTS = 64;
/** Analytic face casters per object (I0.5 drew 6). */
export const INSTRUMENT_CASTERS_PER_OBJECT = 8;

/** Profiles and materials a scene may name. */
export const INSTRUMENT_PROFILES = 64;
/** Materials a layer draws with: a scene naming more is valid but drawn at Relief (`budget`, detail names the count). */
export const INSTRUMENT_MATERIALS = 16;
/** Materials a scene may name; above it the format refuses the scene (between the two the layer steps down). */
export const INSTRUMENT_MATERIALS_CEILING = 64;
/** The containment margin of 2D.9: every vertex projects at least this far inside `bounds`. */
export const CONTAINMENT_MARGIN = 0.5;
/** The camera rule's floor (2D.3, design language section 6). */
export const CAMERA_FLOOR = 2400;

/** The part vocabulary of design language section 6; `custom` is a part whose profile is a `mesh` (core work item 5). */
export const PART_KINDS = ["cap", "skirt", "collar", "chamfer", "pointer", "carriage", "slot", "grip", "lever", "pivot", "ball", "nut",
  "bushing", "plate", "paddle", "bezel", "lens", "window", "needle", "dial", "segment", "plinth", "custom"] as const;

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Box = [number, number, number, number];

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
  | { type: "extrude"; outline: Vec2[]; width: number }
  /** Explicit triangles, inline or a glB/glTF reference (custom parts, `instrument-mesh.ts`). */
  | InstrumentMeshProfile;
/** What a part casts on the face (2D.7), in layer px. */
export interface InstrumentCaster { rect: Box; radius: number; height: number }
export interface InstrumentPart {
  kind: (typeof PART_KINDS)[number];
  profile: string;
  /** Where the profile's origin stands; `z` is the height of the surface below it. */
  at: Vec3;
  /** Moving parts only: the poses at the two stops. */
  pose?: { from: InstrumentPose; to: InstrumentPose };
  material: string;
  /** A cap that carries the layer's capture (2D.8); it may only travel. Not for custom parts. */
  captured?: boolean;
  /** Glass parts (2D.6), drawn by the glass shader (`instrument-glass.ts`). */
  glass?: "lens" | "window";
  stand?: { radius: number; colour: string };
  /** A window's finish zone (2D.6): `true` is its defaults (band 0.3, horizon 0.25). */
  finish?: boolean | { band?: number; horizon?: number };
  /** Omitted: resolved from the posed part. `null`: the part casts nothing. */
  caster?: InstrumentCaster | null;
  /** The emitter this part is the lens of. */
  emitter?: number;
  /**
   * A custom part only: parametric parts core draws in its place while its file is `loading` and after it `failed` (the built-in
   * part standing in), and stops drawing in the frame the mesh is. Validation expands them into `fallbackFor` parts before it. A hand-written part marked `fallbackFor` is dropped and expanded again from its custom part (so a validated scene validates again); with no custom part after it, it is simply gone.
   */
  fallback?: InstrumentPart[];
  /** Set by validation on an expanded stand-in: shown while the next part without this mark (its custom part) has no triangles. */
  fallbackFor?: true;
  state?: { hover?: boolean; pressed?: boolean; focus?: boolean; disabled?: boolean };
}
export interface InstrumentObject {
  /** Unique in the scene; diagnostics name it. */
  id: string;
  /** The native control's border box. */
  rect: Box;
  /** The rounded box every drawn pixel must stay inside (2D.9); default `rect`, radius 0. */
  bounds?: { rect: Box; radius?: number };
  /** The position along the travel, clamped to 0..1. */
  t?: number;
  parts: InstrumentPart[];
  /** Drawn in the face's list instead when the object cannot be drawn as parts; default a raised box over `bounds`. */
  relief?: ReliefPrimitive;
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
/** An emitter (2D.4): a point light on the face, the outset and the parts (`emitters.ts`). */
export type InstrumentEmitter = SceneEmitter;
export interface StudioTokens { key: number; keyRadius: number; fill: number; front: number; strip: number; floor: number; ceiling: number }
/** A version 4 Instrument scene (Rendering Model 2D). */
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
  bevel: ReliefScene["bevel"];
  shadow: { strength: number; map?: { size?: number; bias?: number; darkness?: number } };
  interior: { max: number };
  state: ReliefScene["state"];
  focus: ReliefScene["focus"];
  materials: Record<string, InstrumentRecipe>;
  /** The face's relief primitives (part 2), back to front. */
  primitives: ReliefPrimitive[];
  profiles: Record<string, InstrumentProfile>;
  objects: InstrumentObject[];
  /** Point lights (2D.4): up to 1,024 in the format; the renderer draws the 64 with the most reach into the layer. */
  emitters?: InstrumentEmitter[];
  /** The layer's text runs, or `"extent"`: inside them the face's whole change stays within `interior.max`. */
  protected?: ProtectedRects;
  /** px over which the guard eases off outside a protected rect, 0..16, default 4. */
  feather?: number;
  post?: { smaa?: boolean; bloom?: boolean; taa?: boolean; contact?: boolean; ssgi?: boolean };
}

// Validated scenes, with what the renderer derives from them once: the structure (what the meshes are built from),
// the layout (each part's kind, in order) and the part count.
interface Derived { structure: string; layout: string; parts: number }
const derived = new WeakMap<InstrumentScene, Derived>();

const fail = (path: string, rule: string): never => { throw new Error(`Instrument scene ${path} ${rule}`); };
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
/** Copies the keys of `value` that `allowed` names, and refuses any other key, so a typo is an error. */
const known = (value: Record<string, unknown>, path: string, allowed: readonly string[]) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path ? `${path}.${key}` : key, "is not a field of this part of the format");
};

/**
 * Validates a scene for the `instrument` material and returns a deep, normalized copy (defaults filled in, `t`
 * clamped to its stops). Throws on the first problem with its path, so an invalid scene changes nothing. Fields of
 * later core work items (custom parts) are validated and kept but not drawn yet (`docs/ui-library/instrument-phase2.md`).
 */
export function validateInstrumentScene(input: InstrumentScene): InstrumentScene {
  const scene = record(input, "");
  if (scene.format !== "strata-scene" || scene.version !== 4 || scene.kind !== "instrument") {
    throw new Error('Instrument material requires a version 4 strata-scene with kind "instrument"');
  }
  known(scene, "", ["format", "version", "kind", "camera", "environment", "extent", "outset", "backdrop", "light", "bevel", "shadow", "interior",
    "state", "focus", "materials", "primitives", "profiles", "objects", "emitters", "protected", "feather", "post"]);
  // Camera (2D.3): the distance is the camera rule's, the vanishing point the stage centre (see `docs/.../instrument-phase2.md`).
  const camera = record(scene.camera, "camera");
  const distance = number(camera.distance, "camera.distance", 100, 1e6);
  const vanish = tuple(camera.vanish, "camera.vanish", 2) as Vec2;
  const light = record(scene.light, "light");
  const environment = record(scene.environment, "environment");
  if (environment.source !== "studio") fail("environment.source", 'requires "studio" (an Instrument layer always has an environment)');
  const studio = environment.studio === undefined ? undefined : record(environment.studio, "environment.studio");
  const page = environment.page === undefined ? undefined : record(environment.page, "environment.page");
  const shadow = record(scene.shadow, "shadow");
  const map = shadow.map === undefined ? undefined : record(shadow.map, "shadow.map");
  if (map?.size !== undefined && map.size !== 2048 && map.size !== 4096) fail("shadow.map.size", "requires 2048 or 4096");
  // Materials: the face's relief layers are checked with the face below; the Instrument layers here.
  const materials = record(scene.materials, "materials");
  const names = Object.keys(materials);
  if (names.length > INSTRUMENT_MATERIALS_CEILING) fail("materials", `holds more than ${INSTRUMENT_MATERIALS_CEILING} materials`);
  const recipes = Object.fromEntries(names.map(name => [name, recipe(record(materials[name], `materials.${name}`), `materials.${name}`)]));
  // Profiles.
  const profiles = record(scene.profiles, "profiles");
  const profileNames = Object.keys(profiles);
  if (profileNames.length > INSTRUMENT_PROFILES) fail("profiles", `holds more than ${INSTRUMENT_PROFILES} profiles`);
  const shapes = Object.fromEntries(profileNames.map(name => [name, profile(record(profiles[name], `profiles.${name}`), `profiles.${name}`)]));
  // Emitters, protected rects and the feather (item 2, `emitters.ts`).
  const lights = validateLight(scene, "Instrument scene");
  const emitters = lights.emitters ?? [];
  // Objects and their parts.
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
    // A validated scene is valid input: the stand-ins validation expanded are dropped and expanded again from their custom part.
    const given = (entry.parts as unknown[]).filter(part => !(typeof part === "object" && part !== null && (part as { fallbackFor?: unknown }).fallbackFor === true));
    const checked = given.map((part, partIndex) => validatePart(record(part, `${at}.parts[${partIndex}]`), `${at}.parts[${partIndex}]`, shapes, names, emitters.length));
    const parts = checked.flatMap(part => (part.fallback ? [...part.fallback.map((stand): InstrumentPart => ({ ...stand, fallbackFor: true })), part] : [part]));
    if (parts.length > INSTRUMENT_OBJECT_PARTS) fail(`${at}.parts`, `and their fallbacks hold ${parts.length} parts, above ${INSTRUMENT_OBJECT_PARTS}`);
    partCount += parts.length;
    if (partCount > INSTRUMENT_SCENE_PARTS) fail("objects", `hold more than ${INSTRUMENT_SCENE_PARTS} parts`);
    return { id: entry.id as string, rect, bounds: { rect: boundsRect, radius: Math.min(radius, boundsRect[2] / 2, boundsRect[3] / 2) }, t, parts,
      relief: entry.relief as ReliefPrimitive | undefined };
  });
  // The face (part 2), with each object's Relief primitive checked in the same list: validated as a version 1 scene.
  const reliefOf = (object: (typeof objects)[number]): ReliefPrimitive => object.relief ?? { face: "raised", rect: object.bounds.rect,
    radius: object.bounds.radius, height: Math.min(16, Math.max(1, ...object.parts.map(part => part.at[2] + profileHeight(shapes[part.profile]!)))), material: object.parts[0]!.material };
  // The face binds at most RELIEF_MATERIALS (16): a scene past the layer's cap (drawn at Relief, `budget`) gives it the materials its primitives use.
  const faceEntries = [...(primitivesIn as ReliefPrimitive[]), ...objects.map(reliefOf)];
  const collapsed = collapseFace(names.map(name => [name, recipes[name]!] as const), faceEntries);
  const reliefMaterials = collapsed.materials;
  let face: ReliefScene;
  try {
    face = validateReliefScene({ format: "strata-scene", version: 1, extent: scene.extent, ...(scene.outset === undefined ? {} : { outset: scene.outset }),
      backdrop: scene.backdrop, light: { azimuth: light.azimuth, elevation: light.elevation }, bevel: scene.bevel, shadow: { strength: shadow.strength },
      interior: scene.interior, state: scene.state, focus: scene.focus, materials: reliefMaterials,
      primitives: collapsed.entries } as ReliefScene);
  } catch (error) {
    // Report the face's paths in the Instrument scene's terms: an object's step-down primitive is `objects[i].relief`.
    const count = (primitivesIn as unknown[]).length;
    throw new Error(String((error as Error).message).replace(/^Relief scene/, "Instrument scene")
      .replace(/primitives\[(\d+)\]/, (all, index: string) => (Number(index) >= count ? `objects[${Number(index) - count}].relief` : all)));
  }
  const result: InstrumentScene = {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance, vanish },
    environment: { source: "studio", strength: number(environment.strength, "environment.strength", 0, 3),
      ...(studio ? { studio: studioTokens(studio) } : {}),
      ...(page ? { page: { enabled: flag(page.enabled, "environment.page.enabled", true), size: integer(page.size, "environment.page.size", 128, 1024, 512),
        height: optional(page.height, "environment.page.height", 0, 1e5, 300) } } : {}) },
    extent: face.extent, ...(face.outset ? { outset: face.outset } : {}), backdrop: face.backdrop,
    light: { ...face.light, intensity: optional(light.intensity, "light.intensity", 0, 20, 1.6), ambient: optional(light.ambient, "light.ambient", 0, 4, 0) },
    bevel: face.bevel,
    shadow: { strength: face.shadow.strength, ...(map ? { map: { size: (map.size as number | undefined) ?? 4096, bias: optional(map.bias, "shadow.map.bias", 0, 100, 1.95),
      darkness: optional(map.darkness, "shadow.map.darkness", 0, 1, 0.1) } } : {}) },
    interior: face.interior, state: face.state, focus: face.focus,
    materials: recipes,
    primitives: face.primitives.slice(0, (primitivesIn as unknown[]).length).map((entry, at) => ({ ...entry, material: faceEntries[at]!.material })) as ReliefPrimitive[],
    profiles: shapes,
    objects: objects.map((object, index) => ({ ...object, relief: { ...face.primitives[(primitivesIn as unknown[]).length + index], material: faceEntries[(primitivesIn as unknown[]).length + index]!.material } as ReliefPrimitive })),
    ...lights,
    ...(scene.post !== undefined ? { post: post(record(scene.post, "post")) } : {}),
  };
  derived.set(result, { ...structureOf(result), parts: partCount });
  return result;
}

/** One part (2D.2), with its pose's stops checked against each other. */
function validatePart(part: Record<string, unknown>, at: string, profiles: Record<string, InstrumentProfile>, materials: string[], emitters: number, inFallback = false): InstrumentPart {
  known(part, at, ["kind", "profile", "at", "pose", "material", "captured", "glass", "stand", "finish", "caster", "emitter", "state", "fallback"]);
  const kind = choice(part.kind, `${at}.kind`, PART_KINDS);
  if (typeof part.profile !== "string" || !(part.profile in profiles)) fail(`${at}.profile`, "requires one of the scene's profiles");
  const shape = profiles[part.profile as string]!;
  if (kind === "custom" && shape.type !== "mesh") fail(`${at}.profile`, 'of a custom part requires a profile of type "mesh"');
  if (typeof part.material !== "string" || !materials.includes(part.material)) fail(`${at}.material`, "requires one of the scene's materials");
  const position = tuple(part.at, `${at}.at`, 3) as Vec3;
  let pose: InstrumentPart["pose"];
  if (part.pose !== undefined) {
    const stops = record(part.pose, `${at}.pose`);
    known(stops, `${at}.pose`, ["from", "to"]);
    const from = validatePose(record(stops.from, `${at}.pose.from`), `${at}.pose.from`), to = validatePose(record(stops.to, `${at}.pose.to`), `${at}.pose.to`);
    // 2D.2: `axis` and `pivot` are the same at both stops; a pose only mixes travel, slide, turn and tilt.
    if (from.axis !== to.axis) fail(`${at}.pose.to.axis`, "must equal pose.from.axis");
    if (from.pivot!.some((value, index) => value !== to.pivot![index])) fail(`${at}.pose.to.pivot`, "must equal pose.from.pivot");
    // A mesh profile's pivot is the default of a pose that gives none.
    const given = (stop: unknown) => (stop as Record<string, unknown>).pivot !== undefined;
    if (shape.type === "mesh" && shape.pivot && !given(stops.from) && !given(stops.to)) { from.pivot = [...shape.pivot]; to.pivot = [...shape.pivot]; }
    pose = { from, to };
  }
  const captured = flag(part.captured, `${at}.captured`);
  if (shape.type === "mesh" && captured) fail(`${at}.captured`, "is not for custom parts: a custom part carries no captured content");
  // Design language section 6: only parts that stay parallel to the face carry captured content.
  if (captured && pose && [pose.from, pose.to].some(stop => stop.turn || stop.tilt || stop.slide![0] || stop.slide![1])) {
    fail(`${at}.captured`, "is only for parts that travel: turning, tilting and sliding parts never carry captured content");
  }
  const glass = part.glass === undefined ? undefined : choice(part.glass, `${at}.glass`, ["lens", "window"] as const);
  if (part.stand !== undefined && glass !== "lens") fail(`${at}.stand`, "is only for lenses");
  if (part.stand !== undefined && shape.type === "mesh") fail(`${at}.stand`, "is not for custom parts");
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
  let fallback: InstrumentPart[] | undefined;
  if (part.fallback !== undefined) {
    if (shape.type !== "mesh") fail(`${at}.fallback`, "is only for custom parts (a part with a mesh profile)");
    if (inFallback) fail(`${at}.fallback`, "may not nest");
    if (!Array.isArray(part.fallback) || !part.fallback.length || part.fallback.length > 8) fail(`${at}.fallback`, "requires 1..8 parts");
    fallback = (part.fallback as unknown[]).map((stand, index) => {
      const checked = validatePart(record(stand, `${at}.fallback[${index}]`), `${at}.fallback[${index}]`, profiles, materials, emitters, true);
      if (profiles[checked.profile]!.type === "mesh") fail(`${at}.fallback[${index}].profile`, "requires a parametric profile: a stand-in is drawn while the mesh is not there");
      return checked;
    });
  }
  return { kind, profile: part.profile as string, at: position, ...(pose ? { pose } : {}), material: part.material as string,
    ...(captured ? { captured } : {}), ...(glass ? { glass } : {}),
    ...(stand ? { stand: { radius: number(stand.radius, `${at}.stand.radius`, 0), colour: hex(stand.colour, `${at}.stand.colour`) } } : {}),
    ...(finish ? { finish } : {}), ...(caster !== undefined ? { caster } : {}),
    ...(part.emitter !== undefined ? { emitter: part.emitter as number } : {}), ...(fallback ? { fallback } : {}),
    state: { hover: flag(states.hover, `${at}.state.hover`), pressed: flag(states.pressed, `${at}.state.pressed`),
      focus: flag(states.focus, `${at}.state.focus`), disabled: flag(states.disabled, `${at}.state.disabled`) } };
}
/** One pose with its defaults. */
function validatePose(pose: Record<string, unknown>, at: string): Required<InstrumentPose> {
  known(pose, at, ["travel", "slide", "turn", "tilt", "axis", "pivot"]);
  return { travel: optional(pose.travel, `${at}.travel`, -1e4, 1e4, 0), slide: pose.slide === undefined ? [0, 0] : tuple(pose.slide, `${at}.slide`, 2, -1e4, 1e4) as Vec2,
    turn: optional(pose.turn, `${at}.turn`, -720, 720, 0), tilt: optional(pose.tilt, `${at}.tilt`, -90, 90, 0),
    axis: optional(pose.axis, `${at}.axis`, -360, 360, 0), pivot: pose.pivot === undefined ? [0, 0, 0] : tuple(pose.pivot, `${at}.pivot`, 3, -1e4, 1e4) as Vec3 };
}
/** One profile (2D.2). */
function profile(value: Record<string, unknown>, at: string): InstrumentProfile {
  if (value.type === "mesh") return validateMeshProfile(value, at);
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
/** The relief layers of a recipe, for the face's primitives (rendering model part 1). */
function faceMaterial(value: InstrumentRecipe) {
  return { base: { roughness: value.base!.roughness, metallic: value.base!.metallic }, coat: { strength: value.coat!.strength, roughness: value.coat!.roughness, ior: value.coat!.ior },
    emissive: { strength: value.emissive!.strength } };
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

/** The studio's default tokens (design language section 4; I0.4's `studioTokens`). */
export const STUDIO_DEFAULTS: StudioTokens = { key: 12, keyRadius: 0.24, fill: 1.2, front: 0.12, strip: 2.5, floor: 0.03, ceiling: 0.25 };

// ---------------------------------------------------------------------------------------------------------------------
// Geometry (2D.2): the triangles are the part.

const geometries = new Map<string, PartGeometry>();
const byShape = new WeakMap<InstrumentProfile, PartGeometry>();
const normalise = (x: number, y: number, z: number): Vec3 => { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; };

/** The tallest point of a profile above its base. */
export function profileHeight(shape: InstrumentProfile): number {
  if (shape.type === "mesh") return shape.source ? (shape.bounds?.high[2] ?? 0) : profileBounds(shape).high[2];
  if (shape.type === "lathe") return Math.max(...shape.points.map(point => point[1]));
  if (shape.type === "prism") return shape.height;
  return Math.max(...shape.outline.map(point => point[1]));
}

/**
 * Builds (and caches by its parameters) a profile's triangles. Every triangle is wound the same way against its outward
 * normal: in the layer's axes, `(b − a) × (c − a)` points against the normal, which is a front face in Lite's world once
 * the layer's axes become its (y up, +z away). Lite's double-sided PBR shades a back face with its normal flipped, so a
 * triangle wound the other way is lit as if it faced inward: prism and extrude faces were drawn dark while lathes were
 * lit. `face` orients each triangle by its vertices' normals, whatever order a builder lists them in.
 */
export function profileGeometry(shape: InstrumentProfile): PartGeometry {
  // A mesh brings its triangles (already in core's winding): inline ones from validation, a reference's once loaded.
  if (shape.type === "mesh") return meshGeometry(shape) ?? placeholderGeometry(shape, shape.bounds);
  // A validated shape never changes: looked up by the object, so no frame serializes it (the key below is for equal shapes).
  const own = byShape.get(shape);
  if (own) return own;
  const key = JSON.stringify(shape);
  const cached = geometries.get(key);
  if (cached) { byShape.set(shape, cached); return cached; }
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const vertex = (p: Vec3, n: Vec3, uv: Vec2) => { positions.push(...p); normals.push(...n); uvs.push(...uv); return positions.length / 3 - 1; };
  const face = (a: number, b: number, c: number) => {
    const at = (index: number, axis: number) => positions[index * 3 + axis]!, normal = (axis: number) => normals[a * 3 + axis]! + normals[b * 3 + axis]! + normals[c * 3 + axis]!;
    const e1 = [0, 1, 2].map(axis => at(b, axis) - at(a, axis)), e2 = [0, 1, 2].map(axis => at(c, axis) - at(a, axis));
    const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    if (cross[0]! * normal(0) + cross[1]! * normal(1) + cross[2]! * normal(2) > 0) indices.push(a, c, b); else indices.push(a, b, c);
  };
  if (shape.type === "lathe") {
    // One ring per profile point, each with that point's normal revolved, so bands are smooth across the profile and a
    // repeated point with another normal is a crease. u runs around the axis (a circular brush), v along the profile.
    const segments = shape.segments ?? 48, count = shape.points.length;
    shape.points.forEach(([r, z, nr, nz], index) => {
      for (let step = 0; step <= segments; step++) {
        const angle = (step / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
        vertex([r * cos, r * sin, z], normalise(nr * cos, nr * sin, nz), [step / segments, index / (count - 1)]);
      }
    });
    for (let index = 0; index + 1 < count; index++) for (let step = 0; step < segments; step++) {
      const a = index * (segments + 1) + step, b = a + segments + 1;
      face(a, b, a + 1); face(a + 1, b, b + 1);
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
        const normal = normalise(nx * rise, ny * rise, run);
        vertex([x0, y0, lower.z], normal, [index / count, band / 2]);
        vertex([x1, y1, upper.z], normal, [index / count, (band + 1) / 2]);
      }
      for (let index = 0; index < count; index++) {
        const next = (index + 1) % count, a = start + index * 2, b = a + 1, c = start + next * 2, d = c + 1;
        face(a, c, b); face(b, c, d);
      }
    }
    // The top, fanned from its centre; its UVs map x and y across the prism's box, so a linear brush runs along x.
    const top = rings[2]!, centre = vertex([0, 0, height], [0, 0, 1], [0.5, 0.5]);
    for (const [x, y] of top.points) vertex([x, y, height], [0, 0, 1], [x / width + 0.5, y / length + 0.5]);
    for (let index = 0; index < count; index++) face(centre, centre + 1 + index, centre + 1 + ((index + 1) % count));
  } else {
    // An [x, z] outline swept along y; flat facets, both ends fanned from the outline's mean point.
    const { outline: points, width } = shape, half = width / 2, count = points.length;
    const [cx, cz] = points.reduce((sum, [x, z]) => [sum[0] + x / count, sum[1] + z / count], [0, 0]);
    const span = Math.max(1e-6, Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])));
    const minX = Math.min(...points.map(point => point[0]));
    for (let index = 0; index < count; index++) {
      const [x0, z0] = points[index]!, [x1, z1] = points[(index + 1) % count]!;
      // The facet's normal in the (x, z) plane, pointing away from the mean point.
      let nx = z1 - z0, nz = -(x1 - x0);
      if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      const normal = normalise(nx, 0, nz), start = positions.length / 3;
      for (const [px, py, pz] of [[x0, -half, z0], [x0, half, z0], [x1, half, z1], [x1, -half, z1]] as const) {
        vertex([px, py, pz], normal, [(px - minX) / span, (py + half) / width]);
      }
      face(start, start + 1, start + 2); face(start, start + 2, start + 3);
    }
    for (const side of [-1, 1]) {
      const centre = vertex([cx, side * half, cz], [0, side, 0], [(cx - minX) / span, side < 0 ? 0 : 1]);
      for (const [x, z] of points) vertex([x, side * half, z], [0, side, 0], [(x - minX) / span, side < 0 ? 0 : 1]);
      for (let index = 0; index < count; index++) face(centre, centre + 1 + index, centre + 1 + ((index + 1) % count));
    }
  }
  const result = { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
  geometries.set(key, result);
  byShape.set(shape, result);
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

/** A part's pose at `t` (clamped to 0..1): `mix(from, to, t)` field by field; `axis` and `pivot` from `from`. */
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

/**
 * A part's placement at `t` in layer px (2D.2), rigid with no scale or shear:
 * `T(at) · T(slide.x, slide.y, travel) · T(pivot) · R(axis, tilt) · R(z, turn) · T(−pivot)`.
 * In the layer's axes (y down) a positive turn takes +x towards +y, clockwise as seen; a positive tilt raises the side
 * at `axis + 90°`.
 */
export function partMatrix(part: InstrumentPart, t: number): Matrix {
  const pose = poseAt(part, t), [px, py, pz] = pose.pivot, deg = Math.PI / 180;
  const axis = pose.axis * deg;
  let m = translation(part.at[0] + pose.slide[0], part.at[1] + pose.slide[1], part.at[2] + pose.travel);
  m = multiply(m, translation(px, py, pz));
  if (pose.tilt) m = multiply(m, rotation(Math.cos(axis), Math.sin(axis), 0, pose.tilt * deg));
  if (pose.turn) m = multiply(m, rotation(0, 0, 1, pose.turn * deg));
  return multiply(m, translation(-px, -py, -pz));
}

// ---------------------------------------------------------------------------------------------------------------------
// Containment (2D.9) and the camera (2D.3).

/** Signed distance from a point to a rounded box `[x, y, width, height]` with `radius`; negative inside. */
export function roundedBoxDistance(x: number, y: number, rect: Box, radius: number): number {
  const [left, top, width, height] = rect, r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const qx = Math.abs(x - left - width / 2) - width / 2 + r, qy = Math.abs(y - top - height / 2) - height / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
/** How far a point `h` above the face, `r` from the vanishing point, moves on screen (2D.3); `|h|` for sunk points. */
export const drift = (r: number, h: number, distance: number) => (r * Math.abs(h)) / (distance - h);
/** The I0.2 box rule's margin: `ceil(drift(h_max) + 1)`, at the reference stage (1920 × 1080, `D` = 2,400) by default. */
export function boxMargin(height: number, stage = { width: 1920, height: 1080 }, distance = CAMERA_FLOOR) {
  return Math.ceil(drift(Math.hypot(stage.width, stage.height) / 2, height, distance) + 1);
}
/** The camera rule (2D.3): `max(2400, max over binding vertices of r · h / (inset − 0.5) + h)`, `r` the stage's half-diagonal. */
export function cameraDistance(stage: { width: number; height: number }, bindings: readonly { height: number; inset: number }[]) {
  const r = Math.hypot(stage.width, stage.height) / 2;
  return Math.max(CAMERA_FLOOR, ...bindings.filter(binding => binding.height > 0).map(({ height, inset }) =>
    inset > CONTAINMENT_MARGIN ? (r * height) / (inset - CONTAINMENT_MARGIN) + height : Infinity));
}

/**
 * The travel steps 2D.9 asks for: at least 32, and enough that a turning or tilting vertex's chord strays less than
 * 0.45 px from its arc (the 0.5 px of the rule, with room for the projection's scale).
 */
export function travelSteps(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): number {
  let steps = 32;
  for (const part of object.parts) {
    if (!part.pose) continue;
    const { from, to } = part.pose, geometry = profileGeometry(profiles[part.profile]!), pivot = from.pivot ?? [0, 0, 0];
    const angle = (Math.abs((to.turn ?? 0) - (from.turn ?? 0)) + Math.abs((to.tilt ?? 0) - (from.tilt ?? 0))) * (Math.PI / 180);
    if (!angle) continue;
    let reach = 0;
    for (let index = 0; index < geometry.positions.length; index += 3) {
      reach = Math.max(reach, Math.hypot(geometry.positions[index]! - pivot[0], geometry.positions[index + 1]! - pivot[1], geometry.positions[index + 2]! - pivot[2]));
    }
    if (reach > 0.45) steps = Math.max(steps, Math.ceil(angle / (2 * Math.acos(1 - 0.45 / reach))));
  }
  return Math.min(steps, 4096);
}

/** One vertex's worst case for the frontier: its orthographic inset in `bounds` and its height. */
interface Witness { inset: number; height: number }
/** An object's containment frontier: per part, the (inset, height) pairs no other pair dominates, over the travel. */
export interface ContainmentFrontier { steps: number; parts: Witness[][] }

/** Every posed vertex of a part at `t`, in layer px. */
export function posedVertices(part: InstrumentPart, shape: InstrumentProfile, t: number): Float64Array {
  const geometry = profileGeometry(shape), m = partMatrix(part, t), out = new Float64Array(geometry.positions.length);
  for (let index = 0; index < geometry.positions.length; index += 3) {
    const [x, y, z] = transform(m, geometry.positions[index]!, geometry.positions[index + 1]!, geometry.positions[index + 2]!);
    out[index] = x; out[index + 1] = y; out[index + 2] = z;
  }
  return out;
}

/** Vertex-steps above which a part's witnesses are bucketed by height (a dense mesh): below it every one is kept. */
const BUCKETED_SAMPLES = 20000;
const HEIGHT_BUCKET = 0.05;
const HEIGHT_BUCKETS = 4096;
/**
 * The witnesses of a dense part without a pair per vertex and step: for each height bucket (0.05 px; the height magnitude rounded up, on
 * both sides of the face, which is conservative on both: the drift r|h| / (D − h) grows with |h|) the least inset any vertex has there over the
 * whole travel. The frontier of those is the same as the frontier of all of them, to within the 0.05 px of height, and a
 * 16,384-vertex mesh costs tens of milliseconds, not hundreds. Heights past the buckets are kept as they are.
 */
function bucketedWitnesses(part: InstrumentPart, geometry: PartGeometry, steps: number, bounds: { rect: Box; radius?: number }): Witness[] {
  const above = new Float64Array(HEIGHT_BUCKETS).fill(Infinity), below = new Float64Array(HEIGHT_BUCKETS).fill(Infinity), rest: Witness[] = [];
  const [left, top, width, height] = bounds.rect, radius = Math.max(0, Math.min(bounds.radius ?? 0, width / 2, height / 2)), cx = left + width / 2, cy = top + height / 2;
  const hx = width / 2 - radius, hy = height / 2 - radius, positions = geometry.positions;
  for (let step = 0; step <= steps; step++) {
    const m = partMatrix(part, steps ? step / steps : 0);
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index]!, y = positions[index + 1]!, z = positions[index + 2]!;
      const px = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, py = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, pz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
      const inset = -(Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - radius);
      const bucket = Math.ceil(Math.abs(pz) / HEIGHT_BUCKET);
      if (bucket >= HEIGHT_BUCKETS) { rest.push({ inset, height: pz }); continue; }
      const side = pz >= 0 ? above : below;
      if (inset < side[bucket]!) side[bucket] = inset;
    }
  }
  const pairs = rest;
  for (let bucket = 0; bucket < HEIGHT_BUCKETS; bucket++) {
    if (Number.isFinite(above[bucket]!)) pairs.push({ inset: above[bucket]!, height: bucket * HEIGHT_BUCKET });
    if (Number.isFinite(below[bucket]!)) pairs.push({ inset: below[bucket]!, height: -bucket * HEIGHT_BUCKET - (bucket === 0 ? 1e-9 : 0) });
  }
  return pairs;
}
/**
 * The frontier of an object over its whole travel (independent of where the layer stands): for each part, the pairs of
 * orthographic inset (px inside `bounds`, negative outside) and height that are not dominated by a pair with no more
 * inset and no less height. A vertex's drift grows with its height, so the binding vertex is always on this frontier.
 */
export function containmentFrontier(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): ContainmentFrontier {
  const steps = travelSteps(object, profiles), bounds = object.bounds ?? { rect: object.rect, radius: 0 };
  const parts = object.parts.map(part => {
    const moving = !!part.pose;
    let pairs: Witness[] = [];
    const geometry = profileGeometry(profiles[part.profile]!);
    if ((geometry.positions.length / 3) * ((moving ? steps : 0) + 1) > BUCKETED_SAMPLES) pairs = bucketedWitnesses(part, geometry, moving ? steps : 0, bounds);
    else for (let step = 0; step <= (moving ? steps : 0); step++) {
      const vertices = posedVertices(part, profiles[part.profile]!, moving ? step / steps : 0);
      for (let index = 0; index < vertices.length; index += 3) {
        pairs.push({ inset: -roundedBoxDistance(vertices[index]!, vertices[index + 1]!, bounds.rect, bounds.radius ?? 0), height: vertices[index + 2]! });
      }
    }
    // Pareto frontier, separately above and below the face: a point at +h drifts more than one at −h (D / (D − h)
    // against D / (D + h)), so heights of opposite sign never dominate each other. By |height| descending, keep a pair
    // only if its inset is below every taller pair's of the same sign.
    const frontier: Witness[] = [];
    for (const side of [pairs.filter(pair => pair.height >= 0), pairs.filter(pair => pair.height < 0)]) {
      side.sort((a, b) => Math.abs(b.height) - Math.abs(a.height) || a.inset - b.inset);
      let least = Infinity;
      for (const pair of side) if (pair.inset < least - 1e-9) { frontier.push(pair); least = pair.inset; }
    }
    return frontier;
  });
  return { steps, parts };
}

/** The layer's 2D similarity (`DOMMatrix` a–f) and its scale, or undefined when it is not a similarity. */
export function similarity(matrix: { a: number; b: number; c: number; d: number; e: number; f: number; is2D?: boolean; m33?: number; m34?: number; m14?: number; m24?: number; m44?: number; m43?: number; m31?: number; m32?: number; m13?: number; m23?: number }) {
  if (matrix.is2D === false) return undefined;
  const { a, b, c, d } = matrix, scale = Math.hypot(a, b);
  if (!(scale > 1e-9) || Math.abs(Math.hypot(c, d) - scale) > 1e-6 * scale || Math.abs(a * c + b * d) > 1e-6 * scale * scale || a * d - b * c <= 0) return undefined;
  return { a, b, c, d, e: matrix.e, f: matrix.f, scale };
}
/** Where a layer stands on the stage: its similarity, the vanishing point (canvas px) and the camera distance. */
export interface Placement { matrix: { a: number; b: number; c: number; d: number; e: number; f: number; scale: number }; vanish: Vec2; distance: number }

/**
 * Whether an object's `bounds` lie inside its layer's box (0, 0, width, height), within half a pixel: parts drawn outside
 * it would cover other content. The half pixel keeps a control laid out flush with a fractional layer edge (headful
 * scrollbars put layers on fractional pixels) drawn as parts; containment still keeps every vertex 0.5 px inside `bounds`.
 */
export const BOUNDS_TOLERANCE = 0.5;
export function boundsInside(object: InstrumentObject, extent: { width: number; height: number }): boolean {
  const [x, y, width, height] = (object.bounds ?? { rect: object.rect }).rect;
  return x >= -BOUNDS_TOLERANCE && y >= -BOUNDS_TOLERANCE && x + width <= extent.width + BOUNDS_TOLERANCE && y + height <= extent.height + BOUNDS_TOLERANCE;
}
/** The outcome of checking one object at one placement. */
export interface Containment { contained: boolean; part: number; inset: number; overshoot: number; exact: boolean }

/**
 * 2D.9 at a placement. First the frontier bound: a point at height `h` drifts at most `r · |h| / (D − h)` on screen, with
 * `r` the distance from the vanishing point to the object's farthest bounds corner, so if every frontier pair keeps at
 * least 0.5 px of inset after that drift the object is contained. Otherwise every vertex is projected at every step at
 * this placement (`exact`). `inset` is the smallest projected inset in canvas px (negative outside), `overshoot` how
 * far that vertex lies past `bounds`, and `part` the binding part.
 */
export function checkContainment(object: InstrumentObject, profiles: Record<string, InstrumentProfile>, frontier: ContainmentFrontier, placement: Placement): Containment {
  const { matrix: m, vanish: [vx, vy], distance } = placement, bounds = object.bounds ?? { rect: object.rect, radius: 0 };
  const [bx, by, bw, bh] = bounds.rect;
  const reach = Math.max(...[[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].map(([x, y]) =>
    Math.hypot(m.a * x! + m.c * y! + m.e - vx, m.b * x! + m.d * y! + m.f - vy)));
  let fast = Infinity, fastPart = 0;
  frontier.parts.forEach((pairs, index) => {
    for (const pair of pairs) {
      const height = pair.height * m.scale;
      const value = pair.inset * m.scale - (height >= distance ? Infinity : drift(reach, height, distance));
      if (value < fast) { fast = value; fastPart = index; }
    }
  });
  if (fast >= CONTAINMENT_MARGIN) return { contained: true, part: fastPart, inset: fast, overshoot: 0, exact: false };
  // The exact projection: every vertex at every step, mapped to the canvas, projected and mapped back.
  const det = m.a * m.d - m.b * m.c;
  let least = Infinity, part = 0;
  // The posed vertices are transformed in place of `posedVertices` (no array per vertex): a dense mesh near the limit pays this
  // every frame its layer moves.
  const [left, top, width, height] = bounds.rect, radius = Math.max(0, Math.min(bounds.radius ?? 0, width / 2, height / 2)), cx = left + width / 2, cy = top + height / 2;
  const hx = width / 2 - radius, hy = height / 2 - radius;
  object.parts.forEach((entry, index) => {
    const moving = !!entry.pose, positions = profileGeometry(profiles[entry.profile]!).positions;
    for (let step = 0; step <= (moving ? frontier.steps : 0); step++) {
      const pose = partMatrix(entry, moving ? step / frontier.steps : 0);
      for (let at = 0; at < positions.length; at += 3) {
        const gx = positions[at]!, gy = positions[at + 1]!, gz = positions[at + 2]!;
        const x = pose[0]! * gx + pose[4]! * gy + pose[8]! * gz + pose[12]!, y = pose[1]! * gx + pose[5]! * gy + pose[9]! * gz + pose[13]!;
        const z = (pose[2]! * gx + pose[6]! * gy + pose[10]! * gz + pose[14]!) * m.scale;
        if (z >= distance) { least = -Infinity; part = index; return; }
        const k = distance / (distance - z);
        const sx = vx + (m.a * x + m.c * y + m.e - vx) * k - m.e, sy = vy + (m.b * x + m.d * y + m.f - vy) * k - m.f;
        // Back to layer px through the inverse of the 2 × 2 part.
        const lx = (m.d * sx - m.c * sy) / det, ly = (-m.b * sx + m.a * sy) / det;
        const qx = Math.abs(lx - cx) - hx, qy = Math.abs(ly - cy) - hy;
        const inset = -(Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - radius) * m.scale;
        if (inset < least) { least = inset; part = index; }
      }
    }
  });
  return { contained: least >= CONTAINMENT_MARGIN, part, inset: least, overshoot: Math.max(0, -least), exact: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Casters (2D.7) and the face.

/** A profile's local bounds: x, y and z ranges, and its largest radius about the z axis. */
const boundsCache = new WeakMap<PartGeometry, { low: Vec3; high: Vec3; radius: number }>();
export function profileBounds(shape: InstrumentProfile) {
  const geometry = profileGeometry(shape), cached = boundsCache.get(geometry);
  if (cached) return cached;
  const values = geometry.positions;
  const low: Vec3 = [Infinity, Infinity, Infinity], high: Vec3 = [-Infinity, -Infinity, -Infinity];
  let radius = 0;
  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis]!, values[index + axis]!); high[axis] = Math.max(high[axis]!, values[index + axis]!); }
    radius = Math.max(radius, Math.hypot(values[index]!, values[index + 1]!));
  }
  const result = { low, high, radius };
  boundsCache.set(geometry, result);
  return result;
}
/**
 * What a part casts on the face at `t` (2D.7): its `caster`, `null` for none, or (omitted) the rounded box bounding the
 * posed part's orthographic footprint at the part's mean height. A lathe that does not tilt is a disc about its posed
 * axis; any other part takes the box around its posed local bounds (exact for parts that slide or travel, slightly
 * larger for a turned prism). A mesh takes the xy extent of its posed convex hull (`meshFootprint`), a rounded box as round
 * as the hull, and `limit` (the object's bounds and the light's offset per px of height) caps its height so that the
 * shadow stays inside the box, as the Fader's helper does (`capCasterHeight`). Constant time per part (the hull's
 * points, not the mesh's), so casters follow poses every frame.
 */
export function partCaster(part: InstrumentPart, shape: InstrumentProfile, t: number, bounds = profileBounds(shape),
  limit?: { box: Box; light: [number, number] }): InstrumentCaster | null {
  if (part.caster !== undefined) return part.caster;
  const m = partMatrix(part, t), tilted = (part.pose?.from.tilt ?? 0) !== 0 || (part.pose?.to.tilt ?? 0) !== 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  if (shape.type === "mesh") {
    const footprint = meshFootprint(profileGeometry(shape));
    for (const z of tilted ? [footprint.low[2], footprint.high[2]] : [footprint.low[2]]) for (let at = 0; at < footprint.hull.length; at += 2) {
      const [px, py] = transform(m, footprint.hull[at]!, footprint.hull[at + 1]!, z);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    for (const x of [footprint.low[0], footprint.high[0]]) for (const y of [footprint.low[1], footprint.high[1]]) for (const z of [footprint.low[2], footprint.high[2]]) {
      const [, , pz] = transform(m, x, y, z);
      minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    }
    const height = (minZ + maxZ) / 2, width = maxX - minX, length = maxY - minY;
    if (!(height > 0) || !(width > 0) || !(length > 0)) return null;
    const rect: Box = [minX, minY, width, length];
    const capped = limit ? capCasterHeight(rect, height, limit.box, limit.light) : height;
    return capped > 0 ? { rect, radius: footprint.roundness * Math.min(width, length) / 2, height: capped } : null;
  }
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

/**
 * The face's materials: every material of the scene, or, past the 16 the Relief binding holds (a scene the layer steps down for its
 * materials), those the face's `entries` use.
 */
function collapseFace(all: (readonly [string, InstrumentRecipe])[], entries: readonly ReliefPrimitive[]) {
  if (all.length <= INSTRUMENT_MATERIALS) return { materials: Object.fromEntries(all.map(([name, recipe]) => [name, faceMaterial(recipe)])), entries: [...entries] };
  const used = new Set(entries.map(entry => entry.material));
  // The face binds 16: the first 16 used, in scene order; the rest of the face's entries are drawn in the first (the layer is stepped down, `budget`).
  const kept = all.filter(([name]) => used.has(name)).slice(0, INSTRUMENT_MATERIALS);
  const keep = new Set(kept.map(([name]) => name));
  return { materials: Object.fromEntries(kept.map(([name, recipe]) => [name, faceMaterial(recipe)])),
    entries: entries.map(entry => (keep.has(entry.material) || !kept.length ? entry : { ...entry, material: kept[0]![0] })) };
}
/** The materials the face's own entries (the primitives and every object's Relief primitive) use; the face binds 16 (`budget` above). */
export function faceMaterialCount(scene: InstrumentScene): number {
  return new Set([...scene.primitives, ...scene.objects.map(object => object.relief!)].map(entry => entry.material)).size;
}

/**
 * The face's relief scene (version 1): the scene's primitives, then the Relief primitive of every object in `stepped`
 * (by index), in object order. Cached per scene and step-down set, so `reliefUniforms` packs it once.
 */
const faces = new WeakMap<InstrumentScene, Map<string, ReliefScene>>();
export function instrumentFaceScene(scene: InstrumentScene, stepped: readonly number[]): ReliefScene {
  const key = stepped.join(",");
  let cache = faces.get(scene);
  if (!cache) { cache = new Map(); faces.set(scene, cache); }
  const cached = cache.get(key);
  if (cached) return cached;
  if (cache.size > 64) cache.clear();
  const collapsed = collapseFace(Object.entries(scene.materials), [...scene.primitives, ...stepped.map(index => scene.objects[index]!.relief!)]);
  const value: ReliefScene = {
    format: "strata-scene", version: 1, extent: scene.extent, ...(scene.outset ? { outset: scene.outset } : {}), backdrop: scene.backdrop,
    light: { azimuth: scene.light.azimuth, elevation: scene.light.elevation }, bevel: scene.bevel, shadow: { strength: scene.shadow.strength },
    interior: scene.interior, state: scene.state, focus: scene.focus, materials: collapsed.materials,
    primitives: collapsed.entries,
  };
  cache.set(key, value);
  return value;
}

/** One part kind: one mesh and material, thin-instanced (design language section 6, *Part budgets*). */
export interface PartKind { key: string; profile: string; material: string; captured: boolean; glass?: "lens" | "window"; instances: { object: number; part: number }[] }
/** The kind a part belongs to: parts that share profile, material, `captured` and glass mode are one kind (one mesh, one material). */
export const partKindKey = (part: Pick<InstrumentPart, "profile" | "material" | "captured" | "glass">): string =>
  `${part.profile}\u0000${part.material}\u0000${part.captured ? 1 : 0}\u0000${part.glass ?? ""}`;
/** The part kinds of a scene in first-appearance order (glass parts are kinds of their own, drawn by the glass shader). */
export function partKinds(scene: InstrumentScene): PartKind[] {
  const kinds = new Map<string, PartKind>();
  scene.objects.forEach((object, objectIndex) => object.parts.forEach((part, partIndex) => {
    const captured = part.captured === true, key = partKindKey(part);
    let kind = kinds.get(key);
    if (!kind) { kind = { key, profile: part.profile, material: part.material, captured, ...(part.glass ? { glass: part.glass } : {}), instances: [] }; kinds.set(key, kind); }
    kind.instances.push({ object: objectIndex, part: partIndex });
  }));
  return [...kinds.values()];
}
/**
 * The structure (profiles, materials, the set of part kinds, the light and the environment) and the layout (each part's
 * kind, in order) of a scene.
 */
function structureOf(scene: InstrumentScene) {
  const keys = new Set<string>();
  let layout = "";
  for (const object of scene.objects) {
    for (const part of object.parts) {
      const key = partKindKey(part);
      keys.add(key);
      layout += `${key}\u0001`;
    }
    layout += "\u0002";
  }
  // The light and the environment are built into the scene (key light, fill, studio image and rotation, material
  // environment intensity), so a change to them rebuilds it like a new profile does; so is the clustered light
  // container, which a scene has when it has an `emitters` field (emitter values themselves update in place).
  return { structure: JSON.stringify([scene.profiles, scene.materials, [...keys].sort(), scene.light, scene.environment, scene.emitters !== undefined]), layout };
}
/** What the scene is built from (profiles, materials, part kinds, light, environment): only a rebuild changes it; counts do not. */
export function instrumentStructure(scene: InstrumentScene): string {
  return (derived.get(scene) ?? structureOf(scene)).structure;
}
/** Each part's kind, in order: equal layouts give equal `partKinds`. */
export function instrumentLayout(scene: InstrumentScene): string {
  return (derived.get(scene) ?? structureOf(scene)).layout;
}
const samePose = (x?: InstrumentPose, y?: InstrumentPose) => (x?.travel ?? 0) === (y?.travel ?? 0) && (x?.turn ?? 0) === (y?.turn ?? 0)
  && (x?.tilt ?? 0) === (y?.tilt ?? 0) && (x?.axis ?? 0) === (y?.axis ?? 0) && (x?.slide?.[0] ?? 0) === (y?.slide?.[0] ?? 0)
  && (x?.slide?.[1] ?? 0) === (y?.slide?.[1] ?? 0) && (x?.pivot?.[0] ?? 0) === (y?.pivot?.[0] ?? 0)
  && (x?.pivot?.[1] ?? 0) === (y?.pivot?.[1] ?? 0) && (x?.pivot?.[2] ?? 0) === (y?.pivot?.[2] ?? 0);
/**
 * Whether two scenes of the same structure place the same geometry, apart from `t` and states: the same objects' bounds
 * and the same parts (profile, `at`, pose stops, casters), so containment over the whole travel and the face shadows are
 * unchanged. Numbers are compared and nothing is serialized, so it is cheap enough for every frame.
 */
export function sameGeometry(a: InstrumentScene, b: InstrumentScene): boolean {
  if (a === b) return true;
  if (a.objects.length !== b.objects.length) return false;
  for (let index = 0; index < a.objects.length; index++) {
    const p = a.objects[index]!, q = b.objects[index]!, pb = p.bounds ?? { rect: p.rect, radius: 0 }, qb = q.bounds ?? { rect: q.rect, radius: 0 };
    if (p.parts.length !== q.parts.length || (pb.radius ?? 0) !== (qb.radius ?? 0) || pb.rect.some((value, at) => value !== qb.rect[at])) return false;
    for (let at = 0; at < p.parts.length; at++) {
      const r = p.parts[at]!, s = q.parts[at]!;
      if (r.profile !== s.profile || r.glass !== s.glass || r.at[0] !== s.at[0] || r.at[1] !== s.at[1] || r.at[2] !== s.at[2] || !!r.pose !== !!s.pose) return false;
      if (r.pose && (!samePose(r.pose.from, s.pose!.from) || !samePose(r.pose.to, s.pose!.to))) return false;
      // Casters do not change containment, but they change what the face shadows draw.
      const c = r.caster, d = s.caster;
      if (c !== d && (!c || !d || c.height !== d.height || c.radius !== d.radius || c.rect.some((value, index) => value !== d.rect[index]))) return false;
    }
  }
  return true;
}
/** The number of parts a scene describes. */
export function instrumentPartCount(scene: InstrumentScene): number {
  return derived.get(scene)?.parts ?? scene.objects.reduce((sum, object) => sum + object.parts.length, 0);
}
/** A key for what an object's containment depends on, apart from where its layer stands: everything but `t` and states. */
export function containmentKey(object: InstrumentObject, profiles: Record<string, InstrumentProfile>): string {
  // A reference counts once its triangles are there: the same shape is a different thing to check.
  return JSON.stringify([object.bounds ?? object.rect, object.parts.map(part => [profiles[part.profile], meshReady(profiles[part.profile]!), part.at, part.pose ?? null])]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Custom parts (core work item 5).

/** Whether a profile has its triangles: always, except a mesh reference whose file is not loaded (yet, or at all). */
export const meshReady = (shape: InstrumentProfile): boolean => shape.type !== "mesh" || meshGeometry(shape) !== undefined;
const twins = new WeakMap<InstrumentPart[], Int16Array>();
/** For each stand-in part (`fallbackFor`) the index of its custom part, the next part without the mark; -1 for any other part. */
function twinsOf(parts: InstrumentPart[]): Int16Array {
  let result = twins.get(parts);
  if (!result) {
    result = new Int16Array(parts.length).fill(-1);
    for (let index = 0; index < parts.length; index++) {
      if (!parts[index]!.fallbackFor) continue;
      let next = index + 1;
      while (next < parts.length && parts[next]!.fallbackFor) next++;
      result[index] = next < parts.length ? next : -1;
    }
    twins.set(parts, result);
  }
  return result;
}
/**
 * Whether part `index` of `object` is drawn: a custom part once it has its triangles, a stand-in only until then, every other
 * part always.
 */
export function partDrawn(object: InstrumentObject, index: number, profiles: Record<string, InstrumentProfile>): boolean {
  const part = object.parts[index]!;
  if (part.fallbackFor) { const twin = twinsOf(object.parts)[index]!; return twin < 0 || !meshReady(profiles[object.parts[twin]!.profile]!); }
  return meshReady(profiles[part.profile]!);
}
/** A mesh profile of a scene, by name. */
export interface MeshReference { name: string; shape: MeshProfile }
/** The scene's mesh profiles that are references to a file (the asset store loads these). */
export function meshReferences(scene: InstrumentScene): MeshReference[] {
  return Object.entries(scene.profiles).flatMap(([name, shape]) => (shape.type === "mesh" && shape.source ? [{ name, shape: shape as MeshProfile }] : []));
}
/** The custom parts of a scene: each part whose profile is a mesh, with the profile's name. */
export function customParts(scene: InstrumentScene): { object: number; part: number; profile: string }[] {
  return scene.objects.flatMap((object, objectIndex) => object.parts.flatMap((part, partIndex) => (scene.profiles[part.profile]?.type === "mesh" ? [{ object: objectIndex, part: partIndex, profile: part.profile }] : [])));
}
