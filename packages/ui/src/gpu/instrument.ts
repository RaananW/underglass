/**
 * The Instrument level in `@underglass/ui/gpu` (design language sections 6 and 16, Rendering Model part 2D): what the
 * helper builds for a layer drawn with core's `instrument` material. The helper never imports core, so the version 4
 * scene's shape is restated here as the subset it writes (core's `InstrumentScene` validates it).
 * - **Knob** (`knobObject`): the premium knob of the Instrument object table, sized by the native box: a `skirt`
 *   (a turned flange whose top is a 7.5° cone, with an edge break), a brushed `cap` (side, a 2 px chamfer and a spun
 *   top crowned 1.2), the cap's `chamfer` in polished metal, and the engraved `pointer`, which turns through the sweep
 *   with the value (`t`). Heights scale with depth (0.6, 1, 1.6). The skirt, cap and chamfer are solids of revolution,
 *   so only the pointer carries the turn. `bounds` is the input's box; the printed scale stays on the face.
 * - **Key** (`keyObject`): a button as a body and a captured cap (its own label, read from the capture), inset by the
 *   box rule's margin, travelling `object.keyTravel / 2.4` (2.5 px at 50% depth) while pressed.
 * - **Fader** (`faderObject` in `gpu/instrument-fader.ts`): the premium fader's carriage sliding the slot.
 * - **Springs** (`advanceSpring`): a knob's `t` follows its value on `spring.knob` or `spring.detent`, a fader's on
 *   `spring.fader` (section 12), in fixed 4 ms steps, clamped at the stops; reduced motion makes it instant.
 */

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Box = [number, number, number, number];

/** A pose (Rendering Model 2D.2): degrees and px. */
export interface InstrumentPose { travel?: number; slide?: Vec2; turn?: number; tilt?: number; axis?: number; pivot?: Vec3 }
export type InstrumentProfile =
  | { type: "lathe"; points: [number, number, number, number][]; segments?: number }
  | { type: "prism"; width: number; length: number; radius?: number; height: number; taper?: number; chamfer?: number }
  | { type: "extrude"; outline: Vec2[]; width: number };
export interface InstrumentPart {
  kind: "cap" | "skirt" | "chamfer" | "pointer" | "plinth" | "carriage" | "grip";
  profile: string;
  at: Vec3;
  pose?: { from: InstrumentPose; to: InstrumentPose };
  material: string;
  captured?: boolean;
  /** Omitted: core's own, from the posed part; `null`: none; given: this footprint at this mean height (2.8). */
  caster?: null | { rect: Box; radius: number; height: number };
  state?: { hover?: boolean; pressed?: boolean; focus?: boolean; disabled?: boolean };
}
export interface InstrumentObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: InstrumentPart[];
  relief: { face: "raised" | "knob"; rect: Box; radius: number; height: number; material: string };
}
export interface InstrumentRecipe {
  base?: { colour?: string; roughness?: number; metallic?: number; direct?: number };
  coat?: { strength?: number; roughness?: number; ior?: number };
  emissive?: { strength?: number; colour?: string };
  brush?: { strength?: number; direction?: "radial" | "linear" | "circular" };
  grain?: { kind?: "hairline"; strength?: number; scale?: number };
}

/** The camera rule's floor (design language section 6). */
export const INSTRUMENT_CAMERA = 2400;
/** Strata's depth scale for part heights: 0.6, 1 and 1.6 at depth 0, 0.5 and 1. */
export const depthScale = (depth: number) => { const d = Math.min(1, Math.max(0, depth)); return d < 0.5 ? 0.6 + 0.8 * d : 1 + 1.2 * (d - 0.5); };
/** The box rule's margin (design language section 6): `ceil(drift(h) + 1)` at the stage's half-diagonal. */
export function boxMargin(height: number, stage: { width: number; height: number }, distance = INSTRUMENT_CAMERA) {
  const r = Math.hypot(stage.width, stage.height) / 2;
  return Math.ceil((r * height) / (distance - height) + 1);
}
const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The premium character's knob materials (design language sections 4 and 19, from the I1 prototype's second
 * iteration): `knobCap` brushed aluminium (circular brush 0.9 with the hairline grain), `knobSkirt` polished,
 * `knobChamfer` the cap's metal polished (roughness 0.06, no brush), and the pointer's ink. Metals take the key light's
 * full direct term. Keys add `keyCap` (the capture as it is) and a body per colour.
 */
export const premiumMaterials: Record<string, InstrumentRecipe> = {
  knobCap: { base: { colour: "#eff0f1", metallic: 1, roughness: 0.3, direct: 1 }, brush: { strength: 0.9, direction: "circular" }, grain: { kind: "hairline", strength: 0.15 } },
  knobSkirt: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 1 } },
  knobChamfer: { base: { colour: "#eff0f1", metallic: 1, roughness: 0.06, direct: 1 } },
  knobInk: { base: { colour: "#26282c", roughness: 0.6 } },
  // A captured cap: roughness 1 and no coat, so its label is the capture itself.
  keyCap: { base: { roughness: 1 } },
};

/** The knob's parts at a depth scale: what `knobObject` builds, as numbers (the Instrument object table). */
export function knobParts(skirt: number, cap: number, scale = 1) {
  const skirtHeight = 2.5 * scale;
  return { skirt: { radius: skirt / 2, height: skirtHeight, edgeBreak: Math.min(0.8, skirtHeight / 2), slope: 7.5 },
    cap: { radius: cap / 2, height: 16 * scale, crown: 1.2 * scale, chamfer: 2 },
    pointer: { width: 2.2, from: 0.28, to: 0.86 } };
}

/** What a knob's object needs from the page, in panel px. */
export interface KnobInput {
  id: string;
  /** The input's box: the object's `bounds`. */
  box: Box;
  /** The skirt's and cap's diameters, as laid out (the `size` and detented rules apply in CSS). */
  skirt: number;
  cap: number;
  /** Where the value sits, 0–1 (the spring's position). */
  t: number;
  sweep: number;
  scale: number;
  state: { hover: boolean; disabled: boolean };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

/** A knob as an Instrument object; `profile` registers a shape and returns its name. */
export function knobObject(input: KnobInput, profile: (name: string, shape: InstrumentProfile) => string): InstrumentObject {
  const [x, y, w, h] = input.box, cx = x + w / 2, cy = y + h / 2;
  const { skirt, cap, pointer } = knobParts(input.skirt, input.cap, input.scale);
  const rs = skirt.radius, rc = cap.radius, eb = skirt.edgeBreak, k = Math.tan((skirt.slope * Math.PI) / 180);
  const cone = [Math.sin((skirt.slope * Math.PI) / 180), Math.cos((skirt.slope * Math.PI) / 180)] as const;
  const diagonal = Math.SQRT1_2;
  // The skirt: a straight side, a 45° edge break, then the cone rising towards the cap (it ends under the cap).
  const skirtShape: InstrumentProfile = { type: "lathe", segments: 64, points: [
    [rs, 0, 1, 0], [rs, round(skirt.height - eb), 1, 0], [rs, round(skirt.height - eb), diagonal, diagonal], [round(rs - eb), skirt.height, diagonal, diagonal],
    [round(rs - eb), skirt.height, round(cone[0]), round(cone[1])], [round(rc - 0.5), round(skirt.height + (rs - eb - rc + 0.5) * k), round(cone[0]), round(cone[1])],
  ] };
  // The cap: its side, the 2 px chamfer, and the spun top: a shallow cone crowned `crown` at the centre.
  const top = rc - cap.chamfer, crownNormal = Math.hypot(cap.crown / top, 1);
  const capShape: InstrumentProfile = { type: "lathe", segments: 64, points: [
    [rc, 0, 1, 0], [rc, round(cap.height - cap.chamfer), 1, 0], [rc, round(cap.height - cap.chamfer), diagonal, diagonal], [round(top), round(cap.height), diagonal, diagonal],
    [round(top), round(cap.height), round(cap.crown / top / crownNormal), round(1 / crownNormal)], [0, round(cap.height + cap.crown), 0, 1],
  ] };
  // The chamfer in polished metal, a hair outside the cap's own.
  const chamferShape: InstrumentProfile = { type: "lathe", segments: 64, points: [
    [round(rc + 0.02), round(cap.height - cap.chamfer), diagonal, diagonal], [round(top), round(cap.height + 0.02), diagonal, diagonal],
  ] };
  // The pointer: a 2.2 px line along +x from 0.28 to 0.86 of the top's radius, following the crown just above it. It
  // points up at the middle of the sweep, so its turn runs from −sweep/2 − 90° to +sweep/2 − 90°.
  const crownAt = (r: number) => cap.height + cap.crown * (1 - r / top);
  const x0 = round(pointer.from * top), x1 = round(pointer.to * top);
  const pointerShape: InstrumentProfile = { type: "extrude", width: pointer.width, outline: [
    [x0, round(crownAt(x0) - 0.15)], [x1, round(crownAt(x1) - 0.15)], [x1, round(crownAt(x1) + 0.25)], [x0, round(crownAt(x0) + 0.25)],
  ] };
  const state = { hover: input.state.hover, disabled: input.state.disabled };
  const base: Vec3 = [round(cx), round(cy), 0], onSkirt: Vec3 = [round(cx), round(cy), round(skirt.height)];
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: Math.min(1, Math.max(0, input.t)),
    parts: [
      { kind: "skirt", profile: profile("knob-skirt", skirtShape), at: base, material: "knobSkirt", state },
      { kind: "cap", profile: profile("knob-cap", capShape), at: onSkirt, material: "knobCap", state },
      { kind: "chamfer", profile: profile("knob-chamfer", chamferShape), at: onSkirt, material: "knobChamfer", caster: null, state },
      { kind: "pointer", profile: profile("knob-pointer", pointerShape), at: onSkirt, material: "knobInk", caster: null, state,
        pose: { from: { turn: round(-input.sweep / 2 - 90) }, to: { turn: round(input.sweep / 2 - 90) } } },
    ],
    relief: { face: "raised", rect: [round(cx - rs), round(cy - rs), 2 * rs, 2 * rs], radius: rs, height: input.relief.height, material: input.relief.material },
  };
}

/** What a key's object needs from the page, in panel px. */
export interface KeyInput {
  id: string;
  box: Box;
  radius: number;
  /** The body's material (its colour: the button's own face colour). */
  material: string;
  height: number;
  travel: number;
  pressed: boolean;
  state: { hover: boolean; pressed: boolean; disabled: boolean };
  stage: { width: number; height: number };
  relief: { height: number; material: string };
}

/**
 * A button as an Instrument key: a body inset by the box rule's margin and a captured cap on it, travelling together
 * while pressed. Undefined when the button is too small to keep a cap inside its margin (it stays a Relief primitive).
 */
export function keyObject(input: KeyInput, profile: (name: string, shape: InstrumentProfile) => string): InstrumentObject | undefined {
  const [x, y, w, h] = input.box, m = boxMargin(input.height + 1, input.stage);
  const width = round(w - 2 * m), length = round(h - 2 * m);
  if (width < 8 || length < 8) return undefined;
  const radius = Math.max(0, input.radius - m), press = { from: { travel: 0 }, to: { travel: -input.travel } };
  const centre: Vec3 = [round(x + w / 2), round(y + h / 2), 0];
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: input.radius }, t: input.pressed ? 1 : 0,
    parts: [
      { kind: "plinth", profile: profile("key-body", { type: "prism", width, length, radius: Math.min(radius, width / 2, length / 2), height: input.height, taper: 1.2 }),
        at: centre, material: input.material, pose: press, state: input.state },
      { kind: "cap", profile: profile("key-cap", { type: "prism", width: round(width - 2.4), length: round(length - 2.4), radius: Math.max(0, Math.min(radius - 1.2, (width - 2.4) / 2, (length - 2.4) / 2)), height: 1 }),
        at: [centre[0], centre[1], input.height], material: "keyCap", captured: true, caster: null, pose: press, state: input.state },
    ],
    relief: { face: "raised", rect: input.box, radius: input.radius, height: input.relief.height, material: input.relief.material },
  };
}

/** A knob's spring state: position `t` along the travel and velocity `v`, per unit mass. */
export interface KnobSpring { t: number; v: number; time: number }
/** `spring.knob` and `spring.detent` (design language section 12). */
export const knobSprings = { knob: { stiffness: 420, damping: 41 }, detent: { stiffness: 900, damping: 42 } };

/**
 * Advances a spring to `now` (ms) towards `target` in fixed 4 ms steps (at most 100 ms at a time), clamped at the stops
 * with the velocity into a stop dropped. Returns whether it is at rest.
 */
export function advanceSpring(spring: KnobSpring, target: number, now: number, { stiffness, damping }: { stiffness: number; damping: number }): boolean {
  const dt = 0.004;
  let steps = Math.min(25, Math.max(0, Math.round((now - spring.time) / 4)));
  spring.time = now;
  while (steps-- > 0) {
    spring.v += (-stiffness * (spring.t - target) - damping * spring.v) * dt;
    spring.t += spring.v * dt;
    if (spring.t < 0) { spring.t = 0; spring.v = Math.max(0, spring.v); }
    if (spring.t > 1) { spring.t = 1; spring.v = Math.min(0, spring.v); }
  }
  if (Math.abs(spring.t - target) < 1e-4 && Math.abs(spring.v) < 1e-3) { spring.t = target; spring.v = 0; return true; }
  return false;
}
