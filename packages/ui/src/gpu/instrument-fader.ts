/**
 * The Fader at the Instrument level (design language section 6, the Instrument object table; Rendering Model part 2D):
 * the premium fader as an object of parts for core's `instrument` material, sized by the laid-out slot and bounded by
 * the native input's box. The GPU helper's `instrument` level picks it up as it does the Knob (anatomy page
 * `fader.md`); until then this module is the fader's part definitions and poses, checked by core's validator and
 * containment check in the unit tests. The helper never imports core, so the version 4 shapes are restated here as
 * the subset the fader writes.
 * - **carriage:** a prism 30 across and 42 along the travel, 12 high (× 0.6, 1, 1.6 with depth), radius 3, its side
 *   tapering 0.6 and a 2 px chamfer at its top edge, in brushed metal (`faderCap`, a linear brush across the travel);
 * - **chamfer:** the carriage's chamfer band in the same metal polished (`faderChamfer`), a hair outside it;
 * - **cap:** the carriage's top inside the chamfer, brushed again over the chamfer part's own top;
 * - **grip:** the index line, 1.6 wide, across the top (`faderInk`);
 * - every part **slides** along the slot together, from the minimum's stop (`t` 0: the bottom of a vertical fader, the
 *   left of a horizontal one) to the maximum's, driven by `spring.fader` (420 / 41, critically damped, in fixed 4 ms
 *   steps, clamped at the stops). The slot and the scale stay printed on the face (captured content and the face's
 *   groove), and only the carriage casts a shadow on it.
 */

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Box = [number, number, number, number];

/** A pose (Rendering Model 2D.2), px. */
export interface FaderPose { slide?: Vec2 }
/** The prism profile (2D.2): a rounded rectangle raised to `height`, its top inset by `taper`, chamfered at the top edge. */
export interface FaderPrism { type: "prism"; width: number; length: number; radius?: number; height: number; taper?: number; chamfer?: number }
export interface FaderPart {
  kind: "carriage" | "chamfer" | "cap" | "grip";
  profile: string;
  at: Vec3;
  pose: { from: FaderPose; to: FaderPose };
  material: string;
  caster?: null;
  state: { hover: boolean; disabled: boolean };
}
export interface FaderObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: FaderPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}
/** A material recipe (2D.5), the subset the fader's use. */
export interface FaderRecipe {
  base: { colour: string; roughness: number; metallic?: number; direct?: number };
  brush?: { strength: number; direction: "linear" };
  grain?: { kind: "hairline"; strength: number };
}

/** The carriage (design language section 6, I1's second iteration; `instrument-spec-notes.md`: taper 0.6, chamfer 2, grip 1.6). */
export const faderCarriage = { across: 30, along: 42, height: 12, radius: 3, taper: 0.6, chamfer: 2, grip: 1.6, gripInset: 3 } as const;

/**
 * The premium character's fader materials (design language sections 4 and 19): the brushed cap metal of the knob
 * (239, 240, 241; roughness 0.3, brush 0.9 with the hairline grain 0.15), its chamfer polished (roughness 0.06, no
 * brush), and the grip in the cap's ink. Metals take the key light's full direct term.
 */
export const faderMaterials: Record<"faderCap" | "faderChamfer" | "faderInk", FaderRecipe> = {
  faderCap: { base: { colour: "#eff0f1", metallic: 1, roughness: 0.3, direct: 1 }, brush: { strength: 0.9, direction: "linear" }, grain: { kind: "hairline", strength: 0.15 } },
  faderChamfer: { base: { colour: "#eff0f1", metallic: 1, roughness: 0.06, direct: 1 } },
  faderInk: { base: { colour: "#26282c", roughness: 0.6 } },
};

/** `spring.fader` (design language section 12): critically damped. */
export const faderSpring = { stiffness: 420, damping: 41 } as const;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** What a fader's object needs from the page, in panel px. */
export interface FaderInput {
  id: string;
  /** The input's box: the object's `bounds`. */
  box: Box;
  /** The slot's box: its centre line is the carriage's path, which runs 3 px short of each of its ends. */
  slot: Box;
  vertical: boolean;
  /** Where the value sits, 0–1 (the spring's position). */
  t: number;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  state: { hover: boolean; disabled: boolean };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts: the carriage as laid out now. */
  relief: { rect: Box; height: number; material: string };
}

/** The carriage's numbers at a depth scale, oriented: `width` along x, `length` along y. */
export function faderParts(vertical: boolean, scale = 1) {
  const { across, along, height, radius, taper, chamfer, grip, gripInset } = faderCarriage;
  const [width, length] = vertical ? [across, along] : [along, across];
  const top = { width: round(width - 2 * (taper + chamfer)), length: round(length - 2 * (taper + chamfer)) };
  return {
    carriage: { width, length, height: round(height * scale), radius, taper, chamfer },
    top,
    grip: vertical ? { width: round(top.width - 2 * gripInset), length: grip } : { width: grip, length: round(top.length - 2 * gripInset) },
  };
}

/** The travel of a slot's carriage centre, px: the slot's length less 3 px at each end. */
export const faderTravel = (slot: Box, vertical: boolean) => Math.max(0, (vertical ? slot[3] : slot[2]) - 6);

/** A fader as an Instrument object; `profile` registers a shape and returns its name. */
export function faderObject(input: FaderInput, profile: (name: string, shape: FaderPrism) => string): FaderObject {
  const { carriage, top, grip } = faderParts(input.vertical, input.scale);
  const [sx, sy, sw, sh] = input.slot, travel = faderTravel(input.slot, input.vertical);
  // Every part stands at the middle of the travel and slides half the travel each way: down to the minimum of a
  // vertical fader (y grows downwards), left to the minimum of a horizontal one.
  const centre: Vec3 = [round(sx + sw / 2), round(sy + sh / 2), 0];
  const half = round(travel / 2);
  const pose = input.vertical ? { from: { slide: [0, half] as Vec2 }, to: { slide: [0, -half] as Vec2 } } : { from: { slide: [-half, 0] as Vec2 }, to: { slide: [half, 0] as Vec2 } };
  const h = carriage.height, state = { hover: input.state.hover, disabled: input.state.disabled };
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: Math.min(1, Math.max(0, input.t)),
    parts: [
      { kind: "carriage", profile: profile("fader-carriage", { type: "prism", width: carriage.width, length: carriage.length, radius: carriage.radius, height: h, taper: carriage.taper, chamfer: carriage.chamfer }),
        at: centre, pose, material: "faderCap", state },
      // The chamfer band again in polished metal: a prism whose 2 px chamfer lies a hair outside the carriage's own,
      // its top covered by the cap.
      { kind: "chamfer", profile: profile("fader-chamfer", { type: "prism", width: round(carriage.width - 2 * carriage.taper + 0.04), length: round(carriage.length - 2 * carriage.taper + 0.04),
        radius: round(Math.max(0, carriage.radius - carriage.taper)), height: round(carriage.chamfer + 0.02), chamfer: carriage.chamfer }),
        at: [centre[0], centre[1], round(h - carriage.chamfer - 0.01)], pose, material: "faderChamfer", caster: null, state },
      { kind: "cap", profile: profile("fader-top", { type: "prism", width: top.width, length: top.length, radius: round(Math.max(0, carriage.radius - carriage.taper - carriage.chamfer)), height: 0.04 }),
        at: [centre[0], centre[1], round(h + 0.01)], pose, material: "faderCap", caster: null, state },
      { kind: "grip", profile: profile("fader-grip", { type: "prism", width: grip.width, length: grip.length, height: 0.1 }),
        at: [centre[0], centre[1], round(h + 0.03)], pose, material: "faderInk", caster: null, state },
    ],
    relief: { face: "raised", rect: input.relief.rect, radius: carriage.radius, height: input.relief.height, material: input.relief.material },
  };
}

/**
 * How far the carriage's shadow on the face reaches past the carriage along `direction` (unit, in panel axes, y down),
 * px, by the Rendering Model's cast shadow (2.8) for the caster core derives from it (2D.7: the carriage's footprint at
 * its mean height): the offset away from the light (negative towards it) plus the softening `1.5 · h + 1`. With the
 * default light (323° / 41°) at 50% depth it is 15.5 px down and 14.2 px to the right (4.5 up, 5.9 left), which the
 * 16 px margin at each stop and the scale on the right (or below) hold. At full depth it is 24 px down: past the margin.
 */
export function faderShadowReach(scale: number, light: { azimuth: number; elevation: number }, direction: Vec2): number {
  const h = (faderCarriage.height * scale) / 2, a = (light.azimuth * Math.PI) / 180, e = (light.elevation * Math.PI) / 180;
  // The direction towards the light, then the shadow's offset away from it (2.8: o = −L.xy / L.z · h).
  const lx = Math.sin(a) * Math.cos(e), ly = -Math.cos(a) * Math.cos(e), lz = Math.sin(e);
  const offset = (-(lx * direction[0] + ly * direction[1]) / lz) * h;
  return round(Math.max(0, offset + 1.5 * h + 1));
}
