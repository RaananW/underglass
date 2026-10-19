/**
 * The JogWheel at the Instrument level (design language section 6, the Instrument object table; section 12; Rendering Model
 * part 2D): the premium jog wheel as an object of parts for core's `instrument` material, bounded by the native input's box
 * (anatomy page `jog-wheel.md`). The GPU helper's `instrument` level draws each wheel with it, as it does the Knob; the part
 * definitions and poses are checked by core's validator and containment check in the unit tests. The helper never imports core,
 * so the version 4 shapes are restated here as the subset the jog wheel writes.
 *
 * Every object stands at the centre of its box. A wheel is a solid of revolution, so only the dimple shows how far it has turned:
 * - **collar:** the bearing, a polished ring (3 wide, 1.6 high) round the wheel in the recess printed on the face, with a 0.4 gap
 *   between them that shows the recess;
 * - **cap:** the wheel, a turned disc Ø `size.jogWheel` (64, 96 or 128), 8 high with a 2 px chamfer and a flat, brushed top;
 * - **chamfer:** the cap's chamfer in polished metal, a hair outside the cap's own;
 * - **grip:** the finger dimple, a dish Ø 0.2 of the wheel, 0.34 of the wheel's diameter from its centre, in graphite, on the cap's
 *   top. It is flat with a raised lip and the normals of a bowl, so it shades as a concave dish; it turns about the wheel's centre.
 * `t` is the angle's place in a turn: the accumulated angle modulo 360° over 360, so the dimple's pose runs a full turn from 0 to 1
 * and the wrap from 1 to 0 is the same pose: the wheel never snaps back (`gpu/index.ts` keeps the accumulated angle on its spring).
 * The parts never depend on the value or the angle beyond `t`. Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%);
 * diameters and angles do not.
 */
import { fittedHeight } from "../shared/switch-forms.ts";
import type { InstrumentPart, InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface JogPart {
  kind: "collar" | "cap" | "chamfer" | "grip";
  profile: string;
  at: Vec3;
  pose?: InstrumentPart["pose"];
  material: string;
  caster?: null | { rect: Box; radius: number; height: number };
  state: { hover: boolean; disabled: boolean };
}
export interface JogObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: JogPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

/** The premium numbers at 50% depth: the margin round the wheel in its box, the cap, the collar and the dimple. */
export const jogGeometry = {
  margin: 16,
  cap: { height: 8, chamfer: 2 },
  collar: { gap: 0.4, width: 3, height: 1.6, edgeBreak: 0.5 },
  /** The dimple's diameter and its distance from the centre, as shares of the wheel's diameter; its rim stands this high. */
  dimple: { diameter: 0.2, at: 0.34, lip: 0.5, lift: 0.04, bowl: 2.4 },
} as const;

/** The jog wheel's box for a wheel `size` px across (the recess is `size + 8`; the rest is room for the shadow and the perspective). */
export const jogBox = (size: number) => size + 2 * jogGeometry.margin;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The dimple's graphite: a dark satin metal that reads on the brushed cap in any light. */
export const jogMaterials: Record<"jogDimple", InstrumentRecipe> = {
  jogDimple: { base: { colour: "#3a3d44", metallic: 0.85, roughness: 0.3, direct: 1 } },
};

/** The dimple's diameter and distance from the centre for a wheel `size` px across, whole pixels in diameter (even). */
export function dimpleOf(size: number) {
  const diameter = Math.max(4, 2 * Math.round((jogGeometry.dimple.diameter * size) / 2)), at = round(jogGeometry.dimple.at * size);
  return { diameter, at, radius: diameter / 2 };
}

/**
 * The dimple's dish (a lathe about its own axis): flat at the cap's top with a raised lip at its rim and the normals of a bowl
 * `bowl` px deep, so it shades as a concave dish.
 */
export function dimpleProfile(size: number): InstrumentProfile {
  const { radius } = dimpleOf(size), { lip, lift, bowl } = jogGeometry.dimple;
  const points: [number, number, number, number][] = [];
  for (let step = 0; step <= 8; step++) {
    const share = 1 - step / 8, r = round(radius * share);
    // A bowl's sag is bowl · (1 − share²); its slope towards the axis is the normal's lean (nr < 0 points at the axis).
    const slope = (2 * bowl * share) / radius, length = Math.hypot(slope, 1);
    points.push([r, round(lift + lip * share * share), round(-slope / length), round(1 / length)]);
  }
  // The lip's outer wall, from the top down to the cap: the first point repeated with an outward normal makes the crease.
  return { type: "lathe", segments: 32, points: [[radius, 0, 1, 0], [radius, round(lift + lip), 1, 0], ...points.map((point, index) => (index === 0 ? [point[0], point[1], 0.6, 0.8] as [number, number, number, number] : point))] };
}

/** What a jog wheel's object needs from the page, in panel px. */
export interface JogInput {
  id: string;
  /** The input's box: the object's `bounds`. */
  box: Box;
  /** The wheel's diameter. */
  size: number;
  /** The accumulated angle, degrees: the dimple's turn is its place in a turn. */
  angle: number;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  state: { hover: boolean; disabled: boolean };
  /** The key light; given, the casters of the collar and the cap are capped so their shadows stay in `box`. */
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

/** The wheel's place in a turn, 0 (inclusive) to 1: the angle modulo 360° over 360. */
export const turnOf = (angle: number) => round((((angle % 360) + 360) % 360) / 360);

/** A jog wheel as an Instrument object; `profile` registers a shape and returns its name. */
export function jogWheelObject(input: JogInput, profile: (name: string, shape: InstrumentProfile) => string): JogObject {
  const [bx, by, bw, bh] = input.box, cx = round(bx + bw / 2), cy = round(by + bh / 2), s = input.scale, r = input.size / 2;
  const state = { hover: input.state.hover, disabled: input.state.disabled };
  const g = jogGeometry, height = round(g.cap.height * s), c = g.cap.chamfer, diagonal = Math.SQRT1_2;
  const parts: JogPart[] = [];
  // A part that stands still casts on the face its footprint at its mean height, unless that shadow would leave the box: then the same footprint at the tallest height that fits.
  const capped = (radius: number, mean: number): { caster?: { rect: Box; radius: number; height: number } } => {
    if (!input.light) return {};
    const rect: Box = [round(cx - radius), round(cy - radius), round(2 * radius), round(2 * radius)];
    const margins = { left: Math.max(0, rect[0] - bx - 1), right: Math.max(0, bx + bw - rect[0] - rect[2] - 1), top: Math.max(0, rect[1] - by - 1), bottom: Math.max(0, by + bh - rect[1] - rect[3] - 1) };
    const fit = Math.floor(fittedHeight(mean, margins, input.light) * 1000) / 1000;
    return fit < mean ? { caster: { rect, radius: round(radius), height: fit } } : {};
  };
  // The collar: a ring on the face, an edge break on its outer top edge and a wall down to the face on its inner side.
  const inner = round(r + g.collar.gap), outer = round(inner + g.collar.width), h = round(g.collar.height * s), eb = g.collar.edgeBreak;
  parts.push({ kind: "collar", profile: profile("jog-collar", { type: "lathe", segments: 64, points: [
    [outer, 0, 1, 0], [outer, round(h - eb), 1, 0], [outer, round(h - eb), diagonal, diagonal], [round(outer - eb), h, diagonal, diagonal], [round(outer - eb), h, 0, 1],
    [round(inner + 0.3), h, 0, 1], [inner, round(h - 0.3), -diagonal, diagonal], [inner, 0, -1, 0],
  ] }), at: [cx, cy, 0], material: "knobSkirt", ...capped(outer, h / 2), state });
  // The cap: its side, the 2 px chamfer, a flat top.
  const top = round(r - c);
  parts.push({ kind: "cap", profile: profile("jog-cap", { type: "lathe", segments: 64, points: [
    [r, 0, 1, 0], [r, round(height - c), 1, 0], [r, round(height - c), diagonal, diagonal], [top, height, diagonal, diagonal], [top, height, 0, 1], [0, height, 0, 1],
  ] }), at: [cx, cy, 0], material: "knobCap", ...capped(r, height / 2), state });
  parts.push({ kind: "chamfer", profile: profile("jog-chamfer", { type: "lathe", segments: 64, points: [
    [round(r + 0.02), round(height - c), diagonal, diagonal], [top, round(height + 0.02), diagonal, diagonal],
  ] }), at: [cx, cy, 0], material: "knobChamfer", caster: null, state });
  // The dimple stands where the angle's 0 is, at the top of the wheel; its pose turns it about the wheel's centre (the pivot, part-local).
  const dimple = dimpleOf(input.size);
  parts.push({ kind: "grip", profile: profile("jog-dimple", dimpleProfile(input.size)), at: [cx, round(cy - dimple.at), height],
    pose: { from: { turn: 0, pivot: [0, dimple.at, 0] }, to: { turn: 360, pivot: [0, dimple.at, 0] } }, material: "jogDimple", caster: null, state });
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: turnOf(input.angle), parts,
    relief: { face: "raised", rect: [round(cx - r), round(cy - r), input.size, input.size], radius: r, height: input.relief.height, material: input.relief.material },
  };
}

/** The tallest point of a wheel's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export const jogHeight = (scale: number) => round(jogGeometry.cap.height * scale + jogGeometry.dimple.lift + jogGeometry.dimple.lip + 0.1);
