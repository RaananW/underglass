/**
 * The Switch's hardware forms at the Instrument level (design language section 6, the Instrument object table; section
 * 12; Rendering Model part 2D): the premium `slide`, `rocker`, `bat` and `wall` switches as objects of parts for core's
 * `instrument` material, bounded by the native input's box (anatomy page `switch.md`, *Forms*). The GPU helper's
 * `instrument` level picks them up as it does the Knob; until then this module is the forms' part definitions and
 * poses, checked by core's validator and containment check in the unit tests. The helper never imports core, so the
 * version 4 shapes are restated here as the subset the switches write.
 *
 * Every object stands at the centre of its box. `t` is the throw's position, 0 off and 1 on, from `spring.<form>`
 * (clamped at the stops); every moving part takes `mix(from, to, t)`. On is the right for a slide and the top for the
 * others: an on rocker or wall switch has its top end pressed in (its bottom raised), and an on bat points up.
 * - **slide:** a `carriage` block 24 × 20, 6 high, radius 3, taper 0.4 and a 2 px chamfer, in brushed metal, with its
 *   polished `chamfer`, a brushed `cap` and an ink `grip`, sliding 28 px; the lit flag (`segment`, 21 × 4, lit 1.0) in
 *   the slot's left half, drawn only while the block has left it (`t` ≥ 0.5). The slot is printed on the face.
 * - **rocker:** a polished `bezel` 38 × 62, 2 high; a brushed `paddle` 28 × 50 whose two facets rise from 4 at its
 *   pivot to 12 at its ends, tilting ±17.7° about its pivot on the bezel; a lit flag 18 × 9 on its On end's facet
 *   (1.0 on, 0.12 off).
 * - **bat:** a polished `nut` Ø24, 3 high and `bushing` Ø14, 7 high; a polished `lever` 40 long (× the depth scale,
 *   at most 1.15), base r 3.4, neck r 2.7, with its `ball` r 5.6, tilting ±40° about a pivot 5 up.
 * - **wall:** a `plate` 58 × 84 (inside the 66 × 92 box, so its Relief shadow stays in it), 3 high, radius 6; a
 *   chamfered `paddle` 30 × 54, 7 high, taper 0.6, sunk 1.5 into the plate, with its polished `chamfer` and a brushed
 *   `cap` crowned 1.6 along its length, tilting ±9° about its middle; a lit dot 12 × 4 near its On end (1.0 / 0.12).
 * Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths, travel and angles do not.
 */
import { switchBoxes, switchSprings, type StrataSwitchForm } from "../shared/switch-forms.ts";

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Box = [number, number, number, number];

/** A pose (Rendering Model 2D.2): px and degrees. */
export interface SwitchPose { slide?: Vec2; turn?: number; tilt?: number; axis?: number; pivot?: Vec3 }
/** The profiles the switches use (2D.2). */
export type SwitchProfile =
  | { type: "prism"; width: number; length: number; radius?: number; height: number; taper?: number; chamfer?: number }
  | { type: "lathe"; points: [number, number, number, number][]; segments?: number }
  | { type: "extrude"; outline: Vec2[]; width: number };
export interface SwitchPart {
  kind: "carriage" | "chamfer" | "cap" | "grip" | "segment" | "bezel" | "paddle" | "nut" | "bushing" | "lever" | "ball" | "plate";
  profile: string;
  at: Vec3;
  pose?: { from: SwitchPose; to: SwitchPose };
  material: string;
  caster?: null;
  state: { hover: boolean; disabled: boolean };
}
export interface SwitchObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: SwitchPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}
/** A material recipe (2D.5), the subset the switches use. */
export interface SwitchRecipe {
  base: { colour: string; roughness: number; metallic?: number; direct?: number };
  brush?: { strength: number; direction: "linear" | "circular" };
  grain?: { kind: "hairline"; strength: number };
  emissive?: { strength: number; colour: string };
}

/** The premium numbers per form at 50% depth (design language section 6; `instrument-spec-notes.md`, v2). */
export const switchGeometry = {
  slide: { block: [24, 20] as Vec2, height: 6, radius: 3, taper: 0.4, chamfer: 2, travel: 28, grip: [1.4, 10] as Vec2, flag: [21, 4] as Vec2, flagAt: -12 },
  rocker: { bezel: [38, 62] as Vec2, bezelHeight: 2, bezelRadius: 4, bezelTaper: 0.8, paddle: [28, 50] as Vec2, end: 12, centre: 4, tilt: 17.7, flag: [18, 9] as Vec2, flagFrom: 13, flagTo: 22 },
  bat: { nut: 12, nutHeight: 3, bushing: 7, bushingHeight: 7, length: 40, pivot: 5, base: 3.4, neck: 2.7, ball: 5.6, tilt: 40 },
  wall: { plate: [58, 84] as Vec2, plateHeight: 3, plateRadius: 6, plateTaper: 1, paddle: [30, 54] as Vec2, paddleHeight: 7, sink: 1.5, taper: 0.6, chamfer: 2, radius: 3, crown: 1.6, tilt: 9, dot: [12, 4] as Vec2, dotAt: 18 },
} as const;

/** The brushed cap metal, as the Knob's and the Fader's (design language sections 4 and 19). */
const brushed = "#eff0f1";
/**
 * The premium character's switch materials: the brushed cap metal (239, 240, 241; roughness 0.3, a linear brush 0.9
 * with the hairline grain 0.15), its chamfer and the lever polished (roughness 0.06, no brush), bezels, nuts and
 * bushings `polished` (250, 250, 251; 0.04), the wall plate brushed aluminium on light faceplates and gunmetal on dark
 * ones (no grain on large plates), the grip in the cap's ink, and the flags emissive in `glowOn`, lit 1.0 and 0.12.
 */
export const switchMaterials: Record<"switchCap" | "switchChamfer" | "switchLever" | "switchBezel" | "switchPlate" | "switchPlateDark" | "switchInk" | "switchFlagOn" | "switchFlagOff", SwitchRecipe> = {
  switchCap: { base: { colour: brushed, metallic: 1, roughness: 0.3, direct: 1 }, brush: { strength: 0.9, direction: "linear" }, grain: { kind: "hairline", strength: 0.15 } },
  switchChamfer: { base: { colour: brushed, metallic: 1, roughness: 0.06, direct: 1 } },
  switchLever: { base: { colour: brushed, metallic: 1, roughness: 0.06, direct: 1 } },
  switchBezel: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 1 } },
  switchPlate: { base: { colour: brushed, metallic: 1, roughness: 0.3, direct: 1 }, brush: { strength: 0.9, direction: "linear" } },
  switchPlateDark: { base: { colour: "#686b72", metallic: 1, roughness: 0.36, direct: 1 }, brush: { strength: 0.9, direction: "linear" } },
  switchInk: { base: { colour: "#26282c", roughness: 0.6 } },
  switchFlagOn: { base: { colour: "#ff9228", roughness: 0.5 }, emissive: { strength: 1, colour: "#ff9228" } },
  switchFlagOff: { base: { colour: "#ff9228", roughness: 0.5 }, emissive: { strength: 0.12, colour: "#ff9228" } },
};

export { switchSprings };

const round = (value: number) => Math.round(value * 1000) / 1000;
const unit = (x: number, z: number): [number, number] => { const length = Math.hypot(x, z) || 1; return [round(x / length), round(z / length)]; };

/** What a switch's object needs from the page, in panel px. */
export interface SwitchInput {
  id: string;
  form: StrataSwitchForm;
  /** The input's box: the object's `bounds`. */
  box: Box;
  /** The throw's position, 0 (off) to 1 (on): the spring's. */
  t: number;
  checked: boolean;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** A dark faceplate: the wall plate is gunmetal. */
  dark?: boolean;
  state: { hover: boolean; disabled: boolean };
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { rect: Box; height: number; material: string };
}

/** The bat lever's length at a depth scale: 40, scaled with depth up to × 1.15. */
export const batLength = (scale: number) => round(switchGeometry.bat.length * Math.min(scale, 1.15));

/** A form's object; `profile` registers a shape and returns its name. */
export function switchObject(input: SwitchInput, profile: (name: string, shape: SwitchProfile) => string): SwitchObject {
  const [bx, by, bw, bh] = input.box, s = input.scale, state = { hover: input.state.hover, disabled: input.state.disabled };
  const cx = round(bx + bw / 2), cy = round(by + bh / 2);
  const flag = input.checked ? "switchFlagOn" : "switchFlagOff";
  const parts: SwitchPart[] = [];
  const add = (part: Omit<SwitchPart, "state">) => parts.push({ ...part, state });
  if (input.form === "slide") {
    const g = switchGeometry.slide, h = round(g.height * s), [w, l] = g.block, half = g.travel / 2;
    const pose = { from: { slide: [-half, 0] as Vec2 }, to: { slide: [half, 0] as Vec2 } };
    const top = { width: round(w - 2 * (g.taper + g.chamfer)), length: round(l - 2 * (g.taper + g.chamfer)) };
    // The flag lies in the slot's left half, under the block while it is off; it shows once the block has left it.
    if (input.t >= 0.5) add({ kind: "segment", profile: profile("slide-flag", { type: "prism", width: g.flag[0], length: g.flag[1], radius: 1, height: 0.06 }), at: [round(cx + g.flagAt), cy, 0], material: "switchFlagOn", caster: null });
    add({ kind: "carriage", profile: profile("slide-block", { type: "prism", width: w, length: l, radius: g.radius, height: h, taper: g.taper, chamfer: g.chamfer }), at: [cx, cy, 0], pose, material: "switchCap" });
    add({ kind: "chamfer", profile: profile("slide-chamfer", { type: "prism", width: round(w - 2 * g.taper + 0.04), length: round(l - 2 * g.taper + 0.04), radius: round(g.radius - g.taper), height: round(g.chamfer + 0.02), chamfer: g.chamfer }),
      at: [cx, cy, round(h - g.chamfer - 0.01)], pose, material: "switchChamfer", caster: null });
    add({ kind: "cap", profile: profile("slide-top", { type: "prism", width: top.width, length: top.length, radius: round(Math.max(0, g.radius - g.taper - g.chamfer)), height: 0.04 }), at: [cx, cy, round(h + 0.01)], pose, material: "switchCap", caster: null });
    add({ kind: "grip", profile: profile("slide-grip", { type: "prism", width: g.grip[0], length: g.grip[1], height: 0.1 }), at: [cx, cy, round(h + 0.03)], pose, material: "switchInk", caster: null });
  } else if (input.form === "rocker") {
    const g = switchGeometry.rocker, base = round(g.bezelHeight * s), end = round(g.end * s), centre = round(g.centre * s), half = g.paddle[1] / 2;
    add({ kind: "bezel", profile: profile("rocker-bezel", { type: "prism", width: g.bezel[0], length: g.bezel[1], radius: g.bezelRadius, height: base, taper: g.bezelTaper }), at: [cx, cy, 0], material: "switchBezel" });
    // The paddle's side outline along its length (x, turned onto the layer's y), extruded across its width: a flat
    // bottom sunk 1 px into the bezel and two facets rising from the pivot to its ends. The extra bottom points keep
    // the outline star-shaped from its mean point, which core fans the ends from.
    const outline: Vec2[] = [[-half, -1], [-half / 2, -1], [0, -1], [half / 2, -1], [half, -1], [half, end], [0, centre], [-half, end]];
    const pose = { from: { turn: 90, tilt: -g.tilt }, to: { turn: 90, tilt: g.tilt } };
    add({ kind: "paddle", profile: profile("rocker-paddle", { type: "extrude", outline, width: g.paddle[0] }), at: [cx, cy, base], pose, material: "switchCap" });
    // The flag lies on the On (top, local −x) end's facet, a hair above it, tilting with the paddle.
    const on = (x: number) => round(centre + ((end - centre) * x) / half), [x0, x1] = [-g.flagTo, -g.flagFrom];
    add({ kind: "segment", profile: profile("rocker-flag", { type: "extrude", outline: [[x0, on(-x0) + 0.02], [x1, on(-x1) + 0.02], [x1, on(-x1) + 0.08], [x0, on(-x0) + 0.08]], width: g.flag[0] }),
      at: [cx, cy, base], pose, material: flag, caster: null });
  } else if (input.form === "bat") {
    const g = switchGeometry.bat, nut = round(g.nutHeight * s), bushing = round(g.bushingHeight * s), length = batLength(s), pivot = round(g.pivot * s);
    const centre = round(length - g.ball);
    add({ kind: "nut", profile: profile("bat-nut", { type: "lathe", segments: 48, points: [[g.nut, 0, 1, 0], [g.nut, round(nut - 0.6), 1, 0], [g.nut, round(nut - 0.6), 0.707, 0.707],
      [round(g.nut - 0.6), nut, 0.707, 0.707], [round(g.nut - 0.6), nut, 0, 1], [g.bushing, nut, 0, 1]] }), at: [cx, cy, 0], material: "switchBezel" });
    add({ kind: "bushing", profile: profile("bat-bushing", { type: "lathe", segments: 48, points: [[g.bushing, nut, 1, 0], [g.bushing, round(bushing - 0.6), 1, 0], [g.bushing, round(bushing - 0.6), 0.707, 0.707],
      [round(g.bushing - 0.6), bushing, 0.707, 0.707], [round(g.bushing - 0.6), bushing, 0, 1], [0, bushing, 0, 1]] }), at: [cx, cy, 0], material: "switchBezel", caster: null });
    // The lever: a shaft tapering from its base to its neck, then the ball; both tilt about the pivot.
    const neckAt = round(centre - g.ball * 0.6), [snr, snz] = unit(neckAt, g.base - g.neck);
    const pose = { from: { tilt: -g.tilt, pivot: [0, 0, pivot] as Vec3 }, to: { tilt: g.tilt, pivot: [0, 0, pivot] as Vec3 } };
    add({ kind: "lever", profile: profile("bat-lever", { type: "lathe", segments: 32, points: [[g.base, 0, snr, snz], [g.neck, neckAt, snr, snz], [g.neck, neckAt, 0, 1], [0, neckAt, 0, 1]] }), at: [cx, cy, 0], pose, material: "switchLever" });
    const ball: [number, number, number, number][] = [];
    for (let step = 0; step <= 12; step++) {
      const angle = -Math.PI / 2 + (step / 12) * Math.PI, r = round(Math.max(0, g.ball * Math.cos(angle)));
      ball.push([r, round(centre + g.ball * Math.sin(angle)), round(Math.cos(angle)), round(Math.sin(angle))]);
    }
    // The ball, from its bottom pole up to its top, as the lever's own profile runs.
    add({ kind: "ball", profile: profile("bat-ball", { type: "lathe", segments: 32, points: ball }), at: [cx, cy, 0], pose, material: "switchLever" });
  } else {
    const g = switchGeometry.wall, plate = round(g.plateHeight * s), height = round(g.paddleHeight * s), z = round(plate - g.sink), [w, l] = g.paddle;
    add({ kind: "plate", profile: profile("wall-plate", { type: "prism", width: g.plate[0], length: g.plate[1], radius: g.plateRadius, height: plate, taper: g.plateTaper }), at: [cx, cy, 0], material: input.dark ? "switchPlateDark" : "switchPlate" });
    // Every moving part tilts about the paddle's middle: `pivot` is part-local, so it is that point less each part's own place.
    const tilt = (dy: number, dz: number) => ({ from: { tilt: -g.tilt, pivot: [0, round(-dy), round(height / 2 - dz)] as Vec3 }, to: { tilt: g.tilt, pivot: [0, round(-dy), round(height / 2 - dz)] as Vec3 } });
    add({ kind: "paddle", profile: profile("wall-paddle", { type: "prism", width: w, length: l, radius: g.radius, height, taper: g.taper, chamfer: g.chamfer }), at: [cx, cy, z], pose: tilt(0, 0), material: "switchCap" });
    const chamferAt = round(height - g.chamfer - 0.01);
    add({ kind: "chamfer", profile: profile("wall-chamfer", { type: "prism", width: round(w - 2 * g.taper + 0.04), length: round(l - 2 * g.taper + 0.04), radius: round(g.radius - g.taper), height: round(g.chamfer + 0.02), chamfer: g.chamfer }),
      at: [cx, cy, round(z + chamferAt)], pose: tilt(0, chamferAt), material: "switchChamfer", caster: null });
    // The crowned top: its side outline along the length, an arc 1.6 high, extruded across the top's width and turned
    // onto the layer's y, so its reflection band moves along the paddle as it tips.
    const topWidth = round(w - 2 * (g.taper + g.chamfer)), half = round((l - 2 * (g.taper + g.chamfer)) / 2), crown = (x: number) => round(0.04 + g.crown * (1 - (x / half) ** 2));
    const arc: Vec2[] = [];
    for (let step = 0; step <= 16; step++) { const x = round(half - (step / 16) * 2 * half); arc.push([x, crown(x)]); }
    const topAt = round(height + 0.01);
    const turned = (dy: number, dz: number) => { const pose = tilt(dy, dz); return { from: { ...pose.from, turn: 90 }, to: { ...pose.to, turn: 90 } }; };
    add({ kind: "cap", profile: profile("wall-top", { type: "extrude", outline: [[-half, 0], [half, 0], ...arc.slice(1, -1)], width: topWidth }), at: [cx, cy, round(z + topAt)], pose: turned(0, topAt), material: "switchCap", caster: null });
    // The dot near the On (top) end, on the crown.
    const dotAt = round(topAt + crown(g.dotAt) + 0.02);
    add({ kind: "segment", profile: profile("wall-dot", { type: "prism", width: g.dot[0], length: g.dot[1], radius: g.dot[1] / 2, height: 0.06 }), at: [cx, round(cy - g.dotAt), round(z + dotAt)], pose: tilt(-g.dotAt, dotAt), material: flag, caster: null });
  }
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: Math.min(1, Math.max(0, input.t)), parts,
    relief: { face: "raised", rect: input.relief.rect, radius: 3, height: input.relief.height, material: input.relief.material },
  };
}

/** The box per form (`switchBoxes`), for a caller laying an object out without the page. */
export const switchBox = (form: StrataSwitchForm, x = 0, y = 0): Box => [x, y, switchBoxes[form][0], switchBoxes[form][1]];
