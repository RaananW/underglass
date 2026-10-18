/**
 * Instrument scenes for the `instrument-custom-core.html` page (core work item 5, custom parts): each control of the
 * panel is a native range input whose Instrument object is a flat base plate (a parametric part, always drawn) and one
 * custom part standing on it. The custom parts come from every source core takes:
 * - inline meshes (`bar-inline` turns; `disc-inline` brings its own normals; `long-bar` is too long for its box);
 * - references to `public/custom/parts.glb` (`scripts/make-custom-fixture.mjs`): `cap` (a fluted knob cap, turns), `lever`
 *   (turns about its centre), `block` (no NORMAL in the file; travels), `dense` (about 2,500 vertices), `slab` (larger
 *   than its box: refused), and three files that fail (`missing` 404, `malformed`, `wrong-scale` whose declared box does
 *   not hold the mesh);
 * - `tall-cap`: the same cap at twice the scale, nearly as wide as its box and 21 px tall, whose face shadow would leave the
 *   box without the cap on a derived caster's height;
 * - `lamp`: the dome of `dense` as the lens of an emitter (`emitter: 0`): its glow copy takes the file's triangles too, and the
 *   emitter lights the lens (clustered lights) and blooms inside its box, with no light on the face (`face: 0`);
 * - `glass-dome`: the same dome as a glass lens (`glass: "lens"`): the glass shader refracts the capture through the file's triangles;
 * - `fb-missing` and `fb-cap`: a custom cap with a `fallback` (the lathe cap of the same rings) drawn while the file loads and after it
 *   fails: the first never loads (404), the second does. `options.asParametric` draws the lathe cap alone, for the pixel comparison;
 * - `prism-ref`: the parametric prism the `block` mesh imitates, for the tops-are-lit comparison.
 * Nothing here is a core API: it is what an application (or the Strata helper) writes.
 */
import type { InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentRecipe, InstrumentScene } from "@underglass/core";

type Vec3 = [number, number, number];
export const CAMERA_DISTANCE = 2400;
export const GLB = "/custom/parts.glb";
export const SPECS = ["bar-inline", "disc-inline", "cap", "lever", "block", "dense", "slab", "long-bar", "missing", "malformed", "wrong-scale", "prism-ref", "tall-cap", "lamp", "glass-dome", "fb-missing", "fb-cap"] as const;
export type Spec = (typeof SPECS)[number] | "cap-lathe";
/** The control's box edge, px. */
export const BOX = 100;

/** The box rule's margin (I0.2): `ceil(drift(h) + 1)` with `r` the stage's half-diagonal. */
export function margin(height: number, stage: { width: number; height: number }) {
  const r = Math.hypot(stage.width, stage.height) / 2;
  return Math.ceil((r * height) / (CAMERA_DISTANCE - height) + 1);
}

/** A closed box (x by y by z, standing on z = 0) as inline arrays with computed normals. */
function boxArrays(w: number, d: number, h: number) {
  const hx = w / 2, hy = d / 2, positions: number[] = [], indices: number[] = [];
  const faces: Vec3[][] = [[[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0]], [[-hx, -hy, h], [-hx, hy, h], [hx, hy, h], [hx, -hy, h]],
    [[-hx, -hy, 0], [-hx, -hy, h], [hx, -hy, h], [hx, -hy, 0]], [[hx, hy, 0], [hx, hy, h], [-hx, hy, h], [-hx, hy, 0]],
    [[hx, -hy, 0], [hx, -hy, h], [hx, hy, h], [hx, hy, 0]], [[-hx, hy, 0], [-hx, hy, h], [-hx, -hy, h], [-hx, -hy, 0]]];
  for (const corners of faces) {
    const start = positions.length / 3;
    for (const corner of corners) positions.push(...corner);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return { positions, indices };
}
/** A 24-gon prism of radius 20 and height 8 with its own normals: radial on the side, up on the top. */
function discArrays() {
  const sides = 24, positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let step = 0; step < sides; step++) {
    const angle = (step / sides) * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
    positions.push(c * 20, s * 20, 0, c * 20, s * 20, 8);
    normals.push(c, s, 0, c, s, 0);
  }
  for (let step = 0; step < sides; step++) {
    const next = (step + 1) % sides;
    indices.push(step * 2, next * 2, step * 2 + 1, step * 2 + 1, next * 2, next * 2 + 1);
  }
  // The top: its own ring and a centre, facing up.
  const top = positions.length / 3;
  for (let step = 0; step < sides; step++) { const angle = (step / sides) * Math.PI * 2; positions.push(Math.cos(angle) * 20, Math.sin(angle) * 20, 8); normals.push(0, 0, 1); }
  positions.push(0, 0, 8); normals.push(0, 0, 1);
  for (let step = 0; step < sides; step++) indices.push(top + sides, top + step, top + (step + 1) % sides);
  return { positions, normals, indices };
}
// Built once: updates hand core the same arrays, which it recognises (no validation per frame).
const bar = { type: "mesh" as const, ...boxArrays(64, 10, 5), normals: "compute" as const };
const longBar = { type: "mesh" as const, ...boxArrays(108, 10, 5), normals: "compute" as const };
const disc = { type: "mesh" as const, ...discArrays() };
/** The fluted cap as the parametric lathe: the same rings and segments as the file's `Cap`, for the cost comparison. */
export const capLathe: InstrumentProfile = { type: "lathe", segments: 64, points: [
  [18, 0, 1, 0], [18, 8.6, 1, 0], [18, 8.6, Math.SQRT1_2, Math.SQRT1_2], [16.6, 10, Math.SQRT1_2, Math.SQRT1_2], [16.6, 10, 0, 1], [9, 10.35, 0.05, 1], [0, 10.5, 0, 1]] };

interface Model { profile: InstrumentProfile; height: number; pose?: { from: { turn?: number; travel?: number }; to: { turn?: number; travel?: number } } }
const turn = { from: { turn: -135 }, to: { turn: 135 } };
const glb = (mesh: string, low: Vec3, high: Vec3, extra: { scale?: number; url?: string } = {}): InstrumentProfile =>
  ({ type: "mesh", source: { url: extra.url ?? GLB, mesh }, bounds: { low, high }, ...(extra.scale ? { scale: extra.scale } : {}) });
export function modelOf(spec: Spec): Model {
  switch (spec) {
    case "bar-inline": return { profile: bar, height: 5, pose: turn };
    case "disc-inline": return { profile: disc, height: 8 };
    case "cap": return { profile: glb("Cap", [-18.5, -18.5, 0], [18.5, 18.5, 10.6]), height: 10.6, pose: turn };
    case "lever": return { profile: glb("Lever", [-30, -4, 0], [30, 4, 6]), height: 6, pose: { from: { turn: -60 }, to: { turn: 60 } } };
    case "block": return { profile: glb("Block", [-12, -12, 0], [12, 12, 6]), height: 6, pose: { from: { travel: 0 }, to: { travel: -1.5 } } };
    case "dense": return { profile: glb("Dense", [-20.5, -20.5, 0], [20.5, 20.5, 8.1]), height: 8 };
    case "slab": return { profile: glb("Slab", [-70, -70, 0], [70, 70, 4]), height: 4 };
    case "long-bar": return { profile: longBar, height: 5, pose: turn };
    case "missing": return { profile: glb("Cap", [-18.5, -18.5, 0], [18.5, 18.5, 10.6], { url: "/custom/nothing.glb" }), height: 10.6 };
    case "malformed": return { profile: glb("Cap", [-18.5, -18.5, 0], [18.5, 18.5, 10.6], { url: "/custom/malformed.glb" }), height: 10.6 };
    case "wrong-scale": return { profile: glb("Cap", [-18.5, -18.5, 0], [18.5, 18.5, 10.6], { scale: 3 }), height: 10.6 };
    case "tall-cap": return { profile: glb("Cap", [-37, -37, 0], [37, 37, 21.2], { scale: 2 }), height: 21.2, pose: turn };
    case "lamp": return { profile: glb("Dense", [-20.5, -20.5, 0], [20.5, 20.5, 8.1]), height: 8.1 };
    case "glass-dome": return { profile: glb("Dense", [-20.5, -20.5, 0], [20.5, 20.5, 8.1]), height: 8.1 };
    case "fb-missing": return { profile: glb("Cap", [-18.5, -18.5, 0], [18.5, 18.5, 10.6], { url: "/custom/nothing.glb" }), height: 10.6, pose: turn };
    case "fb-cap": return { profile: glb("Cap", [-18.5, -18.5, 0], [18.5, 18.5, 10.6]), height: 10.6, pose: turn };
    case "cap-lathe": return { profile: capLathe, height: 10.5, pose: turn };
    case "prism-ref": return { profile: { type: "prism", width: 24, length: 24, radius: 0, height: 6 }, height: 6, pose: { from: { travel: 0 }, to: { travel: -1.5 } } };
  }
}

export const materials: Record<string, InstrumentRecipe> = {
  face: { base: { roughness: 0.6 } },
  base: { base: { colour: "#8d93a0", roughness: 0.6 } },
  metal: { base: { colour: "#eceef0", metallic: 1, roughness: 0.3, direct: 0.2 }, brush: { strength: 0.9, direction: "circular" }, grain: { strength: 0.15 } },
  matte: { base: { colour: "#c8ccd4", roughness: 0.55 } },
  pin: { base: { colour: "#101012", roughness: 0.9 } },
  lamp: { base: { colour: "#ffd9a0", roughness: 0.3 }, emissive: { strength: 1.2, colour: "#ffb347" } },
  glass: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#d6ede6", absorption: 0.03, reflection: 1.5 } },
};

export interface SceneOptions {
  /** The custom parts, or only the base plates. */
  custom: boolean;
  /** Face shadows of the custom parts (derived casters), or none. */
  casters: boolean;
  /** Any objects at all (false: the face only). */
  objects: boolean;
  /** The `fb-*` controls as the plain lathe cap their fallback is (no custom part, no fallback). */
  asParametric?: boolean;
  /** An explicit caster for every custom part (the shadow cap does not apply to it). */
  caster?: InstrumentPart["caster"];
}

/** One control's object: a base plate and the custom part on it. */
export function objectOf(id: string, spec: Spec, rect: [number, number, number, number], t: number, stage: { width: number; height: number }, options: SceneOptions,
  profiles: Record<string, InstrumentProfile>, emitter?: number): InstrumentObject {
  const [x, y, w, h] = rect, cx = x + w / 2, cy = y + h / 2;
  const model = modelOf(spec), plate = margin(2, stage);
  const name = `plate:${w}`;
  profiles[name] ??= { type: "prism", width: w - 2 * plate, length: h - 2 * plate, radius: 6, height: 2, chamfer: 0.4 };
  const parts: InstrumentPart[] = [{ kind: "plate", profile: name, at: [cx, cy, 0], material: "base", caster: null }];
  if (options.custom && spec.startsWith("fb-") && options.asParametric) {
    profiles["cap-lathe"] = capLathe;
    parts.push({ kind: "cap", profile: "cap-lathe", at: [cx, cy, 2], material: "metal", pose: turn, ...(options.casters ? {} : { caster: null }) });
  } else if (options.custom) {
    profiles[spec] = model.profile;
    if (spec.startsWith("fb-")) profiles["cap-lathe"] = capLathe;
    parts.push({ kind: model.profile.type === "mesh" ? "custom" : "cap", profile: spec, at: [cx, cy, 2], material: spec === "lamp" ? "lamp" : spec === "glass-dome" ? "glass" : ["block", "prism-ref", "bar-inline", "disc-inline"].includes(spec) ? "matte" : "metal",
      ...(emitter !== undefined ? { emitter } : {}), ...(spec === "glass-dome" ? { glass: "lens" as const } : {}),
      ...(model.pose ? { pose: model.pose } : {}),
      ...(spec.startsWith("fb-") ? { fallback: [{ kind: "cap" as const, profile: "cap-lathe", at: [cx, cy, 2] as [number, number, number], material: "metal", pose: turn, ...(options.casters ? {} : { caster: null }) }] } : {}),
      ...(options.casters ? (options.caster !== undefined ? { caster: options.caster } : {}) : { caster: null }) });
  }
  return { id, rect, bounds: { rect, radius: 0 }, t, parts, relief: { face: "raised", rect, radius: 4, height: 0, material: "base" } };
}

/** `?map=off` (a darkness of 1 builds no shadow map): for telling the map's own refit from the parts' own pixels. */
const mapOff = new URLSearchParams(location.search).get("map") === "off";
export function sceneOf(panel: { width: number; height: number }, objects: InstrumentObject[], profiles: Record<string, InstrumentProfile>, protectedRects: [number, number, number, number][],
  stage: { width: number; height: number }, emitters: InstrumentScene["emitters"]): InstrumentScene {
  return {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance: CAMERA_DISTANCE, vanish: [stage.width / 2, stage.height / 2] }, environment: { source: "studio", strength: 1 },
    extent: panel, outset: { top: 16, right: 16, bottom: 16, left: 16 },
    backdrop: "#e3e5e9", light: { azimuth: 323, elevation: 41 },
    bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24, ...(mapOff ? { map: { darkness: 1 } } : {}) }, interior: { max: 0.04 },
    state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials, protected: protectedRects, ...(emitters?.length ? { emitters } : {}),
    primitives: [{ face: "raised", rect: [0, 0, panel.width, panel.height], radius: 14, height: 6, material: "face" }],
    profiles, objects,
  };
}
