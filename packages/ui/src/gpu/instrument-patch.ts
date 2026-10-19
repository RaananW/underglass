/**
 * The PatchPoint at the Instrument level (design language section 6, the Instrument object table; section 12; Rendering Model part
 * 2D): the premium jack in its washer as an object of parts for core's `instrument` material, bounded by the native control's box
 * (anatomy page `patch-point.md`). The GPU helper's `instrument` level draws each jack with it, as it does the Lamp; the part
 * definitions and poses are checked by core's validator and containment check in the unit tests. The helper never imports core, so
 * the version 4 shapes are restated here as the subset the jack writes.
 *
 * Every object stands at the centre of its box (the washer + 20, a square).
 * - **plate:** the washer, a turned ring Ø `size.patchPoint` (28, 36 or 44) with a hole of 0.44 of that, 2.2 high, an edge break on
 *   its rim and a bore wall down to the face, in brushed metal;
 * - **bushing:** the jack's barrel, a polished ring (3.2 wide, 1.8 high) on the washer round the hole;
 * - **slot:** the hole's floor, a dark disc a hair above the face. The face under it is the socket printed dark, so the jack reads as
 *   a recess at every level; this disc hides a plug that is not seated;
 * - **pivot:** the plug, a polished cylinder Ø 0.34 of the washer, 11 high, that rises out of the hole when the jack is connected;
 * - **lever:** the cable's stub, a rubber tube Ø 0.11 of the washer leaving the plug's side and running down the screen to just short
 *   of the washer's edge, with a rounded end, at the height of the plug's shoulder.
 * `t` is the plug's seating, 0 unplugged and 1 connected, on `spring.patch`; the plug and the stub share one pose, `travel`
 * from −(plug height + 1) to 0, so unplugged they are sunk under the hole's floor and the washer, out of sight, and the parts and
 * their order never depend on the state (which would rebuild the layer). Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and
 * 100%); diameters do not.
 */
import { fittedHeight } from "../shared/switch-forms.ts";
import type { InstrumentPart, InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface PatchPart {
  kind: "plate" | "bushing" | "slot" | "pivot" | "lever";
  profile: string;
  at: Vec3;
  pose?: InstrumentPart["pose"];
  material: string;
  caster?: null | { rect: Box; radius: number; height: number };
  state: { hover: boolean; disabled: boolean };
}
export interface PatchObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: PatchPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

/** The premium numbers at 50% depth, as shares of the washer's diameter where they scale with it. */
export const patchGeometry = {
  /** The room round the washer in the box, each side: its shadow and the perspective. */
  margin: 10,
  plate: { height: 2.2, edgeBreak: 0.5 },
  /** The hole's radius is this share of the washer's diameter, rounded to a whole pixel of diameter. */
  hole: 0.22,
  bushing: { width: 3.2, height: 1.8, edgeBreak: 0.4 },
  plug: { diameter: 0.34, height: 11, chamfer: 1 },
  cable: { diameter: 0.11, reach: 2 },
  /** The floor's height above the face. */
  floor: 0.03,
} as const;

/** The jack's box for a washer `size` px across. */
export const patchBox = (size: number) => size + 2 * patchGeometry.margin;

const round = (value: number) => Math.round(value * 1000) / 1000;
const even = (value: number) => 2 * Math.round(value / 2);

/** The jack's radii for a washer `size` px across: the hole, the plug and the cable (a tube's radius). */
export function patchRadii(size: number) {
  return { washer: size / 2, hole: even(patchGeometry.hole * size * 2) / 2, plug: even(patchGeometry.plug.diameter * size) / 2, cable: Math.max(1.5, round((patchGeometry.cable.diameter * size) / 2)) };
}

/** The premium numbers' materials: the cable's satin rubber; the washer is the knob's brushed metal, the rest the knob's polished and ink. */
export const patchMaterials: Record<"patchCable", InstrumentRecipe> = {
  patchCable: { base: { colour: "#2c2f36", roughness: 0.42 } },
};

/** What a patch point's object needs from the page, in panel px. */
export interface PatchInput {
  id: string;
  /** The native control's box: the object's `bounds`. */
  box: Box;
  /** The washer's diameter. */
  size: number;
  /** The plug's seating, 0 (unplugged) to 1 (connected): the spring's. */
  t: number;
  scale: number;
  state: { hover: boolean; disabled: boolean };
  /** The key light; given, the washer's caster is capped so its shadow stays in `box`. */
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

/** The plug's height and the cable's axis height at a depth scale: the axis sits below the plug's shoulder and clears the barrel. */
export function plugHeights(size: number, scale: number) {
  const g = patchGeometry, { cable } = patchRadii(size), plug = round(g.plug.height * scale);
  const barrel = round((g.plate.height + g.bushing.height) * scale);
  return { plug, barrel, axis: round(Math.max(plug - cable - 1.2, barrel + cable + 0.4)) };
}

/** A jack as an Instrument object; `profile` registers a shape and returns its name. */
export function patchPointObject(input: PatchInput, profile: (name: string, shape: InstrumentProfile) => string): PatchObject {
  const [bx, by, bw, bh] = input.box, cx = round(bx + bw / 2), cy = round(by + bh / 2), s = input.scale, g = patchGeometry;
  const { washer, hole, plug, cable } = patchRadii(input.size);
  const state = { hover: input.state.hover, disabled: input.state.disabled }, diagonal = Math.SQRT1_2;
  const plateHeight = round(g.plate.height * s), barrelHeight = round(g.bushing.height * s), eb = g.plate.edgeBreak;
  const parts: PatchPart[] = [];
  // The washer's shadow stays in the box: core's own caster, unless that shadow would leave it; then the same footprint at the tallest height that fits.
  let caster: PatchPart["caster"] | undefined;
  if (input.light) {
    const rect: Box = [round(cx - washer), round(cy - washer), round(2 * washer), round(2 * washer)];
    const margins = { left: Math.max(0, rect[0] - bx - 1), right: Math.max(0, bx + bw - rect[0] - rect[2] - 1), top: Math.max(0, rect[1] - by - 1), bottom: Math.max(0, by + bh - rect[1] - rect[3] - 1) };
    const fit = Math.floor(fittedHeight(plateHeight / 2, margins, input.light) * 1000) / 1000;
    if (fit < plateHeight / 2) caster = { rect, radius: round(washer), height: fit };
  }
  parts.push({ kind: "plate", profile: profile("patch-washer", { type: "lathe", segments: 64, points: [
    [washer, 0, 1, 0], [washer, round(plateHeight - eb), 1, 0], [washer, round(plateHeight - eb), diagonal, diagonal], [round(washer - eb), plateHeight, diagonal, diagonal],
    [round(washer - eb), plateHeight, 0, 1], [hole, plateHeight, 0, 1], [hole, 0, -1, 0],
  ] }), at: [cx, cy, 0], material: "knobCap", ...(caster ? { caster } : {}), state });
  const barrel = g.bushing.width, be = g.bushing.edgeBreak, top = round(hole + barrel);
  parts.push({ kind: "bushing", profile: profile("patch-barrel", { type: "lathe", segments: 64, points: [
    [top, 0, 1, 0], [top, round(barrelHeight - be), 1, 0], [top, round(barrelHeight - be), diagonal, diagonal], [round(top - be), barrelHeight, diagonal, diagonal],
    [round(top - be), barrelHeight, 0, 1], [round(hole + 0.3), barrelHeight, 0, 1], [hole, round(barrelHeight - 0.3), -diagonal, diagonal], [hole, 0, -1, 0],
  ] }), at: [cx, cy, plateHeight], material: "knobSkirt", caster: null, state });
  parts.push({ kind: "slot", profile: profile("patch-floor", { type: "lathe", segments: 48, points: [[round(hole + 0.05), g.floor, 0, 1], [0, g.floor, 0, 1]] }),
    at: [cx, cy, 0], material: "knobInk", caster: null, state });
  // The plug and the stub share one pose: seated at t = 1, sunk out of sight at t = 0 (the floor and the washer hide it).
  const { plug: plugHeight, axis } = plugHeights(input.size, s), sink = round(plugHeight + 1);
  const seat = (tilt: boolean) => ({ from: { travel: -sink, ...(tilt ? { tilt: 90, axis: 180 } : {}) }, to: { travel: 0, ...(tilt ? { tilt: 90, axis: 180 } : {}) } });
  const chamfer = g.plug.chamfer;
  parts.push({ kind: "pivot", profile: profile("patch-plug", { type: "lathe", segments: 48, points: [
    [plug, 0, 1, 0], [plug, round(plugHeight - chamfer), 1, 0], [plug, round(plugHeight - chamfer), diagonal, diagonal], [round(plug - chamfer), plugHeight, diagonal, diagonal], [0, plugHeight, 0, 1],
  ] }), at: [cx, cy, 0], pose: seat(false), material: "knobSkirt", caster: null, state });
  // The cable: a tube along the part's z (length from the plug's axis to just short of the washer's edge), laid down by the tilt to run towards the bottom of the screen.
  const length = round(washer - g.cable.reach), tube = round(length - cable);
  const end: [number, number, number, number][] = [];
  for (let step = 1; step <= 5; step++) { const angle = (step / 5) * (Math.PI / 2); end.push([round(cable * Math.cos(angle)), round(tube + cable * Math.sin(angle)), round(Math.cos(angle)), round(Math.sin(angle))]); }
  parts.push({ kind: "lever", profile: profile("patch-cable", { type: "lathe", segments: 24, points: [[cable, 0, 1, 0], [cable, tube, 1, 0], ...end] }),
    at: [cx, cy, axis], pose: seat(true), material: "patchCable", caster: null, state });
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: [round(cx - washer), round(cy - washer), input.size, input.size], radius: washer, height: input.relief.height, material: input.relief.material },
  };
}

/** The tallest point of a jack's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export const patchHeight = (size: number, scale: number) => round(Math.max(plugHeights(size, scale).plug, plugHeights(size, scale).axis + patchRadii(size).cable) + 0.1);
