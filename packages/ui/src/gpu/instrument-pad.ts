/**
 * The Pad and the Keypad at the Instrument level (design language section 6, the Instrument object table, and section 12; Rendering
 * Model part 2D): the premium pad and keypad as objects of parts for core's `instrument` material, each bounded by its native
 * `<button>`'s box (the keypad's plinth by its `<fieldset>`'s). The GPU helper's `instrument` level draws them with these, as it does
 * the push buttons and the Lamp; the part definitions are checked by core's validator and containment check in the unit tests. The
 * helper never imports core, so the version 4 shapes are restated here as the subset they write.
 *
 * - **Pad:** the `lens`, a thin glass plate on the face as wide as the cap plus its 3 px rim, with the pad's emitter (the light
 *   from below: unlit it is dark glass over the socket printed on the face, lit core glows it in the role's colour, blooms it and
 *   lights the face and the parts); the `plinth`, the soft cap's body in the pad's own face colour (5 high less the label, taper 0.6,
 *   chamfer 1.5); and the captured `cap` on it (the label as the capture has it, `keyCap`). The body and the captured cap travel
 *   `pad.travel` (3 px at 50% depth) along `t` (1 held, 0.45 latched, 0 up), on the CSS throw (`--strata-push-t`, `spring.button`).
 *   The soft cap is a satin lacquer: Lite's PBR recipe in this core has no subsurface layer, so the translucent silicone of the
 *   plan's table is the glass rim under an opaque lacquer body.
 * - **Keypad key:** the `plinth` body (the key's face colour, 6 high less the label, taper 0.6, chamfer 2) with the captured `cap`
 *   (the printed legends) on it, both travelling `keypad.travel` (2.5 px at 50% depth) along `t` on the CSS throw, standing on the
 *   keypad's plinth.
 * - **Keypad plinth:** one polished `bezel` part (2.4 high at 50% depth) under all the keys, in an object of its own, its shadow fitted
 *   to the fieldset's box. Each key is an object of its own, so a press moves one key.
 * The parts never depend on the state, which would rebuild the layer: lit or unlit is only the emitter's strength, and the pose is
 * `t`. Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths and diameters do not. Under `prefers-reduced-transparency`
 * the glass rim is opaque lacquer in the role's colour.
 */
import { fittedRoundHeight } from "../shared/push-button.ts";
import { keypadGeometry, keypadTravel, padGeometry, padTravel } from "../shared/pad.ts";
import { lampMaterials, lensGlass, lensMaterial, lensOpaque } from "./instrument-lamp.ts";
import type { InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface PadPart {
  kind: "bezel" | "lens" | "plinth" | "cap";
  profile: string;
  at: Vec3;
  pose?: { from: { travel?: number }; to: { travel?: number } };
  material: string;
  captured?: boolean;
  glass?: "lens";
  emitter?: number;
  /** Omitted: core's own; `null`: none; a rect: this footprint at this mean height, where core's would leave the box. */
  caster?: null | { rect: Box; radius: number; height: number };
  state: { hover: boolean; pressed: boolean; disabled: boolean };
}
export interface PadObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: PadPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

/** The glass rim's thickness, px (at 50% depth). */
export const PAD_RIM_HEIGHT = 0.5;

const round = (value: number) => Math.round(value * 1000) / 1000;
const centreOf = ([x, y, w, h]: Box): [number, number] => [round(x + w / 2), round(y + h / 2)];
/** A corner radius as laid out, clamped to the stadium of `box` (the shorter side's half). */
const shaped = (box: Box, given: number) => round(Math.min(Math.max(0, given), Math.min(box[2], box[3]) / 2));

/** The pad's and the keypad's own materials: the polished plinth is the Lamp's bezel. */
export const padMaterials: Record<"pushBezel", InstrumentRecipe> = { pushBezel: lampMaterials.lampBezel };

/** What a pad's object needs from the page, in panel px. */
export interface PadInput {
  id: string;
  /** The native button's box: the object's `bounds`. */
  box: Box;
  /** The glow's and the cap's boxes as laid out. */
  glow: Box;
  cap: Box;
  /** The corner radii as laid out (clamped to a stadium). */
  radii: { box: number; glow: number; cap: number };
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** The role colour, `#rrggbb`, and the index of the pad's emitter in the scene's `emitters`. */
  role: string;
  emitter: number;
  /** The cap's place along its travel now, 0–1 (the CSS throw). */
  t: number;
  /** The cap body's material name (the pad's own face colour). */
  material: string;
  /** Opaque lacquer, not glass. */
  opaque?: boolean;
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  /** The key light; given, the casters are capped so their shadows stay in `box`. */
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

/** The materials a pad's object names (the glow's lens per role, to add to the scene's). */
export function padMaterialsOf(input: Pick<PadInput, "role" | "opaque">): Record<string, InstrumentRecipe> {
  return { [lensMaterial(input)]: input.opaque ? lensOpaque(input.role) : lensGlass(input.role) };
}

/** The caster of a footprint: core's own, unless its shadow (2.8) would leave `box`; then the tallest height that fits. */
function fitter(box: Box, light: PadInput["light"]) {
  const [bx, by, bw, bh] = box;
  return (rect: Box, radius: number, mean: number): PadPart["caster"] | undefined => {
    if (!light) return undefined;
    const margins = { left: Math.max(0, rect[0] - bx - 1), right: Math.max(0, bx + bw - rect[0] - rect[2] - 1), top: Math.max(0, rect[1] - by - 1), bottom: Math.max(0, by + bh - rect[1] - rect[3] - 1) };
    const height = Math.floor(fittedRoundHeight(mean, margins, light) * 1000) / 1000;
    return height < mean ? { rect, radius, height } : undefined;
  };
}

/** The body and the captured cap of a soft or machined cap, travelling together from `base`. */
function capParts(cap: Box, radius: number, base: number, bodyHeight: number, taper: number, chamfer: number, label: number, travel: number, material: string,
  state: PadPart["state"], fit: ReturnType<typeof fitter>, profile: (name: string, shape: InstrumentProfile) => string, prefix: string): PadPart[] {
  const [cx, cy] = centreOf(cap), press = { from: { travel: 0 }, to: { travel: -round(travel) } };
  const caster = fit(cap.map(round) as Box, radius, round(base + bodyHeight / 2));
  return [
    { kind: "plinth", profile: profile(`${prefix}-body`, { type: "prism", width: round(cap[2]), length: round(cap[3]), radius, height: bodyHeight, taper, chamfer }),
      at: [cx, cy, round(base)], material, pose: press, ...(caster ? { caster } : {}), state },
    { kind: "cap", profile: profile(`${prefix}-cap`, { type: "prism", width: round(cap[2] - 2.4), length: round(cap[3] - 2.4), radius: Math.max(0, round(radius - 1.2)), height: label }),
      at: [cx, cy, round(base + bodyHeight)], material: "keyCap", captured: true, caster: null, pose: press, state },
  ];
}

/** A pad as an Instrument object; `profile` registers a shape and returns its name. */
export function padObject(input: PadInput, profile: (name: string, shape: InstrumentProfile) => string): PadObject {
  const s = input.scale, state = input.state, lens = lensMaterial(input), glass = input.opaque ? {} : { glass: "lens" as const };
  const rimHeight = round(PAD_RIM_HEIGHT * s), fit = fitter(input.box, input.light);
  const [gx, gy] = centreOf(input.glow), glowRadius = shaped(input.glow, input.radii.glow), capRadius = shaped(input.cap, input.radii.cap);
  const parts: PadPart[] = [
    // The glow: a thin glass plate on the face, as wide as the cap plus its rim; the cap covers all but a band of it.
    { kind: "lens", profile: profile("pad-glow", { type: "prism", width: round(input.glow[2]), length: round(input.glow[3]), radius: glowRadius, height: rimHeight }),
      at: [gx, gy, 0], material: lens, ...glass, emitter: input.emitter, caster: null, state },
    ...capParts(input.cap, capRadius, rimHeight, round((padGeometry.cap - padGeometry.label) * s), padGeometry.taper, padGeometry.chamfer, padGeometry.label,
      padTravel.held * s, input.material, state, fit, profile, "pad"),
  ];
  const boxRadius = shaped(input.box, input.radii.box);
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: boxRadius }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: input.box, radius: boxRadius, height: input.relief.height, material: input.relief.material },
  };
}

/** The tallest point of a pad's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function padHeight(scale: number): number {
  return round((PAD_RIM_HEIGHT + padGeometry.cap) * scale + 0.1);
}

/** What a keypad key's object needs from the page, in panel px. */
export interface KeyInput {
  id: string;
  /** The native key's box: the object's `bounds`. */
  box: Box;
  cap: Box;
  radii: { box: number; cap: number };
  /** The height the key stands on (the plinth's top at this depth), px. */
  base: number;
  scale: number;
  /** The cap's place along its travel now, 0–1 (the CSS throw). */
  t: number;
  /** The cap body's material name (the key's own face colour). */
  material: string;
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  light?: { azimuth: number; elevation: number };
  relief: { height: number; material: string };
}

/** The plinth's height at a depth scale. */
export const keypadPlinthHeight = (scale: number) => round(keypadGeometry.plinth * scale);

/** A keypad key as an Instrument object, standing on the plinth. */
export function keyObject(input: KeyInput, profile: (name: string, shape: InstrumentProfile) => string): PadObject {
  const s = input.scale, fit = fitter(input.box, input.light), capRadius = shaped(input.cap, input.radii.cap);
  const parts = capParts(input.cap, capRadius, input.base, round((keypadGeometry.cap - keypadGeometry.label) * s), keypadGeometry.taper, keypadGeometry.chamfer, keypadGeometry.label,
    keypadTravel * s, input.material, input.state, fit, profile, "key");
  const boxRadius = shaped(input.box, input.radii.box);
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: boxRadius }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: input.box, radius: boxRadius, height: input.relief.height, material: input.relief.material },
  };
}

/** What a keypad's plinth needs from the page, in panel px. */
export interface KeypadPlinthInput {
  id: string;
  /** The native group's box (the fieldset): the object's `bounds`; the plinth and its shadow stay inside it. */
  box: Box;
  /** The plinth's box as laid out, and its corner radius. */
  plinth: Box;
  radius: number;
  scale: number;
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  light?: { azimuth: number; elevation: number };
  relief: { height: number; material: string };
}

/** A keypad's plinth as an Instrument object: one polished part with a 0.8 px edge break, its shadow fitted to the group's box. */
export function keypadPlinthObject(input: KeypadPlinthInput, profile: (name: string, shape: InstrumentProfile) => string): PadObject {
  const height = keypadPlinthHeight(input.scale), rect = input.plinth.map(round) as Box, radius = shaped(input.plinth, input.radius);
  const caster = fitter(input.box, input.light)(rect, radius, height / 2);
  const [cx, cy] = centreOf(input.plinth);
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: 0,
    parts: [{ kind: "bezel", profile: profile("keypad-plinth", { type: "prism", width: round(input.plinth[2]), length: round(input.plinth[3]), radius, height, chamfer: 0.8 }),
      at: [cx, cy, 0], material: "pushBezel", ...(caster ? { caster } : {}), state: input.state }],
    relief: { face: "raised", rect: input.plinth, radius, height: input.relief.height, material: input.relief.material },
  };
}

/** The tallest point of a keypad's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function keypadHeight(scale: number): number {
  return round((keypadGeometry.plinth + keypadGeometry.cap) * scale + 0.1);
}
