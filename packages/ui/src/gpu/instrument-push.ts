/**
 * The PushButton forms at the Instrument level (design language section 6, the Instrument object table, and section 12;
 * Rendering Model part 2D): the premium push button as an object of parts for core's `instrument` material, bounded by the
 * native button's box. The GPU helper's `instrument` level draws each `button.ug-push` with it, as it does the Knob, the
 * Switch forms and the Lamp; the part definitions are checked by core's validator and containment check in the unit tests.
 * The helper never imports core, so the version 4 shapes are restated here as the subset they write.
 *
 * - **bezel:** a polished stadium (3.2 high at 50% depth, 4.4 px wide round the ring), static;
 * - **ring:** the lit ring, a glass `lens` plate standing 0.5 px on the bezel, the cap's width plus 5.2, with its emitter. Under
 *   the cap it shows as a ring 2.6 px wide (2 px of ring, 0.6 of gap); unlit it is dark glass over the socket printed on the
 *   face, lit core glows it in the role's colour, blooms it and lights the face and the parts;
 * - **cap:** a body in the button's own face colour (6 high, taper 0.6, chamfer 1.2) with the captured cap on it (the label as
 *   the capture has it, `keyCap`), both travelling `pushButton.travel` (4 px at 50% depth) along `t` (1 held, 0.45 latched,
 *   0 up), on the CSS throw (`--strata-push-t`, `spring.button`);
 * - **LED** (latching): a small glass lens on the bezel's top edge, its own emitter.
 * The parts never depend on the state, which would rebuild the layer: lit or unlit is only an emitter's strength, and the pose
 * is `t`. Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths and diameters do not. Under
 * `prefers-reduced-transparency` the ring and the LED are opaque lacquer in the role's colour, not glass.
 */
import { fittedHeight } from "../shared/switch-forms.ts";
import { pushGeometry, pushTravel, PUSH_LED, type StrataPushForm } from "../shared/push-button.ts";
import { lensGlass, lensMaterial, lensOpaque, lensProfile, lampMaterials } from "./instrument-lamp.ts";
import type { InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface PushPart {
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
export interface PushObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: PushPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

/** The premium numbers at 50% depth: see `pushGeometry` and `pushTravel` (`pushButton.*` in the premium character). */
export const pushHeights = { bezel: pushGeometry.bezel, ring: pushGeometry.ring, cap: pushGeometry.cap, label: pushGeometry.label, travel: pushTravel.held } as const;

/** The push button's own materials: the polished bezel is the Lamp's. */
export const pushMaterials: Record<"pushBezel", InstrumentRecipe> = { pushBezel: lampMaterials.lampBezel };

const round = (value: number) => Math.round(value * 1000) / 1000;

/** What a push button's object needs from the page, in panel px. */
export interface PushInput {
  id: string;
  form: StrataPushForm;
  /** The native button's box: the object's `bounds`. */
  box: Box;
  /** The bezel's, the ring's and the cap's boxes as laid out, and the LED lens's (latching). */
  bezel: Box;
  ring: Box;
  cap: Box;
  led?: Box;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** The role colour, `#rrggbb`, and the indices of the ring's and the LED's emitters in the scene's `emitters`. */
  role: string;
  emitters: { ring: number; led?: number };
  /** The cap's place along its travel now, 0–1 (the CSS throw). */
  t: number;
  /** The cap body's material name (the button's own face colour). */
  material: string;
  /** Opaque lacquer, not glass. */
  opaque?: boolean;
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  /** The key light; given, the casters are capped so their shadows stay in `box`. */
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

const centreOf = ([x, y, w, h]: Box): [number, number] => [round(x + w / 2), round(y + h / 2)];
/** A stadium: the corner radius that makes the shorter side a half circle. */
const stadium = (box: Box) => round(Math.min(box[2], box[3]) / 2);

/** The materials a push button's object names (the bezel's, the ring's and LED's lens, to add to the scene's). */
export function pushMaterialsOf(input: Pick<PushInput, "role" | "opaque">): Record<string, InstrumentRecipe> {
  return { ...pushMaterials, [lensMaterial(input)]: input.opaque ? lensOpaque(input.role) : lensGlass(input.role) };
}

/** A push button as an Instrument object; `profile` registers a shape and returns its name. */
export function pushObject(input: PushInput, profile: (name: string, shape: InstrumentProfile) => string): PushObject {
  const s = input.scale, state = input.state, lens = lensMaterial(input), glass = input.opaque ? {} : { glass: "lens" as const };
  const bezelHeight = round(pushHeights.bezel * s), ringHeight = round(pushHeights.ring * s);
  const [bx, by, bw, bh] = input.box;
  /** The caster of a footprint: core's own, unless its shadow (2.8) would leave the box; then the tallest height that fits. */
  const fit = (rect: Box, radius: number, mean: number): PushPart["caster"] | undefined => {
    if (!input.light) return undefined;
    const margins = { left: Math.max(0, rect[0] - bx - 1), right: Math.max(0, bx + bw - rect[0] - rect[2] - 1), top: Math.max(0, rect[1] - by - 1), bottom: Math.max(0, by + bh - rect[1] - rect[3] - 1) };
    const height = Math.floor(fittedHeight(mean, margins, input.light) * 1000) / 1000;
    return height < mean ? { rect, radius, height } : undefined;
  };
  const parts: PushPart[] = [];

  // The bezel: a polished stadium with a 0.8 px edge break, standing on the face.
  const [bcx, bcy] = centreOf(input.bezel), bezelRadius = stadium(input.bezel);
  const bezelCaster = fit(input.bezel.map(round) as Box, bezelRadius, bezelHeight / 2);
  parts.push({ kind: "bezel", profile: profile("push-bezel", { type: "prism", width: round(input.bezel[2]), length: round(input.bezel[3]), radius: bezelRadius, height: bezelHeight, chamfer: 0.8 }),
    at: [bcx, bcy, 0], material: "pushBezel", ...(bezelCaster ? { caster: bezelCaster } : {}), state });

  // The ring: a thin glass plate on the bezel, as wide as the cap plus its gap and ring; the cap covers all but a band of it.
  const [rcx, rcy] = centreOf(input.ring);
  parts.push({ kind: "lens", profile: profile("push-ring", { type: "prism", width: round(input.ring[2]), length: round(input.ring[3]), radius: stadium(input.ring), height: ringHeight }),
    at: [rcx, rcy, bezelHeight], material: lens, ...glass, emitter: input.emitters.ring, caster: null, state });

  // The cap: a body in the button's own face colour, and the captured cap on it; both travel together.
  const [ccx, ccy] = centreOf(input.cap), capRadius = stadium(input.cap), travel = round(pushHeights.travel * s);
  const press = { from: { travel: 0 }, to: { travel: -travel } };
  const bodyHeight = round((pushHeights.cap - pushHeights.label) * s), base = round(bezelHeight + ringHeight);
  const capCaster = fit(input.cap.map(round) as Box, capRadius, round(base + bodyHeight / 2));
  parts.push({ kind: "plinth", profile: profile("push-body", { type: "prism", width: round(input.cap[2]), length: round(input.cap[3]), radius: capRadius, height: bodyHeight, taper: pushGeometry.taper, chamfer: 1.2 }),
    at: [ccx, ccy, base], material: input.material, pose: press, ...(capCaster ? { caster: capCaster } : {}), state });
  parts.push({ kind: "cap", profile: profile("push-cap", { type: "prism", width: round(input.cap[2] - 2.4), length: round(input.cap[3] - 2.4), radius: Math.max(0, round(capRadius - 1.2)), height: pushHeights.label }),
    at: [ccx, ccy, round(base + bodyHeight)], material: "keyCap", captured: true, caster: null, pose: press, state });

  // The LED (latching): a small glass lens standing on the bezel's rim.
  if (input.led && input.emitters.led !== undefined) {
    const [lcx, lcy] = centreOf(input.led), diameter = Math.min(input.led[2], input.led[3]) || PUSH_LED;
    parts.push({ kind: "lens", profile: profile("push-led", lensProfile(round(diameter / 2), round(0.35 * diameter * s), 1)), at: [lcx, lcy, bezelHeight], material: lens, ...glass,
      emitter: input.emitters.led, caster: null, state });
  }
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: stadium(input.box) }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: input.box, radius: stadium(input.box), height: input.relief.height, material: input.relief.material },
  };
}

/** The tallest point of a push button's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function pushHeight(scale: number): number {
  return round((pushHeights.bezel + pushHeights.ring + pushHeights.cap) * scale + 0.1);
}
