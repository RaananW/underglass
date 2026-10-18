/**
 * The Display at the Instrument level (design language section 6, the Instrument object table; Rendering Model part 2D):
 * the premium display as an object of parts for core's `instrument` material, bounded by the native element's box. The
 * GPU helper's `instrument` level draws it as it does the Knob, the Fader and the Lamp; the part definitions are checked
 * by core's validator and containment check in the unit tests. The helper never imports core, so the version 4 shapes are
 * restated here as the subset they write.
 * - **bezel:** a polished prism (the frame round the window; 2.4 high, a 2 px chamfer, radius 8) standing 4 px inside the box
 *   (the box rule's room for its cast shadow);
 * - **window:** a glass pane (a prism with a 2.6 px bevel, 2.4 high, clear) over the window, with the premium finish zone
 *   (`display.finish`: a band 0.3, a dark horizon 0.25). Its flat region is the capture itself, so the text printed under it is
 *   exact; inside the text's protected rect (the content box, grown by `display.textGrow`) the finish and the bevel never draw
 *   (Rendering Model 2D.6), so the pane shows its glass only in the padding round the text.
 * - **backlight:** the display's emitters (`shared/display.ts`), a light behind the glass; lit or unlit is only their strength,
 *   so the parts never depend on the state: a toggle changes uniforms, never the layer's structure.
 * Heights scale with depth (× 0.6, 1, 1.6 at 0, 50 and 100%); widths and radii do not. Under `prefers-reduced-transparency`
 * the window shows the plain capture (the pane is left out, and the bezel stays).
 */
import { fittedHeight } from "../shared/switch-forms.ts";
import type { InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

export interface DisplayPart {
  kind: "bezel" | "window";
  profile: string;
  at: Vec3;
  material: string;
  glass?: "window";
  finish?: { band: number; horizon: number };
  caster?: null | { rect: Box; radius: number; height: number };
}
export interface DisplayObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: DisplayPart[];
  relief: { face: "raised"; rect: Box; radius: number; height: number; material: string };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The premium display's materials: the polished bezel and the clear glass of the window (the `display` role, `glass`). */
export const displayMaterials: Record<"displayBezel" | "displayGlass", InstrumentRecipe> = {
  displayBezel: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 1 } },
  displayGlass: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#e8f0ee", absorption: 0.03, reflection: 1.5 } },
};

/** The premium numbers at 50% depth: the heights, the chamfer and bevel, the finish zone. */
export const displayGeometry = { bezelHeight: 2.4, bezelChamfer: 2, windowHeight: 2.4, windowBevel: 2.6, finish: { band: 0.3, horizon: 0.25 } } as const;

/** What a display's object needs from the page, in panel px. */
export interface DisplayInput {
  id: string;
  /** The native element's box: the object's `bounds`. */
  box: Box;
  /** The bezel's box and corner radius, and the window's. */
  bezel: Box;
  bezelRadius: number;
  window: Box;
  windowRadius: number;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  /** The finish band and horizon (`display.finish`); the premium numbers when absent. */
  finish?: { band: number; horizon: number };
  /** Opaque, not glass (`prefers-reduced-transparency`): the window shows the plain capture. */
  opaque?: boolean;
  /** The bezel's caster, capped where its shadow would leave `box` (the helper fits it). */
  caster?: DisplayPart["caster"];
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

/** The bezel's prism: its box, radius and height, with a chamfer. */
export function bezelShape(box: Box, radius: number, scale = 1): InstrumentProfile {
  const height = round(displayGeometry.bezelHeight * scale);
  return { type: "prism", width: round(box[2]), length: round(box[3]), radius: round(Math.min(radius, box[2] / 2, box[3] / 2)), height, chamfer: round(Math.min(displayGeometry.bezelChamfer, height * 0.9)) };
}
/** The window's prism: its box, radius and height, with the bevel. */
export function paneShape(box: Box, radius: number, scale = 1): InstrumentProfile {
  const height = round(displayGeometry.windowHeight * scale);
  return { type: "prism", width: round(box[2]), length: round(box[3]), radius: round(Math.min(radius, box[2] / 2, box[3] / 2)), height, chamfer: round(Math.min(displayGeometry.windowBevel, height * 0.95)) };
}

const centre = (box: Box): Vec3 => [round(box[0] + box[2] / 2), round(box[1] + box[3] / 2), 0];

/** A display as an Instrument object; `profile` registers a shape and returns its name. */
export function displayObject(input: DisplayInput, profile: (name: string, shape: InstrumentProfile) => string): DisplayObject {
  const parts: DisplayPart[] = [];
  parts.push({ kind: "bezel", profile: profile("display-bezel", bezelShape(input.bezel, input.bezelRadius, input.scale)), at: centre(input.bezel), material: "displayBezel",
    ...(input.caster !== undefined ? { caster: input.caster } : {}) });
  if (!input.opaque) {
    parts.push({ kind: "window", profile: profile("display-window", paneShape(input.window, input.windowRadius, input.scale)), at: centre(input.window), material: "displayGlass", glass: "window",
      finish: input.finish ?? { ...displayGeometry.finish }, caster: null });
  }
  return { id: input.id, rect: input.box, bounds: { rect: input.box, radius: 0 }, t: 0, parts,
    relief: { face: "raised", rect: input.bezel, radius: input.bezelRadius, height: input.relief.height, material: input.relief.material } };
}

/** The tallest point of a display's parts above the face at a depth scale, px, for the layer's outset (a bound, not a fit). */
export function displayHeight(scale: number): number {
  return round(Math.max(displayGeometry.bezelHeight, displayGeometry.windowHeight) * scale + 0.1);
}

/**
 * The bezel's caster: core's own (omitted) unless its shadow (2.8) would leave `box`, then the same footprint at the tallest mean
 * height that fits, as the Lamp's bezel does.
 */
export function bezelCaster(bezel: Box, box: Box, radius: number, scale: number, light: { azimuth: number; elevation: number }): DisplayPart["caster"] | undefined {
  const height = displayGeometry.bezelHeight * scale;
  const margins = { left: Math.max(0, bezel[0] - box[0] - 1), right: Math.max(0, box[0] + box[2] - bezel[0] - bezel[2] - 1), top: Math.max(0, bezel[1] - box[1] - 1), bottom: Math.max(0, box[1] + box[3] - bezel[1] - bezel[3] - 1) };
  const fit = Math.floor(fittedHeight(height / 2, margins, light) * 1000) / 1000;
  return fit < height / 2 ? { rect: [round(bezel[0]), round(bezel[1]), round(bezel[2]), round(bezel[3])], radius: round(radius), height: fit } : undefined;
}
