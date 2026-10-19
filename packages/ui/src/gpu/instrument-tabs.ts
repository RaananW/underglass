/**
 * The Tabs' rail form at the Instrument level (anatomy page `tabs.md`, section 11; design language section 6, the Instrument object table;
 * Rendering Model part 2D): the premium rail as objects of parts for core's `instrument` material, each bounded by its native element's box.
 * The GPU helper's `instrument` level draws each rail tablist and each of its tabs with them, as it does the bank of the latching forms and the
 * push button; the part definitions are checked by core's validator and containment check in the unit tests. The helper never imports core,
 * so the version 4 shapes are restated here as the subset they write.
 *
 * - **plinth:** the tablist itself, one polished prism (2.4 high at 50% depth, a 0.8 px edge break) the keys stand on and their LEDs sit in;
 *   it stands the box rule's margin inside the tablist's box and casts no shadow of its own (the box leaves it no room for one; the keys' shadows fall on it);
 * - **key** (one object per tab): a body in the cap's own face colour (6 high less the label, taper 0.6, chamfer 1.2) with the captured cap on
 *   it (the label as the capture has it, `keyCap`), both travelling `pushButton.travel` (4 px at 50% depth) along `t` (0.45 selected, 1 held,
 *   0 up: the CSS throw `--strata-push-t`, `spring.button`), standing on the plinth;
 * - **LED:** a small glass lens on the plinth above the cap (the Lamp's lens, 6 px), its own emitter, lit by `--strata-lit` (1 while the tab is
 *   selected).
 * The parts never depend on the state, which would rebuild the layer: lit or unlit is only an emitter's strength, and the pose is `t`. Heights
 * scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths and diameters do not. Under `prefers-reduced-transparency` the LED is opaque
 * lacquer in the role's colour, not glass.
 */
import { fittedHeight } from "../shared/switch-forms.ts";
import { pushGeometry, pushTravel } from "../shared/push-button.ts";
import { lampMaterials, lensGlass, lensMaterial, lensOpaque, lensProfile } from "./instrument-lamp.ts";
import { boxMargin, type InstrumentProfile, type InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface RailPart {
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
export interface RailObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: RailPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The plinth's height at 50% depth, px: the keys' and the LEDs' base. */
export const RAIL_PLINTH = 2.4;
/** The plinth's height at a depth scale. */
export const railPlinthHeight = (scale: number) => round(RAIL_PLINTH * scale);

/** The rail's own materials: the plinth is the polished metal of the lamp's bezel. */
export const railMaterials: Record<"tabPlinth", InstrumentRecipe> = { tabPlinth: lampMaterials.lampBezel };

/** What the rail's plinth needs from the page, in panel px. */
export interface RailPlinthInput {
  id: string;
  /** The tablist's box, which is the plinth: the object's `bounds`. */
  box: Box;
  radius: number;
  scale: number;
  /** The stage's size, for the box rule's margin (the part stands that far inside its box, so perspective cannot carry it out). */
  stage: { width: number; height: number };
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  light?: { azimuth: number; elevation: number };
  relief: { height: number; material: string };
}

/** The rail's plinth as an Instrument object: one polished part with a 0.8 px edge break, its shadow fitted to the tablist's box. */
export function railPlinthObject(input: RailPlinthInput, profile: (name: string, shape: InstrumentProfile) => string): RailObject {
  const height = railPlinthHeight(input.scale), m = boxMargin(height + 1, input.stage), [x, y, w, h] = input.box;
  // Inset by the box rule's margin, to the nearest quarter px (a layer that moves reports its box with float noise, which must not make a new profile).
  const width = Math.round((w - 2 * m) * 4) / 4, length = Math.round((h - 2 * m) * 4) / 4, radius = round(Math.max(0, Math.min(input.radius - m, width / 2, length / 2)));
  const rect = input.box.map(round) as Box;
  return {
    id: input.id, rect, bounds: { rect, radius: 0 }, t: 0,
    parts: [{ kind: "bezel", profile: profile("rail-plinth", { type: "prism", width, length, radius, height, chamfer: 0.8 }),
      at: [round(x + w / 2), round(y + h / 2), 0], material: "tabPlinth", caster: null, state: input.state }],
    relief: { face: "raised", rect, radius: input.radius, height: input.relief.height, material: input.relief.material },
  };
}

/** What a rail tab's key needs from the page, in panel px. */
export interface RailKeyInput {
  id: string;
  /** The native tab button's box: the object's `bounds`. */
  box: Box;
  /** The cap's box as laid out and its corner radius, and the LED lens's (its centre and diameter are the lens's own box). */
  cap: Box;
  capRadius: number;
  led?: Box;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** The LED's role colour, `#rrggbb`, and its emitter's index in the scene's `emitters`. */
  role: string;
  emitter?: number;
  /** The cap's place along its travel now, 0–1 (the CSS throw). */
  t: number;
  /** The cap body's material name (the cap's own face colour). */
  material: string;
  /** Opaque lacquer, not glass. */
  opaque?: boolean;
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

const centreOf = ([x, y, w, h]: Box): [number, number] => [round(x + w / 2), round(y + h / 2)];

/** The materials a rail tab's key names (the plinth's, and the LED lens's), to add to the scene's. */
export function railKeyMaterials(input: Pick<RailKeyInput, "role" | "opaque">): Record<string, InstrumentRecipe> {
  return { ...railMaterials, [lensMaterial(input)]: input.opaque ? lensOpaque(input.role) : lensGlass(input.role) };
}

/** A rail tab's key as an Instrument object; `profile` registers a shape and returns its name. */
export function railKeyObject(input: RailKeyInput, profile: (name: string, shape: InstrumentProfile) => string): RailObject {
  const s = input.scale, state = input.state, floor = railPlinthHeight(s);
  const [bx, by, bw, bh] = input.box;
  /** The caster of a footprint: core's own, unless its shadow (2.8) would leave the box; then the tallest height that fits. */
  const fit = (rect: Box, radius: number, mean: number): RailPart["caster"] | undefined => {
    if (!input.light) return undefined;
    const margins = { left: Math.max(0, rect[0] - bx - 1), right: Math.max(0, bx + bw - rect[0] - rect[2] - 1), top: Math.max(0, rect[1] - by - 1), bottom: Math.max(0, by + bh - rect[1] - rect[3] - 1) };
    const height = Math.floor(fittedHeight(mean, margins, input.light) * 1000) / 1000;
    return height < mean ? { rect, radius, height } : undefined;
  };
  const parts: RailPart[] = [];
  const [ccx, ccy] = centreOf(input.cap), radius = round(Math.min(input.capRadius, input.cap[2] / 2, input.cap[3] / 2)), travel = round(pushTravel.held * s);
  const press = { from: { travel: 0 }, to: { travel: -travel } };
  const bodyHeight = round((pushGeometry.cap - pushGeometry.label) * s);
  const caster = fit(input.cap.map(round) as Box, radius, round(floor + bodyHeight / 2));
  parts.push({ kind: "plinth", profile: profile("rail-body", { type: "prism", width: round(input.cap[2]), length: round(input.cap[3]), radius, height: bodyHeight, taper: pushGeometry.taper, chamfer: 1.2 }),
    at: [ccx, ccy, floor], material: input.material, pose: press, ...(caster ? { caster } : {}), state });
  parts.push({ kind: "cap", profile: profile("rail-cap", { type: "prism", width: round(input.cap[2] - 2.4), length: round(input.cap[3] - 2.4), radius: Math.max(0, round(radius - 1.2)), height: pushGeometry.label }),
    at: [ccx, ccy, round(floor + bodyHeight)], material: "keyCap", captured: true, caster: null, pose: press, state });
  if (input.led && input.emitter !== undefined) {
    const [lcx, lcy] = centreOf(input.led), diameter = Math.min(input.led[2], input.led[3]);
    parts.push({ kind: "lens", profile: profile("rail-led", lensProfile(round(diameter / 2), round(0.35 * diameter * s), 1)), at: [lcx, lcy, floor], material: lensMaterial(input),
      ...(input.opaque ? {} : { glass: "lens" as const }), emitter: input.emitter, caster: null, state });
  }
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: input.cap, radius, height: input.relief.height, material: input.relief.material },
  };
}

/** The tallest point of a rail's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function railHeight(scale: number): number {
  return round(railPlinthHeight(scale) + pushGeometry.cap * scale + 0.1);
}
