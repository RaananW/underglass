/**
 * The Fader at the Instrument level (design language section 6, the Instrument object table; Rendering Model part 2D):
 * the premium fader as an object of parts for core's `instrument` material, sized by the laid-out slot and bounded by
 * the native input's box. The GPU helper's `instrument` level draws each fader with it, as it does the Knob (anatomy
 * page `fader.md`). The helper never imports core, so the version 4 shapes are restated here as the subset the fader
 * writes.
 * - **carriage:** a prism 30 across and 42 along the travel, 12 high (× 0.6, 1, 1.6 with depth), radius 3, its side
 *   tapering 0.6 and a 2 px chamfer at its top edge, in brushed metal (`faderCap`, a linear brush across the travel);
 * - **chamfer:** the carriage's chamfer band in the same metal polished (`faderChamfer`), a hair outside it;
 * - **cap:** the carriage's top inside the chamfer, brushed again over the chamfer part's own top;
 * - **grip:** the index line, 1.6 wide, across the top (`faderInk`);
 * - every part **slides** along the slot together, from the minimum's stop (`t` 0: the bottom of a vertical fader, the
 *   left of a horizontal one) to the maximum's, driven by `spring.fader` (420 / 41, critically damped, in fixed 4 ms
 *   steps, clamped at the stops). The slot and the scale stay printed on the face (captured content and the face's
 *   groove), and only the carriage casts a shadow on it. Its caster is core's own (the carriage's footprint at its mean
 *   height) wherever that shadow stays in the box; above that height (past 50% depth under the default light) it is
 *   capped there (`faderCasterHeight`), so the shadow on the face never leaves the input's box.
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
  /** Omitted: core's own; `null`: none; a rect: the carriage's footprint where it stands now, at a capped height. */
  caster?: null | FaderCaster;
  state: { hover: boolean; disabled: boolean };
}
/** A face caster (Rendering Model 2.8), panel px: a rounded footprint at a mean height. */
export interface FaderCaster { rect: Box; radius: number; height: number }
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
  /** The key light; given, the carriage's caster is capped so its shadow stays in `box` (`faderCasterHeight`). */
  light?: { azimuth: number; elevation: number };
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

/** The carriage's footprint (x, y, width, length) at `t`, panel px: its centre runs 3 px inside each end of the slot. */
export function faderFootprint(slot: Box, vertical: boolean, t: number): Box {
  const { carriage } = faderParts(vertical), [sx, sy, sw, sh] = slot, along = Math.min(1, Math.max(0, t)) * faderTravel(slot, vertical);
  const cx = vertical ? sx + sw / 2 : sx + 3 + along, cy = vertical ? sy + sh - 3 - along : sy + sh / 2;
  return [round(cx - carriage.width / 2), round(cy - carriage.length / 2), carriage.width, carriage.length];
}

/**
 * The carriage's caster height on the face, px: its mean height (core's caster, 2D.7), capped at the tallest whose
 * shadow (`faderShadowReach`, linear in the height) stays inside `box` on every side from the carriage at either stop.
 * At 50% depth under the default light the mean height (6) is under the cap (6.2 for the 16 px margin), so core's
 * caster is used as it is; at full depth (9.6) the cap holds the shadow at 16 px down instead of 24.
 */
export function faderCasterHeight(input: Pick<FaderInput, "box" | "slot" | "vertical" | "scale">, light: { azimuth: number; elevation: number }): number {
  const mean = faderParts(input.vertical, input.scale).carriage.height / 2;
  const [bx, by, bw, bh] = input.box, low = faderFootprint(input.slot, input.vertical, 0), high = faderFootprint(input.slot, input.vertical, 1);
  const room: [Vec2, number][] = [
    [[-1, 0], Math.min(low[0], high[0]) - bx], [[1, 0], bx + bw - Math.max(low[0] + low[2], high[0] + high[2])],
    [[0, -1], Math.min(low[1], high[1]) - by], [[0, 1], by + bh - Math.max(low[1] + low[3], high[1] + high[3])],
  ];
  // `faderShadowReach` at the depth scale 1 is the reach of a caster 6 high: `k · 6 + 1`.
  let cap = Infinity;
  for (const [direction, space] of room) {
    const k = (faderShadowReach(1, light, direction) - 1) / (faderCarriage.height / 2);
    if (k > 0) cap = Math.min(cap, Math.max(0, space - 1) / k);
  }
  return Math.min(mean, Math.floor(cap * 1000) / 1000);
}

/** A fader as an Instrument object; `profile` registers a shape and returns its name. */
export function faderObject(input: FaderInput, profile: (name: string, shape: FaderPrism) => string): FaderObject {
  const { carriage, top, grip } = faderParts(input.vertical, input.scale);
  const [sx, sy, sw, sh] = input.slot, travel = faderTravel(input.slot, input.vertical);
  // Every part stands at the middle of the travel and slides half the travel each way: down to the minimum of a
  // vertical fader (y grows downwards), left to the minimum of a horizontal one.
  const centre: Vec3 = [round(sx + sw / 2), round(sy + sh / 2), 0];
  const half = round(travel / 2);
  const pose = input.vertical ? { from: { slide: [0, half] as Vec2 }, to: { slide: [0, -half] as Vec2 } } : { from: { slide: [-half, 0] as Vec2 }, to: { slide: [half, 0] as Vec2 } };
  const h = carriage.height, state = { hover: input.state.hover, disabled: input.state.disabled }, t = Math.min(1, Math.max(0, input.t));
  // Core's caster follows the carriage's pose; a capped one is the footprint where the carriage stands now.
  const height = input.light ? faderCasterHeight(input, input.light) : h / 2;
  const caster = height < h / 2 ? { caster: { rect: faderFootprint(input.slot, input.vertical, t), radius: carriage.radius, height } } : {};
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t,
    parts: [
      { kind: "carriage", profile: profile("fader-carriage", { type: "prism", width: carriage.width, length: carriage.length, radius: carriage.radius, height: h, taper: carriage.taper, chamfer: carriage.chamfer }),
        at: centre, pose, material: "faderCap", ...caster, state },
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
 * 16 px margin at each stop and the scale on the right (or below) hold. At full depth it would be 24 px down, past the
 * margin, so the caster is capped there (`faderCasterHeight`).
 */
export function faderShadowReach(scale: number, light: { azimuth: number; elevation: number }, direction: Vec2): number {
  const h = (faderCarriage.height * scale) / 2, a = (light.azimuth * Math.PI) / 180, e = (light.elevation * Math.PI) / 180;
  // The direction towards the light, then the shadow's offset away from it (2.8: o = −L.xy / L.z · h).
  const lx = Math.sin(a) * Math.cos(e), ly = -Math.cos(a) * Math.cos(e), lz = Math.sin(e);
  const offset = (-(lx * direction[0] + ly * direction[1]) / lz) * h;
  return round(Math.max(0, offset + 1.5 * h + 1));
}
