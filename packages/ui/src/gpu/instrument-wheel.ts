/**
 * The Slider's thumbwheel at the Instrument level (design language section 6, the Instrument object table; Rendering Model part 2D;
 * anatomy page `slider.md`, section 11): a ridged roller lying in the slot of the Fader's track, as an object of parts for core's
 * `instrument` material, bounded by the native input's box. The helper never imports core, so the version 4 shapes are restated here as
 * the subset the wheel writes.
 *
 * A roller that rolls needs ridges that move, and the only ridges that move are geometry that turns: a captured print would be a capture a
 * frame, and a brushed finish is the same on every turn. So the ridges are the part:
 * - **roller:** an `extrude` (an `[x, z]` outline swept across the track) of a ridged circle, `wheel.ridges` teeth (12) of 1.3 px depth, radius
 *   `7 × depth scale` and its axis at that height above the face, so the whole roller lies on the face (no vertex is lower than the face: a
 *   roller sunk through the slot would draw its lower half over it, since the parts have a target of their own); its lowest point is a peak a third of a px above it.
 *   Polished metal (`faderChamfer`, the carriage's chamfer metal: a brush would hide the facets, and the facets are what show the ridges), 26 across the travel;
 * - **index:** one tooth in ink (`faderInk`) a hair proud of a roller tooth, the value's mark, turning with it.
 * Both parts have one pose: a rotation about the roller's own axis (`tilt` about the y axis, pivot on the axis) from `-sweep / 2` at the minimum to
 * `+sweep / 2` at the maximum, `wheel.sweep` (150, at most 180: a pose never passes 90 degrees either side). Rotation about the axis keeps every
 * vertex on the circle of its radius, so the footprint never leaves `[-R, R]` across the travel and `[-13, 13]` across it: containment holds over
 * the whole turn by construction (the unit test runs core's `checkContainment` at five values and at both depths' extremes). The part does not
 * slide: only `t` moves it, on `spring.fader`.
 */
import { fittedHeight } from "../shared/switch-forms.ts";
import type { InstrumentPart, InstrumentProfile } from "./instrument.ts";

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface WheelObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: InstrumentPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

/** The roller's numbers at the depth scale 1 (50% depth): its radius, its length across the travel, the ridges' depth and the index's lift. */
export const wheelGeometry = { radius: 8, across: 26, depth: 1.3, lift: 0.14 } as const;
/** The turn the token gives, kept to what a pose can do: at least 10 and at most 180 degrees. */
export const wheelSweep = (sweep: number) => Math.min(180, Math.max(10, Number.isFinite(sweep) ? sweep : 150));
/** The ridges round the roller, a whole number from 6 to 24. */
export const wheelRidges = (ridges: number) => Math.min(24, Math.max(6, Math.round(Number.isFinite(ridges) ? ridges : 12)));

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The roller's radius at a depth scale. */
export const wheelRadius = (scale: number) => round(wheelGeometry.radius * scale);

/**
 * The ridged circle as an `[x, z]` outline, centred on `(0, R)`: `ridges` teeth, valley at `k · pitch` and peak at `(k + ½) · pitch`, so the
 * lowest point (angle 180 degrees, a valley for an even count) is `depth` above the face and no vertex is below it.
 */
export function wheelOutline(radius: number, ridges: number, depth: number = wheelGeometry.depth * (radius / wheelGeometry.radius)): Vec2[] {
  const points: Vec2[] = [];
  for (let step = 0; step < ridges * 2; step++) {
    const angle = (step * Math.PI) / ridges, r = step % 2 === 0 ? radius - depth : radius;
    points.push([round(r * Math.sin(angle)), round(radius + r * Math.cos(angle))]);
  }
  return points;
}

/** The index tooth: the triangle of one roller tooth, a hair proud, from valley to valley through the peak at half a pitch. */
export function wheelIndexOutline(radius: number, ridges: number, depth: number = wheelGeometry.depth * (radius / wheelGeometry.radius)): Vec2[] {
  const pitch = (2 * Math.PI) / ridges, valley = radius - depth, peak = radius + wheelGeometry.lift, at = (angle: number, r: number): Vec2 => [round(r * Math.sin(angle)), round(radius + r * Math.cos(angle))];
  return [at(0, valley), at(pitch / 2, peak), at(pitch, valley)];
}

/** What a wheel's object needs from the page, in panel px. */
export interface WheelInput {
  id: string;
  /** The input's box: the object's `bounds`. */
  box: Box;
  /** The slot's box: the roller stands at its centre. */
  slot: Box;
  /** The value's place, 0–1 (the spring's position). */
  t: number;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** `wheel.sweep` and `wheel.ridges`, as the tokens give them. */
  sweep: number;
  ridges: number;
  state: { hover: boolean; disabled: boolean };
  /** The key light; given, the roller's caster is capped so its shadow stays in `box`. */
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts: the roller as laid out now. */
  relief: { rect: Box; height: number; material: string };
}

/** The roller's footprint (x, y, width, length) in the panel: its box centred on the slot. */
export function wheelFootprint(slot: Box, scale: number): Box {
  const r = wheelRadius(scale), cx = slot[0] + slot[2] / 2, cy = slot[1] + slot[3] / 2;
  return [round(cx - r), round(cy - wheelGeometry.across / 2), round(2 * r), wheelGeometry.across];
}

/** The tallest point of the roller above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export const wheelHeight = (scale: number) => round(2 * wheelRadius(scale) + wheelGeometry.lift + 0.1);

/** A wheel as an Instrument object; `profile` registers a shape and returns its name. */
export function wheelObject(input: WheelInput, profile: (name: string, shape: InstrumentProfile) => string): WheelObject {
  const r = wheelRadius(input.scale), ridges = wheelRidges(input.ridges), half = wheelSweep(input.sweep) / 2;
  const cx = round(input.slot[0] + input.slot[2] / 2), cy = round(input.slot[1] + input.slot[3] / 2), across = wheelGeometry.across;
  const state = { hover: input.state.hover, disabled: input.state.disabled }, t = Math.min(1, Math.max(0, input.t));
  // Both parts stand where the roller's axis meets the face and turn about it: a pose is the axis (the y axis, 90 degrees clockwise from +x) and the pivot.
  const pivot: Vec3 = [0, 0, r], at: Vec3 = [cx, cy, 0];
  const pose = { from: { tilt: -half, axis: 90, pivot }, to: { tilt: half, axis: 90, pivot } };
  const depth = wheelGeometry.depth * (r / wheelGeometry.radius);
  // The roller's shadow is the footprint at its mean height, capped where it would leave the box (full depth).
  const footprint = wheelFootprint(input.slot, input.scale), [bx, by, bw, bh] = input.box;
  const mean = r;
  const margins = { left: Math.max(0, footprint[0] - bx - 1), right: Math.max(0, bx + bw - footprint[0] - footprint[2] - 1), top: Math.max(0, footprint[1] - by - 1), bottom: Math.max(0, by + bh - footprint[1] - footprint[3] - 1) };
  const fit = input.light ? Math.floor(fittedHeight(mean, margins, input.light) * 1000) / 1000 : mean;
  const caster = fit < mean ? { caster: { rect: footprint, radius: 3, height: fit } } : {};
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t,
    parts: [
      { kind: "carriage", profile: profile("wheel-roller", { type: "extrude", outline: wheelOutline(r, ridges, depth), width: across }), at, pose, material: "faderChamfer", ...caster, state },
      { kind: "grip", profile: profile("wheel-index", { type: "extrude", outline: wheelIndexOutline(r, ridges, depth), width: across - 6 }), at, pose, material: "faderInk", caster: null, state },
    ],
    relief: { face: "raised", rect: input.relief.rect, radius: 3, height: input.relief.height, material: input.relief.material },
  };
}
