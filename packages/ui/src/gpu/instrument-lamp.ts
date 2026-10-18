/**
 * The Lamp and the StatusLight at the Instrument level (design language section 3, *Emitters*, and section 6, the
 * Instrument object table; Rendering Model part 2D): the premium lamp and LED as objects of parts for core's
 * `instrument` material, bounded by the native control's box. The GPU helper's `instrument` level draws each with it, as
 * it does the Knob and the Switch forms; the part definitions are checked by core's validator and containment check in
 * the unit tests. The helper never imports core, so the version 4 shapes are restated here as the subset they write.
 *
 * - **Lamp:** a polished `bezel` ring round the lens (3 high, 4 wide), and the `lens`, a glass plano-convex lens
 *   (Rendering Model 2D.6: a 2 px wall and an elliptical dome 0.4 of its diameter high) standing on the face in the
 *   bezel, Ø `size.lamp` (28), with the lamp's emitter. Unlit it is a dark glass dome (the glass refracts the socket
 *   printed on the face under it, tinted by the role); lit, core glows it in the emitter's colour, blooms it and lights
 *   the face and the parts with the emitter. The box is the lens + 28.
 * - **LED (StatusLight):** the lens alone, Ø `size.statusLight` (10), 0.35 of its diameter high, with its emitter. The
 *   box is the lens + 16.
 * The parts never depend on the state, which would rebuild the layer: lit or unlit is only the emitter's strength.
 * Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths and diameters do not. Under
 * `prefers-reduced-transparency` the lens is an opaque lacquer dome in the role's colour, not glass.
 */
import { lensColours, LAMP_BEZEL } from "../shared/lamp.ts";
import { fittedHeight } from "../shared/switch-forms.ts";
import type { InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

/** A glass part (2D.6): a plano-convex lens. */
export type LampKind = "lamp" | "led";
export interface LampPart {
  kind: "bezel" | "lens";
  profile: string;
  at: Vec3;
  material: string;
  glass?: "lens";
  emitter?: number;
  /** Omitted: core's own; `null`: none; a rect: this footprint at this mean height, where core's would leave the box. */
  caster?: null | { rect: Box; radius: number; height: number };
  state: { hover: boolean; disabled: boolean };
}
export interface LampObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: LampPart[];
  relief: { face: "raised" | "knob"; rect: Box; radius: number; height: number; material: string };
}

/** The premium numbers at 50% depth: the bezel's height and width, the lens's height as a share of its diameter. */
export const lampGeometry = {
  lamp: { bezelHeight: 3, bezelWidth: LAMP_BEZEL, lens: 0.4, wall: 2 },
  led: { lens: 0.35, wall: 1 },
} as const;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A glass lens's lathe profile (2D.6): a short wall and an elliptical dome, standing on z = 0. */
export function lensProfile(radius: number, height: number, wall: number): InstrumentProfile {
  const dome = Math.max(0.1, height - wall);
  const arc = Array.from({ length: 13 }, (_, step): [number, number, number, number] => {
    const angle = (step / 12) * (Math.PI / 2), slope = Math.hypot(Math.cos(angle) / radius, Math.sin(angle) / dome);
    return [round(radius * Math.cos(angle)), round(wall + dome * Math.sin(angle)), round(Math.cos(angle) / radius / slope), round(Math.sin(angle) / dome / slope)];
  });
  return { type: "lathe", segments: 64, points: [[round(radius), 0, 1, 0], ...arc] };
}

/** The lens's glass recipe for a role (2D.5 and 2D.6): clear glass tinted by the lit colour, a hint of dispersion. */
export function lensGlass(role: string): InstrumentRecipe {
  return { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: lensColours(role).on, absorption: 0.05, reflection: 1.5 }, dispersion: { strength: 0.1 } };
}
/** The opaque lens (`prefers-reduced-transparency`): lacquer in the role's unlit colour; the emitter still lights it up. */
export function lensOpaque(role: string): InstrumentRecipe {
  return { base: { colour: lensColours(role).off, roughness: 0.25 }, coat: { strength: 1, roughness: 0.05, ior: 1.5 } };
}
/** The polished bezel: as the Switch forms' bezels. */
export const lampMaterials: Record<"lampBezel", InstrumentRecipe> = {
  lampBezel: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 1 } },
};

/** What a lamp's or LED's object needs from the page, in panel px. */
export interface LampInput {
  id: string;
  kind: LampKind;
  /** The native control's box (a lamp's input, a StatusLight's object): the object's `bounds`. */
  box: Box;
  /** The lens's diameter. */
  lens: number;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** The role colour, `#rrggbb`, and the index of this lens's emitter in the scene's `emitters`. */
  role: string;
  emitter: number;
  /** Opaque, not glass. */
  opaque?: boolean;
  state: { hover: boolean; disabled: boolean };
  /** The key light; given, the bezel's caster is capped so its shadow stays in `box`. */
  light?: { azimuth: number; elevation: number };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts (its material is the bezel's, or the LED's lens's). */
  relief: { rect: Box; height: number };
}

/** The materials a lamp's object names (`lampBezel`, the lens's per role), to add to the scene's. */
export function lampMaterialsOf(input: Pick<LampInput, "role" | "opaque" | "kind">): Record<string, InstrumentRecipe> {
  const name = lensMaterial(input);
  return { ...(input.kind === "lamp" ? lampMaterials : {}), [name]: input.opaque ? lensOpaque(input.role) : lensGlass(input.role) };
}
/** The lens's material name, per role: `lens #rrggbb`, `lens-opaque #rrggbb`. */
export const lensMaterial = ({ role, opaque }: Pick<LampInput, "role" | "opaque">) => `${opaque ? "lensOpaque" : "lens"} ${role.toLowerCase()}`;

/** A lamp or LED as an Instrument object; `profile` registers a shape and returns its name. */
export function lampObject(input: LampInput, profile: (name: string, shape: InstrumentProfile) => string): LampObject {
  const [bx, by, bw, bh] = input.box, cx = round(bx + bw / 2), cy = round(by + bh / 2), s = input.scale, r = input.lens / 2;
  const state = { hover: input.state.hover, disabled: input.state.disabled };
  const parts: LampPart[] = [];
  const g = lampGeometry[input.kind];
  let lensAt = 0;
  if (input.kind === "lamp") {
    const { bezelHeight, bezelWidth } = lampGeometry.lamp, height = round(bezelHeight * s), outer = r + bezelWidth;
    // The bezel: an outer wall, a 45° edge break and a flat top ring running in to the lens's edge.
    const shape: InstrumentProfile = { type: "lathe", segments: 64, points: [[outer, 0, 1, 0], [outer, round(height - 0.6), 1, 0], [outer, round(height - 0.6), 0.707, 0.707],
      [round(outer - 0.6), height, 0.707, 0.707], [round(outer - 0.6), height, 0, 1], [round(r), height, 0, 1]] };
    // Its shadow stays in the box: core's own caster, unless that shadow (2.8) would leave it; then the same footprint at the tallest height that fits.
    let caster: LampPart["caster"] | undefined;
    if (input.light) {
      const rect: Box = [round(cx - outer), round(cy - outer), round(2 * outer), round(2 * outer)];
      const margins = { left: Math.max(0, rect[0] - bx - 1), right: Math.max(0, bx + bw - rect[0] - rect[2] - 1), top: Math.max(0, rect[1] - by - 1), bottom: Math.max(0, by + bh - rect[1] - rect[3] - 1) };
      const fit = Math.floor(fittedHeight(height / 2, margins, input.light) * 1000) / 1000;
      if (fit < height / 2) caster = { rect, radius: round(outer), height: fit };
    }
    parts.push({ kind: "bezel", profile: profile("lamp-bezel", shape), at: [cx, cy, 0], material: "lampBezel", ...(caster ? { caster } : {}), state });
    lensAt = height;
  }
  const height = round(g.lens * input.lens * s);
  parts.push({ kind: "lens", profile: profile(`${input.kind}-lens`, lensProfile(r, height, g.wall)), at: [cx, cy, lensAt], material: lensMaterial(input),
    ...(input.opaque ? {} : { glass: "lens" as const }), emitter: input.emitter, caster: null, state });
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: 0, parts,
    relief: { face: input.kind === "lamp" ? "raised" : "knob", rect: input.relief.rect, radius: Math.min(input.relief.rect[2], input.relief.rect[3]) / 2, height: input.relief.height, material: input.kind === "lamp" ? "lampBezel" : lensMaterial(input) },
  };
}

/** The tallest point of an object's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function lampHeight(kind: LampKind, lens: number, scale: number): number {
  return round((kind === "lamp" ? lampGeometry.lamp.bezelHeight * scale : 0) + lampGeometry[kind].lens * lens * scale + 0.1);
}
