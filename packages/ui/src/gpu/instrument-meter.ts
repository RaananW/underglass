/**
 * The Meter and the Gauge at the Instrument level (design language section 6, the Instrument object table; Rendering Model
 * part 2D): the premium bar meter, needle meter and gauge as objects of parts for core's `instrument` material, bounded by
 * the native `<meter>`'s box. The GPU helper's `instrument` level draws each with it, as it does the Knob, the Fader and
 * the Lamp; the part definitions are checked by core's validator and containment check in the unit tests. The helper never
 * imports core, so the version 4 shapes are restated here as the subset they write.
 * - **Bar:** a glass `window` (a prism with a 2.2 px bevel, 2.4 high, clear: its flat region is the capture itself, so the
 *   scale printed under it is exact, and the segments stand behind it) and a `segment` per LED, a glass lens Ø `size.meter`
 *   (10) 0.35 of its diameter high, each carrying an emitter in its zone's colour. Lit or dark is only the emitter's
 *   strength, so the parts never depend on the value: a live level changes uniforms, never the layer's structure.
 * - **Needle meter:** the same `window` over the arc printed on the face, a `needle` on a pivot and its `pivot` hub.
 * - **Gauge:** a polished `bezel` ring round a round `window`, the `needle` and the `pivot` hub.
 *   The needle is a thin blade (2.2 wide, a 12 px tail behind the pivot) standing 3 high over the glass; it turns through the
 *   sweep (`gauge.sweep` 240°, `meter.sweep` 100°) with the value's place `t` on its spring (`spring.gauge`, `spring.meter`),
 *   a pose, never a capture. Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths and diameters do not.
 * The scale, the zones and the legend are captured content on the face; the window shows them exactly.
 */
import { lensProfile } from "./instrument-lamp.ts";
import type { InstrumentProfile, InstrumentRecipe } from "./instrument.ts";
import { needleGeometry } from "../shared/meter.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface MeterPart {
  kind: "window" | "segment" | "bezel" | "needle" | "pivot";
  profile: string;
  at: Vec3;
  pose?: { from: { turn: number }; to: { turn: number } };
  material: string;
  glass?: "lens" | "window";
  emitter?: number;
  caster?: null;
}
export interface MeterObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: MeterPart[];
  relief: { face: "raised" | "knob"; rect: Box; radius: number; height: number; material: string };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The glass of a window and of the segments' lenses: clear, a hint of green, no dispersion (the bar is small and many). */
export const meterMaterials: Record<"meterGlass", InstrumentRecipe> = {
  meterGlass: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#d6ede6", absorption: 0.03, reflection: 1.5 } },
};

/** The window's numbers at a depth scale (the Display's, in the Instrument object table): 2.4 high with a 2.2 px bevel. */
export function windowShape(width: number, length: number, radius: number, scale = 1): InstrumentProfile {
  const height = round(2.4 * scale);
  return { type: "prism", width: round(width), length: round(length), radius: round(Math.min(radius, width / 2, length / 2)), height, chamfer: round(Math.min(2.2, height * 0.9)) };
}

/** The needle's side outline (x along the blade, z up): a tail behind the pivot, tapering to the tip. */
export function needleProfile(length: number, scale = 1): InstrumentProfile {
  const { width, height, tail } = needleGeometry, h = round(height * scale);
  return { type: "extrude", width, outline: [[-tail, 0], [round(length), 0], [round(length), round(h * 0.3)], [-tail, h]] };
}

/** The pivot hub: a polished dome cap over the needle's root. */
export function hubProfile(scale = 1): InstrumentProfile {
  const { hubRadius: r, hubHeight } = needleGeometry, h = round(hubHeight * scale), d = Math.SQRT1_2;
  return { type: "lathe", segments: 48, points: [[r, 0, 1, 0], [r, round(h - 0.8), 1, 0], [r, round(h - 0.8), d, d], [round(r - 0.8), h, d, d], [round(r - 0.8), h, 0, 1], [0, h, 0, 1]] };
}

/** The gauge's bezel: a polished ring from the window's edge out to `outer`, with a 0.6 px edge break. */
export function bezelProfile(outer: number, inner: number, scale = 1): InstrumentProfile {
  const h = round(needleGeometry.bezelHeight * scale), d = Math.SQRT1_2;
  return { type: "lathe", segments: 96, points: [[round(outer), 0, 1, 0], [round(outer), round(h - 0.6), 1, 0], [round(outer), round(h - 0.6), d, d], [round(outer - 0.6), h, d, d], [round(outer - 0.6), h, 0, 1], [round(inner), h, 0, 1]] };
}

/** What a bar meter's object needs from the page, in panel px. */
export interface MeterBarInput {
  id: string;
  /** The native meter's box: the object's `bounds`. */
  box: Box;
  /** The window's box, and its corner radius. */
  window: Box;
  windowRadius: number;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** Each segment: its lens's centre and diameter, and the index of its emitter in the scene's `emitters`. */
  segments: { centre: [number, number]; lens: number; emitter: number; material: string }[];
  /** Opaque lacquer lenses, not glass (`prefers-reduced-transparency`): each segment names its own material. */
  opaque?: boolean;
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

/** The lens's material name: one clear glass for every segment (the emitter carries the zone's colour). */
export const meterLensMaterial = "meterGlass";

/** A bar meter as an Instrument object; `profile` registers a shape and returns its name. */
export function meterBarObject(input: MeterBarInput, profile: (name: string, shape: InstrumentProfile) => string): MeterObject {
  const [wx, wy, ww, wh] = input.window, parts: MeterPart[] = [];
  parts.push({ kind: "window", profile: profile("meter-window", windowShape(ww, wh, input.windowRadius, input.scale)), at: [round(wx + ww / 2), round(wy + wh / 2), 0],
    material: meterLensMaterial, glass: "window", caster: null });
  for (const segment of input.segments) {
    const height = round(0.35 * segment.lens * input.scale);
    parts.push({ kind: "segment", profile: profile("meter-segment", lensProfile(segment.lens / 2, height, 1)), at: [round(segment.centre[0]), round(segment.centre[1]), 0],
      material: segment.material, ...(input.opaque ? {} : { glass: "lens" as const }), emitter: segment.emitter, caster: null });
  }
  return { id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: 0, parts,
    relief: { face: "raised", rect: input.window, radius: input.windowRadius, height: input.relief.height, material: input.relief.material } };
}

/** What a needle meter's or gauge's object needs from the page, in panel px. */
export interface MeterDialInput {
  id: string;
  box: Box;
  window: Box;
  windowRadius: number;
  /** A gauge's bezel box (round), if it has one. */
  bezel?: Box;
  /** The needle's pivot, and its length from the pivot to the tip. */
  pivot: [number, number];
  length: number;
  /** The needle's turn from the minimum to the maximum, degrees (it points up at the middle). */
  sweep: number;
  /** Where the value sits, 0–1 (the spring's position). */
  t: number;
  scale: number;
  relief: { height: number; material: string };
}

/** A needle meter or gauge as an Instrument object; `profile` registers a shape and returns its name. */
export function meterDialObject(input: MeterDialInput, profile: (name: string, shape: InstrumentProfile) => string): MeterObject {
  const [wx, wy, ww, wh] = input.window, parts: MeterPart[] = [];
  parts.push({ kind: "window", profile: profile("meter-window", windowShape(ww, wh, input.windowRadius, input.scale)), at: [round(wx + ww / 2), round(wy + wh / 2), 0],
    material: meterLensMaterial, glass: "window", caster: null });
  if (input.bezel) {
    const [bx, by, bw] = input.bezel;
    parts.push({ kind: "bezel", profile: profile("meter-bezel", bezelProfile(bw / 2, ww / 2, input.scale)), at: [round(bx + bw / 2), round(by + input.bezel[3] / 2), 0], material: "knobSkirt", caster: null });
  }
  const [px, py] = input.pivot, z = round(2.4 * input.scale);
  parts.push({ kind: "needle", profile: profile("meter-needle", needleProfile(input.length, input.scale)), at: [round(px), round(py), z], material: "knobInk", caster: null,
    pose: { from: { turn: round(-input.sweep / 2 - 90) }, to: { turn: round(input.sweep / 2 - 90) } } });
  parts.push({ kind: "pivot", profile: profile("meter-hub", hubProfile(input.scale)), at: [round(px), round(py), 0], material: "knobCap", caster: null });
  return { id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: input.bezel ?? input.window, radius: input.bezel ? input.bezel[2] / 2 : input.windowRadius, height: input.relief.height, material: input.relief.material } };
}

/** The tallest point of a meter's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function meterHeight(form: "bar" | "needle" | "dial", lens: number, scale: number): number {
  if (form === "bar") return round(Math.max(0.35 * lens, 2.4) * scale + 0.1);
  return round(Math.max(needleGeometry.hubHeight, needleGeometry.bezelHeight, 2.4 + needleGeometry.height) * scale + 0.1);
}
